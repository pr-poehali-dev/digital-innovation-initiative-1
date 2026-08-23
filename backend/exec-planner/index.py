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
            f"SELECT u.email, a.access_role, a.can_confirm "
            f"FROM {SCHEMA}.sessions s "
            f"JOIN {SCHEMA}.users u ON u.id = s.user_id "
            f"JOIN {SCHEMA}.exec_cabinet_access a ON LOWER(a.email) = LOWER(u.email) "
            f"LEFT JOIN {SCHEMA}.admin_user_flags fl ON fl.user_id = u.id "
            f"WHERE s.id = %s AND s.expires_at > NOW() "
            f"AND a.is_active = true AND COALESCE(fl.is_blocked, false) = false LIMIT 1",
            (session_id,),
        )
        row = cur.fetchone()
    if not row:
        return None
    return {"email": row[0], "role": row[1], "can_confirm": row[2]}


def authenticate(conn, headers: dict):
    token = headers.get("x-admin-token") or headers.get("X-Admin-Token", "")
    email = get_admin(conn, token)
    if email:
        return {"email": email, "role": "head", "can_confirm": True}
    sid = headers.get("x-session-id") or headers.get("X-Session-Id", "")
    return get_cabinet_user(conn, sid)


def rows(cur):
    cols = [d[0] for d in cur.description]
    return [dict(zip(cols, r)) for r in cur.fetchall()]


def nz(v):
    """Пустая строка -> None, чтобы даты и ссылки писались как NULL."""
    if v is None:
        return None
    if isinstance(v, str) and not v.strip():
        return None
    return v


def as_int(v):
    v = nz(v)
    return int(v) if v is not None else None


STEP_FIELDS = [
    "title", "description", "step_type", "status", "start_date", "due_date",
    "fact_date", "responsible_person_id", "depends_on_step_id", "is_milestone",
    "progress_pct", "workload_pct", "sort_order", "result_criteria",
    "result_evidence", "note", "parent_step_id",
]
INT_FIELDS = {
    "responsible_person_id", "depends_on_step_id", "progress_pct",
    "workload_pct", "sort_order", "parent_step_id",
}


def list_plans(cur):
    cur.execute(f"""
        SELECT p.*,
               o.display_name AS owner_name,
               i.title AS initiative_title,
               (SELECT COUNT(*) FROM {SCHEMA}.exec_plan_step s WHERE s.plan_id = p.id) AS steps_total,
               (SELECT COUNT(*) FROM {SCHEMA}.exec_plan_step s
                 WHERE s.plan_id = p.id AND s.status = 'done') AS steps_done,
               (SELECT COUNT(*) FROM {SCHEMA}.exec_plan_step s
                 WHERE s.plan_id = p.id AND s.due_date < CURRENT_DATE
                   AND s.status NOT IN ('done','cancelled')) AS steps_overdue
        FROM {SCHEMA}.exec_plan p
        LEFT JOIN {SCHEMA}.exec_person o ON o.id = p.owner_person_id
        LEFT JOIN {SCHEMA}.exec_initiative i ON i.id = p.initiative_id
        ORDER BY p.created_at DESC
    """)
    return rows(cur)


def plan_detail(cur, plan_id: int):
    cur.execute(f"""
        SELECT p.*, o.display_name AS owner_name, i.title AS initiative_title
        FROM {SCHEMA}.exec_plan p
        LEFT JOIN {SCHEMA}.exec_person o ON o.id = p.owner_person_id
        LEFT JOIN {SCHEMA}.exec_initiative i ON i.id = p.initiative_id
        WHERE p.id = %s
    """, (plan_id,))
    got = rows(cur)
    if not got:
        return None
    plan = got[0]

    cur.execute(f"""
        SELECT s.*,
               r.display_name AS responsible_name,
               r.position_title AS responsible_position,
               d.title AS depends_on_title,
               (s.due_date < CURRENT_DATE AND s.status NOT IN ('done','cancelled')) AS is_overdue
        FROM {SCHEMA}.exec_plan_step s
        LEFT JOIN {SCHEMA}.exec_person r ON r.id = s.responsible_person_id
        LEFT JOIN {SCHEMA}.exec_plan_step d ON d.id = s.depends_on_step_id
        WHERE s.plan_id = %s
        ORDER BY s.sort_order, s.id
    """, (plan_id,))
    steps = rows(cur)

    cur.execute(f"""
        SELECT a.*, pe.display_name, pe.position_title
        FROM {SCHEMA}.exec_plan_assignee a
        JOIN {SCHEMA}.exec_person pe ON pe.id = a.person_id
        JOIN {SCHEMA}.exec_plan_step s ON s.id = a.step_id
        WHERE s.plan_id = %s
        ORDER BY a.id
    """, (plan_id,))
    assignees = rows(cur)
    by_step = {}
    for a in assignees:
        by_step.setdefault(a["step_id"], []).append(a)
    for s in steps:
        s["assignees"] = by_step.get(s["id"], [])

    plan["steps"] = steps
    return plan


def resource_load(cur, plan_id=None):
    """Загрузка людей: сколько активных шагов и суммарный процент участия."""
    where = "WHERE s.status NOT IN ('done','cancelled')"
    params = []
    if plan_id:
        where += " AND s.plan_id = %s"
        params.append(plan_id)
    cur.execute(f"""
        SELECT pe.id AS person_id, pe.display_name, pe.position_title,
               COUNT(DISTINCT s.id) AS active_steps,
               COALESCE(SUM(COALESCE(a.workload_pct, 100)), 0) AS total_workload,
               COUNT(DISTINCT s.id) FILTER (
                   WHERE s.due_date < CURRENT_DATE
               ) AS overdue_steps
        FROM {SCHEMA}.exec_plan_assignee a
        JOIN {SCHEMA}.exec_plan_step s ON s.id = a.step_id
        JOIN {SCHEMA}.exec_person pe ON pe.id = a.person_id
        {where}
        GROUP BY pe.id, pe.display_name, pe.position_title
        ORDER BY total_workload DESC, active_steps DESC
    """, params)
    return rows(cur)


def refs(cur):
    cur.execute(f"""
        SELECT id, display_name, position_title, org_name
        FROM {SCHEMA}.exec_person
        WHERE COALESCE(record_state,'active') = 'active'
        ORDER BY display_name
    """)
    persons = rows(cur)
    cur.execute(f"SELECT id, title, code FROM {SCHEMA}.exec_initiative ORDER BY id DESC")
    initiatives = rows(cur)
    return {"persons": persons, "initiatives": initiatives}


def save_plan(cur, d: dict, actor: str):
    pid = as_int(d.get("id"))
    vals = {
        "title": (d.get("title") or "").strip(),
        "goal": nz(d.get("goal")),
        "initiative_id": as_int(d.get("initiative_id")),
        "owner_person_id": as_int(d.get("owner_person_id")),
        "start_date": nz(d.get("start_date")),
        "due_date": nz(d.get("due_date")),
        "status": d.get("status") or "draft",
        "priority": d.get("priority") or "medium",
        "note": nz(d.get("note")),
    }
    if not vals["title"]:
        return None, "Укажите название плана"

    if pid:
        sets = ", ".join(f"{k} = %s" for k in vals)
        cur.execute(
            f"UPDATE {SCHEMA}.exec_plan SET {sets}, updated_at = now() WHERE id = %s RETURNING id",
            list(vals.values()) + [pid],
        )
    else:
        vals["created_by"] = actor
        cols = ", ".join(vals)
        ph = ", ".join(["%s"] * len(vals))
        cur.execute(
            f"INSERT INTO {SCHEMA}.exec_plan ({cols}) VALUES ({ph}) RETURNING id",
            list(vals.values()),
        )
    row = cur.fetchone()
    return (row[0] if row else pid), None


def save_step(cur, d: dict):
    sid = as_int(d.get("id"))
    plan_id = as_int(d.get("plan_id"))
    title = (d.get("title") or "").strip()
    if not title:
        return None, "Укажите название шага"
    if not sid and not plan_id:
        return None, "Не указан план"

    vals = {}
    for f in STEP_FIELDS:
        if f not in d:
            continue
        v = d.get(f)
        if f in INT_FIELDS:
            v = as_int(v)
        elif f == "is_milestone":
            v = bool(v)
        else:
            v = nz(v)
        vals[f] = v
    vals["title"] = title

    if vals.get("status") == "done" and vals.get("progress_pct") is None:
        vals["progress_pct"] = 100

    if sid:
        if vals.get("depends_on_step_id") == sid:
            return None, "Шаг не может зависеть сам от себя"
        if vals.get("parent_step_id") == sid:
            return None, "Шаг не может быть вложен сам в себя"
        new_parent = vals.get("parent_step_id")
        if new_parent:
            cur.execute(
                f"WITH RECURSIVE sub AS ("
                f"  SELECT id FROM {SCHEMA}.exec_plan_step WHERE parent_step_id = %s"
                f"  UNION ALL"
                f"  SELECT s.id FROM {SCHEMA}.exec_plan_step s JOIN sub ON s.parent_step_id = sub.id"
                f") SELECT 1 FROM sub WHERE id = %s LIMIT 1",
                (sid, new_parent),
            )
            if cur.fetchone():
                return None, "Нельзя вложить шаг в его собственный подшаг"
        sets = ", ".join(f"{k} = %s" for k in vals)
        cur.execute(
            f"UPDATE {SCHEMA}.exec_plan_step SET {sets}, updated_at = now() WHERE id = %s RETURNING id",
            list(vals.values()) + [sid],
        )
    else:
        vals["plan_id"] = plan_id
        if vals.get("sort_order") is None:
            cur.execute(
                f"SELECT COALESCE(MAX(sort_order), 0) + 1 FROM {SCHEMA}.exec_plan_step "
                f"WHERE plan_id = %s AND parent_step_id IS NOT DISTINCT FROM %s",
                (plan_id, vals.get("parent_step_id")),
            )
            vals["sort_order"] = cur.fetchone()[0]
        cols = ", ".join(vals)
        ph = ", ".join(["%s"] * len(vals))
        cur.execute(
            f"INSERT INTO {SCHEMA}.exec_plan_step ({cols}) VALUES ({ph}) RETURNING id",
            list(vals.values()),
        )
    row = cur.fetchone()
    return (row[0] if row else sid), None


def set_assignees(cur, step_id: int, person_ids: list, workloads: dict):
    cur.execute(
        f"UPDATE {SCHEMA}.exec_plan_assignee SET workload_pct = 0 WHERE step_id = %s AND person_id <> ALL(%s)",
        (step_id, person_ids or [0]),
    )
    cur.execute(
        f"DELETE FROM {SCHEMA}.exec_plan_assignee WHERE step_id = %s AND workload_pct = 0",
        (step_id,),
    )
    for p in person_ids or []:
        cur.execute(
            f"INSERT INTO {SCHEMA}.exec_plan_assignee (step_id, person_id, workload_pct) "
            f"VALUES (%s, %s, %s) ON CONFLICT (step_id, person_id) "
            f"DO UPDATE SET workload_pct = EXCLUDED.workload_pct",
            (step_id, int(p), int(workloads.get(str(p), workloads.get(p, 100)) or 100)),
        )


def apply_ai_steps(cur, plan_id: int, steps: list):
    """Сохраняет подтверждённые пользователем шаги в план."""
    cur.execute(
        f"SELECT COALESCE(MAX(sort_order), 0) FROM {SCHEMA}.exec_plan_step "
        f"WHERE plan_id = %s AND parent_step_id IS NULL",
        (plan_id,),
    )
    order = cur.fetchone()[0] or 0
    created = 0

    for s in steps or []:
        if not isinstance(s, dict) or not (s.get("title") or "").strip():
            continue
        order += 1
        cur.execute(
            f"INSERT INTO {SCHEMA}.exec_plan_step "
            f"(plan_id, title, description, result_criteria, is_milestone, "
            f" start_date, due_date, responsible_person_id, sort_order) "
            f"VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id",
            (plan_id, str(s["title"]).strip()[:500], nz(s.get("description")),
             nz(s.get("result_criteria")), bool(s.get("is_milestone")),
             nz(s.get("start_date")), nz(s.get("due_date")),
             as_int(s.get("responsible_person_id")), order),
        )
        parent_id = cur.fetchone()[0]
        created += 1

        sub_order = 0
        for sub in s.get("substeps") or []:
            if not isinstance(sub, dict) or not (sub.get("title") or "").strip():
                continue
            sub_order += 1
            cur.execute(
                f"INSERT INTO {SCHEMA}.exec_plan_step "
                f"(plan_id, parent_step_id, title, start_date, due_date, "
                f" responsible_person_id, sort_order) "
                f"VALUES (%s,%s,%s,%s,%s,%s,%s)",
                (plan_id, parent_id, str(sub["title"]).strip()[:500],
                 nz(sub.get("start_date")), nz(sub.get("due_date")),
                 as_int(sub.get("responsible_person_id")), sub_order),
            )
            created += 1
    return created


def handler(event: dict, context) -> dict:
    """Планировщик кабинета руководителя: планы, шаги, вехи, распределение ресурсов."""
    if event.get("httpMethod") == "OPTIONS":
        return cors({})

    headers = event.get("headers") or {}
    conn = psycopg2.connect(DB)
    try:
        user = authenticate(conn, headers)
        if not user:
            return cors({"ok": False, "error": {"message": "Не авторизован"}}, 401)

        qs = event.get("queryStringParameters") or {}
        action = qs.get("action", "list")
        body = json.loads(event["body"]) if event.get("body") else {}
        cur = conn.cursor()
        pid = int(qs["plan_id"]) if qs.get("plan_id") else None

        if action == "list":
            return cors({"ok": True, "data": {
                "plans": list_plans(cur),
                "refs": refs(cur),
            }})

        if action == "plan":
            if not pid:
                return cors({"ok": False, "error": {"message": "Не указан план"}}, 400)
            data = plan_detail(cur, pid)
            if not data:
                return cors({"ok": False, "error": {"message": "План не найден"}}, 404)
            return cors({"ok": True, "data": {
                "plan": data,
                "refs": refs(cur),
                "load": resource_load(cur, pid),
            }})

        if action == "resource_load":
            return cors({"ok": True, "data": resource_load(cur, pid)})

        if action == "save_plan":
            new_id, err = save_plan(cur, body, user["email"])
            if err:
                return cors({"ok": False, "error": {"message": err}}, 400)
            conn.commit()
            return cors({"ok": True, "data": {"id": new_id}})

        if action == "save_step":
            new_id, err = save_step(cur, body)
            if err:
                return cors({"ok": False, "error": {"message": err}}, 400)
            if "assignee_ids" in body:
                set_assignees(cur, new_id, body.get("assignee_ids") or [],
                              body.get("assignee_workloads") or {})
            conn.commit()
            return cors({"ok": True, "data": {"id": new_id}})

        if action == "set_assignees":
            step_id = as_int(body.get("step_id"))
            if not step_id:
                return cors({"ok": False, "error": {"message": "Не указан шаг"}}, 400)
            set_assignees(cur, step_id, body.get("person_ids") or [],
                          body.get("workloads") or {})
            conn.commit()
            return cors({"ok": True, "data": {"step_id": step_id}})

        if action == "ai_apply":
            plan_id = as_int(body.get("plan_id"))
            steps = body.get("steps") or []
            if not plan_id:
                return cors({"ok": False, "error": {"message": "Не указан план"}}, 400)
            if not steps:
                return cors({"ok": False, "error": {"message": "Нет шагов для добавления"}}, 400)
            created = apply_ai_steps(cur, plan_id, steps)
            conn.commit()
            return cors({"ok": True, "data": {"plan_id": plan_id, "created": created}})

        if action == "reorder":
            for item in body.get("items") or []:
                cur.execute(
                    f"UPDATE {SCHEMA}.exec_plan_step SET sort_order = %s, "
                    f"parent_step_id = %s, updated_at = now() WHERE id = %s",
                    (as_int(item.get("sort_order")) or 0,
                     as_int(item.get("parent_step_id")),
                     as_int(item.get("id"))),
                )
            conn.commit()
            return cors({"ok": True, "data": {"updated": len(body.get("items") or [])}})

        if action == "delete_step":
            step_id = as_int(body.get("id")) or as_int(qs.get("id"))
            if not step_id:
                return cors({"ok": False, "error": {"message": "Не указан шаг"}}, 400)
            cur.execute(
                f"UPDATE {SCHEMA}.exec_plan_step SET status = 'cancelled', updated_at = now() "
                f"WHERE id = %s OR parent_step_id = %s",
                (step_id, step_id),
            )
            conn.commit()
            return cors({"ok": True, "data": {"id": step_id}})

        if action == "delete_plan":
            plan_id = as_int(body.get("id")) or as_int(qs.get("id"))
            if not plan_id:
                return cors({"ok": False, "error": {"message": "Не указан план"}}, 400)
            cur.execute(
                f"UPDATE {SCHEMA}.exec_plan SET status = 'archived', updated_at = now() WHERE id = %s",
                (plan_id,),
            )
            conn.commit()
            return cors({"ok": True, "data": {"id": plan_id}})

        return cors({"ok": False, "error": {"message": f"Неизвестное действие: {action}"}}, 400)
    finally:
        conn.close()