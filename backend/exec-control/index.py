import json
import os
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
            "Access-Control-Allow-Headers": "Content-Type, X-Admin-Token",
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
    """Обычная сессия пользователя + проверка списка доступа к кабинету."""
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
    """Два способа входа: админ-токен или обычная сессия из списка доступа."""
    token = headers.get("x-admin-token") or headers.get("X-Admin-Token", "")
    email = get_admin(conn, token)
    if email:
        return {"email": email, "role": "head", "can_confirm": True}
    sid = headers.get("x-session-id") or headers.get("X-Session-Id", "")
    return get_cabinet_user(conn, sid)


def rows(cur):
    cols = [d[0] for d in cur.description]
    return [dict(zip(cols, r)) for r in cur.fetchall()]


RISK_LEVEL_SQL = """
    CASE WHEN r.risk_score >= 16 THEN 'critical'
         WHEN r.risk_score >= 10 THEN 'high'
         WHEN r.risk_score >= 5 THEN 'medium'
         ELSE 'low' END
"""

OVERDUE_MS = "(m.plan_date < CURRENT_DATE AND m.status NOT IN ('achieved','cancelled'))"


def validate(kind: str, d: dict, existing: dict = None):
    """Понятные проверки до обращения к БД. БД остаётся последним рубежом."""
    cur_val = lambda k: d.get(k, (existing or {}).get(k))

    if kind == "milestone":
        if cur_val("status") == "achieved":
            if not cur_val("achievement_evidence"):
                return "Нельзя отметить достижение без подтверждающего результата"
            if not cur_val("fact_date"):
                return "Нельзя отметить достижение без фактической даты"
            if not cur_val("confirmed_by_person_id"):
                return "Нельзя отметить достижение без подтверждающего лица"

    if kind == "issue":
        if cur_val("status") in ("resolved", "closed"):
            missing = []
            if not cur_val("resolution_criteria"):
                missing.append("критерий устранения")
            if not cur_val("resolution_result"):
                missing.append("результат устранения")
            if not cur_val("resolved_at"):
                missing.append("дату устранения")
            if not cur_val("resolved_confirmed_by_person_id"):
                missing.append("подтверждающее лицо")
            if missing:
                return "Для устранения проблемы укажите: " + ", ".join(missing)
        if cur_val("is_blocking"):
            fields = {
                "block_what": "что заблокировано",
                "block_since": "дату начала блокировки",
                "block_who_can_lift": "кто может снять",
                "block_requirements": "что требуется для снятия",
                "block_escalation_level": "уровень эскалации",
                "block_deadline": "крайний срок",
            }
            missing = [v for k, v in fields.items() if not cur_val(k)]
            if missing:
                return "Для блокировки укажите: " + ", ".join(missing)

    if kind == "risk":
        if cur_val("status") == "materialized" and not cur_val("materialized_issue_id"):
            return "Риск со статусом «реализовался» требует связи с возникшей проблемой"
        p, i = cur_val("probability"), cur_val("impact")
        if p is not None and not (1 <= int(p) <= 5):
            return "Вероятность указывается от 1 до 5"
        if i is not None and not (1 <= int(i) <= 5):
            return "Влияние указывается от 1 до 5"
        if cur_val("is_blocking"):
            fields = ["block_what", "block_since", "block_who_can_lift",
                      "block_requirements", "block_escalation_level", "block_deadline"]
            if any(not cur_val(k) for k in fields):
                return "При блокировке обязательны все шесть полей блока"

    if kind == "action":
        has_issue = cur_val("issue_id") is not None
        has_risk = cur_val("risk_id") is not None
        if has_issue == has_risk:
            return "Действие относится ровно к одной проблеме или одному риску"
        if cur_val("status") == "done":
            if not cur_val("result"):
                return "Выполненное действие требует указания результата"
            if not cur_val("fact_date"):
                return "Выполненное действие требует фактической даты завершения"

    if kind == "escalation":
        has_issue = cur_val("issue_id") is not None
        has_risk = cur_val("risk_id") is not None
        if has_issue == has_risk:
            return "Эскалация относится ровно к одной проблеме или одному риску"
        if not cur_val("level_code"):
            return "Укажите уровень эскалации"
        if not cur_val("passed_at"):
            return "Укажите дату передачи"

    return None


def fetch_existing(cur, table, eid):
    cur.execute(f"SELECT * FROM {SCHEMA}.{table} WHERE id = %s", (eid,))
    r = rows(cur)
    return r[0] if r else None


def log(cur, actor, entity, eid, action, payload=None, reason=None):
    cur.execute(
        f"INSERT INTO {SCHEMA}.exec_audit_log (entity_type, entity_id, action, actor, after_json, reason) "
        f"VALUES (%s,%s,%s,%s,%s,%s)",
        (entity, eid, action, actor,
         json.dumps(payload, ensure_ascii=False, default=str) if payload else None, reason))


def milestones(cur, initiative_id=None, include_closed=True):
    conds, params = [], []
    if initiative_id:
        conds.append("m.initiative_id = %s")
        params.append(initiative_id)
    if not include_closed:
        conds.append("m.status NOT IN ('achieved','cancelled')")
    where = ("WHERE " + " AND ".join(conds)) if conds else ""
    cur.execute(f"""
        SELECT m.*, {OVERDUE_MS} AS is_overdue,
               i.title AS initiative_title, i.code AS initiative_code,
               p.display_name AS responsible_name,
               c.display_name AS confirmed_by_name,
               dep.title AS depends_on_title,
               d.question AS decision_question,
               (m.plan_date - CURRENT_DATE) AS days_left
        FROM {SCHEMA}.exec_milestone m
        JOIN {SCHEMA}.exec_initiative i ON i.id = m.initiative_id
        LEFT JOIN {SCHEMA}.exec_person p ON p.id = m.responsible_person_id
        LEFT JOIN {SCHEMA}.exec_person c ON c.id = m.confirmed_by_person_id
        LEFT JOIN {SCHEMA}.exec_milestone dep ON dep.id = m.depends_on_milestone_id
        LEFT JOIN {SCHEMA}.exec_decision_instance d ON d.id = m.decision_id
        {where}
        ORDER BY m.plan_date NULLS LAST, m.id
    """, params)
    return rows(cur)


def issues(cur, initiative_id=None, include_closed=True):
    conds, params = [], []
    if initiative_id:
        conds.append("s.initiative_id = %s")
        params.append(initiative_id)
    if not include_closed:
        conds.append("s.status NOT IN ('resolved','closed','irrelevant')")
    where = ("WHERE " + " AND ".join(conds)) if conds else ""
    cur.execute(f"""
        SELECT s.*, i.title AS initiative_title, i.code AS initiative_code,
               ow.display_name AS owner_name, re.display_name AS responsible_name,
               cf.display_name AS resolved_confirmed_by_name,
               (s.due_at < CURRENT_DATE AND s.status NOT IN ('resolved','closed','irrelevant')) AS is_overdue,
               (s.is_blocking AND COALESCE(s.block_status,'active') = 'active') AS block_active,
               (SELECT COUNT(*) FROM {SCHEMA}.exec_action a WHERE a.issue_id = s.id) AS actions_count,
               (SELECT COUNT(*) FROM {SCHEMA}.exec_escalation e WHERE e.issue_id = s.id) AS escalations_count
        FROM {SCHEMA}.exec_issue s
        JOIN {SCHEMA}.exec_initiative i ON i.id = s.initiative_id
        LEFT JOIN {SCHEMA}.exec_person ow ON ow.id = s.owner_person_id
        LEFT JOIN {SCHEMA}.exec_person re ON re.id = s.responsible_person_id
        LEFT JOIN {SCHEMA}.exec_person cf ON cf.id = s.resolved_confirmed_by_person_id
        {where}
        ORDER BY CASE s.criticality WHEN 'critical' THEN 1 WHEN 'high' THEN 2
                 WHEN 'medium' THEN 3 ELSE 4 END, s.due_at NULLS LAST
    """, params)
    return rows(cur)


def risks(cur, initiative_id=None, include_closed=True):
    conds, params = [], []
    if initiative_id:
        conds.append("r.initiative_id = %s")
        params.append(initiative_id)
    if not include_closed:
        conds.append("r.status NOT IN ('closed','irrelevant')")
    where = ("WHERE " + " AND ".join(conds)) if conds else ""
    cur.execute(f"""
        SELECT r.*, {RISK_LEVEL_SQL} AS risk_level,
               i.title AS initiative_title, i.code AS initiative_code,
               ow.display_name AS owner_name, asr.display_name AS assessed_by_name,
               mi.title AS materialized_issue_title,
               (r.next_review_at < CURRENT_DATE AND r.status = 'active') AS review_overdue,
               (r.is_blocking AND COALESCE(r.block_status,'active') = 'active') AS block_active,
               (SELECT COUNT(*) FROM {SCHEMA}.exec_action a WHERE a.risk_id = r.id) AS actions_count
        FROM {SCHEMA}.exec_risk r
        JOIN {SCHEMA}.exec_initiative i ON i.id = r.initiative_id
        LEFT JOIN {SCHEMA}.exec_person ow ON ow.id = r.owner_person_id
        LEFT JOIN {SCHEMA}.exec_person asr ON asr.id = r.assessed_by_person_id
        LEFT JOIN {SCHEMA}.exec_issue mi ON mi.id = r.materialized_issue_id
        {where}
        ORDER BY r.risk_score DESC, r.id
    """, params)
    return rows(cur)


def actions(cur):
    cur.execute(f"""
        SELECT a.*, p.display_name AS responsible_name,
               cf.display_name AS result_confirmed_by_name,
               s.title AS issue_title, r.description AS risk_description,
               d.question AS decision_question,
               (a.due_at < CURRENT_DATE AND a.status NOT IN ('done','cancelled')) AS is_overdue
        FROM {SCHEMA}.exec_action a
        LEFT JOIN {SCHEMA}.exec_person p ON p.id = a.responsible_person_id
        LEFT JOIN {SCHEMA}.exec_person cf ON cf.id = a.result_confirmed_by_person_id
        LEFT JOIN {SCHEMA}.exec_issue s ON s.id = a.issue_id
        LEFT JOIN {SCHEMA}.exec_risk r ON r.id = a.risk_id
        LEFT JOIN {SCHEMA}.exec_decision_instance d ON d.id = a.decision_id
        ORDER BY a.due_at NULLS LAST
    """)
    return rows(cur)


def escalations(cur):
    cur.execute(f"""
        SELECT e.*, pb.display_name AS prepared_by_name,
               pt.display_name AS passed_to_name, b.title AS body_title,
               s.title AS issue_title, r.description AS risk_description,
               d.question AS decision_question,
               (e.review_due_at < CURRENT_DATE AND e.status IN ('sent','in_review')) AS is_overdue
        FROM {SCHEMA}.exec_escalation e
        LEFT JOIN {SCHEMA}.exec_person pb ON pb.id = e.prepared_by_person_id
        LEFT JOIN {SCHEMA}.exec_person pt ON pt.id = e.passed_to_person_id
        LEFT JOIN {SCHEMA}.exec_collegial_body b ON b.id = e.passed_to_body_id
        LEFT JOIN {SCHEMA}.exec_issue s ON s.id = e.issue_id
        LEFT JOIN {SCHEMA}.exec_risk r ON r.id = e.risk_id
        LEFT JOIN {SCHEMA}.exec_decision_instance d ON d.id = e.decision_id
        ORDER BY e.passed_at DESC, e.id DESC
    """)
    return rows(cur)


def compute_next_action(cur, initiative_id):
    """Ближайшее действие: минимальный срок среди 5 источников."""
    cur.execute(f"""
        SELECT src, txt, due FROM (
            SELECT 'action' AS src, a.description AS txt, a.due_at AS due
            FROM {SCHEMA}.exec_action a
            LEFT JOIN {SCHEMA}.exec_issue s ON s.id = a.issue_id
            LEFT JOIN {SCHEMA}.exec_risk r ON r.id = a.risk_id
            WHERE COALESCE(s.initiative_id, r.initiative_id) = %s
              AND a.status NOT IN ('done','cancelled') AND a.due_at IS NOT NULL
            UNION ALL
            SELECT 'milestone', m.title, m.plan_date FROM {SCHEMA}.exec_milestone m
            WHERE m.initiative_id = %s AND m.status NOT IN ('achieved','cancelled')
              AND m.plan_date IS NOT NULL
            UNION ALL
            SELECT 'decision', d.question, d.due_at FROM {SCHEMA}.exec_decision_instance d
            WHERE d.initiative_id = %s AND d.status NOT IN ('decided','rejected','deferred')
              AND d.due_at IS NOT NULL
            UNION ALL
            SELECT 'issue', s.title, s.due_at FROM {SCHEMA}.exec_issue s
            WHERE s.initiative_id = %s AND s.status NOT IN ('resolved','closed','irrelevant')
              AND s.due_at IS NOT NULL
            UNION ALL
            SELECT 'risk_review', r.description, r.next_review_at FROM {SCHEMA}.exec_risk r
            WHERE r.initiative_id = %s AND r.status = 'active' AND r.next_review_at IS NOT NULL
        ) q ORDER BY due LIMIT 1
    """, (initiative_id,) * 5)
    r = cur.fetchone()
    if not r:
        return None
    return {"source": r[0], "text": r[1], "due": r[2]}


def control_focus(cur):
    """8 блоков «Моего фокуса» по согласованным правилам."""
    out = {}

    cur.execute(f"""
        SELECT s.id, s.title, s.criticality, s.due_at, s.status,
               i.id AS initiative_id, i.title AS initiative_title,
               (s.due_at < CURRENT_DATE) AS is_overdue
        FROM {SCHEMA}.exec_issue s
        JOIN {SCHEMA}.exec_initiative i ON i.id = s.initiative_id
        WHERE s.criticality IN ('critical','high')
          AND s.status NOT IN ('resolved','closed','irrelevant')
        ORDER BY CASE s.criticality WHEN 'critical' THEN 1 ELSE 2 END, s.due_at NULLS LAST
    """)
    out["critical_issues"] = rows(cur)

    cur.execute(f"""
        SELECT id, title, subject, block_what, block_deadline, initiative_id, initiative_title, kind,
               (block_deadline < CURRENT_DATE) AS is_overdue
        FROM (
            SELECT s.id, s.title, s.title AS subject, s.block_what, s.block_deadline,
                   i.id AS initiative_id, i.title AS initiative_title, 'issue' AS kind
            FROM {SCHEMA}.exec_issue s
            JOIN {SCHEMA}.exec_initiative i ON i.id = s.initiative_id
            WHERE s.is_blocking = true AND COALESCE(s.block_status,'active') = 'active'
            UNION ALL
            SELECT r.id, LEFT(r.description, 200), LEFT(r.description, 200), r.block_what, r.block_deadline,
                   i.id, i.title, 'risk'
            FROM {SCHEMA}.exec_risk r
            JOIN {SCHEMA}.exec_initiative i ON i.id = r.initiative_id
            WHERE r.is_blocking = true AND COALESCE(r.block_status,'active') = 'active'
        ) q ORDER BY block_deadline NULLS LAST
    """)
    out["blockers"] = rows(cur)

    cur.execute(f"""
        SELECT m.id, m.title, m.plan_date, m.status, m.milestone_type,
               i.id AS initiative_id, i.title AS initiative_title,
               (m.plan_date - CURRENT_DATE) AS days_left
        FROM {SCHEMA}.exec_milestone m
        JOIN {SCHEMA}.exec_initiative i ON i.id = m.initiative_id
        WHERE m.plan_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 14
          AND m.status NOT IN ('achieved','cancelled')
        ORDER BY m.plan_date
    """)
    out["upcoming_milestones"] = rows(cur)

    cur.execute(f"""
        SELECT m.id, m.title, m.plan_date, m.plan_date_original, m.status,
               i.id AS initiative_id, i.title AS initiative_title,
               (CURRENT_DATE - m.plan_date) AS days_overdue
        FROM {SCHEMA}.exec_milestone m
        JOIN {SCHEMA}.exec_initiative i ON i.id = m.initiative_id
        WHERE {OVERDUE_MS}
        ORDER BY m.plan_date
    """)
    out["overdue_milestones"] = rows(cur)

    cur.execute(f"""
        SELECT r.id, LEFT(r.description, 300) AS description, r.risk_score,
               {RISK_LEVEL_SQL} AS risk_level, r.next_review_at, r.status,
               i.id AS initiative_id, i.title AS initiative_title
        FROM {SCHEMA}.exec_risk r
        JOIN {SCHEMA}.exec_initiative i ON i.id = r.initiative_id
        WHERE r.risk_score >= 10 AND r.status IN ('active','accepted')
        ORDER BY r.risk_score DESC
    """)
    out["high_risks"] = rows(cur)

    cur.execute(f"""
        SELECT d.id, d.question, d.due_at, d.review_target_date, d.status,
               i.id AS initiative_id, i.title AS initiative_title,
               b.title AS body_title
        FROM {SCHEMA}.exec_decision_instance d
        JOIN {SCHEMA}.exec_initiative i ON i.id = d.initiative_id
        LEFT JOIN {SCHEMA}.exec_collegial_body b ON b.id = d.review_body_id
        WHERE d.needs_group_review = true
          AND d.status NOT IN ('decided','rejected','deferred')
        ORDER BY COALESCE(d.review_target_date, d.due_at) NULLS LAST
    """)
    out["group_agenda"] = rows(cur)

    cur.execute(f"""
        SELECT e.id, e.level_code, e.passed_at, e.review_due_at, e.status, e.reason,
               COALESCE(s.title, LEFT(r.description,200)) AS subject,
               COALESCE(s.initiative_id, r.initiative_id) AS initiative_id,
               i.title AS initiative_title,
               (e.review_due_at < CURRENT_DATE) AS is_overdue
        FROM {SCHEMA}.exec_escalation e
        LEFT JOIN {SCHEMA}.exec_issue s ON s.id = e.issue_id
        LEFT JOIN {SCHEMA}.exec_risk r ON r.id = e.risk_id
        LEFT JOIN {SCHEMA}.exec_initiative i ON i.id = COALESCE(s.initiative_id, r.initiative_id)
        WHERE e.status IN ('sent','in_review')
          AND e.level_code IN ('group','block','corporate')
        ORDER BY e.review_due_at NULLS LAST
    """)
    out["my_escalations"] = rows(cur)

    cur.execute(f"""
        SELECT i.id, i.title, i.owner_person_id, i.plan_end,
               i.next_action_text, i.next_action_due, i.next_action_is_manual,
               (i.owner_person_id IS NULL) AS no_owner,
               (i.plan_end IS NULL) AS no_deadline
        FROM {SCHEMA}.exec_initiative i
        WHERE i.status NOT IN ('closed','done')
    """)
    stalled = []
    for r in rows(cur):
        nxt = None
        if not r["next_action_is_manual"]:
            nxt = compute_next_action(cur, r["id"])
        has_next = bool(r["next_action_text"]) if r["next_action_is_manual"] else bool(nxt)
        if r["no_owner"] or r["no_deadline"] or not has_next:
            reasons = []
            if r["no_owner"]:
                reasons.append("нет владельца")
            if r["no_deadline"]:
                reasons.append("нет срока")
            if not has_next:
                reasons.append("нет ближайшего действия")
            stalled.append({
                "id": r["id"], "title": r["title"], "reasons": reasons,
                "computed_next": nxt,
            })
    out["stalled_initiatives"] = stalled

    cur.execute(f"""
        SELECT
          (SELECT COUNT(*) FROM {SCHEMA}.exec_issue
           WHERE criticality IN ('critical','high') AND status NOT IN ('resolved','closed','irrelevant')) AS critical_issues,
          (SELECT COUNT(*) FROM {SCHEMA}.exec_issue
           WHERE is_blocking AND COALESCE(block_status,'active') = 'active') +
          (SELECT COUNT(*) FROM {SCHEMA}.exec_risk
           WHERE is_blocking AND COALESCE(block_status,'active') = 'active') AS blockers,
          (SELECT COUNT(*) FROM {SCHEMA}.exec_milestone m WHERE {OVERDUE_MS}) AS overdue_milestones,
          (SELECT COUNT(*) FROM {SCHEMA}.exec_milestone
           WHERE plan_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 14
             AND status NOT IN ('achieved','cancelled')) AS upcoming_milestones,
          (SELECT COUNT(*) FROM {SCHEMA}.exec_risk
           WHERE risk_score >= 10 AND status IN ('active','accepted')) AS high_risks,
          (SELECT COUNT(*) FROM {SCHEMA}.exec_escalation
           WHERE status IN ('sent','in_review')) AS open_escalations
    """)
    out["metrics"] = rows(cur)[0]
    return out


def handler(event: dict, context) -> dict:
    """Контроль и продвижение: контрольные точки, проблемы, риски, действия, эскалации."""
    if event.get("httpMethod") == "OPTIONS":
        return cors({})

    headers = event.get("headers") or {}

    conn = psycopg2.connect(DB)
    try:
        user = authenticate(conn, headers)
        if not user:
            return cors({"ok": False, "error": {"message": "Не авторизован"}}, 401)
        actor = user["email"]
        can_confirm = user["can_confirm"]

        qs = event.get("queryStringParameters") or {}
        action = qs.get("action", "control_focus")
        body = json.loads(event["body"]) if event.get("body") else {}
        cur = conn.cursor()
        iid = int(qs["initiative_id"]) if qs.get("initiative_id") else None

        if action == "whoami":
            return cors({"ok": True, "data": user})

        warn = None
        if not can_confirm:
            confirming = {
                "save_milestone": body.get("status") == "achieved",
                "save_issue": body.get("status") in ("resolved", "closed"),
                "save_risk": body.get("status") == "closed",
                "lift_block": True,
                "set_verification": True,
            }
            if confirming.get(action):
                warn = ("У вас нет права подтверждения. Запись сохранена, "
                        "но требует подтверждения уполномоченным лицом.")

        if action == "control_focus":
            return cors({"ok": True, "data": control_focus(cur)})

        if action == "all":
            return cors({"ok": True, "data": {
                "milestones": milestones(cur, iid),
                "issues": issues(cur, iid),
                "risks": risks(cur, iid),
                "actions": actions(cur),
                "escalations": escalations(cur),
                "access": user,
            }})

        if action == "demo_stats":
            cur.execute(f"""
                SELECT
                  (SELECT COUNT(*) FROM {SCHEMA}.exec_milestone WHERE is_test_data) AS milestones,
                  (SELECT COUNT(*) FROM {SCHEMA}.exec_issue WHERE is_test_data) AS issues,
                  (SELECT COUNT(*) FROM {SCHEMA}.exec_risk WHERE is_test_data) AS risks,
                  (SELECT COUNT(*) FROM {SCHEMA}.exec_action WHERE is_test_data) AS actions,
                  (SELECT COUNT(*) FROM {SCHEMA}.exec_escalation WHERE is_test_data) AS escalations,
                  (SELECT COUNT(*) FROM {SCHEMA}.exec_milestone WHERE NOT is_test_data) AS real_milestones,
                  (SELECT COUNT(*) FROM {SCHEMA}.exec_issue WHERE NOT is_test_data) AS real_issues,
                  (SELECT COUNT(*) FROM {SCHEMA}.exec_risk WHERE NOT is_test_data) AS real_risks
            """)
            return cors({"ok": True, "data": rows(cur)[0]})

        if action == "clear_demo":
            if user["role"] != "head":
                return cors({"ok": False, "error": {
                    "message": "Очистку демонстрационных данных выполняет руководитель"}}, 403)
            if body.get("confirm") != "УДАЛИТЬ ДЕМОДАННЫЕ":
                return cors({"ok": False, "error": {
                    "message": "Для подтверждения введите: УДАЛИТЬ ДЕМОДАННЫЕ"}}, 400)
            counts = {}
            for tbl in ("exec_relation",):
                cur.execute(f"""DELETE FROM {SCHEMA}.{tbl} WHERE
                    src_issue_id IN (SELECT id FROM {SCHEMA}.exec_issue WHERE is_test_data)
                    OR src_risk_id IN (SELECT id FROM {SCHEMA}.exec_risk WHERE is_test_data)
                    OR src_milestone_id IN (SELECT id FROM {SCHEMA}.exec_milestone WHERE is_test_data)""")
            for tbl in ("exec_escalation", "exec_action", "exec_milestone",
                        "exec_risk", "exec_issue"):
                cur.execute(f"DELETE FROM {SCHEMA}.{tbl} WHERE is_test_data = true")
                counts[tbl] = cur.rowcount
            log(cur, actor, "system", 0, "clear_demo", counts)
            conn.commit()
            return cors({"ok": True, "data": {"deleted": counts}})

        if action == "milestones":
            return cors({"ok": True, "data": {"items": milestones(cur, iid)}})

        if action == "issues":
            return cors({"ok": True, "data": {"items": issues(cur, iid)}})

        if action == "risks":
            return cors({"ok": True, "data": {"items": risks(cur, iid)}})

        if action == "actions":
            return cors({"ok": True, "data": {"items": actions(cur)}})

        if action == "escalations":
            return cors({"ok": True, "data": {"items": escalations(cur)}})

        if action == "save_milestone":
            mid = body.get("id")
            fields = ["initiative_id", "title", "milestone_type", "plan_date", "fact_date",
                      "status", "responsible_person_id", "depends_on_milestone_id", "decision_id",
                      "achievement_criteria", "achievement_evidence", "confirmed_by_person_id",
                      "reschedule_reason", "reschedule_approved_by", "comment"]
            data = {k: body.get(k) for k in fields if k in body}

            if mid:
                cur.execute(f"SELECT plan_date, plan_date_original, reschedule_count "
                            f"FROM {SCHEMA}.exec_milestone WHERE id = %s", (mid,))
                prev = cur.fetchone()
                if not prev:
                    return cors({"ok": False, "error": {"message": "Точка не найдена"}}, 404)
                old_plan, orig, cnt = prev
                new_plan = data.get("plan_date")
                if new_plan and str(new_plan) != str(old_plan):
                    data["rescheduled_at"] = "now()"
                    data["reschedule_count"] = (cnt or 0) + 1
                    log(cur, actor, "milestone", mid, "reschedule",
                        {"from": str(old_plan), "to": str(new_plan), "original": str(orig)},
                        data.get("reschedule_reason"))
                err = validate("milestone", data, fetch_existing(cur, "exec_milestone", mid))
                if err:
                    return cors({"ok": False, "error": {"message": err}}, 400)
                data.pop("rescheduled_at", None)
                sets = ", ".join(f"{k} = %s" for k in data)
                extra = ", rescheduled_at = now()" if new_plan and str(new_plan) != str(old_plan) else ""
                confirm = ", confirmed_at = now()" if data.get("status") == "achieved" else ""
                cur.execute(
                    f"UPDATE {SCHEMA}.exec_milestone SET {sets}{extra}{confirm}, updated_at = now() "
                    f"WHERE id = %s RETURNING id", list(data.values()) + [mid])
            else:
                err = validate("milestone", data)
                if err:
                    return cors({"ok": False, "error": {"message": err}}, 400)
                data["plan_date_original"] = data.get("plan_date")
                data["created_by"] = actor
                cols = ", ".join(data.keys())
                ph = ", ".join(["%s"] * len(data))
                cur.execute(f"INSERT INTO {SCHEMA}.exec_milestone ({cols}) VALUES ({ph}) RETURNING id",
                            list(data.values()))
            new_id = cur.fetchone()[0]
            log(cur, actor, "milestone", new_id, "update" if mid else "create", data)
            conn.commit()
            return cors({"ok": True, "data": {"id": new_id}, "warning": warn})

        if action == "save_issue":
            sid = body.get("id")
            fields = ["initiative_id", "title", "description", "detected_at", "category",
                      "criticality", "impact_deadline", "impact_result", "impact_cost",
                      "impact_quality", "impact_compliance", "root_cause",
                      "owner_person_id", "responsible_person_id", "action_plan", "due_at",
                      "status", "resolution_criteria", "resolution_result", "resolved_at",
                      "resolved_confirmed_by_person_id", "needs_escalation", "escalation_level",
                      "is_blocking", "block_what", "block_since", "block_who_can_lift",
                      "block_requirements", "block_escalation_level", "block_deadline",
                      "block_status", "block_lifted_at", "block_lifted_by", "block_lift_result",
                      "block_lift_confirmed_by"]
            data = {k: body.get(k) for k in fields if k in body}

            if data.get("is_blocking"):
                data.setdefault("block_status", "active")
                crit = data.get("criticality")
                if crit in (None, "low", "medium"):
                    data["criticality"] = "high"
                    data["criticality_auto_raised"] = True
                bd = data.get("block_deadline")
                if bd and str(bd) < str(datetime.date.today()):
                    data["criticality"] = "critical"
                    data["criticality_auto_raised"] = True

            err = validate("issue", data, fetch_existing(cur, "exec_issue", sid) if sid else None)
            if err:
                return cors({"ok": False, "error": {"message": err}}, 400)

            if sid:
                sets = ", ".join(f"{k} = %s" for k in data)
                cur.execute(
                    f"UPDATE {SCHEMA}.exec_issue SET {sets}, updated_at = now() "
                    f"WHERE id = %s RETURNING id", list(data.values()) + [sid])
            else:
                data["created_by"] = actor
                cols = ", ".join(data.keys())
                ph = ", ".join(["%s"] * len(data))
                cur.execute(f"INSERT INTO {SCHEMA}.exec_issue ({cols}) VALUES ({ph}) RETURNING id",
                            list(data.values()))
            new_id = cur.fetchone()[0]
            log(cur, actor, "issue", new_id, "update" if sid else "create", data)
            conn.commit()
            return cors({"ok": True, "data": {"id": new_id}, "warning": warn})

        if action == "save_risk":
            rid = body.get("id")
            fields = ["initiative_id", "description", "cause", "consequence", "probability",
                      "impact", "trigger_indicator", "owner_person_id", "preventive_measures",
                      "response_plan", "detected_at", "last_assessed_at", "assessed_by_person_id",
                      "next_review_at", "status", "materialized_issue_id",
                      "is_blocking", "block_what", "block_since", "block_who_can_lift",
                      "block_requirements", "block_escalation_level", "block_deadline",
                      "block_status", "block_lifted_at", "block_lifted_by", "block_lift_result"]
            data = {k: body.get(k) for k in fields if k in body}
            if data.get("is_blocking"):
                data.setdefault("block_status", "active")

            err = validate("risk", data, fetch_existing(cur, "exec_risk", rid) if rid else None)
            if err:
                return cors({"ok": False, "error": {"message": err}}, 400)

            if rid:
                sets = ", ".join(f"{k} = %s" for k in data)
                cur.execute(
                    f"UPDATE {SCHEMA}.exec_risk SET {sets}, updated_at = now() "
                    f"WHERE id = %s RETURNING id", list(data.values()) + [rid])
            else:
                data["created_by"] = actor
                cols = ", ".join(data.keys())
                ph = ", ".join(["%s"] * len(data))
                cur.execute(f"INSERT INTO {SCHEMA}.exec_risk ({cols}) VALUES ({ph}) RETURNING id",
                            list(data.values()))
            new_id = cur.fetchone()[0]
            log(cur, actor, "risk", new_id, "update" if rid else "create", data)
            conn.commit()
            return cors({"ok": True, "data": {"id": new_id}, "warning": warn})

        if action == "save_action":
            aid = body.get("id")
            fields = ["issue_id", "risk_id", "description", "responsible_person_id",
                      "start_date", "due_at", "fact_date", "status", "completion_criteria",
                      "result", "result_confirmed_by_person_id", "delay_reason", "decision_id"]
            data = {k: body.get(k) for k in fields if k in body}

            err = validate("action", data, fetch_existing(cur, "exec_action", aid) if aid else None)
            if err:
                return cors({"ok": False, "error": {"message": err}}, 400)

            if aid:
                sets = ", ".join(f"{k} = %s" for k in data)
                cur.execute(
                    f"UPDATE {SCHEMA}.exec_action SET {sets}, updated_at = now() "
                    f"WHERE id = %s RETURNING id", list(data.values()) + [aid])
            else:
                data["created_by"] = actor
                cols = ", ".join(data.keys())
                ph = ", ".join(["%s"] * len(data))
                cur.execute(f"INSERT INTO {SCHEMA}.exec_action ({cols}) VALUES ({ph}) RETURNING id",
                            list(data.values()))
            new_id = cur.fetchone()[0]
            log(cur, actor, "action", new_id, "update" if aid else "create", data)
            conn.commit()
            return cors({"ok": True, "data": {"id": new_id}})

        if action == "save_escalation":
            eid = body.get("id")
            fields = ["issue_id", "risk_id", "level_code", "passed_at", "reason",
                      "prepared_by_person_id", "passed_to_person_id", "passed_to_body_id",
                      "review_due_at", "decision_text", "decided_at", "result",
                      "decision_id", "status"]
            data = {k: body.get(k) for k in fields if k in body}

            err = validate("escalation", data,
                           fetch_existing(cur, "exec_escalation", eid) if eid else None)
            if err:
                return cors({"ok": False, "error": {"message": err}}, 400)

            if eid:
                sets = ", ".join(f"{k} = %s" for k in data)
                cur.execute(
                    f"UPDATE {SCHEMA}.exec_escalation SET {sets} WHERE id = %s RETURNING id",
                    list(data.values()) + [eid])
            else:
                data["created_by"] = actor
                cols = ", ".join(data.keys())
                ph = ", ".join(["%s"] * len(data))
                cur.execute(f"INSERT INTO {SCHEMA}.exec_escalation ({cols}) VALUES ({ph}) RETURNING id",
                            list(data.values()))
            new_id = cur.fetchone()[0]
            log(cur, actor, "escalation", new_id, "update" if eid else "create", data)
            conn.commit()
            return cors({"ok": True, "data": {"id": new_id}})

        if action == "lift_block":
            kind = body.get("kind")
            table = {"issue": "exec_issue", "risk": "exec_risk"}.get(kind)
            if not table:
                return cors({"ok": False, "error": {"message": "Укажите проблему или риск"}}, 400)
            if not body.get("block_lift_result"):
                return cors({"ok": False, "error": {
                    "message": "Укажите результат снятия блокировки"}}, 400)
            cur.execute(
                f"UPDATE {SCHEMA}.{table} SET block_status = 'lifted', block_lifted_at = %s, "
                f"block_lifted_by = %s, block_lift_result = %s, updated_at = now() "
                f"WHERE id = %s RETURNING id",
                (body.get("block_lifted_at"), actor, body.get("block_lift_result"), body.get("id")))
            row = cur.fetchone()
            if not row:
                return cors({"ok": False, "error": {"message": "Запись не найдена"}}, 404)
            log(cur, actor, kind, body.get("id"), "lift_block",
                {"result": body.get("block_lift_result")})
            conn.commit()
            return cors({"ok": True, "data": {"id": row[0]}, "warning": warn})

        if action == "set_next_action":
            init_id = body.get("initiative_id")
            if body.get("reset"):
                cur.execute(
                    f"UPDATE {SCHEMA}.exec_initiative SET next_action_is_manual = false, "
                    f"next_action_text = NULL, next_action_due = NULL, next_action_person_id = NULL, "
                    f"next_action_manual_reason = NULL WHERE id = %s RETURNING id", (init_id,))
                log(cur, actor, "initiative", init_id, "next_action_reset")
            else:
                cur.execute(
                    f"UPDATE {SCHEMA}.exec_initiative SET next_action_text = %s, next_action_due = %s, "
                    f"next_action_person_id = %s, next_action_is_manual = true, "
                    f"next_action_manual_by = %s, next_action_manual_at = now(), "
                    f"next_action_manual_reason = %s WHERE id = %s RETURNING id",
                    (body.get("next_action_text"), body.get("next_action_due"),
                     body.get("next_action_person_id"), actor,
                     body.get("next_action_manual_reason"), init_id))
                log(cur, actor, "initiative", init_id, "next_action_manual", body)
            row = cur.fetchone()
            conn.commit()
            return cors({"ok": True, "data": {"id": row[0] if row else None}})

        if action == "next_action":
            return cors({"ok": True, "data": {"computed": compute_next_action(cur, iid)}})

        if action == "save_relation":
            fields = ["relation_type", "src_issue_id", "src_risk_id", "src_milestone_id",
                      "tgt_milestone_id", "tgt_decision_id", "tgt_stakeholder_id",
                      "tgt_role_assignment_id", "tgt_person_id", "note"]
            data = {k: body.get(k) for k in fields if body.get(k) is not None}
            data["created_by"] = actor
            cols = ", ".join(data.keys())
            ph = ", ".join(["%s"] * len(data))
            cur.execute(f"INSERT INTO {SCHEMA}.exec_relation ({cols}) VALUES ({ph}) RETURNING id",
                        list(data.values()))
            new_id = cur.fetchone()[0]
            log(cur, actor, "relation", new_id, "create", data)
            conn.commit()
            return cors({"ok": True, "data": {"id": new_id}})

        if action == "relations":
            cur.execute(f"""
                SELECT r.*, m.title AS tgt_milestone_title, d.question AS tgt_decision_question,
                       p.display_name AS tgt_person_name, sp.display_name AS tgt_stakeholder_name
                FROM {SCHEMA}.exec_relation r
                LEFT JOIN {SCHEMA}.exec_milestone m ON m.id = r.tgt_milestone_id
                LEFT JOIN {SCHEMA}.exec_decision_instance d ON d.id = r.tgt_decision_id
                LEFT JOIN {SCHEMA}.exec_person p ON p.id = r.tgt_person_id
                LEFT JOIN {SCHEMA}.exec_stakeholder s ON s.id = r.tgt_stakeholder_id
                LEFT JOIN {SCHEMA}.exec_person sp ON sp.id = s.person_id
                ORDER BY r.created_at DESC
            """)
            return cors({"ok": True, "data": {"items": rows(cur)}})

        return cors({"ok": False, "error": {"message": f"Неизвестное действие: {action}"}}, 400)
    except psycopg2.Error as e:
        conn.rollback()
        constraint = ""
        if getattr(e, "diag", None) and e.diag.constraint_name:
            constraint = e.diag.constraint_name
        msg = constraint or str(e).split("\n")[0]
        if "exec_issue_resolved_chk" in msg:
            msg = "Нельзя закрыть проблему без критерия устранения, результата, даты и подтверждающего лица"
        elif "exec_issue_block_chk" in msg:
            msg = "При блокировке обязательны: что заблокировано, с какой даты, кто снимет, что требуется, уровень эскалации и крайний срок"
        elif "exec_risk_materialized_chk" in msg:
            msg = "Риск со статусом «реализовался» требует связи с возникшей проблемой"
        elif "exec_action_one_target" in msg:
            msg = "Действие относится ровно к одной проблеме или одному риску"
        elif "exec_escalation_one_target" in msg:
            msg = "Эскалация относится ровно к одной проблеме или одному риску"
        elif "exec_milestone_achieved_chk" in msg:
            msg = "Достижение точки требует подтверждающего результата и фактической даты"
        elif "exec_action_done_chk" in msg:
            msg = "Выполненное действие требует результата и фактической даты"
        elif "exec_relation_one" in msg:
            msg = "Связь должна иметь ровно один источник и ровно одну цель"
        elif "exec_risk_block_chk" in msg:
            msg = "При блокировке обязательны все шесть полей блока"
        elif "exec_milestone_no_self_dep" in msg:
            msg = "Контрольная точка не может зависеть от самой себя"
        elif constraint:
            msg = f"Нарушено правило целостности данных: {constraint}"
        return cors({"ok": False, "error": {"message": msg}}, 400)
    finally:
        conn.close()