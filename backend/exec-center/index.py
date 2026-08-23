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
    if v is None:
        return None
    if isinstance(v, str) and not v.strip():
        return None
    return v


def as_int(v):
    v = nz(v)
    try:
        return int(v) if v is not None else None
    except (TypeError, ValueError):
        return None


def as_num(v):
    v = nz(v)
    if v is None:
        return None
    try:
        return round(float(str(v).replace(",", ".")), 2)
    except (TypeError, ValueError):
        return None


CENTER_FIELDS = [
    "title", "short_name", "status", "parent_org", "head_person_id",
    "mission", "rationale", "problem_statement", "scope_included",
    "scope_excluded", "success_criteria", "planned_headcount",
    "start_date", "review_date", "initiative_id", "plan_id", "note",
]
GOAL_FIELDS = [
    "center_id", "parent_goal_id", "kind", "title", "description", "metric",
    "baseline_value", "target_value", "horizon", "due_date",
    "owner_person_id", "status", "progress_pct", "sort_order",
]
FUNC_FIELDS = [
    "center_id", "code", "title", "description", "purpose", "result_description",
    "goal_id", "criticality",
    "regularity", "hours_per_month", "fte_estimate", "status", "sort_order", "note",
]

# Источник истины перенесён: эти поля больше не пишутся
DEPRECATED_WRITE = {
    "owner_person_id": "владелец функции задаётся через RACI (роль A)",
    "backup_person_id": "замещающий задаётся через RACI (признак замещения)",
    "responsible_person_id": "ответственный задаётся через назначения на шаг (роль A)",
    "fact_hours": "фактические часы вносятся через учёт времени",
}


def guard_deprecated(d: dict):
    bad = [f"{k} — {v}" for k, v in DEPRECATED_WRITE.items() if k in d]
    return "Эти поля больше не редактируются: " + "; ".join(bad) if bad else None
ROLE_FIELDS = [
    "center_id", "title", "purpose", "duties", "requirements", "headcount",
    "hours_per_week", "grade", "person_id", "status", "justification", "sort_order",
]

INT_KEYS = {
    "head_person_id", "planned_headcount", "initiative_id", "plan_id",
    "center_id", "parent_goal_id", "owner_person_id", "progress_pct",
    "sort_order", "goal_id", "backup_person_id", "person_id",
    "competency_id", "required_level", "function_id", "dept_function_id",
    "step_id", "share_pct",
}
NUM_KEYS = {"hours_per_month", "fte_estimate", "headcount", "hours_per_week"}


def clean(d: dict, fields: list) -> dict:
    vals = {}
    for f in fields:
        if f not in d:
            continue
        v = d.get(f)
        if f in INT_KEYS:
            v = as_int(v)
        elif f in NUM_KEYS:
            v = as_num(v)
        else:
            v = nz(v)
        vals[f] = v
    return vals


def upsert(cur, table: str, fields: list, d: dict, require_title: bool = True):
    """Создаёт или обновляет запись. Возвращает (id, ошибка)."""
    rid = as_int(d.get("id"))
    vals = clean(d, fields)
    if require_title and not rid and not vals.get("title"):
        return None, "Не указано название"
    if not vals:
        return rid, None
    if rid:
        sets = ", ".join(f"{k} = %s" for k in vals)
        cur.execute(
            f"UPDATE {SCHEMA}.{table} SET {sets}, updated_at = now() WHERE id = %s RETURNING id",
            list(vals.values()) + [rid],
        )
    else:
        cols = ", ".join(vals)
        ph = ", ".join(["%s"] * len(vals))
        cur.execute(
            f"INSERT INTO {SCHEMA}.{table} ({cols}) VALUES ({ph}) RETURNING id",
            list(vals.values()),
        )
    row = cur.fetchone()
    return (row[0] if row else None), None


def list_centers(cur):
    cur.execute(f"""
        SELECT c.*, p.display_name AS head_name,
               (SELECT COUNT(*) FROM {SCHEMA}.exec_center_function f WHERE f.center_id = c.id) AS functions_count,
               (SELECT COUNT(*) FROM {SCHEMA}.exec_center_goal g WHERE g.center_id = c.id AND g.kind = 'goal') AS goals_count,
               (SELECT COALESCE(SUM(r.headcount), 0) FROM {SCHEMA}.exec_center_role r WHERE r.center_id = c.id) AS roles_headcount
        FROM {SCHEMA}.exec_center c
        LEFT JOIN {SCHEMA}.exec_person p ON p.id = c.head_person_id
        WHERE c.status <> 'archived'
        ORDER BY c.id DESC
    """)
    return rows(cur)


def center_detail(cur, center_id: int):
    cur.execute(f"""
        SELECT c.*, p.display_name AS head_name, i.title AS initiative_title,
               pl.title AS plan_title
        FROM {SCHEMA}.exec_center c
        LEFT JOIN {SCHEMA}.exec_person p ON p.id = c.head_person_id
        LEFT JOIN {SCHEMA}.exec_initiative i ON i.id = c.initiative_id
        LEFT JOIN {SCHEMA}.exec_plan pl ON pl.id = c.plan_id
        WHERE c.id = %s
    """, (center_id,))
    got = rows(cur)
    if not got:
        return None
    center = got[0]

    cur.execute(f"""
        SELECT g.*, p.display_name AS owner_name
        FROM {SCHEMA}.exec_center_goal g
        LEFT JOIN {SCHEMA}.exec_person p ON p.id = g.owner_person_id
        WHERE g.center_id = %s
        ORDER BY g.sort_order, g.id
    """, (center_id,))
    center["goals"] = rows(cur)

    # По каждой функции считаем связанные шаги плана.
    # Владелец и замещающий читаются ТОЛЬКО из exec_function_raci.
    cur.execute(f"""
        SELECT f.*,
               (SELECT pr.display_name FROM {SCHEMA}.exec_function_raci r
                  JOIN {SCHEMA}.exec_person pr ON pr.id = r.person_id
                 WHERE r.function_id = f.id AND r.raci_role = 'A'
                   AND r.valid_to IS NULL AND r.is_backup = false LIMIT 1) AS owner_name,
               (SELECT r.person_id FROM {SCHEMA}.exec_function_raci r
                 WHERE r.function_id = f.id AND r.raci_role = 'A'
                   AND r.valid_to IS NULL AND r.is_backup = false LIMIT 1) AS owner_id,
               (SELECT pr.display_name FROM {SCHEMA}.exec_function_raci r
                  JOIN {SCHEMA}.exec_person pr ON pr.id = r.person_id
                 WHERE r.function_id = f.id AND r.is_backup = true
                   AND r.valid_to IS NULL LIMIT 1) AS backup_name,
               (SELECT COUNT(*) FROM {SCHEMA}.exec_function_competency fc
                 WHERE fc.function_id = f.id) AS competency_count,
               (SELECT COUNT(*) FROM {SCHEMA}.exec_function_initiative fi
                 WHERE fi.function_id = f.id) AS initiative_count,
               g.title AS goal_title,
               (SELECT COUNT(*) FROM {SCHEMA}.exec_plan_step_function sf
                  JOIN {SCHEMA}.exec_plan_step s ON s.id = sf.step_id
                WHERE sf.function_id = f.id AND s.status <> 'cancelled') AS steps_total,
               (SELECT COUNT(*) FROM {SCHEMA}.exec_plan_step_function sf
                  JOIN {SCHEMA}.exec_plan_step s ON s.id = sf.step_id
                WHERE sf.function_id = f.id AND s.status = 'done') AS steps_done,
               (SELECT COUNT(*) FROM {SCHEMA}.exec_plan_step_function sf
                  JOIN {SCHEMA}.exec_plan_step s ON s.id = sf.step_id
                WHERE sf.function_id = f.id AND s.status NOT IN ('done','cancelled')
                  AND s.due_date < CURRENT_DATE) AS steps_overdue
        FROM {SCHEMA}.exec_center_function f
        LEFT JOIN {SCHEMA}.exec_center_goal g ON g.id = f.goal_id
        WHERE f.center_id = %s
        ORDER BY f.sort_order, f.id
    """, (center_id,))
    center["functions"] = rows(cur)

    cur.execute(f"""
        SELECT r.*, p.display_name AS person_name,
               COALESCE((
                   SELECT json_agg(rf.function_id)
                   FROM {SCHEMA}.exec_center_role_function rf WHERE rf.role_id = r.id
               ), '[]'::json) AS function_ids
        FROM {SCHEMA}.exec_center_role r
        LEFT JOIN {SCHEMA}.exec_person p ON p.id = r.person_id
        WHERE r.center_id = %s
        ORDER BY r.sort_order, r.id
    """, (center_id,))
    center["roles"] = rows(cur)

    return center


def center_stats(cur, center_id: int):
    """Сводка для обоснования: покрытие функций, объём работы, штат."""
    cur.execute(f"""
        SELECT
            COUNT(*) AS functions,
            COUNT(*) FILTER (WHERE NOT EXISTS (
                SELECT 1 FROM {SCHEMA}.exec_function_raci r
                WHERE r.function_id = f.id AND r.raci_role = 'A'
                  AND r.valid_to IS NULL AND r.is_backup = false)) AS functions_no_owner,
            COUNT(*) FILTER (WHERE criticality = 'high') AS critical_functions,
            COUNT(*) FILTER (WHERE criticality = 'high' AND NOT EXISTS (
                SELECT 1 FROM {SCHEMA}.exec_function_raci r
                WHERE r.function_id = f.id AND r.is_backup = true
                  AND r.valid_to IS NULL)) AS critical_no_backup,
            ROUND(COALESCE(SUM(hours_per_month), 0), 1) AS hours_per_month,
            ROUND(COALESCE(SUM(fte_estimate), 0), 2) AS fte_total
        FROM {SCHEMA}.exec_center_function f WHERE center_id = %s
    """, (center_id,))
    fn = rows(cur)
    cur.execute(f"""
        SELECT
            COUNT(*) AS roles,
            ROUND(COALESCE(SUM(headcount), 0), 2) AS headcount,
            ROUND(COALESCE(SUM(headcount) FILTER (WHERE person_id IS NOT NULL), 0), 2) AS headcount_filled,
            COUNT(*) FILTER (WHERE person_id IS NULL) AS vacant_roles
        FROM {SCHEMA}.exec_center_role WHERE center_id = %s
    """, (center_id,))
    rl = rows(cur)
    cur.execute(f"""
        SELECT
            COUNT(*) FILTER (WHERE kind = 'goal') AS goals,
            COUNT(*) FILTER (WHERE kind = 'task') AS tasks,
            COUNT(*) FILTER (WHERE kind = 'goal' AND metric IS NULL) AS goals_no_metric
        FROM {SCHEMA}.exec_center_goal WHERE center_id = %s
    """, (center_id,))
    gl = rows(cur)
    out = {}
    out.update(fn[0] if fn else {})
    out.update(rl[0] if rl else {})
    out.update(gl[0] if gl else {})
    return out


def refs(cur):
    cur.execute(f"""
        SELECT id, display_name, position_title, org_name
        FROM {SCHEMA}.exec_person
        WHERE COALESCE(record_state, 'active') = 'active'
        ORDER BY display_name
    """)
    persons = rows(cur)
    cur.execute(f"SELECT id, title FROM {SCHEMA}.exec_initiative ORDER BY id DESC")
    initiatives = rows(cur)
    cur.execute(
        f"SELECT id, title FROM {SCHEMA}.exec_plan WHERE status <> 'archived' ORDER BY id DESC"
    )
    plans = rows(cur)
    return {"persons": persons, "initiatives": initiatives, "plans": plans}


def handler(event: dict, context) -> dict:
    """Паспорт центра: цели, задачи, функции и штатная потребность."""
    method = event.get("httpMethod", "GET")
    if method == "OPTIONS":
        return cors({})

    qs = event.get("queryStringParameters") or {}
    headers = event.get("headers") or {}
    action = qs.get("action") or ""
    body = {}
    if event.get("body"):
        try:
            body = json.loads(event["body"])
        except (ValueError, TypeError):
            body = {}
    if not action:
        action = body.get("action") or ""

    conn = psycopg2.connect(DB)
    try:
        user = authenticate(conn, headers)
        if not user:
            return cors({"ok": False, "error": {"message": "Требуется вход"}}, 401)

        cur = conn.cursor()
        cid = as_int(qs.get("center_id")) or as_int(body.get("center_id"))

        if action == "list":
            return cors({"ok": True, "data": list_centers(cur)})

        if action == "refs":
            return cors({"ok": True, "data": refs(cur)})

        if action == "center":
            if not cid:
                return cors({"ok": False, "error": {"message": "Не указан центр"}}, 400)
            data = center_detail(cur, cid)
            if not data:
                return cors({"ok": False, "error": {"message": "Центр не найден"}}, 404)
            return cors({"ok": True, "data": {
                "center": data,
                "stats": center_stats(cur, cid),
                "refs": refs(cur),
            }})

        if action == "save_center":
            new_id, err = upsert(cur, "exec_center", CENTER_FIELDS, body)
            if err:
                return cors({"ok": False, "error": {"message": err}}, 400)
            conn.commit()
            return cors({"ok": True, "data": {"id": new_id}})

        if action == "save_goal":
            if not as_int(body.get("id")) and not as_int(body.get("center_id")):
                return cors({"ok": False, "error": {"message": "Не указан центр"}}, 400)
            new_id, err = upsert(cur, "exec_center_goal", GOAL_FIELDS, body)
            if err:
                return cors({"ok": False, "error": {"message": err}}, 400)
            conn.commit()
            return cors({"ok": True, "data": {"id": new_id}})

        if action == "save_function":
            dep = guard_deprecated(body)
            if dep:
                return cors({"ok": False, "error": {"message": dep}}, 400)
            if not as_int(body.get("id")) and not as_int(body.get("center_id")):
                return cors({"ok": False, "error": {"message": "Не указан центр"}}, 400)
            new_id, err = upsert(cur, "exec_center_function", FUNC_FIELDS, body)
            if err:
                return cors({"ok": False, "error": {"message": err}}, 400)
            conn.commit()
            return cors({"ok": True, "data": {"id": new_id}})

        if action == "save_role":
            if not as_int(body.get("id")) and not as_int(body.get("center_id")):
                return cors({"ok": False, "error": {"message": "Не указан центр"}}, 400)
            new_id, err = upsert(cur, "exec_center_role", ROLE_FIELDS, body)
            if err:
                return cors({"ok": False, "error": {"message": err}}, 400)
            fn_ids = body.get("function_ids")
            if new_id and isinstance(fn_ids, list):
                cur.execute(
                    f"DELETE FROM {SCHEMA}.exec_center_role_function WHERE role_id = %s",
                    (new_id,),
                )
                for f in fn_ids:
                    fid = as_int(f)
                    if fid:
                        cur.execute(
                            f"INSERT INTO {SCHEMA}.exec_center_role_function (role_id, function_id) "
                            f"VALUES (%s, %s) ON CONFLICT DO NOTHING",
                            (new_id, fid),
                        )
            conn.commit()
            return cors({"ok": True, "data": {"id": new_id}})

        if action == "function_detail":
            fid = as_int(qs.get("function_id")) or as_int(body.get("function_id"))
            if not fid:
                return cors({"ok": False, "error": {"message": "Не указана функция"}}, 400)
            cur.execute(f"""
                SELECT r.*, p.display_name AS person_name, p.position_title
                FROM {SCHEMA}.exec_function_raci r
                JOIN {SCHEMA}.exec_person p ON p.id = r.person_id
                WHERE r.function_id = %s
                ORDER BY r.raci_role, r.is_backup, p.display_name
            """, (fid,))
            raci = rows(cur)
            cur.execute(f"""
                SELECT fc.*, c.name AS competency_name, c.code AS competency_code
                FROM {SCHEMA}.exec_function_competency fc
                JOIN {SCHEMA}.professional_competencies c ON c.id = fc.competency_id
                WHERE fc.function_id = %s ORDER BY fc.is_critical DESC, c.name
            """, (fid,))
            comps = rows(cur)
            cur.execute(f"""
                SELECT fi.*, i.title AS initiative_title
                FROM {SCHEMA}.exec_function_initiative fi
                JOIN {SCHEMA}.exec_initiative i ON i.id = fi.initiative_id
                WHERE fi.function_id = %s ORDER BY i.title
            """, (fid,))
            inits = rows(cur)
            cur.execute(f"""
                SELECT df.center_function_id, df.dept_function_id, d.title AS dept_function_title
                FROM {SCHEMA}.exec_center_function_dept_function df
                JOIN {SCHEMA}.dept_functions d ON d.id = df.dept_function_id
                WHERE df.center_function_id = %s
            """, (fid,))
            depts = rows(cur)
            cur.execute(f"""
                SELECT s.id, s.title, s.status, s.due_date, s.estimate_hours, sf.is_primary
                FROM {SCHEMA}.exec_plan_step_function sf
                JOIN {SCHEMA}.exec_plan_step s ON s.id = sf.step_id
                WHERE sf.function_id = %s AND s.status <> 'cancelled'
                ORDER BY s.due_date NULLS LAST
            """, (fid,))
            steps = rows(cur)
            return cors({"ok": True, "data": {
                "raci": raci, "competencies": comps, "initiatives": inits,
                "dept_functions": depts, "steps": steps,
            }})

        if action == "save_raci":
            fid = as_int(body.get("function_id"))
            pid = as_int(body.get("person_id"))
            role = (nz(body.get("raci_role")) or "R").upper()[:1]
            if not fid or not pid or role not in ("R", "A", "C", "I"):
                return cors({"ok": False, "error": {"message": "Укажите функцию, человека и роль"}}, 400)
            is_backup = bool(body.get("is_backup"))
            # Владелец единственный: прежнего закрываем датой
            if role == "A" and not is_backup:
                cur.execute(
                    f"UPDATE {SCHEMA}.exec_function_raci SET valid_to = CURRENT_DATE "
                    f"WHERE function_id = %s AND raci_role = 'A' AND valid_to IS NULL "
                    f"AND is_backup = false AND person_id <> %s",
                    (fid, pid),
                )
            cur.execute(f"""
                INSERT INTO {SCHEMA}.exec_function_raci
                    (function_id, person_id, raci_role, is_backup, valid_from, note)
                VALUES (%s, %s, %s, %s, COALESCE(%s::date, CURRENT_DATE), %s)
                ON CONFLICT (function_id, person_id, raci_role, valid_from) DO UPDATE
                SET is_backup = EXCLUDED.is_backup, note = EXCLUDED.note, valid_to = NULL
                RETURNING id
            """, (fid, pid, role, is_backup, nz(body.get("valid_from")), nz(body.get("note"))))
            rid = cur.fetchone()[0]
            conn.commit()
            return cors({"ok": True, "data": {"id": rid}})

        if action == "close_raci":
            rid = as_int(body.get("id"))
            if not rid:
                return cors({"ok": False, "error": {"message": "Не указано назначение"}}, 400)
            cur.execute(
                f"UPDATE {SCHEMA}.exec_function_raci SET valid_to = COALESCE(%s::date, CURRENT_DATE) "
                f"WHERE id = %s", (nz(body.get("valid_to")), rid),
            )
            conn.commit()
            return cors({"ok": True, "data": {"id": rid}})

        if action == "save_function_competency":
            fid = as_int(body.get("function_id"))
            cid = as_int(body.get("competency_id"))
            if not fid or not cid:
                return cors({"ok": False, "error": {"message": "Укажите функцию и компетенцию"}}, 400)
            cur.execute(f"""
                INSERT INTO {SCHEMA}.exec_function_competency
                    (function_id, competency_id, required_level, is_critical, note)
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT (function_id, competency_id) DO UPDATE
                SET required_level = EXCLUDED.required_level,
                    is_critical = EXCLUDED.is_critical, note = EXCLUDED.note
                RETURNING id
            """, (fid, cid, as_int(body.get("required_level")) or 3,
                  bool(body.get("is_critical")), nz(body.get("note"))))
            rid = cur.fetchone()[0]
            conn.commit()
            return cors({"ok": True, "data": {"id": rid}})

        if action == "link_function_initiative":
            fid = as_int(body.get("function_id"))
            iid = as_int(body.get("initiative_id"))
            if not fid or not iid:
                return cors({"ok": False, "error": {"message": "Укажите функцию и инициативу"}}, 400)
            cur.execute(f"""
                INSERT INTO {SCHEMA}.exec_function_initiative
                    (function_id, initiative_id, role_in_initiative, valid_from, valid_to, note)
                VALUES (%s, %s, %s, %s, %s, %s)
                ON CONFLICT (function_id, initiative_id, role_in_initiative) DO UPDATE
                SET note = EXCLUDED.note RETURNING id
            """, (fid, iid, nz(body.get("role_in_initiative")) or "supports",
                  nz(body.get("valid_from")), nz(body.get("valid_to")), nz(body.get("note"))))
            rid = cur.fetchone()[0]
            conn.commit()
            return cors({"ok": True, "data": {"id": rid}})

        if action == "link_dept_function":
            fid = as_int(body.get("function_id"))
            did = as_int(body.get("dept_function_id"))
            if not fid or not did:
                return cors({"ok": False, "error": {"message": "Укажите обе функции"}}, 400)
            cur.execute(f"""
                INSERT INTO {SCHEMA}.exec_center_function_dept_function
                    (center_function_id, dept_function_id, coverage_note)
                VALUES (%s, %s, %s)
                ON CONFLICT (center_function_id, dept_function_id) DO UPDATE
                SET coverage_note = EXCLUDED.coverage_note
            """, (fid, did, nz(body.get("coverage_note"))))
            conn.commit()
            return cors({"ok": True, "data": {"function_id": fid}})

        if action == "unlink":
            kind = nz(body.get("kind"))
            fid = as_int(body.get("function_id"))
            if kind == "initiative":
                cur.execute(
                    f"DELETE FROM {SCHEMA}.exec_function_initiative WHERE id = %s",
                    (as_int(body.get("id")),))
            elif kind == "competency":
                cur.execute(
                    f"DELETE FROM {SCHEMA}.exec_function_competency WHERE id = %s",
                    (as_int(body.get("id")),))
            elif kind == "dept_function":
                cur.execute(
                    f"DELETE FROM {SCHEMA}.exec_center_function_dept_function "
                    f"WHERE center_function_id = %s AND dept_function_id = %s",
                    (fid, as_int(body.get("dept_function_id"))))
            elif kind == "step":
                cur.execute(
                    f"DELETE FROM {SCHEMA}.exec_plan_step_function "
                    f"WHERE function_id = %s AND step_id = %s",
                    (fid, as_int(body.get("step_id"))))
            else:
                return cors({"ok": False, "error": {"message": "Не указан тип связи"}}, 400)
            conn.commit()
            return cors({"ok": True, "data": {"ok": True}})

        if action == "link_steps":
            # Привязать шаги плана к функции центра
            fid = as_int(body.get("function_id"))
            ids = [as_int(x) for x in (body.get("step_ids") or []) if as_int(x)]
            if not ids:
                return cors({"ok": False, "error": {"message": "Не выбраны шаги"}}, 400)
            if not fid:
                return cors({"ok": False, "error": {"message": "Не указана функция"}}, 400)
            primary = bool(body.get("is_primary"))
            if primary:
                cur.execute(
                    f"UPDATE {SCHEMA}.exec_plan_step_function SET is_primary = false "
                    f"WHERE step_id = ANY(%s)", (ids,),
                )
            for sid in ids:
                cur.execute(
                    f"INSERT INTO {SCHEMA}.exec_plan_step_function (step_id, function_id, is_primary) "
                    f"VALUES (%s, %s, %s) ON CONFLICT (step_id, function_id) "
                    f"DO UPDATE SET is_primary = EXCLUDED.is_primary",
                    (sid, fid, primary),
                )
            conn.commit()
            return cors({"ok": True, "data": {"updated": len(ids)}})

        if action in ("delete_goal", "delete_function", "delete_role"):
            table = {
                "delete_goal": "exec_center_goal",
                "delete_function": "exec_center_function",
                "delete_role": "exec_center_role",
            }[action]
            rid = as_int(body.get("id")) or as_int(qs.get("id"))
            if not rid:
                return cors({"ok": False, "error": {"message": "Не указана запись"}}, 400)
            # Сначала снимаем связи, затем саму запись
            if action == "delete_function":
                for t, col in (
                    ("exec_function_raci", "function_id"),
                    ("exec_function_competency", "function_id"),
                    ("exec_function_initiative", "function_id"),
                    ("exec_plan_step_function", "function_id"),
                    ("exec_center_role_function", "function_id"),
                    ("exec_center_function_dept_function", "center_function_id"),
                ):
                    cur.execute(f"DELETE FROM {SCHEMA}.{t} WHERE {col} = %s", (rid,))
                cur.execute(
                    f"UPDATE {SCHEMA}.exec_plan_step SET center_function_id = NULL "
                    f"WHERE center_function_id = %s", (rid,))
                cur.execute(
                    f"UPDATE {SCHEMA}.exec_risk SET center_function_id = NULL "
                    f"WHERE center_function_id = %s", (rid,))
            elif action == "delete_goal":
                cur.execute(f"DELETE FROM {SCHEMA}.exec_center_kpi_value WHERE goal_id = %s", (rid,))
                cur.execute(
                    f"UPDATE {SCHEMA}.exec_center_function SET goal_id = NULL WHERE goal_id = %s",
                    (rid,))
                cur.execute(
                    f"UPDATE {SCHEMA}.exec_center_goal SET parent_goal_id = NULL "
                    f"WHERE parent_goal_id = %s", (rid,))
            elif action == "delete_role":
                cur.execute(f"DELETE FROM {SCHEMA}.exec_center_role_function WHERE role_id = %s", (rid,))
                cur.execute(
                    f"UPDATE {SCHEMA}.exec_role_assignment SET center_role_id = NULL "
                    f"WHERE center_role_id = %s", (rid,))
            cur.execute(f"DELETE FROM {SCHEMA}.{table} WHERE id = %s", (rid,))
            conn.commit()
            return cors({"ok": True, "data": {"id": rid}})

        if action == "delete_center":
            rid = as_int(body.get("id")) or as_int(qs.get("id"))
            if not rid:
                return cors({"ok": False, "error": {"message": "Не указан центр"}}, 400)
            cur.execute(
                f"UPDATE {SCHEMA}.exec_center SET status = 'archived', updated_at = now() WHERE id = %s",
                (rid,),
            )
            conn.commit()
            return cors({"ok": True, "data": {"id": rid}})

        return cors({"ok": False, "error": {"message": f"Неизвестное действие: {action}"}}, 400)
    finally:
        conn.close()