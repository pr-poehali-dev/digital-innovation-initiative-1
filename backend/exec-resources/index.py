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


def capacity_plan_year(cur, kind, parent_id, year, include_test_data=False):
    """Помесячная загрузка (план/факт) по всем назначениям проекта/инициативы за год."""
    tnd = "" if include_test_data else "AND a.is_test_data = false"
    cur.execute(f"""
        SELECT a.id AS assignment_id, a.role_title, a.person_id, a.is_vacant,
               p.display_name AS person_name, r.title AS role_title_ref, a.plan_load_pct AS default_plan_load
        FROM {SCHEMA}.exec_resource_assignment a
        LEFT JOIN {SCHEMA}.exec_person p ON p.id = a.person_id
        LEFT JOIN {SCHEMA}.exec_center_role r ON r.id = a.role_id
        WHERE a.{kind}_id = %s AND a.archived_at IS NULL {tnd}
        ORDER BY a.created_at
    """, (parent_id,))
    assignments = rows(cur)

    cur.execute(f"""
        SELECT * FROM {SCHEMA}.exec_capacity_plan
        WHERE assignment_id IN (
            SELECT id FROM {SCHEMA}.exec_resource_assignment WHERE {kind}_id = %s
        ) AND year = %s
    """, (parent_id, year))
    plans = rows(cur)
    by_assignment = {}
    for p in plans:
        by_assignment.setdefault(p["assignment_id"], {})[p["month"]] = p

    for a in assignments:
        months = {}
        for m in range(1, 13):
            cell = by_assignment.get(a["assignment_id"], {}).get(m)
            months[m] = {
                "plan_load_pct": float(cell["plan_load_pct"]) if cell and cell["plan_load_pct"] is not None else float(a["default_plan_load"] or 0),
                "fact_load_pct": float(cell["fact_load_pct"]) if cell and cell["fact_load_pct"] is not None else None,
                "plan_days": float(cell["plan_days"]) if cell and cell["plan_days"] is not None else None,
                "fact_days": float(cell["fact_days"]) if cell and cell["fact_days"] is not None else None,
            }
        a["months"] = months
        a["year_avg_plan_pct"] = round(sum(m["plan_load_pct"] for m in months.values()) / 12, 1)

    # Перегрузка по месяцу — сумма плановой загрузки человека по ВСЕМ проектам/
    # инициативам, не только текущей. Через generate_series(1,12), чтобы для
    # месяца без явной записи в exec_capacity_plan корректно подставлялся
    # дефолт plan_load_pct назначения (иначе LEFT JOIN даёт cp.month=NULL и
    # такие назначения "выпадают" из подсчёта конкретного месяца).
    person_ids = [a["person_id"] for a in assignments if a["person_id"]]
    overload_by_month = {}
    if person_ids:
        tnd_ap = "" if include_test_data else "AND ap.is_test_data = false"
        cur.execute(f"""
            SELECT ap.person_id, mm.month, SUM(COALESCE(cp.plan_load_pct, ap.plan_load_pct)) AS total_pct
            FROM {SCHEMA}.exec_resource_assignment ap
            CROSS JOIN generate_series(1, 12) AS mm(month)
            LEFT JOIN {SCHEMA}.exec_capacity_plan cp ON cp.assignment_id = ap.id AND cp.year = %s AND cp.month = mm.month
            WHERE ap.person_id = ANY(%s) AND ap.archived_at IS NULL {tnd_ap}
            GROUP BY ap.person_id, mm.month
        """, (year, person_ids))
        for pid, month, total in cur.fetchall():
            overload_by_month.setdefault(pid, {})[month] = float(total or 0)

    for a in assignments:
        a["overload_by_month"] = overload_by_month.get(a["person_id"], {}) if a["person_id"] else {}

    return assignments


def save_capacity_cell(cur, body: dict, actor: str):
    assignment_id = as_int(body.get("assignment_id"))
    year = as_int(body.get("year"))
    month = as_int(body.get("month"))
    if not assignment_id or not year or not month or not (1 <= month <= 12):
        return None, "Укажите назначение, год и месяц (1-12)"

    fields = {
        "plan_load_pct": as_num(body.get("plan_load_pct")) if body.get("plan_load_pct") not in (None, "") else None,
        "fact_load_pct": as_num(body.get("fact_load_pct")) if body.get("fact_load_pct") not in (None, "") else None,
        "plan_days": as_num(body.get("plan_days")) if body.get("plan_days") not in (None, "") else None,
        "fact_days": as_num(body.get("fact_days")) if body.get("fact_days") not in (None, "") else None,
    }
    cur.execute(f"""
        INSERT INTO {SCHEMA}.exec_capacity_plan (assignment_id, year, month, plan_load_pct, fact_load_pct, plan_days, fact_days)
        VALUES (%s,%s,%s,%s,%s,%s,%s)
        ON CONFLICT (assignment_id, year, month) DO UPDATE SET
            plan_load_pct = EXCLUDED.plan_load_pct, fact_load_pct = EXCLUDED.fact_load_pct,
            plan_days = EXCLUDED.plan_days, fact_days = EXCLUDED.fact_days, updated_at = now()
        RETURNING id
    """, (assignment_id, year, month, fields["plan_load_pct"], fields["fact_load_pct"], fields["plan_days"], fields["fact_days"]))
    new_id = cur.fetchone()[0]
    log_change(cur, actor, "capacity_plan", new_id, "upsert", after={**fields, "year": year, "month": month})
    return new_id, None


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
        WHERE v.is_active = true AND v.year = %s {tnd_v}
    """, (yr,))
    total_budget = float(cur.fetchone()[0] or 0)

    cur.execute(f"""
        SELECT COALESCE(SUM(amount), 0) FROM {SCHEMA}.exec_financial_actual
        WHERE EXTRACT(YEAR FROM month) = %s {tnd_a}
    """, (yr,))
    total_fact = float(cur.fetchone()[0] or 0)

    cur.execute(f"""
        SELECT COALESCE(SUM(amount), 0), COALESCE(SUM(paid_amount), 0)
        FROM {SCHEMA}.exec_financial_commitment WHERE status = 'active' {tnd_c}
    """)
    commitments_total, commitments_paid = cur.fetchone()
    total_commitments_open = float(commitments_total or 0) - float(commitments_paid or 0)

    cur.execute(f"""
        SELECT COALESCE(SUM(amount), 0) FROM {SCHEMA}.exec_financial_expected
        WHERE EXTRACT(YEAR FROM month) = %s {tnd_a}
    """, (yr,))
    total_expected = float(cur.fetchone()[0] or 0)

    cur.execute(f"""
        SELECT COALESCE(SUM(plan_total), 0) FROM {SCHEMA}.exec_fot_plan
        WHERE EXTRACT(YEAR FROM month) = %s {tnd_a}
    """, (yr,))
    total_fot = float(cur.fetchone()[0] or 0)

    total_forecast = total_fact + total_commitments_open + total_expected

    cur.execute(f"""
        SELECT p.id, p.title,
            COALESCE((SELECT SUM(l.amount_plan) FROM {SCHEMA}.exec_budget_line l
                JOIN {SCHEMA}.exec_budget_version v ON v.id = l.version_id
                WHERE v.project_id = p.id AND v.is_active = true AND v.year = %s), 0) AS budget,
            COALESCE((SELECT SUM(amount) FROM {SCHEMA}.exec_financial_actual
                WHERE project_id = p.id AND EXTRACT(YEAR FROM month) = %s), 0) +
            COALESCE((SELECT SUM(amount) - SUM(paid_amount) FROM {SCHEMA}.exec_financial_commitment
                WHERE project_id = p.id AND status='active'), 0) +
            COALESCE((SELECT SUM(amount) FROM {SCHEMA}.exec_financial_expected
                WHERE project_id = p.id AND EXTRACT(YEAR FROM month) = %s), 0) AS forecast
        FROM {SCHEMA}.exec_project p
        WHERE p.archived_at IS NULL AND p.is_test_data = false
    """, (yr, yr, yr))
    over_budget = [dict(id=r[0], title=r[1], budget=float(r[2]), forecast=float(r[3]),
                        deviation=float(r[3]) - float(r[2]))
                   for r in cur.fetchall() if float(r[2]) > 0 and float(r[3]) > float(r[2])]

    return {
        "year": yr, "total_budget": total_budget, "total_fact": total_fact,
        "total_commitments_open": total_commitments_open, "total_expected": total_expected,
        "total_forecast": total_forecast,
        "remaining": total_budget - total_forecast, "total_fot": total_fot,
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
    """При переходе в approved версия становится ЕДИНСТВЕННОЙ действующей
    (is_active=true) для (проект/инициатива, год, сценарий) — старая
    действующая версия теряет is_active, но остаётся в истории со своим
    статусом (не удаляется и не переименовывается)."""
    if status not in ("draft", "review", "approved", "revised", "forecast"):
        return None, "Недопустимый статус версии"
    version = fetch_one(cur, "exec_budget_version", vid)
    if not version:
        return None, "Версия не найдена"

    is_locked = status == "approved"
    becomes_active = status == "approved"

    if becomes_active:
        parent_kind = "project_id" if version.get("project_id") else "initiative_id"
        cur.execute(
            f"""UPDATE {SCHEMA}.exec_budget_version SET is_active = false, updated_at = now()
                WHERE {parent_kind} = %s AND year = %s AND scenario = %s AND is_active = true AND id != %s""",
            (version[parent_kind], version["year"], version["scenario"], vid),
        )

    cur.execute(
        f"""UPDATE {SCHEMA}.exec_budget_version
            SET version_status = %s, is_locked = %s, is_active = %s,
                effective_date = CASE WHEN %s THEN CURRENT_DATE ELSE effective_date END,
                locked_at = CASE WHEN %s THEN now() ELSE locked_at END,
                locked_by = CASE WHEN %s THEN %s ELSE locked_by END,
                updated_at = now()
            WHERE id = %s RETURNING id""",
        (status, is_locked, becomes_active, becomes_active, is_locked, is_locked, actor, vid),
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
    amount = as_num(body.get("amount"))
    paid_amount = as_num(body.get("paid_amount")) if body.get("paid_amount") not in (None, "") else 0
    if paid_amount > amount:
        return None, "Оплаченная часть не может превышать общую сумму обязательства"
    fields = {
        parent_key: parent_val,
        "category_id": as_int(body.get("category_id")),
        "contract_ref": body.get("contract_ref"),
        "amount": amount, "paid_amount": paid_amount,
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


def list_expected(cur, parent_kind, parent_id, include_test_data=False):
    tnd = "" if include_test_data else "AND e.is_test_data = false"
    cur.execute(f"""
        SELECT e.*, c.title AS category_title FROM {SCHEMA}.exec_financial_expected e
        JOIN {SCHEMA}.exec_cost_category c ON c.id = e.category_id
        WHERE e.{parent_kind}_id = %s {tnd}
        ORDER BY e.month
    """, (parent_id,))
    return rows(cur)


def save_expected(cur, body: dict, actor: str):
    parent_key, parent_val = PARENT_FIELD(body)
    if not parent_val:
        return None, "Не указан проект или инициатива"
    fields = {
        parent_key: parent_val,
        "category_id": as_int(body.get("category_id")),
        "month": body.get("month"),
        "amount": as_num(body.get("amount")),
        "comment": body.get("comment"),
    }
    if not fields["category_id"] or not fields["month"]:
        return None, "Укажите статью и месяц"
    cols = ", ".join(fields.keys())
    ph = ", ".join(["%s"] * len(fields))
    cur.execute(f"INSERT INTO {SCHEMA}.exec_financial_expected ({cols}, created_by) VALUES ({ph}, %s) RETURNING id",
                (*fields.values(), actor))
    new_id = cur.fetchone()[0]
    log_change(cur, actor, "financial_expected", new_id, "create", after=fields)
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
    """Прогноз = факт + ОТКРЫТАЯ (неоплаченная) часть обязательств + ожидаемые
    расходы без обязательств. Оплаченная часть обязательства (paid_amount)
    обычно уже отражена в exec_financial_actual — суммировать всю сумму
    обязательства вместе с фактом было бы двойным счётом."""
    cur.execute(f"""
        SELECT COALESCE(SUM(amount_plan), 0) FROM {SCHEMA}.exec_budget_line l
        JOIN {SCHEMA}.exec_budget_version v ON v.id = l.version_id
        WHERE v.project_id = %s AND v.is_active = true AND v.is_test_data = false
    """, (project_id,))
    approved_budget = float(cur.fetchone()[0] or 0)

    cur.execute(f"""
        SELECT COALESCE(SUM(amount), 0) FROM {SCHEMA}.exec_financial_actual
        WHERE project_id = %s AND is_test_data = false
    """, (project_id,))
    fact = float(cur.fetchone()[0] or 0)

    cur.execute(f"""
        SELECT COALESCE(SUM(amount), 0), COALESCE(SUM(paid_amount), 0)
        FROM {SCHEMA}.exec_financial_commitment
        WHERE project_id = %s AND status = 'active' AND is_test_data = false
    """, (project_id,))
    commitments_total, commitments_paid = cur.fetchone()
    commitments_total = float(commitments_total or 0)
    commitments_paid = float(commitments_paid or 0)
    commitments_open = commitments_total - commitments_paid

    cur.execute(f"""
        SELECT COALESCE(SUM(amount), 0) FROM {SCHEMA}.exec_financial_expected
        WHERE project_id = %s AND is_test_data = false
    """, (project_id,))
    expected = float(cur.fetchone()[0] or 0)

    forecast = fact + commitments_open + expected
    return {
        "approved_budget": approved_budget, "fact": fact,
        "commitments_total": commitments_total, "commitments_paid": commitments_paid,
        "commitments_open": commitments_open, "expected": expected,
        "forecast": forecast, "remaining": approved_budget - forecast,
        "deviation": forecast - approved_budget,
        "deviation_pct": round((forecast - approved_budget) / approved_budget * 100, 1) if approved_budget else None,
    }


def financial_timeline(cur, project_id: int, year: int):
    """Финансовая шкала проекта на той же временной оси, что и Гант/ресурсы:
    по месяцам года — утверждённый бюджет (план), ФОТ (план/факт), факт,
    обязательства (открытая часть, распределённая по месяцам действия
    договора), ожидаемые расходы без обязательств, прогноз и отклонение.

    НЕ копирует суммы в таблицы расписания — читает существующий
    финансовый контур (exec_budget_line/exec_fot_plan/exec_financial_*) и
    просто раскладывает уже существующие цифры по месяцам этого года.
    Ключевые платежи и финансовые контрольные точки — отдельные списки,
    без слияния с помесячной сеткой, чтоббы не терять точные даты."""
    months = {m: {"budget_plan": 0.0, "fot_plan": 0.0, "fot_fact": 0.0, "fact": 0.0,
                   "commitments_open": 0.0, "expected": 0.0} for m in range(1, 13)}

    cur.execute(f"""
        SELECT EXTRACT(MONTH FROM l.month)::int AS m, SUM(l.amount_plan) AS s
        FROM {SCHEMA}.exec_budget_line l
        JOIN {SCHEMA}.exec_budget_version v ON v.id = l.version_id
        WHERE v.project_id = %s AND v.is_active = true AND v.is_test_data = false
          AND EXTRACT(YEAR FROM l.month) = %s
        GROUP BY m
    """, (project_id, year))
    for m, s in cur.fetchall():
        months[m]["budget_plan"] = float(s or 0)

    cur.execute(f"""
        SELECT EXTRACT(MONTH FROM f.month)::int AS m, SUM(f.plan_total) AS pl, SUM(f.fact_total) AS fc
        FROM {SCHEMA}.exec_fot_plan f
        WHERE f.project_id = %s AND f.is_test_data = false AND EXTRACT(YEAR FROM f.month) = %s
        GROUP BY m
    """, (project_id, year))
    for m, pl, fc in cur.fetchall():
        months[m]["fot_plan"] = float(pl or 0)
        months[m]["fot_fact"] = float(fc or 0)

    cur.execute(f"""
        SELECT EXTRACT(MONTH FROM a.month)::int AS m, SUM(a.amount) AS s
        FROM {SCHEMA}.exec_financial_actual a
        WHERE a.project_id = %s AND a.is_test_data = false AND EXTRACT(YEAR FROM a.month) = %s
        GROUP BY m
    """, (project_id, year))
    for m, s in cur.fetchall():
        months[m]["fact"] = float(s or 0)

    cur.execute(f"""
        SELECT EXTRACT(MONTH FROM e.month)::int AS m, SUM(e.amount) AS s
        FROM {SCHEMA}.exec_financial_expected e
        WHERE e.project_id = %s AND e.is_test_data = false AND EXTRACT(YEAR FROM e.month) = %s
        GROUP BY m
    """, (project_id, year))
    for m, s in cur.fetchall():
        months[m]["expected"] = float(s or 0)

    # Открытая часть обязательства равномерно распределяется по месяцам
    # действия договора, попадающим в этот год — приблизительная разбивка
    # для отображения на шкале, не бухгалтерский учёт.
    cur.execute(f"""
        SELECT id, amount, paid_amount, start_date, end_date FROM {SCHEMA}.exec_financial_commitment
        WHERE project_id = %s AND status = 'active' AND is_test_data = false
    """, (project_id,))
    commitments_without_dates = 0.0
    for cid, amount, paid, start, end in cur.fetchall():
        open_amount = float(amount or 0) - float(paid or 0)
        if open_amount <= 0:
            continue
        if not start or not end:
            # Без дат распределить по месяцам нельзя — сумма не должна
            # молча пропадать со шкалы, показываем её отдельно как факт,
            # требующий уточнения дат.
            commitments_without_dates += open_amount
            continue
        span_months = [(start.year, start.month)]
        cur_y, cur_m = start.year, start.month
        while (cur_y, cur_m) < (end.year, end.month):
            cur_m += 1
            if cur_m > 12:
                cur_m, cur_y = 1, cur_y + 1
            span_months.append((cur_y, cur_m))
        in_year = [(y, m) for y, m in span_months if y == year]
        if not in_year:
            continue
        per_month = open_amount / len(span_months)
        for y, m in in_year:
            months[m]["commitments_open"] += per_month

    result_months = {}
    running_budget = running_forecast = 0.0
    for m in range(1, 13):
        d = months[m]
        forecast = d["fact"] + d["commitments_open"] + d["expected"]
        running_budget += d["budget_plan"]
        running_forecast += forecast
        result_months[m] = {
            **d, "forecast": forecast,
            "deviation": forecast - d["budget_plan"],
            "cumulative_budget": running_budget,
            "cumulative_forecast": running_forecast,
        }

    # Ключевые платежи: крупные фактические/обязательственные записи с
    # конкретной датой — не всё подряд, максимум по 10 самых крупных.
    cur.execute(f"""
        SELECT 'actual' AS kind, id, month AS date, amount, comment FROM {SCHEMA}.exec_financial_actual
        WHERE project_id = %s AND is_test_data = false AND EXTRACT(YEAR FROM month) = %s
        UNION ALL
        SELECT 'commitment' AS kind, id, start_date AS date, amount, contract_ref AS comment
        FROM {SCHEMA}.exec_financial_commitment
        WHERE project_id = %s AND is_test_data = false AND status = 'active'
          AND start_date IS NOT NULL AND EXTRACT(YEAR FROM start_date) = %s
        ORDER BY amount DESC LIMIT 10
    """, (project_id, year, project_id, year))
    key_payments = rows(cur)

    # Финансовые контрольные точки: существующие вехи проекта — без
    # дублирования дат в новую структуру, только с признаком суммы если
    # веха связана с бюджетной строкой через комментарий (не строгая связь).
    cur.execute(f"""
        SELECT id, title, plan_date, fact_date, status, milestone_type
        FROM {SCHEMA}.exec_milestone
        WHERE project_id = %s AND is_test_data = false AND EXTRACT(YEAR FROM plan_date) = %s
        ORDER BY plan_date
    """, (project_id, year))
    milestones = rows(cur)

    return {"year": year, "months": result_months, "key_payments": key_payments, "milestones": milestones,
            "commitments_without_dates": commitments_without_dates}


def initiative_financial_summary(cur, initiative_id: int):
    """Бюджет инициативы = сумма бюджетов связанных проектов + собственные
    нераспределённые расходы инициативы. Защита от двойного счёта: проекты
    считаются один раз через прямую связь exec_project.initiative_id."""
    cur.execute(f"""
        SELECT COALESCE(SUM(amount_plan), 0) FROM {SCHEMA}.exec_budget_line l
        JOIN {SCHEMA}.exec_budget_version v ON v.id = l.version_id
        JOIN {SCHEMA}.exec_project p ON p.id = v.project_id
        WHERE p.initiative_id = %s AND v.is_active = true AND v.is_test_data = false
    """, (initiative_id,))
    projects_budget = float(cur.fetchone()[0] or 0)

    cur.execute(f"""
        SELECT COALESCE(SUM(amount_plan), 0) FROM {SCHEMA}.exec_budget_line l
        JOIN {SCHEMA}.exec_budget_version v ON v.id = l.version_id
        WHERE v.initiative_id = %s AND v.is_active = true AND v.is_test_data = false
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

    # Расшифровка по проектам — для интерфейса инициативы (переход к проекту,
    # из которого собрана сумма). exec_project.initiative_id — обычный FK
    # "один проект -> максимум одна инициатива", поэтому задвоения здесь
    # конструктивно быть не может (в отличие от M2M через exec_link).
    cur.execute(f"""
        SELECT p.id, p.title,
            COALESCE((SELECT SUM(l.amount_plan) FROM {SCHEMA}.exec_budget_line l
                JOIN {SCHEMA}.exec_budget_version v ON v.id = l.version_id
                WHERE v.project_id = p.id AND v.is_active = true AND v.is_test_data = false), 0) AS budget,
            COALESCE((SELECT SUM(amount) FROM {SCHEMA}.exec_financial_actual
                WHERE project_id = p.id AND is_test_data = false), 0) AS fact
        FROM {SCHEMA}.exec_project p
        WHERE p.initiative_id = %s AND p.archived_at IS NULL AND p.is_test_data = false
        ORDER BY p.title
    """, (initiative_id,))
    by_project = [{"id": r[0], "title": r[1], "budget": float(r[2]), "fact": float(r[3])} for r in cur.fetchall()]

    return {
        "total_budget": projects_budget + own_budget,
        "projects_budget": projects_budget, "own_budget": own_budget,
        "total_fact": projects_fact + own_fact,
        "projects_fact": projects_fact, "own_fact": own_fact,
        "by_project": by_project,
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
        "team": list_assignments(cur, parent_kind, parent_id),
        "capacity": capacity_plan_year(cur, parent_kind, parent_id, version["year"]),
        "fot": list_fot(cur, parent_kind, parent_id),
        "actuals": list_actuals(cur, parent_kind, parent_id),
        "commitments": list_commitments(cur, parent_kind, parent_id),
        "expected": list_expected(cur, parent_kind, parent_id),
        "currency": "RUB", "unit": "рубли",
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


def export_financial_xlsx(snapshot: dict) -> str:
    """XLSX строго из содержимого неизменяемого снимка (snapshot['payload']),
    а не из текущих таблиц — выгрузка соответствует ровно той версии, которая
    была утверждена."""
    import io
    import base64
    import xlsxwriter

    p = snapshot["payload"]
    v = p.get("version", {})
    buf = io.BytesIO()
    wb = xlsxwriter.Workbook(buf, {"in_memory": True})
    bold = wb.add_format({"bold": True, "bg_color": "#f0f0f0"})

    ws = wb.add_worksheet("Сводка")
    fs = p.get("financial_summary", {})
    ws.write_row(0, 0, ["Параметр", "Значение"], bold)
    meta_rows = [("Год", v.get("year")), ("Версия", v.get("version_label")),
                 ("Статус версии", v.get("version_status")), ("Действующая", v.get("is_active")),
                 ("Валюта", p.get("currency", "RUB")), ("Утверждённый бюджет", fs.get("approved_budget")),
                 ("Факт", fs.get("fact")), ("Обязательства всего", fs.get("commitments_total")),
                 ("Обязательства оплачено", fs.get("commitments_paid")),
                 ("Обязательства открыто", fs.get("commitments_open")),
                 ("Ожидаемые расходы", fs.get("expected")), ("Прогноз", fs.get("forecast")),
                 ("Остаток", fs.get("remaining")), ("Отклонение %", fs.get("deviation_pct"))]
    for i, (k, val) in enumerate(meta_rows, start=1):
        ws.write_row(i, 0, [k, val if val is not None else ""])

    def sheet(name, key, cols):
        items = p.get(key) or []
        s = wb.add_worksheet(name[:31])
        s.write_row(0, 0, [c[1] for c in cols], bold)
        for i, it in enumerate(items, start=1):
            s.write_row(i, 0, [str(it.get(c[0], "") or "") for c in cols])

    sheet("Бюджет по статьям", "lines", [("category_title", "Статья"), ("month", "Месяц"), ("amount_plan", "Сумма плана")])
    sheet("Команда", "team", [("person_name", "Сотрудник"), ("role_title", "Роль"), ("project_role", "Роль в проекте"),
                               ("plan_load_pct", "Плановая загрузка %"), ("is_vacant", "Вакансия")])
    sheet("ФОТ", "fot", [("person_name", "Сотрудник"), ("role_title", "Роль"), ("month", "Месяц"),
                          ("plan_total", "План"), ("fact_total", "Факт")])
    sheet("Факт", "actuals", [("category_title", "Статья"), ("month", "Месяц"), ("amount", "Сумма"), ("paid_amount", "Оплачено")])
    sheet("Обязательства", "commitments", [("category_title", "Статья"), ("contract_ref", "Договор"),
                                            ("amount", "Сумма"), ("paid_amount", "Оплачено"), ("status", "Статус")])
    sheet("Ожидаемые расходы без обязат.", "expected", [("category_title", "Статья"), ("month", "Месяц"), ("amount", "Сумма")])

    ws_forecast = wb.add_worksheet("Прогноз")
    ws_forecast.write_row(0, 0, ["Составляющая", "Сумма"], bold)
    forecast_rows = [
        ("Факт", fs.get("fact", 0)),
        ("+ Открытые обязательства (неоплаченная часть)", fs.get("commitments_open", 0)),
        ("+ Ожидаемые расходы без обязательств", fs.get("expected", 0)),
        ("= Прогноз до конца года", fs.get("forecast", 0)),
        ("Утверждённый бюджет", fs.get("approved_budget", 0)),
        ("Остаток (бюджет - прогноз)", fs.get("remaining", 0)),
    ]
    for i, (k, val) in enumerate(forecast_rows, start=1):
        ws_forecast.write_row(i, 0, [k, val])

    ws_pf = wb.add_worksheet("План-факт")
    ws_pf.write_row(0, 0, ["Показатель", "Значение"], bold)
    pf_rows = [
        ("Утверждённый бюджет (план)", fs.get("approved_budget")),
        ("Факт", fs.get("fact")),
        ("Обязательства всего", fs.get("commitments_total")),
        ("Обязательства оплачено", fs.get("commitments_paid")),
        ("Обязательства открыто", fs.get("commitments_open")),
        ("Ожидаемые расходы без обязательств", fs.get("expected")),
        ("Прогноз (факт + открытые обязательства + ожидаемые)", fs.get("forecast")),
        ("Остаток", fs.get("remaining")),
        ("Отклонение, руб.", fs.get("deviation")),
        ("Отклонение, %", fs.get("deviation_pct")),
    ]
    for i, (k, val) in enumerate(pf_rows, start=1):
        ws_pf.write_row(i, 0, [k, val if val is not None else ""])

    ws_month = wb.add_worksheet("Бюджет по месяцам")
    ws_month.write_row(0, 0, ["Месяц", "Сумма плана"], bold)
    summary = p.get("summary", {})
    for i, (m, val) in enumerate(sorted((summary.get("total_by_month") or {}).items()), start=1):
        ws_month.write_row(i, 0, [m, val])

    ws_load = wb.add_worksheet("Загрузка")
    ws_load.write_row(0, 0, ["Сотрудник/Роль"] + [f"Месяц {m}" for m in range(1, 13)], bold)
    for i, a in enumerate(p.get("capacity") or [], start=1):
        months = a.get("months", {})
        ws_load.write_row(i, 0, [a.get("person_name") or a.get("role_title") or ""] +
                          [months.get(str(m), months.get(m, {})).get("plan_load_pct", "") for m in range(1, 13)])

    ws_params = wb.add_worksheet("Параметры версии")
    ws_params.write_row(0, 0, ["Параметр", "Значение"], bold)
    params_rows = [("Название", snapshot["title"] if "title" in snapshot else v.get("version_label")),
                   ("Версия снимка", f"{snapshot.get('version_group')} v{snapshot.get('version_number')}"),
                   ("Автор", snapshot.get("created_by")), ("Дата формирования", str(snapshot.get("created_at"))),
                   ("SHA-256", snapshot.get("payload_sha256")), ("Целостность", snapshot.get("integrity_ok")),
                   ("Валюта", p.get("currency")), ("Единица измерения", p.get("unit"))]
    for i, (k, val) in enumerate(params_rows, start=1):
        ws_params.write_row(i, 0, [k, str(val) if val is not None else ""])

    wb.close()
    buf.seek(0)
    return base64.b64encode(buf.read()).decode("ascii")


# ============ РЕСУРСНАЯ ПОТРЕБНОСТЬ ============
# Шире вакансии: закрывается внутренним сотрудником, перераспределением
# загрузки, наймом, подрядчиком или временным экспертом. Хранит историю от
# возникновения до закрытия, даже после перевода в assignment.

REQUIREMENT_FIELDS = ["task_id", "milestone_id", "stage_id", "role_id", "role_title",
    "headcount", "required_load_pct", "period_start", "period_end", "need_by_date",
    "reason", "criticality", "required_competencies", "closing_method", "status",
    "estimated_monthly_cost", "funding_confirmed", "budget_line_id", "cost_category_id", "comment"]


def get_lead_time_days(cur, closing_method):
    if not closing_method:
        return 30
    cur.execute(f"SELECT lead_time_days FROM {SCHEMA}.exec_hiring_lead_time WHERE closing_method = %s", (closing_method,))
    r = cur.fetchone()
    return r[0] if r else 30


def compute_search_start_date(cur, period_start, closing_method):
    if not period_start:
        return None
    lead_days = get_lead_time_days(cur, closing_method)
    if isinstance(period_start, str):
        period_start = datetime.date.fromisoformat(period_start)
    return period_start - datetime.timedelta(days=lead_days)


def list_requirements(cur, parent_kind, parent_id, include_archived=False, include_test_data=False):
    conds = [f"r.{parent_kind}_id = %s"]
    params = [parent_id]
    if not include_archived:
        conds.append("r.archived_at IS NULL")
    if not include_test_data:
        conds.append("r.is_test_data = false")
    where = "WHERE " + " AND ".join(conds)
    cur.execute(f"""
        SELECT r.*, rc.title AS role_title_ref, t.title AS task_title, m.title AS milestone_title,
               s.title AS stage_title, cc.title AS cost_category_title,
               (r.need_by_date IS NOT NULL AND r.need_by_date < CURRENT_DATE
                   AND r.status NOT IN ('closed','cancelled')) AS is_overdue
        FROM {SCHEMA}.exec_resource_requirement r
        LEFT JOIN {SCHEMA}.exec_center_role rc ON rc.id = r.role_id
        LEFT JOIN {SCHEMA}.exec_task t ON t.id = r.task_id
        LEFT JOIN {SCHEMA}.exec_milestone m ON m.id = r.milestone_id
        LEFT JOIN {SCHEMA}.exec_project_stage s ON s.id = r.stage_id
        LEFT JOIN {SCHEMA}.exec_cost_category cc ON cc.id = r.cost_category_id
        {where}
        ORDER BY (r.need_by_date IS NULL), r.need_by_date
    """, params)
    return rows(cur)


def save_requirement(cur, body: dict, actor: str):
    rid = as_int(body.get("id"))
    parent_key, parent_val = PARENT_FIELD(body)
    if not rid and not parent_val:
        return None, "Не указан проект или инициатива"

    fields = {}
    for k in REQUIREMENT_FIELDS:
        if k not in body:
            continue
        if k in ("task_id", "milestone_id", "stage_id", "role_id", "budget_line_id", "cost_category_id"):
            fields[k] = as_int(body[k])
        elif k in ("period_start", "period_end", "need_by_date"):
            fields[k] = body[k] or None
        elif k in ("headcount", "required_load_pct", "estimated_monthly_cost"):
            fields[k] = as_num(body[k]) if body[k] not in (None, "") else None
        elif k == "funding_confirmed":
            fields[k] = bool(body[k])
        else:
            fields[k] = body.get(k)

    if not fields.get("role_id") and not fields.get("role_title"):
        return None, "Укажите роль из справочника или её название"

    # Расчётная дата начала поиска и оценка стоимости (не утверждённый бюджет)
    period_start = fields.get("period_start")
    period_end = fields.get("period_end")
    closing_method = fields.get("closing_method")
    if period_start:
        fields["search_start_date"] = compute_search_start_date(cur, period_start, closing_method)
    if fields.get("estimated_monthly_cost") and period_start and period_end:
        months = 1
        ps = period_start if not isinstance(period_start, str) else datetime.date.fromisoformat(period_start)
        pe = period_end if not isinstance(period_end, str) else datetime.date.fromisoformat(period_end)
        months = max(1, (pe.year - ps.year) * 12 + (pe.month - ps.month) + 1)
        load_ratio = float(fields.get("required_load_pct") or 100) / 100
        fields["estimated_total_cost"] = float(fields["estimated_monthly_cost"]) * load_ratio * months

    existing = fetch_one(cur, "exec_resource_requirement", rid) if rid else None

    if rid:
        sets = ", ".join(f"{k} = %s" for k in fields)
        cur.execute(
            f"UPDATE {SCHEMA}.exec_resource_requirement SET {sets}, updated_at = now() WHERE id = %s RETURNING id",
            (*fields.values(), rid),
        )
        new_id = cur.fetchone()[0]
        log_change(cur, actor, "resource_requirement", new_id, "update", changed_fields=diff_fields(existing, fields))
    else:
        fields[parent_key] = parent_val
        fields.setdefault("status", "draft")
        cols = ", ".join(fields.keys())
        ph = ", ".join(["%s"] * len(fields))
        cur.execute(
            f"INSERT INTO {SCHEMA}.exec_resource_requirement ({cols}, created_by) VALUES ({ph}, %s) RETURNING id",
            (*fields.values(), actor),
        )
        new_id = cur.fetchone()[0]
        log_change(cur, actor, "resource_requirement", new_id, "create", after=fields)
    return new_id, None


def archive_requirement(cur, rid, actor):
    cur.execute(
        f"UPDATE {SCHEMA}.exec_resource_requirement SET archived_at = now(), archived_by = %s "
        f"WHERE id = %s AND archived_at IS NULL RETURNING id",
        (actor, rid),
    )
    r = cur.fetchone()
    if r:
        log_change(cur, actor, "resource_requirement", rid, "archive")
    return r[0] if r else None


def resolve_requirement(cur, body: dict, actor: str):
    """Преобразует подтверждённую потребность в назначение: создаёт
    exec_resource_assignment, переносит плановую загрузку, сохраняет ссылку
    на исходную потребность и закрывает её (запись НЕ удаляется - история
    сохранена: когда возникла, какой срок был, кто назначен, была ли задержка)."""
    rid = as_int(body.get("requirement_id"))
    requirement = fetch_one(cur, "exec_resource_requirement", rid) if rid else None
    if not requirement:
        return None, "Ресурсная потребность не найдена"
    if requirement["status"] in ("closed", "cancelled"):
        return None, "Потребность уже закрыта или отменена"

    assignment_fields = {
        "person_id": as_int(body.get("person_id")),
        "role_id": requirement.get("role_id"),
        "role_title": requirement.get("role_title"),
        "project_role": body.get("project_role", "member"),
        "is_external": bool(body.get("is_external")),
        "is_vacant": False,
        "period_start": requirement.get("period_start"),
        "period_end": requirement.get("period_end"),
        "plan_load_pct": requirement.get("required_load_pct") or 100,
        "comment": f"Создано из ресурсной потребности #{rid}",
    }
    if requirement.get("project_id"):
        assignment_fields["project_id"] = requirement["project_id"]
    else:
        assignment_fields["initiative_id"] = requirement["initiative_id"]

    if not assignment_fields.get("person_id") and not body.get("is_external_contractor_name"):
        return None, "Укажите назначаемого сотрудника"

    cols = ", ".join(assignment_fields.keys())
    ph = ", ".join(["%s"] * len(assignment_fields))
    cur.execute(
        f"INSERT INTO {SCHEMA}.exec_resource_assignment ({cols}, created_by) VALUES ({ph}, %s) RETURNING id",
        (*assignment_fields.values(), actor),
    )
    assignment_id = cur.fetchone()[0]
    log_change(cur, actor, "resource_assignment", assignment_id, "create",
               after={**assignment_fields, "from_requirement_id": rid})

    is_overdue = bool(requirement.get("need_by_date")) and requirement["need_by_date"] < datetime.date.today()
    cur.execute(
        f"""UPDATE {SCHEMA}.exec_resource_requirement
            SET status = 'closed', resolved_assignment_id = %s, closed_at = now(), closed_by = %s, updated_at = now()
            WHERE id = %s""",
        (assignment_id, actor, rid),
    )
    log_change(cur, actor, "resource_requirement", rid, "resolve",
               after={"assignment_id": assignment_id, "was_overdue": is_overdue})
    return {"assignment_id": assignment_id, "requirement_id": rid, "was_overdue": is_overdue}, None


def requirement_dashboard(cur, include_test_data=False):
    """Показатели для дашборда руководителя: потребности по срочности поиска,
    просроченные, задачи/вехи без обеспеченного ресурса, потребности без
    финансирования, суммарная расчётная стоимость незакрытых."""
    tnd = "" if include_test_data else "AND r.is_test_data = false"
    open_statuses = "('draft','confirmed','searching','candidate_identified')"

    cur.execute(f"""
        SELECT r.id, r.role_title, rc.title AS role_title_ref, r.project_id, r.initiative_id,
               r.need_by_date, r.search_start_date, r.criticality, p.title AS project_title
        FROM {SCHEMA}.exec_resource_requirement r
        LEFT JOIN {SCHEMA}.exec_center_role rc ON rc.id = r.role_id
        LEFT JOIN {SCHEMA}.exec_project p ON p.id = r.project_id
        WHERE r.archived_at IS NULL {tnd} AND r.status IN {open_statuses}
          AND r.search_start_date IS NOT NULL AND r.search_start_date <= CURRENT_DATE
          AND (r.need_by_date IS NULL OR r.need_by_date >= CURRENT_DATE)
        ORDER BY r.need_by_date
    """)
    start_search_now = rows(cur)

    cur.execute(f"""
        SELECT r.id, r.role_title, rc.title AS role_title_ref, r.project_id, r.initiative_id,
               r.need_by_date, r.criticality, p.title AS project_title,
               (CURRENT_DATE - r.need_by_date) AS days_overdue
        FROM {SCHEMA}.exec_resource_requirement r
        LEFT JOIN {SCHEMA}.exec_center_role rc ON rc.id = r.role_id
        LEFT JOIN {SCHEMA}.exec_project p ON p.id = r.project_id
        WHERE r.archived_at IS NULL {tnd} AND r.status IN {open_statuses}
          AND r.need_by_date IS NOT NULL AND r.need_by_date < CURRENT_DATE
        ORDER BY r.need_by_date
    """)
    overdue = rows(cur)

    cur.execute(f"""
        SELECT r.id, r.role_title, rc.title AS role_title_ref, r.project_id, r.need_by_date, p.title AS project_title
        FROM {SCHEMA}.exec_resource_requirement r
        LEFT JOIN {SCHEMA}.exec_center_role rc ON rc.id = r.role_id
        LEFT JOIN {SCHEMA}.exec_project p ON p.id = r.project_id
        WHERE r.archived_at IS NULL {tnd} AND r.status IN {open_statuses}
          AND r.need_by_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '90 days'
        ORDER BY r.need_by_date
    """)
    upcoming_90 = rows(cur)

    cur.execute(f"""
        SELECT r.id, r.role_title, rc.title AS role_title_ref, r.estimated_total_cost, p.title AS project_title
        FROM {SCHEMA}.exec_resource_requirement r
        LEFT JOIN {SCHEMA}.exec_center_role rc ON rc.id = r.role_id
        LEFT JOIN {SCHEMA}.exec_project p ON p.id = r.project_id
        WHERE r.archived_at IS NULL {tnd} AND r.status IN {open_statuses} AND r.funding_confirmed = false
        ORDER BY r.estimated_total_cost DESC NULLS LAST
    """)
    without_funding = rows(cur)

    cur.execute(f"""
        SELECT COALESCE(SUM(estimated_total_cost), 0) FROM {SCHEMA}.exec_resource_requirement r
        WHERE r.archived_at IS NULL {tnd} AND r.status IN {open_statuses}
    """)
    total_unresolved_cost = float(cur.fetchone()[0] or 0)

    cur.execute(f"""
        SELECT t.id, t.title, t.project_id, t.due_at
        FROM {SCHEMA}.exec_task t
        WHERE t.archived_at IS NULL AND t.is_test_data = false AND t.status NOT IN ('done','cancelled')
          AND EXISTS (
            SELECT 1 FROM {SCHEMA}.exec_resource_requirement r
            WHERE r.task_id = t.id AND r.archived_at IS NULL {tnd} AND r.status IN {open_statuses}
          )
        ORDER BY (t.due_at IS NULL), t.due_at
    """)
    tasks_without_resource = rows(cur)

    return {
        "start_search_now": start_search_now, "overdue": overdue, "upcoming_90": upcoming_90,
        "without_funding": without_funding, "total_unresolved_cost": total_unresolved_cost,
        "tasks_without_resource": tasks_without_resource,
    }


# ============ РЕСУРСНАЯ ШКАЛА: КОНФЛИКТЫ (ТОЛЬКО ПРЕДУПРЕЖДЕНИЯ) ============

def resource_conflicts(cur, parent_kind: str, parent_id: int):
    """Выявление конфликтов ресурсов проекта/инициативы — это РАСЧЁТ-
    ПРЕДУПРЕЖДЕНИЕ для руководителя, не автоматическое кадровое решение:
    ничего не меняет, не переназначает, не закрывает. Каждый пункт —
    отдельная явная проверка по уже существующим таблицам, без дублирования
    данных в новые структуры.

    Проверяет:
      - overloaded_people: суммарная загрузка человека по ВСЕМ его активным
        назначениям (во всех проектах) превышает 100%;
      - overlapping_assignments: один человек назначен на пересекающиеся по
        датам назначения с суммарной загрузкой > 100% в период пересечения;
      - open_roles: незакрытые потребности (draft/confirmed/searching/
        candidate_identified) этого проекта/инициативы;
      - search_should_have_started: потребность, у которой search_start_date
        уже наступил, а поиск не переведён в статус searching/candidate;
      - unfunded_requirements: потребность без подтверждённого финансирования;
      - assignment_outside_period: назначение, чей период (period_start/end)
        не покрывает плановый период самого проекта — работа продолжается
        за пределами официального участия человека;
      - tasks_without_owner: задачи проекта без responsible_person_id.
    """
    parent_cond = f"a.{parent_kind}_id = %s"

    # --- Перегрузка: сумма плановой загрузки человека по ВСЕМ активным
    # назначениям (не только в этом проекте) — тот же расчёт, что и в
    # overload_check/team_load_summary, но со списком проектов-источников.
    cur.execute(f"""
        SELECT ap.person_id, p.display_name AS person_name,
               SUM(ap.plan_load_pct) AS total_load_pct,
               json_agg(json_build_object('project_id', ap.project_id, 'plan_load_pct', ap.plan_load_pct)) AS sources
        FROM {SCHEMA}.exec_resource_assignment ap
        JOIN {SCHEMA}.exec_person p ON p.id = ap.person_id
        WHERE ap.person_id IN (
            SELECT person_id FROM {SCHEMA}.exec_resource_assignment a
            WHERE {parent_cond} AND a.archived_at IS NULL AND a.is_test_data = false AND a.person_id IS NOT NULL
        ) AND ap.archived_at IS NULL AND ap.is_test_data = false
        GROUP BY ap.person_id, p.display_name
        HAVING SUM(ap.plan_load_pct) > 100
        ORDER BY total_load_pct DESC
    """, (parent_id,))
    overloaded_people = rows(cur)
    for r in overloaded_people:
        r["total_load_pct"] = float(r["total_load_pct"])

    # --- Пересечение периодов: два (или более) назначения ОДНОГО человека,
    # чьи периоды физически пересекаются во времени — независимо от общей
    # месячной суммы, это сигнал "работает на двух фронтах одновременно".
    cur.execute(f"""
        SELECT a1.person_id, p.display_name AS person_name,
               a1.id AS assignment_a, a1.project_id AS project_a, a1.period_start AS start_a, a1.period_end AS end_a,
               a2.id AS assignment_b, a2.project_id AS project_b, a2.period_start AS start_b, a2.period_end AS end_b
        FROM {SCHEMA}.exec_resource_assignment a1
        JOIN {SCHEMA}.exec_resource_assignment a2
            ON a1.person_id = a2.person_id AND a1.id < a2.id
            AND a1.archived_at IS NULL AND a2.archived_at IS NULL
            AND a1.is_test_data = false AND a2.is_test_data = false
            AND a1.period_start IS NOT NULL AND a1.period_end IS NOT NULL
            AND a2.period_start IS NOT NULL AND a2.period_end IS NOT NULL
            AND a1.period_start <= a2.period_end AND a2.period_start <= a1.period_end
        JOIN {SCHEMA}.exec_person p ON p.id = a1.person_id
        WHERE a1.person_id IN (
            SELECT person_id FROM {SCHEMA}.exec_resource_assignment a
            WHERE {parent_cond} AND a.archived_at IS NULL AND a.is_test_data = false AND a.person_id IS NOT NULL
        )
    """, (parent_id,))
    overlapping_assignments = rows(cur)

    # --- Незакрытые роли (потребности) этого проекта/инициативы.
    open_statuses = "('draft','confirmed','searching','candidate_identified')"
    cur.execute(f"""
        SELECT r.id, r.role_title, rc.title AS role_title_ref, r.status, r.criticality,
               r.need_by_date, r.search_start_date, r.funding_confirmed
        FROM {SCHEMA}.exec_resource_requirement r
        LEFT JOIN {SCHEMA}.exec_center_role rc ON rc.id = r.role_id
        WHERE r.{parent_kind}_id = %s AND r.archived_at IS NULL AND r.is_test_data = false
          AND r.status IN {open_statuses}
        ORDER BY (r.need_by_date IS NULL), r.need_by_date
    """, (parent_id,))
    open_roles = rows(cur)

    # --- Поиск должен был начаться (search_start_date уже прошёл), но
    # статус потребности всё ещё 'draft'/'confirmed' — поиск не запущен.
    search_should_have_started = [
        r for r in open_roles
        if r["search_start_date"] and r["status"] in ("draft", "confirmed")
    ]

    # --- Потребности без подтверждённого финансирования.
    unfunded_requirements = [r for r in open_roles if not r["funding_confirmed"]]

    # --- Назначение вне периода доступности: период назначения не покрывает
    # плановый период самого проекта (работа продолжается без назначения
    # или назначение выходит за рамки официального участия).
    cur.execute(f"""
        SELECT a.id AS assignment_id, a.person_id, p.display_name AS person_name,
               a.period_start, a.period_end, pr.plan_start AS project_plan_start, pr.plan_end AS project_plan_end
        FROM {SCHEMA}.exec_resource_assignment a
        LEFT JOIN {SCHEMA}.exec_person p ON p.id = a.person_id
        JOIN {SCHEMA}.exec_project pr ON pr.id = a.project_id
        WHERE a.project_id = %s AND a.archived_at IS NULL AND a.is_test_data = false
          AND a.period_start IS NOT NULL AND a.period_end IS NOT NULL
          AND pr.plan_start IS NOT NULL AND pr.plan_end IS NOT NULL
          AND (a.period_start > pr.plan_start OR a.period_end < pr.plan_end)
    """, (parent_id,)) if parent_kind == "project" else None
    assignment_outside_period = rows(cur) if parent_kind == "project" else []

    # --- Задачи проекта без ответственного.
    cur.execute(f"""
        SELECT t.id, t.title, t.status, t.due_at
        FROM {SCHEMA}.exec_task t
        WHERE t.project_id = %s AND t.archived_at IS NULL AND t.is_test_data = false
          AND t.responsible_person_id IS NULL AND t.status NOT IN ('done', 'cancelled')
        ORDER BY (t.due_at IS NULL), t.due_at
    """, (parent_id,)) if parent_kind == "project" else None
    tasks_without_owner = rows(cur) if parent_kind == "project" else []

    return {
        "overloaded_people": overloaded_people,
        "overlapping_assignments": overlapping_assignments,
        "open_roles": open_roles,
        "search_should_have_started": search_should_have_started,
        "unfunded_requirements": unfunded_requirements,
        "assignment_outside_period": assignment_outside_period,
        "tasks_without_owner": tasks_without_owner,
    }


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

        if action == "capacity_plan":
            if not parent_id:
                return cors({"ok": False, "error": {"message": "Не указан объект"}}, 400)
            year = as_int(qs.get("year")) or datetime.date.today().year
            return cors({"ok": True, "data": {"items": capacity_plan_year(cur, parent_kind, parent_id, year, itd), "year": year}})

        if action == "financial_timeline":
            if not parent_id:
                return cors({"ok": False, "error": {"message": "Не указан проект"}}, 400)
            year = as_int(qs.get("year")) or datetime.date.today().year
            return cors({"ok": True, "data": financial_timeline(cur, parent_id, year)})

        if action == "save_capacity_cell":
            cid, err = save_capacity_cell(cur, body, user["email"])
            if err:
                return cors({"ok": False, "error": {"message": err}}, 400)
            conn.commit()
            return cors({"ok": True, "data": {"id": cid}})

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

        if action == "expected":
            if not parent_id:
                return cors({"ok": False, "error": {"message": "Не указан объект"}}, 400)
            return cors({"ok": True, "data": {"items": list_expected(cur, parent_kind, parent_id, itd)}})

        if action == "save_expected":
            eid, err = save_expected(cur, body, user["email"])
            if err:
                return cors({"ok": False, "error": {"message": err}}, 400)
            conn.commit()
            return cors({"ok": True, "data": {"id": eid}})

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

        if action == "export_financial_xlsx":
            sid = as_int(qs.get("id"))
            snap = get_financial_snapshot(cur, sid) if sid else None
            if not snap:
                return cors({"ok": False, "error": {"message": "Снимок не найден"}}, 404)
            if not snap.get("integrity_ok", True):
                return cors({"ok": False, "error": {"message": "Целостность снимка нарушена — экспорт заблокирован"}}, 409)
            xlsx_b64 = export_financial_xlsx(snap)
            v = snap["payload"].get("version", {})
            filename = f"Бюджет {v.get('version_label', '')} {v.get('year', '')}.xlsx"
            return cors({"ok": True, "data": {"filename": filename, "content_base64": xlsx_b64}})

        if action == "requirements":
            if not parent_id:
                return cors({"ok": False, "error": {"message": "Не указан объект"}}, 400)
            return cors({"ok": True, "data": {"items": list_requirements(
                cur, parent_kind, parent_id, qs.get("include_archived") == "1", itd)}})

        if action == "save_requirement":
            rid, err = save_requirement(cur, body, user["email"])
            if err:
                return cors({"ok": False, "error": {"message": err}}, 400)
            conn.commit()
            return cors({"ok": True, "data": {"id": rid}})

        if action == "archive_requirement":
            rid = archive_requirement(cur, as_int(body.get("id")), user["email"])
            conn.commit()
            if not rid:
                return cors({"ok": False, "error": {"message": "Не найдено или уже архивировано"}}, 404)
            return cors({"ok": True, "data": {"id": rid}})

        if action == "resolve_requirement":
            result, err = resolve_requirement(cur, body, user["email"])
            if err:
                return cors({"ok": False, "error": {"message": err}}, 400)
            conn.commit()
            return cors({"ok": True, "data": result})

        if action == "requirement_dashboard":
            return cors({"ok": True, "data": requirement_dashboard(cur, itd)})

        if action == "resource_conflicts":
            if not parent_id:
                return cors({"ok": False, "error": {"message": "Не указан объект"}}, 400)
            return cors({"ok": True, "data": resource_conflicts(cur, parent_kind, parent_id)})

        if action == "hiring_lead_times":
            cur.execute(f"SELECT * FROM {SCHEMA}.exec_hiring_lead_time ORDER BY lead_time_days")
            return cors({"ok": True, "data": {"items": rows(cur)}})

        return cors({"ok": False, "error": {"message": "Неизвестное действие"}}, 400)
    finally:
        conn.close()