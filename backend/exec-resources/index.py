"""
Команда, загрузка, ФОТ и бюджет проектов/инициатив.

Финансовые и кадровые данные НЕ передаются во внешний AI и не участвуют в RAG —
этот backend не содержит ни одного вызова к Yandex Cloud или иному AI-сервису.

По умолчанию ФОТ планируется по обезличенной стоимости роли (cost_basis=
'role_average'), а не по индивидуальному окладу — это сознательный выбор
минимизации персональных данных, а не техническое ограничение.

Версии бюджета (exec_budget_version) при статусе 'approved' блокируются
(is_locked=true): backend отказывает в изменении строк такой версии, требуя
создать новую версию. Финансовые снимки (exec_financial_snapshot) неизменяемы
по той же схеме, что и exec_report_snapshot: SHA-256 при создании, проверка
при чтении, нет action на изменение.

Бюджет инициативы = сумма бюджетов связанных проектов + собственные
нераспределённые расходы инициативы (защита от двойного счёта).
"""
import json
import os
import hashlib
import datetime
import psycopg2

DB = os.environ["DATABASE_URL"]
_s = os.environ.get("MAIN_DB_SCHEMA", "").strip()
SCHEMA = _s if _s else "t_p61016064_digital_innovation_i"


def cors(body: dict, code: int = 200) -> dict:
    return {
        "statusCode": code,
        "headers": {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, X-Admin-Token, X-Session-Id",
            "Content-Type": "application/json",
        },
        "body": json.dumps(body, ensure_ascii=False, default=str),
    }


def get_admin(conn, token: str):
    if not token:
        return None
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    with conn.cursor() as cur:
        cur.execute(
            f"SELECT actor_email FROM {SCHEMA}.admin_sessions "
            f"WHERE session_token_hash = %s AND expires_at > NOW() AND revoked_at IS NULL LIMIT 1",
            (token_hash,),
        )
        row = cur.fetchone()
    return row[0] if row else None


def get_cabinet_user(conn, session_id: str):
    if not session_id:
        return None
    with conn.cursor() as cur:
        cur.execute(
            f"SELECT u.email, a.access_role FROM {SCHEMA}.sessions s "
            f"JOIN {SCHEMA}.users u ON u.id = s.user_id "
            f"JOIN {SCHEMA}.exec_cabinet_access a ON LOWER(a.email) = LOWER(u.email) "
            f"LEFT JOIN {SCHEMA}.admin_user_flags fl ON fl.user_id = u.id "
            f"WHERE s.id = %s AND s.expires_at > NOW() AND a.is_active = true "
            f"AND COALESCE(fl.is_blocked, false) = false LIMIT 1",
            (session_id,),
        )
        row = cur.fetchone()
    return {"email": row[0], "role": row[1]} if row else None


def authenticate(conn, headers: dict):
    """Финансовые и кадровые данные — доступ только владельцу кабинета (head)."""
    token = headers.get("x-admin-token") or headers.get("X-Admin-Token", "")
    email = get_admin(conn, token)
    if email:
        return {"email": email, "role": "head"}
    sid = headers.get("x-session-id") or headers.get("X-Session-Id", "")
    user = get_cabinet_user(conn, sid)
    if user and user.get("role") == "head":
        return user
    return None


def rows(cur):
    cols = [d[0] for d in cur.description]
    return [dict(zip(cols, r)) for r in cur.fetchall()]


def as_int(v):
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


def as_num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0


def fetch_one(cur, table, eid):
    cur.execute(f"SELECT * FROM {SCHEMA}.{table} WHERE id = %s", (eid,))
    r = rows(cur)
    return r[0] if r else None


def log_change(cur, actor, entity, eid, action, changed_fields=None, after=None):
    payload = {"changed_fields": changed_fields} if changed_fields else after
    cur.execute(
        f"INSERT INTO {SCHEMA}.exec_audit_log (entity_type, entity_id, action, actor, after_json) "
        f"VALUES (%s,%s,%s,%s,%s)",
        (entity, eid, action, actor,
         json.dumps(payload, ensure_ascii=False, default=str) if payload else None),
    )


def diff_fields(existing, new):
    if not existing:
        return list(new.keys())
    return [k for k, v in new.items() if str(existing.get(k)) != str(v)]


PARENT_FIELD = lambda body: ("project_id", as_int(body.get("project_id"))) if body.get("project_id") \
    else ("initiative_id", as_int(body.get("initiative_id")))


# ============ КОМАНДА И РЕСУРСЫ ============

def list_assignments(cur, parent_kind, parent_id, include_archived=False, include_test_data=False):
    conds = [f"a.{parent_kind}_id = %s"]
    params = [parent_id]
    if not include_archived:
        conds.append("a.archived_at IS NULL")
    if not include_test_data:
        conds.append("a.is_test_data = false")
    where = "WHERE " + " AND ".join(conds)
    cur.execute(f"""
        SELECT a.*, p.display_name AS person_name, p.position_title,
               r.title AS role_title_ref, ou.name AS org_unit_name
        FROM {SCHEMA}.exec_resource_assignment a
        LEFT JOIN {SCHEMA}.exec_person p ON p.id = a.person_id
        LEFT JOIN {SCHEMA}.exec_center_role r ON r.id = a.role_id
        LEFT JOIN {SCHEMA}.org_units ou ON ou.id = a.org_unit_id
        {where}
        ORDER BY a.project_role, a.created_at
    """, params)
    return rows(cur)


ASSIGNMENT_FIELDS = ["person_id", "role_id", "role_title", "org_unit_id", "project_role",
    "is_external", "is_vacant", "period_start", "period_end", "plan_load_pct",
    "fact_load_pct", "comment"]


def save_assignment(cur, body: dict, actor: str):
    aid = as_int(body.get("id"))
    parent_key, parent_val = PARENT_FIELD(body)
    if not aid and not parent_val:
        return None, "Не указан проект или инициатива"

    fields = {}
    for k in ASSIGNMENT_FIELDS:
        if k not in body:
            continue
        if k in ("person_id", "role_id", "org_unit_id"):
            fields[k] = as_int(body[k])
        elif k in ("period_start", "period_end"):
            fields[k] = body[k] or None
        elif k in ("plan_load_pct", "fact_load_pct"):
            fields[k] = as_num(body[k]) if body[k] not in (None, "") else None
        elif k in ("is_external", "is_vacant"):
            fields[k] = bool(body[k])
        else:
            fields[k] = body.get(k)

    if not fields.get("person_id") and not fields.get("role_title") and not fields.get("role_id"):
        return None, "Укажите участника, роль из справочника или название роли"

    existing = fetch_one(cur, "exec_resource_assignment", aid) if aid else None

    if aid:
        sets = ", ".join(f"{k} = %s" for k in fields)
        cur.execute(
            f"UPDATE {SCHEMA}.exec_resource_assignment SET {sets}, updated_at = now() WHERE id = %s RETURNING id",
            (*fields.values(), aid),
        )
        new_id = cur.fetchone()[0]
        log_change(cur, actor, "resource_assignment", new_id, "update", changed_fields=diff_fields(existing, fields))
    else:
        fields[parent_key] = parent_val
        fields.setdefault("project_role", "member")
        cols = ", ".join(fields.keys())
        ph = ", ".join(["%s"] * len(fields))
        cur.execute(
            f"INSERT INTO {SCHEMA}.exec_resource_assignment ({cols}, created_by) VALUES ({ph}, %s) RETURNING id",
            (*fields.values(), actor),
        )
        new_id = cur.fetchone()[0]
        log_change(cur, actor, "resource_assignment", new_id, "create", after=fields)
    return new_id, None


def archive_assignment(cur, aid, actor):
    cur.execute(
        f"UPDATE {SCHEMA}.exec_resource_assignment SET archived_at = now(), archived_by = %s "
        f"WHERE id = %s AND archived_at IS NULL RETURNING id",
        (actor, aid),
    )
    r = cur.fetchone()
    if r:
        log_change(cur, actor, "resource_assignment", aid, "archive")
    return r[0] if r else None


def overload_check(cur, person_id: int, exclude_assignment_id=None):
    """Суммарная плановая загрузка сотрудника по всем активным назначениям."""
    conds = ["person_id = %s", "archived_at IS NULL", "is_test_data = false"]
    params = [person_id]
    if exclude_assignment_id:
        conds.append("id != %s")
        params.append(exclude_assignment_id)
    cur.execute(f"""
        SELECT COALESCE(SUM(plan_load_pct), 0) FROM {SCHEMA}.exec_resource_assignment
        WHERE {" AND ".join(conds)}
    """, params)
    return float(cur.fetchone()[0] or 0)


def team_load_summary(cur, include_test_data=False):
    """Загрузка по всем сотрудникам во всех проектах — для дашборда.
    NUMERIC из PostgreSQL сериализуется как строка (json default=str), поэтому
    total_load_pct явно приводится к float, иначе сравнение > 100 на фронтенде
    ненадёжно."""
    tnd = "" if include_test_data else "AND a.is_test_data = false"
    cur.execute(f"""
        SELECT a.person_id, p.display_name, p.position_title,
               SUM(a.plan_load_pct) AS total_load_pct,
               count(*) AS assignment_count
        FROM {SCHEMA}.exec_resource_assignment a
        JOIN {SCHEMA}.exec_person p ON p.id = a.person_id
        WHERE a.archived_at IS NULL {tnd} AND a.person_id IS NOT NULL
        GROUP BY a.person_id, p.display_name, p.position_title
        ORDER BY total_load_pct DESC
    """)
    result = rows(cur)
    for r in result:
        r["total_load_pct"] = float(r["total_load_pct"])
    return result


def vacant_roles(cur, include_test_data=False):
    tnd = "" if include_test_data else "AND is_test_data = false"
    cur.execute(f"""
        SELECT a.id, a.role_title, r.title AS role_title_ref, a.project_id, a.initiative_id,
               p.title AS project_title, i.title AS initiative_title
        FROM {SCHEMA}.exec_resource_assignment a
        LEFT JOIN {SCHEMA}.exec_center_role r ON r.id = a.role_id
        LEFT JOIN {SCHEMA}.exec_project p ON p.id = a.project_id
        LEFT JOIN {SCHEMA}.exec_initiative i ON i.id = a.initiative_id
        WHERE a.archived_at IS NULL {tnd} AND a.is_vacant = true
        ORDER BY a.created_at DESC
    """)
    return rows(cur)


def portfolio_financial_kpi(cur, year=None, include_test_data=False):
    """Сводка по всему портфелю для дашборда руководителя: бюджет, факт,
    обязательства, прогноз, остаток по утверждённым версиям текущего года."""
    tnd_v = "" if include_test_data else "AND v.is_test_data = false"
    tnd_a = "" if include_test_data else "AND is_test_data = false"
    tnd_c = "" if include_test_data else "AND is_test_data = false"
    yr = year or datetime.date.today().year

    cur.execute(f"""
        SELECT COALESCE(SUM(l.amount_plan), 0) FROM {SCHEMA}.exec_budget_line l
        JOIN {SCHEMA}.exec_budget_version v ON v.id = l.version_id
        WHERE v.version_status = 'approved' AND v.year = %s {tnd_v}
    """, (yr,))
    total_budget = float(cur.fetchone()[0] or 0)

    cur.execute(f"""
        SELECT COALESCE(SUM(amount), 0) FROM {SCHEMA}.exec_financial_actual
        WHERE EXTRACT(YEAR FROM month) = %s {tnd_a}
    """, (yr,))
    total_fact = float(cur.fetchone()[0] or 0)

    cur.execute(f"""
        SELECT COALESCE(SUM(amount), 0) FROM {SCHEMA}.exec_financial_commitment
        WHERE status = 'active' {tnd_c}
    """)
    total_commitments = float(cur.fetchone()[0] or 0)

    cur.execute(f"""
        SELECT COALESCE(SUM(plan_total), 0) FROM {SCHEMA}.exec_fot_plan
        WHERE EXTRACT(YEAR FROM month) = %s {tnd_a.replace('is_test_data', 'is_test_data')}
    """, (yr,))
    total_fot = float(cur.fetchone()[0] or 0)

    cur.execute(f"""
        SELECT p.id, p.title,
            COALESCE((SELECT SUM(l.amount_plan) FROM {SCHEMA}.exec_budget_line l
                JOIN {SCHEMA}.exec_budget_version v ON v.id = l.version_id
                WHERE v.project_id = p.id AND v.version_status = 'approved' AND v.year = %s), 0) AS budget,
            COALESCE((SELECT SUM(amount) FROM {SCHEMA}.exec_financial_actual
                WHERE project_id = p.id AND EXTRACT(YEAR FROM month) = %s), 0) +
            COALESCE((SELECT SUM(amount) FROM {SCHEMA}.exec_financial_commitment
                WHERE project_id = p.id AND status='active'), 0) AS forecast
        FROM {SCHEMA}.exec_project p
        WHERE p.archived_at IS NULL AND p.is_test_data = false
    """, (yr, yr))
    over_budget = [dict(id=r[0], title=r[1], budget=float(r[2]), forecast=float(r[3]),
                        deviation=float(r[3]) - float(r[2]))
                   for r in cur.fetchall() if float(r[2]) > 0 and float(r[3]) > float(r[2])]

    return {
        "year": yr, "total_budget": total_budget, "total_fact": total_fact,
        "total_commitments": total_commitments, "total_forecast": total_fact + total_commitments,
        "remaining": total_budget - total_fact - total_commitments, "total_fot": total_fot,
        "projects_over_budget": over_budget,
    }


# ============ БЮДЖЕТ: ВЕРСИИ ============

def list_budget_versions(cur, parent_kind, parent_id, include_test_data=False):
    tnd = "" if include_test_data else "AND is_test_data = false"
    cur.execute(f"""
        SELECT * FROM {SCHEMA}.exec_budget_version
        WHERE {parent_kind}_id = %s {tnd}
        ORDER BY year DESC, created_at DESC
    """, (parent_id,))
    return rows(cur)


def create_budget_version(cur, body: dict, actor: str):
    parent_key, parent_val = PARENT_FIELD(body)
    if not parent_val:
        return None, "Не указан проект или инициатива"
    year = as_int(body.get("year"))
    if not year:
        return None, "Не указан год"
    label = body.get("version_label") or f"{year} — план"
    cur.execute(
        f"""INSERT INTO {SCHEMA}.exec_budget_version
            ({parent_key}, year, version_label, version_status, note, is_test_data, created_by)
            VALUES (%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
        (parent_val, year, label, body.get("version_status", "draft"), body.get("note"),
         bool(body.get("is_test_data")), actor),
    )
    vid = cur.fetchone()[0]
    log_change(cur, actor, "budget_version", vid, "create", after={"year": year, "label": label})
    return vid, None


def set_budget_version_status(cur, vid: int, status: str, actor: str):
    if status not in ("draft", "review", "approved", "revised", "forecast"):
        return None, "Недопустимый статус версии"
    is_locked = status == "approved"
    cur.execute(
        f"""UPDATE {SCHEMA}.exec_budget_version
            SET version_status = %s, is_locked = %s,
                locked_at = CASE WHEN %s THEN now() ELSE locked_at END,
                locked_by = CASE WHEN %s THEN %s ELSE locked_by END,
                updated_at = now()
            WHERE id = %s RETURNING id""",
        (status, is_locked, is_locked, is_locked, actor, vid),
    )
    r = cur.fetchone()
    if not r:
        return None, "Версия не найдена"
    log_change(cur, actor, "budget_version", vid, "status_change", changed_fields=["version_status"])
    return r[0], None


# ============ БЮДЖЕТ: СТРОКИ ============

def list_budget_lines(cur, version_id: int):
    cur.execute(f"""
        SELECT l.*, c.title AS category_title, c.code AS category_code
        FROM {SCHEMA}.exec_budget_line l
        JOIN {SCHEMA}.exec_cost_category c ON c.id = l.category_id
        WHERE l.version_id = %s
        ORDER BY c.sort_order, l.month
    """, (version_id,))
    return rows(cur)


def save_budget_line(cur, body: dict, actor: str):
    version_id = as_int(body.get("version_id"))
    if not version_id:
        return None, "Не указана версия бюджета"

    version = fetch_one(cur, "exec_budget_version", version_id)
    if not version:
        return None, "Версия бюджета не найдена"
    if version.get("is_locked"):
        return None, "Версия утверждена и заблокирована — создайте новую версию для изменений"

    lid = as_int(body.get("id"))
    fields = {
        "category_id": as_int(body.get("category_id")),
        "funding_source": body.get("funding_source"),
        "month": body.get("month"),
        "amount_plan": as_num(body.get("amount_plan")),
        "comment": body.get("comment"),
    }
    if not fields["category_id"] or not fields["month"]:
        return None, "Укажите статью и месяц"

    if lid:
        sets = ", ".join(f"{k} = %s" for k in fields)
        cur.execute(
            f"UPDATE {SCHEMA}.exec_budget_line SET {sets}, updated_at = now() WHERE id = %s RETURNING id",
            (*fields.values(), lid),
        )
        new_id = cur.fetchone()[0]
    else:
        fields["version_id"] = version_id
        cols = ", ".join(fields.keys())
        ph = ", ".join(["%s"] * len(fields))
        cur.execute(f"INSERT INTO {SCHEMA}.exec_budget_line ({cols}) VALUES ({ph}) RETURNING id", (*fields.values(),))
        new_id = cur.fetchone()[0]
    log_change(cur, actor, "budget_line", new_id, "upsert", after=fields)
    return new_id, None


def budget_summary(cur, version_id: int):
    """Годовая сводка: план по статьям x месяцам, кварталы, год."""
    lines = list_budget_lines(cur, version_id)
    by_category = {}
    for l in lines:
        cat = l["category_title"]
        by_category.setdefault(cat, {})
        month_key = l["month"].strftime("%Y-%m") if hasattr(l["month"], "strftime") else str(l["month"])[:7]
        by_category[cat][month_key] = by_category[cat].get(month_key, 0) + float(l["amount_plan"])
    total_by_month = {}
    for cat_data in by_category.values():
        for m, v in cat_data.items():
            total_by_month[m] = total_by_month.get(m, 0) + v
    return {"by_category": by_category, "total_by_month": total_by_month,
            "total_year": sum(total_by_month.values())}


# ============ ФАКТ И ОБЯЗАТЕЛЬСТВА ============

def list_actuals(cur, parent_kind, parent_id, include_test_data=False):
    tnd = "" if include_test_data else "AND a.is_test_data = false"
    cur.execute(f"""
        SELECT a.*, c.title AS category_title FROM {SCHEMA}.exec_financial_actual a
        JOIN {SCHEMA}.exec_cost_category c ON c.id = a.category_id
        WHERE a.{parent_kind}_id = %s {tnd}
        ORDER BY a.month
    """, (parent_id,))
    return rows(cur)


def save_actual(cur, body: dict, actor: str):
    parent_key, parent_val = PARENT_FIELD(body)
    if not parent_val:
        return None, "Не указан проект или инициатива"
    fields = {
        parent_key: parent_val,
        "category_id": as_int(body.get("category_id")),
        "month": body.get("month"),
        "amount": as_num(body.get("amount")),
        "paid_amount": as_num(body.get("paid_amount")) if body.get("paid_amount") else None,
        "source_ref": body.get("source_ref"),
        "comment": body.get("comment"),
    }
    if not fields["category_id"] or not fields["month"]:
        return None, "Укажите статью и месяц"
    cols = ", ".join(fields.keys())
    ph = ", ".join(["%s"] * len(fields))
    cur.execute(f"INSERT INTO {SCHEMA}.exec_financial_actual ({cols}, created_by) VALUES ({ph}, %s) RETURNING id",
                (*fields.values(), actor))
    new_id = cur.fetchone()[0]
    log_change(cur, actor, "financial_actual", new_id, "create", after=fields)
    return new_id, None


def list_commitments(cur, parent_kind, parent_id, include_test_data=False):
    tnd = "" if include_test_data else "AND c.is_test_data = false"
    cur.execute(f"""
        SELECT c.*, cat.title AS category_title FROM {SCHEMA}.exec_financial_commitment c
        JOIN {SCHEMA}.exec_cost_category cat ON cat.id = c.category_id
        WHERE c.{parent_kind}_id = %s {tnd}
        ORDER BY c.start_date
    """, (parent_id,))
    return rows(cur)


def save_commitment(cur, body: dict, actor: str):
    parent_key, parent_val = PARENT_FIELD(body)
    if not parent_val:
        return None, "Не указан проект или инициатива"
    fields = {
        parent_key: parent_val,
        "category_id": as_int(body.get("category_id")),
        "contract_ref": body.get("contract_ref"),
        "amount": as_num(body.get("amount")),
        "start_date": body.get("start_date") or None,
        "end_date": body.get("end_date") or None,
        "status": body.get("status", "active"),
        "comment": body.get("comment"),
    }
    if not fields["category_id"]:
        return None, "Укажите статью расходов"
    cols = ", ".join(fields.keys())
    ph = ", ".join(["%s"] * len(fields))
    cur.execute(f"INSERT INTO {SCHEMA}.exec_financial_commitment ({cols}, created_by) VALUES ({ph}, %s) RETURNING id",
                (*fields.values(), actor))
    new_id = cur.fetchone()[0]
    log_change(cur, actor, "financial_commitment", new_id, "create", after=fields)
    return new_id, None


# ============ ФОТ ============

def list_fot(cur, parent_kind, parent_id, include_test_data=False):
    tnd = "" if include_test_data else "AND f.is_test_data = false"
    cur.execute(f"""
        SELECT f.*, a.role_title, a.person_id, p.display_name AS person_name
        FROM {SCHEMA}.exec_fot_plan f
        LEFT JOIN {SCHEMA}.exec_resource_assignment a ON a.id = f.assignment_id
        LEFT JOIN {SCHEMA}.exec_person p ON p.id = a.person_id
        WHERE f.{parent_kind}_id = %s {tnd}
        ORDER BY f.month
    """, (parent_id,))
    return rows(cur)


def save_fot(cur, body: dict, actor: str):
    parent_key, parent_val = PARENT_FIELD(body)
    if not parent_val:
        return None, "Не указан проект или инициатива"
    base = as_num(body.get("base_cost"))
    bonus = as_num(body.get("bonus"))
    accruals = as_num(body.get("accruals"))
    other = as_num(body.get("other_payments"))
    fields = {
        parent_key: parent_val,
        "assignment_id": as_int(body.get("assignment_id")),
        "month": body.get("month"),
        "cost_basis": body.get("cost_basis", "role_average"),
        "base_cost": base, "bonus": bonus, "accruals": accruals, "other_payments": other,
        "plan_total": base + bonus + accruals + other,
        "fact_total": as_num(body.get("fact_total")) if body.get("fact_total") else None,
    }
    if not fields["month"]:
        return None, "Укажите месяц"
    cols = ", ".join(fields.keys())
    ph = ", ".join(["%s"] * len(fields))
    cur.execute(f"INSERT INTO {SCHEMA}.exec_fot_plan ({cols}, created_by) VALUES ({ph}, %s) RETURNING id",
                (*fields.values(), actor))
    new_id = cur.fetchone()[0]
    log_change(cur, actor, "fot_plan", new_id, "create", after={k: v for k, v in fields.items() if k != "base_cost"})
    return new_id, None


# ============ СВОДКА ПРОЕКТА / ИНИЦИАТИВЫ ============

def project_financial_summary(cur, project_id: int):
    cur.execute(f"""
        SELECT COALESCE(SUM(amount_plan), 0) FROM {SCHEMA}.exec_budget_line l
        JOIN {SCHEMA}.exec_budget_version v ON v.id = l.version_id
        WHERE v.project_id = %s AND v.version_status = 'approved' AND v.is_test_data = false
    """, (project_id,))
    approved_budget = float(cur.fetchone()[0] or 0)

    cur.execute(f"""
        SELECT COALESCE(SUM(amount), 0) FROM {SCHEMA}.exec_financial_actual
        WHERE project_id = %s AND is_test_data = false
    """, (project_id,))
    fact = float(cur.fetchone()[0] or 0)

    cur.execute(f"""
        SELECT COALESCE(SUM(amount), 0) FROM {SCHEMA}.exec_financial_commitment
        WHERE project_id = %s AND status = 'active' AND is_test_data = false
    """, (project_id,))
    commitments = float(cur.fetchone()[0] or 0)

    forecast = fact + commitments
    return {
        "approved_budget": approved_budget, "fact": fact, "commitments": commitments,
        "forecast": forecast, "remaining": approved_budget - forecast,
        "deviation": forecast - approved_budget,
        "deviation_pct": round((forecast - approved_budget) / approved_budget * 100, 1) if approved_budget else None,
    }


def initiative_financial_summary(cur, initiative_id: int):
    """Бюджет инициативы = сумма бюджетов связанных проектов + собственные
    нераспределённые расходы инициативы. Защита от двойного счёта: проекты
    считаются один раз через прямую связь exec_project.initiative_id."""
    cur.execute(f"""
        SELECT COALESCE(SUM(amount_plan), 0) FROM {SCHEMA}.exec_budget_line l
        JOIN {SCHEMA}.exec_budget_version v ON v.id = l.version_id
        JOIN {SCHEMA}.exec_project p ON p.id = v.project_id
        WHERE p.initiative_id = %s AND v.version_status = 'approved' AND v.is_test_data = false
    """, (initiative_id,))
    projects_budget = float(cur.fetchone()[0] or 0)

    cur.execute(f"""
        SELECT COALESCE(SUM(amount_plan), 0) FROM {SCHEMA}.exec_budget_line l
        JOIN {SCHEMA}.exec_budget_version v ON v.id = l.version_id
        WHERE v.initiative_id = %s AND v.version_status = 'approved' AND v.is_test_data = false
    """, (initiative_id,))
    own_budget = float(cur.fetchone()[0] or 0)

    cur.execute(f"""
        SELECT COALESCE(SUM(a.amount), 0) FROM {SCHEMA}.exec_financial_actual a
        JOIN {SCHEMA}.exec_project p ON p.id = a.project_id
        WHERE p.initiative_id = %s AND a.is_test_data = false
    """, (initiative_id,))
    projects_fact = float(cur.fetchone()[0] or 0)

    cur.execute(f"""
        SELECT COALESCE(SUM(amount), 0) FROM {SCHEMA}.exec_financial_actual
        WHERE initiative_id = %s AND is_test_data = false
    """, (initiative_id,))
    own_fact = float(cur.fetchone()[0] or 0)

    return {
        "total_budget": projects_budget + own_budget,
        "projects_budget": projects_budget, "own_budget": own_budget,
        "total_fact": projects_fact + own_fact,
        "projects_fact": projects_fact, "own_fact": own_fact,
    }


# ============ ФИНАНСОВЫЙ СНИМОК (утверждение) ============

def create_financial_snapshot(cur, body: dict, actor: str):
    version_id = as_int(body.get("budget_version_id"))
    version = fetch_one(cur, "exec_budget_version", version_id) if version_id else None
    if not version:
        return None, "Версия бюджета не найдена"

    parent_kind = "project" if version.get("project_id") else "initiative"
    parent_id = version.get("project_id") or version.get("initiative_id")

    payload = {
        "version": version,
        "lines": list_budget_lines(cur, version_id),
        "summary": budget_summary(cur, version_id),
        "financial_summary": (project_financial_summary(cur, parent_id) if parent_kind == "project"
                              else initiative_financial_summary(cur, parent_id)),
    }
    payload_str = json.dumps(payload, ensure_ascii=False, default=str)
    payload_hash = hashlib.sha256(payload_str.encode("utf-8")).hexdigest()

    version_group = f"budget_{parent_kind}{parent_id}_{version['year']}"
    cur.execute(
        f"SELECT COALESCE(MAX(version_number), 0) FROM {SCHEMA}.exec_financial_snapshot WHERE version_group = %s",
        (version_group,),
    )
    next_version = cur.fetchone()[0] + 1

    cur.execute(
        f"""INSERT INTO {SCHEMA}.exec_financial_snapshot
            ({parent_kind}_id, budget_version_id, year, payload_json, payload_sha256,
             version_group, version_number, is_test_data, created_by)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id, created_at""",
        (parent_id, version_id, version["year"], payload_str, payload_hash,
         version_group, next_version, bool(body.get("is_test_data")), actor),
    )
    row = cur.fetchone()
    log_change(cur, actor, "financial_snapshot", row[0], "create",
               after={"version_group": version_group, "payload_sha256": payload_hash})
    return {"id": row[0], "created_at": row[1], "version_group": version_group,
            "version_number": next_version, "payload_sha256": payload_hash}, None


def get_financial_snapshot(cur, sid: int):
    cur.execute(f"SELECT * FROM {SCHEMA}.exec_financial_snapshot WHERE id = %s", (sid,))
    r = rows(cur)
    if not r:
        return None
    item = r[0]
    payload_str = item.pop("payload_json")
    stored_hash = item.get("payload_sha256")
    actual_hash = hashlib.sha256(payload_str.encode("utf-8")).hexdigest()
    item["payload"] = json.loads(payload_str)
    item["integrity_ok"] = stored_hash == actual_hash
    return item


def handler(event: dict, context) -> dict:
    """Команда, загрузка, ФОТ и бюджет проектов/инициатив. Доступ только владельцу
    кабинета. Финансовые/кадровые данные не передаются во внешний AI."""
    if event.get("httpMethod") == "OPTIONS":
        return cors({})

    headers = event.get("headers") or {}
    conn = psycopg2.connect(DB)
    try:
        user = authenticate(conn, headers)
        if not user:
            return cors({"ok": False, "error": {"message": "Доступ только для владельца кабинета"}}, 403)

        qs = event.get("queryStringParameters") or {}
        action = qs.get("action", "assignments")
        body = json.loads(event["body"]) if event.get("body") else {}
        cur = conn.cursor()
        itd = qs.get("include_test_data") == "1"

        parent_kind = qs.get("kind", "project")
        parent_id = as_int(qs.get("id"))

        if action == "assignments":
            if not parent_id:
                return cors({"ok": False, "error": {"message": "Не указан объект"}}, 400)
            return cors({"ok": True, "data": {"items": list_assignments(cur, parent_kind, parent_id, qs.get("include_archived") == "1", itd)}})

        if action == "save_assignment":
            person_id = as_int(body.get("person_id"))
            aid, err = save_assignment(cur, body, user["email"])
            if err:
                return cors({"ok": False, "error": {"message": err}}, 400)
            overload_warning = None
            if person_id:
                total = overload_check(cur, person_id)
                if total > 100:
                    overload_warning = f"Суммарная загрузка сотрудника {total}% превышает 100%"
            conn.commit()
            return cors({"ok": True, "data": {"id": aid, "overload_warning": overload_warning}})

        if action == "archive_assignment":
            aid = archive_assignment(cur, as_int(body.get("id")), user["email"])
            conn.commit()
            if not aid:
                return cors({"ok": False, "error": {"message": "Не найдено или уже архивировано"}}, 404)
            return cors({"ok": True, "data": {"id": aid}})

        if action == "team_load":
            return cors({"ok": True, "data": {"items": team_load_summary(cur, itd)}})

        if action == "vacant_roles":
            return cors({"ok": True, "data": {"items": vacant_roles(cur, itd)}})

        if action == "portfolio_financial_kpi":
            year = as_int(qs.get("year"))
            return cors({"ok": True, "data": portfolio_financial_kpi(cur, year, itd)})

        if action == "budget_versions":
            if not parent_id:
                return cors({"ok": False, "error": {"message": "Не указан объект"}}, 400)
            return cors({"ok": True, "data": {"items": list_budget_versions(cur, parent_kind, parent_id, itd)}})

        if action == "create_budget_version":
            vid, err = create_budget_version(cur, body, user["email"])
            if err:
                return cors({"ok": False, "error": {"message": err}}, 400)
            conn.commit()
            return cors({"ok": True, "data": {"id": vid}})

        if action == "set_budget_version_status":
            vid, err = set_budget_version_status(cur, as_int(body.get("id")), body.get("status"), user["email"])
            if err:
                return cors({"ok": False, "error": {"message": err}}, 400)
            conn.commit()
            return cors({"ok": True, "data": {"id": vid}})

        if action == "budget_lines":
            vid = as_int(qs.get("version_id"))
            if not vid:
                return cors({"ok": False, "error": {"message": "Не указана версия"}}, 400)
            return cors({"ok": True, "data": {"items": list_budget_lines(cur, vid), "summary": budget_summary(cur, vid)}})

        if action == "save_budget_line":
            lid, err = save_budget_line(cur, body, user["email"])
            if err:
                return cors({"ok": False, "error": {"message": err}}, 400)
            conn.commit()
            return cors({"ok": True, "data": {"id": lid}})

        if action == "cost_categories":
            cur.execute(f"SELECT * FROM {SCHEMA}.exec_cost_category WHERE is_active = true ORDER BY sort_order")
            return cors({"ok": True, "data": {"items": rows(cur)}})

        if action == "actuals":
            if not parent_id:
                return cors({"ok": False, "error": {"message": "Не указан объект"}}, 400)
            return cors({"ok": True, "data": {"items": list_actuals(cur, parent_kind, parent_id, itd)}})

        if action == "save_actual":
            aid, err = save_actual(cur, body, user["email"])
            if err:
                return cors({"ok": False, "error": {"message": err}}, 400)
            conn.commit()
            return cors({"ok": True, "data": {"id": aid}})

        if action == "commitments":
            if not parent_id:
                return cors({"ok": False, "error": {"message": "Не указан объект"}}, 400)
            return cors({"ok": True, "data": {"items": list_commitments(cur, parent_kind, parent_id, itd)}})

        if action == "save_commitment":
            cid, err = save_commitment(cur, body, user["email"])
            if err:
                return cors({"ok": False, "error": {"message": err}}, 400)
            conn.commit()
            return cors({"ok": True, "data": {"id": cid}})

        if action == "fot":
            if not parent_id:
                return cors({"ok": False, "error": {"message": "Не указан объект"}}, 400)
            return cors({"ok": True, "data": {"items": list_fot(cur, parent_kind, parent_id, itd)}})

        if action == "save_fot":
            fid, err = save_fot(cur, body, user["email"])
            if err:
                return cors({"ok": False, "error": {"message": err}}, 400)
            conn.commit()
            return cors({"ok": True, "data": {"id": fid}})

        if action == "financial_summary":
            if not parent_id:
                return cors({"ok": False, "error": {"message": "Не указан объект"}}, 400)
            summary = (project_financial_summary(cur, parent_id) if parent_kind == "project"
                      else initiative_financial_summary(cur, parent_id))
            return cors({"ok": True, "data": summary})

        if action == "create_financial_snapshot":
            snap, err = create_financial_snapshot(cur, body, user["email"])
            if err:
                return cors({"ok": False, "error": {"message": err}}, 400)
            conn.commit()
            return cors({"ok": True, "data": snap})

        if action == "financial_snapshot":
            sid = as_int(qs.get("id"))
            snap = get_financial_snapshot(cur, sid) if sid else None
            if not snap:
                return cors({"ok": False, "error": {"message": "Снимок не найден"}}, 404)
            return cors({"ok": True, "data": snap})

        return cors({"ok": False, "error": {"message": "Неизвестное действие"}}, 400)
    finally:
        conn.close()