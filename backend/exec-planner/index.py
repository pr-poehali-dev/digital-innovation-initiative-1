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
    "fact_date", "depends_on_step_id", "is_control_point",
    "progress_pct", "workload_pct", "sort_order", "result_criteria",
    "result_evidence", "note", "parent_step_id",
    "estimate_hours", "fact_hours",
]
NUM_FIELDS = {"estimate_hours", "fact_hours"}
INT_FIELDS = {
    "depends_on_step_id", "progress_pct",
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
               (SELECT pr.display_name FROM {SCHEMA}.exec_plan_assignee a
                  JOIN {SCHEMA}.exec_person pr ON pr.id = a.person_id
                 WHERE a.step_id = s.id AND a.raci_role = 'A' LIMIT 1) AS responsible_name,
               (SELECT pr.position_title FROM {SCHEMA}.exec_plan_assignee a
                  JOIN {SCHEMA}.exec_person pr ON pr.id = a.person_id
                 WHERE a.step_id = s.id AND a.raci_role = 'A' LIMIT 1) AS responsible_position,
               d.title AS depends_on_title,
               (s.due_date < CURRENT_DATE AND s.status NOT IN ('done','cancelled')) AS is_overdue
        FROM {SCHEMA}.exec_plan_step s
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
        ORDER BY CASE a.raci_role WHEN 'A' THEN 1 WHEN 'R' THEN 2
                                  WHEN 'C' THEN 3 ELSE 4 END, a.id
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
    """Загрузка людей: шаги, проценты участия и трудозатраты в часах."""
    scope = "WHERE s.status <> 'cancelled'"
    params = []
    if plan_id:
        scope += " AND s.plan_id = %s"
        params.append(plan_id)

    # Часы шага делятся между всеми исполнителями пропорционально их участию
    cur.execute(f"""
        WITH people AS (
            -- Единственный источник: назначения на шаг, включая ответственного (A)
            SELECT a.step_id, a.person_id, COALESCE(a.workload_pct, 100) AS pct
            FROM {SCHEMA}.exec_plan_assignee a
        ), linked AS (
            SELECT s.id AS step_id, s.status, s.due_date, s.fact_date,
                   s.start_date, s.progress_pct, s.title,
                   s.estimate_hours, s.fact_hours,
                   a.person_id, a.pct,
                   SUM(a.pct) OVER (PARTITION BY s.id) AS step_pct_total
            FROM people a
            JOIN {SCHEMA}.exec_plan_step s ON s.id = a.step_id
            {scope}
        ), shared AS (
            SELECT l.*,
                   l.pct::numeric / NULLIF(l.step_pct_total, 0) AS share
            FROM linked l
        )
        SELECT pe.id AS person_id, pe.display_name, pe.position_title,
               COUNT(*) FILTER (WHERE sh.status NOT IN ('done')) AS active_steps,
               COUNT(*) AS total_steps,
               COUNT(*) FILTER (WHERE sh.status = 'done') AS done_steps,
               COUNT(*) FILTER (WHERE sh.status = 'in_progress') AS in_progress_steps,
               COUNT(*) FILTER (WHERE sh.status = 'blocked') AS blocked_steps,
               COUNT(*) FILTER (
                   WHERE sh.status NOT IN ('done') AND sh.due_date < CURRENT_DATE
               ) AS overdue_steps,
               COALESCE(SUM(sh.pct) FILTER (WHERE sh.status NOT IN ('done')), 0) AS total_workload,
               ROUND(COALESCE(SUM(sh.estimate_hours * sh.share), 0), 1) AS plan_hours,
               ROUND(COALESCE(SUM(sh.fact_hours * sh.share), 0), 1) AS fact_hours,
               ROUND(COALESCE(SUM(sh.estimate_hours * sh.share)
                     FILTER (WHERE sh.status NOT IN ('done')), 0), 1) AS open_hours,
               COUNT(*) FILTER (
                   WHERE sh.status NOT IN ('done') AND sh.estimate_hours IS NULL
               ) AS unestimated_steps
        FROM shared sh
        JOIN {SCHEMA}.exec_person pe ON pe.id = sh.person_id
        GROUP BY pe.id, pe.display_name, pe.position_title
        ORDER BY total_workload DESC, active_steps DESC
    """, params)
    return rows(cur)


def labor_summary(cur, plan_id):
    """Сводка трудозатрат по плану: часы план/факт и разрез по разделам."""
    cur.execute(f"""
        SELECT
            COUNT(*) AS steps,
            COUNT(*) FILTER (WHERE estimate_hours IS NOT NULL) AS estimated_steps,
            ROUND(COALESCE(SUM(estimate_hours), 0), 1) AS plan_hours,
            ROUND(COALESCE(SUM(fact_hours), 0), 1) AS fact_hours,
            ROUND(COALESCE(SUM(estimate_hours) FILTER (WHERE status = 'done'), 0), 1) AS done_plan_hours,
            ROUND(COALESCE(SUM(fact_hours) FILTER (WHERE status = 'done'), 0), 1) AS done_fact_hours,
            ROUND(COALESCE(SUM(estimate_hours) FILTER (WHERE status <> 'done'), 0), 1) AS left_hours,
            COUNT(*) FILTER (
                WHERE status <> 'done'
                  AND NOT EXISTS (
                      SELECT 1 FROM {SCHEMA}.exec_plan_assignee a
                      WHERE a.step_id = {SCHEMA}.exec_plan_step.id
                        AND a.raci_role = 'A'
                  )
            ) AS unassigned_steps
        FROM {SCHEMA}.exec_plan_step
        WHERE plan_id = %s AND status <> 'cancelled'
    """, (plan_id,))
    totals = rows(cur)
    return totals[0] if totals else {}


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
        elif f in NUM_FIELDS:
            try:
                v = round(float(str(v).replace(",", ".")), 1) if nz(v) is not None else None
            except (TypeError, ValueError):
                v = None
            if v is not None and (v < 0 or v > 99999):
                v = None
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
    """Обновляет исполнителей (роль R). Ответственный (A) и часы не затрагиваются:
    ими управляет раздел «Команда» через exec_plan_assignee."""
    ids = [int(p) for p in (person_ids or [])]

    cur.execute(
        f"DELETE FROM {SCHEMA}.exec_plan_assignee "
        f"WHERE step_id = %s AND raci_role = 'R' AND person_id <> ALL(%s)",
        (step_id, ids or [0]),
    )
    for p in ids:
        cur.execute(
            f"INSERT INTO {SCHEMA}.exec_plan_assignee "
            f"(step_id, person_id, raci_role, workload_pct) "
            f"VALUES (%s, %s, 'R', %s) ON CONFLICT (step_id, person_id, raci_role) "
            f"DO UPDATE SET workload_pct = EXCLUDED.workload_pct",
            (step_id, p, int(workloads.get(str(p), workloads.get(p, 100)) or 100)),
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
            f"(plan_id, title, description, result_criteria, is_control_point, "
            f" start_date, due_date, sort_order) "
            f"VALUES (%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id",
            (plan_id, str(s["title"]).strip()[:500], nz(s.get("description")),
             nz(s.get("result_criteria")), bool(s.get("is_milestone")),
             nz(s.get("start_date")), nz(s.get("due_date")), order),
        )
        parent_id = cur.fetchone()[0]
        created += 1
        add_responsible(cur, parent_id, as_int(s.get("responsible_person_id")))

        sub_order = 0
        for sub in s.get("substeps") or []:
            if not isinstance(sub, dict) or not (sub.get("title") or "").strip():
                continue
            sub_order += 1
            cur.execute(
                f"INSERT INTO {SCHEMA}.exec_plan_step "
                f"(plan_id, parent_step_id, title, start_date, due_date, sort_order) "
                f"VALUES (%s,%s,%s,%s,%s,%s) RETURNING id",
                (plan_id, parent_id, str(sub["title"]).strip()[:500],
                 nz(sub.get("start_date")), nz(sub.get("due_date")), sub_order),
            )
            add_responsible(cur, cur.fetchone()[0], as_int(sub.get("responsible_person_id")))
            created += 1
    return created


def add_responsible(cur, step_id: int, person_id):
    """Ответственный записывается только как назначение с ролью A."""
    if not person_id:
        return
    cur.execute(
        f"INSERT INTO {SCHEMA}.exec_plan_assignee "
        f"(step_id, person_id, raci_role, role_in_step, workload_pct) "
        f"VALUES (%s, %s, 'A', 'responsible', 100) "
        f"ON CONFLICT (step_id, person_id, raci_role) DO NOTHING",
        (step_id, person_id),
    )


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
                "labor": labor_summary(cur, pid),
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