"""
Поручения и портфель: проекты/мероприятия, задачи, результаты, эффекты,
универсальные связи (exec_link) и сводный дашборд руководителя.

Не дублирует существующие модули:
- поручения (exec_action), риски, проблемы, вехи, решения — уже есть в exec-control;
- инициативы — уже есть в exec-cabinet;
- этот модуль добавляет недостающий уровень (проекты, задачи, результаты, эффекты)
  и связывает всё через гибкую M2M exec_link, а не жёсткую цепочку.

AI не используется нигде в этом модуле.
"""
import json
import os
import hashlib
import psycopg2

DB = os.environ["DATABASE_URL"]
_s = os.environ.get("MAIN_DB_SCHEMA", "").strip()
SCHEMA = _s if _s else "t_p61016064_digital_innovation_i"


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


# ============ ПРОЕКТЫ ============

def list_projects(cur):
    cur.execute(f"""
        SELECT p.*, ei.title AS initiative_title,
            (SELECT count(*) FROM {SCHEMA}.exec_task t WHERE t.project_id = p.id) AS task_count,
            (SELECT count(*) FROM {SCHEMA}.exec_task t WHERE t.project_id = p.id
                AND t.status NOT IN ('done','cancelled')
                AND t.due_at IS NOT NULL AND t.due_at < CURRENT_DATE) AS overdue_task_count
        FROM {SCHEMA}.exec_project p
        LEFT JOIN {SCHEMA}.exec_initiative ei ON ei.id = p.initiative_id
        ORDER BY p.updated_at DESC
    """)
    return rows(cur)


def save_project(cur, body: dict, actor: str):
    pid = as_int(body.get("id"))
    fields = dict(
        title=body.get("title"), project_kind=body.get("project_kind", "project"),
        description=body.get("description"), goal=body.get("goal"),
        customer_person_id=as_int(body.get("customer_person_id")),
        result_owner_person_id=as_int(body.get("result_owner_person_id")),
        manager_person_id=as_int(body.get("manager_person_id")),
        coordinator_person_id=as_int(body.get("coordinator_person_id")),
        initiative_id=as_int(body.get("initiative_id")),
        status=body.get("status", "idea"), priority=body.get("priority", "normal"),
        progress_pct=as_int(body.get("progress_pct")) or 0,
        plan_start=body.get("plan_start") or None, plan_end=body.get("plan_end") or None,
        fact_start=body.get("fact_start") or None, fact_end=body.get("fact_end") or None,
    )
    if pid:
        sets = ", ".join(f"{k} = %s" for k in fields)
        cur.execute(
            f"UPDATE {SCHEMA}.exec_project SET {sets}, updated_at = now() WHERE id = %s RETURNING id",
            (*fields.values(), pid),
        )
    else:
        cols = ", ".join(fields.keys())
        ph = ", ".join(["%s"] * len(fields))
        cur.execute(
            f"INSERT INTO {SCHEMA}.exec_project ({cols}, created_by) VALUES ({ph}, %s) RETURNING id",
            (*fields.values(), actor),
        )
    return cur.fetchone()[0]


# ============ ЗАДАЧИ ============

def list_tasks(cur, project_id=None):
    where = "WHERE t.project_id = %s" if project_id else ""
    params = (project_id,) if project_id else ()
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


def save_task(cur, body: dict, actor: str):
    tid = as_int(body.get("id"))
    fields = dict(
        title=body.get("title"), description=body.get("description"),
        project_id=as_int(body.get("project_id")), stage_id=as_int(body.get("stage_id")),
        milestone_id=as_int(body.get("milestone_id")), action_id=as_int(body.get("action_id")),
        responsible_person_id=as_int(body.get("responsible_person_id")),
        due_at=body.get("due_at") or None, priority=body.get("priority", "normal"),
        status=body.get("status", "not_started"), progress_pct=as_int(body.get("progress_pct")) or 0,
        expected_result=body.get("expected_result"), actual_result=body.get("actual_result"),
        delay_reason=body.get("delay_reason"), blocker=body.get("blocker"),
        fact_date=body.get("fact_date") or None,
        result_confirmed_by_person_id=as_int(body.get("result_confirmed_by_person_id")),
    )
    if tid:
        sets = ", ".join(f"{k} = %s" for k in fields)
        cur.execute(
            f"UPDATE {SCHEMA}.exec_task SET {sets}, updated_at = now() WHERE id = %s RETURNING id",
            (*fields.values(), tid),
        )
    else:
        cols = ", ".join(fields.keys())
        ph = ", ".join(["%s"] * len(fields))
        cur.execute(
            f"INSERT INTO {SCHEMA}.exec_task ({cols}, created_by) VALUES ({ph}, %s) RETURNING id",
            (*fields.values(), actor),
        )
    return cur.fetchone()[0]


# ============ РЕЗУЛЬТАТЫ И ЭФФЕКТЫ ============

def list_results(cur, project_id=None):
    where = "WHERE r.project_id = %s" if project_id else ""
    params = (project_id,) if project_id else ()
    cur.execute(f"""
        SELECT r.*, p.title AS project_title,
            (SELECT count(*) FROM {SCHEMA}.exec_effect e WHERE e.result_id = r.id) AS effect_count
        FROM {SCHEMA}.exec_result r
        LEFT JOIN {SCHEMA}.exec_project p ON p.id = r.project_id
        {where}
        ORDER BY r.updated_at DESC
    """, params)
    return rows(cur)


def save_result(cur, body: dict, actor: str):
    rid = as_int(body.get("id"))
    fields = dict(
        title=body.get("title"), result_kind=body.get("result_kind", "other"),
        description=body.get("description"), project_id=as_int(body.get("project_id")),
        initiative_id=as_int(body.get("initiative_id")),
        owner_person_id=as_int(body.get("owner_person_id")),
        achieved_at=body.get("achieved_at") or None,
        document_source_id=as_int(body.get("document_source_id")),
    )
    if rid:
        sets = ", ".join(f"{k} = %s" for k in fields)
        cur.execute(
            f"UPDATE {SCHEMA}.exec_result SET {sets}, updated_at = now() WHERE id = %s RETURNING id",
            (*fields.values(), rid),
        )
    else:
        cols = ", ".join(fields.keys())
        ph = ", ".join(["%s"] * len(fields))
        cur.execute(
            f"INSERT INTO {SCHEMA}.exec_result ({cols}, created_by) VALUES ({ph}, %s) RETURNING id",
            (*fields.values(), actor),
        )
    return cur.fetchone()[0]


def list_effects(cur, result_id=None):
    where = "WHERE e.result_id = %s" if result_id else ""
    params = (result_id,) if result_id else ()
    cur.execute(f"""
        SELECT e.*, r.title AS result_title
        FROM {SCHEMA}.exec_effect e
        LEFT JOIN {SCHEMA}.exec_result r ON r.id = e.result_id
        {where}
        ORDER BY e.updated_at DESC
    """, params)
    return rows(cur)


def save_effect(cur, body: dict, actor: str):
    eid = as_int(body.get("id"))
    fields = dict(
        title=body.get("title"), result_id=as_int(body.get("result_id")),
        project_id=as_int(body.get("project_id")), initiative_id=as_int(body.get("initiative_id")),
        metric=body.get("metric"), unit=body.get("unit"),
        baseline_value=body.get("baseline_value"), plan_value=body.get("plan_value"),
        actual_value=body.get("actual_value"), measured_at=body.get("measured_at") or None,
        calculation_method=body.get("calculation_method"), data_source=body.get("data_source"),
        owner_person_id=as_int(body.get("owner_person_id")),
        confirmed_by_person_id=as_int(body.get("confirmed_by_person_id")),
        confirmation_status=body.get("confirmation_status", "not_confirmed"),
    )
    if eid:
        sets = ", ".join(f"{k} = %s" for k in fields)
        cur.execute(
            f"UPDATE {SCHEMA}.exec_effect SET {sets}, updated_at = now() WHERE id = %s RETURNING id",
            (*fields.values(), eid),
        )
    else:
        cols = ", ".join(fields.keys())
        ph = ", ".join(["%s"] * len(fields))
        cur.execute(
            f"INSERT INTO {SCHEMA}.exec_effect ({cols}, created_by) VALUES ({ph}, %s) RETURNING id",
            (*fields.values(), actor),
        )
    return cur.fetchone()[0]


# ============ УНИВЕРСАЛЬНЫЕ СВЯЗИ ============

def save_link(cur, body: dict, actor: str):
    cur.execute(
        f"""INSERT INTO {SCHEMA}.exec_link (link_type, src_kind, src_id, tgt_kind, tgt_id, note, created_by)
            VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id""",
        (body.get("link_type", "related"), body.get("src_kind"), as_int(body.get("src_id")),
         body.get("tgt_kind"), as_int(body.get("tgt_id")), body.get("note"), actor),
    )
    return cur.fetchone()[0]


def list_links(cur, kind: str, oid: int):
    cur.execute(f"""
        SELECT * FROM {SCHEMA}.exec_link
        WHERE (src_kind = %s AND src_id = %s) OR (tgt_kind = %s AND tgt_id = %s)
        ORDER BY created_at DESC
    """, (kind, oid, kind, oid))
    return rows(cur)


# ============ ДАШБОРД ============

def dashboard(cur):
    cur.execute(f"""
        SELECT id, title, status, priority, due_at, is_on_control
        FROM {SCHEMA}.exec_action
        WHERE status NOT IN ('done_by_executor','accepted_by_head','cancelled','done')
          AND due_at IS NOT NULL AND due_at < CURRENT_DATE
        ORDER BY due_at
    """)
    overdue_actions = rows(cur)

    cur.execute(f"""
        SELECT id, title, status, priority, due_at
        FROM {SCHEMA}.exec_action
        WHERE status NOT IN ('done_by_executor','accepted_by_head','cancelled','done')
          AND due_at IS NOT NULL AND due_at BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
        ORDER BY due_at
    """)
    upcoming_actions = rows(cur)

    cur.execute(f"""
        SELECT id, title, status, priority, project_id, due_at,
            (due_at IS NOT NULL AND due_at < CURRENT_DATE) AS is_overdue
        FROM {SCHEMA}.exec_task
        WHERE status NOT IN ('done','cancelled')
          AND due_at IS NOT NULL AND due_at < CURRENT_DATE
        ORDER BY due_at
    """)
    overdue_tasks = rows(cur)

    cur.execute(f"""
        SELECT id, title, plan_date, status, initiative_id, project_id
        FROM {SCHEMA}.exec_milestone
        WHERE status NOT IN ('achieved','cancelled')
          AND plan_date IS NOT NULL AND plan_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
        ORDER BY plan_date
    """)
    upcoming_milestones = rows(cur)

    cur.execute(f"""
        SELECT status, count(*) AS cnt FROM {SCHEMA}.exec_project GROUP BY status
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
    """Неизменяемый снимок отчёта: после создания payload_json не редактируется."""
    payload = dashboard(cur)
    cur.execute(
        f"""INSERT INTO {SCHEMA}.exec_report_snapshot (title, report_kind, period_from, period_to, payload_json, created_by)
            VALUES (%s, %s, %s, %s, %s, %s) RETURNING id, created_at""",
        (body.get("title", "Справка руководителю"), body.get("report_kind", "portfolio_summary"),
         body.get("period_from") or None, body.get("period_to") or None,
         json.dumps(payload, ensure_ascii=False, default=str), actor),
    )
    row = cur.fetchone()
    return {"id": row[0], "created_at": row[1]}


def list_snapshots(cur):
    cur.execute(f"""
        SELECT id, title, report_kind, period_from, period_to, created_by, created_at
        FROM {SCHEMA}.exec_report_snapshot ORDER BY created_at DESC LIMIT 50
    """)
    return rows(cur)


def get_snapshot(cur, sid: int):
    cur.execute(f"SELECT * FROM {SCHEMA}.exec_report_snapshot WHERE id = %s", (sid,))
    r = rows(cur)
    if not r:
        return None
    item = r[0]
    item["payload"] = json.loads(item.pop("payload_json"))
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
            return cors({"ok": True, "data": {"items": list_projects(cur)}})

        if action == "save_project":
            pid = save_project(cur, body, user["email"])
            conn.commit()
            return cors({"ok": True, "data": {"id": pid}})

        if action == "tasks":
            pid = as_int(qs.get("project_id"))
            return cors({"ok": True, "data": {"items": list_tasks(cur, pid)}})

        if action == "save_task":
            tid = save_task(cur, body, user["email"])
            conn.commit()
            return cors({"ok": True, "data": {"id": tid}})

        if action == "results":
            pid = as_int(qs.get("project_id"))
            return cors({"ok": True, "data": {"items": list_results(cur, pid)}})

        if action == "save_result":
            rid = save_result(cur, body, user["email"])
            conn.commit()
            return cors({"ok": True, "data": {"id": rid}})

        if action == "effects":
            rid = as_int(qs.get("result_id"))
            return cors({"ok": True, "data": {"items": list_effects(cur, rid)}})

        if action == "save_effect":
            eid = save_effect(cur, body, user["email"])
            conn.commit()
            return cors({"ok": True, "data": {"id": eid}})

        if action == "save_link":
            lid = save_link(cur, body, user["email"])
            conn.commit()
            return cors({"ok": True, "data": {"id": lid}})

        if action == "links":
            kind, oid = qs.get("kind"), as_int(qs.get("id"))
            if not kind or not oid:
                return cors({"ok": False, "error": {"message": "Не указан объект"}}, 400)
            return cors({"ok": True, "data": {"items": list_links(cur, kind, oid)}})

        if action == "create_snapshot":
            snap = create_snapshot(cur, body, user["email"])
            conn.commit()
            return cors({"ok": True, "data": snap})

        if action == "snapshots":
            return cors({"ok": True, "data": {"items": list_snapshots(cur)}})

        if action == "snapshot":
            sid = as_int(qs.get("id"))
            snap = get_snapshot(cur, sid) if sid else None
            if not snap:
                return cors({"ok": False, "error": {"message": "Снимок не найден"}}, 404)
            return cors({"ok": True, "data": snap})

        return cors({"ok": False, "error": {"message": "Неизвестное действие"}}, 400)
    finally:
        conn.close()
