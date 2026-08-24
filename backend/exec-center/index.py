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
    "reserve_pct", "annual_fund_hours", "backup_coverage_pct",
    "roadmap_text", "expected_effects",
]
CENTER_STATUS_TITLE = {
    "modeling": "Моделирование",
    "preparation": "Подготовка к созданию",
    "proposed": "На согласовании",
    "active": "Действует",
    "archived": "Архив",
}
GOAL_FIELDS = [
    "center_id", "parent_goal_id", "kind", "title", "description", "metric",
    "baseline_value", "target_value", "horizon", "due_date",
    "owner_person_id", "status", "progress_pct", "sort_order",
]
FUNC_FIELDS = [
    "center_id", "code", "title", "description", "purpose", "result_description",
    "goal_id", "criticality", "work_category",
    "regularity", "hours_per_month", "fte_estimate", "status", "sort_order", "note",
]
PARTICIPATION_FIELDS = [
    "person_id", "center_id", "role_in_model", "participation_format",
    "center_hours_per_week", "target_role_title", "planned_transfer",
    "resource_source", "date_from", "date_to", "note",
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
NUM_KEYS = {
    "hours_per_month", "fte_estimate", "headcount", "hours_per_week",
    "center_hours_per_week", "reserve_pct", "annual_fund_hours", "backup_coverage_pct",
}


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


def dashboard(cur, center_id: int):
    """Сводная управленческая картина Центра: от целей до фактических часов."""
    cur.execute(f"""
        SELECT c.*, p.display_name AS head_name,
               i.title AS initiative_title, pl.title AS plan_title
        FROM {SCHEMA}.exec_center c
        LEFT JOIN {SCHEMA}.exec_person p ON p.id = c.head_person_id
        LEFT JOIN {SCHEMA}.exec_initiative i ON i.id = c.initiative_id
        LEFT JOIN {SCHEMA}.exec_plan pl ON pl.id = c.plan_id
        WHERE c.id = %s
    """, (center_id,))
    got = rows(cur)
    if not got:
        return {"center": None}
    center = got[0]

    # Цели и показатели
    cur.execute(f"""
        SELECT g.*, p.display_name AS owner_name,
               (SELECT COUNT(*) FROM {SCHEMA}.exec_center_function f
                 WHERE f.goal_id = g.id) AS function_count,
               (SELECT v.value FROM {SCHEMA}.exec_center_kpi_value v
                 WHERE v.goal_id = g.id ORDER BY v.period_date DESC LIMIT 1) AS last_value,
               (SELECT v.period_date FROM {SCHEMA}.exec_center_kpi_value v
                 WHERE v.goal_id = g.id ORDER BY v.period_date DESC LIMIT 1) AS last_period
        FROM {SCHEMA}.exec_center_goal g
        LEFT JOIN {SCHEMA}.exec_person p ON p.id = g.owner_person_id
        WHERE g.center_id = %s
        ORDER BY g.kind DESC, g.sort_order, g.id
    """, (center_id,))
    goals = rows(cur)

    # Функции: владелец и замещающий только из RACI, покрытие компетенциями
    cur.execute(f"""
        SELECT f.id, f.code, f.title, f.criticality, f.status, f.goal_id,
               f.hours_per_month, f.fte_estimate, f.sort_order,
               g.title AS goal_title,
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
                 WHERE fc.function_id = f.id) AS req_competencies,
               (SELECT COUNT(*) FROM {SCHEMA}.exec_function_competency fc
                 WHERE fc.function_id = f.id AND fc.is_critical) AS req_critical,
               (SELECT COUNT(*) FROM {SCHEMA}.exec_function_initiative fi
                 WHERE fi.function_id = f.id) AS initiative_count,
               (SELECT COUNT(*) FROM {SCHEMA}.exec_plan_step_function sf
                  JOIN {SCHEMA}.exec_plan_step s ON s.id = sf.step_id
                 WHERE sf.function_id = f.id AND s.status NOT IN ('done','cancelled')) AS open_steps
        FROM {SCHEMA}.exec_center_function f
        LEFT JOIN {SCHEMA}.exec_center_goal g ON g.id = f.goal_id
        WHERE f.center_id = %s
        ORDER BY f.sort_order, f.id
    """, (center_id,))
    functions = rows(cur)

    # Покрытие компетенциями: у кого из владельцев уровень ниже требуемого
    cur.execute(f"""
        SELECT f.id AS function_id, f.title AS function_title,
               c.name AS competency_name, fc.required_level, fc.is_critical,
               r.person_id, pr.display_name,
               pc.current_level
        FROM {SCHEMA}.exec_function_competency fc
        JOIN {SCHEMA}.exec_center_function f ON f.id = fc.function_id
        JOIN {SCHEMA}.professional_competencies c ON c.id = fc.competency_id
        LEFT JOIN {SCHEMA}.exec_function_raci r
               ON r.function_id = f.id AND r.raci_role = 'A' AND r.valid_to IS NULL
        LEFT JOIN {SCHEMA}.exec_person pr ON pr.id = r.person_id
        LEFT JOIN {SCHEMA}.exec_person_competency pc
               ON pc.person_id = r.person_id AND pc.competency_id = fc.competency_id
        WHERE f.center_id = %s
        ORDER BY fc.is_critical DESC, f.sort_order
    """, (center_id,))
    coverage = rows(cur)
    gaps = [
        r for r in coverage
        if r["person_id"] and (r["current_level"] is None
                               or (r["current_level"] or 0) < (r["required_level"] or 0))
    ]

    # Штат и обоснование численности
    cur.execute(f"""
        SELECT r.*, p.display_name AS person_name,
               (SELECT COUNT(*) FROM {SCHEMA}.exec_center_role_function rf
                 WHERE rf.role_id = r.id) AS function_count
        FROM {SCHEMA}.exec_center_role r
        LEFT JOIN {SCHEMA}.exec_person p ON p.id = r.person_id
        WHERE r.center_id = %s ORDER BY r.sort_order, r.id
    """, (center_id,))
    roles = rows(cur)

    # Инициативы Центра: через функции и через собственную привязку
    cur.execute(f"""
        SELECT DISTINCT i.id, i.title, i.status, i.stage, i.priority,
               i.plan_start, i.plan_end, i.effect_metric, i.effect_target,
               i.effect_actual, i.verification_status,
               COALESCE(i.is_test_data, false) AS is_test,
               (SELECT COUNT(*) FROM {SCHEMA}.exec_plan pl
                  JOIN {SCHEMA}.exec_plan_step s ON s.plan_id = pl.id
                 WHERE pl.initiative_id = i.id AND s.status NOT IN ('done','cancelled')) AS open_steps,
               (SELECT COUNT(*) FROM {SCHEMA}.exec_plan pl
                  JOIN {SCHEMA}.exec_plan_step s ON s.plan_id = pl.id
                 WHERE pl.initiative_id = i.id AND s.status NOT IN ('done','cancelled')
                   AND s.due_date < CURRENT_DATE) AS overdue_steps,
               (SELECT COUNT(*) FROM {SCHEMA}.exec_milestone m
                 WHERE m.initiative_id = i.id) AS milestone_count
        FROM {SCHEMA}.exec_initiative i
        WHERE (i.id = %s
               OR i.id IN (SELECT fi.initiative_id FROM {SCHEMA}.exec_function_initiative fi
                            JOIN {SCHEMA}.exec_center_function f ON f.id = fi.function_id
                           WHERE f.center_id = %s)
               OR %s IS NULL)
        ORDER BY i.title
    """, (center["initiative_id"], center_id, center["initiative_id"]))
    initiatives = rows(cur)

    # Контрольные точки: управленческие вехи и отметки в плане
    cur.execute(f"""
        SELECT m.id, m.title, m.plan_date AS due_date, m.status, m.fact_date,
               i.title AS initiative_title, 'milestone' AS kind,
               COALESCE(m.is_test_data, false) AS is_test,
               (m.plan_date < CURRENT_DATE
                AND COALESCE(m.status, '') NOT IN ('done','achieved')) AS is_overdue
        FROM {SCHEMA}.exec_milestone m
        LEFT JOIN {SCHEMA}.exec_initiative i ON i.id = m.initiative_id
        UNION ALL
        SELECT s.id, s.title, s.due_date, s.status, s.fact_date,
               pl.title AS initiative_title, 'control_point' AS kind,
               false AS is_test,
               (s.due_date < CURRENT_DATE AND s.status NOT IN ('done','cancelled')) AS is_overdue
        FROM {SCHEMA}.exec_plan_step s
        LEFT JOIN {SCHEMA}.exec_plan pl ON pl.id = s.plan_id
        WHERE s.is_control_point = true AND s.status <> 'cancelled'
        ORDER BY due_date NULLS LAST
        LIMIT 60
    """)
    checkpoints = rows(cur)

    # Риски и блокировки
    cur.execute(f"""
        SELECT r.id, r.description AS title, r.status,
               r.probability, r.impact, r.risk_score,
               r.is_blocking, r.block_what, r.block_status,
               r.center_function_id, f.title AS function_title,
               i.title AS initiative_title,
               COALESCE(r.is_test_data, false) AS is_test,
               CASE WHEN COALESCE(r.risk_score, 0) >= 12 THEN 'high'
                    WHEN COALESCE(r.risk_score, 0) >= 6 THEN 'medium'
                    ELSE 'low' END AS severity
        FROM {SCHEMA}.exec_risk r
        LEFT JOIN {SCHEMA}.exec_center_function f ON f.id = r.center_function_id
        LEFT JOIN {SCHEMA}.exec_initiative i ON i.id = r.initiative_id
        WHERE COALESCE(r.status, '') NOT IN ('closed', 'cancelled', 'realized')
        ORDER BY COALESCE(r.risk_score, 0) DESC
        LIMIT 40
    """)
    risks = rows(cur)

    cur.execute(f"""
        SELECT s.id, s.title, s.criticality AS severity, s.status,
               s.is_blocking, s.block_what, s.block_status, s.due_at,
               s.needs_escalation, i.title AS initiative_title,
               COALESCE(s.is_test_data, false) AS is_test
        FROM {SCHEMA}.exec_issue s
        LEFT JOIN {SCHEMA}.exec_initiative i ON i.id = s.initiative_id
        WHERE COALESCE(s.status, '') NOT IN ('closed', 'resolved', 'cancelled')
        ORDER BY CASE s.criticality WHEN 'critical' THEN 1 WHEN 'high' THEN 2
                                    WHEN 'medium' THEN 3 ELSE 4 END
        LIMIT 40
    """)
    issues = rows(cur)

    # Трудозатраты: план из назначений, факт из учёта времени
    cur.execute(f"""
        SELECT
            COALESCE(SUM(a.plan_hours), 0) AS plan_hours,
            COUNT(DISTINCT a.person_id) AS people_involved
        FROM {SCHEMA}.exec_plan_assignee a
        JOIN {SCHEMA}.exec_plan_step s ON s.id = a.step_id
        WHERE s.status <> 'cancelled'
    """)
    labor = rows(cur)[0]
    cur.execute(f"""
        SELECT COALESCE(SUM(hours), 0) AS fact_hours,
               COUNT(DISTINCT person_id) AS people_reported
        FROM {SCHEMA}.exec_time_entry
    """)
    labor.update(rows(cur)[0])

    # Результаты: выполненные работы
    cur.execute(f"""
        SELECT
            COUNT(*) FILTER (WHERE status = 'done') AS steps_done,
            COUNT(*) FILTER (WHERE status NOT IN ('done','cancelled')) AS steps_open,
            COUNT(*) FILTER (WHERE status NOT IN ('done','cancelled')
                              AND due_date < CURRENT_DATE) AS steps_overdue,
            COUNT(*) FILTER (WHERE is_control_point AND status = 'done') AS cp_done,
            COUNT(*) FILTER (WHERE is_control_point) AS cp_total
        FROM {SCHEMA}.exec_plan_step
    """)
    results = rows(cur)[0]

    # Сводные показатели
    crit = [f for f in functions if f["criticality"] == "high"]
    stats = {
        "goals": len([g for g in goals if g["kind"] == "goal"]),
        "tasks": len([g for g in goals if g["kind"] != "goal"]),
        "goals_no_metric": len([g for g in goals
                                if g["kind"] == "goal"
                                and (not g["metric"] or not g["target_value"])]),
        "goals_no_value": len([g for g in goals
                               if g["kind"] == "goal" and not g["last_value"]]),
        "functions": len(functions),
        "functions_no_owner": len([f for f in functions if not f["owner_id"]]),
        "critical_functions": len(crit),
        "critical_no_backup": len([f for f in crit if not f["backup_name"]]),
        "functions_no_competency": len([f for f in functions if not f["req_competencies"]]),
        "competency_gaps": len(gaps),
        "hours_per_month": round(sum(float(f["hours_per_month"] or 0) for f in functions), 1),
        "fte_total": round(sum(float(f["fte_estimate"] or 0) for f in functions), 2),
        "roles": len(roles),
        "headcount": sum(int(r["headcount"] or 0) for r in roles),
        "headcount_filled": sum(int(r["headcount"] or 0) for r in roles if r["person_id"]),
        "vacant_roles": len([r for r in roles if not r["person_id"]]),
        "roles_no_justification": len([r for r in roles if not r["justification"]]),
        "initiatives": len(initiatives),
        "checkpoints": len(checkpoints),
        "checkpoints_overdue": len([c for c in checkpoints if c["is_overdue"]]),
        "risks_high": len([r for r in risks if r["severity"] == "high"]),
        "blocking": len([r for r in risks if r["is_blocking"]])
                    + len([i for i in issues if i["is_blocking"]]),
        "risks": len(risks),
        "issues": len(issues),
        "test_records": (len([i for i in initiatives if i["is_test"]])
                         + len([r for r in risks if r["is_test"]])
                         + len([i for i in issues if i["is_test"]])
                         + len([c for c in checkpoints if c["is_test"]])),
    }

    # Готовность паспорта: что заполнено, что нет
    readiness = [
        {"code": "passport", "title": "Паспорт Центра",
         "done": bool(center["mission"] and center["rationale"]),
         "hint": "Назначение и обоснование создания"},
        {"code": "goals", "title": "Цели с показателями",
         "done": stats["goals"] > 0 and stats["goals_no_metric"] == 0,
         "hint": "У каждой цели измеримый показатель и целевое значение"},
        {"code": "functions", "title": "Функции Центра",
         "done": stats["functions"] > 0,
         "hint": "Перечень выполняемой работы"},
        {"code": "owners", "title": "Владельцы функций",
         "done": stats["functions"] > 0 and stats["functions_no_owner"] == 0,
         "hint": "У каждой функции ответственный по матрице RACI"},
        {"code": "backup", "title": "Замещение критичных функций",
         "done": stats["critical_functions"] == 0 or stats["critical_no_backup"] == 0,
         "hint": "У критичных функций есть замещающий"},
        {"code": "competency", "title": "Требования к компетенциям",
         "done": stats["functions"] > 0 and stats["functions_no_competency"] == 0,
         "hint": "Для функций описаны нужные навыки и уровни"},
        {"code": "roles", "title": "Обоснование численности",
         "done": stats["roles"] > 0 and stats["roles_no_justification"] == 0,
         "hint": "Штатные позиции с обоснованием потребности"},
        {"code": "labor", "title": "Учёт трудозатрат",
         "done": float(labor["fact_hours"] or 0) > 0,
         "hint": "Вносятся фактические часы работы"},
    ]
    done_n = len([r for r in readiness if r["done"]])
    stats["readiness_pct"] = round(done_n / len(readiness) * 100)
    stats["readiness_done"] = done_n
    stats["readiness_total"] = len(readiness)

    return {
        "center": center,
        "goals": goals,
        "functions": functions,
        "coverage": coverage,
        "gaps": gaps,
        "roles": roles,
        "initiatives": initiatives,
        "checkpoints": checkpoints,
        "risks": risks,
        "issues": issues,
        "labor": labor,
        "results": results,
        "stats": stats,
        "readiness": readiness,
    }


WORK_CATEGORY_TITLE = {
    "operational": "Постоянные функции",
    "project": "Проектная работа",
    "management": "Управление и координация",
    "analytics": "Аналитика и отчётность",
}

PARTICIPATION_FORMAT_TITLE = {
    "permanent": "Постоянно",
    "partial": "Частично",
    "expert": "Экспертно",
    "temporary": "Временно",
}

RESOURCE_SOURCE_TITLE = {
    "own_staff": "Собственный штат",
    "other_unit": "Другое подразделение",
    "project_team": "Проектная команда",
    "contractor": "Подрядчик",
}


def center_step_ids(cur, center_id: int):
    """Шаги плана, выполняемые в интересах Центра: через функции Центра
    либо через инициативу, привязанную к паспорту Центра."""
    cur.execute(f"""
        SELECT DISTINCT s.id
        FROM {SCHEMA}.exec_plan_step s
        WHERE s.status <> 'cancelled'
          AND (
            EXISTS (SELECT 1 FROM {SCHEMA}.exec_plan_step_function sf
                      JOIN {SCHEMA}.exec_center_function f ON f.id = sf.function_id
                     WHERE sf.step_id = s.id AND f.center_id = %s)
            OR EXISTS (SELECT 1 FROM {SCHEMA}.exec_plan p
                        JOIN {SCHEMA}.exec_center c ON c.initiative_id = p.initiative_id
                       WHERE p.id = s.plan_id AND c.id = %s)
          )
    """, (center_id, center_id))
    return [r[0] for r in cur.fetchall()]


def current_team(cur, center_id: int):
    """Распределённая команда: кто фактически сейчас работает на Центр,
    независимо от официального подразделения."""
    step_ids = center_step_ids(cur, center_id)

    cur.execute(f"""
        SELECT pcp.*, p.display_name, p.position_title, p.org_name,
               p.employment_type,
               cap.hours_per_week AS total_hours_per_week
        FROM {SCHEMA}.exec_person_center_participation pcp
        JOIN {SCHEMA}.exec_person p ON p.id = pcp.person_id
        LEFT JOIN {SCHEMA}.exec_person_capacity cap
               ON cap.person_id = pcp.person_id AND cap.valid_to IS NULL
        WHERE pcp.center_id = %s
        ORDER BY p.display_name
    """, (center_id,))
    participation = rows(cur)

    cur.execute(f"""
        SELECT r.person_id, r.function_id, r.raci_role, r.is_backup,
               f.title AS function_title, f.criticality
        FROM {SCHEMA}.exec_function_raci r
        JOIN {SCHEMA}.exec_center_function f ON f.id = r.function_id
        WHERE f.center_id = %s AND r.valid_to IS NULL
    """, (center_id,))
    raci_by_person: dict = {}
    for r in rows(cur):
        raci_by_person.setdefault(r["person_id"], []).append(r)

    plan_fact: dict = {}
    if step_ids:
        cur.execute(f"""
            SELECT a.person_id,
                   COALESCE(SUM(a.plan_hours), 0) AS plan_hours,
                   (SELECT COALESCE(SUM(t.hours), 0) FROM {SCHEMA}.exec_time_entry t
                     WHERE t.person_id = a.person_id AND t.step_id = ANY(%s)) AS fact_hours
            FROM {SCHEMA}.exec_plan_assignee a
            WHERE a.step_id = ANY(%s)
            GROUP BY a.person_id
        """, (step_ids, step_ids))
        for r in rows(cur):
            plan_fact[r["person_id"]] = r

    for p in participation:
        p["functions"] = raci_by_person.get(p["person_id"], [])
        pf = plan_fact.get(p["person_id"], {"plan_hours": 0, "fact_hours": 0})
        p["center_plan_hours"] = float(pf["plan_hours"] or 0)
        p["center_fact_hours"] = float(pf["fact_hours"] or 0)
        p["format_title"] = PARTICIPATION_FORMAT_TITLE.get(p["participation_format"], p["participation_format"])
        p["source_title"] = RESOURCE_SOURCE_TITLE.get(p["resource_source"], p["resource_source"])

    # Люди, выполняющие функции/задачи Центра, но без карточки участия —
    # видно, что модель ещё не полностью описана
    described_ids = {p["person_id"] for p in participation}
    cur.execute(f"""
        SELECT DISTINCT r.person_id, p.display_name, p.position_title, p.org_name
        FROM {SCHEMA}.exec_function_raci r
        JOIN {SCHEMA}.exec_center_function f ON f.id = r.function_id
        JOIN {SCHEMA}.exec_person p ON p.id = r.person_id
        WHERE f.center_id = %s AND r.valid_to IS NULL
    """, (center_id,))
    undocumented = [r for r in rows(cur) if r["person_id"] not in described_ids]

    return {"participation": participation, "undocumented": undocumented}


def target_structure(cur, center_id: int):
    """Целевая модель: штатные позиции и покрытие функций в перспективе."""
    cur.execute(f"""
        SELECT r.*, p.display_name AS person_name,
               COALESCE((SELECT json_agg(json_build_object('id', f.id, 'title', f.title))
                          FROM {SCHEMA}.exec_center_role_function rf
                          JOIN {SCHEMA}.exec_center_function f ON f.id = rf.function_id
                         WHERE rf.role_id = r.id), '[]'::json) AS functions
        FROM {SCHEMA}.exec_center_role r
        LEFT JOIN {SCHEMA}.exec_person p ON p.id = r.person_id
        WHERE r.center_id = %s
        ORDER BY r.sort_order, r.id
    """, (center_id,))
    roles = rows(cur)

    cur.execute(f"""
        SELECT f.id, f.title, f.criticality, f.work_category, f.hours_per_month,
               (SELECT COUNT(*) FROM {SCHEMA}.exec_center_role_function rf
                 WHERE rf.function_id = f.id) AS target_role_count,
               (SELECT pr.display_name FROM {SCHEMA}.exec_function_raci r
                  JOIN {SCHEMA}.exec_person pr ON pr.id = r.person_id
                 WHERE r.function_id = f.id AND r.raci_role = 'A'
                   AND r.valid_to IS NULL LIMIT 1) AS current_owner,
               COALESCE((SELECT SUM(a.plan_hours) FROM {SCHEMA}.exec_plan_assignee a
                          JOIN {SCHEMA}.exec_plan_step_function sf ON sf.step_id = a.step_id
                         WHERE sf.function_id = f.id), 0) AS current_plan_hours,
               (SELECT COUNT(*) FROM {SCHEMA}.exec_function_competency fc
                 WHERE fc.function_id = f.id) AS req_competencies
        FROM {SCHEMA}.exec_center_function f
        WHERE f.center_id = %s
        ORDER BY f.sort_order, f.id
    """, (center_id,))
    functions = rows(cur)
    for f in functions:
        f["covered_now"] = bool(f["current_owner"])
        f["covered_in_target"] = f["target_role_count"] > 0
        f["needs_new_position"] = not f["covered_in_target"]

    return {"roles": roles, "functions": functions}


def staffing_calculation(cur, center_id: int):
    """Расчёт потребности в штате: годовая трудоёмкость / полезный годовой фонд.

    Потребность в ставках = годовая трудоёмкость функций и инициатив /
    полезный годовой фонд времени одного сотрудника.
    Расшифровка по категориям + отдельно резерв и замещение непрерывности.
    """
    cur.execute(f"""
        SELECT reserve_pct, annual_fund_hours, backup_coverage_pct
        FROM {SCHEMA}.exec_center WHERE id = %s
    """, (center_id,))
    center = rows(cur)[0]
    fund = float(center["annual_fund_hours"] or 1900)
    reserve_pct = float(center["reserve_pct"] or 0) / 100
    backup_pct = float(center["backup_coverage_pct"] or 0) / 100

    cur.execute(f"""
        SELECT work_category, criticality,
               COALESCE(SUM(hours_per_month), 0) * 12 AS annual_hours,
               COUNT(*) AS function_count
        FROM {SCHEMA}.exec_center_function
        WHERE center_id = %s
        GROUP BY work_category, criticality
    """, (center_id,))
    by_cat_crit = rows(cur)

    categories = []
    base_total = 0.0
    critical_hours = 0.0
    for code, title in WORK_CATEGORY_TITLE.items():
        cat_rows = [r for r in by_cat_crit if r["work_category"] == code]
        hours = sum(float(r["annual_hours"] or 0) for r in cat_rows)
        fcount = sum(int(r["function_count"] or 0) for r in cat_rows)
        crit = sum(float(r["annual_hours"] or 0) for r in cat_rows if r["criticality"] == "high")
        critical_hours += crit
        base_total += hours
        categories.append({
            "code": code, "title": title, "annual_hours": round(hours, 1),
            "function_count": fcount, "fte": round(hours / fund, 2) if fund else 0,
        })

    reserve_hours = base_total * reserve_pct
    backup_hours = critical_hours * backup_pct
    total_hours = base_total + reserve_hours + backup_hours
    required_fte = round(total_hours / fund, 2) if fund else 0

    # Доступность: сколько ёмкости уже выделено распределённой командой
    cur.execute(f"""
        SELECT COALESCE(SUM(annual_fund_hours_ref.v * (pcp.center_hours_per_week / 40.0)), 0) AS hrs
        FROM {SCHEMA}.exec_person_center_participation pcp,
             LATERAL (SELECT %s::numeric AS v) annual_fund_hours_ref
        WHERE pcp.center_id = %s AND pcp.center_hours_per_week IS NOT NULL
          AND (pcp.date_to IS NULL OR pcp.date_to >= CURRENT_DATE)
    """, (fund, center_id))
    avail = rows(cur)[0]
    available_hours = float(avail["hrs"] or 0)
    available_fte = round(available_hours / fund, 2) if fund else 0

    cur.execute(f"""
        SELECT COALESCE(SUM(headcount), 0) AS staffed
        FROM {SCHEMA}.exec_center_role WHERE center_id = %s
    """, (center_id,))
    staffed_fte = float(rows(cur)[0]["staffed"] or 0)

    return {
        "annual_fund_hours": fund,
        "reserve_pct": center["reserve_pct"],
        "backup_coverage_pct": center["backup_coverage_pct"],
        "categories": categories,
        "base_total_hours": round(base_total, 1),
        "reserve_hours": round(reserve_hours, 1),
        "backup_hours": round(backup_hours, 1),
        "total_hours": round(total_hours, 1),
        "required_fte": required_fte,
        "available_hours": round(available_hours, 1),
        "available_fte": available_fte,
        "staffed_fte": round(staffed_fte, 2),
        "deficit_fte": round(required_fte - available_fte, 2),
        "target_gap_fte": round(required_fte - staffed_fte, 2),
    }


def status_quo_risks(cur, center_id: int):
    """Риски сохранения текущего распределённого формата — для обоснования."""
    risks = []

    cur.execute(f"""
        SELECT f.title FROM {SCHEMA}.exec_center_function f
        WHERE f.center_id = %s AND f.criticality = 'high'
          AND NOT EXISTS (SELECT 1 FROM {SCHEMA}.exec_function_raci r
              WHERE r.function_id = f.id AND r.is_backup = true AND r.valid_to IS NULL)
    """, (center_id,))
    for r in rows(cur):
        risks.append({"code": "no_backup", "level": "high",
                      "text": f"Критичная функция «{r['title']}» держится на одном человеке "
                              f"без замещения — риск при увольнении или отпуске"})

    cur.execute(f"""
        SELECT p.display_name, COUNT(DISTINCT r.function_id) AS n
        FROM {SCHEMA}.exec_function_raci r
        JOIN {SCHEMA}.exec_person p ON p.id = r.person_id
        JOIN {SCHEMA}.exec_center_function f ON f.id = r.function_id
        WHERE f.center_id = %s AND r.raci_role = 'A' AND r.valid_to IS NULL
        GROUP BY p.display_name HAVING COUNT(DISTINCT r.function_id) >= 3
    """, (center_id,))
    for r in rows(cur):
        risks.append({"code": "overloaded_owner", "level": "medium",
                      "text": f"{r['display_name']} отвечает сразу за {r['n']} функций "
                              f"распределённой модели — риск перегрузки и потери качества"})

    cur.execute(f"""
        SELECT COUNT(*) AS n FROM {SCHEMA}.exec_person_center_participation
        WHERE center_id = %s AND participation_format IN ('temporary', 'expert')
    """, (center_id,))
    tmp = rows(cur)[0]["n"]
    if tmp:
        risks.append({"code": "temporary_resources", "level": "medium",
                      "text": f"{tmp} участников работают на временной или экспертной основе — "
                              f"устойчивость команды не гарантирована"})

    cur.execute(f"""
        SELECT COUNT(*) AS n FROM {SCHEMA}.exec_person_center_participation
        WHERE center_id = %s AND resource_source <> 'own_staff'
    """, (center_id,))
    ext = rows(cur)[0]["n"]
    if ext:
        risks.append({"code": "external_source", "level": "low",
                      "text": f"{ext} человек привлечены из других подразделений или извне — "
                              f"их возврат в исходные задачи снизит возможности Центра"})

    return risks


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

        if action == "model":
            # Сводка распределённой модели: текущая команда, целевая структура,
            # расчёт численности и риски сохранения статус-кво
            if not cid:
                cur.execute(f"""
                    SELECT id FROM {SCHEMA}.exec_center
                    ORDER BY (status <> 'archived') DESC, id DESC LIMIT 1
                """)
                got = rows(cur)
                if not got:
                    return cors({"ok": True, "data": {"center": None}})
                cid = got[0]["id"]
            data = center_detail(cur, cid)
            if not data:
                return cors({"ok": False, "error": {"message": "Центр не найден"}}, 404)
            return cors({"ok": True, "data": {
                "center": data,
                "current_team": current_team(cur, cid),
                "target": target_structure(cur, cid),
                "staffing": staffing_calculation(cur, cid),
                "status_quo_risks": status_quo_risks(cur, cid),
            }})

        if action == "save_participation":
            pid = as_int(body.get("person_id"))
            ctr = as_int(body.get("center_id"))
            if not pid or not ctr:
                return cors({"ok": False, "error": {"message": "Укажите сотрудника и центр"}}, 400)
            new_id, err = upsert(cur, "exec_person_center_participation",
                                  PARTICIPATION_FIELDS, body, require_title=False)
            if err:
                return cors({"ok": False, "error": {"message": err}}, 400)
            conn.commit()
            return cors({"ok": True, "data": {"id": new_id}})

        if action == "delete_participation":
            rid = as_int(body.get("id"))
            if not rid:
                return cors({"ok": False, "error": {"message": "Не указана запись"}}, 400)
            cur.execute(
                f"DELETE FROM {SCHEMA}.exec_person_center_participation WHERE id = %s", (rid,))
            conn.commit()
            return cors({"ok": True, "data": {"id": rid}})

        if action == "dashboard":
            cid = as_int(qs.get("center_id")) or as_int(body.get("center_id"))
            if not cid:
                # Действующий центр, иначе последний созданный — включая архивный,
                # чтобы запись не пропадала из виду
                cur.execute(f"""
                    SELECT id FROM {SCHEMA}.exec_center
                    ORDER BY (status <> 'archived') DESC, id DESC LIMIT 1
                """)
                got = rows(cur)
                if not got:
                    return cors({"ok": True, "data": {"center": None}})
                cid = got[0]["id"]
            return cors({"ok": True, "data": dashboard(cur, cid)})

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