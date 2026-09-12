import json
import os
import io
import base64
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
    "goal_level", "code", "org_unit_id", "priority", "valid_from", "valid_to",
    "achievement_criteria", "actual_date", "progress_mode", "manual_status_confirmed",
]
GOAL_LEVELS = ("strategic", "organization", "center", "org_unit", "initiative", "project")
GOAL_STATUSES = ("draft", "agreed", "active", "achieved", "paused", "cancelled", "archived")

INDICATOR_FIELDS = [
    "code", "title", "purpose", "indicator_type", "unit", "improvement_direction",
    "periodicity", "owner_person_id", "data_entry_person_id", "data_source",
    "baseline_value", "target_value", "threshold_yellow", "threshold_red",
    "range_min", "range_max", "is_calculated", "active_methodology_id",
    "applicability", "status",
]
INDICATOR_TYPES = ("kpi", "performance", "effect", "process", "quality",
                    "deadline", "financial", "resource", "risk", "informational")
IMPROVEMENT_DIRECTIONS = ("higher_is_better", "lower_is_better", "in_range", "target_exact", "observe_only")

METHODOLOGY_FIELDS = [
    "indicator_id", "description_text", "formula_kind", "numerator_desc",
    "denominator_desc", "rounding_rule", "period_kind", "exceptions_text",
    "component_sources", "document_source_id", "approved_at", "approved_by", "status",
]
FORMULA_KINDS = ("manual", "sum", "average", "percentage", "ratio", "difference", "running_total")

INDICATOR_VALUE_FIELDS = [
    "indicator_id", "methodology_id", "period_kind", "period_start", "period_end",
    "plan_value", "actual_value", "forecast_value", "threshold_value", "unit",
    "data_source", "received_at", "entered_by", "confirmed_by",
    "verification_status", "comment",
]

GOAL_INDICATOR_FIELDS = ["goal_id", "indicator_id", "weight_pct", "note"]
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
    "code", "org_unit_id", "level", "cost_per_month", "valid_from", "valid_to",
]

# ============ ОРГАНИЗАЦИОННАЯ МОДЕЛЬ: подразделения, штат, RACI, план ============
ORG_UNIT_FIELDS = [
    "center_id", "name", "short_name", "type", "parent_id", "head_person_id",
    "valid_from", "valid_to", "status", "description", "sort_order", "code",
]
ROLE_POSITION_FIELDS = [
    "role_id", "org_unit_id", "fte", "person_id", "status", "date_from",
    "date_to", "note", "is_test_data",
]
ORG_RESOURCE_PLAN_LINE_FIELDS = [
    "version_id", "org_unit_id", "role_id", "month", "planned_fte",
    "available_fte", "operational_demand_fte", "external_fte",
    "fot_plan_amount", "comment",
]

INT_KEYS = {
    "head_person_id", "planned_headcount", "initiative_id", "plan_id",
    "center_id", "parent_goal_id", "owner_person_id", "progress_pct",
    "sort_order", "goal_id", "backup_person_id", "person_id",
    "competency_id", "required_level", "function_id", "dept_function_id",
    "step_id", "share_pct", "org_unit_id", "parent_id", "role_id",
    "version_id", "requirement_id", "year",
    "indicator_id", "methodology_id", "data_entry_person_id",
    "active_methodology_id", "document_source_id",
}
NUM_KEYS = {
    "hours_per_month", "fte_estimate", "headcount", "hours_per_week",
    "center_hours_per_week", "reserve_pct", "annual_fund_hours", "backup_coverage_pct",
    "cost_per_month", "fte", "planned_fte", "available_fte",
    "operational_demand_fte", "external_fte", "fot_plan_amount", "weight_pct",
}
# baseline_value/target_value/threshold_*/range_*/plan_value/actual_value/
# forecast_value/threshold_value НЕ включены в глобальный NUM_KEYS: те же
# имена в exec_center_goal (baseline_value/target_value) — свободный текст
# VARCHAR ("15%", "3 месяца"), а в exec_indicator/exec_indicator_value —
# NUMERIC. clean() определяет тип по имени поля без учёта таблицы, поэтому
# для показателей и значений числа приводятся явно в save_indicator*/
# save_indicator_value ниже, а не через общий upsert().
INDICATOR_NUM_KEYS = {
    "baseline_value", "target_value", "threshold_yellow", "threshold_red",
    "range_min", "range_max", "plan_value", "actual_value",
    "forecast_value", "threshold_value",
}


def clean(d: dict, fields: list, extra_num_keys: set = frozenset()) -> dict:
    vals = {}
    for f in fields:
        if f not in d:
            continue
        v = d.get(f)
        if f in INT_KEYS:
            v = as_int(v)
        elif f in NUM_KEYS or f in extra_num_keys:
            v = as_num(v)
        else:
            v = nz(v)
        vals[f] = v
    return vals


def upsert(cur, table: str, fields: list, d: dict, require_title: bool = True,
           extra_num_keys: set = frozenset(), has_updated_at: bool = True):
    """Создаёт или обновляет запись. Возвращает (id, ошибка)."""
    rid = as_int(d.get("id"))
    vals = clean(d, fields, extra_num_keys)
    if require_title and not rid and not vals.get("title"):
        return None, "Не указано название"
    if not vals:
        return rid, None
    if rid:
        sets = ", ".join(f"{k} = %s" for k in vals)
        touch = ", updated_at = now()" if has_updated_at else ""
        cur.execute(
            f"UPDATE {SCHEMA}.{table} SET {sets}{touch} WHERE id = %s RETURNING id",
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
               (SELECT COALESCE(SUM(r.headcount), 0) FROM {SCHEMA}.exec_center_role r
                 WHERE r.center_id = c.id AND r.is_test_data = false) AS roles_headcount
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


def _period_starts(periodicity: str, horizon_days: int) -> list:
    """Начала периодов (даты) от сегодня до горизонта, для штамповки задач.
    daily — каждый день, weekly — каждый понедельник, monthly — 1 число,
    quarterly — начало квартала, yearly — начало года."""
    import datetime
    today = datetime.date.today()
    end = today + datetime.timedelta(days=horizon_days)
    out = []

    if periodicity == "daily":
        d = today
        while d <= end:
            out.append(d)
            d += datetime.timedelta(days=1)
    elif periodicity == "weekly":
        d = today - datetime.timedelta(days=today.weekday())
        while d <= end:
            if d >= today:
                out.append(d)
            d += datetime.timedelta(days=7)
    elif periodicity == "monthly":
        y, m = today.year, today.month
        while True:
            d = datetime.date(y, m, 1)
            if d > end:
                break
            if d >= today.replace(day=1):
                out.append(max(d, today))
            m += 1
            if m > 12:
                m = 1
                y += 1
    elif periodicity == "quarterly":
        y, q_month = today.year, ((today.month - 1) // 3) * 3 + 1
        while True:
            d = datetime.date(y, q_month, 1)
            if d > end:
                break
            if d + datetime.timedelta(days=90) >= today:
                out.append(max(d, today))
            q_month += 3
            if q_month > 12:
                q_month = 1
                y += 1
    elif periodicity == "yearly":
        y = today.year
        while datetime.date(y, 1, 1) <= end:
            d = datetime.date(y, 1, 1)
            out.append(max(d, today))
            y += 1

    return sorted(set(out))


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


def log_change(cur, actor, entity, eid, action, after=None):
    cur.execute(
        f"INSERT INTO {SCHEMA}.exec_audit_log (entity_type, entity_id, action, actor, after_json) "
        f"VALUES (%s,%s,%s,%s,%s)",
        (entity, eid, action, actor,
         json.dumps(after, ensure_ascii=False, default=str) if after else None),
    )


# ================================================================
# ОРГАНИЗАЦИОННАЯ МОДЕЛЬ ЦЕНТРА
#
# Переиспользует существующие сущности: org_units (структура),
# exec_person (люди), exec_center_role (роли), exec_center_function
# (функции Центра), professional_competencies (компетенции),
# exec_resource_requirement/exec_capacity_plan/exec_fot_plan (ресурсный
# контур). Новые таблицы — только связи и атрибуты, добавленные
# миграцией V0404 (exec_role_position, exec_center_role_competency,
# exec_requirement_competency, exec_raci_matrix,
# exec_org_resource_plan_version/line/snapshot,
# exec_center_function_org_unit). dept_functions (145 записей ДФМ) и
# bank_function_catalog (67 кодов) используются только на чтение.
# ================================================================

RACI_ENTITY_TABLE = {
    "process": ("exec_process_step", "title"),
    "initiative": ("exec_initiative", "title"),
    "project": ("exec_project", "title"),
    "result": ("exec_result", "title"),
    "milestone": ("exec_milestone", "title"),
}


def org_structure_tree(cur, center_id: int):
    """Дерево подразделений Центра (org_units.center_id = center_id) с
    руководителем, числом функций, штатной/фактической численностью и
    вакансиями — для карточек дерева на главном экране раздела."""
    cur.execute(f"""
        SELECT u.id, u.code, u.name, u.short_name, u.type, u.parent_id, u.path,
               u.level, u.sort_order, u.status, u.is_archived, u.description,
               u.valid_from, u.valid_to,
               u.head_person_id, p.display_name AS head_name, p.position_title AS head_position,
               (SELECT COUNT(*) FROM {SCHEMA}.exec_center_function_org_unit fo
                 WHERE fo.org_unit_id = u.id) AS function_count,
               (SELECT COALESCE(SUM(r.headcount), 0) FROM {SCHEMA}.exec_center_role r
                 WHERE r.org_unit_id = u.id) AS staff_plan_fte,
               (SELECT COALESCE(SUM(rp.fte), 0) FROM {SCHEMA}.exec_role_position rp
                 JOIN {SCHEMA}.exec_center_role r ON r.id = rp.role_id
                 WHERE r.org_unit_id = u.id AND rp.status = 'occupied') AS staff_fact_fte,
               (SELECT COUNT(*) FROM {SCHEMA}.exec_role_position rp
                 JOIN {SCHEMA}.exec_center_role r ON r.id = rp.role_id
                 WHERE r.org_unit_id = u.id AND rp.status = 'vacant') AS vacancy_count
        FROM {SCHEMA}.org_units u
        LEFT JOIN {SCHEMA}.exec_person p ON p.id = u.head_person_id
        WHERE u.center_id = %s AND u.is_archived = false
        ORDER BY u.sort_order, u.code
    """, (center_id,))
    return rows(cur)


def org_unit_detail(cur, unit_id: int):
    """Карточка подразделения: функции, роли, люди/вакансии, инициативы."""
    cur.execute(f"""
        SELECT u.*, p.display_name AS head_name,
               parent.name AS parent_name
        FROM {SCHEMA}.org_units u
        LEFT JOIN {SCHEMA}.exec_person p ON p.id = u.head_person_id
        LEFT JOIN {SCHEMA}.org_units parent ON parent.id = u.parent_id
        WHERE u.id = %s
    """, (unit_id,))
    got = rows(cur)
    if not got:
        return None
    unit = got[0]

    cur.execute(f"""
        SELECT f.id, f.code, f.title, f.criticality, f.status, fo.role
        FROM {SCHEMA}.exec_center_function_org_unit fo
        JOIN {SCHEMA}.exec_center_function f ON f.id = fo.center_function_id
        WHERE fo.org_unit_id = %s
        ORDER BY fo.role DESC, f.sort_order
    """, (unit_id,))
    unit["functions"] = rows(cur)

    cur.execute(f"""
        SELECT r.*,
               (SELECT COUNT(*) FROM {SCHEMA}.exec_role_position rp
                 WHERE rp.role_id = r.id AND rp.status = 'occupied') AS occupied_count,
               (SELECT COUNT(*) FROM {SCHEMA}.exec_role_position rp
                 WHERE rp.role_id = r.id AND rp.status = 'vacant') AS vacant_count
        FROM {SCHEMA}.exec_center_role r
        WHERE r.org_unit_id = %s
        ORDER BY r.sort_order, r.id
    """, (unit_id,))
    unit["roles"] = rows(cur)

    cur.execute(f"""
        SELECT rp.*, p.display_name AS person_name, r.title AS role_title
        FROM {SCHEMA}.exec_role_position rp
        JOIN {SCHEMA}.exec_center_role r ON r.id = rp.role_id
        LEFT JOIN {SCHEMA}.exec_person p ON p.id = rp.person_id
        WHERE r.org_unit_id = %s
        ORDER BY r.sort_order, rp.id
    """, (unit_id,))
    unit["positions"] = rows(cur)

    cur.execute(f"""
        SELECT DISTINCT i.id, i.title, i.status, i.stage
        FROM {SCHEMA}.exec_resource_assignment a
        JOIN {SCHEMA}.exec_initiative i ON i.id = a.initiative_id
        WHERE a.org_unit_id = %s AND a.archived_at IS NULL
    """, (unit_id,))
    unit["initiatives"] = rows(cur)

    return unit


def staffing_summary(cur, center_id: int):
    """Штатная и фактическая численность по Центру и подразделениям —
    для главной страницы раздела «Организационная модель». Тестовые роли
    (is_test_data=true) и тестовые штатные позиции исключены из расчёта."""
    cur.execute(f"""
        SELECT u.id AS org_unit_id, u.name AS org_unit_name,
               COALESCE((SELECT SUM(r.headcount) FROM {SCHEMA}.exec_center_role r
                          WHERE r.org_unit_id = u.id AND r.is_test_data = false), 0) AS staff_plan_fte,
               COALESCE((SELECT SUM(rp.fte) FROM {SCHEMA}.exec_role_position rp
                          JOIN {SCHEMA}.exec_center_role r ON r.id = rp.role_id
                         WHERE r.org_unit_id = u.id AND rp.status = 'occupied'
                           AND r.is_test_data = false AND rp.is_test_data = false), 0) AS staff_fact_fte,
               (SELECT COUNT(*) FROM {SCHEMA}.exec_role_position rp
                 JOIN {SCHEMA}.exec_center_role r ON r.id = rp.role_id
                WHERE r.org_unit_id = u.id AND rp.status = 'vacant'
                  AND r.is_test_data = false AND rp.is_test_data = false) AS vacancy_count,
               (SELECT COUNT(*) FROM {SCHEMA}.exec_role_position rp
                 JOIN {SCHEMA}.exec_center_role r ON r.id = rp.role_id
                WHERE r.org_unit_id = u.id AND rp.status = 'frozen'
                  AND r.is_test_data = false AND rp.is_test_data = false) AS frozen_count
        FROM {SCHEMA}.org_units u
        WHERE u.center_id = %s AND u.is_archived = false
        ORDER BY u.sort_order
    """, (center_id,))
    by_unit = rows(cur)

    cur.execute(f"""
        SELECT
          COALESCE(SUM(r.headcount), 0) AS staff_plan_fte,
          (SELECT COALESCE(SUM(rp.fte), 0) FROM {SCHEMA}.exec_role_position rp
            JOIN {SCHEMA}.exec_center_role r2 ON r2.id = rp.role_id
           WHERE r2.center_id = %s AND rp.status = 'occupied'
             AND r2.is_test_data = false AND rp.is_test_data = false) AS staff_fact_fte,
          (SELECT COUNT(*) FROM {SCHEMA}.exec_role_position rp
            JOIN {SCHEMA}.exec_center_role r2 ON r2.id = rp.role_id
           WHERE r2.center_id = %s AND rp.status = 'vacant'
             AND r2.is_test_data = false AND rp.is_test_data = false) AS vacancy_count,
          (SELECT COUNT(DISTINCT a.person_id) FROM {SCHEMA}.exec_resource_assignment a
            JOIN {SCHEMA}.exec_center_role r2 ON r2.id = a.role_id
           WHERE r2.center_id = %s AND a.is_external = true AND a.archived_at IS NULL
             AND r2.is_test_data = false) AS external_count
        FROM {SCHEMA}.exec_center_role r WHERE r.center_id = %s AND r.is_test_data = false
    """, (center_id, center_id, center_id, center_id))
    total = rows(cur)[0]

    return {"by_unit": by_unit, "total": total}


def competency_gap_report(cur, center_id: int):
    """Дефицит компетенций: требуемый уровень роли vs подтверждённый уровень
    занимающего позицию человека. Автоматический расчёт — подсказка, не
    кадровое решение (см. заголовок раздела на фронтенде)."""
    cur.execute(f"""
        SELECT r.id AS role_id, r.title AS role_title, r.org_unit_id, u.name AS org_unit_name,
               c.id AS competency_id, c.name AS competency_name, rc.required_level, rc.is_critical,
               rp.id AS position_id, rp.person_id, p.display_name AS person_name,
               pc.current_level,
               GREATEST(rc.required_level - COALESCE(pc.current_level, 0), 0) AS gap
        FROM {SCHEMA}.exec_center_role_competency rc
        JOIN {SCHEMA}.exec_center_role r ON r.id = rc.role_id
        JOIN {SCHEMA}.professional_competencies c ON c.id = rc.competency_id
        LEFT JOIN {SCHEMA}.org_units u ON u.id = r.org_unit_id
        LEFT JOIN {SCHEMA}.exec_role_position rp ON rp.role_id = r.id AND rp.status = 'occupied'
        LEFT JOIN {SCHEMA}.exec_person p ON p.id = rp.person_id
        LEFT JOIN {SCHEMA}.exec_person_competency pc
               ON pc.person_id = rp.person_id AND pc.competency_id = c.id
        WHERE r.center_id = %s AND r.is_test_data = false
        ORDER BY gap DESC, rc.is_critical DESC
    """, (center_id,))
    all_rows = rows(cur)
    gaps = [r for r in all_rows if r["gap"] > 0]

    # Вакансии без занимающего — отдельная категория дефицита (не смешивать
    # с недостатком уровня у занятого человека)
    cur.execute(f"""
        SELECT r.id AS role_id, r.title AS role_title, r.org_unit_id, u.name AS org_unit_name,
               COUNT(rp.id) AS vacancy_count,
               array_agg(DISTINCT c.name) FILTER (WHERE c.name IS NOT NULL) AS required_competencies
        FROM {SCHEMA}.exec_role_position rp
        JOIN {SCHEMA}.exec_center_role r ON r.id = rp.role_id
        LEFT JOIN {SCHEMA}.org_units u ON u.id = r.org_unit_id
        LEFT JOIN {SCHEMA}.exec_center_role_competency rc ON rc.role_id = r.id
        LEFT JOIN {SCHEMA}.professional_competencies c ON c.id = rc.competency_id
        WHERE r.center_id = %s AND rp.status = 'vacant'
          AND r.is_test_data = false AND rp.is_test_data = false
        GROUP BY r.id, r.title, r.org_unit_id, u.name
    """, (center_id,))
    vacant_roles = rows(cur)

    return {"competency_gaps": gaps, "vacant_roles": vacant_roles}


def raci_check(cur, entity_type: str, entity_id: int):
    """Проверки RACI: единственный активный A (если не разрешена
    коллективная ответственность), наличие хотя бы одного A, архивные/
    неактивные исполнители — предупреждения, не блокировки."""
    cur.execute(f"""
        SELECT m.*, p.display_name AS person_name,
               COALESCE(p.employment_status, 'active') AS person_status
        FROM {SCHEMA}.exec_raci_matrix m
        JOIN {SCHEMA}.exec_person p ON p.id = m.person_id
        WHERE m.entity_type = %s AND m.entity_id = %s AND m.valid_to IS NULL
        ORDER BY m.raci_role, p.display_name
    """, (entity_type, entity_id))
    items = rows(cur)
    warnings = []
    a_rows = [r for r in items if r["raci_role"] == "A"]
    if not a_rows:
        warnings.append({"code": "no_owner", "message": "Нет ответственного (A)"})
    elif len(a_rows) > 1 and not any(r["is_collective_a"] for r in a_rows):
        warnings.append({"code": "multiple_owners",
                          "message": "Более одного ответственного (A) без явного разрешения коллективной ответственности"})
    for r in items:
        if r["person_status"] != "active":
            warnings.append({"code": "inactive_person",
                              "message": f"{r['person_name']} назначен(а) на роль {r['raci_role']}, но неактивен(на)"})
    return {"items": items, "warnings": warnings}


def raci_missing_owner_count(cur):
    """Для главной страницы: количество объектов (функции Центра + матрица
    exec_raci_matrix), где сейчас нет активного владельца (A)."""
    cur.execute(f"""
        SELECT COUNT(*) FROM {SCHEMA}.exec_center_function f
        WHERE NOT EXISTS (
            SELECT 1 FROM {SCHEMA}.exec_function_raci r
            WHERE r.function_id = f.id AND r.raci_role = 'A' AND r.valid_to IS NULL AND r.is_backup = false
        )
    """)
    functions_no_owner = cur.fetchone()[0]
    cur.execute(f"""
        SELECT COUNT(DISTINCT (m.entity_type, m.entity_id)) FROM {SCHEMA}.exec_raci_matrix m
        WHERE m.valid_to IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM {SCHEMA}.exec_raci_matrix a
            WHERE a.entity_type = m.entity_type AND a.entity_id = m.entity_id
              AND a.raci_role = 'A' AND a.valid_to IS NULL
          )
    """)
    other_no_owner = cur.fetchone()[0]
    return functions_no_owner + other_no_owner


def org_model_overview(cur, center_id: int):
    """Сводные показатели главной страницы раздела «Организационная модель»."""
    staffing = staffing_summary(cur, center_id)
    gaps = competency_gap_report(cur, center_id)

    cur.execute(f"""
        SELECT COUNT(*) FROM {SCHEMA}.exec_center_function f
        WHERE f.center_id = %s AND f.owner_org_unit_id IS NULL
    """, (center_id,))
    functions_without_unit = cur.fetchone()[0]

    cur.execute(f"""
        SELECT COUNT(*) FROM {SCHEMA}.exec_center_function f
        WHERE f.center_id = %s AND NOT EXISTS (
            SELECT 1 FROM {SCHEMA}.exec_function_raci r
            WHERE r.function_id = f.id AND r.raci_role = 'A' AND r.valid_to IS NULL AND r.is_backup = false
        )
    """, (center_id,))
    functions_without_owner = cur.fetchone()[0]

    cur.execute(f"""
        SELECT COUNT(*) FROM {SCHEMA}.exec_resource_requirement rq
        JOIN {SCHEMA}.exec_center_role r ON r.id = rq.role_id
        WHERE r.center_id = %s AND rq.archived_at IS NULL
          AND rq.status NOT IN ('closed','cancelled')
          AND rq.is_test_data = false AND r.is_test_data = false
    """, (center_id,))
    open_requirements = cur.fetchone()[0]

    cur.execute(f"""
        SELECT COUNT(DISTINCT a.person_id) FROM {SCHEMA}.exec_resource_assignment a
        JOIN {SCHEMA}.exec_center_role r ON r.id = a.role_id
        WHERE r.center_id = %s AND a.is_external = true AND a.archived_at IS NULL
    """, (center_id,))
    external_count = cur.fetchone()[0]

    # Перегруженные участники: суммарная плановая загрузка по назначениям
    # (проекты/инициативы) превышает 100%
    cur.execute(f"""
        SELECT p.id AS person_id, p.display_name, SUM(a.plan_load_pct) AS total_load_pct
        FROM {SCHEMA}.exec_resource_assignment a
        JOIN {SCHEMA}.exec_person p ON p.id = a.person_id
        WHERE a.archived_at IS NULL AND a.is_vacant = false
          AND (a.period_end IS NULL OR a.period_end >= CURRENT_DATE)
        GROUP BY p.id, p.display_name
        HAVING SUM(a.plan_load_pct) > 100
        ORDER BY total_load_pct DESC
    """)
    overloaded = rows(cur)

    return {
        "staffing": staffing["total"],
        "by_unit": staffing["by_unit"],
        "external_count": external_count,
        "overloaded_count": len(overloaded),
        "overloaded_people": overloaded,
        "open_requirements_count": open_requirements,
        "role_competency_gaps_count": len(gaps["competency_gaps"]),
        "vacant_roles_count": len(gaps["vacant_roles"]),
        "functions_without_owner_count": functions_without_owner,
        "functions_without_unit_count": functions_without_unit,
        "raci_without_owner_count": raci_missing_owner_count(cur),
    }


def dept_function_map_candidates(cur, center_id: int):
    """Кандидаты для карты соответствия функций Центра и ДФМ/справочника
    67 кодов — только чтение существующих dept_functions/bank_function_catalog,
    без изменения исходных записей. Возвращает уже подтверждённые связи
    (exec_center_function_dept_function) и функции без связи."""
    cur.execute(f"""
        SELECT f.id AS center_function_id, f.title AS center_function_title,
               f.bank_code, bc.name AS bank_code_title,
               df.dept_function_id, d.title AS dept_function_title, d.dept_name
        FROM {SCHEMA}.exec_center_function f
        LEFT JOIN {SCHEMA}.bank_function_catalog bc ON bc.code = f.bank_code
        LEFT JOIN {SCHEMA}.exec_center_function_dept_function df ON df.center_function_id = f.id
        LEFT JOIN {SCHEMA}.dept_functions d ON d.id = df.dept_function_id
        WHERE f.center_id = %s
        ORDER BY f.sort_order
    """, (center_id,))
    return rows(cur)


def build_org_resource_plan_payload(cur, version_id: int):
    """Полный годовой ресурсный план для утверждения снимком: ручные строки
    плюс агрегированная на лету проектная потребность из
    exec_resource_requirement (не копируется в exec_org_resource_plan_line —
    расчёт дефицита строится каждый раз заново)."""
    cur.execute(f"SELECT * FROM {SCHEMA}.exec_org_resource_plan_version WHERE id = %s", (version_id,))
    v = rows(cur)
    if not v:
        return None
    version = v[0]

    cur.execute(f"""
        SELECT l.*, u.name AS org_unit_name, r.title AS role_title
        FROM {SCHEMA}.exec_org_resource_plan_line l
        LEFT JOIN {SCHEMA}.org_units u ON u.id = l.org_unit_id
        LEFT JOIN {SCHEMA}.exec_center_role r ON r.id = l.role_id
        WHERE l.version_id = %s
        ORDER BY l.month, u.sort_order NULLS LAST, r.sort_order NULLS LAST
    """, (version_id,))
    lines = rows(cur)

    # Проектная потребность в FTE по месяцу и роли — агрегат exec_resource_requirement,
    # приведённый к длительности требования, без ручного повторного ввода
    cur.execute(f"""
        SELECT date_trunc('month', gs)::date AS month, rq.role_id,
               SUM(rq.headcount * rq.required_load_pct / 100.0) AS project_demand_fte
        FROM {SCHEMA}.exec_resource_requirement rq
        CROSS JOIN LATERAL generate_series(
            date_trunc('month', COALESCE(rq.period_start, CURRENT_DATE)),
            date_trunc('month', COALESCE(rq.period_end, CURRENT_DATE)),
            interval '1 month'
        ) AS gs
        WHERE rq.archived_at IS NULL AND rq.status NOT IN ('closed','cancelled')
          AND rq.role_id IS NOT NULL AND rq.is_test_data = false
        GROUP BY 1, rq.role_id
    """)
    demand_by_month_role = {(r["month"], r["role_id"]): float(r["project_demand_fte"] or 0)
                             for r in rows(cur)}

    for line in lines:
        key = (line["month"], line["role_id"])
        project_demand = demand_by_month_role.get(key, 0.0)
        line["project_demand_fte"] = round(project_demand, 2)
        available = float(line["available_fte"] or 0)
        total_demand = project_demand + float(line["operational_demand_fte"] or 0)
        line["capacity_gap_fte"] = round(total_demand - available, 2)

    return {"version": version, "lines": lines}


def create_org_resource_plan_snapshot(cur, body: dict, actor: str):
    version_id = as_int(body.get("version_id"))
    payload = build_org_resource_plan_payload(cur, version_id) if version_id else None
    if not payload:
        return None, "Версия плана не найдена"

    payload_str = json.dumps(payload, ensure_ascii=False, default=str)
    payload_hash = hashlib.sha256(payload_str.encode("utf-8")).hexdigest()
    version_group = f"org_resource_plan_{payload['version']['year']}"
    cur.execute(
        f"SELECT COALESCE(MAX(version_number), 0) FROM {SCHEMA}.exec_org_resource_plan_snapshot "
        f"WHERE version_group = %s", (version_group,))
    next_version = cur.fetchone()[0] + 1

    cur.execute(f"""
        INSERT INTO {SCHEMA}.exec_org_resource_plan_snapshot
            (version_id, payload_json, payload_sha256, version_group, version_number, is_test_data, created_by)
        VALUES (%s,%s,%s,%s,%s,%s,%s) RETURNING id, created_at
    """, (version_id, payload_str, payload_hash, version_group, next_version,
          bool(body.get("is_test_data")), actor))
    snap = cur.fetchone()

    cur.execute(f"""
        UPDATE {SCHEMA}.exec_org_resource_plan_version
        SET status = 'approved', approved_at = now(), approved_by = %s, updated_at = now()
        WHERE id = %s
    """, (actor, version_id))

    log_change(cur, actor, "org_resource_plan", version_id, "approve",
               after={"version_group": version_group, "payload_sha256": payload_hash})
    return {"id": snap[0], "created_at": snap[1], "version_group": version_group,
            "version_number": next_version, "payload_sha256": payload_hash}, None


def get_org_resource_plan_snapshot(cur, sid: int):
    cur.execute(f"SELECT * FROM {SCHEMA}.exec_org_resource_plan_snapshot WHERE id = %s", (sid,))
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


# ============================================================
# ЦЕЛИ, KPI И ЭФФЕКТЫ
# Иерархия: стратегическая цель → цель организации → цель Центра →
# цель подразделения → цель инициативы → цель проекта (exec_center_goal,
# goal_level). Показатели — единый реестр exec_indicator, значения по
# периодам — exec_indicator_value, методика — версионируемая
# exec_indicator_methodology. Связи цели с функциями/инициативами/
# проектами/результатами/эффектами — через exec_link (goal/indicator в
# LINKABLE в exec-portfolio), без дублирования данных объектов.
# ============================================================

def save_indicator(cur, body, actor):
    iid = as_int(body.get("id"))
    ind_type = body.get("indicator_type", "kpi")
    direction = body.get("improvement_direction", "higher_is_better")
    if ind_type not in INDICATOR_TYPES:
        return None, "Недопустимый тип показателя"
    if direction not in IMPROVEMENT_DIRECTIONS:
        return None, "Недопустимое направление улучшения"
    if body.get("is_calculated") and not as_int(body.get("active_methodology_id")):
        return None, "Показатель нельзя пометить автоматически рассчитываемым без активной методики"
    new_id, err = upsert(cur, "exec_indicator", INDICATOR_FIELDS, body,
                          extra_num_keys=INDICATOR_NUM_KEYS)
    if err:
        return None, err
    log_change(cur, actor, "indicator", new_id, "update" if iid else "create",
               after=clean(body, INDICATOR_FIELDS, INDICATOR_NUM_KEYS))
    return new_id, None


def save_methodology(cur, body, actor):
    """Новая методика — это ВСЕГДА новая версия (INSERT), не UPDATE
    существующей: старые значения показателя должны сохранить ссылку на
    версию методики, по которой были рассчитаны, и не пересчитываются
    задним числом при изменении формулы."""
    indicator_id = as_int(body.get("indicator_id"))
    if not indicator_id:
        return None, "Не указан показатель"
    formula_kind = body.get("formula_kind", "manual")
    if formula_kind not in FORMULA_KINDS:
        return None, "Недопустимый вид формулы"

    cur.execute(
        f"SELECT COALESCE(MAX(version_number), 0) FROM {SCHEMA}.exec_indicator_methodology "
        f"WHERE indicator_id = %s", (indicator_id,))
    next_version = cur.fetchone()[0] + 1

    vals = clean(body, METHODOLOGY_FIELDS)
    vals["indicator_id"] = indicator_id
    vals["version_number"] = next_version
    vals["formula_kind"] = formula_kind
    vals.setdefault("status", "active")
    cols = ", ".join(vals)
    ph = ", ".join(["%s"] * len(vals))
    cur.execute(
        f"INSERT INTO {SCHEMA}.exec_indicator_methodology ({cols}) VALUES ({ph}) RETURNING id",
        list(vals.values()))
    new_id = cur.fetchone()[0]

    # Предыдущие активные версии этого показателя помечаем superseded —
    # они остаются в таблице (история не удаляется), просто больше не активны.
    cur.execute(f"""
        UPDATE {SCHEMA}.exec_indicator_methodology SET status = 'superseded'
        WHERE indicator_id = %s AND id <> %s AND status = 'active'
    """, (indicator_id, new_id))

    if vals.get("status") == "active":
        cur.execute(f"""
            UPDATE {SCHEMA}.exec_indicator SET active_methodology_id = %s, updated_at = now()
            WHERE id = %s
        """, (new_id, indicator_id))

    log_change(cur, actor, "indicator_methodology", new_id, "create",
               after={"indicator_id": indicator_id, "version_number": next_version})
    return new_id, None


def save_indicator_value(cur, body, actor):
    """Исправление факта не перезаписывает существующую строку: если для
    (indicator_id, period_start) уже есть значение — старое помечается
    superseded_by_id, новое создаётся отдельной строкой (история сохраняется)."""
    indicator_id = as_int(body.get("indicator_id"))
    period_start = body.get("period_start")
    if not indicator_id or not period_start:
        return None, "Укажите показатель и начало периода"
    period_kind = body.get("period_kind", "monthly")
    if period_kind not in ("date", "monthly", "quarterly", "yearly", "custom"):
        return None, "Недопустимый тип периода"

    cur.execute(f"""
        SELECT id FROM {SCHEMA}.exec_indicator_value
        WHERE indicator_id = %s AND period_start = %s AND superseded_by_id IS NULL
        ORDER BY id DESC LIMIT 1
    """, (indicator_id, period_start))
    prev = cur.fetchone()

    vals = clean(body, INDICATOR_VALUE_FIELDS, INDICATOR_NUM_KEYS)
    vals["indicator_id"] = indicator_id
    vals.setdefault("entered_by", actor)
    cols = ", ".join(vals)
    ph = ", ".join(["%s"] * len(vals))
    cur.execute(
        f"INSERT INTO {SCHEMA}.exec_indicator_value ({cols}) VALUES ({ph}) RETURNING id",
        list(vals.values()))
    new_id = cur.fetchone()[0]

    if prev:
        cur.execute(
            f"UPDATE {SCHEMA}.exec_indicator_value SET superseded_by_id = %s WHERE id = %s",
            (new_id, prev[0]))

    log_change(cur, actor, "indicator_value", new_id, "create",
               after={"indicator_id": indicator_id, "period_start": str(period_start)})
    return new_id, None


def confirm_indicator_value(cur, body, actor):
    vid = as_int(body.get("id"))
    if not vid:
        return None, "Не указано значение"
    status = body.get("verification_status", "confirmed")
    if status not in ("unconfirmed", "confirmed", "disputed"):
        return None, "Недопустимый статус подтверждения"
    cur.execute(f"""
        UPDATE {SCHEMA}.exec_indicator_value SET verification_status = %s, confirmed_by = %s
        WHERE id = %s RETURNING id
    """, (status, actor, vid))
    r = cur.fetchone()
    if not r:
        return None, "Значение не найдено"
    log_change(cur, actor, "indicator_value", vid, "confirm", after={"verification_status": status})
    return vid, None


def indicator_latest_value(cur, indicator_id: int):
    cur.execute(f"""
        SELECT * FROM {SCHEMA}.exec_indicator_value
        WHERE indicator_id = %s AND superseded_by_id IS NULL
        ORDER BY period_start DESC LIMIT 1
    """, (indicator_id,))
    r = rows(cur)
    return r[0] if r else None


def indicator_status_light(indicator: dict, latest_value: dict | None):
    """Светофор: зелёный/жёлтый/красный/серый. Правила прозрачны и
    возвращаются вместе со статусом (план, факт, отклонение, формула).
    Нельзя показать зелёный при отсутствии фактических данных."""
    direction = indicator.get("improvement_direction", "higher_is_better")
    if not latest_value or latest_value.get("actual_value") is None:
        return {"color": "gray", "reason": "Нет фактических данных",
                "plan": None, "actual": None, "deviation": None}

    actual = float(latest_value["actual_value"])
    plan = float(latest_value["plan_value"]) if latest_value.get("plan_value") is not None else None
    target = float(indicator["target_value"]) if indicator.get("target_value") is not None else plan
    yellow = float(indicator["threshold_yellow"]) if indicator.get("threshold_yellow") is not None else None
    red = float(indicator["threshold_red"]) if indicator.get("threshold_red") is not None else None
    range_min = float(indicator["range_min"]) if indicator.get("range_min") is not None else None
    range_max = float(indicator["range_max"]) if indicator.get("range_max") is not None else None

    deviation = (actual - target) if target is not None else None

    if direction == "observe_only":
        return {"color": "gray", "reason": "Показатель только наблюдается, статус не рассчитывается",
                "plan": plan, "actual": actual, "deviation": deviation}

    if direction == "in_range":
        if range_min is not None and range_max is not None:
            if range_min <= actual <= range_max:
                color, reason = "green", f"Значение {actual} в диапазоне [{range_min}; {range_max}]"
            else:
                color, reason = "red", f"Значение {actual} вне диапазона [{range_min}; {range_max}]"
        else:
            color, reason = "gray", "Диапазон не задан"
        return {"color": color, "reason": reason, "plan": plan, "actual": actual, "deviation": deviation}

    if direction == "target_exact":
        color = "green" if target is not None and actual == target else "red"
        reason = f"Требуется точное значение {target}, факт {actual}"
        return {"color": color, "reason": reason, "plan": plan, "actual": actual, "deviation": deviation}

    # higher_is_better / lower_is_better — по порогам относительно target
    if target is None:
        return {"color": "gray", "reason": "Не задано целевое значение",
                "plan": plan, "actual": actual, "deviation": deviation}

    better = (lambda a, b: a >= b) if direction == "higher_is_better" else (lambda a, b: a <= b)

    if better(actual, target):
        color, reason = "green", f"Факт {actual} достигает цели {target}"
    elif red is not None and not better(actual, red):
        color, reason = "red", f"Факт {actual} хуже порога критичности {red}"
    elif yellow is not None and not better(actual, yellow):
        color, reason = "yellow", f"Факт {actual} между порогом предупреждения {yellow} и целью {target}"
    elif yellow is not None or red is not None:
        color, reason = "yellow", f"Факт {actual} отклоняется от цели {target}, но выше заданных порогов"
    else:
        color, reason = "yellow", f"Факт {actual} не достигает цели {target}, пороги не заданы — требует внимания"

    return {"color": color, "reason": reason, "plan": plan, "actual": actual, "deviation": deviation}


def indicator_with_status(cur, indicator: dict):
    latest = indicator_latest_value(cur, indicator["id"])
    indicator["latest_value"] = latest
    indicator["status_light"] = indicator_status_light(indicator, latest)
    warnings = []
    if not indicator.get("owner_person_id"):
        warnings.append("Нет владельца показателя")
    if indicator.get("is_calculated") and not indicator.get("active_methodology_id"):
        warnings.append("Нет активной методики расчёта")
    if not indicator.get("data_source"):
        warnings.append("Не указан источник данных")
    if indicator.get("baseline_value") is None:
        warnings.append("Не задано базовое значение")
    if latest and latest.get("verification_status") != "confirmed":
        warnings.append("Факт не подтверждён")
    if latest and latest.get("actual_value") is not None:
        try:
            from datetime import date, timedelta
            period_end = latest.get("period_end") or latest.get("period_start")
            if isinstance(period_end, str):
                period_end = date.fromisoformat(period_end)
            if period_end and (date.today() - period_end) > timedelta(days=95):
                warnings.append("Фактическое значение устарело (более 3 месяцев)")
        except (TypeError, ValueError):
            pass
    indicator["data_quality_warnings"] = warnings
    return indicator


def list_indicators(cur, applicability="active"):
    cur.execute(f"""
        SELECT i.*, p.display_name AS owner_name, de.display_name AS data_entry_name
        FROM {SCHEMA}.exec_indicator i
        LEFT JOIN {SCHEMA}.exec_person p ON p.id = i.owner_person_id
        LEFT JOIN {SCHEMA}.exec_person de ON de.id = i.data_entry_person_id
        WHERE i.is_test_data = false AND i.applicability = %s
        ORDER BY i.title
    """, (applicability,))
    items = rows(cur)
    return [indicator_with_status(cur, it) for it in items]


def indicator_detail(cur, indicator_id: int):
    cur.execute(f"""
        SELECT i.*, p.display_name AS owner_name, de.display_name AS data_entry_name
        FROM {SCHEMA}.exec_indicator i
        LEFT JOIN {SCHEMA}.exec_person p ON p.id = i.owner_person_id
        LEFT JOIN {SCHEMA}.exec_person de ON de.id = i.data_entry_person_id
        WHERE i.id = %s
    """, (indicator_id,))
    item = rows(cur)
    if not item:
        return None
    indicator = indicator_with_status(cur, item[0])

    cur.execute(f"""
        SELECT * FROM {SCHEMA}.exec_indicator_methodology
        WHERE indicator_id = %s ORDER BY version_number DESC
    """, (indicator_id,))
    indicator["methodology_versions"] = rows(cur)

    cur.execute(f"""
        SELECT * FROM {SCHEMA}.exec_indicator_value
        WHERE indicator_id = %s ORDER BY period_start DESC LIMIT 36
    """, (indicator_id,))
    indicator["values"] = rows(cur)

    cur.execute(f"""
        SELECT gi.goal_id, g.title AS goal_title, gi.weight_pct
        FROM {SCHEMA}.exec_goal_indicator gi
        JOIN {SCHEMA}.exec_center_goal g ON g.id = gi.goal_id
        WHERE gi.indicator_id = %s
    """, (indicator_id,))
    indicator["goals"] = rows(cur)
    return indicator


def save_goal_indicator(cur, body, actor):
    goal_id = as_int(body.get("goal_id"))
    indicator_id = as_int(body.get("indicator_id"))
    if not goal_id or not indicator_id:
        return None, "Укажите цель и показатель"
    weight = as_num(body.get("weight_pct"))

    if weight is not None:
        cur.execute(f"""
            SELECT COALESCE(SUM(weight_pct), 0) FROM {SCHEMA}.exec_goal_indicator
            WHERE goal_id = %s AND indicator_id <> %s
        """, (goal_id, indicator_id))
        other_weight = float(cur.fetchone()[0] or 0)
        if other_weight + weight > 100.01:
            return None, f"Сумма весов превысит 100% (уже занято {other_weight}%, добавляется {weight}%)"

    cur.execute(f"""
        INSERT INTO {SCHEMA}.exec_goal_indicator (goal_id, indicator_id, weight_pct, note)
        VALUES (%s,%s,%s,%s)
        ON CONFLICT (goal_id, indicator_id) DO UPDATE SET weight_pct = EXCLUDED.weight_pct, note = EXCLUDED.note
        RETURNING id
    """, (goal_id, indicator_id, weight, nz(body.get("note"))))
    new_id = cur.fetchone()[0]
    log_change(cur, actor, "goal_indicator", new_id, "create",
               after={"goal_id": goal_id, "indicator_id": indicator_id, "weight_pct": weight})
    return new_id, None


def goal_progress(cur, goal_id: int, goal_row: dict | None = None):
    """Прогресс цели по progress_mode. Автоматический расчёт — подсказка:
    manual_status_confirmed фиксирует, что владелец видел и подтвердил
    расчёт (сами исходные значения остаются видимыми в любом случае)."""
    if goal_row is None:
        cur.execute(f"SELECT * FROM {SCHEMA}.exec_center_goal WHERE id = %s", (goal_id,))
        r = rows(cur)
        if not r:
            return None
        goal_row = r[0]

    mode = goal_row.get("progress_mode", "manual")

    if mode == "manual":
        return {"mode": "manual", "progress_pct": goal_row.get("progress_pct"), "details": []}

    if mode in ("by_indicators", "weighted"):
        cur.execute(f"""
            SELECT gi.indicator_id, gi.weight_pct, i.*
            FROM {SCHEMA}.exec_goal_indicator gi
            JOIN {SCHEMA}.exec_indicator i ON i.id = gi.indicator_id
            WHERE gi.goal_id = %s
        """, (goal_id,))
        links = rows(cur)
        if not links:
            return {"mode": mode, "progress_pct": None, "details": [],
                    "warning": "К цели не привязано ни одного показателя"}

        details = []
        weighted_sum = 0.0
        weight_total = 0.0
        no_data = []
        for link in links:
            latest = indicator_latest_value(cur, link["indicator_id"])
            light = indicator_status_light(link, latest)
            achievement = None
            if light["actual"] is not None and link.get("target_value") is not None:
                target = float(link["target_value"])
                baseline = float(link["baseline_value"]) if link.get("baseline_value") is not None else 0.0
                direction = link.get("improvement_direction", "higher_is_better")
                span = (target - baseline)
                if span != 0:
                    progress = (light["actual"] - baseline) / span * 100
                    if direction == "lower_is_better":
                        progress = 100 - progress if baseline != target else progress
                    achievement = max(0.0, min(100.0, progress))
            details.append({
                "indicator_id": link["indicator_id"], "title": link["title"],
                "weight_pct": link.get("weight_pct"), "status_light": light,
                "achievement_pct": achievement,
            })
            if achievement is None:
                no_data.append(link["title"])
                continue
            w = float(link.get("weight_pct") or 0) if mode == "weighted" else (100.0 / len(links))
            weighted_sum += achievement * w
            weight_total += w

        progress_pct = round(weighted_sum / weight_total, 1) if weight_total > 0 else None
        result = {"mode": mode, "progress_pct": progress_pct, "details": details}
        if no_data:
            result["warning"] = f"Нет данных для показателей: {', '.join(no_data)} — исключены из расчёта"
        if mode == "weighted":
            total_weight = sum(float(l.get("weight_pct") or 0) for l in links)
            if abs(total_weight - 100) > 0.5:
                result["weight_warning"] = f"Сумма весов показателей цели равна {total_weight}%, а не 100%"
        return result

    if mode == "by_children":
        cur.execute(f"""
            SELECT * FROM {SCHEMA}.exec_center_goal WHERE parent_goal_id = %s
              AND status NOT IN ('cancelled','archived')
        """, (goal_id,))
        children = rows(cur)
        if not children:
            return {"mode": "by_children", "progress_pct": None, "details": [],
                    "warning": "У цели нет активных подцелей"}
        child_progresses = []
        for child in children:
            cp = goal_progress(cur, child["id"], child)
            child_progresses.append({"goal_id": child["id"], "title": child["title"],
                                      "progress_pct": cp.get("progress_pct") if cp else None})
        valid = [c["progress_pct"] for c in child_progresses if c["progress_pct"] is not None]
        avg = round(sum(valid) / len(valid), 1) if valid else None
        return {"mode": "by_children", "progress_pct": avg, "details": child_progresses}

    return {"mode": mode, "progress_pct": goal_row.get("progress_pct"), "details": []}


def goal_is_overdue(goal_row: dict) -> bool:
    if not goal_row.get("due_date") or goal_row.get("status") in ("achieved", "cancelled", "archived"):
        return False
    from datetime import date
    due = goal_row["due_date"]
    if isinstance(due, str):
        due = date.fromisoformat(due)
    return due < date.today()


def goal_detail(cur, goal_id: int):
    cur.execute(f"""
        SELECT g.*, p.display_name AS owner_name, u.name AS org_unit_name,
               pg.title AS parent_goal_title
        FROM {SCHEMA}.exec_center_goal g
        LEFT JOIN {SCHEMA}.exec_person p ON p.id = g.owner_person_id
        LEFT JOIN {SCHEMA}.org_units u ON u.id = g.org_unit_id
        LEFT JOIN {SCHEMA}.exec_center_goal pg ON pg.id = g.parent_goal_id
        WHERE g.id = %s
    """, (goal_id,))
    item = rows(cur)
    if not item:
        return None
    goal = item[0]
    goal["is_overdue"] = goal_is_overdue(goal)
    goal["progress"] = goal_progress(cur, goal_id, goal)

    cur.execute(f"""
        SELECT id, title, status, goal_level FROM {SCHEMA}.exec_center_goal
        WHERE parent_goal_id = %s ORDER BY sort_order, id
    """, (goal_id,))
    goal["children"] = rows(cur)

    cur.execute(f"""
        SELECT gi.indicator_id, i.title, i.status AS indicator_status, gi.weight_pct
        FROM {SCHEMA}.exec_goal_indicator gi
        JOIN {SCHEMA}.exec_indicator i ON i.id = gi.indicator_id
        WHERE gi.goal_id = %s
    """, (goal_id,))
    goal["indicators"] = rows(cur)

    cur.execute(f"""
        SELECT * FROM {SCHEMA}.exec_link
        WHERE ((src_kind = 'goal' AND src_id = %s) OR (tgt_kind = 'goal' AND tgt_id = %s))
          AND archived_at IS NULL
    """, (goal_id, goal_id))
    goal["links"] = rows(cur)
    return goal


def goals_tree(cur, center_id: int):
    """Дерево целей: карточки с раскрытием, без графового редактора.
    Возвращает плоский список с parent_goal_id — построение дерева на фронте."""
    cur.execute(f"""
        SELECT g.*, p.display_name AS owner_name, u.name AS org_unit_name
        FROM {SCHEMA}.exec_center_goal g
        LEFT JOIN {SCHEMA}.exec_person p ON p.id = g.owner_person_id
        LEFT JOIN {SCHEMA}.org_units u ON u.id = g.org_unit_id
        WHERE g.center_id = %s AND g.is_test_data = false AND g.status <> 'archived'
        ORDER BY g.goal_level, g.sort_order, g.id
    """, (center_id,))
    goals = rows(cur)
    for g in goals:
        g["is_overdue"] = goal_is_overdue(g)
        prog = goal_progress(cur, g["id"], g)
        g["progress"] = prog

        cur.execute(f"""
            SELECT COUNT(*) FROM {SCHEMA}.exec_link
            WHERE src_kind = 'goal' AND src_id = %s AND archived_at IS NULL
        """, (g["id"],))
        g["links_count"] = cur.fetchone()[0]
    return goals


def goals_dashboard(cur, center_id: int):
    """Главная страница раздела «Цели и показатели»."""
    goals = goals_tree(cur, center_id)
    active_goals = [g for g in goals if g["status"] in ("agreed", "active")]
    achieved_goals = [g for g in goals if g["status"] == "achieved"]
    overdue_goals = [g for g in goals if g["is_overdue"]]
    at_risk_goals = [g for g in goals if g["progress"].get("progress_pct") is not None
                      and g["progress"]["progress_pct"] < 50 and g["status"] == "active"]
    goals_without_owner = [g for g in goals if not g.get("owner_person_id")]

    indicators = list_indicators(cur)
    indicators_no_data = [i for i in indicators if i["status_light"]["color"] == "gray"]
    indicators_red = [i for i in indicators if i["status_light"]["color"] == "red"]
    indicators_no_methodology_or_source = [
        i for i in indicators if "Не указан источник данных" in i["data_quality_warnings"]
        or "Нет активной методики расчёта" in i["data_quality_warnings"]
    ]

    cur.execute(f"""
        SELECT r.id, r.title, r.result_kind FROM {SCHEMA}.exec_result r
        WHERE r.archived_at IS NULL AND r.is_test_data = false AND r.verification_status = 'user_draft'
        ORDER BY r.created_at DESC LIMIT 10
    """)
    results_pending = rows(cur)

    cur.execute(f"""
        SELECT e.id, e.title, e.metric FROM {SCHEMA}.exec_effect e
        WHERE e.archived_at IS NULL AND COALESCE(e.is_test_data, false) = false
          AND e.confirmation_status IN ('not_confirmed', 'pending_review')
        ORDER BY e.updated_at DESC LIMIT 10
    """)
    effects_pending = rows(cur)

    cur.execute(f"""
        SELECT e.id, e.title, e.metric, e.actual_value, e.measured_at FROM {SCHEMA}.exec_effect e
        WHERE e.archived_at IS NULL AND COALESCE(e.is_test_data, false) = false
          AND e.confirmation_status = 'confirmed'
          AND e.measured_at >= CURRENT_DATE - INTERVAL '90 days'
        ORDER BY e.measured_at DESC LIMIT 20
    """)
    effects_confirmed_recent = rows(cur)

    return {
        "goals_total": len(goals), "active_goals_count": len(active_goals),
        "achieved_goals_count": len(achieved_goals), "overdue_goals_count": len(overdue_goals),
        "at_risk_goals": at_risk_goals, "goals_without_owner": goals_without_owner,
        "indicators_total": len(indicators), "indicators_no_data_count": len(indicators_no_data),
        "indicators_red_count": len(indicators_red),
        "indicators_quality_issues": indicators_no_methodology_or_source,
        "results_pending": results_pending, "effects_pending": effects_pending,
        "effects_confirmed_recent": effects_confirmed_recent,
        "goals": goals,
    }


def confirm_effect(cur, body, actor):
    """Эффект нельзя подтвердить только потому, что проект завершён — нужны
    фактическое значение, дата измерения, методика и источник."""
    eid = as_int(body.get("id"))
    if not eid:
        return None, "Не указан эффект"
    cur.execute(f"SELECT * FROM {SCHEMA}.exec_effect WHERE id = %s", (eid,))
    r = rows(cur)
    if not r:
        return None, "Эффект не найден"
    effect = r[0]
    missing = []
    if effect.get("actual_value") is None:
        missing.append("фактическое значение")
    if not effect.get("measured_at"):
        missing.append("дата измерения")
    if not effect.get("calculation_method"):
        missing.append("методика")
    if not effect.get("data_source"):
        missing.append("источник данных")
    if missing:
        return None, "Для подтверждения эффекта не хватает: " + ", ".join(missing)
    cur.execute(f"""
        UPDATE {SCHEMA}.exec_effect SET confirmation_status = 'confirmed',
            confirmed_by_person_id = %s, updated_at = now()
        WHERE id = %s
    """, (as_int(body.get("confirmed_by_person_id")) or None, eid))
    log_change(cur, actor, "effect", eid, "confirm")
    return eid, None


def build_goals_report_payload(cur, center_id: int, period_from, period_to):
    """Отчёт по достижению целей/KPI/эффектам — данные читаются один раз на
    момент публикации и больше не меняются (снимок)."""
    goals = goals_tree(cur, center_id)
    indicators = list_indicators(cur)

    cur.execute(f"""
        SELECT v.*, i.title AS indicator_title FROM {SCHEMA}.exec_indicator_value v
        JOIN {SCHEMA}.exec_indicator i ON i.id = v.indicator_id
        WHERE v.superseded_by_id IS NULL AND v.is_test_data = false
          {"AND v.period_start BETWEEN %s AND %s" if period_from and period_to else ""}
        ORDER BY v.period_start DESC
    """, (period_from, period_to) if period_from and period_to else ())
    values = rows(cur)

    deviations = [v for v in values if v.get("plan_value") is not None and v.get("actual_value") is not None
                  and abs(float(v["actual_value"]) - float(v["plan_value"])) > 0]

    cur.execute(f"""
        SELECT r.id, r.title, r.result_kind, r.achieved_at, r.project_id, r.initiative_id
        FROM {SCHEMA}.exec_result r WHERE r.archived_at IS NULL AND r.is_test_data = false
        ORDER BY r.achieved_at DESC NULLS LAST
    """)
    results = rows(cur)

    cur.execute(f"""
        SELECT e.id, e.title, e.metric, e.baseline_value, e.plan_value, e.actual_value,
               e.confirmation_status, e.result_id, e.calculation_method, e.data_source
        FROM {SCHEMA}.exec_effect e WHERE e.archived_at IS NULL AND COALESCE(e.is_test_data, false) = false
        ORDER BY e.updated_at DESC
    """)
    effects = rows(cur)

    cur.execute(f"""
        SELECT indicator_id, version_number, formula_kind, status, approved_at
        FROM {SCHEMA}.exec_indicator_methodology WHERE is_test_data = false
        ORDER BY indicator_id, version_number DESC
    """)
    methodologies = rows(cur)

    return {
        "generated_at": datetime.datetime.utcnow().isoformat(),
        "goals": goals, "indicators": indicators, "values": values,
        "deviations": deviations, "results": results, "effects": effects,
        "methodologies": methodologies,
        "indicators_no_data": [i for i in indicators if i["status_light"]["color"] == "gray"],
    }


def create_goals_report_snapshot(cur, body: dict, actor: str):
    center_id = as_int(body.get("center_id"))
    if not center_id:
        return None, "Не указан центр"
    period_from = body.get("period_from") or None
    period_to = body.get("period_to") or None
    report_kind = body.get("report_kind", "goals_achievement")

    payload = build_goals_report_payload(cur, center_id, period_from, period_to)
    payload_str = json.dumps(payload, ensure_ascii=False, default=str)
    payload_hash = hashlib.sha256(payload_str.encode("utf-8")).hexdigest()
    version_group = body.get("version_group") or f"{report_kind}_{center_id}"

    cur.execute(
        f"SELECT COALESCE(MAX(version_number), 0) FROM {SCHEMA}.exec_goals_report_snapshot "
        f"WHERE version_group = %s", (version_group,))
    next_version = cur.fetchone()[0] + 1
    title = body.get("title") or f"Достижение целей — версия {next_version}"

    cur.execute(f"""
        INSERT INTO {SCHEMA}.exec_goals_report_snapshot
            (title, report_kind, period_from, period_to, payload_json, payload_sha256,
             version_group, version_number, is_test_data, created_by)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id, created_at
    """, (title, report_kind, period_from, period_to, payload_str, payload_hash,
          version_group, next_version, bool(body.get("is_test_data")), actor))
    row = cur.fetchone()
    log_change(cur, actor, "goals_report_snapshot", row[0], "create",
               after={"version_group": version_group, "payload_sha256": payload_hash})
    return {"id": row[0], "created_at": row[1], "version_group": version_group,
            "version_number": next_version, "payload_sha256": payload_hash, "title": title}, None


def get_goals_report_snapshot(cur, sid: int):
    cur.execute(f"SELECT * FROM {SCHEMA}.exec_goals_report_snapshot WHERE id = %s", (sid,))
    r = rows(cur)
    if not r:
        return None
    item = r[0]
    payload_str = item.pop("payload_json")
    actual_hash = hashlib.sha256(payload_str.encode("utf-8")).hexdigest()
    item["payload"] = json.loads(payload_str)
    item["integrity_ok"] = item.get("payload_sha256") == actual_hash
    return item


def export_goals_report_html(snapshot: dict) -> str:
    p = snapshot["payload"]
    parts = [f"<html><head><meta charset='utf-8'><title>{snapshot['title']}</title>",
             "<style>body{font-family:sans-serif;padding:24px}table{border-collapse:collapse;width:100%;margin-bottom:24px}",
             "td,th{border:1px solid #ccc;padding:6px 10px;text-align:left;font-size:13px}th{background:#f3f3f3}",
             ".g{color:#16a34a}.y{color:#ca8a04}.r{color:#dc2626}.gr{color:#6b7280}",
             "h1{font-size:20px}h2{font-size:16px;margin-top:28px}</style></head><body>"]
    parts.append(f"<h1>{snapshot['title']}</h1>")
    parts.append(f"<p>Сформирован: {snapshot['created_at']} · Автор: {snapshot['created_by']}</p>")
    if not snapshot.get("integrity_ok", True):
        parts.append("<p style='color:red;font-weight:bold'>ВНИМАНИЕ: целостность снимка нарушена</p>")

    parts.append("<h2>Цели</h2><table><tr><th>Название</th><th>Уровень</th><th>Статус</th>"
                 "<th>Прогресс, %</th><th>Просрочена</th><th>Владелец</th></tr>")
    for g in p.get("goals", []):
        prog = g.get("progress", {}).get("progress_pct")
        parts.append(f"<tr><td>{g['title']}</td><td>{g.get('goal_level','')}</td>"
                     f"<td>{g.get('status','')}</td><td>{prog if prog is not None else '—'}</td>"
                     f"<td>{'да' if g.get('is_overdue') else 'нет'}</td><td>{g.get('owner_name') or '—'}</td></tr>")
    parts.append("</table>")

    color_cls = {"green": "g", "yellow": "y", "red": "r", "gray": "gr"}
    parts.append("<h2>Показатели</h2><table><tr><th>Название</th><th>Тип</th><th>Статус</th>"
                 "<th>План</th><th>Факт</th><th>Отклонение</th></tr>")
    for i in p.get("indicators", []):
        sl = i.get("status_light", {})
        cls = color_cls.get(sl.get("color"), "")
        parts.append(f"<tr><td>{i['title']}</td><td>{i.get('indicator_type','')}</td>"
                     f"<td class='{cls}'>{sl.get('color','')}</td><td>{sl.get('plan','—')}</td>"
                     f"<td>{sl.get('actual','—')}</td><td>{sl.get('deviation','—')}</td></tr>")
    parts.append("</table>")

    parts.append("<h2>Результаты</h2><table><tr><th>Название</th><th>Тип</th><th>Дата</th></tr>")
    for r in p.get("results", []):
        parts.append(f"<tr><td>{r['title']}</td><td>{r.get('result_kind','')}</td><td>{r.get('achieved_at') or '—'}</td></tr>")
    parts.append("</table>")

    parts.append("<h2>Эффекты</h2><table><tr><th>Название</th><th>Показатель</th><th>Факт</th><th>Статус</th></tr>")
    for e in p.get("effects", []):
        parts.append(f"<tr><td>{e['title']}</td><td>{e.get('metric') or '—'}</td>"
                     f"<td>{e.get('actual_value') or '—'}</td><td>{e.get('confirmation_status','')}</td></tr>")
    parts.append("</table>")
    parts.append("</body></html>")
    return "".join(parts)


def export_goals_report_xlsx_b64(snapshot: dict) -> str:
    import xlsxwriter
    buf = io.BytesIO()
    wb = xlsxwriter.Workbook(buf, {"in_memory": True})
    bold = wb.add_format({"bold": True, "bg_color": "#f0f0f0"})
    p = snapshot["payload"]

    ws = wb.add_worksheet("Сводка")
    ws.write_row(0, 0, ["Показатель", "Значение"], bold)
    ws.write_row(1, 0, ["Целей всего", len(p.get("goals", []))])
    ws.write_row(2, 0, ["Показателей всего", len(p.get("indicators", []))])
    ws.write_row(3, 0, ["Показателей без данных", len(p.get("indicators_no_data", []))])
    ws.write_row(4, 0, ["Результатов", len(p.get("results", []))])
    ws.write_row(5, 0, ["Эффектов", len(p.get("effects", []))])

    def sheet(name, key, cols):
        items = p.get(key) or []
        s = wb.add_worksheet(name[:31])
        s.write_row(0, 0, [c[1] for c in cols], bold)
        for i, it in enumerate(items, start=1):
            s.write_row(i, 0, [str(it.get(c[0], "") or "") for c in cols])

    sheet("Цели", "goals", [("title", "Название"), ("goal_level", "Уровень"), ("status", "Статус"),
                             ("due_date", "Срок"), ("owner_name", "Владелец")])
    sheet("Показатели", "indicators", [("title", "Название"), ("indicator_type", "Тип"), ("unit", "Единица"),
                                        ("target_value", "Целевое"), ("owner_name", "Владелец")])
    sheet("Значения", "values", [("indicator_title", "Показатель"), ("period_start", "Период"),
                                  ("plan_value", "План"), ("actual_value", "Факт"),
                                  ("verification_status", "Статус проверки")])
    sheet("Отклонения", "deviations", [("indicator_title", "Показатель"), ("period_start", "Период"),
                                        ("plan_value", "План"), ("actual_value", "Факт")])
    sheet("Результаты", "results", [("title", "Название"), ("result_kind", "Тип"), ("achieved_at", "Дата")])
    sheet("Эффекты", "effects", [("title", "Название"), ("metric", "Показатель"), ("baseline_value", "База"),
                                  ("plan_value", "План"), ("actual_value", "Факт"),
                                  ("confirmation_status", "Статус")])
    sheet("Методики", "methodologies", [("indicator_id", "ID показателя"), ("version_number", "Версия"),
                                         ("formula_kind", "Вид формулы"), ("status", "Статус")])

    params_sheet = wb.add_worksheet("Параметры отчёта")
    params_sheet.write_row(0, 0, ["Параметр", "Значение"], bold)
    meta = {"Название": snapshot["title"], "Сформирован": str(snapshot["created_at"]),
            "Автор": snapshot["created_by"], "SHA-256": snapshot.get("payload_sha256"),
            "Целостность": snapshot.get("integrity_ok")}
    for i, (kk, vv) in enumerate(meta.items(), start=1):
        params_sheet.write_row(i, 0, [kk, str(vv)])

    wb.close()
    buf.seek(0)
    return base64.b64encode(buf.read()).decode("ascii")


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
            level = body.get("goal_level")
            if level and level not in GOAL_LEVELS:
                return cors({"ok": False, "error": {"message": "Недопустимый уровень цели"}}, 400)
            status = body.get("status")
            if status and status not in GOAL_STATUSES:
                return cors({"ok": False, "error": {"message": "Недопустимый статус цели"}}, 400)
            new_id, err = upsert(cur, "exec_center_goal", GOAL_FIELDS, body)
            if err:
                return cors({"ok": False, "error": {"message": err}}, 400)
            log_change(cur, user["email"], "goal", new_id,
                       "update" if as_int(body.get("id")) else "create", after=clean(body, GOAL_FIELDS))
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

        if action == "task_templates":
            fid = as_int(qs.get("function_id"))
            where = "WHERE t.function_id = %s" if fid else ""
            cur.execute(f"""
                SELECT t.*, f.title AS function_title, p.display_name AS default_responsible_name,
                       pl.title AS plan_title,
                       (SELECT COUNT(*) FROM {SCHEMA}.exec_plan_step s
                         WHERE s.task_template_id = t.id AND s.status <> 'cancelled') AS instances_count,
                       (SELECT COUNT(*) FROM {SCHEMA}.exec_plan_step s
                         WHERE s.task_template_id = t.id AND s.status NOT IN ('done','cancelled')
                           AND s.due_date < CURRENT_DATE) AS overdue_instances
                FROM {SCHEMA}.exec_function_task_template t
                JOIN {SCHEMA}.exec_center_function f ON f.id = t.function_id
                LEFT JOIN {SCHEMA}.exec_person p ON p.id = t.default_responsible_person_id
                LEFT JOIN {SCHEMA}.exec_plan pl ON pl.id = t.plan_id
                {where}
                ORDER BY f.sort_order, t.title
            """, (fid,) if fid else ())
            return cors({"ok": True, "data": {"items": rows(cur)}})

        if action == "save_task_template":
            fields = ["function_id", "title", "description", "periodicity",
                      "default_responsible_person_id", "estimate_hours", "checklist_json",
                      "expected_result", "day_offset", "is_active", "plan_id"]
            new_id, err = upsert(cur, "exec_function_task_template", fields, body)
            if err:
                return cors({"ok": False, "error": {"message": err}}, 400)
            conn.commit()
            return cors({"ok": True, "data": {"id": new_id}})

        if action == "delete_task_template":
            tid = as_int(body.get("id"))
            if not tid:
                return cors({"ok": False, "error": {"message": "Не указан шаблон"}}, 400)
            cur.execute(
                f"UPDATE {SCHEMA}.exec_plan_step SET task_template_id = NULL WHERE task_template_id = %s",
                (tid,))
            cur.execute(f"DELETE FROM {SCHEMA}.exec_function_task_template WHERE id = %s", (tid,))
            conn.commit()
            return cors({"ok": True, "data": {"id": tid}})

        if action == "generate_regular_tasks":
            # Штампует экземпляры задач по активным шаблонам вперёд на указанный
            # горизонт (по умолчанию 60 дней). Не создаёт дублей: сверяется
            # с last_generated_for и с уже существующими шагами по task_template_id.
            horizon_days = as_int(body.get("horizon_days")) or 60
            only_template_id = as_int(body.get("template_id"))

            where = "WHERE t.is_active = true"
            params = []
            if only_template_id:
                where += " AND t.id = %s"
                params.append(only_template_id)

            cur.execute(f"""
                SELECT t.*, f.center_id, f.title AS function_title
                FROM {SCHEMA}.exec_function_task_template t
                JOIN {SCHEMA}.exec_center_function f ON f.id = t.function_id
                {where}
            """, params)
            templates = rows(cur)

            created = []
            for t in templates:
                period_starts = _period_starts(t["periodicity"], horizon_days)
                for p_start in period_starts:
                    due = p_start
                    if t["day_offset"]:
                        cur.execute("SELECT %s::date + (%s || ' days')::interval",
                                    (p_start, t["day_offset"]))
                        due = cur.fetchone()[0]
                    # защита от дублей: экземпляр на эту дату по этому шаблону уже есть?
                    cur.execute(f"""
                        SELECT 1 FROM {SCHEMA}.exec_plan_step
                        WHERE task_template_id = %s AND due_date = %s AND status <> 'cancelled'
                    """, (t["id"], due))
                    if rows(cur):
                        continue
                    plan_id = t["plan_id"]
                    if not plan_id:
                        cur.execute(f"""
                            SELECT id FROM {SCHEMA}.exec_plan
                            WHERE title = %s LIMIT 1
                        """, (f"Регулярные работы — {t['function_title']}",))
                        found = rows(cur)
                        if found:
                            plan_id = found[0]["id"]
                        else:
                            cur.execute(f"""
                                INSERT INTO {SCHEMA}.exec_plan (title, status, note)
                                VALUES (%s, 'active', 'Автоматически создан для регулярных задач функции')
                                RETURNING id
                            """, (f"Регулярные работы — {t['function_title']}",))
                            plan_id = cur.fetchone()[0]
                        cur.execute(
                            f"UPDATE {SCHEMA}.exec_function_task_template SET plan_id = %s WHERE id = %s",
                            (plan_id, t["id"]))
                    cur.execute(f"""
                        INSERT INTO {SCHEMA}.exec_plan_step
                            (plan_id, title, description, step_type, status, due_date,
                             estimate_hours, result_criteria, center_function_id, task_template_id)
                        VALUES (%s,%s,%s,'task','not_started',%s,%s,%s,%s,%s) RETURNING id
                    """, (plan_id, t["title"], t["description"], due, t["estimate_hours"],
                          t["expected_result"], t["function_id"], t["id"]))
                    step_id = cur.fetchone()[0]
                    if t["default_responsible_person_id"]:
                        cur.execute(f"""
                            INSERT INTO {SCHEMA}.exec_plan_assignee (step_id, person_id, raci_role, role_in_step)
                            VALUES (%s,%s,'A','responsible')
                            ON CONFLICT (step_id, person_id, raci_role) DO NOTHING
                        """, (step_id, t["default_responsible_person_id"]))
                    created.append({"template_id": t["id"], "step_id": step_id, "due_date": str(due)})
                if period_starts:
                    cur.execute(
                        f"UPDATE {SCHEMA}.exec_function_task_template "
                        f"SET last_generated_for = %s WHERE id = %s",
                        (period_starts[-1], t["id"]))
            conn.commit()
            return cors({"ok": True, "data": {"created": created, "count": len(created)}})

        if action == "regular_tasks_summary":
            # Сколько ресурсов уходит на постоянную деятельность vs инициативы —
            # для обоснования численности.
            cur.execute(f"""
                SELECT
                  COUNT(DISTINCT t.id) AS active_templates,
                  COALESCE(SUM(t.estimate_hours), 0) AS hours_per_instance_sum
                FROM {SCHEMA}.exec_function_task_template t WHERE t.is_active = true
            """)
            templates_stat = rows(cur)[0]
            cur.execute(f"""
                SELECT
                  COUNT(*) FILTER (WHERE s.status NOT IN ('done','cancelled')
                      AND s.due_date < CURRENT_DATE) AS missed,
                  COUNT(*) FILTER (WHERE s.status NOT IN ('done','cancelled')
                      AND s.due_date >= CURRENT_DATE) AS upcoming,
                  COUNT(*) FILTER (WHERE s.status = 'done') AS done,
                  COALESCE(SUM(s.estimate_hours) FILTER (WHERE s.status NOT IN ('cancelled')), 0) AS total_hours
                FROM {SCHEMA}.exec_plan_step s
                WHERE s.task_template_id IS NOT NULL
            """)
            instances_stat = rows(cur)[0]
            return cors({"ok": True, "data": {
                "templates": templates_stat, "instances": instances_stat,
            }})

        # ============ ОРГАНИЗАЦИОННАЯ МОДЕЛЬ ============

        if action == "org_overview":
            if not cid:
                return cors({"ok": False, "error": {"message": "Не указан центр"}}, 400)
            return cors({"ok": True, "data": org_model_overview(cur, cid)})

        if action == "org_tree":
            if not cid:
                return cors({"ok": False, "error": {"message": "Не указан центр"}}, 400)
            return cors({"ok": True, "data": {"items": org_structure_tree(cur, cid)}})

        if action == "org_unit_detail":
            uid = as_int(qs.get("org_unit_id")) or as_int(body.get("org_unit_id"))
            if not uid:
                return cors({"ok": False, "error": {"message": "Не указано подразделение"}}, 400)
            data = org_unit_detail(cur, uid)
            if not data:
                return cors({"ok": False, "error": {"message": "Подразделение не найдено"}}, 404)
            return cors({"ok": True, "data": data})

        if action == "save_org_unit":
            ctr = as_int(body.get("center_id"))
            if not as_int(body.get("id")) and not ctr:
                return cors({"ok": False, "error": {"message": "Не указан центр"}}, 400)
            if not as_int(body.get("id")) and not nz(body.get("name")):
                return cors({"ok": False, "error": {"message": "Не указано название подразделения"}}, 400)
            vals = clean(body, ORG_UNIT_FIELDS)
            rid = as_int(body.get("id"))
            if rid:
                sets = ", ".join(f"{k} = %s" for k in vals) if vals else None
                if sets:
                    cur.execute(
                        f"UPDATE {SCHEMA}.org_units SET {sets}, updated_at = now() WHERE id = %s RETURNING id",
                        list(vals.values()) + [rid])
                    rid = cur.fetchone()[0]
                log_change(cur, user["email"], "org_unit", rid, "update", after=vals)
            else:
                cur.execute(f"SELECT org_project_id FROM {SCHEMA}.exec_center WHERE id = %s", (ctr,))
                got = cur.fetchone()
                if not got or not got[0]:
                    return cors({"ok": False, "error": {"message": "У центра не настроен служебный проект-контейнер"}}, 400)
                org_project_id = got[0]
                parent_id = as_int(body.get("parent_id"))
                parent_path, parent_level = "", -1
                if parent_id:
                    cur.execute(f"SELECT path, level FROM {SCHEMA}.org_units WHERE id = %s", (parent_id,))
                    prow = cur.fetchone()
                    if prow:
                        parent_path, parent_level = prow[0] or "", prow[1] or -1
                name = vals.get("name") or ""
                code = vals.get("code") or ""
                new_path = (parent_path + " / " + name) if parent_path else name
                cur.execute(f"""
                    INSERT INTO {SCHEMA}.org_units
                        (project_id, center_id, code, name, short_name, type, parent_id,
                         path, level, head_person_id, valid_from, valid_to, status, description,
                         sort_order, source_ref)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'org_model_ui')
                    RETURNING id
                """, (org_project_id, ctr, code, name, vals.get("short_name"),
                      vals.get("type") or "division", parent_id, new_path, parent_level + 1,
                      vals.get("head_person_id"), vals.get("valid_from"), vals.get("valid_to"),
                      vals.get("status") or "active", vals.get("description"),
                      vals.get("sort_order") or 0))
                rid = cur.fetchone()[0]
                log_change(cur, user["email"], "org_unit", rid, "create", after=vals)
            conn.commit()
            return cors({"ok": True, "data": {"id": rid}})

        if action == "archive_org_unit":
            uid = as_int(body.get("id"))
            if not uid:
                return cors({"ok": False, "error": {"message": "Не указано подразделение"}}, 400)
            cur.execute(
                f"SELECT 1 FROM {SCHEMA}.org_units WHERE parent_id = %s AND is_archived = false", (uid,))
            if cur.fetchone():
                return cors({"ok": False, "error": {"message": "Нельзя архивировать подразделение с активными дочерними"}}, 400)
            # Историю не удаляем — soft-архивация, как у остального оргдерева.
            cur.execute(
                f"UPDATE {SCHEMA}.org_units SET is_archived = true, updated_at = now() WHERE id = %s",
                (uid,))
            log_change(cur, user["email"], "org_unit", uid, "archive")
            conn.commit()
            return cors({"ok": True, "data": {"id": uid}})

        if action == "save_center_function_org_unit":
            fid = as_int(body.get("center_function_id"))
            uid = as_int(body.get("org_unit_id"))
            role = (nz(body.get("role")) or "participant")
            if not fid or not uid or role not in ("owner", "participant"):
                return cors({"ok": False, "error": {"message": "Укажите функцию, подразделение и роль"}}, 400)
            if role == "owner":
                cur.execute(
                    f"UPDATE {SCHEMA}.exec_center_function_org_unit SET role = 'participant' "
                    f"WHERE center_function_id = %s AND role = 'owner' AND org_unit_id <> %s",
                    (fid, uid))
                cur.execute(
                    f"UPDATE {SCHEMA}.exec_center_function SET owner_org_unit_id = %s WHERE id = %s",
                    (uid, fid))
            cur.execute(f"""
                INSERT INTO {SCHEMA}.exec_center_function_org_unit (center_function_id, org_unit_id, role)
                VALUES (%s,%s,%s)
                ON CONFLICT (center_function_id, org_unit_id) DO UPDATE SET role = EXCLUDED.role
                RETURNING id
            """, (fid, uid, role))
            rid = cur.fetchone()[0]
            conn.commit()
            return cors({"ok": True, "data": {"id": rid}})

        if action == "unassign_center_function_org_unit":
            fid = as_int(body.get("center_function_id"))
            uid = as_int(body.get("org_unit_id"))
            cur.execute(
                f"DELETE FROM {SCHEMA}.exec_center_function_org_unit "
                f"WHERE center_function_id = %s AND org_unit_id = %s", (fid, uid))
            cur.execute(
                f"UPDATE {SCHEMA}.exec_center_function SET owner_org_unit_id = NULL "
                f"WHERE id = %s AND owner_org_unit_id = %s", (fid, uid))
            conn.commit()
            return cors({"ok": True, "data": {"ok": True}})

        if action == "staffing_summary":
            if not cid:
                return cors({"ok": False, "error": {"message": "Не указан центр"}}, 400)
            return cors({"ok": True, "data": staffing_summary(cur, cid)})

        if action == "save_role_position":
            role_id = as_int(body.get("role_id"))
            if not as_int(body.get("id")) and not role_id:
                return cors({"ok": False, "error": {"message": "Не указана роль"}}, 400)
            if body.get("status") == "occupied" and not as_int(body.get("person_id")):
                return cors({"ok": False, "error": {
                    "message": "Для занятой штатной позиции необходимо выбрать сотрудника"}}, 400)
            new_id, err = upsert(cur, "exec_role_position", ROLE_POSITION_FIELDS, body, require_title=False)
            if err:
                return cors({"ok": False, "error": {"message": err}}, 400)
            log_change(cur, user["email"], "role_position", new_id,
                       "update" if as_int(body.get("id")) else "create",
                       after=clean(body, ROLE_POSITION_FIELDS))
            conn.commit()
            return cors({"ok": True, "data": {"id": new_id}})

        if action == "delete_role_position":
            pid = as_int(body.get("id"))
            if not pid:
                return cors({"ok": False, "error": {"message": "Не указана штатная единица"}}, 400)
            cur.execute(f"DELETE FROM {SCHEMA}.exec_role_position WHERE id = %s", (pid,))
            log_change(cur, user["email"], "role_position", pid, "delete")
            conn.commit()
            return cors({"ok": True, "data": {"id": pid}})

        if action == "save_role_competency":
            rid_role = as_int(body.get("role_id"))
            comp_id = as_int(body.get("competency_id"))
            if not rid_role or not comp_id:
                return cors({"ok": False, "error": {"message": "Укажите роль и компетенцию"}}, 400)
            cur.execute(f"""
                INSERT INTO {SCHEMA}.exec_center_role_competency
                    (role_id, competency_id, required_level, is_critical, note)
                VALUES (%s,%s,%s,%s,%s)
                ON CONFLICT (role_id, competency_id) DO UPDATE
                SET required_level = EXCLUDED.required_level, is_critical = EXCLUDED.is_critical,
                    note = EXCLUDED.note
                RETURNING id
            """, (rid_role, comp_id, as_int(body.get("required_level")) or 3,
                  bool(body.get("is_critical")), nz(body.get("note"))))
            rid = cur.fetchone()[0]
            conn.commit()
            return cors({"ok": True, "data": {"id": rid}})

        if action == "delete_role_competency":
            rid = as_int(body.get("id"))
            cur.execute(f"DELETE FROM {SCHEMA}.exec_center_role_competency WHERE id = %s", (rid,))
            conn.commit()
            return cors({"ok": True, "data": {"id": rid}})

        if action == "save_requirement_competency":
            req_id = as_int(body.get("requirement_id"))
            comp_id = as_int(body.get("competency_id"))
            if not req_id or not comp_id:
                return cors({"ok": False, "error": {"message": "Укажите потребность и компетенцию"}}, 400)
            cur.execute(f"""
                INSERT INTO {SCHEMA}.exec_requirement_competency (requirement_id, competency_id, required_level)
                VALUES (%s,%s,%s)
                ON CONFLICT (requirement_id, competency_id) DO UPDATE
                SET required_level = EXCLUDED.required_level
                RETURNING id
            """, (req_id, comp_id, as_int(body.get("required_level")) or 3))
            rid = cur.fetchone()[0]
            conn.commit()
            return cors({"ok": True, "data": {"id": rid}})

        if action == "competency_gaps":
            if not cid:
                return cors({"ok": False, "error": {"message": "Не указан центр"}}, 400)
            return cors({"ok": True, "data": competency_gap_report(cur, cid)})

        if action == "raci_matrix":
            etype = nz(qs.get("entity_type"))
            eid = as_int(qs.get("entity_id"))
            if etype not in RACI_ENTITY_TABLE or not eid:
                return cors({"ok": False, "error": {"message": "Укажите тип и id объекта"}}, 400)
            return cors({"ok": True, "data": raci_check(cur, etype, eid)})

        if action == "save_raci_matrix":
            etype = nz(body.get("entity_type"))
            eid = as_int(body.get("entity_id"))
            pid = as_int(body.get("person_id"))
            role = (nz(body.get("raci_role")) or "R").upper()[:1]
            if etype not in RACI_ENTITY_TABLE or not eid or not pid or role not in ("R", "A", "C", "I"):
                return cors({"ok": False, "error": {"message": "Укажите объект, человека и роль RACI"}}, 400)
            is_collective = bool(body.get("is_collective_a"))
            # RACI не должен автоматически менять руководителя проекта/владельца
            # результата — это отдельная запись матрицы, без записи в exec_project/exec_result.
            if role == "A" and not is_collective:
                cur.execute(
                    f"UPDATE {SCHEMA}.exec_raci_matrix SET valid_to = CURRENT_DATE "
                    f"WHERE entity_type = %s AND entity_id = %s AND raci_role = 'A' "
                    f"AND valid_to IS NULL AND is_collective_a = false AND person_id <> %s",
                    (etype, eid, pid))
            cur.execute(f"""
                INSERT INTO {SCHEMA}.exec_raci_matrix
                    (entity_type, entity_id, person_id, raci_role, is_collective_a, valid_from, note, created_by)
                VALUES (%s,%s,%s,%s,%s, COALESCE(%s::date, CURRENT_DATE), %s, %s)
                RETURNING id
            """, (etype, eid, pid, role, is_collective, nz(body.get("valid_from")),
                  nz(body.get("note")), user["email"]))
            rid = cur.fetchone()[0]
            log_change(cur, user["email"], "raci_matrix", rid, "create",
                       after={"entity_type": etype, "entity_id": eid, "person_id": pid, "raci_role": role})
            conn.commit()
            return cors({"ok": True, "data": {"id": rid}})

        if action == "close_raci_matrix":
            rid = as_int(body.get("id"))
            if not rid:
                return cors({"ok": False, "error": {"message": "Не указана запись"}}, 400)
            cur.execute(
                f"UPDATE {SCHEMA}.exec_raci_matrix SET valid_to = COALESCE(%s::date, CURRENT_DATE) WHERE id = %s",
                (nz(body.get("valid_to")), rid))
            conn.commit()
            return cors({"ok": True, "data": {"id": rid}})

        if action == "dept_function_map":
            if not cid:
                return cors({"ok": False, "error": {"message": "Не указан центр"}}, 400)
            return cors({"ok": True, "data": {"items": dept_function_map_candidates(cur, cid)}})

        if action == "org_resource_plan_versions":
            cur.execute(f"""
                SELECT v.*, (SELECT COUNT(*) FROM {SCHEMA}.exec_org_resource_plan_line l
                              WHERE l.version_id = v.id) AS line_count
                FROM {SCHEMA}.exec_org_resource_plan_version v
                WHERE v.is_test_data = false
                ORDER BY v.year DESC, v.id DESC
            """)
            return cors({"ok": True, "data": {"items": rows(cur)}})

        if action == "save_org_resource_plan_version":
            year = as_int(body.get("year"))
            if not as_int(body.get("id")) and not year:
                return cors({"ok": False, "error": {"message": "Укажите год"}}, 400)
            rid = as_int(body.get("id"))
            if rid:
                cur.execute(
                    f"SELECT status FROM {SCHEMA}.exec_org_resource_plan_version WHERE id = %s", (rid,))
                got = cur.fetchone()
                if got and got[0] == "approved":
                    return cors({"ok": False, "error": {"message": "Версия утверждена — создайте новую редакцию"}}, 400)
                cur.execute(f"""
                    UPDATE {SCHEMA}.exec_org_resource_plan_version
                    SET title = %s, note = %s, updated_at = now() WHERE id = %s RETURNING id
                """, (nz(body.get("title")), nz(body.get("note")), rid))
                rid = cur.fetchone()[0]
            else:
                cur.execute(f"""
                    INSERT INTO {SCHEMA}.exec_org_resource_plan_version
                        (year, title, note, is_test_data, created_by)
                    VALUES (%s,%s,%s,%s,%s) RETURNING id
                """, (year, nz(body.get("title")), nz(body.get("note")),
                      bool(body.get("is_test_data")), user["email"]))
                rid = cur.fetchone()[0]
            conn.commit()
            return cors({"ok": True, "data": {"id": rid}})

        if action == "org_resource_plan":
            vid = as_int(qs.get("version_id")) or as_int(body.get("version_id"))
            if not vid:
                return cors({"ok": False, "error": {"message": "Не указана версия плана"}}, 400)
            data = build_org_resource_plan_payload(cur, vid)
            if not data:
                return cors({"ok": False, "error": {"message": "Версия не найдена"}}, 404)
            return cors({"ok": True, "data": data})

        if action == "save_org_resource_plan_line":
            vid = as_int(body.get("version_id"))
            month = nz(body.get("month"))
            if not vid or not month:
                return cors({"ok": False, "error": {"message": "Укажите версию и месяц"}}, 400)
            cur.execute(
                f"SELECT status FROM {SCHEMA}.exec_org_resource_plan_version WHERE id = %s", (vid,))
            got = cur.fetchone()
            if not got:
                return cors({"ok": False, "error": {"message": "Версия плана не найдена"}}, 404)
            if got[0] == "approved":
                return cors({"ok": False, "error": {"message": "Версия утверждена — строки больше не редактируются, создайте новую версию"}}, 400)
            vals = clean(body, ORG_RESOURCE_PLAN_LINE_FIELDS)
            rid = as_int(body.get("id"))
            if rid:
                sets = ", ".join(f"{k} = %s" for k in vals)
                cur.execute(
                    f"UPDATE {SCHEMA}.exec_org_resource_plan_line SET {sets}, updated_at = now() "
                    f"WHERE id = %s RETURNING id", list(vals.values()) + [rid])
            else:
                cols = ", ".join(vals)
                ph = ", ".join(["%s"] * len(vals))
                cur.execute(f"""
                    INSERT INTO {SCHEMA}.exec_org_resource_plan_line ({cols})
                    VALUES ({ph})
                    ON CONFLICT (version_id, org_unit_id, role_id, month) DO UPDATE
                    SET planned_fte = EXCLUDED.planned_fte, available_fte = EXCLUDED.available_fte,
                        operational_demand_fte = EXCLUDED.operational_demand_fte,
                        external_fte = EXCLUDED.external_fte, fot_plan_amount = EXCLUDED.fot_plan_amount,
                        comment = EXCLUDED.comment, updated_at = now()
                    RETURNING id
                """, list(vals.values()))
            rid = cur.fetchone()[0]
            conn.commit()
            return cors({"ok": True, "data": {"id": rid}})

        if action == "create_org_resource_plan_snapshot":
            snap, err = create_org_resource_plan_snapshot(cur, body, user["email"])
            if err:
                return cors({"ok": False, "error": {"message": err}}, 400)
            conn.commit()
            return cors({"ok": True, "data": snap})

        if action == "org_resource_plan_snapshot":
            sid = as_int(qs.get("id"))
            snap = get_org_resource_plan_snapshot(cur, sid) if sid else None
            if not snap:
                return cors({"ok": False, "error": {"message": "Снимок не найден"}}, 404)
            return cors({"ok": True, "data": snap})

        # ============ ЦЕЛИ, KPI И ЭФФЕКТЫ ============

        if action == "goals_dashboard":
            cid = as_int(qs.get("center_id"))
            if not cid:
                return cors({"ok": False, "error": {"message": "Не указан центр"}}, 400)
            return cors({"ok": True, "data": goals_dashboard(cur, cid)})

        if action == "goals_tree":
            cid = as_int(qs.get("center_id"))
            if not cid:
                return cors({"ok": False, "error": {"message": "Не указан центр"}}, 400)
            return cors({"ok": True, "data": {"items": goals_tree(cur, cid)}})

        if action == "goal_detail":
            gid = as_int(qs.get("id"))
            detail = goal_detail(cur, gid) if gid else None
            if not detail:
                return cors({"ok": False, "error": {"message": "Цель не найдена"}}, 404)
            return cors({"ok": True, "data": detail})

        if action == "list_indicators":
            applicability = qs.get("applicability", "active")
            return cors({"ok": True, "data": {"items": list_indicators(cur, applicability)}})

        if action == "indicator_detail":
            iid = as_int(qs.get("id"))
            detail = indicator_detail(cur, iid) if iid else None
            if not detail:
                return cors({"ok": False, "error": {"message": "Показатель не найден"}}, 404)
            return cors({"ok": True, "data": detail})

        if action == "save_indicator":
            new_id, err = save_indicator(cur, body, user["email"])
            if err:
                return cors({"ok": False, "error": {"message": err}}, 400)
            conn.commit()
            return cors({"ok": True, "data": {"id": new_id}})

        if action == "save_methodology":
            new_id, err = save_methodology(cur, body, user["email"])
            if err:
                return cors({"ok": False, "error": {"message": err}}, 400)
            conn.commit()
            return cors({"ok": True, "data": {"id": new_id}})

        if action == "save_indicator_value":
            new_id, err = save_indicator_value(cur, body, user["email"])
            if err:
                return cors({"ok": False, "error": {"message": err}}, 400)
            conn.commit()
            return cors({"ok": True, "data": {"id": new_id}})

        if action == "confirm_indicator_value":
            vid, err = confirm_indicator_value(cur, body, user["email"])
            if err:
                return cors({"ok": False, "error": {"message": err}}, 400)
            conn.commit()
            return cors({"ok": True, "data": {"id": vid}})

        if action == "save_goal_indicator":
            new_id, err = save_goal_indicator(cur, body, user["email"])
            if err:
                return cors({"ok": False, "error": {"message": err}}, 400)
            conn.commit()
            return cors({"ok": True, "data": {"id": new_id}})

        if action == "confirm_effect":
            eid, err = confirm_effect(cur, body, user["email"])
            if err:
                return cors({"ok": False, "error": {"message": err}}, 400)
            conn.commit()
            return cors({"ok": True, "data": {"id": eid}})

        if action == "create_goals_report_snapshot":
            snap, err = create_goals_report_snapshot(cur, body, user["email"])
            if err:
                return cors({"ok": False, "error": {"message": err}}, 400)
            conn.commit()
            return cors({"ok": True, "data": snap})

        if action == "goals_report_snapshot":
            sid = as_int(qs.get("id"))
            snap = get_goals_report_snapshot(cur, sid) if sid else None
            if not snap:
                return cors({"ok": False, "error": {"message": "Снимок не найден"}}, 404)
            return cors({"ok": True, "data": snap})

        if action == "export_goals_report_html":
            sid = as_int(qs.get("id"))
            snap = get_goals_report_snapshot(cur, sid) if sid else None
            if not snap:
                return cors({"ok": False, "error": {"message": "Снимок не найден"}}, 404)
            return {
                "statusCode": 200,
                "headers": {"Access-Control-Allow-Origin": "*", "Content-Type": "text/html; charset=utf-8"},
                "body": export_goals_report_html(snap),
            }

        if action == "export_goals_report_xlsx":
            sid = as_int(qs.get("id"))
            snap = get_goals_report_snapshot(cur, sid) if sid else None
            if not snap:
                return cors({"ok": False, "error": {"message": "Снимок не найден"}}, 404)
            return cors({"ok": True, "data": {"filename": f"{snap['title']}.xlsx",
                                               "content_base64": export_goals_report_xlsx_b64(snap)}})

        return cors({"ok": False, "error": {"message": f"Неизвестное действие: {action}"}}, 400)
    finally:
        conn.close()