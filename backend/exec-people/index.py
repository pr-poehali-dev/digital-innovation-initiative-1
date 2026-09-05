import json
import os
import hashlib
import psycopg2

DB = os.environ["DATABASE_URL"]
_s = os.environ.get("MAIN_DB_SCHEMA", "").strip()
SCHEMA = _s if _s else "t_p61016064_digital_innovation_i"

# Поля, запрещённые к записи: источник истины перенесён в другие таблицы
# Последний год с официально утверждёнными переносами выходных.
# Дни после него считаются предварительными.
CONFIRMED_CALENDAR_YEAR = 2026

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
                  AND s.due_date < CURRENT_DATE) AS overdue_steps,
               (SELECT COUNT(DISTINCT a.step_id) FROM {SCHEMA}.exec_plan_assignee a
                 JOIN {SCHEMA}.exec_plan_step s ON s.id = a.step_id
                WHERE a.person_id = p.id AND s.status = 'done') AS done_steps,
               COALESCE((SELECT SUM(t.hours) FROM {SCHEMA}.exec_time_entry t
                          WHERE t.person_id = p.id), 0) AS fact_hours_total,
               COALESCE((SELECT json_agg(DISTINCT r.function_id)
                          FROM {SCHEMA}.exec_function_raci r
                         WHERE r.person_id = p.id AND r.valid_to IS NULL),
                        '[]'::json) AS function_ids,
               COALESCE((SELECT json_agg(DISTINCT pl.initiative_id)
                          FROM {SCHEMA}.exec_plan_assignee a
                          JOIN {SCHEMA}.exec_plan_step st ON st.id = a.step_id
                          JOIN {SCHEMA}.exec_plan pl ON pl.id = st.plan_id
                         WHERE a.person_id = p.id AND pl.initiative_id IS NOT NULL),
                        '[]'::json) AS initiative_ids,
               COALESCE((SELECT json_agg(pc.competency_id)
                          FROM {SCHEMA}.exec_person_competency pc
                         WHERE pc.person_id = p.id), '[]'::json) AS competency_ids,
               COALESCE((SELECT string_agg(c.name, ' ')
                          FROM {SCHEMA}.exec_person_competency pc
                          JOIN {SCHEMA}.professional_competencies c ON c.id = pc.competency_id
                         WHERE pc.person_id = p.id), '') AS competency_names,
               (SELECT COUNT(*) FROM {SCHEMA}.exec_person_functional_role fr
                 WHERE fr.person_id = p.id AND fr.status = 'assigned') AS functional_role_count,
               COALESCE((SELECT string_agg(fr.title, ', ')
                          FROM {SCHEMA}.exec_person_functional_role fr
                         WHERE fr.person_id = p.id AND fr.status = 'assigned'), '') AS functional_role_titles
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
        SELECT r.*, f.title AS function_title, f.code AS function_code,
               f.criticality, f.center_id
        FROM {SCHEMA}.exec_function_raci r
        JOIN {SCHEMA}.exec_center_function f ON f.id = r.function_id
        WHERE r.person_id = %s AND r.valid_to IS NULL
        ORDER BY r.raci_role, f.sort_order
    """, (pid,))
    person["functions"] = rows(cur)

    # Задачи с плановыми и фактическими часами
    cur.execute(f"""
        SELECT s.id, s.title, s.status, s.step_type, s.is_control_point,
               s.start_date, s.due_date, s.estimate_hours, s.progress_pct,
               a.id AS assignee_id, a.raci_role, a.plan_hours, a.workload_pct,
               p.title AS plan_title, p.id AS plan_id,
               i.id AS initiative_id, i.title AS initiative_title,
               COALESCE((SELECT SUM(t.hours) FROM {SCHEMA}.exec_time_entry t
                          WHERE t.step_id = s.id AND t.person_id = %s), 0) AS fact_hours,
               (s.due_date < CURRENT_DATE AND s.status NOT IN ('done','cancelled')) AS is_overdue
        FROM {SCHEMA}.exec_plan_assignee a
        JOIN {SCHEMA}.exec_plan_step s ON s.id = a.step_id
        LEFT JOIN {SCHEMA}.exec_plan p ON p.id = s.plan_id
        LEFT JOIN {SCHEMA}.exec_initiative i ON i.id = p.initiative_id
        WHERE a.person_id = %s AND s.status <> 'cancelled'
        ORDER BY s.status, s.due_date NULLS LAST
    """, (pid, pid))
    person["steps"] = rows(cur)

    cur.execute(f"""
        SELECT t.*, s.title AS step_title
        FROM {SCHEMA}.exec_time_entry t
        JOIN {SCHEMA}.exec_plan_step s ON s.id = t.step_id
        WHERE t.person_id = %s
        ORDER BY t.work_date DESC LIMIT 100
    """, (pid,))
    person["time_entries"] = rows(cur)

    cur.execute(f"""
        SELECT r.*, cr.title AS role_title, c.title AS center_title
        FROM {SCHEMA}.exec_role_assignment r
        LEFT JOIN {SCHEMA}.exec_center_role cr ON cr.id = r.center_role_id
        LEFT JOIN {SCHEMA}.exec_center c ON c.id = cr.center_id
        WHERE r.person_id = %s
        ORDER BY r.id DESC
    """, (pid,))
    person["role_assignments"] = rows(cur)

    cur.execute(f"""
        SELECT fr.*, c.title AS related_center_title
        FROM {SCHEMA}.exec_person_functional_role fr
        LEFT JOIN {SCHEMA}.exec_center c ON c.id = fr.related_center_id
        WHERE fr.person_id = %s
        ORDER BY fr.status, fr.created_at DESC
    """, (pid,))
    person["functional_roles"] = rows(cur)

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


def workload(cur, date_from, date_to, person_ids=None, weeks_ahead=None):
    """Загрузка по неделям с порогами Центра."""
    if weeks_ahead:
        cur.execute("SELECT CURRENT_DATE AS a, "
                    "(CURRENT_DATE + (%s || ' weeks')::interval)::date AS b", (weeks_ahead,))
        per = rows(cur)[0]
        date_from, date_to = per["a"], per["b"]
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

    # Отсутствия по неделям: показываем отдельно от загрузки
    cur.execute(f"""
        SELECT a.person_id, date_trunc('week', w.calendar_date)::date AS week_start,
               MIN(a.absence_type) AS absence_type,
               COUNT(*) AS days
        FROM {SCHEMA}.exec_person_absence a
        JOIN {SCHEMA}.exec_work_calendar w
          ON w.calendar_date BETWEEN a.date_from AND a.date_to AND w.work_hours > 0
        WHERE a.person_id = ANY(%s) AND w.calendar_date BETWEEN %s AND %s
        GROUP BY 1, 2
    """, (person_ids, date_from, date_to))
    abs_map = {(r["person_id"], str(r["week_start"])): r for r in rows(cur)}
    for row in out:
        a = abs_map.get((row["person_id"], str(row["week_start"])))
        if a:
            row["absence_type"] = a["absence_type"]
            row["absence_days"] = a["days"]

    # Предупреждение о неполном календаре
    cur.execute(f"""
        SELECT COUNT(*) AS missing FROM generate_series(%s::date, %s::date, '1 day') d
        WHERE NOT EXISTS (SELECT 1 FROM {SCHEMA}.exec_work_calendar w
                           WHERE w.calendar_date = d::date)
    """, (date_from, date_to))
    miss = rows(cur)
    cur.execute(f"""
        SELECT MAX(EXTRACT(YEAR FROM calendar_date))::int AS last_year
        FROM {SCHEMA}.exec_work_calendar
    """)
    cal = rows(cur)
    provisional = bool(cal and (cal[0]["last_year"] or 0) > CONFIRMED_CALENDAR_YEAR)
    return {
        "rows": out,
        "thresholds": {"low": low, "high": high},
        "calendar_missing_days": miss[0]["missing"] if miss else 0,
        "calendar_confirmed_year": CONFIRMED_CALENDAR_YEAR,
        "calendar_provisional": provisional,
        "date_from": str(date_from),
        "date_to": str(date_to),
    }


KIND_TITLE = {
    "task": "Задача",
    "stage": "Этап",
    "control_point": "Контрольная точка",
}


def step_rows(cur):
    """Шаги плана с типом объекта и полным контекстом для детализации.

    Тип определяется так: контрольная точка — по отметке, этап — если есть
    дочерние шаги или указан тип stage, остальное — задача.
    """
    cur.execute(f"""
        SELECT s.id, s.title, s.status, s.step_type, s.is_control_point,
               s.due_date, s.start_date, s.estimate_hours, s.parent_step_id,
               par.title AS parent_title,
               pl.title AS plan_title, pl.id AS plan_id,
               i.title AS initiative_title, i.id AS initiative_id,
               m.title AS milestone_title,
               (SELECT COUNT(*) FROM {SCHEMA}.exec_plan_step k
                 WHERE k.parent_step_id = s.id AND k.status <> 'cancelled') AS child_count,
               (SELECT pr.display_name FROM {SCHEMA}.exec_plan_assignee a
                  JOIN {SCHEMA}.exec_person pr ON pr.id = a.person_id
                 WHERE a.step_id = s.id AND a.raci_role = 'A' LIMIT 1) AS owner_name,
               EXISTS (SELECT 1 FROM {SCHEMA}.exec_plan_assignee a
                        WHERE a.step_id = s.id AND a.raci_role = 'A') AS has_owner,
               COALESCE((SELECT SUM(a.plan_hours) FROM {SCHEMA}.exec_plan_assignee a
                          WHERE a.step_id = s.id), 0) AS assigned_hours,
               COALESCE((SELECT SUM(t.hours) FROM {SCHEMA}.exec_time_entry t
                          WHERE t.step_id = s.id), 0) AS fact_hours
        FROM {SCHEMA}.exec_plan_step s
        LEFT JOIN {SCHEMA}.exec_plan_step par ON par.id = s.parent_step_id
        LEFT JOIN {SCHEMA}.exec_plan pl ON pl.id = s.plan_id
        LEFT JOIN {SCHEMA}.exec_initiative i ON i.id = pl.initiative_id
        LEFT JOIN {SCHEMA}.exec_milestone m ON m.id = s.milestone_id
        WHERE s.status NOT IN ('done', 'cancelled')
        ORDER BY s.due_date NULLS LAST, s.id
    """)
    out = rows(cur)
    for r in out:
        if r["is_control_point"]:
            r["object_kind"] = "control_point"
        elif r["step_type"] == "stage" or (r["child_count"] or 0) > 0:
            r["object_kind"] = "stage"
        else:
            r["object_kind"] = "task"
        r["object_kind_title"] = KIND_TITLE[r["object_kind"]]
    return out


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
        out.append({"code": "F03", "level": "info", "entity": "function",
                    "entity_id": r["id"], "title": r["title"],
                    "message": "Требования к компетенциям не заданы"})

    cur.execute(f"""
        SELECT g.id, g.title FROM {SCHEMA}.exec_center_goal g
        WHERE g.kind = 'goal' AND (g.metric IS NULL OR g.target_value IS NULL)
    """)
    for r in rows(cur):
        out.append({"code": "G01", "level": "warning", "entity": "goal",
                    "entity_id": r["id"], "title": r["title"],
                    "message": "Цель без измеримого показателя"})

    # Тип объекта определяет, какие поля обязательны:
    #  task           — часы и срок нужны
    #  stage          — часы складываются из дочерних, свои не требуются
    #  control_point  — нужен срок и ответственный, часы не требуются
    for r in step_rows(cur):
        kind = r["object_kind"]
        if not r["has_owner"]:
            out.append({"code": "S01", "level": "error", "entity": "step",
                        "entity_id": r["id"], "title": r["title"],
                        "object_kind": kind,
                        "message": f"{KIND_TITLE[kind]} без ответственного (роль A)"})
        if not r["due_date"]:
            out.append({"code": "S02", "level": "warning", "entity": "step",
                        "entity_id": r["id"], "title": r["title"],
                        "object_kind": kind,
                        "message": "Не задан срок"})
        if kind == "task" and r["estimate_hours"] is None:
            out.append({"code": "S03", "level": "warning", "entity": "step",
                        "entity_id": r["id"], "title": r["title"],
                        "object_kind": kind,
                        "message": "Не задана трудоёмкость"})

    for r in step_rows(cur):
        if (r["object_kind"] == "task" and r["estimate_hours"] is not None
                and float(r["assigned_hours"] or 0) > 0
                and abs(float(r["assigned_hours"]) - float(r["estimate_hours"])) > 0.05):
            out.append({"code": "S04", "level": "warning", "entity": "step",
                        "entity_id": r["id"], "title": r["title"],
                        "object_kind": r["object_kind"],
                        "message": f"Часы исполнителей ({r['assigned_hours']}) "
                                   f"не совпадают с трудоёмкостью ({r['estimate_hours']})"})

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

    cur.execute(f"""
        SELECT p.id, p.display_name, c.name AS competency_name, pc.valid_until
        FROM {SCHEMA}.exec_person_competency pc
        JOIN {SCHEMA}.exec_person p ON p.id = pc.person_id
        JOIN {SCHEMA}.professional_competencies c ON c.id = pc.competency_id
        WHERE pc.valid_until IS NOT NULL AND pc.valid_until < CURRENT_DATE
          AND COALESCE(p.record_state, 'active') = 'active'
    """)
    for r in rows(cur):
        out.append({"code": "P02", "level": "warning", "entity": "person",
                    "entity_id": r["id"], "title": r["display_name"],
                    "message": f"Требуется переподтверждение: {r['competency_name']}"})

    cur.execute(f"""
        SELECT p.id, p.display_name FROM {SCHEMA}.exec_person p
        WHERE COALESCE(p.record_state, 'active') = 'active'
          AND NOT EXISTS (SELECT 1 FROM {SCHEMA}.exec_person_competency pc
              WHERE pc.person_id = p.id)
    """)
    for r in rows(cur):
        out.append({"code": "P03", "level": "info", "entity": "person",
                    "entity_id": r["id"], "title": r["display_name"],
                    "message": "Профиль компетенций не заполнен"})

    # Перегрузка на ближайшие 8 недель
    cur.execute(f"""
        SELECT id FROM {SCHEMA}.exec_person
        WHERE COALESCE(record_state, 'active') = 'active'
    """)
    active_ids = [r["id"] for r in rows(cur)]
    if active_ids:
        wl = workload(cur, "CURRENT_DATE", None, active_ids, weeks_ahead=8)
        seen = set()
        for row in wl["rows"]:
            if row["state"] == "overload" and row["person_id"] not in seen:
                seen.add(row["person_id"])
                out.append({"code": "P04", "level": "error", "entity": "person",
                            "entity_id": row["person_id"], "title": row["display_name"],
                            "message": f"Перегрузка на неделе {row['week_start']}: "
                                       f"{row['load_pct']}%"})

    # Календарь: подтверждённый горизонт
    cur.execute(f"""
        SELECT MAX(EXTRACT(YEAR FROM calendar_date))::int AS last_year,
               COUNT(*) FILTER (WHERE calendar_date >= CURRENT_DATE) AS future_days
        FROM {SCHEMA}.exec_work_calendar
    """)
    cal = rows(cur)
    if cal:
        if (cal[0]["future_days"] or 0) < 90:
            out.append({"code": "C01", "level": "error", "entity": "calendar",
                        "entity_id": None, "title": "Производственный календарь",
                        "message": "Календарь заполнен меньше чем на квартал вперёд"})
        elif (cal[0]["last_year"] or 0) > CONFIRMED_CALENDAR_YEAR:
            out.append({"code": "C02", "level": "warning", "entity": "calendar",
                        "entity_id": None, "title": "Производственный календарь",
                        "message": f"Дни после {CONFIRMED_CALENDAR_YEAR} года предварительные: "
                                   f"переносы выходных ещё не утверждены"})

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
            fte = as_num(body.get("fte")) or 1
            sched = nz(body.get("work_schedule")) or "5/2"
            note = nz(body.get("note"))

            # Период, начатый той же датой, заменяем: закрыть его задним числом нельзя
            cur.execute(f"""
                UPDATE {SCHEMA}.exec_person_capacity
                SET hours_per_week = %s, fte = %s, work_schedule = %s, note = %s
                WHERE person_id = %s AND valid_to IS NULL
                  AND valid_from >= COALESCE(%s::date, CURRENT_DATE)
                RETURNING id
            """, (hpw, fte, sched, note, pid, vfrom))
            got = cur.fetchone()
            if got:
                rid = got[0]
            else:
                # Иначе закрываем прежний период и открываем новый, история сохраняется
                cur.execute(
                    f"UPDATE {SCHEMA}.exec_person_capacity "
                    f"SET valid_to = COALESCE(%s::date, CURRENT_DATE) - 1 "
                    f"WHERE person_id = %s AND valid_to IS NULL",
                    (vfrom, pid),
                )
                cur.execute(f"""
                    INSERT INTO {SCHEMA}.exec_person_capacity
                        (person_id, valid_from, hours_per_week, fte, work_schedule, note)
                    VALUES (%s, COALESCE(%s::date, CURRENT_DATE), %s, %s, %s, %s) RETURNING id
                """, (pid, vfrom, hpw, fte, sched, note))
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

        if action == "save_functional_role":
            pid = as_int(body.get("person_id"))
            title = nz(body.get("title"))
            if not pid or not title:
                return cors({"ok": False, "error": {"message": "Укажите сотрудника и название роли"}}, 400)
            rid = as_int(body.get("id"))
            vals = {
                "title": title[:300],
                "scope": nz(body.get("scope")),
                "role_type": nz(body.get("role_type")) or "additional",
                "status": nz(body.get("status")) or "assigned",
                "participation_format": nz(body.get("participation_format")),
                "authority_source": nz(body.get("authority_source")),
                "purpose": nz(body.get("purpose")),
                "duties": nz(body.get("duties")),
                "not_included": nz(body.get("not_included")),
                "related_center_id": as_int(body.get("related_center_id")),
                "date_from": nz(body.get("date_from")),
                "date_to": nz(body.get("date_to")),
                "note": nz(body.get("note")),
            }
            if rid:
                sets = ", ".join(f"{k} = %s" for k in vals)
                cur.execute(
                    f"UPDATE {SCHEMA}.exec_person_functional_role SET {sets}, updated_at = now() "
                    f"WHERE id = %s RETURNING id",
                    list(vals.values()) + [rid],
                )
                audit(cur, actor, "person_functional_role", rid, "update", None, vals)
            else:
                vals["person_id"] = pid
                vals["created_by"] = actor
                cols = ", ".join(vals)
                ph = ", ".join(["%s"] * len(vals))
                cur.execute(
                    f"INSERT INTO {SCHEMA}.exec_person_functional_role ({cols}) "
                    f"VALUES ({ph}) RETURNING id",
                    list(vals.values()),
                )
                rid = cur.fetchone()[0]
                audit(cur, actor, "person_functional_role", rid, "create", None, vals)
            conn.commit()
            return cors({"ok": True, "data": {"id": rid}})

        if action in ("delete_competency", "delete_absence", "delete_profile_record", "delete_functional_role"):
            table = {
                "delete_competency": "exec_person_competency",
                "delete_absence": "exec_person_absence",
                "delete_profile_record": "exec_person_profile_record",
                "delete_functional_role": "exec_person_functional_role",
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

        if action == "week_detail":
            pid = as_int(qs.get("person_id")) or as_int(body.get("person_id"))
            wk = nz(qs.get("week_start")) or nz(body.get("week_start"))
            if not pid or not wk:
                return cors({"ok": False, "error": {"message": "Укажите сотрудника и неделю"}}, 400)
            cur.execute(f"""
                SELECT s.id AS step_id, s.title, s.status, s.due_date, s.start_date,
                       a.id AS assignee_id, a.raci_role, a.plan_hours,
                       p.title AS plan_title,
                       i.title AS initiative_title,
                       f.title AS function_title,
                       COALESCE(aw.hours, 0) AS week_hours,
                       (aw.id IS NOT NULL) AS is_manual,
                       COALESCE((SELECT SUM(t.hours) FROM {SCHEMA}.exec_time_entry t
                                  WHERE t.step_id = s.id AND t.person_id = a.person_id
                                    AND t.work_date BETWEEN %s::date AND %s::date + 6), 0) AS fact_hours
                FROM {SCHEMA}.exec_plan_assignee a
                JOIN {SCHEMA}.exec_plan_step s ON s.id = a.step_id
                LEFT JOIN {SCHEMA}.exec_plan p ON p.id = s.plan_id
                LEFT JOIN {SCHEMA}.exec_initiative i ON i.id = p.initiative_id
                LEFT JOIN {SCHEMA}.exec_plan_step_function sf
                       ON sf.step_id = s.id AND sf.is_primary
                LEFT JOIN {SCHEMA}.exec_center_function f ON f.id = sf.function_id
                LEFT JOIN {SCHEMA}.exec_assignee_week aw
                       ON aw.assignee_id = a.id AND aw.week_start = %s::date
                WHERE a.person_id = %s
                  AND s.status NOT IN ('cancelled')
                  AND (aw.id IS NOT NULL
                       OR (COALESCE(a.valid_from, s.start_date) <= %s::date + 6
                           AND COALESCE(a.valid_to, s.due_date) >= %s::date))
                ORDER BY s.due_date NULLS LAST
            """, (wk, wk, wk, pid, wk, wk))
            return cors({"ok": True, "data": rows(cur)})

        if action == "step_assignees":
            sid = as_int(qs.get("step_id")) or as_int(body.get("step_id"))
            if not sid:
                return cors({"ok": False, "error": {"message": "Не указана задача"}}, 400)
            cur.execute(f"""
                SELECT a.*, p.display_name, p.position_title,
                       COALESCE((SELECT SUM(t.hours) FROM {SCHEMA}.exec_time_entry t
                                  WHERE t.step_id = a.step_id AND t.person_id = a.person_id), 0)
                           AS fact_hours
                FROM {SCHEMA}.exec_plan_assignee a
                JOIN {SCHEMA}.exec_person p ON p.id = a.person_id
                WHERE a.step_id = %s
                ORDER BY CASE a.raci_role WHEN 'A' THEN 1 WHEN 'R' THEN 2
                                          WHEN 'C' THEN 3 ELSE 4 END, p.display_name
            """, (sid,))
            assignees = rows(cur)
            cur.execute(f"""
                SELECT aw.*, a.person_id FROM {SCHEMA}.exec_assignee_week aw
                JOIN {SCHEMA}.exec_plan_assignee a ON a.id = aw.assignee_id
                WHERE a.step_id = %s ORDER BY aw.week_start
            """, (sid,))
            weeks = rows(cur)
            cur.execute(f"""
                SELECT t.*, p.display_name FROM {SCHEMA}.exec_time_entry t
                JOIN {SCHEMA}.exec_person p ON p.id = t.person_id
                WHERE t.step_id = %s ORDER BY t.work_date DESC
            """, (sid,))
            entries = rows(cur)

            info = next((r for r in step_rows(cur) if r["id"] == sid), None)
            if info is None:
                cur.execute(f"""
                    SELECT s.id, s.title, s.step_type, s.is_control_point,
                           s.estimate_hours, s.due_date, s.start_date,
                           (SELECT COUNT(*) FROM {SCHEMA}.exec_plan_step k
                             WHERE k.parent_step_id = s.id AND k.status <> 'cancelled') AS child_count
                    FROM {SCHEMA}.exec_plan_step s WHERE s.id = %s
                """, (sid,))
                got = rows(cur)
                info = got[0] if got else {}
                if info:
                    info["object_kind"] = ("control_point" if info["is_control_point"]
                                           else "stage" if (info["child_count"] or 0) > 0
                                           else "task")
                    info["object_kind_title"] = KIND_TITLE[info["object_kind"]]

            plan_sum = sum(float(a["plan_hours"] or 0) for a in assignees)
            fact_sum = sum(float(t["hours"] or 0) for t in entries)
            est = info.get("estimate_hours") if info else None

            # Для этапа плановые часы складываются из дочерних задач
            children_hours = None
            if info and info.get("object_kind") == "stage":
                cur.execute(f"""
                    SELECT COALESCE(SUM(estimate_hours), 0) AS est,
                           COALESCE((SELECT SUM(t.hours) FROM {SCHEMA}.exec_time_entry t
                                      JOIN {SCHEMA}.exec_plan_step k2 ON k2.id = t.step_id
                                     WHERE k2.parent_step_id = %s), 0) AS fact
                    FROM {SCHEMA}.exec_plan_step
                    WHERE parent_step_id = %s AND status <> 'cancelled'
                """, (sid, sid))
                children_hours = rows(cur)[0]

            return cors({"ok": True, "data": {
                "assignees": assignees,
                "weeks": weeks,
                "time_entries": entries,
                "step": info,
                "summary": {
                    "estimate_hours": float(est) if est is not None else None,
                    "assigned_hours": round(plan_sum, 1),
                    "fact_hours": round(fact_sum, 1),
                    "variance": round(plan_sum - fact_sum, 1),
                    "hours_mismatch": bool(
                        est is not None and plan_sum > 0
                        and abs(plan_sum - float(est)) > 0.05
                    ),
                    "children_estimate": (float(children_hours["est"])
                                          if children_hours else None),
                    "children_fact": (float(children_hours["fact"])
                                      if children_hours else None),
                },
            }})

        if action == "save_assignee":
            sid = as_int(body.get("step_id"))
            pid = as_int(body.get("person_id"))
            role = (nz(body.get("raci_role")) or "R").upper()[:1]
            if not sid or not pid or role not in ("R", "A", "C", "I"):
                return cors({"ok": False, "error": {"message": "Укажите задачу, человека и роль"}}, 400)
            # Ответственный единственный. Судьбу прежнего решает руководитель:
            # keep_r — остаётся исполнителем, finish — назначение завершается датой,
            # remove — снимается с задачи. Факт в exec_time_entry не трогаем никогда.
            if role == "A":
                cur.execute(
                    f"SELECT a.id, a.person_id, p.display_name "
                    f"FROM {SCHEMA}.exec_plan_assignee a "
                    f"JOIN {SCHEMA}.exec_person p ON p.id = a.person_id "
                    f"WHERE a.step_id = %s AND a.raci_role = 'A' AND a.person_id <> %s",
                    (sid, pid),
                )
                prev = rows(cur)
                if prev:
                    decision = nz(body.get("prev_owner_action"))
                    if not decision:
                        cur.execute(
                            f"SELECT COALESCE(SUM(hours), 0) AS h FROM {SCHEMA}.exec_time_entry "
                            f"WHERE step_id = %s AND person_id = %s",
                            (sid, prev[0]["person_id"]),
                        )
                        fact = rows(cur)[0]["h"]
                        return cors({"ok": True, "data": {
                            "needs_decision": True,
                            "previous_owner": {
                                "assignee_id": prev[0]["id"],
                                "person_id": prev[0]["person_id"],
                                "display_name": prev[0]["display_name"],
                                "fact_hours": float(fact or 0),
                            },
                        }})
                    for row in prev:
                        if decision == "keep_r":
                            cur.execute(
                                f"DELETE FROM {SCHEMA}.exec_plan_assignee "
                                f"WHERE step_id = %s AND person_id = %s AND raci_role = 'R'",
                                (sid, row["person_id"]),
                            )
                            cur.execute(
                                f"UPDATE {SCHEMA}.exec_plan_assignee SET raci_role = 'R', "
                                f"role_in_step = 'executor' WHERE id = %s",
                                (row["id"],),
                            )
                        elif decision == "finish":
                            cur.execute(
                                f"UPDATE {SCHEMA}.exec_plan_assignee "
                                f"SET raci_role = 'I', role_in_step = 'former_owner', "
                                f"valid_to = COALESCE(valid_to, CURRENT_DATE) WHERE id = %s",
                                (row["id"],),
                            )
                        else:
                            cur.execute(
                                f"DELETE FROM {SCHEMA}.exec_assignee_week WHERE assignee_id = %s",
                                (row["id"],),
                            )
                            cur.execute(
                                f"DELETE FROM {SCHEMA}.exec_plan_assignee WHERE id = %s",
                                (row["id"],),
                            )
                        audit(cur, actor, "plan_assignee", row["id"], "owner_change",
                              {"person_id": row["person_id"]}, {"action": decision})
            # Человек уже участвует в другой роли: повышаем существующую запись,
            # чтобы не создавать вторую и не терять его недельное распределение
            cur.execute(
                f"SELECT id, raci_role, plan_hours FROM {SCHEMA}.exec_plan_assignee "
                f"WHERE step_id = %s AND person_id = %s",
                (sid, pid),
            )
            mine = rows(cur)
            same = next((m for m in mine if m["raci_role"] == role), None)
            other = next((m for m in mine if m["raci_role"] != role), None)

            hours = as_num(body.get("plan_hours"))
            if same:
                rid = same["id"]
                if other and role == "A":
                    cur.execute(
                        f"DELETE FROM {SCHEMA}.exec_assignee_week WHERE assignee_id = %s",
                        (other["id"],))
                    cur.execute(f"DELETE FROM {SCHEMA}.exec_plan_assignee WHERE id = %s",
                                (other["id"],))
                cur.execute(f"""
                    UPDATE {SCHEMA}.exec_plan_assignee
                    SET plan_hours = COALESCE(%s, plan_hours),
                        role_in_step = COALESCE(%s, role_in_step),
                        workload_pct = COALESCE(%s, workload_pct),
                        valid_from = COALESCE(%s, valid_from),
                        valid_to = COALESCE(%s, valid_to)
                    WHERE id = %s
                """, (hours, nz(body.get("role_in_step")), as_int(body.get("workload_pct")),
                      nz(body.get("valid_from")), nz(body.get("valid_to")), rid))
            elif other:
                rid = other["id"]
                cur.execute(f"""
                    UPDATE {SCHEMA}.exec_plan_assignee
                    SET raci_role = %s,
                        role_in_step = %s,
                        plan_hours = COALESCE(%s, plan_hours),
                        workload_pct = COALESCE(%s, workload_pct),
                        valid_from = COALESCE(%s, valid_from),
                        valid_to = COALESCE(%s, valid_to)
                    WHERE id = %s
                """, (role,
                      nz(body.get("role_in_step"))
                      or ("responsible" if role == "A" else "executor"),
                      hours, as_int(body.get("workload_pct")),
                      nz(body.get("valid_from")), nz(body.get("valid_to")), rid))
            else:
                cur.execute(f"""
                    INSERT INTO {SCHEMA}.exec_plan_assignee
                        (step_id, person_id, raci_role, role_in_step, plan_hours,
                         workload_pct, valid_from, valid_to)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s) RETURNING id
                """, (sid, pid, role,
                      nz(body.get("role_in_step"))
                      or ("responsible" if role == "A" else "executor"),
                      hours, as_int(body.get("workload_pct")),
                      nz(body.get("valid_from")), nz(body.get("valid_to"))))
                rid = cur.fetchone()[0]
            audit(cur, actor, "plan_assignee", rid, "upsert", None, body)
            conn.commit()
            return cors({"ok": True, "data": {"id": rid}})

        if action == "remove_assignee":
            rid = as_int(body.get("id"))
            if not rid:
                return cors({"ok": False, "error": {"message": "Не указано назначение"}}, 400)
            cur.execute(f"DELETE FROM {SCHEMA}.exec_assignee_week WHERE assignee_id = %s", (rid,))
            cur.execute(f"DELETE FROM {SCHEMA}.exec_plan_assignee WHERE id = %s", (rid,))
            audit(cur, actor, "plan_assignee", rid, "delete")
            conn.commit()
            return cors({"ok": True, "data": {"id": rid}})

        if action == "save_assignee_weeks":
            aid = as_int(body.get("assignee_id"))
            weeks = body.get("weeks") or []
            if not aid:
                return cors({"ok": False, "error": {"message": "Не указано назначение"}}, 400)
            cur.execute(f"DELETE FROM {SCHEMA}.exec_assignee_week WHERE assignee_id = %s", (aid,))
            for w in weeks:
                h = as_num(w.get("hours"))
                if h and h > 0:
                    cur.execute(
                        f"INSERT INTO {SCHEMA}.exec_assignee_week "
                        f"(assignee_id, week_start, hours, is_manual) VALUES (%s, %s, %s, true)",
                        (aid, w.get("week_start"), h),
                    )
            conn.commit()
            return cors({"ok": True, "data": {"assignee_id": aid, "weeks": len(weeks)}})

        if action == "save_time_entry":
            pid = as_int(body.get("person_id"))
            sid = as_int(body.get("step_id"))
            h = as_num(body.get("hours"))
            wd = nz(body.get("work_date"))
            if not pid or not sid or not h or not wd:
                return cors({"ok": False, "error": {"message": "Укажите задачу, дату и часы"}}, 400)
            rid = as_int(body.get("id"))
            if rid:
                cur.execute(f"""
                    UPDATE {SCHEMA}.exec_time_entry
                    SET work_date = %s, hours = %s, comment = %s, status = %s
                    WHERE id = %s RETURNING id
                """, (wd, h, nz(body.get("comment")),
                      nz(body.get("status")) or "submitted", rid))
            else:
                cur.execute(f"""
                    INSERT INTO {SCHEMA}.exec_time_entry
                        (person_id, step_id, work_date, hours, comment, source, status, created_by)
                    VALUES (%s, %s, %s, %s, %s, 'manual', %s, %s) RETURNING id
                """, (pid, sid, wd, h, nz(body.get("comment")),
                      nz(body.get("status")) or "submitted", actor))
                rid = cur.fetchone()[0]
            audit(cur, actor, "time_entry", rid, "upsert", None, body)
            conn.commit()
            return cors({"ok": True, "data": {"id": rid}})

        if action == "delete_time_entry":
            rid = as_int(body.get("id"))
            if not rid:
                return cors({"ok": False, "error": {"message": "Не указана запись"}}, 400)
            cur.execute(f"DELETE FROM {SCHEMA}.exec_time_entry WHERE id = %s", (rid,))
            audit(cur, actor, "time_entry", rid, "delete")
            conn.commit()
            return cors({"ok": True, "data": {"id": rid}})

        if action == "bulk_assign":
            step_ids = [as_int(x) for x in (body.get("step_ids") or []) if as_int(x)]
            if not step_ids:
                return cors({"ok": False, "error": {"message": "Не выбраны задачи"}}, 400)
            resp = as_int(body.get("responsible_id"))
            execs = [as_int(x) for x in (body.get("executor_ids") or []) if as_int(x)]
            hours_each = as_num(body.get("hours_each"))
            due = nz(body.get("due_date"))
            prio = nz(body.get("priority"))
            # Часы записываем только задачам: у этапа они складываются
            # из дочерних, у контрольной точки трудоёмкости нет
            kinds = {r["id"]: r["object_kind"] for r in step_rows(cur)}
            done = 0
            for sid in step_ids:
                kind = kinds.get(sid, "task")
                hours = hours_each if kind == "task" else None
                if resp:
                    cur.execute(
                        f"DELETE FROM {SCHEMA}.exec_plan_assignee "
                        f"WHERE step_id = %s AND raci_role = 'A' AND person_id <> %s",
                        (sid, resp))
                    cur.execute(f"""
                        INSERT INTO {SCHEMA}.exec_plan_assignee
                            (step_id, person_id, raci_role, role_in_step, plan_hours)
                        VALUES (%s, %s, 'A', 'responsible', %s)
                        ON CONFLICT (step_id, person_id, raci_role) DO UPDATE
                        SET plan_hours = COALESCE(EXCLUDED.plan_hours,
                                                  {SCHEMA}.exec_plan_assignee.plan_hours)
                    """, (sid, resp, hours))
                for ex in execs:
                    cur.execute(f"""
                        INSERT INTO {SCHEMA}.exec_plan_assignee
                            (step_id, person_id, raci_role, role_in_step, plan_hours)
                        VALUES (%s, %s, 'R', 'executor', %s)
                        ON CONFLICT (step_id, person_id, raci_role) DO UPDATE
                        SET plan_hours = COALESCE(EXCLUDED.plan_hours,
                                                  {SCHEMA}.exec_plan_assignee.plan_hours)
                    """, (sid, ex, hours))
                sets, params = [], []
                if due:
                    sets.append("due_date = %s")
                    params.append(due)
                if prio:
                    sets.append("priority = %s")
                    params.append(prio)
                if sets:
                    params.append(sid)
                    cur.execute(
                        f"UPDATE {SCHEMA}.exec_plan_step SET {', '.join(sets)}, updated_at = now() "
                        f"WHERE id = %s", params)
                done += 1
            audit(cur, actor, "plan_step", None, "bulk_assign", None,
                  {"step_ids": step_ids, "responsible_id": resp, "executor_ids": execs})
            conn.commit()
            remaining = len([r for r in step_rows(cur) if not r["has_owner"]])
            by_kind = {}
            for sid in step_ids:
                k = kinds.get(sid, "task")
                by_kind[k] = by_kind.get(k, 0) + 1
            return cors({"ok": True, "data": {
                "updated": done,
                "by_kind": by_kind,
                "remaining_without_owner": remaining,
            }})

        if action == "unassigned_steps":
            return cors({"ok": True, "data": [
                r for r in step_rows(cur) if not r["has_owner"]
            ]})

        if action == "diag_detail":
            code = nz(qs.get("code")) or nz(body.get("code"))
            if not code:
                return cors({"ok": False, "error": {"message": "Не указан показатель"}}, 400)
            steps = step_rows(cur)
            if code == "S01":
                data = [r for r in steps if not r["has_owner"]]
            elif code == "S02":
                data = [r for r in steps if not r["due_date"]]
            elif code == "S03":
                data = [r for r in steps
                        if r["object_kind"] == "task" and r["estimate_hours"] is None]
            elif code == "S04":
                data = [r for r in steps
                        if r["object_kind"] == "task" and r["estimate_hours"] is not None
                        and float(r["assigned_hours"] or 0) > 0
                        and abs(float(r["assigned_hours"]) - float(r["estimate_hours"])) > 0.05]
            else:
                data = []
            return cors({"ok": True, "data": data})

        if action == "diagnostics":
            return cors({"ok": True, "data": diagnostics(cur, as_int(qs.get("center_id")))})

        if action == "refs":
            cur.execute(f"""
                SELECT c.id, c.code, c.name, d.name AS domain_name
                FROM {SCHEMA}.professional_competencies c
                LEFT JOIN {SCHEMA}.professional_competency_domains d ON d.id = c.domain_id
                WHERE COALESCE(c.status, 'active') = 'active'
                ORDER BY d.name, c.name
            """)
            comps = rows(cur)
            cur.execute(f"""
                SELECT f.id, f.title, f.code, f.center_id, c.title AS center_title
                FROM {SCHEMA}.exec_center_function f
                LEFT JOIN {SCHEMA}.exec_center c ON c.id = f.center_id
                ORDER BY f.sort_order, f.id
            """)
            funcs = rows(cur)
            cur.execute(f"""
                SELECT id, title FROM {SCHEMA}.exec_initiative
                WHERE COALESCE(status, '') <> 'archived' ORDER BY title
            """)
            inits = rows(cur)
            cur.execute(f"""
                SELECT s.id, s.title, s.status, s.due_date, s.step_type,
                       p.title AS plan_title
                FROM {SCHEMA}.exec_plan_step s
                LEFT JOIN {SCHEMA}.exec_plan p ON p.id = s.plan_id
                WHERE s.status NOT IN ('done', 'cancelled')
                ORDER BY s.due_date NULLS LAST LIMIT 500
            """)
            steps = rows(cur)
            cur.execute(f"""
                SELECT id, display_name, position_title FROM {SCHEMA}.exec_person
                WHERE COALESCE(record_state, 'active') = 'active' ORDER BY display_name
            """)
            persons = rows(cur)
            cur.execute(f"SELECT id, title FROM {SCHEMA}.exec_center ORDER BY title")
            centers = rows(cur)
            return cors({"ok": True, "data": {
                "competencies": comps, "functions": funcs,
                "initiatives": inits, "steps": steps, "persons": persons,
                "centers": centers,
            }})

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