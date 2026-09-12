"""
Поручения и портфель: проекты/мероприятия, задачи, результаты, эффекты,
универсальные связи (exec_link) и сводный дашборд руководителя.

Не дублирует существующие модули:
- поручения (exec_action), риски, проблемы, вехи, решения — уже есть в exec-control;
- инициативы — уже есть в exec-cabinet;
- этот модуль добавляет недостающий уровень (проекты, задачи, результаты, эффекты)
  и связывает всё через гибкую M2M exec_link, а не жёсткую цепочку.

Архивирование вместо физического удаления. История значимых изменений — в
общем exec_audit_log (та же таблица, что использует exec-control/exec-cabinet).
Снимки отчётов (exec_report_snapshot) неизменяемы: UPDATE payload_json запрещён
на уровне этого backend (см. update_snapshot ниже — action отсутствует намеренно).

AI не используется нигде в этом модуле.
"""
import json
import os
import hashlib
import psycopg2

DB = os.environ["DATABASE_URL"]
_s = os.environ.get("MAIN_DB_SCHEMA", "").strip()
SCHEMA = _s if _s else "t_p61016064_digital_innovation_i"

# Допустимые типы объектов для exec_link и история изменений.
# Отображение технического kind -> (таблица, поле заголовка) для проверки существования.
LINKABLE = {
    "action": ("exec_action", "title"),
    "initiative": ("exec_initiative", "title"),
    "project": ("exec_project", "title"),
    "task": ("exec_task", "title"),
    "milestone": ("exec_milestone", "title"),
    "result": ("exec_result", "title"),
    "effect": ("exec_effect", "title"),
    "risk": ("exec_risk", "description"),
    "issue": ("exec_issue", "title"),
    "decision": ("exec_decision_instance", "question"),
    "doc_source": ("doc_source", "title"),
    "goal": ("exec_center_goal", "title"),
    "indicator": ("exec_indicator", "title"),
    "center_function": ("exec_center_function", "title"),
}

LINK_TYPE_LABEL = {
    "related": "связано с",
    "implements": "реализует",
    "blocks": "блокирует",
    "depends_on": "зависит от",
    "supports": "подтверждает",
}


def cors(body: dict, code: int = 200) -> dict:
    return {
        "statusCode": code,
        "headers": {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
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
    token = headers.get("x-admin-token") or headers.get("X-Admin-Token", "")
    email = get_admin(conn, token)
    if email:
        return {"email": email, "role": "head"}
    sid = headers.get("x-session-id") or headers.get("X-Session-Id", "")
    return get_cabinet_user(conn, sid)


def rows(cur):
    cols = [d[0] for d in cur.description]
    return [dict(zip(cols, r)) for r in cur.fetchall()]


def as_int(v):
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


def log_change(cur, actor, entity, eid, action, before=None, after=None, changed_fields=None):
    """История значимых изменений в общем exec_audit_log. Одна учётная запись —
    достаточно фиксировать актора/время/объект/изменённые поля, без полного
    снимка чувствительного текста."""
    payload = {"changed_fields": changed_fields} if changed_fields else after
    cur.execute(
        f"INSERT INTO {SCHEMA}.exec_audit_log (entity_type, entity_id, action, actor, before_json, after_json) "
        f"VALUES (%s,%s,%s,%s,%s,%s)",
        (entity, eid, action, actor,
         json.dumps(before, ensure_ascii=False, default=str) if before else None,
         json.dumps(payload, ensure_ascii=False, default=str) if payload else None),
    )


def diff_fields(existing: dict, new: dict) -> list:
    if not existing:
        return list(new.keys())
    return [k for k, v in new.items() if str(existing.get(k)) != str(v)]


def fetch_one(cur, table, eid):
    cur.execute(f"SELECT * FROM {SCHEMA}.{table} WHERE id = %s", (eid,))
    r = rows(cur)
    return r[0] if r else None


# ============ ПРОЕКТЫ ============

def list_projects(cur, include_archived=False, include_test_data=False):
    conds = [] if include_archived else ["p.archived_at IS NULL"]
    if not include_test_data:
        conds.append("p.is_test_data = false")
    where = ("WHERE " + " AND ".join(conds)) if conds else ""
    cur.execute(f"""
        SELECT p.*, ei.title AS initiative_title,
            (SELECT count(*) FROM {SCHEMA}.exec_task t WHERE t.project_id = p.id AND t.archived_at IS NULL) AS task_count,
            (SELECT count(*) FROM {SCHEMA}.exec_task t WHERE t.project_id = p.id AND t.archived_at IS NULL
                AND t.status NOT IN ('done','cancelled')
                AND t.due_at IS NOT NULL AND t.due_at < CURRENT_DATE) AS overdue_task_count
        FROM {SCHEMA}.exec_project p
        LEFT JOIN {SCHEMA}.exec_initiative ei ON ei.id = p.initiative_id
        {where}
        ORDER BY p.updated_at DESC
    """)
    return rows(cur)


def get_project(cur, pid):
    p = fetch_one(cur, "exec_project", pid)
    if not p:
        return None
    cur.execute(f"SELECT * FROM {SCHEMA}.exec_project_stage WHERE project_id = %s ORDER BY sort_order, id", (pid,))
    p["stages"] = rows(cur)
    cur.execute(f"SELECT * FROM {SCHEMA}.exec_task WHERE project_id = %s AND archived_at IS NULL ORDER BY (due_at IS NULL), due_at", (pid,))
    p["tasks"] = rows(cur)
    cur.execute(f"SELECT * FROM {SCHEMA}.exec_milestone WHERE project_id = %s ORDER BY plan_date", (pid,))
    p["milestones"] = rows(cur)
    cur.execute(f"SELECT * FROM {SCHEMA}.exec_result WHERE project_id = %s AND archived_at IS NULL ORDER BY updated_at DESC", (pid,))
    p["results"] = rows(cur)
    cur.execute(f"SELECT * FROM {SCHEMA}.exec_risk WHERE project_id = %s ORDER BY probability * impact DESC", (pid,))
    p["risks"] = rows(cur)
    cur.execute(f"SELECT * FROM {SCHEMA}.exec_issue WHERE project_id = %s ORDER BY updated_at DESC", (pid,))
    p["issues"] = rows(cur)
    p["links"] = list_links(cur, "project", pid)
    return p


PROJECT_FIELDS = ["title", "project_kind", "description", "goal", "customer_person_id",
    "result_owner_person_id", "manager_person_id", "coordinator_person_id",
    "initiative_id", "status", "priority", "progress_pct",
    "plan_start", "plan_end", "fact_start", "fact_end"]


def save_project(cur, body: dict, actor: str):
    pid = as_int(body.get("id"))
    fields = {k: (as_int(body[k]) if k.endswith("_id") else (body[k] or None if k in
              ("plan_start", "plan_end", "fact_start", "fact_end") else body.get(k)))
              for k in PROJECT_FIELDS if k in body}
    if "progress_pct" in fields:
        fields["progress_pct"] = as_int(fields["progress_pct"]) or 0
    existing = fetch_one(cur, "exec_project", pid) if pid else None

    if pid:
        sets = ", ".join(f"{k} = %s" for k in fields)
        cur.execute(
            f"UPDATE {SCHEMA}.exec_project SET {sets}, updated_at = now() WHERE id = %s RETURNING id",
            (*fields.values(), pid),
        )
        changed = diff_fields(existing, fields)
        new_id = cur.fetchone()[0]
        log_change(cur, actor, "project", new_id, "update", changed_fields=changed)
    else:
        fields.setdefault("status", "idea")
        fields.setdefault("priority", "normal")
        fields.setdefault("progress_pct", 0)
        cols = ", ".join(fields.keys())
        ph = ", ".join(["%s"] * len(fields))
        cur.execute(
            f"INSERT INTO {SCHEMA}.exec_project ({cols}, created_by) VALUES ({ph}, %s) RETURNING id",
            (*fields.values(), actor),
        )
        new_id = cur.fetchone()[0]
        log_change(cur, actor, "project", new_id, "create", after=fields)
    return new_id


def archive_project(cur, pid, actor):
    cur.execute(
        f"UPDATE {SCHEMA}.exec_project SET archived_at = now(), archived_by = %s WHERE id = %s AND archived_at IS NULL RETURNING id",
        (actor, pid),
    )
    r = cur.fetchone()
    if r:
        log_change(cur, actor, "project", pid, "archive")
    return r[0] if r else None


# ============ ЗАДАЧИ ============

def list_tasks(cur, project_id=None, include_archived=False, include_test_data=False):
    conds = [] if include_archived else ["t.archived_at IS NULL"]
    if not include_test_data:
        conds.append("t.is_test_data = false")
    params = []
    if project_id:
        conds.append("t.project_id = %s")
        params.append(project_id)
    where = ("WHERE " + " AND ".join(conds)) if conds else ""
    cur.execute(f"""
        SELECT t.*, p.title AS project_title, pr.email AS responsible_email,
            (t.due_at IS NOT NULL AND t.due_at < CURRENT_DATE
                AND t.status NOT IN ('done','cancelled')) AS is_overdue
        FROM {SCHEMA}.exec_task t
        LEFT JOIN {SCHEMA}.exec_project p ON p.id = t.project_id
        LEFT JOIN {SCHEMA}.exec_person pr ON pr.id = t.responsible_person_id
        {where}
        ORDER BY (t.due_at IS NULL), t.due_at, t.priority DESC
    """, params)
    return rows(cur)


TASK_FIELDS = ["title", "description", "project_id", "stage_id", "milestone_id", "action_id",
    "responsible_person_id", "due_at", "priority", "status", "progress_pct",
    "expected_result", "actual_result", "delay_reason", "blocker", "fact_date",
    "result_confirmed_by_person_id"]


def save_task(cur, body: dict, actor: str):
    tid = as_int(body.get("id"))
    fields = {}
    for k in TASK_FIELDS:
        if k not in body:
            continue
        if k in ("project_id", "stage_id", "milestone_id", "action_id",
                  "responsible_person_id", "result_confirmed_by_person_id"):
            fields[k] = as_int(body[k])
        elif k in ("due_at", "fact_date"):
            fields[k] = body[k] or None
        elif k == "progress_pct":
            fields[k] = as_int(body[k]) or 0
        else:
            fields[k] = body.get(k)

    existing = fetch_one(cur, "exec_task", tid) if tid else None

    if tid:
        sets = ", ".join(f"{k} = %s" for k in fields)
        cur.execute(
            f"UPDATE {SCHEMA}.exec_task SET {sets}, updated_at = now() WHERE id = %s RETURNING id",
            (*fields.values(), tid),
        )
        new_id = cur.fetchone()[0]
        log_change(cur, actor, "task", new_id, "update", changed_fields=diff_fields(existing, fields))
    else:
        fields.setdefault("status", "not_started")
        fields.setdefault("priority", "normal")
        fields.setdefault("progress_pct", 0)
        cols = ", ".join(fields.keys())
        ph = ", ".join(["%s"] * len(fields))
        cur.execute(
            f"INSERT INTO {SCHEMA}.exec_task ({cols}, created_by) VALUES ({ph}, %s) RETURNING id",
            (*fields.values(), actor),
        )
        new_id = cur.fetchone()[0]
        log_change(cur, actor, "task", new_id, "create", after=fields)
    return new_id


def archive_task(cur, tid, actor):
    cur.execute(
        f"UPDATE {SCHEMA}.exec_task SET archived_at = now(), archived_by = %s WHERE id = %s AND archived_at IS NULL RETURNING id",
        (actor, tid),
    )
    r = cur.fetchone()
    if r:
        log_change(cur, actor, "task", tid, "archive")
    return r[0] if r else None


# ============ РЕЗУЛЬТАТЫ И ЭФФЕКТЫ ============

def list_results(cur, project_id=None, include_archived=False, include_test_data=False):
    conds = [] if include_archived else ["r.archived_at IS NULL"]
    if not include_test_data:
        conds.append("r.is_test_data = false")
    params = []
    if project_id:
        conds.append("r.project_id = %s")
        params.append(project_id)
    where = ("WHERE " + " AND ".join(conds)) if conds else ""
    cur.execute(f"""
        SELECT r.*, p.title AS project_title,
            (SELECT count(*) FROM {SCHEMA}.exec_effect e WHERE e.result_id = r.id AND e.archived_at IS NULL) AS effect_count
        FROM {SCHEMA}.exec_result r
        LEFT JOIN {SCHEMA}.exec_project p ON p.id = r.project_id
        {where}
        ORDER BY r.updated_at DESC
    """, params)
    return rows(cur)


RESULT_FIELDS = ["title", "result_kind", "description", "project_id", "initiative_id",
    "owner_person_id", "achieved_at", "document_source_id"]


def save_result(cur, body: dict, actor: str):
    rid = as_int(body.get("id"))
    fields = {}
    for k in RESULT_FIELDS:
        if k not in body:
            continue
        if k in ("project_id", "initiative_id", "owner_person_id", "document_source_id"):
            fields[k] = as_int(body[k])
        elif k == "achieved_at":
            fields[k] = body[k] or None
        else:
            fields[k] = body.get(k)

    existing = fetch_one(cur, "exec_result", rid) if rid else None
    if rid:
        sets = ", ".join(f"{k} = %s" for k in fields)
        cur.execute(
            f"UPDATE {SCHEMA}.exec_result SET {sets}, updated_at = now() WHERE id = %s RETURNING id",
            (*fields.values(), rid),
        )
        new_id = cur.fetchone()[0]
        log_change(cur, actor, "result", new_id, "update", changed_fields=diff_fields(existing, fields))
    else:
        fields.setdefault("result_kind", "other")
        cols = ", ".join(fields.keys())
        ph = ", ".join(["%s"] * len(fields))
        cur.execute(
            f"INSERT INTO {SCHEMA}.exec_result ({cols}, created_by) VALUES ({ph}, %s) RETURNING id",
            (*fields.values(), actor),
        )
        new_id = cur.fetchone()[0]
        log_change(cur, actor, "result", new_id, "create", after=fields)
    return new_id


def archive_result(cur, rid, actor):
    cur.execute(
        f"UPDATE {SCHEMA}.exec_result SET archived_at = now() WHERE id = %s AND archived_at IS NULL RETURNING id",
        (rid,),
    )
    r = cur.fetchone()
    if r:
        log_change(cur, actor, "result", rid, "archive")
    return r[0] if r else None


def list_effects(cur, result_id=None, include_archived=False, include_test_data=False):
    conds = [] if include_archived else ["e.archived_at IS NULL"]
    if not include_test_data:
        conds.append("e.is_test_data = false")
    params = []
    if result_id:
        conds.append("e.result_id = %s")
        params.append(result_id)
    where = ("WHERE " + " AND ".join(conds)) if conds else ""
    cur.execute(f"""
        SELECT e.*, r.title AS result_title
        FROM {SCHEMA}.exec_effect e
        LEFT JOIN {SCHEMA}.exec_result r ON r.id = e.result_id
        {where}
        ORDER BY e.updated_at DESC
    """, params)
    return rows(cur)


EFFECT_FIELDS = ["title", "result_id", "project_id", "initiative_id", "metric", "unit",
    "baseline_value", "plan_value", "actual_value", "measured_at", "calculation_method",
    "data_source", "owner_person_id", "confirmed_by_person_id", "confirmation_status"]


def save_effect(cur, body: dict, actor: str):
    eid = as_int(body.get("id"))
    fields = {}
    for k in EFFECT_FIELDS:
        if k not in body:
            continue
        if k in ("result_id", "project_id", "initiative_id", "owner_person_id", "confirmed_by_person_id"):
            fields[k] = as_int(body[k])
        elif k == "measured_at":
            fields[k] = body[k] or None
        else:
            fields[k] = body.get(k)

    # Не рассчитывать факт автоматически, если методика не задана.
    if fields.get("actual_value") and not fields.get("calculation_method") and not (
        fetch_one(cur, "exec_effect", eid) or {}
    ).get("calculation_method"):
        return None, "Укажите методику расчёта перед фиксацией фактического значения эффекта"

    existing = fetch_one(cur, "exec_effect", eid) if eid else None
    if eid:
        sets = ", ".join(f"{k} = %s" for k in fields)
        cur.execute(
            f"UPDATE {SCHEMA}.exec_effect SET {sets}, updated_at = now() WHERE id = %s RETURNING id",
            (*fields.values(), eid),
        )
        new_id = cur.fetchone()[0]
        log_change(cur, actor, "effect", new_id, "update", changed_fields=diff_fields(existing, fields))
    else:
        fields.setdefault("confirmation_status", "not_confirmed")
        cols = ", ".join(fields.keys())
        ph = ", ".join(["%s"] * len(fields))
        cur.execute(
            f"INSERT INTO {SCHEMA}.exec_effect ({cols}, created_by) VALUES ({ph}, %s) RETURNING id",
            (*fields.values(), actor),
        )
        new_id = cur.fetchone()[0]
        log_change(cur, actor, "effect", new_id, "create", after=fields)
    return new_id, None


def archive_effect(cur, eid, actor):
    cur.execute(
        f"UPDATE {SCHEMA}.exec_effect SET archived_at = now() WHERE id = %s AND archived_at IS NULL RETURNING id",
        (eid,),
    )
    r = cur.fetchone()
    if r:
        log_change(cur, actor, "effect", eid, "archive")
    return r[0] if r else None


# ============ УНИВЕРСАЛЬНЫЕ СВЯЗИ (с серверной валидацией) ============

def save_link(cur, body: dict, actor: str):
    link_type = body.get("link_type", "related")
    src_kind, src_id = body.get("src_kind"), as_int(body.get("src_id"))
    tgt_kind, tgt_id = body.get("tgt_kind"), as_int(body.get("tgt_id"))

    if src_kind not in LINKABLE or tgt_kind not in LINKABLE:
        return None, "Недопустимый тип объекта для связи"
    if not src_id or not tgt_id:
        return None, "Не указан один из объектов связи"
    if src_kind == tgt_kind and src_id == tgt_id:
        return None, "Нельзя связать объект с самим собой"

    src_table, _ = LINKABLE[src_kind]
    tgt_table, _ = LINKABLE[tgt_kind]
    if not fetch_one(cur, src_table, src_id):
        return None, f"Исходный объект ({src_kind} #{src_id}) не найден"
    if not fetch_one(cur, tgt_table, tgt_id):
        return None, f"Целевой объект ({tgt_kind} #{tgt_id}) не найден"

    cur.execute(f"""
        SELECT id FROM {SCHEMA}.exec_link
        WHERE link_type = %s AND src_kind = %s AND src_id = %s
          AND tgt_kind = %s AND tgt_id = %s AND archived_at IS NULL
    """, (link_type, src_kind, src_id, tgt_kind, tgt_id))
    if cur.fetchone():
        return None, "Такая связь уже существует"

    cur.execute(
        f"""INSERT INTO {SCHEMA}.exec_link (link_type, src_kind, src_id, tgt_kind, tgt_id, note, created_by)
            VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id""",
        (link_type, src_kind, src_id, tgt_kind, tgt_id, body.get("note"), actor),
    )
    lid = cur.fetchone()[0]
    log_change(cur, actor, "link", lid, "create", after={"link_type": link_type,
               "src": f"{src_kind}#{src_id}", "tgt": f"{tgt_kind}#{tgt_id}"})
    return lid, None


def archive_link(cur, lid, actor):
    cur.execute(
        f"UPDATE {SCHEMA}.exec_link SET archived_at = now() WHERE id = %s AND archived_at IS NULL RETURNING id",
        (lid,),
    )
    r = cur.fetchone()
    if r:
        log_change(cur, actor, "link", lid, "archive")
    return r[0] if r else None


def list_links(cur, kind: str, oid: int):
    cur.execute(f"""
        SELECT * FROM {SCHEMA}.exec_link
        WHERE ((src_kind = %s AND src_id = %s) OR (tgt_kind = %s AND tgt_id = %s))
          AND archived_at IS NULL
        ORDER BY created_at DESC
    """, (kind, oid, kind, oid))
    links = rows(cur)
    # Дополняем человекочитаемым заголовком противоположного объекта
    for l in links:
        other_kind = l["tgt_kind"] if l["src_kind"] == kind and l["src_id"] == oid else l["src_kind"]
        other_id = l["tgt_id"] if l["src_kind"] == kind and l["src_id"] == oid else l["src_id"]
        table, title_field = LINKABLE.get(other_kind, (None, None))
        l["other_kind"] = other_kind
        l["other_id"] = other_id
        l["link_type_label"] = LINK_TYPE_LABEL.get(l["link_type"], l["link_type"])
        if table:
            obj = fetch_one(cur, table, other_id)
            l["other_title"] = obj.get(title_field) if obj else None
        else:
            l["other_title"] = None
    return links


# ============ ИСТОРИЯ ИЗМЕНЕНИЙ ============

def object_history(cur, kind: str, oid: int):
    cur.execute(f"""
        SELECT id, entity_type, entity_id, action, actor, after_json, created_at
        FROM {SCHEMA}.exec_audit_log
        WHERE entity_type = %s AND entity_id = %s
        ORDER BY created_at DESC LIMIT 100
    """, (kind, oid))
    return rows(cur)


# ============ ДАШБОРД ============

def dashboard(cur):
    cur.execute(f"""
        SELECT id, title, status, priority, due_at, is_on_control
        FROM {SCHEMA}.exec_action
        WHERE COALESCE(is_test_data, false) = false
          AND status NOT IN ('done_by_executor','accepted_by_head','cancelled','done')
          AND due_at IS NOT NULL AND due_at < CURRENT_DATE
        ORDER BY due_at
    """)
    overdue_actions = rows(cur)

    cur.execute(f"""
        SELECT id, title, status, priority, due_at
        FROM {SCHEMA}.exec_action
        WHERE COALESCE(is_test_data, false) = false
          AND status NOT IN ('done_by_executor','accepted_by_head','cancelled','done')
          AND due_at IS NOT NULL AND due_at BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
        ORDER BY due_at
    """)
    upcoming_actions = rows(cur)

    cur.execute(f"""
        SELECT id, title, status, priority, project_id, due_at,
            (due_at IS NOT NULL AND due_at < CURRENT_DATE) AS is_overdue
        FROM {SCHEMA}.exec_task
        WHERE archived_at IS NULL AND is_test_data = false AND status NOT IN ('done','cancelled')
          AND due_at IS NOT NULL AND due_at < CURRENT_DATE
        ORDER BY due_at
    """)
    overdue_tasks = rows(cur)

    cur.execute(f"""
        SELECT id, title, plan_date, status, initiative_id, project_id
        FROM {SCHEMA}.exec_milestone
        WHERE COALESCE(is_test_data, false) = false AND status NOT IN ('achieved','cancelled')
          AND plan_date IS NOT NULL AND plan_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
        ORDER BY plan_date
    """)
    upcoming_milestones = rows(cur)

    cur.execute(f"""
        SELECT status, count(*) AS cnt FROM {SCHEMA}.exec_project
        WHERE archived_at IS NULL AND is_test_data = false GROUP BY status
    """)
    projects_by_status = rows(cur)

    cur.execute(f"""
        SELECT id, question, status, due_at FROM {SCHEMA}.exec_decision_instance
        WHERE status IN ('raised','in_progress') ORDER BY due_at NULLS LAST LIMIT 20
    """)
    pending_decisions = rows(cur)

    cur.execute(f"""
        SELECT id, description, probability, impact, probability * impact AS risk_score, status
        FROM {SCHEMA}.exec_risk
        WHERE status = 'active' ORDER BY probability * impact DESC LIMIT 10
    """)
    top_risks = rows(cur)

    cur.execute(f"""
        SELECT id, title, achieved_at, result_kind FROM {SCHEMA}.exec_result
        WHERE archived_at IS NULL AND is_test_data = false
        ORDER BY achieved_at DESC NULLS LAST, updated_at DESC LIMIT 10
    """)
    recent_results = rows(cur)

    return {
        "overdue_actions": overdue_actions,
        "upcoming_actions": upcoming_actions,
        "overdue_tasks": overdue_tasks,
        "upcoming_milestones": upcoming_milestones,
        "projects_by_status": projects_by_status,
        "pending_decisions": pending_decisions,
        "top_risks": top_risks,
        "recent_results": recent_results,
    }


def create_snapshot(cur, body: dict, actor: str):
    """Неизменяемый снимок отчёта. У этого backend НЕТ action для редактирования
    или удаления существующего снимка — только создание новой версии.

    ВАЖНО (честная граница гарантии): неизменяемость обеспечивается ТОЛЬКО при
    работе через этот backend. Полноценный BEFORE UPDATE триггер на уровне БД
    недоступен в этой среде (CREATE FUNCTION запрещён платформой). Пользователь
    или сервис с прямым правом UPDATE в БД технически может изменить снимок.
    Чтобы такое изменение было обнаружимо, при создании считается SHA-256 от
    payload_json и сохраняется отдельно; get_snapshot всегда пересчитывает хеш
    и сравнивает с сохранённым — расхождение возвращается явным полем
    integrity_ok=false, а не тихо."""
    payload = dashboard(cur)
    payload_str = json.dumps(payload, ensure_ascii=False, default=str)
    payload_hash = hashlib.sha256(payload_str.encode("utf-8")).hexdigest()
    cur.execute(
        f"""INSERT INTO {SCHEMA}.exec_report_snapshot
            (title, report_kind, period_from, period_to, payload_json, payload_sha256, created_by, is_test_data)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s) RETURNING id, created_at""",
        (body.get("title", "Справка руководителю"), body.get("report_kind", "portfolio_summary"),
         body.get("period_from") or None, body.get("period_to") or None,
         payload_str, payload_hash, actor, bool(body.get("is_test_data"))),
    )
    row = cur.fetchone()
    log_change(cur, actor, "snapshot", row[0], "create", after={"payload_sha256": payload_hash})
    return {"id": row[0], "created_at": row[1], "payload_sha256": payload_hash}


def list_snapshots(cur, include_test_data=False):
    where = "" if include_test_data else "WHERE is_test_data = false"
    cur.execute(f"""
        SELECT id, title, report_kind, period_from, period_to, created_by, created_at, is_test_data
        FROM {SCHEMA}.exec_report_snapshot {where} ORDER BY created_at DESC LIMIT 50
    """)
    return rows(cur)


def get_snapshot(cur, sid: int):
    cur.execute(f"SELECT * FROM {SCHEMA}.exec_report_snapshot WHERE id = %s", (sid,))
    r = rows(cur)
    if not r:
        return None
    item = r[0]
    payload_str = item.pop("payload_json")
    stored_hash = item.get("payload_sha256")
    actual_hash = hashlib.sha256(payload_str.encode("utf-8")).hexdigest()
    item["payload"] = json.loads(payload_str)
    item["integrity_ok"] = (stored_hash is None) or (stored_hash == actual_hash)
    return item


# ============================================================
# ДОРОЖНАЯ КАРТА И ШКАЛА ВЕХ (Фаза 1) + ЗАВИСИМОСТИ И BASELINE (Фаза 3)
#
# Roadmap читает существующие exec_project/exec_project_stage/exec_milestone
# с серверной фильтрацией по диапазону дат — не отдаёт весь портфель разом.
# Зависимости и baseline — новые служебные таблицы exec_schedule_dependency/
# exec_schedule_baseline, без дублирования уже существующих plan_*/fact_*
# полей на проектах/задачах/вехах.
# ============================================================

DEPENDENCY_KINDS = ("task", "milestone", "project", "stage")
DEPENDENCY_KIND_TABLE = {
    "task": "exec_task", "milestone": "exec_milestone",
    "project": "exec_project", "stage": "exec_project_stage",
}
DEPENDENCY_TYPES = ("FS", "SS", "FF", "SF")


def roadmap_data(cur, date_from, date_to, filters: dict):
    """Дорожная карта портфеля: инициативы → проекты, с этапами и вехами
    внутри. Диапазон дат обязателен для ограничения объёма — на масштабе
    «год» вехи агрегируются по месяцам на фронте, а не здесь (сырые даты
    отдаются, агрегация — вопрос отрисовки)."""
    conds = ["p.archived_at IS NULL", "p.is_test_data = false"]
    params = []

    # Проект попадает в диапазон, если его период пересекается с [date_from, date_to]
    if date_from and date_to:
        conds.append("(p.plan_start IS NULL OR p.plan_start <= %s) AND (p.plan_end IS NULL OR p.plan_end >= %s)")
        params += [date_to, date_from]

    if filters.get("initiative_id"):
        conds.append("p.initiative_id = %s")
        params.append(filters["initiative_id"])
    if filters.get("project_kind"):
        conds.append("p.project_kind = %s")
        params.append(filters["project_kind"])
    if filters.get("status"):
        conds.append("p.status = %s")
        params.append(filters["status"])
    if filters.get("priority"):
        conds.append("p.priority = %s")
        params.append(filters["priority"])
    if filters.get("owner_person_id"):
        conds.append("(p.manager_person_id = %s OR p.result_owner_person_id = %s)")
        params += [filters["owner_person_id"], filters["owner_person_id"]]
    if filters.get("overdue_only"):
        conds.append("p.plan_end IS NOT NULL AND p.plan_end < CURRENT_DATE AND p.status NOT IN ('completed','cancelled')")

    where = "WHERE " + " AND ".join(conds)
    cur.execute(f"""
        SELECT p.id, p.title, p.project_kind, p.status, p.priority, p.progress_pct,
               p.initiative_id, ei.title AS initiative_title,
               p.plan_start, p.plan_end, p.fact_start, p.fact_end, p.forecast_end,
               p.manager_person_id, mp.display_name AS manager_name,
               (p.plan_end IS NOT NULL AND p.plan_end < CURRENT_DATE
                   AND p.status NOT IN ('completed','cancelled')) AS is_overdue,
               (SELECT count(*) FROM {SCHEMA}.exec_risk r
                 WHERE r.project_id = p.id AND r.status = 'active' AND r.probability * r.impact >= 15) AS critical_risk_count,
               (SELECT count(*) FROM {SCHEMA}.exec_issue i
                 WHERE i.project_id = p.id AND i.status IN ('open','in_progress')) AS open_issue_count,
               (SELECT count(*) FROM {SCHEMA}.exec_resource_requirement rr
                 WHERE rr.project_id = p.id AND rr.status NOT IN ('closed','cancelled')) AS resource_gap_count
        FROM {SCHEMA}.exec_project p
        LEFT JOIN {SCHEMA}.exec_initiative ei ON ei.id = p.initiative_id
        LEFT JOIN {SCHEMA}.exec_person mp ON mp.id = p.manager_person_id
        {where}
        ORDER BY ei.title NULLS LAST, p.plan_start NULLS LAST
    """, params)
    projects = rows(cur)
    if not projects:
        return {"initiatives": [], "projects": []}

    project_ids = [p["id"] for p in projects]
    cur.execute(f"""
        SELECT * FROM {SCHEMA}.exec_project_stage WHERE project_id = ANY(%s) ORDER BY project_id, sort_order, id
    """, (project_ids,))
    stages_by_project: dict = {}
    for s in rows(cur):
        stages_by_project.setdefault(s["project_id"], []).append(s)

    cur.execute(f"""
        SELECT id, title, project_id, initiative_id, plan_date_original, plan_date, fact_date,
               status, milestone_type, responsible_person_id, reschedule_count
        FROM {SCHEMA}.exec_milestone
        WHERE project_id = ANY(%s) AND is_test_data = false
        ORDER BY project_id, plan_date
    """, (project_ids,))
    milestones_by_project: dict = {}
    for m in rows(cur):
        milestones_by_project.setdefault(m["project_id"], []).append(m)

    # Прогнозируемый перерасход: активная версия бюджета проекта, у которой
    # план по строкам меньше уже свершившегося факта.
    cur.execute(f"""
        SELECT p.id FROM {SCHEMA}.exec_project p
        WHERE p.id = ANY(%s) AND p.archived_at IS NULL
          AND EXISTS (
            SELECT 1 FROM {SCHEMA}.exec_budget_version v
            WHERE v.project_id = p.id AND v.is_active = true
              AND (SELECT COALESCE(SUM(l.amount_plan),0) FROM {SCHEMA}.exec_budget_line l WHERE l.version_id = v.id)
                  < (SELECT COALESCE(SUM(a.amount),0) FROM {SCHEMA}.exec_financial_actual a WHERE a.project_id = p.id)
          )
    """, (project_ids,))
    budget_overrun_ids = {r["id"] for r in rows(cur)}

    for p in projects:
        p["stages"] = stages_by_project.get(p["id"], [])
        p["milestones"] = milestones_by_project.get(p["id"], [])
        p["is_overbudget"] = p["id"] in budget_overrun_ids

    if filters.get("overbudget_only"):
        projects = [p for p in projects if p["is_overbudget"]]
    if filters.get("critical_risk_only"):
        projects = [p for p in projects if p["critical_risk_count"] > 0]
    if filters.get("resource_gap_only"):
        projects = [p for p in projects if p["resource_gap_count"] > 0]
    if filters.get("overdue_only"):
        projects = [p for p in projects if p["is_overdue"]]

    initiatives_map = {}
    for p in projects:
        iid = p["initiative_id"] or 0
        if iid not in initiatives_map:
            initiatives_map[iid] = {"id": p["initiative_id"], "title": p["initiative_title"] or "Без инициативы", "projects": []}
        initiatives_map[iid]["projects"].append(p)

    return {"initiatives": list(initiatives_map.values()), "projects": projects}


def milestones_timeline(cur, date_from, date_to, filters: dict):
    """Отдельная шкала контрольных точек всех проектов. Отклонение в днях
    считается между актуальным planned (plan_date) и исходным
    (plan_date_original), а также между planned и fact для достигнутых."""
    conds = ["m.is_test_data = false"]
    params = []
    if date_from and date_to:
        conds.append("m.plan_date BETWEEN %s AND %s")
        params += [date_from, date_to]
    if filters.get("project_id"):
        conds.append("m.project_id = %s")
        params.append(filters["project_id"])
    if filters.get("initiative_id"):
        conds.append("m.initiative_id = %s")
        params.append(filters["initiative_id"])
    if filters.get("status"):
        conds.append("m.status = %s")
        params.append(filters["status"])
    if filters.get("overdue_only"):
        conds.append("m.status <> 'achieved' AND m.plan_date < CURRENT_DATE")

    where = "WHERE " + " AND ".join(conds)
    cur.execute(f"""
        SELECT m.id, m.title, m.milestone_type, m.plan_date_original, m.plan_date, m.fact_date,
               m.status, m.achievement_criteria, m.achievement_evidence, m.reschedule_count,
               m.reschedule_reason, m.project_id, p.title AS project_title,
               m.initiative_id, ei.title AS initiative_title,
               m.responsible_person_id, per.display_name AS responsible_name,
               m.confirmed_by_person_id, m.confirmed_at,
               (m.status <> 'achieved' AND m.plan_date < CURRENT_DATE) AS is_overdue,
               CASE WHEN m.plan_date_original IS NOT NULL
                    THEN (m.plan_date - m.plan_date_original) ELSE NULL END AS deviation_days,
               (SELECT count(*) FROM {SCHEMA}.exec_task t WHERE t.milestone_id = m.id AND t.archived_at IS NULL) AS dependent_task_count
        FROM {SCHEMA}.exec_milestone m
        LEFT JOIN {SCHEMA}.exec_project p ON p.id = m.project_id
        LEFT JOIN {SCHEMA}.exec_initiative ei ON ei.id = m.initiative_id
        LEFT JOIN {SCHEMA}.exec_person per ON per.id = m.responsible_person_id
        {where}
        ORDER BY m.plan_date
    """, params)
    return rows(cur)


# ---------- ЗАВИСИМОСТИ РАСПИСАНИЯ ----------

def _dependency_object_exists(cur, kind: str, oid: int) -> bool:
    table = DEPENDENCY_KIND_TABLE.get(kind)
    if not table:
        return False
    cur.execute(f"SELECT 1 FROM {SCHEMA}.{table} WHERE id = %s", (oid,))
    return cur.fetchone() is not None


def _has_dependency_cycle(cur, new_src_kind, new_src_id, new_tgt_kind, new_tgt_id) -> bool:
    """Обходит граф зависимостей от новой цели (tgt) — если можно дойти
    обратно до источника (src), добавление создаст цикл."""
    cur.execute(f"""
        SELECT src_kind, src_id, tgt_kind, tgt_id FROM {SCHEMA}.exec_schedule_dependency
        WHERE archived_at IS NULL
    """)
    edges = rows(cur)
    edges.append({"src_kind": new_src_kind, "src_id": new_src_id, "tgt_kind": new_tgt_kind, "tgt_id": new_tgt_id})

    adjacency: dict = {}
    for e in edges:
        key = (e["src_kind"], e["src_id"])
        adjacency.setdefault(key, []).append((e["tgt_kind"], e["tgt_id"]))

    start = (new_tgt_kind, new_tgt_id)
    target = (new_src_kind, new_src_id)
    visited = set()
    stack = [start]
    while stack:
        node = stack.pop()
        if node == target:
            return True
        if node in visited:
            continue
        visited.add(node)
        stack.extend(adjacency.get(node, []))
    return False


def save_dependency(cur, body: dict, actor: str):
    dep_type = body.get("dependency_type", "FS")
    src_kind, src_id = body.get("src_kind"), as_int(body.get("src_id"))
    tgt_kind, tgt_id = body.get("tgt_kind"), as_int(body.get("tgt_id"))

    if dep_type not in DEPENDENCY_TYPES:
        return None, "Недопустимый тип зависимости"
    if src_kind not in DEPENDENCY_KINDS or tgt_kind not in DEPENDENCY_KINDS:
        return None, "Недопустимый тип объекта зависимости"
    if not src_id or not tgt_id:
        return None, "Не указан один из объектов зависимости"
    if src_kind == tgt_kind and src_id == tgt_id:
        return None, "Нельзя создать зависимость объекта от самого себя"
    if not _dependency_object_exists(cur, src_kind, src_id):
        return None, f"Исходный объект ({src_kind} #{src_id}) не найден"
    if not _dependency_object_exists(cur, tgt_kind, tgt_id):
        return None, f"Целевой объект ({tgt_kind} #{tgt_id}) не найден"

    cur.execute(f"""
        SELECT id FROM {SCHEMA}.exec_schedule_dependency
        WHERE dependency_type = %s AND src_kind = %s AND src_id = %s
          AND tgt_kind = %s AND tgt_id = %s AND archived_at IS NULL
    """, (dep_type, src_kind, src_id, tgt_kind, tgt_id))
    if cur.fetchone():
        return None, "Такая зависимость уже существует"

    if _has_dependency_cycle(cur, src_kind, src_id, tgt_kind, tgt_id):
        return None, "Эта зависимость создаёт цикл (объект косвенно зависит сам от себя) — сохранение отклонено"

    lag_days = as_int(body.get("lag_days")) or 0
    lag_kind = body.get("lag_kind", "calendar")
    if lag_kind not in ("calendar", "working"):
        return None, "Недопустимый вид лага"

    cur.execute(f"""
        INSERT INTO {SCHEMA}.exec_schedule_dependency
            (dependency_type, src_kind, src_id, tgt_kind, tgt_id, lag_days, lag_kind, note, created_by)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id
    """, (dep_type, src_kind, src_id, tgt_kind, tgt_id, lag_days, lag_kind, body.get("note"), actor))
    new_id = cur.fetchone()[0]
    log_change(cur, actor, "schedule_dependency", new_id, "create",
               after={"type": dep_type, "src": f"{src_kind}#{src_id}", "tgt": f"{tgt_kind}#{tgt_id}"})
    return new_id, None


def archive_dependency(cur, did, actor):
    cur.execute(f"""
        UPDATE {SCHEMA}.exec_schedule_dependency SET archived_at = now(), archived_by = %s
        WHERE id = %s AND archived_at IS NULL RETURNING id
    """, (actor, did))
    r = cur.fetchone()
    if r:
        log_change(cur, actor, "schedule_dependency", did, "archive")
    return r[0] if r else None


def list_dependencies(cur, kind: str = None, oid: int = None):
    conds = ["archived_at IS NULL"]
    params = []
    if kind and oid:
        conds.append("((src_kind = %s AND src_id = %s) OR (tgt_kind = %s AND tgt_id = %s))")
        params += [kind, oid, kind, oid]
    where = "WHERE " + " AND ".join(conds)
    cur.execute(f"SELECT * FROM {SCHEMA}.exec_schedule_dependency {where} ORDER BY created_at DESC", params)
    return rows(cur)


# ---------- BASELINE (ВЕРСИИ РАСПИСАНИЯ) ----------

def _project_schedule_payload(cur, project_id: int):
    p = fetch_one(cur, "exec_project", project_id)
    if not p:
        return None
    cur.execute(f"SELECT id, title, plan_start, plan_end FROM {SCHEMA}.exec_project_stage WHERE project_id = %s", (project_id,))
    stages = rows(cur)
    cur.execute(f"SELECT id, title, due_at FROM {SCHEMA}.exec_task WHERE project_id = %s AND archived_at IS NULL", (project_id,))
    tasks = rows(cur)
    cur.execute(f"SELECT id, title, plan_date FROM {SCHEMA}.exec_milestone WHERE project_id = %s", (project_id,))
    milestones = rows(cur)
    return {
        "project": {"id": p["id"], "title": p["title"], "plan_start": p["plan_start"], "plan_end": p["plan_end"]},
        "stages": stages, "tasks": tasks, "milestones": milestones,
    }


def create_baseline(cur, body: dict, actor: str):
    scope_kind = body.get("scope_kind", "project")
    scope_id = as_int(body.get("scope_id"))
    if scope_kind not in ("project", "portfolio"):
        return None, "Недопустимая область baseline"
    if scope_kind == "project" and not scope_id:
        return None, "Не указан проект"

    if scope_kind == "project":
        payload = _project_schedule_payload(cur, scope_id)
        if payload is None:
            return None, "Проект не найден"
    else:
        cur.execute(f"SELECT id FROM {SCHEMA}.exec_project WHERE archived_at IS NULL AND is_test_data = false")
        pids = [r["id"] for r in rows(cur)]
        payload = {"projects": [_project_schedule_payload(cur, pid) for pid in pids]}

    payload_str = json.dumps(payload, ensure_ascii=False, default=str)
    payload_hash = hashlib.sha256(payload_str.encode("utf-8")).hexdigest()

    cur.execute(f"""
        SELECT COALESCE(MAX(version_number), 0) FROM {SCHEMA}.exec_schedule_baseline
        WHERE scope_kind = %s AND scope_id IS NOT DISTINCT FROM %s
    """, (scope_kind, scope_id))
    next_version = cur.fetchone()[0] + 1
    title = body.get("title") or f"Baseline {scope_kind} — версия {next_version}"

    cur.execute(f"""
        INSERT INTO {SCHEMA}.exec_schedule_baseline
            (scope_kind, scope_id, title, version_number, payload_json, payload_sha256, is_test_data, created_by)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id, created_at
    """, (scope_kind, scope_id, title, next_version, payload_str, payload_hash, bool(body.get("is_test_data")), actor))
    row = cur.fetchone()
    log_change(cur, actor, "schedule_baseline", row[0], "create",
               after={"scope_kind": scope_kind, "scope_id": scope_id, "version_number": next_version})
    return {"id": row[0], "created_at": row[1], "version_number": next_version, "payload_sha256": payload_hash, "title": title}, None


def list_baselines(cur, scope_kind=None, scope_id=None):
    conds = []
    params = []
    if scope_kind:
        conds.append("scope_kind = %s")
        params.append(scope_kind)
    if scope_id:
        conds.append("scope_id = %s")
        params.append(scope_id)
    where = ("WHERE " + " AND ".join(conds)) if conds else ""
    cur.execute(f"""
        SELECT id, scope_kind, scope_id, title, version_number, payload_sha256, created_by, created_at, is_test_data
        FROM {SCHEMA}.exec_schedule_baseline {where} ORDER BY created_at DESC
    """, params)
    return rows(cur)


def project_gantt(cur, pid: int):
    """Данные для интерактивной диаграммы Ганта одного проекта (режим
    просмотра): этапы → задачи, вехи, зависимости внутри проекта и
    последний baseline для сравнения план/факт. Один запрос вместо
    дублирования отдельных вызовов stages/tasks/milestones/dependencies —
    экономит round-trip для тяжёлого экрана."""
    p = fetch_one(cur, "exec_project", pid)
    if not p:
        return None

    cur.execute(f"""
        SELECT * FROM {SCHEMA}.exec_project_stage WHERE project_id = %s ORDER BY sort_order, id
    """, (pid,))
    stages = rows(cur)

    cur.execute(f"""
        SELECT t.*, per.display_name AS responsible_name,
            (t.due_at IS NOT NULL AND t.due_at < CURRENT_DATE
                AND t.status NOT IN ('done','cancelled')) AS is_overdue
        FROM {SCHEMA}.exec_task t
        LEFT JOIN {SCHEMA}.exec_person per ON per.id = t.responsible_person_id
        WHERE t.project_id = %s AND t.archived_at IS NULL
        ORDER BY (t.stage_id IS NULL), t.stage_id, (t.due_at IS NULL), t.due_at
    """, (pid,))
    tasks = rows(cur)

    cur.execute(f"""
        SELECT m.*, per.display_name AS responsible_name
        FROM {SCHEMA}.exec_milestone m
        LEFT JOIN {SCHEMA}.exec_person per ON per.id = m.responsible_person_id
        WHERE m.project_id = %s
        ORDER BY m.plan_date
    """, (pid,))
    milestones = rows(cur)

    # Зависимости, где хотя бы один конец принадлежит объектам этого проекта
    # (включая межпроектные — другой конец может быть в другом проекте).
    task_ids = [t["id"] for t in tasks]
    milestone_ids = [m["id"] for m in milestones]
    stage_ids = [s["id"] for s in stages]

    cur.execute(f"""
        SELECT * FROM {SCHEMA}.exec_schedule_dependency
        WHERE archived_at IS NULL AND (
            (src_kind = 'project' AND src_id = %(pid)s) OR (tgt_kind = 'project' AND tgt_id = %(pid)s)
            OR (src_kind = 'task' AND src_id = ANY(%(task_ids)s)) OR (tgt_kind = 'task' AND tgt_id = ANY(%(task_ids)s))
            OR (src_kind = 'milestone' AND src_id = ANY(%(milestone_ids)s)) OR (tgt_kind = 'milestone' AND tgt_id = ANY(%(milestone_ids)s))
            OR (src_kind = 'stage' AND src_id = ANY(%(stage_ids)s)) OR (tgt_kind = 'stage' AND tgt_id = ANY(%(stage_ids)s))
        )
    """, {"pid": pid, "task_ids": task_ids or [0], "milestone_ids": milestone_ids or [0], "stage_ids": stage_ids or [0]})
    dependencies = rows(cur)

    cur.execute(f"""
        SELECT id, version_number, created_by, created_at, payload_sha256
        FROM {SCHEMA}.exec_schedule_baseline
        WHERE scope_kind = 'project' AND scope_id = %s
        ORDER BY version_number DESC LIMIT 1
    """, (pid,))
    latest_baseline = rows(cur)

    return {
        "project": p, "stages": stages, "tasks": tasks, "milestones": milestones,
        "dependencies": dependencies, "latest_baseline": latest_baseline[0] if latest_baseline else None,
    }


def get_baseline(cur, bid: int):
    cur.execute(f"SELECT * FROM {SCHEMA}.exec_schedule_baseline WHERE id = %s", (bid,))
    r = rows(cur)
    if not r:
        return None
    item = r[0]
    payload_str = item.pop("payload_json")
    actual_hash = hashlib.sha256(payload_str.encode("utf-8")).hexdigest()
    item["payload"] = json.loads(payload_str)
    item["integrity_ok"] = item.get("payload_sha256") == actual_hash
    return item


def handler(event: dict, context) -> dict:
    """Поручения и портфель: проекты/мероприятия, задачи, результаты, эффекты,
    гибкие связи (exec_link) и сводный дашборд руководителя. AI не используется."""
    if event.get("httpMethod") == "OPTIONS":
        return cors({})

    headers = event.get("headers") or {}
    conn = psycopg2.connect(DB)
    try:
        user = authenticate(conn, headers)
        if not user:
            return cors({"ok": False, "error": {"message": "Не авторизован"}}, 401)

        qs = event.get("queryStringParameters") or {}
        action = qs.get("action", "dashboard")
        body = json.loads(event["body"]) if event.get("body") else {}
        cur = conn.cursor()

        if action == "dashboard":
            return cors({"ok": True, "data": dashboard(cur)})

        if action == "projects":
            return cors({"ok": True, "data": {"items": list_projects(
                cur, qs.get("include_archived") == "1", qs.get("include_test_data") == "1")}})

        if action == "project":
            pid = as_int(qs.get("id"))
            item = get_project(cur, pid) if pid else None
            if not item:
                return cors({"ok": False, "error": {"message": "Проект не найден"}}, 404)
            return cors({"ok": True, "data": item})

        if action == "save_project":
            pid = save_project(cur, body, user["email"])
            conn.commit()
            return cors({"ok": True, "data": {"id": pid}})

        if action == "archive_project":
            pid = archive_project(cur, as_int(body.get("id")), user["email"])
            conn.commit()
            if not pid:
                return cors({"ok": False, "error": {"message": "Проект не найден или уже архивирован"}}, 404)
            return cors({"ok": True, "data": {"id": pid}})

        if action == "tasks":
            pid = as_int(qs.get("project_id"))
            return cors({"ok": True, "data": {"items": list_tasks(
                cur, pid, qs.get("include_archived") == "1", qs.get("include_test_data") == "1")}})

        if action == "save_task":
            tid = save_task(cur, body, user["email"])
            conn.commit()
            return cors({"ok": True, "data": {"id": tid}})

        if action == "archive_task":
            tid = archive_task(cur, as_int(body.get("id")), user["email"])
            conn.commit()
            if not tid:
                return cors({"ok": False, "error": {"message": "Задача не найдена или уже архивирована"}}, 404)
            return cors({"ok": True, "data": {"id": tid}})

        if action == "results":
            pid = as_int(qs.get("project_id"))
            return cors({"ok": True, "data": {"items": list_results(
                cur, pid, qs.get("include_archived") == "1", qs.get("include_test_data") == "1")}})

        if action == "save_result":
            rid = save_result(cur, body, user["email"])
            conn.commit()
            return cors({"ok": True, "data": {"id": rid}})

        if action == "archive_result":
            rid = archive_result(cur, as_int(body.get("id")), user["email"])
            conn.commit()
            if not rid:
                return cors({"ok": False, "error": {"message": "Результат не найден или уже архивирован"}}, 404)
            return cors({"ok": True, "data": {"id": rid}})

        if action == "effects":
            rid = as_int(qs.get("result_id"))
            return cors({"ok": True, "data": {"items": list_effects(
                cur, rid, qs.get("include_archived") == "1", qs.get("include_test_data") == "1")}})

        if action == "save_effect":
            eid, err = save_effect(cur, body, user["email"])
            if err:
                return cors({"ok": False, "error": {"message": err}}, 400)
            conn.commit()
            return cors({"ok": True, "data": {"id": eid}})

        if action == "archive_effect":
            eid = archive_effect(cur, as_int(body.get("id")), user["email"])
            conn.commit()
            if not eid:
                return cors({"ok": False, "error": {"message": "Эффект не найден или уже архивирован"}}, 404)
            return cors({"ok": True, "data": {"id": eid}})

        if action == "save_link":
            lid, err = save_link(cur, body, user["email"])
            if err:
                return cors({"ok": False, "error": {"message": err}}, 400)
            conn.commit()
            return cors({"ok": True, "data": {"id": lid}})

        if action == "archive_link":
            lid = archive_link(cur, as_int(body.get("id")), user["email"])
            conn.commit()
            if not lid:
                return cors({"ok": False, "error": {"message": "Связь не найдена или уже удалена"}}, 404)
            return cors({"ok": True, "data": {"id": lid}})

        if action == "links":
            kind, oid = qs.get("kind"), as_int(qs.get("id"))
            if not kind or not oid:
                return cors({"ok": False, "error": {"message": "Не указан объект"}}, 400)
            return cors({"ok": True, "data": {"items": list_links(cur, kind, oid)}})

        if action == "history":
            kind, oid = qs.get("kind"), as_int(qs.get("id"))
            if not kind or not oid:
                return cors({"ok": False, "error": {"message": "Не указан объект"}}, 400)
            return cors({"ok": True, "data": {"items": object_history(cur, kind, oid)}})

        if action == "create_snapshot":
            snap = create_snapshot(cur, body, user["email"])
            conn.commit()
            return cors({"ok": True, "data": snap})

        if action == "snapshots":
            return cors({"ok": True, "data": {"items": list_snapshots(cur, qs.get("include_test_data") == "1")}})

        if action == "snapshot":
            sid = as_int(qs.get("id"))
            snap = get_snapshot(cur, sid) if sid else None
            if not snap:
                return cors({"ok": False, "error": {"message": "Снимок не найден"}}, 404)
            return cors({"ok": True, "data": snap})

        # ============ ГАНТ ПРОЕКТА (РЕЖИМ ПРОСМОТРА) ============

        if action == "project_gantt":
            gpid = as_int(qs.get("id"))
            item = project_gantt(cur, gpid) if gpid else None
            if not item:
                return cors({"ok": False, "error": {"message": "Проект не найден"}}, 404)
            return cors({"ok": True, "data": item})

        # ============ ДОРОЖНАЯ КАРТА И ШКАЛА ВЕХ ============

        if action == "roadmap":
            filters = {
                "initiative_id": as_int(qs.get("initiative_id")),
                "project_kind": qs.get("project_kind"),
                "status": qs.get("status"),
                "priority": qs.get("priority"),
                "owner_person_id": as_int(qs.get("owner_person_id")),
                "overdue_only": qs.get("overdue_only") == "1",
                "critical_risk_only": qs.get("critical_risk_only") == "1",
                "resource_gap_only": qs.get("resource_gap_only") == "1",
                "overbudget_only": qs.get("overbudget_only") == "1",
            }
            data = roadmap_data(cur, qs.get("date_from"), qs.get("date_to"), filters)
            return cors({"ok": True, "data": data})

        if action == "milestones_timeline":
            filters = {
                "project_id": as_int(qs.get("project_id")),
                "initiative_id": as_int(qs.get("initiative_id")),
                "status": qs.get("status"),
                "overdue_only": qs.get("overdue_only") == "1",
            }
            items = milestones_timeline(cur, qs.get("date_from"), qs.get("date_to"), filters)
            return cors({"ok": True, "data": {"items": items}})

        # ============ ЗАВИСИМОСТИ РАСПИСАНИЯ ============

        if action == "save_dependency":
            did, err = save_dependency(cur, body, user["email"])
            if err:
                return cors({"ok": False, "error": {"message": err}}, 400)
            conn.commit()
            return cors({"ok": True, "data": {"id": did}})

        if action == "archive_dependency":
            did = archive_dependency(cur, as_int(body.get("id")), user["email"])
            conn.commit()
            if not did:
                return cors({"ok": False, "error": {"message": "Зависимость не найдена или уже архивирована"}}, 404)
            return cors({"ok": True, "data": {"id": did}})

        if action == "dependencies":
            items = list_dependencies(cur, qs.get("kind"), as_int(qs.get("id")))
            return cors({"ok": True, "data": {"items": items}})

        # ============ BASELINE (ВЕРСИИ РАСПИСАНИЯ) ============

        if action == "create_baseline":
            result, err = create_baseline(cur, body, user["email"])
            if err:
                return cors({"ok": False, "error": {"message": err}}, 400)
            conn.commit()
            return cors({"ok": True, "data": result})

        if action == "baselines":
            items = list_baselines(cur, qs.get("scope_kind"), as_int(qs.get("scope_id")))
            return cors({"ok": True, "data": {"items": items}})

        if action == "baseline":
            bid = as_int(qs.get("id"))
            item = get_baseline(cur, bid) if bid else None
            if not item:
                return cors({"ok": False, "error": {"message": "Baseline не найден"}}, 404)
            return cors({"ok": True, "data": item})

        return cors({"ok": False, "error": {"message": "Неизвестное действие"}}, 400)
    finally:
        conn.close()