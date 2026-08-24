import json
import os
import hashlib
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
    out = {}

    cur.execute(f"""
        SELECT i.id, i.code, i.title, i.status, i.stage, i.priority, i.plan_end,
               ow.display_name AS owner_name, mg.display_name AS manager_name
        FROM {SCHEMA}.exec_initiative i
        LEFT JOIN {SCHEMA}.exec_person ow ON ow.id = i.owner_person_id
        LEFT JOIN {SCHEMA}.exec_person mg ON mg.id = i.manager_person_id
        WHERE i.status NOT IN ('closed')
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
        ORDER BY s.next_action_due NULLS LAST
    """)
    out["stakeholder_actions"] = rows(cur)

    cur.execute(f"""
        SELECT d.id, d.question, i.id AS initiative_id, i.title AS initiative_title, d.escalation_level
        FROM {SCHEMA}.exec_decision_instance d
        JOIN {SCHEMA}.exec_initiative i ON i.id = d.initiative_id
        WHERE d.due_at < CURRENT_DATE AND d.status NOT IN ('decided','rejected','deferred')
        ORDER BY d.due_at
    """)
    out["escalations"] = rows(cur)

    cur.execute(f"""
        SELECT dt.title AS type_title, d.question, i.title AS initiative_title, d.id, i.id AS initiative_id
        FROM {SCHEMA}.exec_decision_instance d
        JOIN {SCHEMA}.exec_decision_type dt ON dt.code = d.decision_type_code
        JOIN {SCHEMA}.exec_initiative i ON i.id = d.initiative_id
        WHERE d.status IN ('review','preparing')
        ORDER BY d.due_at NULLS LAST
    """)
    out["group_agenda"] = rows(cur)

    cur.execute(f"SELECT COUNT(*) FROM {SCHEMA}.exec_initiative WHERE status NOT IN ('closed')")
    total_init = cur.fetchone()[0]
    cur.execute(f"SELECT COUNT(*) FROM {SCHEMA}.exec_initiative WHERE owner_person_id IS NULL AND status NOT IN ('closed')")
    no_owner = cur.fetchone()[0]
    cur.execute(f"SELECT COUNT(*) FROM {SCHEMA}.exec_initiative WHERE effect_owner_person_id IS NULL AND status NOT IN ('closed','idea')")
    no_effect = cur.fetchone()[0]
    cur.execute(f"""SELECT COUNT(*) FROM {SCHEMA}.exec_decision_instance
                    WHERE status NOT IN ('decided','rejected','deferred')""")
    open_dec = cur.fetchone()[0]
    cur.execute(f"""SELECT COUNT(*) FROM {SCHEMA}.exec_decision_instance
                    WHERE due_at < CURRENT_DATE AND status NOT IN ('decided','rejected','deferred')""")
    overdue_dec = cur.fetchone()[0]
    cur.execute(f"""SELECT COUNT(*) FROM {SCHEMA}.exec_stakeholder
                    WHERE next_action_due < CURRENT_DATE AND engagement_status <> 'done'""")
    overdue_act = cur.fetchone()[0]
    cur.execute(f"SELECT COUNT(*) FROM {SCHEMA}.exec_stakeholder")
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
            cur.execute(f"""
                SELECT i.*, ow.display_name AS owner_name, mg.display_name AS manager_name,
                       cu.display_name AS curator_name, ef.display_name AS effect_owner_name,
                       (SELECT COUNT(*) FROM {SCHEMA}.exec_stakeholder s WHERE s.initiative_id = i.id) AS stakeholders_count,
                       (SELECT COUNT(*) FROM {SCHEMA}.exec_decision_instance d
                        WHERE d.initiative_id = i.id AND d.status NOT IN ('decided','rejected','deferred')) AS open_decisions
                FROM {SCHEMA}.exec_initiative i
                LEFT JOIN {SCHEMA}.exec_person ow ON ow.id = i.owner_person_id
                LEFT JOIN {SCHEMA}.exec_person mg ON mg.id = i.manager_person_id
                LEFT JOIN {SCHEMA}.exec_person cu ON cu.id = i.curator_person_id
                LEFT JOIN {SCHEMA}.exec_person ef ON ef.id = i.effect_owner_person_id
                ORDER BY i.updated_at DESC
            """)
            return cors({"ok": True, "data": {"items": rows(cur), "dictionaries": load_dictionaries(cur)}})

        if action == "initiative":
            iid = int(qs.get("id", 0))
            cur.execute(f"""
                SELECT i.*, ow.display_name AS owner_name, mg.display_name AS manager_name,
                       cu.display_name AS curator_name, ef.display_name AS effect_owner_name
                FROM {SCHEMA}.exec_initiative i
                LEFT JOIN {SCHEMA}.exec_person ow ON ow.id = i.owner_person_id
                LEFT JOIN {SCHEMA}.exec_person mg ON mg.id = i.manager_person_id
                LEFT JOIN {SCHEMA}.exec_person cu ON cu.id = i.curator_person_id
                LEFT JOIN {SCHEMA}.exec_person ef ON ef.id = i.effect_owner_person_id
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

            # Ближайшая непройденная контрольная точка
            cur.execute(f"""
                SELECT m.id, m.title, m.plan_date, m.status,
                       (m.plan_date - CURRENT_DATE) AS days_left
                FROM {SCHEMA}.exec_milestone m
                WHERE m.initiative_id = %s AND m.status NOT IN ('achieved','cancelled')
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
                       COUNT(*) FILTER (WHERE risk_score >= 10 AND status = 'active') AS high_risks
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

            return cors({"ok": True, "data": {
                "initiative": item[0], "stakeholders": stakeholders,
                "decisions": decisions, "assignments": assignments,
                "next_milestone": next_milestone,
                "issue_stats": issue_stats, "risk_stats": risk_stats,
                "labor": labor, "functions": functions, "action_stats": action_stats,
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
            cur.execute(f"""
                SELECT status, COUNT(*) AS cnt
                FROM {SCHEMA}.exec_initiative WHERE status <> 'closed'
                GROUP BY status
            """)
            by_status = rows(cur)

            cur.execute(f"""
                SELECT budget_status, COUNT(*) AS cnt, SUM(COALESCE(budget_amount,0)) AS amount
                FROM {SCHEMA}.exec_initiative
                WHERE status <> 'closed' AND budget_year IS NOT NULL
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
                FROM {SCHEMA}.exec_initiative
            """)
            flags = rows(cur)[0]

            return cors({"ok": True, "data": {
                "by_status": by_status, "by_budget_status": by_budget_status, "flags": flags,
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
            return cors({"ok": True, "data": {
                "persons": persons, "decision_types": decision_types,
                "bodies": bodies, "initiatives": initiatives,
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
            cur.execute(f"""
                SELECT p.*, (SELECT COUNT(*) FROM {SCHEMA}.exec_stakeholder s WHERE s.person_id = p.id) AS stakeholder_count,
                       (SELECT COUNT(*) FROM {SCHEMA}.exec_role_assignment ra WHERE ra.person_id = p.id) AS role_count
                FROM {SCHEMA}.exec_person p WHERE p.record_state = 'active' ORDER BY p.display_name
            """)
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
                      "budget_materials_note", "budget_due_date", "budget_finance_comment"]
            data = {k: body.get(k) for k in fields if k in body}
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

        return cors({"ok": False, "error": {"message": f"Неизвестное действие: {action}"}}, 400)
    finally:
        conn.close()