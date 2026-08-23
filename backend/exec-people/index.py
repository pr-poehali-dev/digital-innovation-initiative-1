import json
import os
import hashlib
import psycopg2

DB = os.environ["DATABASE_URL"]
_s = os.environ.get("MAIN_DB_SCHEMA", "").strip()
SCHEMA = _s if _s else "t_p61016064_digital_innovation_i"

# Поля, запрещённые к записи: источник истины перенесён в другие таблицы
DEPRECATED_WRITE = {
    "responsible_person_id",  # -> exec_plan_assignee (raci_role = 'A')
    "owner_person_id",        # -> exec_function_raci (A)
    "backup_person_id",       # -> exec_function_raci (is_backup)
    "fact_hours",             # -> exec_time_entry
    "is_milestone",           # -> is_control_point / exec_milestone
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
    th = hashlib.sha256(token.encode()).hexdigest()
    with conn.cursor() as cur:
        cur.execute(
            f"SELECT actor_email FROM {SCHEMA}.admin_sessions "
            f"WHERE session_token_hash = %s AND expires_at > NOW() AND revoked_at IS NULL LIMIT 1",
            (th,),
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


def norm_name(s: str) -> str:
    import re
    return re.sub(r"\s+", " ", (s or "").lower().replace("ё", "е")).strip()


def audit(cur, actor, entity_type, entity_id, action, before=None, after=None, reason=None):
    cur.execute(
        f"INSERT INTO {SCHEMA}.exec_audit_log "
        f"(entity_type, entity_id, action, actor, before_json, after_json, reason) "
        f"VALUES (%s, %s, %s, %s, %s, %s, %s)",
        (entity_type, entity_id, action, actor,
         json.dumps(before, ensure_ascii=False, default=str) if before else None,
         json.dumps(after, ensure_ascii=False, default=str) if after else None,
         reason),
    )


def guard_deprecated(d: dict):
    """Запрещает запись в поля, чей источник истины перенесён."""
    bad = [k for k in d if k in DEPRECATED_WRITE]
    if bad:
        return (
            "Эти поля больше не редактируются: "
            + ", ".join(bad)
            + ". Ответственный задаётся через назначения (роль A), "
              "владелец функции — через RACI, фактические часы — через учёт времени."
        )
    return None


PERSON_FIELDS = [
    "display_name", "position_title", "org_name", "org_unit_id", "is_external",
    "email", "phone", "employment_type", "employment_status", "note", "record_state",
]


def person_list(cur, q=None):
    where = "WHERE COALESCE(p.record_state, 'active') <> 'archived'"
    params = []
    if q:
        where += " AND p.normalized_name LIKE %s"
        params.append(f"%{norm_name(q)}%")
    cur.execute(f"""
        SELECT p.*,
               c.hours_per_week, c.fte, c.work_schedule,
               (SELECT COUNT(*) FROM {SCHEMA}.exec_person_competency pc
                 WHERE pc.person_id = p.id) AS competency_count,
               (SELECT COUNT(*) FROM {SCHEMA}.exec_function_raci r
                 WHERE r.person_id = p.id AND r.raci_role = 'A' AND r.valid_to IS NULL) AS owned_functions,
               (SELECT COUNT(DISTINCT a.step_id) FROM {SCHEMA}.exec_plan_assignee a
                 JOIN {SCHEMA}.exec_plan_step s ON s.id = a.step_id
                WHERE a.person_id = p.id AND s.status NOT IN ('done', 'cancelled')) AS open_steps,
               (SELECT COUNT(DISTINCT a.step_id) FROM {SCHEMA}.exec_plan_assignee a
                 JOIN {SCHEMA}.exec_plan_step s ON s.id = a.step_id
                WHERE a.person_id = p.id AND s.status NOT IN ('done', 'cancelled')
                  AND s.due_date < CURRENT_DATE) AS overdue_steps
        FROM {SCHEMA}.exec_person p
        LEFT JOIN {SCHEMA}.exec_person_capacity c
               ON c.person_id = p.id AND c.valid_to IS NULL
        {where}
        ORDER BY p.display_name
    """, params)
    return rows(cur)


def person_detail(cur, pid):
    cur.execute(f"SELECT * FROM {SCHEMA}.exec_person WHERE id = %s", (pid,))
    got = rows(cur)
    if not got:
        return None
    person = got[0]

    cur.execute(f"""
        SELECT pc.*, c.name AS competency_name, c.code AS competency_code,
               d.name AS domain_name, cf.display_name AS confirmed_by_name
        FROM {SCHEMA}.exec_person_competency pc
        JOIN {SCHEMA}.professional_competencies c ON c.id = pc.competency_id
        LEFT JOIN {SCHEMA}.professional_competency_domains d ON d.id = c.domain_id
        LEFT JOIN {SCHEMA}.exec_person cf ON cf.id = pc.confirmed_by_person_id
        WHERE pc.person_id = %s
        ORDER BY d.name, c.name
    """, (pid,))
    person["competencies"] = rows(cur)

    cur.execute(f"""
        SELECT * FROM {SCHEMA}.exec_person_capacity
        WHERE person_id = %s ORDER BY valid_from DESC
    """, (pid,))
    person["capacity"] = rows(cur)

    cur.execute(f"""
        SELECT * FROM {SCHEMA}.exec_person_absence
        WHERE person_id = %s AND date_to >= CURRENT_DATE - INTERVAL '1 year'
        ORDER BY date_from DESC
    """, (pid,))
    person["absences"] = rows(cur)

    cur.execute(f"""
        SELECT pr.*, c.name AS competency_name
        FROM {SCHEMA}.exec_person_profile_record pr
        LEFT JOIN {SCHEMA}.professional_competencies c ON c.id = pr.competency_id
        WHERE pr.person_id = %s
        ORDER BY pr.record_type, pr.sort_order, COALESCE(pr.date_from, '1900-01-01') DESC
    """, (pid,))
    person["profile_records"] = rows(cur)

    cur.execute(f"""
        SELECT r.*, f.title AS function_title, f.code AS function_code
        FROM {SCHEMA}.exec_function_raci r
        JOIN {SCHEMA}.exec_center_function f ON f.id = r.function_id
        WHERE r.person_id = %s AND r.valid_to IS NULL
        ORDER BY r.raci_role, f.sort_order
    """, (pid,))
    person["functions"] = rows(cur)

    return person


def find_duplicates(cur, name, exclude_id=None):
    """Поиск похожих карточек: предупреждение, а не запрет."""
    n = norm_name(name)
    if not n:
        return []
    params = [n, n]
    ex = ""
    if exclude_id:
        ex = " AND id <> %s"
        params.append(exclude_id)
    cur.execute(f"""
        SELECT id, display_name, position_title, org_name, record_state
        FROM {SCHEMA}.exec_person
        WHERE (normalized_name = %s OR normalized_name LIKE %s || '%%'){ex}
        ORDER BY display_name LIMIT 10
    """, params)
    return rows(cur)


def capacity_by_week(cur, person_ids, date_from, date_to):
    """Ёмкость по неделям: календарь × (часы в неделю / 40) − отсутствия.

    hours_per_week уже содержит ставку, fte в расчёте не участвует.
    Отсутствие вычитает доступную ёмкость дня, а не фиксированные 8 часов.
    Результат не может быть отрицательным.
    """
    if not person_ids:
        return []
    cur.execute(f"""
        WITH days AS (
            SELECT w.calendar_date, w.work_hours,
                   date_trunc('week', w.calendar_date)::date AS week_start
            FROM {SCHEMA}.exec_work_calendar w
            WHERE w.calendar_date BETWEEN %s AND %s AND w.work_hours > 0
        ), person_days AS (
            SELECT p.id AS person_id, d.calendar_date, d.week_start,
                   d.work_hours * (c.hours_per_week / 40.0) AS day_capacity
            FROM {SCHEMA}.exec_person p
            CROSS JOIN days d
            JOIN {SCHEMA}.exec_person_capacity c
              ON c.person_id = p.id
             AND c.valid_from <= d.calendar_date
             AND (c.valid_to IS NULL OR c.valid_to >= d.calendar_date)
            WHERE p.id = ANY(%s)
        ), absence_day AS (
            -- Полное отсутствие снимает всю ёмкость дня, частичное — указанные часы
            SELECT pd.person_id, pd.calendar_date,
                   MAX(CASE WHEN a.hours_per_day IS NULL
                            THEN pd.day_capacity ELSE a.hours_per_day END) AS lost
            FROM person_days pd
            JOIN {SCHEMA}.exec_person_absence a
              ON a.person_id = pd.person_id
             AND pd.calendar_date BETWEEN a.date_from AND a.date_to
            GROUP BY pd.person_id, pd.calendar_date
        ), with_absence AS (
            SELECT pd.person_id, pd.week_start, pd.calendar_date,
                   GREATEST(pd.day_capacity - COALESCE(ad.lost, 0), 0) AS available
            FROM person_days pd
            LEFT JOIN absence_day ad
                   ON ad.person_id = pd.person_id
                  AND ad.calendar_date = pd.calendar_date
        )
        SELECT person_id, week_start, ROUND(SUM(available), 1) AS capacity_hours
        FROM with_absence
        GROUP BY person_id, week_start
        ORDER BY person_id, week_start
    """, (date_from, date_to, person_ids))
    return rows(cur)


def planned_by_week(cur, person_ids, date_from, date_to):
    """Плановые часы по неделям.

    Приоритет — ручное распределение exec_assignee_week.
    Если его нет, часы назначения равномерно раскладываются
    по рабочим дням календаря между началом и сроком.
    """
    if not person_ids:
        return []
    cur.execute(f"""
        WITH manual AS (
            SELECT a.person_id, aw.week_start, SUM(aw.hours) AS hours
            FROM {SCHEMA}.exec_assignee_week aw
            JOIN {SCHEMA}.exec_plan_assignee a ON a.id = aw.assignee_id
            WHERE a.person_id = ANY(%s) AND aw.week_start BETWEEN %s AND %s
            GROUP BY a.person_id, aw.week_start
        ), auto_src AS (
            SELECT a.id AS assignee_id, a.person_id, a.plan_hours,
                   COALESCE(a.valid_from, s.start_date, s.due_date) AS d_from,
                   COALESCE(a.valid_to, s.due_date, s.start_date) AS d_to
            FROM {SCHEMA}.exec_plan_assignee a
            JOIN {SCHEMA}.exec_plan_step s ON s.id = a.step_id
            WHERE a.person_id = ANY(%s)
              AND a.plan_hours IS NOT NULL
              AND s.status NOT IN ('done', 'cancelled')
              AND NOT EXISTS (SELECT 1 FROM {SCHEMA}.exec_assignee_week x
                               WHERE x.assignee_id = a.id)
        ), auto_days AS (
            SELECT src.assignee_id, src.person_id, src.plan_hours,
                   w.calendar_date, date_trunc('week', w.calendar_date)::date AS week_start,
                   COUNT(*) OVER (PARTITION BY src.assignee_id) AS day_count
            FROM auto_src src
            JOIN {SCHEMA}.exec_work_calendar w
              ON w.calendar_date BETWEEN src.d_from AND src.d_to AND w.work_hours > 0
            WHERE src.d_from IS NOT NULL AND src.d_to IS NOT NULL
        ), auto AS (
            SELECT person_id, week_start,
                   SUM(plan_hours / NULLIF(day_count, 0)) AS hours
            FROM auto_days
            WHERE week_start BETWEEN %s AND %s
            GROUP BY person_id, week_start
        )
        SELECT person_id, week_start, ROUND(SUM(hours), 1) AS planned_hours
        FROM (SELECT * FROM manual UNION ALL SELECT * FROM auto) u
        GROUP BY person_id, week_start
        ORDER BY person_id, week_start
    """, (person_ids, date_from, date_to, person_ids, date_from, date_to))
    return rows(cur)


def workload(cur, date_from, date_to, person_ids=None):
    """Загрузка по неделям с порогами Центра."""
    if not person_ids:
        cur.execute(f"""
            SELECT id FROM {SCHEMA}.exec_person
            WHERE COALESCE(record_state, 'active') = 'active'
        """)
        person_ids = [r["id"] for r in rows(cur)]

    cap = capacity_by_week(cur, person_ids, date_from, date_to)
    plan = planned_by_week(cur, person_ids, date_from, date_to)

    cur.execute(f"""
        SELECT COALESCE(MIN(load_threshold_low), 80) AS low,
               COALESCE(MIN(load_threshold_high), 100) AS high
        FROM {SCHEMA}.exec_center WHERE status <> 'archived'
    """)
    th = rows(cur)
    low = th[0]["low"] if th else 80
    high = th[0]["high"] if th else 100

    cur.execute(f"""
        SELECT id, display_name, position_title FROM {SCHEMA}.exec_person
        WHERE id = ANY(%s)
    """, (person_ids,))
    people = {r["id"]: r for r in rows(cur)}

    plan_map = {}
    for r in plan:
        plan_map[(r["person_id"], str(r["week_start"]))] = float(r["planned_hours"] or 0)

    out = []
    for r in cap:
        key = (r["person_id"], str(r["week_start"]))
        capacity = float(r["capacity_hours"] or 0)
        planned = plan_map.get(key, 0.0)
        pct = round(planned / capacity * 100, 1) if capacity > 0 else None
        state = "free"
        if pct is None:
            state = "unknown"
        elif pct > high:
            state = "overload"
        elif pct >= low:
            state = "normal"
        person = people.get(r["person_id"], {})
        out.append({
            "person_id": r["person_id"],
            "display_name": person.get("display_name"),
            "position_title": person.get("position_title"),
            "week_start": r["week_start"],
            "capacity_hours": capacity,
            "planned_hours": round(planned, 1),
            "load_pct": pct,
            "state": state,
        })

    # Предупреждение о неполном календаре
    cur.execute(f"""
        SELECT COUNT(*) AS missing FROM generate_series(%s::date, %s::date, '1 day') d
        WHERE NOT EXISTS (SELECT 1 FROM {SCHEMA}.exec_work_calendar w
                           WHERE w.calendar_date = d::date)
    """, (date_from, date_to))
    miss = rows(cur)
    return {
        "rows": out,
        "thresholds": {"low": low, "high": high},
        "calendar_missing_days": miss[0]["missing"] if miss else 0,
    }


def diagnostics(cur, center_id=None):
    """Проверки качества данных."""
    out = []

    cur.execute(f"""
        SELECT f.id, f.title FROM {SCHEMA}.exec_center_function f
        WHERE NOT EXISTS (SELECT 1 FROM {SCHEMA}.exec_function_raci r
            WHERE r.function_id = f.id AND r.raci_role = 'A'
              AND r.valid_to IS NULL AND r.is_backup = false)
    """)
    for r in rows(cur):
        out.append({"code": "F01", "level": "error", "entity": "function",
                    "entity_id": r["id"], "title": r["title"],
                    "message": "Функция без владельца (роль A)"})

    cur.execute(f"""
        SELECT f.id, f.title FROM {SCHEMA}.exec_center_function f
        WHERE f.criticality = 'high'
          AND NOT EXISTS (SELECT 1 FROM {SCHEMA}.exec_function_raci r
              WHERE r.function_id = f.id AND r.is_backup = true AND r.valid_to IS NULL)
    """)
    for r in rows(cur):
        out.append({"code": "F02", "level": "error", "entity": "function",
                    "entity_id": r["id"], "title": r["title"],
                    "message": "Критичная функция без замещающего"})

    cur.execute(f"""
        SELECT f.id, f.title FROM {SCHEMA}.exec_center_function f
        WHERE NOT EXISTS (SELECT 1 FROM {SCHEMA}.exec_function_competency fc
                           WHERE fc.function_id = f.id)
    """)
    for r in rows(cur):
        out.append({"code": "F03", "level": "warning", "entity": "function",
                    "entity_id": r["id"], "title": r["title"],
                    "message": "Не указаны требуемые компетенции"})

    cur.execute(f"""
        SELECT g.id, g.title FROM {SCHEMA}.exec_center_goal g
        WHERE g.kind = 'goal' AND (g.metric IS NULL OR g.target_value IS NULL)
    """)
    for r in rows(cur):
        out.append({"code": "G01", "level": "warning", "entity": "goal",
                    "entity_id": r["id"], "title": r["title"],
                    "message": "Цель без измеримого показателя"})

    cur.execute(f"""
        SELECT s.id, s.title FROM {SCHEMA}.exec_plan_step s
        WHERE s.status NOT IN ('done', 'cancelled')
          AND NOT EXISTS (SELECT 1 FROM {SCHEMA}.exec_plan_assignee a
              WHERE a.step_id = s.id AND a.raci_role = 'A')
        LIMIT 200
    """)
    for r in rows(cur):
        out.append({"code": "S01", "level": "error", "entity": "step",
                    "entity_id": r["id"], "title": r["title"],
                    "message": "Задача без ответственного (роль A)"})

    cur.execute(f"""
        SELECT s.id, s.title FROM {SCHEMA}.exec_plan_step s
        WHERE s.status NOT IN ('done', 'cancelled')
          AND (s.due_date IS NULL OR s.estimate_hours IS NULL)
        LIMIT 200
    """)
    for r in rows(cur):
        out.append({"code": "S02", "level": "warning", "entity": "step",
                    "entity_id": r["id"], "title": r["title"],
                    "message": "Не задан срок или трудоёмкость"})

    cur.execute(f"""
        SELECT p.id, p.display_name FROM {SCHEMA}.exec_person p
        WHERE COALESCE(p.record_state, 'active') = 'active'
          AND NOT EXISTS (SELECT 1 FROM {SCHEMA}.exec_person_capacity c
              WHERE c.person_id = p.id AND c.valid_to IS NULL)
    """)
    for r in rows(cur):
        out.append({"code": "P01", "level": "warning", "entity": "person",
                    "entity_id": r["id"], "title": r["display_name"],
                    "message": "Не задана рабочая ёмкость"})

    # Осиротевшие связи: страховка поверх внешних ключей
    cur.execute(f"""
        SELECT COUNT(*) AS n FROM {SCHEMA}.exec_plan_assignee a
        LEFT JOIN {SCHEMA}.exec_person p ON p.id = a.person_id
        WHERE p.id IS NULL
    """)
    orph = rows(cur)
    if orph and orph[0]["n"]:
        out.append({"code": "D01", "level": "error", "entity": "system",
                    "entity_id": None, "title": "Целостность",
                    "message": f"Назначений без сотрудника: {orph[0]['n']}"})

    return out


def handler(event: dict, context) -> dict:
    """Сотрудники Центра: профиль, компетенции, ёмкость, отсутствия, загрузка."""
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
        actor = user["email"]
        cur = conn.cursor()

        if action == "people":
            return cors({"ok": True, "data": person_list(cur, qs.get("q"))})

        if action == "person":
            pid = as_int(qs.get("id"))
            if not pid:
                return cors({"ok": False, "error": {"message": "Не указан сотрудник"}}, 400)
            data = person_detail(cur, pid)
            if not data:
                return cors({"ok": False, "error": {"message": "Сотрудник не найден"}}, 404)
            return cors({"ok": True, "data": data})

        if action == "check_duplicates":
            name = body.get("display_name") or qs.get("name") or ""
            return cors({"ok": True, "data": find_duplicates(cur, name, as_int(body.get("id")))})

        if action == "save_person":
            err = guard_deprecated(body)
            if err:
                return cors({"ok": False, "error": {"message": err}}, 400)
            pid = as_int(body.get("id"))
            name = nz(body.get("display_name"))
            if not pid and not name:
                return cors({"ok": False, "error": {"message": "Не указано ФИО"}}, 400)

            # Предупреждение о дублях: возвращаем, если клиент не подтвердил
            if not pid and not body.get("confirm_duplicate"):
                dups = find_duplicates(cur, name)
                if dups:
                    return cors({"ok": True, "data": {
                        "needs_confirmation": True, "duplicates": dups,
                    }})

            vals = {}
            for f in PERSON_FIELDS:
                if f in body:
                    v = body.get(f)
                    if f == "is_external":
                        v = bool(v)
                    elif f == "org_unit_id":
                        v = as_int(v)
                    else:
                        v = nz(v)
                    vals[f] = v
            if name:
                vals["normalized_name"] = norm_name(name)

            if pid:
                cur.execute(f"SELECT * FROM {SCHEMA}.exec_person WHERE id = %s", (pid,))
                before = (rows(cur) or [None])[0]
                sets = ", ".join(f"{k} = %s" for k in vals)
                cur.execute(
                    f"UPDATE {SCHEMA}.exec_person SET {sets}, updated_at = now() "
                    f"WHERE id = %s RETURNING id",
                    list(vals.values()) + [pid],
                )
                audit(cur, actor, "person", pid, "update", before, vals)
            else:
                cols = ", ".join(vals)
                ph = ", ".join(["%s"] * len(vals))
                cur.execute(
                    f"INSERT INTO {SCHEMA}.exec_person ({cols}) VALUES ({ph}) RETURNING id",
                    list(vals.values()),
                )
                pid = cur.fetchone()[0]
                audit(cur, actor, "person", pid, "create", None, vals)
                # Ёмкость по умолчанию, чтобы человек сразу попадал в расчёт
                cur.execute(
                    f"INSERT INTO {SCHEMA}.exec_person_capacity "
                    f"(person_id, valid_from, hours_per_week, fte, work_schedule) "
                    f"VALUES (%s, CURRENT_DATE, 40, 1, '5/2')",
                    (pid,),
                )
            conn.commit()
            return cors({"ok": True, "data": {"id": pid}})

        if action == "save_competency":
            pid = as_int(body.get("person_id"))
            cid = as_int(body.get("competency_id"))
            if not pid or not cid:
                return cors({"ok": False, "error": {"message": "Не указан сотрудник или компетенция"}}, 400)
            lvl = as_int(body.get("current_level")) or 1
            cur.execute(f"""
                INSERT INTO {SCHEMA}.exec_person_competency
                    (person_id, competency_id, current_level, target_level, assessed_at,
                     valid_until, evidence_type, evidence_ref, evidence_comment,
                     confirmed_by_person_id, confirmed_at)
                VALUES (%s, %s, %s, %s, COALESCE(%s, CURRENT_DATE), %s, %s, %s, %s, %s,
                        CASE WHEN %s IS NOT NULL THEN now() ELSE NULL END)
                ON CONFLICT (person_id, competency_id) DO UPDATE SET
                    current_level = EXCLUDED.current_level,
                    target_level = EXCLUDED.target_level,
                    assessed_at = EXCLUDED.assessed_at,
                    valid_until = EXCLUDED.valid_until,
                    evidence_type = EXCLUDED.evidence_type,
                    evidence_ref = EXCLUDED.evidence_ref,
                    evidence_comment = EXCLUDED.evidence_comment,
                    confirmed_by_person_id = EXCLUDED.confirmed_by_person_id,
                    confirmed_at = EXCLUDED.confirmed_at,
                    updated_at = now()
                RETURNING id
            """, (pid, cid, lvl, as_int(body.get("target_level")),
                  nz(body.get("assessed_at")), nz(body.get("valid_until")),
                  nz(body.get("evidence_type")) or "manager_review",
                  nz(body.get("evidence_ref")), nz(body.get("evidence_comment")),
                  as_int(body.get("confirmed_by_person_id")),
                  as_int(body.get("confirmed_by_person_id"))))
            rid = cur.fetchone()[0]
            audit(cur, actor, "person_competency", rid, "upsert", None, body)
            conn.commit()
            return cors({"ok": True, "data": {"id": rid}})

        if action == "save_capacity":
            pid = as_int(body.get("person_id"))
            if not pid:
                return cors({"ok": False, "error": {"message": "Не указан сотрудник"}}, 400)
            hpw = as_num(body.get("hours_per_week"))
            if hpw is None:
                return cors({"ok": False, "error": {"message": "Не указаны часы в неделю"}}, 400)
            vfrom = nz(body.get("valid_from"))
            # Закрываем предыдущий открытый период, историю не перезаписываем
            cur.execute(
                f"UPDATE {SCHEMA}.exec_person_capacity SET valid_to = COALESCE(%s::date, CURRENT_DATE) - 1 "
                f"WHERE person_id = %s AND valid_to IS NULL",
                (vfrom, pid),
            )
            cur.execute(f"""
                INSERT INTO {SCHEMA}.exec_person_capacity
                    (person_id, valid_from, hours_per_week, fte, work_schedule, note)
                VALUES (%s, COALESCE(%s::date, CURRENT_DATE), %s, %s, %s, %s) RETURNING id
            """, (pid, vfrom, hpw, as_num(body.get("fte")) or 1,
                  nz(body.get("work_schedule")) or "5/2", nz(body.get("note"))))
            rid = cur.fetchone()[0]
            audit(cur, actor, "person_capacity", rid, "create", None, body)
            conn.commit()
            return cors({"ok": True, "data": {"id": rid}})

        if action == "save_absence":
            pid = as_int(body.get("person_id"))
            d1, d2 = nz(body.get("date_from")), nz(body.get("date_to"))
            if not pid or not d1 or not d2:
                return cors({"ok": False, "error": {"message": "Укажите сотрудника и даты"}}, 400)
            rid = as_int(body.get("id"))
            if rid:
                cur.execute(f"""
                    UPDATE {SCHEMA}.exec_person_absence
                    SET absence_type = %s, date_from = %s, date_to = %s,
                        hours_per_day = %s, comment = %s
                    WHERE id = %s RETURNING id
                """, (nz(body.get("absence_type")) or "vacation", d1, d2,
                      as_num(body.get("hours_per_day")), nz(body.get("comment")), rid))
            else:
                cur.execute(f"""
                    INSERT INTO {SCHEMA}.exec_person_absence
                        (person_id, absence_type, date_from, date_to, hours_per_day, comment, approved_by)
                    VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id
                """, (pid, nz(body.get("absence_type")) or "vacation", d1, d2,
                      as_num(body.get("hours_per_day")), nz(body.get("comment")), actor))
                rid = cur.fetchone()[0]
            audit(cur, actor, "person_absence", rid, "upsert", None, body)
            conn.commit()
            return cors({"ok": True, "data": {"id": rid}})

        if action == "save_profile_record":
            pid = as_int(body.get("person_id"))
            rtype = nz(body.get("record_type"))
            title = nz(body.get("title"))
            if not pid or not rtype or not title:
                return cors({"ok": False, "error": {"message": "Укажите тип и название"}}, 400)
            if rtype == "tool" and not as_int(body.get("competency_id")):
                return cors({"ok": False, "error": {
                    "message": "Инструмент нужно связать с компетенцией из каталога"}}, 400)
            rid = as_int(body.get("id"))
            if rid:
                cur.execute(f"""
                    UPDATE {SCHEMA}.exec_person_profile_record
                    SET record_type = %s, title = %s, organization = %s, description = %s,
                        date_from = %s, date_to = %s, competency_id = %s, document_ref = %s
                    WHERE id = %s RETURNING id
                """, (rtype, title, nz(body.get("organization")), nz(body.get("description")),
                      nz(body.get("date_from")), nz(body.get("date_to")),
                      as_int(body.get("competency_id")), nz(body.get("document_ref")), rid))
            else:
                cur.execute(f"""
                    INSERT INTO {SCHEMA}.exec_person_profile_record
                        (person_id, record_type, title, organization, description,
                         date_from, date_to, competency_id, document_ref)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id
                """, (pid, rtype, title, nz(body.get("organization")), nz(body.get("description")),
                      nz(body.get("date_from")), nz(body.get("date_to")),
                      as_int(body.get("competency_id")), nz(body.get("document_ref"))))
                rid = cur.fetchone()[0]
            audit(cur, actor, "person_profile_record", rid, "upsert", None, body)
            conn.commit()
            return cors({"ok": True, "data": {"id": rid}})

        if action == "merge_person":
            src = as_int(body.get("source_id"))
            dst = as_int(body.get("target_id"))
            if not src or not dst or src == dst:
                return cors({"ok": False, "error": {"message": "Укажите две разные карточки"}}, 400)
            # Переносим связи, дубли пропускаем
            cur.execute(f"""
                UPDATE {SCHEMA}.exec_plan_assignee a SET person_id = %s
                WHERE a.person_id = %s AND NOT EXISTS (
                    SELECT 1 FROM {SCHEMA}.exec_plan_assignee x
                    WHERE x.step_id = a.step_id AND x.person_id = %s AND x.raci_role = a.raci_role)
            """, (dst, src, dst))
            cur.execute(f"UPDATE {SCHEMA}.exec_time_entry SET person_id = %s WHERE person_id = %s", (dst, src))
            cur.execute(f"""
                UPDATE {SCHEMA}.exec_function_raci r SET person_id = %s
                WHERE r.person_id = %s AND NOT EXISTS (
                    SELECT 1 FROM {SCHEMA}.exec_function_raci x
                    WHERE x.function_id = r.function_id AND x.person_id = %s
                      AND x.raci_role = r.raci_role AND x.valid_from = r.valid_from)
            """, (dst, src, dst))
            cur.execute(f"UPDATE {SCHEMA}.exec_center_role SET person_id = %s WHERE person_id = %s", (dst, src))
            cur.execute(f"UPDATE {SCHEMA}.exec_center_goal SET owner_person_id = %s WHERE owner_person_id = %s", (dst, src))
            cur.execute(
                f"UPDATE {SCHEMA}.exec_person SET record_state = 'archived', "
                f"note = COALESCE(note, '') || ' Объединено с карточкой #' || %s, updated_at = now() "
                f"WHERE id = %s", (str(dst), src),
            )
            audit(cur, actor, "person", src, "merge", {"source_id": src}, {"target_id": dst},
                  "Объединение карточек сотрудника")
            conn.commit()
            return cors({"ok": True, "data": {"target_id": dst}})

        if action in ("delete_competency", "delete_absence", "delete_profile_record"):
            table = {
                "delete_competency": "exec_person_competency",
                "delete_absence": "exec_person_absence",
                "delete_profile_record": "exec_person_profile_record",
            }[action]
            rid = as_int(body.get("id")) or as_int(qs.get("id"))
            if not rid:
                return cors({"ok": False, "error": {"message": "Не указана запись"}}, 400)
            cur.execute(f"DELETE FROM {SCHEMA}.{table} WHERE id = %s", (rid,))
            audit(cur, actor, table, rid, "delete")
            conn.commit()
            return cors({"ok": True, "data": {"id": rid}})

        if action == "workload":
            d1 = qs.get("date_from") or body.get("date_from")
            d2 = qs.get("date_to") or body.get("date_to")
            if not d1 or not d2:
                return cors({"ok": False, "error": {"message": "Укажите период"}}, 400)
            ids = body.get("person_ids") or []
            ids = [as_int(x) for x in ids if as_int(x)]
            return cors({"ok": True, "data": workload(cur, d1, d2, ids or None)})

        if action == "diagnostics":
            return cors({"ok": True, "data": diagnostics(cur, as_int(qs.get("center_id")))})

        if action == "competency_catalog":
            cur.execute(f"""
                SELECT c.id, c.code, c.name, c.description, d.name AS domain_name
                FROM {SCHEMA}.professional_competencies c
                LEFT JOIN {SCHEMA}.professional_competency_domains d ON d.id = c.domain_id
                WHERE COALESCE(c.status, 'active') = 'active'
                ORDER BY d.name, c.name
            """)
            return cors({"ok": True, "data": rows(cur)})

        return cors({"ok": False, "error": {"message": f"Неизвестное действие: {action}"}}, 400)
    finally:
        conn.close()