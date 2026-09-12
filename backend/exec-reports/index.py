"""
Дашборд руководителя и регулярная отчётность.

Показатели и списки читаются из текущих таблиц (exec_action, exec_project,
exec_task, exec_milestone, exec_risk, exec_issue, exec_decision_instance,
exec_result, exec_effect) с исключением тестовых (is_test_data) и архивных
записей по умолчанию.

Отчётные снимки (exec_report_snapshot) неизменяемы через этот backend: нет
action для UPDATE/DELETE, только создание новой версии (version_group +
version_number). При чтении пересчитывается SHA-256 и сравнивается с
сохранённым — расхождение возвращается как integrity_ok=false, экспорт
в этом случае блокируется.

XLSX и HTML экспортируются ИЗ payload_json снимка, а не из текущих таблиц —
поэтому выгрузка соответствует ровно той версии, которую видел пользователь
при публикации.

AI не используется нигде в этом модуле.
"""
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


TND = "COALESCE(is_test_data, false) = false"  # test-not-data guard


# ============ ПОКАЗАТЕЛИ ДАШБОРДА ============

def kpi(cur):
    def count(sql, params=()):
        cur.execute(sql, params)
        return cur.fetchone()[0]

    active_actions = count(f"""
        SELECT count(*) FROM {SCHEMA}.exec_action
        WHERE {TND} AND status NOT IN ('done_by_executor','accepted_by_head','cancelled','done')
    """)
    overdue_actions = count(f"""
        SELECT count(*) FROM {SCHEMA}.exec_action
        WHERE {TND} AND status NOT IN ('done_by_executor','accepted_by_head','cancelled','done')
          AND due_at IS NOT NULL AND due_at < CURRENT_DATE
    """)
    active_projects = count(f"""
        SELECT count(*) FROM {SCHEMA}.exec_project
        WHERE archived_at IS NULL AND {TND} AND status IN ('planned','in_progress')
    """)
    overdue_tasks = count(f"""
        SELECT count(*) FROM {SCHEMA}.exec_task
        WHERE archived_at IS NULL AND {TND} AND status NOT IN ('done','cancelled')
          AND due_at IS NOT NULL AND due_at < CURRENT_DATE
    """)
    blocked_tasks = count(f"""
        SELECT count(*) FROM {SCHEMA}.exec_task
        WHERE archived_at IS NULL AND {TND} AND status = 'blocked'
    """)
    milestones_7 = count(f"""
        SELECT count(*) FROM {SCHEMA}.exec_milestone
        WHERE {TND} AND status NOT IN ('achieved','cancelled')
          AND plan_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'
    """)
    milestones_14 = count(f"""
        SELECT count(*) FROM {SCHEMA}.exec_milestone
        WHERE {TND} AND status NOT IN ('achieved','cancelled')
          AND plan_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '14 days'
    """)
    milestones_30 = count(f"""
        SELECT count(*) FROM {SCHEMA}.exec_milestone
        WHERE {TND} AND status NOT IN ('achieved','cancelled')
          AND plan_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
    """)
    critical_risks = count(f"""
        SELECT count(*) FROM {SCHEMA}.exec_risk
        WHERE {TND} AND status = 'active' AND probability * impact >= 15
    """)
    open_issues = count(f"""
        SELECT count(*) FROM {SCHEMA}.exec_issue
        WHERE {TND} AND status IN ('open','in_progress','awaiting_decision')
    """)
    pending_decisions = count(f"""
        SELECT count(*) FROM {SCHEMA}.exec_decision_instance
        WHERE status IN ('raised','in_progress')
    """)
    results_pending = count(f"""
        SELECT count(*) FROM {SCHEMA}.exec_result r
        WHERE r.archived_at IS NULL AND {TND.replace('is_test_data', 'r.is_test_data')}
          AND NOT EXISTS (SELECT 1 FROM {SCHEMA}.exec_effect e WHERE e.result_id = r.id AND e.confirmation_status='confirmed')
    """)
    effects_pending = count(f"""
        SELECT count(*) FROM {SCHEMA}.exec_effect
        WHERE archived_at IS NULL AND {TND} AND confirmation_status IN ('not_confirmed','pending_review')
    """)
    effects_confirmed = count(f"""
        SELECT count(*) FROM {SCHEMA}.exec_effect
        WHERE archived_at IS NULL AND {TND} AND confirmation_status = 'confirmed'
    """)

    return {
        "active_actions": active_actions, "overdue_actions": overdue_actions,
        "active_projects": active_projects, "overdue_tasks": overdue_tasks,
        "blocked_tasks": blocked_tasks, "milestones_7": milestones_7,
        "milestones_14": milestones_14, "milestones_30": milestones_30,
        "critical_risks": critical_risks, "open_issues": open_issues,
        "pending_decisions": pending_decisions, "results_pending": results_pending,
        "effects_pending": effects_pending, "effects_confirmed": effects_confirmed,
    }


# ============ БЛОК «ТРЕБУЕТ ВНИМАНИЯ» ============

def attention_list(cur):
    items = []

    cur.execute(f"""
        SELECT id, title, due_at, priority, project_id,
            (CURRENT_DATE - due_at) AS days_overdue
        FROM {SCHEMA}.exec_action
        WHERE {TND} AND status NOT IN ('done_by_executor','accepted_by_head','cancelled','done')
          AND due_at IS NOT NULL AND due_at < CURRENT_DATE
        ORDER BY due_at LIMIT 30
    """)
    for r in rows(cur):
        items.append({"kind": "action", "id": r["id"], "title": r["title"], "reason": "Просроченное поручение",
                      "due_at": r["due_at"], "days_overdue": r["days_overdue"], "priority": r["priority"],
                      "project_id": r["project_id"], "rank": 1})

    cur.execute(f"""
        SELECT id, title, plan_date, project_id, initiative_id,
            (CURRENT_DATE - plan_date) AS days_overdue
        FROM {SCHEMA}.exec_milestone
        WHERE {TND} AND status NOT IN ('achieved','cancelled')
          AND plan_date IS NOT NULL AND plan_date < CURRENT_DATE
        ORDER BY plan_date LIMIT 30
    """)
    for r in rows(cur):
        items.append({"kind": "milestone", "id": r["id"], "title": r["title"], "reason": "Просроченная контрольная точка",
                      "due_at": r["plan_date"], "days_overdue": r["days_overdue"], "priority": None,
                      "project_id": r["project_id"], "rank": 2})

    cur.execute(f"""
        SELECT id, title, due_at, priority, status, project_id,
            (CASE WHEN due_at IS NOT NULL AND due_at < CURRENT_DATE THEN CURRENT_DATE - due_at ELSE NULL END) AS days_overdue
        FROM {SCHEMA}.exec_task
        WHERE archived_at IS NULL AND {TND} AND status NOT IN ('done','cancelled')
          AND (status = 'blocked' OR (due_at IS NOT NULL AND due_at < CURRENT_DATE))
        ORDER BY (due_at IS NULL), due_at LIMIT 30
    """)
    for r in rows(cur):
        reason = "Заблокирована" if r["status"] == "blocked" else "Просроченная задача"
        items.append({"kind": "task", "id": r["id"], "title": r["title"], "reason": reason,
                      "due_at": r["due_at"], "days_overdue": r["days_overdue"], "priority": r["priority"],
                      "project_id": r["project_id"], "rank": 3})

    cur.execute(f"""
        SELECT id, description AS title, probability * impact AS risk_score, project_id
        FROM {SCHEMA}.exec_risk
        WHERE {TND} AND status = 'active' AND probability * impact >= 15
        ORDER BY probability * impact DESC LIMIT 20
    """)
    for r in rows(cur):
        items.append({"kind": "risk", "id": r["id"], "title": r["title"], "reason": f"Критический риск (оценка {r['risk_score']})",
                      "due_at": None, "days_overdue": None, "priority": "urgent",
                      "project_id": r["project_id"], "rank": 4})

    cur.execute(f"""
        SELECT id, title, criticality, project_id
        FROM {SCHEMA}.exec_issue
        WHERE {TND} AND status IN ('open','in_progress') AND criticality IN ('high','critical')
        ORDER BY criticality DESC LIMIT 20
    """)
    for r in rows(cur):
        items.append({"kind": "issue", "id": r["id"], "title": r["title"], "reason": f"Открытая проблема ({r['criticality']})",
                      "due_at": None, "days_overdue": None, "priority": r["criticality"],
                      "project_id": r["project_id"], "rank": 5})

    cur.execute(f"""
        SELECT id, question AS title, due_at, project_id
        FROM {SCHEMA}.exec_decision_instance
        WHERE status IN ('raised','in_progress') ORDER BY due_at NULLS LAST LIMIT 20
    """)
    for r in rows(cur):
        items.append({"kind": "decision", "id": r["id"], "title": r["title"], "reason": "Требует решения",
                      "due_at": r["due_at"], "days_overdue": None, "priority": None,
                      "project_id": r["project_id"], "rank": 6})

    cur.execute(f"""
        SELECT r.id, r.title, r.project_id
        FROM {SCHEMA}.exec_result r
        WHERE r.archived_at IS NULL AND r.is_test_data = false
          AND NOT EXISTS (SELECT 1 FROM {SCHEMA}.exec_effect e WHERE e.result_id = r.id AND e.confirmation_status='confirmed')
        ORDER BY r.updated_at DESC LIMIT 20
    """)
    for r in rows(cur):
        items.append({"kind": "result", "id": r["id"], "title": r["title"], "reason": "Результат ожидает подтверждения",
                      "due_at": None, "days_overdue": None, "priority": None,
                      "project_id": r["project_id"], "rank": 7})

    cur.execute(f"""
        SELECT id, title, project_id FROM {SCHEMA}.exec_effect
        WHERE archived_at IS NULL AND {TND} AND confirmation_status IN ('not_confirmed','pending_review')
        ORDER BY updated_at DESC LIMIT 20
    """)
    for r in rows(cur):
        items.append({"kind": "effect", "id": r["id"], "title": r["title"], "reason": "Эффект ожидает подтверждения",
                      "due_at": None, "days_overdue": None, "priority": None,
                      "project_id": r["project_id"], "rank": 8})

    cur.execute(f"""
        SELECT id, title, updated_at, (CURRENT_DATE - updated_at::date) AS days_stale
        FROM {SCHEMA}.exec_project
        WHERE archived_at IS NULL AND {TND} AND status IN ('planned','in_progress')
          AND updated_at < now() - INTERVAL '30 days'
        ORDER BY updated_at LIMIT 20
    """)
    for r in rows(cur):
        items.append({"kind": "project", "id": r["id"], "title": r["title"], "reason": f"Нет обновлений {r['days_stale']} дн.",
                      "due_at": None, "days_overdue": None, "priority": None,
                      "project_id": r["id"], "rank": 9})

    # Проекты с прогнозируемым перерасходом бюджета
    yr = datetime.date.today().year
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
        WHERE p.archived_at IS NULL AND p.is_test_data = false AND p.status IN ('planned','in_progress')
    """, (yr, yr, yr))
    for r in rows(cur):
        budget, forecast = float(r["budget"]), float(r["forecast"])
        if budget > 0 and forecast > budget:
            items.append({"kind": "project_budget", "id": r["id"], "title": r["title"],
                          "reason": f"Прогнозируемый перерасход {forecast - budget:,.0f} ₽".replace(",", " "),
                          "due_at": None, "days_overdue": None, "priority": "urgent",
                          "project_id": r["id"], "rank": 3})

    # Перегруженные участники команды
    cur.execute(f"""
        SELECT a.person_id, p.display_name, SUM(a.plan_load_pct) AS total_load_pct
        FROM {SCHEMA}.exec_resource_assignment a
        JOIN {SCHEMA}.exec_person p ON p.id = a.person_id
        WHERE a.archived_at IS NULL AND a.is_test_data = false AND a.person_id IS NOT NULL
        GROUP BY a.person_id, p.display_name
        HAVING SUM(a.plan_load_pct) > 100
        ORDER BY SUM(a.plan_load_pct) DESC LIMIT 20
    """)
    for r in rows(cur):
        items.append({"kind": "person_overload", "id": r["person_id"], "title": r["display_name"],
                      "reason": f"Перегрузка {float(r['total_load_pct']):.0f}%",
                      "due_at": None, "days_overdue": None, "priority": "high",
                      "project_id": None, "rank": 3})

    # Ресурсные потребности: пора начинать поиск / просрочены / без финансирования
    open_statuses = "('draft','confirmed','searching','candidate_identified')"
    cur.execute(f"""
        SELECT r.id, r.role_title, rc.title AS role_title_ref, r.project_id, r.need_by_date,
               (CURRENT_DATE - r.need_by_date) AS days_overdue
        FROM {SCHEMA}.exec_resource_requirement r
        LEFT JOIN {SCHEMA}.exec_center_role rc ON rc.id = r.role_id
        WHERE r.archived_at IS NULL AND r.is_test_data = false AND r.status IN {open_statuses}
          AND r.need_by_date IS NOT NULL AND r.need_by_date < CURRENT_DATE
        ORDER BY r.need_by_date LIMIT 20
    """)
    for r in rows(cur):
        items.append({"kind": "requirement_overdue", "id": r["id"], "title": r["role_title_ref"] or r["role_title"],
                      "reason": "Ресурсная потребность просрочена", "due_at": r["need_by_date"],
                      "days_overdue": r["days_overdue"], "priority": "urgent",
                      "project_id": r["project_id"], "rank": 3})

    cur.execute(f"""
        SELECT r.id, r.role_title, rc.title AS role_title_ref, r.project_id, r.need_by_date
        FROM {SCHEMA}.exec_resource_requirement r
        LEFT JOIN {SCHEMA}.exec_center_role rc ON rc.id = r.role_id
        WHERE r.archived_at IS NULL AND r.is_test_data = false AND r.status IN {open_statuses}
          AND r.search_start_date IS NOT NULL AND r.search_start_date <= CURRENT_DATE
          AND (r.need_by_date IS NULL OR r.need_by_date >= CURRENT_DATE)
        ORDER BY r.need_by_date LIMIT 20
    """)
    for r in rows(cur):
        items.append({"kind": "requirement_search", "id": r["id"], "title": r["role_title_ref"] or r["role_title"],
                      "reason": "Пора начинать поиск", "due_at": r["need_by_date"],
                      "days_overdue": None, "priority": "high",
                      "project_id": r["project_id"], "rank": 6})

    cur.execute(f"""
        SELECT r.id, r.role_title, rc.title AS role_title_ref, r.project_id, r.estimated_total_cost
        FROM {SCHEMA}.exec_resource_requirement r
        LEFT JOIN {SCHEMA}.exec_center_role rc ON rc.id = r.role_id
        WHERE r.archived_at IS NULL AND r.is_test_data = false AND r.status IN {open_statuses}
          AND r.funding_confirmed = false
        ORDER BY r.estimated_total_cost DESC NULLS LAST LIMIT 20
    """)
    for r in rows(cur):
        items.append({"kind": "requirement_no_funding", "id": r["id"], "title": r["role_title_ref"] or r["role_title"],
                      "reason": "Потребность без подтверждённого финансирования",
                      "due_at": None, "days_overdue": None, "priority": None,
                      "project_id": r["project_id"], "rank": 7})

    # Задачи и вехи без обеспеченного ресурса (есть открытая потребность на них)
    cur.execute(f"""
        SELECT t.id, t.title, t.project_id, t.due_at
        FROM {SCHEMA}.exec_task t
        WHERE t.archived_at IS NULL AND t.is_test_data = false AND t.status NOT IN ('done','cancelled')
          AND EXISTS (
            SELECT 1 FROM {SCHEMA}.exec_resource_requirement r
            WHERE r.task_id = t.id AND r.archived_at IS NULL AND r.is_test_data = false
              AND r.status IN {open_statuses}
          )
        ORDER BY (t.due_at IS NULL), t.due_at LIMIT 20
    """)
    for r in rows(cur):
        items.append({"kind": "task_no_resource", "id": r["id"], "title": r["title"],
                      "reason": "Задача без обеспеченного ресурса", "due_at": r["due_at"],
                      "days_overdue": None, "priority": None,
                      "project_id": r["project_id"], "rank": 6})

    items.sort(key=lambda x: (x["rank"], -(x["days_overdue"] or 0)))
    return items


# ============ ТАБЛИЦА ПОРТФЕЛЯ ============

def portfolio_table(cur, filters: dict):
    conds = ["p.archived_at IS NULL", "p.is_test_data = false"]
    params = []
    if filters.get("project_kind"):
        conds.append("p.project_kind = %s")
        params.append(filters["project_kind"])
    if filters.get("status"):
        conds.append("p.status = %s")
        params.append(filters["status"])
    if filters.get("priority"):
        conds.append("p.priority = %s")
        params.append(filters["priority"])
    where = "WHERE " + " AND ".join(conds)

    cur.execute(f"""
        SELECT p.id, p.title, p.project_kind, p.status, p.priority, p.progress_pct, p.plan_end,
            (SELECT count(*) FROM {SCHEMA}.exec_task t WHERE t.project_id = p.id AND t.archived_at IS NULL
                AND t.is_test_data = false AND t.status NOT IN ('done','cancelled')
                AND t.due_at IS NOT NULL AND t.due_at < CURRENT_DATE) AS overdue_task_count,
            (SELECT m.title FROM {SCHEMA}.exec_milestone m WHERE m.project_id = p.id
                AND m.is_test_data = false AND m.status NOT IN ('achieved','cancelled')
                AND m.plan_date IS NOT NULL ORDER BY m.plan_date LIMIT 1) AS next_milestone_title,
            (SELECT m.plan_date FROM {SCHEMA}.exec_milestone m WHERE m.project_id = p.id
                AND m.is_test_data = false AND m.status NOT IN ('achieved','cancelled')
                AND m.plan_date IS NOT NULL ORDER BY m.plan_date LIMIT 1) AS next_milestone_date,
            (SELECT r.description FROM {SCHEMA}.exec_risk r WHERE r.project_id = p.id
                AND r.is_test_data = false AND r.status = 'active'
                ORDER BY r.probability * r.impact DESC LIMIT 1) AS top_risk,
            (SELECT i.title FROM {SCHEMA}.exec_issue i WHERE i.project_id = p.id
                AND i.is_test_data = false AND i.status IN ('open','in_progress') LIMIT 1) AS open_issue,
            (SELECT d.question FROM {SCHEMA}.exec_decision_instance d WHERE d.project_id = p.id
                AND d.status IN ('raised','in_progress') LIMIT 1) AS pending_decision,
            (SELECT r.title FROM {SCHEMA}.exec_result r WHERE r.project_id = p.id
                AND r.is_test_data = false AND r.archived_at IS NULL
                ORDER BY r.achieved_at DESC NULLS LAST LIMIT 1) AS last_result
        FROM {SCHEMA}.exec_project p
        {where}
        ORDER BY p.updated_at DESC
    """, params)
    items = rows(cur)

    if filters.get("has_overdue") == "1":
        items = [i for i in items if i["overdue_task_count"] > 0]
    if filters.get("has_critical_risk") == "1":
        items = [i for i in items if i["top_risk"]]
    return items


# ============ БЛИЖАЙШИЕ СОБЫТИЯ (30 ДНЕЙ) ============

def upcoming_events(cur):
    cur.execute(f"""
        SELECT id, title, due_at, priority FROM {SCHEMA}.exec_action
        WHERE {TND} AND status NOT IN ('done_by_executor','accepted_by_head','cancelled','done')
          AND due_at BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
        ORDER BY due_at
    """)
    actions = rows(cur)

    cur.execute(f"""
        SELECT id, title, due_at, project_id FROM {SCHEMA}.exec_task
        WHERE archived_at IS NULL AND {TND} AND status NOT IN ('done','cancelled')
          AND due_at BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
        ORDER BY due_at
    """)
    tasks = rows(cur)

    cur.execute(f"""
        SELECT id, title, plan_date, project_id FROM {SCHEMA}.exec_milestone
        WHERE {TND} AND status NOT IN ('achieved','cancelled')
          AND plan_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
        ORDER BY plan_date
    """)
    milestones = rows(cur)

    cur.execute(f"""
        SELECT id, title, plan_end FROM {SCHEMA}.exec_project
        WHERE archived_at IS NULL AND is_test_data = false
          AND plan_end BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
        ORDER BY plan_end
    """)
    project_deadlines = rows(cur)

    return {"actions": actions, "tasks": tasks, "milestones": milestones, "project_deadlines": project_deadlines}


# ============ РЕГУЛЯРНАЯ ОТЧЁТНОСТЬ ============

REPORT_KINDS = {
    "weekly": "Недельная справка", "monthly": "Месячная справка",
    "actions": "Отчёт по поручениям", "portfolio": "Отчёт по портфелю",
    "risks_issues": "Риски и проблемы", "results_effects": "Результаты и эффекты",
    "resources_load": "Отчёт по ресурсам и загрузке", "budget_planfact": "Финансовый отчёт (план-факт)",
    "resource_requirements": "Отчёт по ресурсным потребностям",
}


def resources_load_section(cur, include_test_data=False):
    """Данные для отчёта «Ресурсы и загрузка»: фактическая команда, вакансии,
    перегруженные участники — берётся из exec-resources логики напрямую через SQL,
    без обращения к другому backend (снимок должен быть самодостаточен)."""
    tnd = "" if include_test_data else "AND a.is_test_data = false"
    cur.execute(f"""
        SELECT a.id, a.person_id, p.display_name AS person_name, p.position_title,
               a.role_title, rc.title AS role_title_ref, a.project_id, a.initiative_id,
               pr.title AS project_title, ini.title AS initiative_title,
               a.is_external, a.is_vacant, a.plan_load_pct, a.fact_load_pct
        FROM {SCHEMA}.exec_resource_assignment a
        LEFT JOIN {SCHEMA}.exec_person p ON p.id = a.person_id
        LEFT JOIN {SCHEMA}.exec_center_role rc ON rc.id = a.role_id
        LEFT JOIN {SCHEMA}.exec_project pr ON pr.id = a.project_id
        LEFT JOIN {SCHEMA}.exec_initiative ini ON ini.id = a.initiative_id
        WHERE a.archived_at IS NULL {tnd}
        ORDER BY a.project_role, a.created_at
    """)
    assignments = rows(cur)

    tnd2 = "" if include_test_data else "AND is_test_data = false"
    cur.execute(f"""
        SELECT a.person_id, p.display_name, p.position_title,
               SUM(a.plan_load_pct) AS total_load_pct, count(*) AS assignment_count
        FROM {SCHEMA}.exec_resource_assignment a
        JOIN {SCHEMA}.exec_person p ON p.id = a.person_id
        WHERE a.archived_at IS NULL {tnd2} AND a.person_id IS NOT NULL
        GROUP BY a.person_id, p.display_name, p.position_title
        ORDER BY total_load_pct DESC
    """)
    team_load = rows(cur)
    for r in team_load:
        r["total_load_pct"] = float(r["total_load_pct"])
    overloaded = [r for r in team_load if r["total_load_pct"] > 100]

    vacancies = [a for a in assignments if a.get("is_vacant")]

    return {"assignments": assignments, "team_load": team_load, "overloaded": overloaded, "vacancies": vacancies}


def budget_planfact_section(cur, year=None, include_test_data=False):
    """Данные для финансового отчёта: бюджет/факт/обязательства/ожидаемые/прогноз/отклонение
    по каждому проекту плюс сводный итог по портфелю за год."""
    yr = year or datetime.date.today().year
    tnd = "" if include_test_data else "AND is_test_data = false"

    cur.execute(f"""
        SELECT p.id, p.title, p.status,
            COALESCE((SELECT SUM(l.amount_plan) FROM {SCHEMA}.exec_budget_line l
                JOIN {SCHEMA}.exec_budget_version v ON v.id = l.version_id
                WHERE v.project_id = p.id AND v.is_active = true AND v.year = %s), 0) AS budget,
            COALESCE((SELECT SUM(amount) FROM {SCHEMA}.exec_financial_actual
                WHERE project_id = p.id AND EXTRACT(YEAR FROM month) = %s), 0) AS fact,
            COALESCE((SELECT SUM(amount) FROM {SCHEMA}.exec_financial_commitment
                WHERE project_id = p.id AND status = 'active'), 0) -
            COALESCE((SELECT SUM(paid_amount) FROM {SCHEMA}.exec_financial_commitment
                WHERE project_id = p.id AND status = 'active'), 0) AS commitments_open,
            COALESCE((SELECT SUM(amount) FROM {SCHEMA}.exec_financial_expected
                WHERE project_id = p.id AND EXTRACT(YEAR FROM month) = %s), 0) AS expected,
            COALESCE((SELECT SUM(plan_total) FROM {SCHEMA}.exec_fot_plan
                WHERE project_id = p.id AND EXTRACT(YEAR FROM month) = %s), 0) AS fot
        FROM {SCHEMA}.exec_project p
        WHERE p.archived_at IS NULL AND p.is_test_data = false
        ORDER BY p.title
    """, (yr, yr, yr, yr))
    by_project = rows(cur)
    for r in by_project:
        for k in ("budget", "fact", "commitments_open", "expected", "fot"):
            r[k] = float(r[k])
        r["forecast"] = r["fact"] + r["commitments_open"] + r["expected"]
        r["remaining"] = r["budget"] - r["forecast"]
        r["deviation"] = r["forecast"] - r["budget"]

    kpi_fin = {
        "total_budget": sum(r["budget"] for r in by_project),
        "total_fact": sum(r["fact"] for r in by_project),
        "total_commitments_open": sum(r["commitments_open"] for r in by_project),
        "total_expected": sum(r["expected"] for r in by_project),
        "total_fot": sum(r["fot"] for r in by_project),
    }
    kpi_fin["total_forecast"] = kpi_fin["total_fact"] + kpi_fin["total_commitments_open"] + kpi_fin["total_expected"]
    kpi_fin["remaining"] = kpi_fin["total_budget"] - kpi_fin["total_forecast"]
    over_budget = [r for r in by_project if r["budget"] > 0 and r["forecast"] > r["budget"]]

    return {"year": yr, "by_project": by_project, "summary": kpi_fin, "projects_over_budget": over_budget}


def resource_requirements_section(cur, include_test_data=False):
    """Данные для отчёта по ресурсным потребностям: полный список открытых
    потребностей + агрегаты (просрочено / пора искать / без финансирования)."""
    tnd = "" if include_test_data else "AND r.is_test_data = false"
    cur.execute(f"""
        SELECT r.id, r.role_title, rc.title AS role_title_ref, r.project_id, r.initiative_id,
               p.title AS project_title, i.title AS initiative_title,
               r.headcount, r.required_load_pct, r.need_by_date, r.search_start_date,
               r.criticality, r.status, r.estimated_monthly_cost, r.estimated_total_cost,
               r.funding_confirmed,
               (r.need_by_date IS NOT NULL AND r.need_by_date < CURRENT_DATE
                   AND r.status NOT IN ('closed','cancelled')) AS is_overdue
        FROM {SCHEMA}.exec_resource_requirement r
        LEFT JOIN {SCHEMA}.exec_center_role rc ON rc.id = r.role_id
        LEFT JOIN {SCHEMA}.exec_project p ON p.id = r.project_id
        LEFT JOIN {SCHEMA}.exec_initiative i ON i.id = r.initiative_id
        WHERE r.archived_at IS NULL {tnd}
        ORDER BY (r.need_by_date IS NULL), r.need_by_date
    """)
    items = rows(cur)
    dash = requirement_dashboard_light(items)
    return {"items": items, **dash}


def requirement_dashboard_light(items):
    """Агрегаты по уже выбранному списку потребностей (для снимка отчёта —
    без повторных обращений к БД, чтобы payload был согласован с items)."""
    open_statuses = ("draft", "confirmed", "searching", "candidate_identified")
    today = datetime.date.today()
    open_items = [i for i in items if i["status"] in open_statuses]
    overdue = [i for i in open_items if i.get("need_by_date") and i["need_by_date"] < today]
    start_search_now = [i for i in open_items
                         if i.get("search_start_date") and i["search_start_date"] <= today
                         and (not i.get("need_by_date") or i["need_by_date"] >= today)]
    without_funding = [i for i in open_items if not i.get("funding_confirmed")]
    total_unresolved_cost = sum(float(i.get("estimated_total_cost") or 0) for i in open_items)
    return {
        "overdue": overdue, "start_search_now": start_search_now,
        "without_funding": without_funding, "total_unresolved_cost": total_unresolved_cost,
    }


def build_report_payload(cur, report_kind: str, period_from, period_to, project_ids):
    """Собирает данные отчёта строго из текущих таблиц (на момент вызова),
    исключая тестовые/архивные по умолчанию. Результат сериализуется в снимок
    и больше не меняется."""
    proj_filter = ""
    proj_params = []
    if project_ids:
        proj_filter = f" AND project_id = ANY(%s)"
        proj_params = [project_ids]

    data = {"kpi": kpi(cur), "generated_at": datetime.datetime.utcnow().isoformat()}

    if report_kind in ("weekly", "monthly", "actions"):
        cur.execute(f"""
            SELECT id, title, status, priority, due_at, responsible_person_id
            FROM {SCHEMA}.exec_action
            WHERE {TND}
              {"AND due_at BETWEEN %s AND %s" if period_from and period_to else ""}
            ORDER BY due_at NULLS LAST
        """, (period_from, period_to) if period_from and period_to else ())
        data["actions"] = rows(cur)

    if report_kind in ("weekly", "monthly", "portfolio"):
        cur.execute(f"""
            SELECT id, title, status, priority, owner_person_id, plan_start, plan_end, budget_need
            FROM {SCHEMA}.exec_initiative
            WHERE status NOT IN ('closed')
            ORDER BY updated_at DESC
        """)
        data["initiatives"] = rows(cur)
        data["projects"] = portfolio_table(cur, {})
        cur.execute(f"""
            SELECT id, title, status, priority, due_at, project_id
            FROM {SCHEMA}.exec_task WHERE archived_at IS NULL AND {TND}
            {proj_filter}
            ORDER BY (due_at IS NULL), due_at
        """, proj_params)
        data["tasks"] = rows(cur)
        cur.execute(f"""
            SELECT id, title, plan_date, status, project_id, initiative_id
            FROM {SCHEMA}.exec_milestone WHERE {TND}
            {proj_filter}
            ORDER BY plan_date
        """, proj_params)
        data["milestones"] = rows(cur)

    if report_kind in ("weekly", "monthly", "risks_issues"):
        cur.execute(f"""
            SELECT id, description, probability, impact, probability*impact AS risk_score, status, project_id
            FROM {SCHEMA}.exec_risk WHERE {TND} AND status = 'active'
            ORDER BY probability*impact DESC
        """)
        data["risks"] = rows(cur)
        cur.execute(f"""
            SELECT id, title, criticality, status, project_id
            FROM {SCHEMA}.exec_issue WHERE {TND} AND status IN ('open','in_progress','awaiting_decision')
            ORDER BY criticality DESC
        """)
        data["issues"] = rows(cur)

    if report_kind in ("weekly", "monthly", "results_effects"):
        cur.execute(f"""
            SELECT id, title, result_kind, achieved_at, project_id
            FROM {SCHEMA}.exec_result WHERE archived_at IS NULL AND is_test_data = false
            {"AND achieved_at BETWEEN %s AND %s" if period_from and period_to else ""}
            ORDER BY achieved_at DESC NULLS LAST
        """, (period_from, period_to) if period_from and period_to else ())
        data["results"] = rows(cur)
        cur.execute(f"""
            SELECT id, title, metric, baseline_value, plan_value, actual_value, confirmation_status, result_id
            FROM {SCHEMA}.exec_effect WHERE archived_at IS NULL AND {TND}
            ORDER BY updated_at DESC
        """)
        data["effects"] = rows(cur)

    if report_kind == "weekly" and period_from and period_to:
        cur.execute(f"""
            SELECT id, title, achieved_at FROM {SCHEMA}.exec_result
            WHERE archived_at IS NULL AND is_test_data = false
              AND achieved_at BETWEEN %s AND %s
        """, (period_from, period_to))
        data["completed_this_period"] = rows(cur)

    if report_kind in ("weekly", "monthly", "resources_load"):
        res = resources_load_section(cur)
        data["team"] = res["assignments"]
        data["team_load"] = res["team_load"]
        data["overloaded"] = res["overloaded"]
        data["vacancies"] = res["vacancies"]

    if report_kind in ("weekly", "monthly", "budget_planfact"):
        year = None
        if period_from:
            year = (period_from if not isinstance(period_from, str) else datetime.date.fromisoformat(period_from)).year
        fin = budget_planfact_section(cur, year)
        data["budget_by_project"] = fin["by_project"]
        data["budget_summary"] = fin["summary"]
        data["budget_year"] = fin["year"]
        data["projects_over_budget"] = fin["projects_over_budget"]

    if report_kind in ("weekly", "monthly", "resource_requirements"):
        req = resource_requirements_section(cur)
        data["resource_requirements"] = req["items"]
        data["requirements_overdue"] = req["overdue"]
        data["requirements_start_search_now"] = req["start_search_now"]
        data["requirements_without_funding"] = req["without_funding"]
        data["requirements_total_unresolved_cost"] = req["total_unresolved_cost"]

    return data


def create_report_snapshot(cur, body: dict, actor: str):
    report_kind = body.get("report_kind", "weekly")
    if report_kind not in REPORT_KINDS:
        return None, f"Неизвестный тип отчёта: {report_kind}"

    period_from = body.get("period_from") or None
    period_to = body.get("period_to") or None
    project_ids = body.get("project_ids") or None
    version_group = body.get("version_group") or f"{report_kind}_{period_from or 'nodate'}_{period_to or 'nodate'}"
    include_test_data = bool(body.get("include_test_data"))
    is_test = bool(body.get("is_test_data"))

    payload = build_report_payload(cur, report_kind, period_from, period_to, project_ids)
    payload_str = json.dumps(payload, ensure_ascii=False, default=str)
    payload_hash = hashlib.sha256(payload_str.encode("utf-8")).hexdigest()

    params = {
        "report_kind": report_kind, "period_from": period_from, "period_to": period_to,
        "project_ids": project_ids, "sections": body.get("sections"),
        "include_completed": body.get("include_completed", True),
        "include_archived": body.get("include_archived", False),
        "include_test_data": include_test_data,
    }

    cur.execute(
        f"SELECT COALESCE(MAX(version_number), 0) FROM {SCHEMA}.exec_report_snapshot WHERE version_group = %s",
        (version_group,),
    )
    next_version = cur.fetchone()[0] + 1

    title = body.get("title") or f"{REPORT_KINDS[report_kind]} — {version_group} — версия {next_version}"

    cur.execute(
        f"""INSERT INTO {SCHEMA}.exec_report_snapshot
            (title, report_kind, period_from, period_to, payload_json, payload_sha256,
             created_by, is_test_data, version_group, version_number, params_json)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id, created_at""",
        (title, report_kind, period_from, period_to, payload_str, payload_hash,
         actor, is_test, version_group, next_version, json.dumps(params, ensure_ascii=False, default=str)),
    )
    row = cur.fetchone()
    cur.execute(
        f"""INSERT INTO {SCHEMA}.exec_audit_log (entity_type, entity_id, action, actor, after_json)
            VALUES ('report_snapshot', %s, 'create', %s, %s)""",
        (row[0], actor, json.dumps({"version_group": version_group, "version_number": next_version,
                                     "payload_sha256": payload_hash}, ensure_ascii=False)),
    )
    return {"id": row[0], "created_at": row[1], "version_group": version_group,
            "version_number": next_version, "payload_sha256": payload_hash, "title": title}, None


def list_snapshots(cur, report_kind=None, include_test_data=False):
    conds = [] if include_test_data else ["is_test_data = false"]
    params = []
    if report_kind:
        conds.append("report_kind = %s")
        params.append(report_kind)
    where = ("WHERE " + " AND ".join(conds)) if conds else ""
    cur.execute(f"""
        SELECT id, title, report_kind, period_from, period_to, created_by, created_at,
               version_group, version_number, is_test_data
        FROM {SCHEMA}.exec_report_snapshot {where}
        ORDER BY created_at DESC LIMIT 100
    """, params)
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
    item["params"] = json.loads(item.pop("params_json")) if item.get("params_json") else None
    item["integrity_ok"] = (stored_hash is None) or (stored_hash == actual_hash)
    return item


# ============ ЭКСПОРТ ============

def export_html(snapshot: dict) -> str:
    p = snapshot["payload"]
    k = p.get("kpi", {})
    parts = [f"<html><head><meta charset='utf-8'><title>{snapshot['title']}</title>",
             "<style>body{font-family:sans-serif;padding:24px}table{border-collapse:collapse;width:100%;margin-bottom:24px}",
             "td,th{border:1px solid #ccc;padding:6px 10px;text-align:left;font-size:13px}th{background:#f3f3f3}",
             "h1{font-size:20px}h2{font-size:16px;margin-top:28px}</style></head><body>"]
    parts.append(f"<h1>{snapshot['title']}</h1>")
    parts.append(f"<p>Сформирован: {snapshot['created_at']} · Автор: {snapshot['created_by']}</p>")
    if not snapshot.get("integrity_ok", True):
        parts.append("<p style='color:red;font-weight:bold'>ВНИМАНИЕ: целостность снимка нарушена (хеш не совпадает)</p>")

    parts.append("<h2>Показатели</h2><table><tr><th>Показатель</th><th>Значение</th></tr>")
    labels = {"active_actions": "Активные поручения", "overdue_actions": "Просроченные поручения",
              "active_projects": "Активные проекты", "overdue_tasks": "Просроченные задачи",
              "blocked_tasks": "Заблокированные задачи", "milestones_7": "Вехи (7 дн.)",
              "milestones_14": "Вехи (14 дн.)", "milestones_30": "Вехи (30 дн.)",
              "critical_risks": "Критические риски", "open_issues": "Открытые проблемы",
              "pending_decisions": "Требуют решения", "results_pending": "Результаты на подтверждении",
              "effects_pending": "Эффекты на подтверждении", "effects_confirmed": "Подтверждённые эффекты"}
    for key, label in labels.items():
        parts.append(f"<tr><td>{label}</td><td>{k.get(key, '—')}</td></tr>")
    parts.append("</table>")

    def table_section(title, key, cols):
        items = p.get(key) or []
        if not items:
            return
        parts.append(f"<h2>{title}</h2><table><tr>" + "".join(f"<th>{c[1]}</th>" for c in cols) + "</tr>")
        for it in items:
            parts.append("<tr>" + "".join(f"<td>{it.get(c[0], '') or ''}</td>" for c in cols) + "</tr>")
        parts.append("</table>")

    table_section("Поручения", "actions", [("title", "Название"), ("status", "Статус"), ("priority", "Приоритет"), ("due_at", "Срок")])
    table_section("Инициативы", "initiatives", [("title", "Название"), ("status", "Статус"), ("priority", "Приоритет"), ("plan_end", "План завершения")])
    table_section("Проекты", "projects", [("title", "Название"), ("status", "Статус"), ("progress_pct", "Готовность %")])
    table_section("Задачи", "tasks", [("title", "Название"), ("status", "Статус"), ("due_at", "Срок")])
    table_section("Контрольные точки", "milestones", [("title", "Название"), ("plan_date", "Дата"), ("status", "Статус")])
    table_section("Команда", "team", [("person_name", "Участник"), ("role_title_ref", "Роль"), ("project_title", "Проект"), ("plan_load_pct", "Загрузка %")])
    table_section("Перегруженные", "overloaded", [("display_name", "Участник"), ("total_load_pct", "Суммарная загрузка %")])
    table_section("Ресурсные потребности", "resource_requirements", [("role_title_ref", "Роль"), ("project_title", "Проект"), ("need_by_date", "Нужен к"), ("criticality", "Критичность"), ("status", "Статус")])
    table_section("Бюджет по проектам", "budget_by_project", [("title", "Проект"), ("budget", "Бюджет"), ("fact", "Факт"), ("forecast", "Прогноз"), ("deviation", "Отклонение")])
    table_section("Риски", "risks", [("description", "Описание"), ("risk_score", "Оценка"), ("status", "Статус")])
    table_section("Проблемы", "issues", [("title", "Название"), ("criticality", "Критичность"), ("status", "Статус")])
    table_section("Результаты", "results", [("title", "Название"), ("result_kind", "Тип"), ("achieved_at", "Дата")])
    table_section("Эффекты", "effects", [("title", "Название"), ("metric", "Показатель"), ("actual_value", "Факт"), ("confirmation_status", "Статус")])

    parts.append("</body></html>")
    return "".join(parts)


def export_xlsx_b64(snapshot: dict) -> str:
    """XLSX общей управленческой отчётности. Полный комплект из 17 листов
    формируется всегда — если у конкретного вида отчёта раздела в payload нет,
    лист создаётся пустым (с заголовками), а не пропускается, чтобы структура
    файла была предсказуема независимо от report_kind."""
    import xlsxwriter
    buf = io.BytesIO()
    wb = xlsxwriter.Workbook(buf, {"in_memory": True})
    bold = wb.add_format({"bold": True, "bg_color": "#f0f0f0"})
    p = snapshot["payload"]

    ws = wb.add_worksheet("Сводка")
    ws.write_row(0, 0, ["Показатель", "Значение"], bold)
    k = p.get("kpi", {})
    for i, (key, val) in enumerate(k.items(), start=1):
        ws.write_row(i, 0, [key, val])

    def sheet(name, key, cols):
        items = p.get(key) or []
        s = wb.add_worksheet(name[:31])
        s.write_row(0, 0, [c[1] for c in cols], bold)
        for i, it in enumerate(items, start=1):
            s.write_row(i, 0, [str(it.get(c[0], "") or "") for c in cols])

    sheet("Поручения", "actions", [("title", "Название"), ("status", "Статус"), ("priority", "Приоритет"), ("due_at", "Срок")])
    sheet("Инициативы", "initiatives", [("title", "Название"), ("status", "Статус"), ("priority", "Приоритет"), ("plan_start", "План начала"), ("plan_end", "План завершения"), ("budget_need", "Потребность в бюджете")])
    sheet("Проекты", "projects", [("title", "Название"), ("status", "Статус"), ("priority", "Приоритет"), ("progress_pct", "Готовность %"), ("plan_end", "План завершения")])
    sheet("Задачи", "tasks", [("title", "Название"), ("status", "Статус"), ("due_at", "Срок"), ("project_id", "Проект ID")])
    sheet("Контрольные точки", "milestones", [("title", "Название"), ("plan_date", "Дата"), ("status", "Статус"), ("project_id", "Проект ID")])
    sheet("Команда", "team", [("person_name", "Участник"), ("position_title", "Должность"), ("role_title_ref", "Роль"), ("project_title", "Проект"), ("initiative_title", "Инициатива"), ("plan_load_pct", "План загрузки %"), ("fact_load_pct", "Факт загрузки %"), ("is_vacant", "Вакансия")])
    sheet("Загрузка", "team_load", [("display_name", "Участник"), ("position_title", "Должность"), ("total_load_pct", "Суммарная загрузка %"), ("assignment_count", "Кол-во назначений")])
    sheet("Ресурсные потребности", "resource_requirements", [("role_title_ref", "Роль"), ("project_title", "Проект"), ("initiative_title", "Инициатива"), ("headcount", "Численность"), ("need_by_date", "Нужен к"), ("search_start_date", "Начать поиск"), ("criticality", "Критичность"), ("status", "Статус"), ("estimated_total_cost", "Расчётная стоимость"), ("funding_confirmed", "Финансирование подтверждено")])
    sheet("Бюджет", "budget_by_project", [("title", "Проект"), ("status", "Статус"), ("budget", "Бюджет"), ("fot", "ФОТ")])
    sheet("ФОТ", "budget_by_project", [("title", "Проект"), ("fot", "ФОТ план")])
    sheet("План-факт", "budget_by_project", [("title", "Проект"), ("budget", "Бюджет"), ("fact", "Факт"), ("commitments_open", "Обязательства открыто"), ("expected", "Ожидаемые"), ("forecast", "Прогноз"), ("remaining", "Остаток"), ("deviation", "Отклонение")])
    sheet("Риски", "risks", [("description", "Описание"), ("probability", "Вероятность"), ("impact", "Влияние"), ("risk_score", "Оценка"), ("status", "Статус")])
    sheet("Проблемы", "issues", [("title", "Название"), ("criticality", "Критичность"), ("status", "Статус")])
    sheet("Результаты", "results", [("title", "Название"), ("result_kind", "Тип"), ("achieved_at", "Дата")])
    sheet("Эффекты", "effects", [("title", "Название"), ("metric", "Показатель"), ("baseline_value", "База"), ("plan_value", "План"), ("actual_value", "Факт"), ("confirmation_status", "Статус")])

    params_sheet = wb.add_worksheet("Параметры отчёта")
    params_sheet.write_row(0, 0, ["Параметр", "Значение"], bold)
    meta = {"Название": snapshot["title"], "Тип": snapshot["report_kind"],
            "Период с": snapshot.get("period_from"), "Период по": snapshot.get("period_to"),
            "Версия": f"{snapshot.get('version_group')} v{snapshot.get('version_number')}",
            "Автор": snapshot["created_by"], "Сформирован": str(snapshot["created_at"]),
            "SHA-256": snapshot.get("payload_sha256"), "Целостность": snapshot.get("integrity_ok"),
            "Тестовые данные": snapshot.get("is_test_data")}
    for i, (kk, vv) in enumerate(meta.items(), start=1):
        params_sheet.write_row(i, 0, [kk, str(vv)])

    wb.close()
    buf.seek(0)
    return base64.b64encode(buf.read()).decode("ascii")


def handler(event: dict, context) -> dict:
    """Дашборд руководителя и регулярная отчётность. Снимки неизменяемы (версионируются),
    экспорт XLSX/HTML читает содержимое снимка, а не текущие таблицы. AI не используется."""
    if event.get("httpMethod") == "OPTIONS":
        return cors({})

    headers = event.get("headers") or {}
    conn = psycopg2.connect(DB)
    try:
        user = authenticate(conn, headers)
        if not user:
            return cors({"ok": False, "error": {"message": "Не авторизован"}}, 401)

        qs = event.get("queryStringParameters") or {}
        action = qs.get("action", "kpi")
        body = json.loads(event["body"]) if event.get("body") else {}
        cur = conn.cursor()

        if action == "kpi":
            return cors({"ok": True, "data": kpi(cur)})

        if action == "attention":
            return cors({"ok": True, "data": {"items": attention_list(cur)}})

        if action == "portfolio_table":
            filters = {k: qs.get(k) for k in
                       ["project_kind", "status", "priority", "has_overdue", "has_critical_risk"]}
            return cors({"ok": True, "data": {"items": portfolio_table(cur, filters)}})

        if action == "upcoming":
            return cors({"ok": True, "data": upcoming_events(cur)})

        if action == "report_kinds":
            return cors({"ok": True, "data": REPORT_KINDS})

        if action == "create_report":
            snap, err = create_report_snapshot(cur, body, user["email"])
            if err:
                return cors({"ok": False, "error": {"message": err}}, 400)
            conn.commit()
            return cors({"ok": True, "data": snap})

        if action == "reports":
            return cors({"ok": True, "data": {"items": list_snapshots(
                cur, qs.get("report_kind"), qs.get("include_test_data") == "1")}})

        if action == "report":
            sid = as_int(qs.get("id"))
            snap = get_snapshot(cur, sid) if sid else None
            if not snap:
                return cors({"ok": False, "error": {"message": "Отчёт не найден"}}, 404)
            return cors({"ok": True, "data": snap})

        if action == "export_html":
            sid = as_int(qs.get("id"))
            snap = get_snapshot(cur, sid) if sid else None
            if not snap:
                return cors({"ok": False, "error": {"message": "Отчёт не найден"}}, 404)
            if not snap.get("integrity_ok", True):
                return cors({"ok": False, "error": {"message": "Целостность снимка нарушена — экспорт заблокирован"}}, 409)
            html = export_html(snap)
            return {"statusCode": 200, "headers": {
                "Access-Control-Allow-Origin": "*", "Content-Type": "text/html; charset=utf-8",
            }, "body": html}

        if action == "export_xlsx":
            sid = as_int(qs.get("id"))
            snap = get_snapshot(cur, sid) if sid else None
            if not snap:
                return cors({"ok": False, "error": {"message": "Отчёт не найден"}}, 404)
            if not snap.get("integrity_ok", True):
                return cors({"ok": False, "error": {"message": "Целостность снимка нарушена — экспорт заблокирован"}}, 409)
            xlsx_b64 = export_xlsx_b64(snap)
            return cors({"ok": True, "data": {"filename": f"{snap['title']}.xlsx", "content_base64": xlsx_b64}})

        return cors({"ok": False, "error": {"message": "Неизвестное действие"}}, 400)
    finally:
        conn.close()