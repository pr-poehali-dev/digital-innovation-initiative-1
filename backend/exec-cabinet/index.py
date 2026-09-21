import json
import os
import hashlib
import datetime
import psycopg2
import psycopg2.extras

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
    """Обычная сессия пользователя + список доступа к кабинету."""
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
    """Админ-токен или обычная сессия из списка доступа."""
    token = headers.get("x-admin-token") or headers.get("X-Admin-Token", "")
    email = get_admin(conn, token)
    if email:
        return {"email": email, "role": "head", "can_confirm": True}
    sid = headers.get("x-session-id") or headers.get("X-Session-Id", "")
    return get_cabinet_user(conn, sid)


def rows(cur):
    cols = [d[0] for d in cur.description]
    return [dict(zip(cols, r)) for r in cur.fetchall()]


def load_dictionaries(cur):
    cur.execute(
        f"SELECT type_code, code, title, sort_order, color FROM {SCHEMA}.ref_dictionary_value "
        f"WHERE is_active = true ORDER BY type_code, sort_order"
    )
    out = {}
    for r in rows(cur):
        out.setdefault(r["type_code"], []).append(
            {"code": r["code"], "title": r["title"], "color": r["color"]}
        )
    return out


def diagnostics(cur):
    """Детерминированные проверки полномочий. Без ИИ."""
    issues = []

    cur.execute(f"""
        SELECT i.id, i.title FROM {SCHEMA}.exec_initiative i
        WHERE i.owner_person_id IS NULL AND i.status NOT IN ('closed','done')
    """)
    for r in rows(cur):
        issues.append({"level": "blocking", "code": "E01", "title": "Инициатива без владельца",
                       "detail": r["title"], "initiative_id": r["id"]})

    cur.execute(f"""
        SELECT d.id, d.question, i.id AS init_id, i.title
        FROM {SCHEMA}.exec_decision_instance d
        JOIN {SCHEMA}.exec_initiative i ON i.id = d.initiative_id
        WHERE d.status NOT IN ('decided','rejected','deferred')
          AND NOT EXISTS (
            SELECT 1 FROM {SCHEMA}.exec_decision_participation p
            WHERE p.decision_id = d.id AND p.participation_kind = 'decide'
          )
    """)
    for r in rows(cur):
        issues.append({"level": "blocking", "code": "E02", "title": "Нет принимающего окончательное решение",
                       "detail": r["question"], "initiative_id": r["init_id"], "decision_id": r["id"]})

    cur.execute(f"""
        SELECT d.id, d.question, i.id AS init_id, COUNT(*) AS cnt
        FROM {SCHEMA}.exec_decision_instance d
        JOIN {SCHEMA}.exec_initiative i ON i.id = d.initiative_id
        JOIN {SCHEMA}.exec_decision_participation p ON p.decision_id = d.id AND p.participation_kind = 'decide'
        LEFT JOIN {SCHEMA}.exec_collegial_body b ON b.id = d.decided_by_body_id
        WHERE b.id IS NULL
        GROUP BY d.id, d.question, i.id
        HAVING COUNT(*) > 1
    """)
    for r in rows(cur):
        issues.append({"level": "blocking", "code": "E03",
                       "title": "Несколько принимающих решение без коллегиального порядка",
                       "detail": f'{r["question"]} — участников с правом решения: {r["cnt"]}',
                       "initiative_id": r["init_id"], "decision_id": r["id"]})

    cur.execute(f"""
        SELECT ra.id, rt.title AS role_title, i.id AS init_id, i.title
        FROM {SCHEMA}.exec_role_assignment ra
        JOIN {SCHEMA}.exec_role_template rt ON rt.code = ra.role_code
        JOIN {SCHEMA}.exec_initiative i ON i.id = ra.initiative_id
        WHERE ra.status = 'active' AND ra.person_id IS NULL AND ra.org_unit_id IS NULL
              AND ra.collegial_body_id IS NULL
    """)
    for r in rows(cur):
        issues.append({"level": "blocking", "code": "E04", "title": "Роль назначена, но субъект не указан",
                       "detail": f'{r["role_title"]} — {r["title"]}', "initiative_id": r["init_id"]})

    cur.execute(f"""
        SELECT ra.id, rt.title AS role_title, i.id AS init_id, i.title
        FROM {SCHEMA}.exec_role_assignment ra
        JOIN {SCHEMA}.exec_role_template rt ON rt.code = ra.role_code
        JOIN {SCHEMA}.exec_initiative i ON i.id = ra.initiative_id
        WHERE ra.verification_status IN ('confirmed','approved')
          AND NOT EXISTS (
            SELECT 1 FROM {SCHEMA}.exec_source_usage su
            WHERE su.role_assignment_id = ra.id AND su.usage_type = 'authority_basis'
          )
    """)
    for r in rows(cur):
        issues.append({"level": "blocking", "code": "E05", "title": "Подтверждённое полномочие без основания",
                       "detail": f'{r["role_title"]} — {r["title"]}', "initiative_id": r["init_id"]})

    cur.execute(f"""
        SELECT dep.id, dep.question, i.id AS init_id, pred.question AS pred_question
        FROM {SCHEMA}.exec_decision_dependency dd
        JOIN {SCHEMA}.exec_decision_instance dep ON dep.id = dd.dependent_id
        JOIN {SCHEMA}.exec_decision_instance pred ON pred.id = dd.predecessor_id
        JOIN {SCHEMA}.exec_initiative i ON i.id = dep.initiative_id
        WHERE dd.is_mandatory = true AND dd.condition_met = false
          AND pred.status NOT IN ('decided')
          AND dep.status IN ('review','decided')
    """)
    for r in rows(cur):
        issues.append({"level": "blocking", "code": "E06", "title": "Нарушена последовательность решений",
                       "detail": f'«{r["question"]}» требует сначала «{r["pred_question"]}»',
                       "initiative_id": r["init_id"], "decision_id": r["id"]})

    cur.execute(f"""
        SELECT i.id, i.title FROM {SCHEMA}.exec_initiative i
        WHERE i.effect_owner_person_id IS NULL AND i.status NOT IN ('closed','idea')
    """)
    for r in rows(cur):
        issues.append({"level": "warning", "code": "W01", "title": "Не назначен владелец эффекта",
                       "detail": r["title"], "initiative_id": r["id"]})

    cur.execute(f"""
        SELECT s.id, p.display_name, i.id AS init_id, i.title
        FROM {SCHEMA}.exec_stakeholder s
        JOIN {SCHEMA}.exec_initiative i ON i.id = s.initiative_id
        LEFT JOIN {SCHEMA}.exec_person p ON p.id = s.person_id
        WHERE s.formal_participation >= 4
          AND (s.engagement_goal IS NULL OR s.engagement_goal = '')
    """)
    for r in rows(cur):
        issues.append({"level": "warning", "code": "W02",
                       "title": "Ключевой участник без стратегии взаимодействия",
                       "detail": f'{r["display_name"]} — {r["title"]}',
                       "initiative_id": r["init_id"], "stakeholder_id": r["id"]})

    cur.execute(f"""
        SELECT s.id, p.display_name, i.id AS init_id, s.next_action, s.next_action_due
        FROM {SCHEMA}.exec_stakeholder s
        JOIN {SCHEMA}.exec_initiative i ON i.id = s.initiative_id
        LEFT JOIN {SCHEMA}.exec_person p ON p.id = s.person_id
        WHERE s.next_action_due < CURRENT_DATE AND s.engagement_status <> 'done'
    """)
    for r in rows(cur):
        issues.append({"level": "warning", "code": "W03", "title": "Просрочено действие по взаимодействию",
                       "detail": f'{r["display_name"]}: {r["next_action"]}',
                       "initiative_id": r["init_id"], "stakeholder_id": r["id"]})

    cur.execute(f"""
        SELECT d.id, d.question, i.id AS init_id, d.due_at
        FROM {SCHEMA}.exec_decision_instance d
        JOIN {SCHEMA}.exec_initiative i ON i.id = d.initiative_id
        WHERE d.due_at < CURRENT_DATE AND d.status NOT IN ('decided','rejected','deferred')
    """)
    for r in rows(cur):
        issues.append({"level": "warning", "code": "W04", "title": "Решение просрочено",
                       "detail": r["question"], "initiative_id": r["init_id"], "decision_id": r["id"]})

    cur.execute(f"""
        SELECT s.id, p.display_name, i.id AS init_id
        FROM {SCHEMA}.exec_stakeholder s
        JOIN {SCHEMA}.exec_initiative i ON i.id = s.initiative_id
        LEFT JOIN {SCHEMA}.exec_person p ON p.id = s.person_id
        WHERE s.can_block = true AND s.participation_state IN ('no_data','invite_not_sent')
    """)
    for r in rows(cur):
        issues.append({"level": "warning", "code": "W05",
                       "title": "Участник с правом блокирования не вовлечён",
                       "detail": r["display_name"], "initiative_id": r["init_id"], "stakeholder_id": r["id"]})

    cur.execute(f"""
        SELECT p.display_name, COUNT(*) AS cnt
        FROM {SCHEMA}.exec_decision_participation dp
        JOIN {SCHEMA}.exec_person p ON p.id = dp.person_id
        JOIN {SCHEMA}.exec_decision_instance d ON d.id = dp.decision_id
        WHERE dp.participation_kind IN ('decide','approve')
          AND d.status NOT IN ('decided','rejected','deferred')
        GROUP BY p.display_name HAVING COUNT(*) > 5
    """)
    for r in rows(cur):
        issues.append({"level": "warning", "code": "W06", "title": "Участник перегружен решениями",
                       "detail": f'{r["display_name"]}: {r["cnt"]} открытых решений'})

    cur.execute(f"""
        SELECT i.id, i.title FROM {SCHEMA}.exec_initiative i
        WHERE (i.escalation_level IS NULL OR i.escalation_level = '')
          AND i.status NOT IN ('closed','idea')
    """)
    for r in rows(cur):
        issues.append({"level": "warning", "code": "W07", "title": "Не определён маршрут эскалации",
                       "detail": r["title"], "initiative_id": r["id"]})

    return issues


def focus_data(cur):
    """Итерация 4, раздел 9 ТЗ: пользовательские экраны по умолчанию НЕ должны
    показывать общесистемные числа с тестовыми объектами. Все счётчики и
    списки здесь по умолчанию исключают is_test_data=true — «Мой фокус»
    показывает рабочую картину руководителя, а не смесь с тестовыми
    инициативами/решениями/вехами, созданными для проверки функциональности."""
    out = {}

    cur.execute(f"""
        SELECT i.id, i.code, i.title, i.status, i.stage, i.priority, i.plan_end,
               ow.display_name AS owner_name, mg.display_name AS manager_name
        FROM {SCHEMA}.exec_initiative i
        LEFT JOIN {SCHEMA}.exec_person ow ON ow.id = i.owner_person_id
        LEFT JOIN {SCHEMA}.exec_person mg ON mg.id = i.manager_person_id
        WHERE i.status NOT IN ('closed') AND COALESCE(i.is_test_data, false) = false
        ORDER BY CASE i.priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2
                 WHEN 'medium' THEN 3 ELSE 4 END, i.plan_end NULLS LAST
    """)
    out["initiatives"] = rows(cur)

    cur.execute(f"""
        SELECT d.id, d.question, d.status, d.due_at, d.decision_type_code,
               dt.title AS type_title, i.id AS initiative_id, i.title AS initiative_title,
               (d.due_at < CURRENT_DATE) AS is_overdue
        FROM {SCHEMA}.exec_decision_instance d
        JOIN {SCHEMA}.exec_decision_type dt ON dt.code = d.decision_type_code
        JOIN {SCHEMA}.exec_initiative i ON i.id = d.initiative_id
        WHERE d.status NOT IN ('decided','rejected','deferred')
          AND COALESCE(d.is_test_data, false) = false AND COALESCE(i.is_test_data, false) = false
        ORDER BY d.due_at NULLS LAST
    """)
    out["pending_decisions"] = rows(cur)

    cur.execute(f"""
        SELECT s.id, s.next_action, s.next_action_due, s.engagement_status,
               p.display_name, p.position_title, i.id AS initiative_id, i.title AS initiative_title,
               (s.next_action_due < CURRENT_DATE) AS is_overdue
        FROM {SCHEMA}.exec_stakeholder s
        LEFT JOIN {SCHEMA}.exec_person p ON p.id = s.person_id
        JOIN {SCHEMA}.exec_initiative i ON i.id = s.initiative_id
        WHERE s.next_action IS NOT NULL AND s.engagement_status <> 'done'
          AND COALESCE(s.is_test_data, false) = false AND COALESCE(i.is_test_data, false) = false
        ORDER BY s.next_action_due NULLS LAST
    """)
    out["stakeholder_actions"] = rows(cur)

    cur.execute(f"""
        SELECT d.id, d.question, i.id AS initiative_id, i.title AS initiative_title, d.escalation_level
        FROM {SCHEMA}.exec_decision_instance d
        JOIN {SCHEMA}.exec_initiative i ON i.id = d.initiative_id
        WHERE d.due_at < CURRENT_DATE AND d.status NOT IN ('decided','rejected','deferred')
          AND COALESCE(d.is_test_data, false) = false AND COALESCE(i.is_test_data, false) = false
        ORDER BY d.due_at
    """)
    out["escalations"] = rows(cur)

    cur.execute(f"""
        SELECT dt.title AS type_title, d.question, i.title AS initiative_title, d.id, i.id AS initiative_id
        FROM {SCHEMA}.exec_decision_instance d
        JOIN {SCHEMA}.exec_decision_type dt ON dt.code = d.decision_type_code
        JOIN {SCHEMA}.exec_initiative i ON i.id = d.initiative_id
        WHERE d.status IN ('review','preparing')
          AND COALESCE(d.is_test_data, false) = false AND COALESCE(i.is_test_data, false) = false
        ORDER BY d.due_at NULLS LAST
    """)
    out["group_agenda"] = rows(cur)

    cur.execute(f"""SELECT COUNT(*) FROM {SCHEMA}.exec_initiative
                    WHERE status NOT IN ('closed') AND COALESCE(is_test_data, false) = false""")
    total_init = cur.fetchone()[0]
    cur.execute(f"""SELECT COUNT(*) FROM {SCHEMA}.exec_initiative
                    WHERE owner_person_id IS NULL AND status NOT IN ('closed') AND COALESCE(is_test_data, false) = false""")
    no_owner = cur.fetchone()[0]
    cur.execute(f"""SELECT COUNT(*) FROM {SCHEMA}.exec_initiative
                    WHERE effect_owner_person_id IS NULL AND status NOT IN ('closed','idea') AND COALESCE(is_test_data, false) = false""")
    no_effect = cur.fetchone()[0]
    cur.execute(f"""SELECT COUNT(*) FROM {SCHEMA}.exec_decision_instance
                    WHERE status NOT IN ('decided','rejected','deferred') AND COALESCE(is_test_data, false) = false""")
    open_dec = cur.fetchone()[0]
    cur.execute(f"""SELECT COUNT(*) FROM {SCHEMA}.exec_decision_instance
                    WHERE due_at < CURRENT_DATE AND status NOT IN ('decided','rejected','deferred')
                      AND COALESCE(is_test_data, false) = false""")
    overdue_dec = cur.fetchone()[0]
    cur.execute(f"""SELECT COUNT(*) FROM {SCHEMA}.exec_stakeholder
                    WHERE next_action_due < CURRENT_DATE AND engagement_status <> 'done'
                      AND COALESCE(is_test_data, false) = false""")
    overdue_act = cur.fetchone()[0]
    cur.execute(f"SELECT COUNT(*) FROM {SCHEMA}.exec_stakeholder WHERE COALESCE(is_test_data, false) = false")
    total_sh = cur.fetchone()[0]

    out["metrics"] = {
        "initiatives_total": total_init,
        "initiatives_no_owner": no_owner,
        "initiatives_no_effect_owner": no_effect,
        "decisions_open": open_dec,
        "decisions_overdue": overdue_dec,
        "actions_overdue": overdue_act,
        "stakeholders_total": total_sh,
    }
    return out


# ============ РАБОЧИЙ ЦИКЛ РУКОВОДИТЕЛЯ ============
# «Сегодня» / «Неделя» / «Просрочено» собираются из уже существующих сущностей
# (exec_action, exec_task, exec_milestone, exec_decision_instance,
# exec_resource_requirement, exec_reminder) — ничего не дублируется и не
# копируется, только читается и агрегируется на лету.

ENTITY_TABLE = {
    "action": "exec_action", "task": "exec_task", "project": "exec_project",
    "initiative": "exec_initiative", "milestone": "exec_milestone",
    "decision": "exec_decision_instance", "risk": "exec_risk", "issue": "exec_issue",
    "requirement": "exec_resource_requirement", "document": "exec_source_document",
}


def as_int(v):
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


def get_owner_timezone(cur, actor):
    cur.execute(f"SELECT timezone FROM {SCHEMA}.exec_cabinet_access WHERE LOWER(email) = LOWER(%s) LIMIT 1", (actor,))
    r = cur.fetchone()
    return r[0] if r and r[0] else "Europe/Moscow"


def week_bounds(tz: str, offset_weeks: int = 0):
    """Понедельник-воскресенье текущей недели в часовом поясе владельца
    (по умолчанию Europe/Moscow), без внешних библиотек — через фиксированные
    смещения UTC для двух поддерживаемых поясов; для прочих используется UTC."""
    fixed_offsets = {"Europe/Moscow": 3, "UTC": 0}
    offset_hours = fixed_offsets.get(tz, 3)
    now_local = datetime.datetime.utcnow() + datetime.timedelta(hours=offset_hours)
    today_local = now_local.date() + datetime.timedelta(weeks=offset_weeks)
    monday = today_local - datetime.timedelta(days=today_local.weekday())
    sunday = monday + datetime.timedelta(days=6)
    return monday, sunday, today_local


def entity_title(cur, entity_type, entity_id):
    """Название объекта для отображения в напоминании/плане недели без
    дублирования данных — подтягивается на лету по ссылке."""
    table = ENTITY_TABLE.get(entity_type)
    if not table:
        return None
    title_col = "description" if entity_type in ("risk",) else \
        "question" if entity_type == "decision" else "title"
    try:
        cur.execute(f"SELECT {title_col} FROM {SCHEMA}.{table} WHERE id = %s", (entity_id,))
        r = cur.fetchone()
        return r[0] if r else None
    except psycopg2.Error:
        return None


def reminders_due(cur, include_test_data=False):
    """Наступившие и предстоящие (7 дней) напоминания. Наступление вычисляется
    на лету при каждом вызове — без фонового scheduler и отдельной функции."""
    tnd = "" if include_test_data else "AND is_test_data = false"
    cur.execute(f"""
        SELECT id, title, remind_at, entity_type, entity_id, comment, priority, status, repeat_rule
        FROM {SCHEMA}.exec_reminder
        WHERE status = 'planned' {tnd}
          AND remind_at <= now() + interval '7 days'
        ORDER BY remind_at
    """)
    items = rows(cur)
    for it in items:
        it["is_due"] = it["remind_at"] <= datetime.datetime.utcnow()
    return items


def my_day_v2(cur, actor, tz):
    """Единая агрегация для «Сегодня» / «Неделя» / «Просрочено». Статусы
    исходных объектов нигде не меняются — только читаются."""
    monday, sunday, today = week_bounds(tz)

    cur.execute(f"""
        SELECT a.id, a.title, a.due_at, a.priority, a.status,
               i.title AS initiative_title, a.project_id, p.title AS project_title,
               (CURRENT_DATE - a.due_at) AS days_overdue
        FROM {SCHEMA}.exec_action a
        LEFT JOIN {SCHEMA}.exec_initiative i ON i.id = a.initiative_id
        LEFT JOIN {SCHEMA}.exec_project p ON p.id = a.project_id
        WHERE a.status NOT IN ('done','done_by_executor','accepted_by_head','cancelled')
          AND a.due_at IS NOT NULL AND a.due_at < CURRENT_DATE
          AND COALESCE(a.is_test_data, false) = false
        ORDER BY a.due_at LIMIT 30
    """)
    overdue_actions = rows(cur)

    cur.execute(f"""
        SELECT id, title, due_at, priority, status, project_id,
               (CURRENT_DATE - due_at) AS days_overdue
        FROM {SCHEMA}.exec_task
        WHERE archived_at IS NULL AND is_test_data = false AND status NOT IN ('done','cancelled')
          AND due_at IS NOT NULL AND due_at < CURRENT_DATE
        ORDER BY due_at LIMIT 30
    """)
    overdue_tasks = rows(cur)

    cur.execute(f"""
        SELECT a.id, a.title, a.due_at, a.priority, i.title AS initiative_title, a.project_id
        FROM {SCHEMA}.exec_action a
        LEFT JOIN {SCHEMA}.exec_initiative i ON i.id = a.initiative_id
        WHERE a.status NOT IN ('done','done_by_executor','accepted_by_head','cancelled')
          AND a.due_at = %s AND COALESCE(a.is_test_data, false) = false
    """, (today,))
    today_actions = rows(cur)

    cur.execute(f"""
        SELECT id, title, due_at, priority, project_id
        FROM {SCHEMA}.exec_task
        WHERE archived_at IS NULL AND is_test_data = false AND status NOT IN ('done','cancelled')
          AND due_at = %s
    """, (today,))
    today_tasks = rows(cur)

    cur.execute(f"""
        SELECT id, title, plan_date, initiative_id, project_id
        FROM {SCHEMA}.exec_milestone
        WHERE is_test_data = false AND status NOT IN ('achieved','cancelled') AND plan_date = %s
    """, (today,))
    today_milestones = rows(cur)

    cur.execute(f"""
        SELECT a.id, a.title, a.due_at, a.priority, i.title AS initiative_title, a.project_id
        FROM {SCHEMA}.exec_action a
        LEFT JOIN {SCHEMA}.exec_initiative i ON i.id = a.initiative_id
        WHERE a.status NOT IN ('done','done_by_executor','accepted_by_head','cancelled')
          AND a.due_at BETWEEN %s AND %s AND COALESCE(a.is_test_data, false) = false
        ORDER BY a.due_at
    """, (monday, sunday))
    week_actions = rows(cur)

    cur.execute(f"""
        SELECT id, title, due_at, priority, project_id
        FROM {SCHEMA}.exec_task
        WHERE archived_at IS NULL AND is_test_data = false AND status NOT IN ('done','cancelled')
          AND due_at BETWEEN %s AND %s
        ORDER BY due_at
    """, (monday, sunday))
    week_tasks = rows(cur)

    cur.execute(f"""
        SELECT id, title, plan_date, initiative_id, project_id
        FROM {SCHEMA}.exec_milestone
        WHERE is_test_data = false AND status NOT IN ('achieved','cancelled')
          AND plan_date BETWEEN %s AND %s
        ORDER BY plan_date
    """, (monday, sunday))
    week_milestones = rows(cur)

    cur.execute(f"""
        SELECT id, title, plan_end FROM {SCHEMA}.exec_project
        WHERE archived_at IS NULL AND is_test_data = false AND plan_end BETWEEN %s AND %s
        ORDER BY plan_end
    """, (monday, sunday))
    week_project_deadlines = rows(cur)

    cur.execute(f"""
        SELECT id, question, due_at, status, initiative_id FROM {SCHEMA}.exec_decision_instance
        WHERE status NOT IN ('decided','rejected','deferred') AND COALESCE(is_test_data, false) = false
        ORDER BY due_at NULLS LAST LIMIT 20
    """)
    pending_decisions = rows(cur)

    cur.execute(f"""
        SELECT id, question, due_at, control_result, initiative_id FROM {SCHEMA}.exec_decision_instance
        WHERE status = 'decided' AND due_at IS NOT NULL AND due_at <= CURRENT_DATE
          AND (control_result IS NULL OR control_result = '') AND COALESCE(is_test_data, false) = false
        ORDER BY due_at LIMIT 20
    """)
    decisions_awaiting_control = rows(cur)

    cur.execute(f"""
        SELECT id, description AS title, probability * impact AS risk_score,
               qualitative_level, severity_rank, initiative_id
        FROM {SCHEMA}.exec_risk
        WHERE status = 'active'
          AND (probability * impact >= 15 OR severity_rank >= 4)
          AND COALESCE(is_test_data, false) = false
        ORDER BY COALESCE(probability * impact, severity_rank * 5) DESC LIMIT 10
    """)
    critical_risks = rows(cur)

    cur.execute(f"""
        SELECT id, title, criticality, initiative_id FROM {SCHEMA}.exec_issue
        WHERE status IN ('open','in_progress') AND criticality IN ('high','critical')
          AND COALESCE(is_test_data, false) = false
        ORDER BY criticality DESC LIMIT 10
    """)
    critical_issues = rows(cur)

    cur.execute(f"""
        SELECT r.id, r.role_title, rc.title AS role_title_ref, r.project_id, r.need_by_date, p.title AS project_title
        FROM {SCHEMA}.exec_resource_requirement r
        LEFT JOIN {SCHEMA}.exec_center_role rc ON rc.id = r.role_id
        LEFT JOIN {SCHEMA}.exec_project p ON p.id = r.project_id
        WHERE r.archived_at IS NULL AND r.is_test_data = false
          AND r.status IN ('draft','confirmed','searching','candidate_identified')
          AND r.search_start_date IS NOT NULL AND r.search_start_date <= CURRENT_DATE
          AND (r.need_by_date IS NULL OR r.need_by_date >= CURRENT_DATE)
        ORDER BY r.need_by_date LIMIT 10
    """)
    requirements_to_search = rows(cur)

    reminders = reminders_due(cur)

    active_plan = None
    cur.execute(f"""
        SELECT id, week_start, week_end, title, main_goal, status
        FROM {SCHEMA}.exec_weekly_plan WHERE status = 'active' ORDER BY week_start DESC LIMIT 1
    """)
    ap = rows(cur)
    if ap:
        active_plan = ap[0]

    return {
        "today": str(today), "week_start": str(monday), "week_end": str(sunday), "timezone": tz,
        "overdue": {"actions": overdue_actions, "tasks": overdue_tasks},
        "today_items": {"actions": today_actions, "tasks": today_tasks, "milestones": today_milestones},
        "week_items": {
            "actions": week_actions, "tasks": week_tasks, "milestones": week_milestones,
            "project_deadlines": week_project_deadlines,
        },
        "pending_decisions": pending_decisions,
        "decisions_awaiting_control": decisions_awaiting_control,
        "critical_risks": critical_risks, "critical_issues": critical_issues,
        "requirements_to_search": requirements_to_search,
        "reminders": reminders,
        "active_weekly_plan": active_plan,
    }


def save_reminder(cur, body, actor):
    title = (body.get("title") or "").strip()
    remind_at = body.get("remind_at")
    if not title or not remind_at:
        return None, "Укажите заголовок и дату/время напоминания"
    entity_type = body.get("entity_type") or None
    entity_id = as_int(body.get("entity_id"))
    repeat_rule = body.get("repeat_rule", "none")
    if repeat_rule not in ("none", "daily", "weekly", "monthly"):
        return None, "Недопустимая повторяемость"
    priority = body.get("priority", "normal")
    cur.execute(f"""
        INSERT INTO {SCHEMA}.exec_reminder
            (title, remind_at, entity_type, entity_id, comment, priority, repeat_rule, created_by)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id
    """, (title, remind_at, entity_type, entity_id, body.get("comment"), priority, repeat_rule, actor))
    new_id = cur.fetchone()[0]
    cur.execute(
        f"INSERT INTO {SCHEMA}.exec_audit_log (entity_type, entity_id, action, actor, after_json) "
        f"VALUES ('reminder', %s, 'create', %s, %s)",
        (new_id, actor, json.dumps({"entity_type": entity_type, "entity_id": entity_id, "remind_at": str(remind_at)}, default=str)),
    )
    return new_id, None


def _next_repeat_date(remind_at, rule):
    if rule == "daily":
        return remind_at + datetime.timedelta(days=1)
    if rule == "weekly":
        return remind_at + datetime.timedelta(weeks=1)
    if rule == "monthly":
        month = remind_at.month + 1
        year = remind_at.year + (1 if month > 12 else 0)
        month = month if month <= 12 else 1
        day = min(remind_at.day, 28)
        return remind_at.replace(year=year, month=month, day=day)
    return None


def update_reminder_status(cur, body, actor):
    rid = as_int(body.get("id"))
    new_status = body.get("status")
    if not rid or new_status not in ("done", "snoozed", "cancelled", "planned"):
        return None, "Укажите корректный id и статус"

    cur.execute(f"SELECT * FROM {SCHEMA}.exec_reminder WHERE id = %s", (rid,))
    r = rows(cur)
    if not r:
        return None, "Напоминание не найдено"
    reminder = r[0]

    if new_status == "done":
        # Идемпотентность: если статус уже 'done', повторный вызов (двойной клик,
        # повтор API-запроса) не должен ни менять done_at, ни плодить второе
        # "следующее" напоминание — выходим сразу же с тем же результатом.
        if reminder["status"] == "done":
            return rid, None
        cur.execute(
            f"UPDATE {SCHEMA}.exec_reminder SET status = 'done', done_at = now(), updated_at = now() "
            f"WHERE id = %s AND status <> 'done'",
            (rid,))
        if cur.rowcount == 0:
            # Кто-то другой уже перевёл в 'done' между SELECT и UPDATE — гонка
            # обработана, следующее напоминание для этой гонки уже создано.
            return rid, None
        log_action = "done"
        # Повторяемое напоминание после выполнения переносится на следующий срок —
        # штатным backend-расчётом, без отдельной cloud function/scheduler.
        # UNIQUE INDEX uq_reminder_single_child(parent_reminder_id) гарантирует,
        # что даже при параллельном повторном запросе будет создано не более
        # одного "следующего" напоминания на исходное.
        if reminder["repeat_rule"] != "none":
            next_at = _next_repeat_date(reminder["remind_at"], reminder["repeat_rule"])
            if next_at:
                cur.execute(
                    f"SELECT 1 FROM {SCHEMA}.exec_reminder WHERE parent_reminder_id = %s",
                    (rid,))
                if not cur.fetchone():
                    cur.execute(f"""
                        INSERT INTO {SCHEMA}.exec_reminder
                            (title, remind_at, entity_type, entity_id, comment, priority,
                             repeat_rule, created_by, parent_reminder_id)
                        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
                        ON CONFLICT (parent_reminder_id) WHERE parent_reminder_id IS NOT NULL
                        DO NOTHING
                        RETURNING id
                    """, (reminder["title"], next_at, reminder["entity_type"], reminder["entity_id"],
                          reminder["comment"], reminder["priority"], reminder["repeat_rule"], actor, rid))
    elif new_status == "snoozed":
        snooze_until = body.get("snooze_until")
        if not snooze_until:
            return None, "Укажите дату переноса"
        cur.execute(f"""
            UPDATE {SCHEMA}.exec_reminder
            SET status = 'planned', remind_at = %s, snoozed_at = now(), updated_at = now()
            WHERE id = %s
        """, (snooze_until, rid))
        log_action = "snooze"
    else:
        cur.execute(f"UPDATE {SCHEMA}.exec_reminder SET status = %s, updated_at = now() WHERE id = %s",
                    (new_status, rid))
        log_action = new_status

    cur.execute(
        f"INSERT INTO {SCHEMA}.exec_audit_log (entity_type, entity_id, action, actor) VALUES ('reminder', %s, %s, %s)",
        (rid, log_action, actor),
    )
    return rid, None


# ============ НЕДЕЛЬНОЕ ПЛАНИРОВАНИЕ ============

def get_or_create_weekly_plan(cur, tz, offset_weeks, actor):
    """Единственность плана недели на владельца обеспечена на уровне БД —
    UNIQUE INDEX uq_weekly_plan_owner_week(author, week_start). INSERT ...
    ON CONFLICT DO NOTHING заменяет неатомарную пару SELECT-затем-INSERT:
    повторное нажатие «Создать план» (в т.ч. параллельное) не создаёт вторую
    запись на ту же неделю — INSERT просто ничего не вставит, и мы читаем
    уже существующую строку."""
    monday, sunday, _ = week_bounds(tz, offset_weeks)
    cur.execute(f"""
        INSERT INTO {SCHEMA}.exec_weekly_plan (week_start, week_end, status, author)
        VALUES (%s,%s,'draft',%s)
        ON CONFLICT (author, week_start) DO NOTHING
        RETURNING *
    """, (monday, sunday, actor))
    created_cols = [d[0] for d in cur.description]
    created_row = cur.fetchone()
    if created_row:
        new_row = dict(zip(created_cols, created_row))
        cur.execute(
            f"INSERT INTO {SCHEMA}.exec_audit_log (entity_type, entity_id, action, actor) "
            f"VALUES ('weekly_plan', %s, 'create', %s)",
            (new_row["id"], actor),
        )
        return new_row
    cur.execute(f"""
        SELECT * FROM {SCHEMA}.exec_weekly_plan WHERE author = %s AND week_start = %s
        ORDER BY id DESC LIMIT 1
    """, (actor, monday))
    return rows(cur)[0]


def weekly_plan_detail(cur, plan_id):
    cur.execute(f"SELECT * FROM {SCHEMA}.exec_weekly_plan WHERE id = %s", (plan_id,))
    p = rows(cur)
    if not p:
        return None
    plan = p[0]
    cur.execute(f"""
        SELECT * FROM {SCHEMA}.exec_weekly_plan_item WHERE weekly_plan_id = %s
        ORDER BY sort_order, id
    """, (plan_id,))
    items = rows(cur)
    for it in items:
        it["entity_title"] = entity_title(cur, it["entity_type"], it["entity_id"])
    plan["items"] = items
    return plan


def add_weekly_plan_item(cur, body, actor):
    plan_id = as_int(body.get("weekly_plan_id"))
    entity_type = body.get("entity_type")
    entity_id = as_int(body.get("entity_id"))
    if not plan_id or entity_type not in ENTITY_TABLE or not entity_id:
        return None, "Укажите план, тип и id объекта"

    cur.execute(f"SELECT status FROM {SCHEMA}.exec_weekly_plan WHERE id = %s", (plan_id,))
    p = cur.fetchone()
    if not p:
        return None, "Недельный план не найден"
    if p[0] == "closed":
        return None, "План недели закрыт — нельзя добавлять пункты"

    cur.execute(f"""
        INSERT INTO {SCHEMA}.exec_weekly_plan_item
            (weekly_plan_id, entity_type, entity_id, plan_date, week_priority, expected_result, comment)
        VALUES (%s,%s,%s,%s,%s,%s,%s) RETURNING id
    """, (plan_id, entity_type, entity_id, body.get("plan_date"), body.get("week_priority", "normal"),
          body.get("expected_result"), body.get("comment")))
    new_id = cur.fetchone()[0]
    cur.execute(
        f"INSERT INTO {SCHEMA}.exec_audit_log (entity_type, entity_id, action, actor, after_json) "
        f"VALUES ('weekly_plan_item', %s, 'create', %s, %s)",
        (new_id, actor, json.dumps({"weekly_plan_id": plan_id, "entity_type": entity_type, "entity_id": entity_id})),
    )
    return new_id, None


def set_weekly_item_done(cur, body, actor):
    item_id = as_int(body.get("id"))
    is_done = bool(body.get("is_done"))
    if not item_id:
        return None, "Укажите id пункта плана"
    cur.execute(f"""
        UPDATE {SCHEMA}.exec_weekly_plan_item SET is_done = %s, updated_at = now()
        WHERE id = %s RETURNING id
    """, (is_done, item_id))
    r = cur.fetchone()
    if not r:
        return None, "Пункт плана не найден"
    cur.execute(
        f"INSERT INTO {SCHEMA}.exec_audit_log (entity_type, entity_id, action, actor) VALUES ('weekly_plan_item', %s, %s, %s)",
        (item_id, "mark_done" if is_done else "mark_undone", actor),
    )
    return item_id, None


def carry_over_item(cur, body, actor):
    """Перенос невыполненного пункта на следующую неделю — только по явному
    подтверждению пользователя, не автоматически."""
    item_id = as_int(body.get("item_id"))
    target_plan_id = as_int(body.get("target_weekly_plan_id"))
    reason = body.get("reason")
    if not item_id or not target_plan_id:
        return None, "Укажите пункт и план следующей недели"

    cur.execute(f"SELECT * FROM {SCHEMA}.exec_weekly_plan_item WHERE id = %s", (item_id,))
    src = rows(cur)
    if not src:
        return None, "Исходный пункт не найден"
    src = src[0]

    if src["carry_over_count"] >= 1 and not reason:
        return None, "Повторный перенос требует указания причины"

    cur.execute(f"""
        INSERT INTO {SCHEMA}.exec_weekly_plan_item
            (weekly_plan_id, entity_type, entity_id, week_priority, expected_result,
             carried_over_from_item_id, carry_over_count, comment)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id
    """, (target_plan_id, src["entity_type"], src["entity_id"], src["week_priority"],
          src["expected_result"], item_id, src["carry_over_count"] + 1, reason))
    new_id = cur.fetchone()[0]
    cur.execute(
        f"INSERT INTO {SCHEMA}.exec_audit_log (entity_type, entity_id, action, actor, after_json) "
        f"VALUES ('weekly_plan_item', %s, 'carry_over', %s, %s)",
        (item_id, actor, json.dumps({"target_weekly_plan_id": target_plan_id, "new_item_id": new_id, "reason": reason})),
    )
    return new_id, None


def close_weekly_plan(cur, body, actor):
    """Закрытие плана: только фиксирует итог планирования, статусы исходных
    объектов (поручений/задач/решений и т.д.) НЕ меняются."""
    plan_id = as_int(body.get("id"))
    if not plan_id:
        return None, "Укажите id плана"
    plan = weekly_plan_detail(cur, plan_id)
    if not plan:
        return None, "План не найден"
    if plan["status"] == "closed":
        return None, "План уже закрыт"

    items = plan["items"]
    planned = len(items)
    done = sum(1 for i in items if i["is_done"])
    not_done = planned - done
    carried = sum(1 for i in items if i["carried_over_from_item_id"])

    cur.execute(f"""
        UPDATE {SCHEMA}.exec_weekly_plan SET status = 'closed', closed_at = now(),
            summary_text = %s, updated_at = now()
        WHERE id = %s
    """, (body.get("summary_text"), plan_id))

    payload = {
        "plan": {k: v for k, v in plan.items() if k != "items"},
        "items": items,
        "stats": {"planned": planned, "done": done, "not_done": not_done, "carried_over": carried},
    }
    payload_str = json.dumps(payload, ensure_ascii=False, default=str)
    payload_hash = hashlib.sha256(payload_str.encode("utf-8")).hexdigest()
    version_group = f"weekly_summary_{plan['week_start']}"
    cur.execute(
        f"SELECT COALESCE(MAX(version_number), 0) FROM {SCHEMA}.exec_weekly_summary_snapshot WHERE version_group = %s",
        (version_group,))
    next_version = cur.fetchone()[0] + 1

    cur.execute(f"""
        INSERT INTO {SCHEMA}.exec_weekly_summary_snapshot
            (weekly_plan_id, payload_json, payload_sha256, version_group, version_number, is_test_data, created_by)
        VALUES (%s,%s,%s,%s,%s,%s,%s) RETURNING id, created_at
    """, (plan_id, payload_str, payload_hash, version_group, next_version, bool(body.get("is_test_data")), actor))
    snap = cur.fetchone()

    cur.execute(
        f"INSERT INTO {SCHEMA}.exec_audit_log (entity_type, entity_id, action, actor, after_json) "
        f"VALUES ('weekly_plan', %s, 'close', %s, %s)",
        (plan_id, actor, json.dumps({"snapshot_id": snap[0], "payload_sha256": payload_hash})),
    )
    return {"id": snap[0], "created_at": snap[1], "version_group": version_group,
            "version_number": next_version, "payload_sha256": payload_hash, "stats": payload["stats"]}, None


def get_weekly_summary_snapshot(cur, sid):
    cur.execute(f"SELECT * FROM {SCHEMA}.exec_weekly_summary_snapshot WHERE id = %s", (sid,))
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


def handler(event: dict, context) -> dict:
    """Кабинет руководителя: инициативы, стейкхолдеры, решения, полномочия, диагностика."""
    if event.get("httpMethod") == "OPTIONS":
        return cors({})

    headers = event.get("headers") or {}

    conn = psycopg2.connect(DB)
    try:
        user = authenticate(conn, headers)
        if not user:
            return cors({"ok": False, "error": {"message": "Не авторизован"}}, 401)
        actor = user["email"]

        qs = event.get("queryStringParameters") or {}
        action = qs.get("action", "focus")
        body = json.loads(event["body"]) if event.get("body") else {}
        cur = conn.cursor()

        if action == "focus":
            data = focus_data(cur)
            data["issues"] = diagnostics(cur)
            data["dictionaries"] = load_dictionaries(cur)
            return cors({"ok": True, "data": data})

        if action == "initiatives":
            portfolio_id = qs.get("portfolio_id")
            include_test_data = qs.get("include_test_data") == "1"
            conds = []
            params = []
            if portfolio_id:
                conds.append("i.portfolio_id = %s")
                params.append(int(portfolio_id))
            if not include_test_data:
                conds.append("COALESCE(i.is_test_data, false) = false")
            where = ("WHERE " + " AND ".join(conds)) if conds else ""
            params = tuple(params)
            cur.execute(f"""
                SELECT i.*, ow.display_name AS owner_name, mg.display_name AS manager_name,
                       cu.display_name AS curator_name, ef.display_name AS effect_owner_name,
                       cust.name AS customer_org_unit_name, exec_.name AS executor_org_unit_name,
                       pf.title AS portfolio_title,
                       (SELECT COUNT(*) FROM {SCHEMA}.exec_stakeholder s WHERE s.initiative_id = i.id) AS stakeholders_count,
                       (SELECT COUNT(*) FROM {SCHEMA}.exec_decision_instance d
                        WHERE d.initiative_id = i.id AND d.status NOT IN ('decided','rejected','deferred')) AS open_decisions,
                       (SELECT COUNT(*) FROM {SCHEMA}.exec_initiative_decision_request idr
                        WHERE idr.initiative_id = i.id AND idr.status = 'open') AS open_decision_requests,
                       (SELECT m.title FROM {SCHEMA}.exec_milestone m
                        WHERE m.initiative_id = i.id AND m.status NOT IN ('achieved','cancelled')
                        ORDER BY m.plan_date NULLS LAST LIMIT 1) AS next_milestone_title,
                       (SELECT m.plan_date FROM {SCHEMA}.exec_milestone m
                        WHERE m.initiative_id = i.id AND m.status NOT IN ('achieved','cancelled')
                        ORDER BY m.plan_date NULLS LAST LIMIT 1) AS next_milestone_date,
                       (SELECT r.description FROM {SCHEMA}.exec_risk r
                        WHERE r.initiative_id = i.id AND r.status = 'active'
                        ORDER BY COALESCE(r.risk_score, r.severity_rank * 5) DESC NULLS LAST LIMIT 1) AS top_risk_title,
                       (SELECT r.risk_score FROM {SCHEMA}.exec_risk r
                        WHERE r.initiative_id = i.id AND r.status = 'active'
                        ORDER BY COALESCE(r.risk_score, r.severity_rank * 5) DESC NULLS LAST LIMIT 1) AS top_risk_score
                FROM {SCHEMA}.exec_initiative i
                LEFT JOIN {SCHEMA}.exec_person ow ON ow.id = i.owner_person_id
                LEFT JOIN {SCHEMA}.exec_person mg ON mg.id = i.manager_person_id
                LEFT JOIN {SCHEMA}.exec_person cu ON cu.id = i.curator_person_id
                LEFT JOIN {SCHEMA}.exec_person ef ON ef.id = i.effect_owner_person_id
                LEFT JOIN {SCHEMA}.org_units cust ON cust.id = i.customer_org_unit_id
                LEFT JOIN {SCHEMA}.org_units exec_ ON exec_.id = i.executor_org_unit_id
                LEFT JOIN {SCHEMA}.exec_portfolio pf ON pf.id = i.portfolio_id
                {where}
                ORDER BY i.updated_at DESC
            """, params)
            return cors({"ok": True, "data": {"items": rows(cur), "dictionaries": load_dictionaries(cur)}})

        if action == "portfolios":
            cur.execute(f"""
                SELECT p.*, ou.name AS owner_org_unit_name,
                       (SELECT COUNT(*) FROM {SCHEMA}.exec_initiative i WHERE i.portfolio_id = p.id) AS initiatives_count
                FROM {SCHEMA}.exec_portfolio p
                LEFT JOIN {SCHEMA}.org_units ou ON ou.id = p.owner_org_unit_id
                ORDER BY p.title
            """)
            return cors({"ok": True, "data": {"items": rows(cur)}})

        if action == "org_units":
            portfolio_id = qs.get("portfolio_id")
            cur.execute(f"""
                SELECT id, code, name, type, parent_id, level
                FROM {SCHEMA}.org_units
                WHERE COALESCE(is_archived, false) = false
                ORDER BY level, sort_order, name
            """)
            return cors({"ok": True, "data": {"items": rows(cur)}})

        if action == "decision_requests_registry":
            # Единый реестр вопросов по ВСЕМ инициативам портфеля — для
            # предварительной проверки руководителем перед рассылкой.
            # Ничего не направляется автоматически: все вопросы создаются
            # и остаются в статусе dispatch_status='draft_not_sent', пока
            # пользователь явно не преобразует конкретный вопрос в поручение.
            conds = ["COALESCE(i.is_test_data, false) = false"]
            params: list = []
            if qs.get("question_type"):
                conds.append("idr.question_type = %s")
                params.append(qs["question_type"])
            if qs.get("status"):
                conds.append("idr.status = %s")
                params.append(qs["status"])
            if qs.get("initiative_id"):
                conds.append("idr.initiative_id = %s")
                params.append(int(qs["initiative_id"]))
            where = "WHERE " + " AND ".join(conds)
            cur.execute(f"""
                SELECT idr.id, idr.initiative_id, i.external_code AS initiative_code, i.title AS initiative_title,
                       cust.id AS customer_org_unit_id, cust.name AS customer_org_unit_name,
                       idr.question, idr.question_type, idr.options, idr.recommended_option,
                       idr.priority, idr.due_at, idr.status, idr.dispatch_status,
                       idr.addressee_person_id, ap.display_name AS addressee_name, ap.position_title AS addressee_position,
                       idr.converted_to_action_id,
                       idr.consequence_if_not_decided, idr.source_note, idr.verification_status,
                       idr.created_at, idr.updated_at
                FROM {SCHEMA}.exec_initiative_decision_request idr
                JOIN {SCHEMA}.exec_initiative i ON i.id = idr.initiative_id
                LEFT JOIN {SCHEMA}.org_units cust ON cust.id = i.customer_org_unit_id
                LEFT JOIN {SCHEMA}.exec_person ap ON ap.id = idr.addressee_person_id
                {where}
                ORDER BY i.external_code, idr.question_type, idr.id
            """, params)
            items = rows(cur)
            return cors({"ok": True, "data": {
                "items": items,
                "summary": {
                    "total": len(items),
                    "decision": sum(1 for x in items if x["question_type"] == "decision"),
                    "data_clarification": sum(1 for x in items if x["question_type"] == "data_clarification"),
                    "draft_not_sent": sum(1 for x in items if x["dispatch_status"] == "draft_not_sent"),
                    "converted": sum(1 for x in items if x["dispatch_status"] == "converted"),
                },
            }})

        if action == "convert_decision_request_to_action":
            # Преобразование вопроса в поручение — ТОЛЬКО по явному
            # подтверждению пользователем адресата, срока и ожидаемого
            # результата. Ничего не подставляется автоматически из
            # догадок: если addressee_person_id не передан, поручение
            # создаётся без ответственного (останется видно как пробел).
            #
            # Право доступа: наблюдатель (viewer) не может создавать
            # поручения вообще. Назначить ответственного (responsible_person_id)
            # может только пользователь с can_confirm=true или ролью
            # head/curator — иначе поручение создаётся БЕЗ ответственного
            # с предупреждением, аналогично существующей практике
            # exec-control для незавершённых подтверждений.
            if user["role"] == "viewer":
                return cors({"ok": False, "error": {
                    "message": "Роль «наблюдатель» не может создавать поручения"}}, 403)

            rid = as_int(body.get("decision_request_id"))
            if not rid:
                return cors({"ok": False, "error": {"message": "Не указан вопрос для преобразования"}}, 400)
            # Блокировка от двойного преобразования: SELECT ... FOR UPDATE
            # фиксирует строку до commit, чтобы параллельный повторный вызов
            # не создал второе поручение на тот же вопрос.
            cur.execute(f"SELECT * FROM {SCHEMA}.exec_initiative_decision_request WHERE id = %s FOR UPDATE", (rid,))
            dr = rows(cur)
            if not dr:
                return cors({"ok": False, "error": {"message": "Вопрос не найден"}}, 404)
            dr = dr[0]
            if dr.get("converted_to_action_id"):
                return cors({"ok": False, "error": {"message": "Вопрос уже преобразован в поручение"}}, 400)

            responsible_person_id = as_int(body.get("responsible_person_id"))
            can_assign = bool(user.get("can_confirm")) or user["role"] in ("head", "curator")
            assign_warning = None
            if responsible_person_id and not can_assign:
                assign_warning = ("У вас нет права назначать ответственного. Поручение создано "
                                   "без ответственного — назначение подтвердит уполномоченное лицо.")
                responsible_person_id = None

            due_at = body.get("due_at")
            expected_result = body.get("expected_result") or ""
            if not expected_result.strip():
                return cors({"ok": False, "error": {"message": "Укажите ожидаемый результат поручения"}}, 400)

            cur.execute(f"""
                INSERT INTO {SCHEMA}.exec_action
                    (title, description, initiative_id, responsible_person_id, due_at,
                     expected_result, status, priority, created_by)
                VALUES (%s,%s,%s,%s,%s,%s,'new',%s,%s) RETURNING id
            """, (dr["question"][:500], dr["question"], dr["initiative_id"], responsible_person_id, due_at,
                  expected_result, dr.get("priority"), actor))
            new_action_id = cur.fetchone()[0]

            cur.execute(f"""
                UPDATE {SCHEMA}.exec_initiative_decision_request
                SET converted_to_action_id = %s, dispatch_status = 'converted', updated_at = now()
                WHERE id = %s
            """, (new_action_id, rid))

            cur.execute(
                f"INSERT INTO {SCHEMA}.exec_audit_log (entity_type, entity_id, action, actor, after_json) "
                f"VALUES (%s,%s,%s,%s,%s)",
                ("decision_request", rid, "convert_to_action", actor,
                 json.dumps({"action_id": new_action_id, "responsible_person_id": responsible_person_id, "due_at": due_at}, ensure_ascii=False, default=str)))
            conn.commit()
            return cors({"ok": True, "data": {"action_id": new_action_id}, "warning": assign_warning})

        if action == "initiative":
            iid = int(qs.get("id", 0))
            cur.execute(f"""
                SELECT i.*, ow.display_name AS owner_name, mg.display_name AS manager_name,
                       cu.display_name AS curator_name, ef.display_name AS effect_owner_name,
                       cust.name AS customer_org_unit_name, exec_.name AS executor_org_unit_name,
                       cancb.display_name AS cancelled_by_name,
                       pf.title AS portfolio_title
                FROM {SCHEMA}.exec_initiative i
                LEFT JOIN {SCHEMA}.exec_person ow ON ow.id = i.owner_person_id
                LEFT JOIN {SCHEMA}.exec_person mg ON mg.id = i.manager_person_id
                LEFT JOIN {SCHEMA}.exec_person cu ON cu.id = i.curator_person_id
                LEFT JOIN {SCHEMA}.exec_person ef ON ef.id = i.effect_owner_person_id
                LEFT JOIN {SCHEMA}.exec_person cancb ON cancb.id = i.cancelled_by_person_id
                LEFT JOIN {SCHEMA}.org_units cust ON cust.id = i.customer_org_unit_id
                LEFT JOIN {SCHEMA}.org_units exec_ ON exec_.id = i.executor_org_unit_id
                LEFT JOIN {SCHEMA}.exec_portfolio pf ON pf.id = i.portfolio_id
                WHERE i.id = %s
            """, (iid,))
            item = rows(cur)
            if not item:
                return cors({"ok": False, "error": {"message": "Инициатива не найдена"}}, 404)

            cur.execute(f"""
                SELECT s.*, p.display_name, p.position_title, p.org_name
                FROM {SCHEMA}.exec_stakeholder s
                LEFT JOIN {SCHEMA}.exec_person p ON p.id = s.person_id
                WHERE s.initiative_id = %s ORDER BY s.formal_participation DESC
            """, (iid,))
            stakeholders = rows(cur)

            cur.execute(f"""
                SELECT d.*, dt.title AS type_title, dt.category,
                       b.title AS body_title, p.display_name AS decided_by_name
                FROM {SCHEMA}.exec_decision_instance d
                JOIN {SCHEMA}.exec_decision_type dt ON dt.code = d.decision_type_code
                LEFT JOIN {SCHEMA}.exec_collegial_body b ON b.id = d.decided_by_body_id
                LEFT JOIN {SCHEMA}.exec_person p ON p.id = d.decided_by_person_id
                WHERE d.initiative_id = %s ORDER BY dt.sort_order
            """, (iid,))
            decisions = rows(cur)

            cur.execute(f"""
                SELECT ra.*, rt.title AS role_title, rt.role_kind, p.display_name, p.position_title
                FROM {SCHEMA}.exec_role_assignment ra
                JOIN {SCHEMA}.exec_role_template rt ON rt.code = ra.role_code
                LEFT JOIN {SCHEMA}.exec_person p ON p.id = ra.person_id
                WHERE ra.initiative_id = %s ORDER BY rt.sort_order
            """, (iid,))
            assignments = rows(cur)

            # Ближайшая непройденная контрольная точка (условные сценарии,
            # ожидающие решения руководителя, не считаются частью действующего плана).
            cur.execute(f"""
                SELECT m.id, m.title, m.plan_date, m.status,
                       (m.plan_date - CURRENT_DATE) AS days_left
                FROM {SCHEMA}.exec_milestone m
                WHERE m.initiative_id = %s AND m.status NOT IN ('achieved','cancelled')
                  AND COALESCE(m.is_conditional_scenario, false) = false
                ORDER BY m.plan_date NULLS LAST LIMIT 1
            """, (iid,))
            next_milestone = rows(cur)
            next_milestone = next_milestone[0] if next_milestone else None

            # Риски и проблемы инициативы (сводно, без полной детализации control)
            cur.execute(f"""
                SELECT COUNT(*) FILTER (WHERE status NOT IN ('resolved','closed','irrelevant')) AS open_issues,
                       COUNT(*) FILTER (WHERE is_blocking AND COALESCE(block_status,'active')='active') AS blocking_issues
                FROM {SCHEMA}.exec_issue WHERE initiative_id = %s
            """, (iid,))
            issue_stats = rows(cur)[0]
            cur.execute(f"""
                SELECT COUNT(*) FILTER (WHERE status = 'active') AS open_risks,
                       COUNT(*) FILTER (
                           WHERE status = 'active'
                             AND (risk_score >= 10 OR severity_rank >= 3)
                       ) AS high_risks
                FROM {SCHEMA}.exec_risk WHERE initiative_id = %s
            """, (iid,))
            risk_stats = rows(cur)[0]

            # Плановые/фактические трудозатраты через план(ы), привязанные к инициативе
            cur.execute(f"""
                SELECT COALESCE(SUM(a.plan_hours), 0) AS plan_hours,
                       COALESCE((SELECT SUM(t.hours) FROM {SCHEMA}.exec_time_entry t
                                  JOIN {SCHEMA}.exec_plan_step s2 ON s2.id = t.step_id
                                  JOIN {SCHEMA}.exec_plan p2 ON p2.id = s2.plan_id
                                 WHERE p2.initiative_id = %s), 0) AS fact_hours,
                       COUNT(DISTINCT s.id) FILTER (WHERE s.status NOT IN ('done','cancelled')) AS open_steps,
                       COUNT(DISTINCT s.id) FILTER (WHERE s.status NOT IN ('done','cancelled')
                           AND s.due_date < CURRENT_DATE) AS overdue_steps
                FROM {SCHEMA}.exec_plan p
                LEFT JOIN {SCHEMA}.exec_plan_step s ON s.plan_id = p.id AND s.status <> 'cancelled'
                LEFT JOIN {SCHEMA}.exec_plan_assignee a ON a.step_id = s.id
                WHERE p.initiative_id = %s
            """, (iid, iid))
            labor = rows(cur)[0]

            # Функции Центра, связанные с инициативой
            cur.execute(f"""
                SELECT f.id, f.title, f.code, f.criticality
                FROM {SCHEMA}.exec_function_initiative fi
                JOIN {SCHEMA}.exec_center_function f ON f.id = fi.function_id
                WHERE fi.initiative_id = %s
                ORDER BY f.sort_order
            """, (iid,))
            functions = rows(cur)

            # Открытые поручения по инициативе (в т.ч. через issue/risk)
            cur.execute(f"""
                SELECT COUNT(*) FILTER (WHERE a.status NOT IN
                    ('done','done_by_executor','accepted_by_head','cancelled')) AS open_actions,
                       COUNT(*) FILTER (WHERE a.due_at < CURRENT_DATE AND a.status NOT IN
                    ('done','done_by_executor','accepted_by_head','cancelled')) AS overdue_actions
                FROM {SCHEMA}.exec_action a
                LEFT JOIN {SCHEMA}.exec_issue s3 ON s3.id = a.issue_id
                LEFT JOIN {SCHEMA}.exec_risk r3 ON r3.id = a.risk_id
                WHERE a.initiative_id = %s OR s3.initiative_id = %s OR r3.initiative_id = %s
            """, (iid, iid, iid))
            action_stats = rows(cur)[0]

            # Вопросы, требующие управленческого решения по инициативе
            cur.execute(f"""
                SELECT idr.*, pp.display_name AS prepared_by_name, dp.display_name AS decided_by_name
                FROM {SCHEMA}.exec_initiative_decision_request idr
                LEFT JOIN {SCHEMA}.exec_person pp ON pp.id = idr.prepared_by_person_id
                LEFT JOIN {SCHEMA}.exec_person dp ON dp.id = idr.decided_by_person_id
                WHERE idr.initiative_id = %s
                ORDER BY idr.status = 'open' DESC, idr.due_at NULLS LAST, idr.id DESC
            """, (iid,))
            decision_requests = rows(cur)

            # План исполнения: рабочий проект-контейнер инициативы (если заведён) —
            # для краткой сводки в «Обзоре» и перехода на вкладку «План и Гант».
            cur.execute(f"""
                SELECT p.id, p.title, p.progress_pct, p.plan_start, p.plan_end, p.forecast_end,
                       (SELECT COUNT(*) FROM {SCHEMA}.exec_task t
                        WHERE t.project_id = p.id AND t.archived_at IS NULL
                          AND t.status NOT IN ('done', 'cancelled')
                          AND t.due_at IS NOT NULL AND t.due_at < CURRENT_DATE) AS overdue_task_count,
                       (SELECT COUNT(*) FROM {SCHEMA}.exec_milestone m
                        WHERE m.project_id = p.id AND m.status NOT IN ('achieved', 'cancelled')
                          AND m.plan_date IS NOT NULL AND m.plan_date < CURRENT_DATE) AS overdue_milestone_count
                FROM {SCHEMA}.exec_project p
                WHERE p.initiative_id = %s AND p.archived_at IS NULL
                ORDER BY p.id LIMIT 1
            """, (iid,))
            plan_project_rows = rows(cur)
            plan_project = plan_project_rows[0] if plan_project_rows else None

            # Обратная ссылка из контура «Процессное управление» (read-only —
            # тот контур сам решает, когда связывать проблему/изменение с этой
            # инициативой; здесь мы только показываем уже подтверждённые связи).
            process_links = []
            try:
                cur.execute(f"""
                    SELECT n.id AS process_node_id, n.name AS process_name,
                           iss.id AS issue_id, iss.title AS issue_title,
                           l.expected_effect_note
                    FROM {SCHEMA}.exec_process_issue_initiative_link l
                    JOIN {SCHEMA}.exec_process_issue iss ON iss.id = l.issue_id
                    JOIN {SCHEMA}.exec_process_node n ON n.id = iss.process_node_id
                    WHERE l.initiative_id = %s AND COALESCE(iss.is_test_data, false) = false
                """, (iid,))
                issue_links = rows(cur)
                cur.execute(f"""
                    SELECT im.id AS improvement_id, im.description, im.expected_effect_note, im.effect_type,
                           n.id AS process_node_id, n.name AS process_name
                    FROM {SCHEMA}.exec_process_improvement im
                    JOIN {SCHEMA}.exec_process_diagram d ON d.id = im.to_be_diagram_id
                    JOIN {SCHEMA}.exec_process_node n ON n.id = d.process_node_id
                    WHERE im.initiative_id = %s AND COALESCE(im.is_test_data, false) = false
                      AND COALESCE(d.is_test_data, false) = false
                """, (iid,))
                improvement_links = rows(cur)
                process_links = {"issues": issue_links, "improvements": improvement_links}
            except Exception:
                # Контур процессного управления может быть ещё не развёрнут в этой
                # среде — обратная ссылка тогда просто не показывается.
                process_links = {"issues": [], "improvements": []}

            return cors({"ok": True, "data": {
                "initiative": item[0], "stakeholders": stakeholders,
                "decisions": decisions, "assignments": assignments,
                "next_milestone": next_milestone,
                "issue_stats": issue_stats, "risk_stats": risk_stats,
                "labor": labor, "functions": functions, "action_stats": action_stats,
                "decision_requests": decision_requests, "plan_project": plan_project,
                "process_links": process_links,
                "dictionaries": load_dictionaries(cur),
            }})

        if action == "stakeholders":
            cur.execute(f"""
                SELECT s.*, p.display_name, p.position_title, p.org_name,
                       i.title AS initiative_title, i.code AS initiative_code,
                       r.display_name AS responsible_name,
                       (s.next_action_due < CURRENT_DATE AND s.engagement_status <> 'done') AS is_overdue
                FROM {SCHEMA}.exec_stakeholder s
                LEFT JOIN {SCHEMA}.exec_person p ON p.id = s.person_id
                LEFT JOIN {SCHEMA}.exec_person r ON r.id = s.responsible_person_id
                JOIN {SCHEMA}.exec_initiative i ON i.id = s.initiative_id
                ORDER BY s.formal_participation DESC, p.display_name
            """)
            return cors({"ok": True, "data": {"items": rows(cur), "dictionaries": load_dictionaries(cur)}})

        if action == "decisions":
            cur.execute(f"""
                SELECT d.*, dt.title AS type_title, dt.category, dt.sort_order,
                       i.title AS initiative_title, i.code AS initiative_code,
                       b.title AS body_title, p.display_name AS decided_by_name,
                       (d.due_at < CURRENT_DATE AND d.status NOT IN ('decided','rejected','deferred')) AS is_overdue
                FROM {SCHEMA}.exec_decision_instance d
                JOIN {SCHEMA}.exec_decision_type dt ON dt.code = d.decision_type_code
                JOIN {SCHEMA}.exec_initiative i ON i.id = d.initiative_id
                LEFT JOIN {SCHEMA}.exec_collegial_body b ON b.id = d.decided_by_body_id
                LEFT JOIN {SCHEMA}.exec_person p ON p.id = d.decided_by_person_id
                ORDER BY dt.sort_order
            """)
            items = rows(cur)

            cur.execute(f"""
                SELECT dp.*, rt.title AS role_title, p.display_name
                FROM {SCHEMA}.exec_decision_participation dp
                LEFT JOIN {SCHEMA}.exec_role_template rt ON rt.code = dp.role_code
                LEFT JOIN {SCHEMA}.exec_person p ON p.id = dp.person_id
                ORDER BY dp.sequence_order
            """)
            participation = rows(cur)

            cur.execute(f"""
                SELECT dd.*, pred.question AS predecessor_question, dep.question AS dependent_question
                FROM {SCHEMA}.exec_decision_dependency dd
                JOIN {SCHEMA}.exec_decision_instance pred ON pred.id = dd.predecessor_id
                JOIN {SCHEMA}.exec_decision_instance dep ON dep.id = dd.dependent_id
            """)
            dependencies = rows(cur)

            return cors({"ok": True, "data": {
                "items": items, "participation": participation, "dependencies": dependencies,
                "dictionaries": load_dictionaries(cur),
            }})

        if action == "authority_matrix":
            cur.execute(f"SELECT code, title, category, stage, sort_order FROM {SCHEMA}.exec_decision_type ORDER BY sort_order")
            types = rows(cur)
            cur.execute(f"SELECT code, title, role_kind, sort_order FROM {SCHEMA}.exec_role_template ORDER BY sort_order")
            roles = rows(cur)
            cur.execute(f"""
                SELECT dp.decision_type_code, dp.role_code, dp.participation_kind,
                       d.initiative_id, COUNT(*) AS cnt
                FROM {SCHEMA}.exec_decision_participation dp
                JOIN {SCHEMA}.exec_decision_instance d ON d.id = dp.decision_id
                WHERE dp.role_code IS NOT NULL
                GROUP BY dp.decision_type_code, dp.role_code, dp.participation_kind, d.initiative_id
            """)
            cells = rows(cur)
            return cors({"ok": True, "data": {
                "types": types, "roles": roles, "cells": cells,
                "dictionaries": load_dictionaries(cur),
            }})

        if action == "roles":
            cur.execute(f"SELECT * FROM {SCHEMA}.exec_role_template ORDER BY sort_order")
            roles = rows(cur)
            cur.execute(f"""
                SELECT ra.*, rt.title AS role_title, p.display_name, i.title AS initiative_title
                FROM {SCHEMA}.exec_role_assignment ra
                JOIN {SCHEMA}.exec_role_template rt ON rt.code = ra.role_code
                LEFT JOIN {SCHEMA}.exec_person p ON p.id = ra.person_id
                JOIN {SCHEMA}.exec_initiative i ON i.id = ra.initiative_id
                ORDER BY rt.sort_order
            """)
            return cors({"ok": True, "data": {"roles": roles, "assignments": rows(cur)}})

        if action == "diagnostics":
            return cors({"ok": True, "data": {"issues": diagnostics(cur)}})

        if action == "portfolio_summary":
            # Сводка портфеля: статусы, готовность к бюджету, отклонения.
            # Итерация 4, раздел 9 ТЗ: по умолчанию — БЕЗ тестовых данных
            # (это ломало пользовательский экран: 16 инициатив вместо 7
            # рабочих). Фильтр по конкретному портфелю (portfolio_id=N) —
            # явный опт-ин параметром запроса, а не поведение по умолчанию,
            # чтобы не менять состав уже существующей страницы «Портфель
            # инициатив» (она управляет ВСЕМИ нетестовыми инициативами, а не
            # только портфелем Блока ВК). Для «обзора Блока ВК» отдельный
            # экран передаёт portfolio_id явно.
            include_test_data = qs.get("include_test_data") == "1"
            portfolio_id = as_int(qs.get("portfolio_id"))

            conds = ["status <> 'closed'"]
            if not include_test_data:
                conds.append("COALESCE(is_test_data, false) = false")
            if portfolio_id is not None:
                conds.append(f"portfolio_id = {int(portfolio_id)}")
            where_active = " AND ".join(conds)

            base_conds = []
            if not include_test_data:
                base_conds.append("COALESCE(is_test_data, false) = false")
            if portfolio_id is not None:
                base_conds.append(f"portfolio_id = {int(portfolio_id)}")
            where_base = (" WHERE " + " AND ".join(base_conds)) if base_conds else ""

            cur.execute(f"""
                SELECT status, COUNT(*) AS cnt
                FROM {SCHEMA}.exec_initiative WHERE {where_active}
                GROUP BY status
            """)
            by_status = rows(cur)

            cur.execute(f"""
                SELECT budget_status, COUNT(*) AS cnt, SUM(COALESCE(budget_amount,0)) AS amount
                FROM {SCHEMA}.exec_initiative
                WHERE {where_active} AND budget_year IS NOT NULL
                GROUP BY budget_status
            """)
            by_budget_status = rows(cur)

            cur.execute(f"""
                SELECT
                  COUNT(*) FILTER (WHERE status NOT IN ('closed')) AS active_total,
                  COUNT(*) FILTER (WHERE owner_person_id IS NULL AND status NOT IN ('closed')) AS no_owner,
                  COUNT(*) FILTER (WHERE status NOT IN ('closed') AND NOT EXISTS (
                      SELECT 1 FROM {SCHEMA}.exec_milestone m
                      WHERE m.initiative_id = exec_initiative.id
                        AND m.status NOT IN ('achieved','cancelled'))) AS no_next_step,
                  COUNT(*) FILTER (WHERE status NOT IN ('closed') AND EXISTS (
                      SELECT 1 FROM {SCHEMA}.exec_milestone m
                      WHERE m.initiative_id = exec_initiative.id
                        AND m.plan_date < CURRENT_DATE AND m.status NOT IN ('achieved','cancelled'))) AS overdue_milestone,
                  COUNT(*) FILTER (WHERE status NOT IN ('closed') AND EXISTS (
                      SELECT 1 FROM {SCHEMA}.exec_decision_instance d
                      WHERE d.initiative_id = exec_initiative.id
                        AND d.status NOT IN ('decided','rejected','deferred'))) AS needs_decision,
                  COUNT(*) FILTER (WHERE budget_year IS NOT NULL
                      AND budget_status NOT IN ('approved','not_required')) AS budget_not_ready
                FROM {SCHEMA}.exec_initiative{where_base}
            """)
            flags = rows(cur)[0]

            return cors({"ok": True, "data": {
                "by_status": by_status, "by_budget_status": by_budget_status, "flags": flags,
                "scope": {"portfolio_id": portfolio_id, "include_test_data": include_test_data},
            }})

        if action == "my_day":
            # Личный рабочий стол руководителя: собирает готовые данные из уже
            # существующих выборок, ничего не пересчитывает заново.
            cur.execute(f"""
                SELECT p.id, p.display_name FROM {SCHEMA}.exec_cabinet_access a
                JOIN {SCHEMA}.exec_person p ON p.id = a.person_id
                WHERE LOWER(a.email) = LOWER(%s) LIMIT 1
            """, (actor,))
            me = rows(cur)
            me_person_id = me[0]["id"] if me else None

            cur.execute(f"""
                SELECT i.id, i.title, i.status, i.priority, i.updated_at, ow.display_name AS owner_name
                FROM {SCHEMA}.exec_initiative i
                LEFT JOIN {SCHEMA}.exec_person ow ON ow.id = i.owner_person_id
                WHERE i.status NOT IN ('closed')
                ORDER BY i.updated_at DESC LIMIT 8
            """)
            recent_initiatives = rows(cur)

            my_actions, incoming_actions = [], []
            if me_person_id:
                cur.execute(f"""
                    SELECT a.id, a.title, a.description, a.due_at, a.status, a.priority,
                           i.title AS initiative_title,
                           (a.due_at < CURRENT_DATE AND a.status NOT IN
                               ('done','done_by_executor','accepted_by_head','cancelled')) AS is_overdue
                    FROM {SCHEMA}.exec_action a
                    LEFT JOIN {SCHEMA}.exec_issue s ON s.id = a.issue_id
                    LEFT JOIN {SCHEMA}.exec_risk r ON r.id = a.risk_id
                    LEFT JOIN {SCHEMA}.exec_initiative i ON i.id = COALESCE(a.initiative_id, s.initiative_id, r.initiative_id)
                    WHERE a.responsible_person_id = %s
                      AND a.status NOT IN ('done','accepted_by_head','cancelled')
                    ORDER BY a.due_at NULLS LAST LIMIT 20
                """, (me_person_id,))
                my_actions = rows(cur)

                cur.execute(f"""
                    SELECT a.id, a.title, a.description, a.responsible_person_id,
                           p.display_name AS responsible_name, a.status, a.due_at
                    FROM {SCHEMA}.exec_action a
                    LEFT JOIN {SCHEMA}.exec_person p ON p.id = a.responsible_person_id
                    WHERE a.author_person_id = %s AND a.status = 'done_by_executor'
                    ORDER BY a.due_at NULLS LAST
                """, (me_person_id,))
                incoming_actions = rows(cur)

            cur.execute(f"""
                SELECT id, title, meeting_at, location FROM {SCHEMA}.exec_meeting
                WHERE meeting_at BETWEEN now() AND now() + interval '7 days' AND status = 'planned'
                ORDER BY meeting_at LIMIT 5
            """)
            upcoming_meetings = rows(cur)

            return cors({"ok": True, "data": {
                "me_person_id": me_person_id,
                "recent_initiatives": recent_initiatives,
                "my_actions": my_actions,
                "incoming_actions": incoming_actions,
                "upcoming_meetings": upcoming_meetings,
            }})

        if action == "refs":
            cur.execute(f"""
                SELECT id, display_name, position_title, org_name
                FROM {SCHEMA}.exec_person WHERE record_state = 'active' ORDER BY display_name
            """)
            persons = rows(cur)
            cur.execute(f"""
                SELECT code, title, category, stage, sort_order
                FROM {SCHEMA}.exec_decision_type ORDER BY sort_order
            """)
            decision_types = rows(cur)
            cur.execute(f"""
                SELECT id, title FROM {SCHEMA}.exec_collegial_body
                WHERE status = 'active' ORDER BY title
            """)
            bodies = rows(cur)
            cur.execute(f"SELECT id, code, title FROM {SCHEMA}.exec_initiative ORDER BY title")
            initiatives = rows(cur)
            cur.execute(f"""
                SELECT id, code, name, type, parent_id, level
                FROM {SCHEMA}.org_units WHERE COALESCE(is_archived, false) = false
                ORDER BY level, sort_order, name
            """)
            org_units = rows(cur)
            cur.execute(f"SELECT id, code, title FROM {SCHEMA}.exec_portfolio WHERE status = 'active' ORDER BY title")
            portfolios = rows(cur)
            return cors({"ok": True, "data": {
                "persons": persons, "decision_types": decision_types,
                "bodies": bodies, "initiatives": initiatives,
                "org_units": org_units, "portfolios": portfolios,
                "dictionaries": load_dictionaries(cur),
            }})

        if action == "create_person":
            cur.execute(
                f"INSERT INTO {SCHEMA}.exec_person (display_name, position_title, org_name, is_anonymized) "
                f"VALUES (%s,%s,%s,true) RETURNING id",
                (body.get("display_name"), body.get("position_title"), body.get("org_name")))
            new_id = cur.fetchone()[0]
            cur.execute(
                f"INSERT INTO {SCHEMA}.exec_audit_log (entity_type, entity_id, action, actor, after_json) "
                f"VALUES (%s,%s,%s,%s,%s)",
                ("person", new_id, "create", actor, json.dumps(body, ensure_ascii=False, default=str)))
            conn.commit()
            return cors({"ok": True, "data": {"id": new_id}})

        if action == "persons":
            # org_unit_id — фильтр по подразделению для подбора адресата
            # (например, при преобразовании вопроса в поручение). Без
            # него возвращается весь активный справочник — используется
            # для общих списков персон, а не для назначения ответственных
            # по конкретному подразделению.
            org_unit_id = qs.get("org_unit_id")
            conds = ["p.record_state = 'active'"]
            params: list = []
            if org_unit_id:
                conds.append("p.org_unit_id = %s")
                params.append(int(org_unit_id))
            cur.execute(f"""
                SELECT p.*, (SELECT COUNT(*) FROM {SCHEMA}.exec_stakeholder s WHERE s.person_id = p.id) AS stakeholder_count,
                       (SELECT COUNT(*) FROM {SCHEMA}.exec_role_assignment ra WHERE ra.person_id = p.id) AS role_count
                FROM {SCHEMA}.exec_person p WHERE {" AND ".join(conds)} ORDER BY p.display_name
            """, params)
            return cors({"ok": True, "data": {"items": rows(cur)}})

        if action == "save_initiative":
            iid = body.get("id")
            fields = ["title", "summary", "problem", "goal", "expected_result", "status", "stage",
                      "priority", "scale", "realization_form", "solution_title", "solution_type",
                      "effect_description", "effect_metric", "effect_baseline", "effect_target",
                      "effect_actual", "budget_need", "budget_source", "escalation_level",
                      "owner_person_id", "manager_person_id", "curator_person_id", "effect_owner_person_id",
                      "plan_start", "plan_end",
                      "budget_year", "budget_kind", "budget_source_prev", "budget_source_new",
                      "budget_amount", "budget_status", "budget_owner_person_id",
                      "budget_materials_note", "budget_due_date", "budget_finance_comment",
                      "portfolio_id", "customer_org_unit_id", "executor_org_unit_id", "external_code",
                      "cancel_reason", "cancel_basis", "cancelled_at", "cancelled_by_person_id",
                      "source_note", "source_ref", "data_as_of"]
            data = {k: body.get(k) for k in fields if k in body}
            # Прекращение инициативы обязательно с основанием — не только смена статуса.
            if data.get("status") == "cancelled" and not (data.get("cancel_reason") or "").strip():
                return cors({"ok": False, "error": {"message": "Для статуса «Прекращена» нужно указать причину прекращения"}}, 400)
            if iid:
                sets = ", ".join(f"{k} = %s" for k in data)
                cur.execute(
                    f"UPDATE {SCHEMA}.exec_initiative SET {sets}, updated_at = now() WHERE id = %s RETURNING id",
                    list(data.values()) + [iid])
            else:
                cols = ", ".join(data.keys())
                ph = ", ".join(["%s"] * len(data))
                cur.execute(f"INSERT INTO {SCHEMA}.exec_initiative ({cols}) VALUES ({ph}) RETURNING id",
                            list(data.values()))
            new_id = cur.fetchone()[0]
            cur.execute(
                f"INSERT INTO {SCHEMA}.exec_audit_log (entity_type, entity_id, action, actor, after_json) "
                f"VALUES (%s,%s,%s,%s,%s)",
                ("initiative", new_id, "update" if iid else "create", actor, json.dumps(data, ensure_ascii=False, default=str)))
            conn.commit()
            return cors({"ok": True, "data": {"id": new_id}})

        if action == "save_stakeholder":
            sid = body.get("id")
            fields = ["initiative_id", "person_id", "role_in_initiative", "formal_participation",
                      "can_decide", "must_approve", "can_block", "controls_resource",
                      "participation_state", "position_on_topic", "confirmed_requirements",
                      "stated_remarks", "support_conditions", "open_questions", "noninvolvement_risk",
                      "engagement_goal", "key_messages", "contact_format", "contact_frequency",
                      "responsible_person_id", "next_action", "next_action_due", "engagement_status"]
            data = {k: body.get(k) for k in fields if k in body}
            if sid:
                sets = ", ".join(f"{k} = %s" for k in data)
                cur.execute(
                    f"UPDATE {SCHEMA}.exec_stakeholder SET {sets}, updated_at = now() WHERE id = %s RETURNING id",
                    list(data.values()) + [sid])
            else:
                cols = ", ".join(data.keys())
                ph = ", ".join(["%s"] * len(data))
                cur.execute(f"INSERT INTO {SCHEMA}.exec_stakeholder ({cols}) VALUES ({ph}) RETURNING id",
                            list(data.values()))
            new_id = cur.fetchone()[0]
            cur.execute(
                f"INSERT INTO {SCHEMA}.exec_audit_log (entity_type, entity_id, action, actor, after_json) "
                f"VALUES (%s,%s,%s,%s,%s)",
                ("stakeholder", new_id, "update" if sid else "create", actor, json.dumps(data, ensure_ascii=False, default=str)))
            conn.commit()
            return cors({"ok": True, "data": {"id": new_id}})

        if action == "save_decision":
            did = body.get("id")
            fields = ["initiative_id", "decision_type_code", "question", "basis", "raised_at", "due_at",
                      "status", "proposed_option", "materials", "final_decision",
                      "decided_by_person_id", "decided_by_body_id", "decided_at", "result_document",
                      "execution_status", "control_result", "escalation_level"]
            data = {k: body.get(k) for k in fields if k in body}
            if did:
                sets = ", ".join(f"{k} = %s" for k in data)
                cur.execute(
                    f"UPDATE {SCHEMA}.exec_decision_instance SET {sets}, updated_at = now() WHERE id = %s RETURNING id",
                    list(data.values()) + [did])
            else:
                cols = ", ".join(data.keys())
                ph = ", ".join(["%s"] * len(data))
                cur.execute(f"INSERT INTO {SCHEMA}.exec_decision_instance ({cols}) VALUES ({ph}) RETURNING id",
                            list(data.values()))
            new_id = cur.fetchone()[0]
            cur.execute(
                f"INSERT INTO {SCHEMA}.exec_audit_log (entity_type, entity_id, action, actor, after_json) "
                f"VALUES (%s,%s,%s,%s,%s)",
                ("decision", new_id, "update" if did else "create", actor, json.dumps(data, ensure_ascii=False, default=str)))
            conn.commit()
            return cors({"ok": True, "data": {"id": new_id}})

        if action == "save_decision_request":
            rid = body.get("id")
            fields = ["initiative_id", "question", "options", "recommended_option", "due_at",
                      "consequence_if_not_decided", "prepared_by_person_id", "status",
                      "decided_option", "decided_at", "decided_by_person_id", "source_note",
                      "question_type", "priority", "addressee_person_id", "dispatch_status"]
            data = {k: body.get(k) for k in fields if k in body}
            if rid:
                sets = ", ".join(f"{k} = %s" for k in data)
                cur.execute(
                    f"UPDATE {SCHEMA}.exec_initiative_decision_request SET {sets}, updated_at = now() "
                    f"WHERE id = %s RETURNING id", list(data.values()) + [rid])
            else:
                data["created_by"] = actor
                cols = ", ".join(data.keys())
                ph = ", ".join(["%s"] * len(data))
                cur.execute(
                    f"INSERT INTO {SCHEMA}.exec_initiative_decision_request ({cols}) VALUES ({ph}) RETURNING id",
                    list(data.values()))
            new_id = cur.fetchone()[0]
            cur.execute(
                f"INSERT INTO {SCHEMA}.exec_audit_log (entity_type, entity_id, action, actor, after_json) "
                f"VALUES (%s,%s,%s,%s,%s)",
                ("decision_request", new_id, "update" if rid else "create", actor,
                 json.dumps(data, ensure_ascii=False, default=str)))
            conn.commit()
            return cors({"ok": True, "data": {"id": new_id}})

        if action == "save_assignment":
            aid = body.get("id")
            fields = ["initiative_id", "role_code", "person_id", "date_from", "date_to",
                      "authority_limits", "deputy_person_id", "status"]
            data = {k: body.get(k) for k in fields if k in body}
            if aid:
                sets = ", ".join(f"{k} = %s" for k in data)
                cur.execute(
                    f"UPDATE {SCHEMA}.exec_role_assignment SET {sets}, updated_at = now() "
                    f"WHERE id = %s RETURNING id", list(data.values()) + [aid])
            else:
                data.setdefault("created_by", actor)
                cols = ", ".join(data.keys())
                ph = ", ".join(["%s"] * len(data))
                cur.execute(f"INSERT INTO {SCHEMA}.exec_role_assignment ({cols}) VALUES ({ph}) RETURNING id",
                            list(data.values()))
            new_id = cur.fetchone()[0]
            cur.execute(
                f"INSERT INTO {SCHEMA}.exec_audit_log (entity_type, entity_id, action, actor, after_json) "
                f"VALUES (%s,%s,%s,%s,%s)",
                ("role_assignment", new_id, "update" if aid else "create", actor,
                 json.dumps(data, ensure_ascii=False, default=str)))
            conn.commit()
            return cors({"ok": True, "data": {"id": new_id}})

        if action == "set_verification":
            entity = body.get("entity")
            eid = body.get("id")
            status = body.get("verification_status")
            allowed = {
                "initiative": "exec_initiative",
                "stakeholder": "exec_stakeholder",
                "decision": "exec_decision_instance",
                "role_assignment": "exec_role_assignment",
            }
            if entity not in allowed or not eid or not status:
                return cors({"ok": False, "error": {"message": "Неверные параметры"}}, 400)
            table = allowed[entity]
            extra, params = "", [status]
            if status == "confirmed":
                extra = ", confirmed_by = %s, confirmed_at = now()" if entity == "role_assignment" else ""
                if extra:
                    params.append(actor)
            params.append(eid)
            cur.execute(
                f"UPDATE {SCHEMA}.{table} SET verification_status = %s{extra} WHERE id = %s RETURNING id",
                params)
            row = cur.fetchone()
            if not row:
                return cors({"ok": False, "error": {"message": "Запись не найдена"}}, 404)
            cur.execute(
                f"INSERT INTO {SCHEMA}.exec_audit_log (entity_type, entity_id, action, actor, after_json, reason) "
                f"VALUES (%s,%s,%s,%s,%s,%s)",
                (entity, eid, "set_verification", actor,
                 json.dumps({"verification_status": status}, ensure_ascii=False), body.get("reason")))
            conn.commit()
            return cors({"ok": True, "data": {"id": row[0], "verification_status": status}})

        if action == "audit_log":
            limit = int(qs.get("limit", 200))
            entity = qs.get("entity", "")
            where = ""
            params = []
            if entity:
                where = "WHERE l.entity_type = %s"
                params.append(entity)
            params.append(limit)
            cur.execute(f"""
                SELECT l.id, l.entity_type, l.entity_id, l.action, l.actor,
                       l.after_json, l.reason, l.created_at,
                       COALESCE(i.title, s_i.title, d_i.title, ra_i.title, p.display_name,
                                ms.title, iss.title, LEFT(rsk.description, 120),
                                LEFT(act.description, 120), esc_sub.subj) AS subject_title,
                       COALESCE(sp.display_name, dp.question, ms_i.title, iss_i.title,
                                rsk_i.title) AS subject_detail
                FROM {SCHEMA}.exec_audit_log l
                LEFT JOIN {SCHEMA}.exec_initiative i
                       ON l.entity_type = 'initiative' AND i.id = l.entity_id
                LEFT JOIN {SCHEMA}.exec_stakeholder s
                       ON l.entity_type = 'stakeholder' AND s.id = l.entity_id
                LEFT JOIN {SCHEMA}.exec_initiative s_i ON s_i.id = s.initiative_id
                LEFT JOIN {SCHEMA}.exec_person sp ON sp.id = s.person_id
                LEFT JOIN {SCHEMA}.exec_decision_instance d
                       ON l.entity_type = 'decision' AND d.id = l.entity_id
                LEFT JOIN {SCHEMA}.exec_initiative d_i ON d_i.id = d.initiative_id
                LEFT JOIN {SCHEMA}.exec_decision_instance dp ON dp.id = d.id
                LEFT JOIN {SCHEMA}.exec_role_assignment ra
                       ON l.entity_type = 'role_assignment' AND ra.id = l.entity_id
                LEFT JOIN {SCHEMA}.exec_initiative ra_i ON ra_i.id = ra.initiative_id
                LEFT JOIN {SCHEMA}.exec_person p
                       ON l.entity_type = 'person' AND p.id = l.entity_id
                LEFT JOIN {SCHEMA}.exec_milestone ms
                       ON l.entity_type = 'milestone' AND ms.id = l.entity_id
                LEFT JOIN {SCHEMA}.exec_initiative ms_i ON ms_i.id = ms.initiative_id
                LEFT JOIN {SCHEMA}.exec_issue iss
                       ON l.entity_type = 'issue' AND iss.id = l.entity_id
                LEFT JOIN {SCHEMA}.exec_initiative iss_i ON iss_i.id = iss.initiative_id
                LEFT JOIN {SCHEMA}.exec_risk rsk
                       ON l.entity_type = 'risk' AND rsk.id = l.entity_id
                LEFT JOIN {SCHEMA}.exec_initiative rsk_i ON rsk_i.id = rsk.initiative_id
                LEFT JOIN {SCHEMA}.exec_action act
                       ON l.entity_type = 'action' AND act.id = l.entity_id
                LEFT JOIN LATERAL (
                    SELECT COALESCE(ei.title, LEFT(er.description, 120)) AS subj
                    FROM {SCHEMA}.exec_escalation e
                    LEFT JOIN {SCHEMA}.exec_issue ei ON ei.id = e.issue_id
                    LEFT JOIN {SCHEMA}.exec_risk er ON er.id = e.risk_id
                    WHERE l.entity_type = 'escalation' AND e.id = l.entity_id
                ) esc_sub ON true
                {where}
                ORDER BY l.created_at DESC LIMIT %s
            """, params)
            items = rows(cur)

            cur.execute(f"""
                SELECT entity_type, COUNT(*) AS cnt FROM {SCHEMA}.exec_audit_log
                GROUP BY entity_type ORDER BY cnt DESC
            """)
            by_entity = rows(cur)

            cur.execute(f"SELECT COUNT(*) FROM {SCHEMA}.exec_audit_log")
            total = cur.fetchone()[0]
            cur.execute(f"""
                SELECT COUNT(*) FROM {SCHEMA}.exec_audit_log
                WHERE created_at >= CURRENT_DATE
            """)
            today = cur.fetchone()[0]
            cur.execute(f"SELECT COUNT(DISTINCT actor) FROM {SCHEMA}.exec_audit_log")
            actors = cur.fetchone()[0]

            return cors({"ok": True, "data": {
                "items": items,
                "by_entity": by_entity,
                "metrics": {"total": total, "today": today, "actors": actors},
            }})

        # ============ РАБОЧИЙ ЦИКЛ РУКОВОДИТЕЛЯ ============

        if action == "my_day_v2":
            tz = get_owner_timezone(cur, actor)
            return cors({"ok": True, "data": my_day_v2(cur, actor, tz)})

        if action == "reminders":
            itd = qs.get("include_test_data") == "1"
            return cors({"ok": True, "data": {"items": reminders_due(cur, itd)}})

        if action == "save_reminder":
            rid, err = save_reminder(cur, body, actor)
            if err:
                return cors({"ok": False, "error": {"message": err}}, 400)
            conn.commit()
            return cors({"ok": True, "data": {"id": rid}})

        if action == "update_reminder_status":
            rid, err = update_reminder_status(cur, body, actor)
            if err:
                return cors({"ok": False, "error": {"message": err}}, 400)
            conn.commit()
            return cors({"ok": True, "data": {"id": rid}})

        if action == "weekly_plan_current":
            tz = get_owner_timezone(cur, actor)
            offset = as_int(qs.get("offset")) or 0
            plan = get_or_create_weekly_plan(cur, tz, offset, actor)
            conn.commit()
            detail = weekly_plan_detail(cur, plan["id"])
            return cors({"ok": True, "data": detail})

        if action == "weekly_plan":
            pid = as_int(qs.get("id"))
            if not pid:
                return cors({"ok": False, "error": {"message": "Не указан id плана"}}, 400)
            detail = weekly_plan_detail(cur, pid)
            if not detail:
                return cors({"ok": False, "error": {"message": "План не найден"}}, 404)
            return cors({"ok": True, "data": detail})

        if action == "weekly_plans":
            cur.execute(f"""
                SELECT * FROM {SCHEMA}.exec_weekly_plan WHERE is_test_data = false
                ORDER BY week_start DESC LIMIT 20
            """)
            return cors({"ok": True, "data": {"items": rows(cur)}})

        if action == "add_weekly_item":
            iid, err = add_weekly_plan_item(cur, body, actor)
            if err:
                return cors({"ok": False, "error": {"message": err}}, 400)
            conn.commit()
            return cors({"ok": True, "data": {"id": iid}})

        if action == "set_weekly_item_done":
            iid, err = set_weekly_item_done(cur, body, actor)
            if err:
                return cors({"ok": False, "error": {"message": err}}, 400)
            conn.commit()
            return cors({"ok": True, "data": {"id": iid}})

        if action == "carry_over_item":
            iid, err = carry_over_item(cur, body, actor)
            if err:
                return cors({"ok": False, "error": {"message": err}}, 400)
            conn.commit()
            return cors({"ok": True, "data": {"id": iid}})

        if action == "close_weekly_plan":
            result, err = close_weekly_plan(cur, body, actor)
            if err:
                return cors({"ok": False, "error": {"message": err}}, 400)
            conn.commit()
            return cors({"ok": True, "data": result})

        if action == "weekly_summary_snapshot":
            sid = as_int(qs.get("id"))
            snap = get_weekly_summary_snapshot(cur, sid) if sid else None
            if not snap:
                return cors({"ok": False, "error": {"message": "Снимок не найден"}}, 404)
            return cors({"ok": True, "data": snap})

        return cors({"ok": False, "error": {"message": f"Неизвестное действие: {action}"}}, 400)
    finally:
        conn.close()