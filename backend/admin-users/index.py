"""
Phase 3A — admin-users.
Действия: list, get, block, unblock.
Аутентификация: X-Admin-Token (admin-auth сессия).
Блокировка: таблица admin_user_flags (не трогаем users).
После block: все пользовательские sessions инвалидируются,
  запись пишется в admin_audit_log.
"""
import json
import os
import hashlib
import psycopg2

DB = os.environ["DATABASE_URL"]
_schema_env = os.environ.get("MAIN_DB_SCHEMA", "").strip()
SCHEMA = _schema_env if _schema_env else "t_p61016064_digital_innovation_i"
print(f"[admin-users] SCHEMA={SCHEMA}")


def get_db():
    conn = psycopg2.connect(DB)
    conn.autocommit = False
    return conn


# ── CORS ────────────────────────────────────────────────────────────

def _is_allowed(origin: str) -> bool:
    if not origin:
        return False
    try:
        from urllib.parse import urlparse
        host = (urlparse(origin).hostname or "").lower()
        return host in ("raven.moscow", "www.raven.moscow", "localhost") \
               or host.endswith(".poehali.dev")
    except Exception:
        return False


def cors(origin: str = None) -> dict:
    allowed = origin if _is_allowed(origin) else "*"
    return {
        "Access-Control-Allow-Origin": allowed,
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-Admin-Token",
        "Vary": "Origin",
    }


def resp(data: dict, code: int = 200, origin: str = None) -> dict:
    return {
        "statusCode": code,
        "headers": {**cors(origin), "Content-Type": "application/json"},
        "body": json.dumps(data, ensure_ascii=False, default=str),
    }


# ── Admin session auth ────────────────────────────────────────────

def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def get_admin_session(conn, token: str) -> dict | None:
    """Проверяет X-Admin-Token, возвращает {actor_email, actor_role} или None."""
    if not token:
        return None
    token_hash = _hash(token)
    s = SCHEMA
    with conn.cursor() as cur:
        cur.execute(
            f"SELECT actor_email, actor_role FROM {s}.admin_sessions "
            f"WHERE session_token_hash = '{token_hash}' "
            f"AND expires_at > NOW() AND revoked_at IS NULL LIMIT 1"
        )
        row = cur.fetchone()
    return {"actor_email": row[0], "actor_role": row[1]} if row else None


# ── Helpers ───────────────────────────────────────────────────────

def get_user_row(conn, user_id: int) -> dict | None:
    s = SCHEMA
    with conn.cursor() as cur:
        cur.execute(f"""
            SELECT
                u.id,
                u.email,
                u.name,
                u.created_at,
                COALESCE(f.is_blocked, FALSE)      AS is_blocked,
                f.reason                           AS block_reason,
                f.blocked_at,
                f.unblocked_at,
                COALESCE(w.balance_kopecks, 0)     AS balance_kopecks
            FROM {s}.users u
            LEFT JOIN {s}.admin_user_flags f ON f.user_id = u.id
            LEFT JOIN {s}.wallet_accounts  w ON w.user_id = u.id
            WHERE u.id = {user_id}
            LIMIT 1
        """)
        row = cur.fetchone()
    if not row:
        return None
    return {
        "id":              row[0],
        "email":           row[1],
        "name":            row[2],
        "created_at":      row[3],
        "is_blocked":      row[4],
        "block_reason":    row[5],
        "blocked_at":      row[6],
        "unblocked_at":    row[7],
        "balance_kopecks": row[8],
        "balance_rub":     round(row[8] / 100, 2),
    }


def write_audit(conn, actor: dict, action: str, entity_id: int,
                before: dict, after: dict, reason: str,
                ip: str, ua: str):
    s = SCHEMA
    b = json.dumps(before, ensure_ascii=False, default=str).replace("'", "''")
    a = json.dumps(after, ensure_ascii=False, default=str).replace("'", "''")
    r = (reason or "").replace("'", "''")
    ip_s = (ip or "").replace("'", "''")[:64]
    ua_s = (ua or "").replace("'", "''")[:500]
    with conn.cursor() as cur:
        cur.execute(f"""
            INSERT INTO {s}.admin_audit_log
                (actor_email, actor_role, action, entity_type, entity_id,
                 before_json, after_json, reason, ip_address, user_agent)
            VALUES (
                '{actor["actor_email"]}', '{actor["actor_role"]}',
                '{action}', 'user', {entity_id},
                '{b}'::jsonb, '{a}'::jsonb,
                '{r}', '{ip_s}', '{ua_s}'
            )
        """)


# ── Actions ───────────────────────────────────────────────────────

def action_list(conn, params: dict, origin: str) -> dict:
    """
    Параметры: q (search), filter (all|active|blocked), page, per_page.
    Возвращает список пользователей с пагинацией.
    """
    s = SCHEMA
    q = (params.get("q") or "").strip().replace("'", "''")
    flt = params.get("filter", "all")  # all | active | blocked
    page = max(1, int(params.get("page", 1)))
    per_page = min(100, max(1, int(params.get("per_page", 20))))
    offset = (page - 1) * per_page

    where_parts = []
    if q:
        where_parts.append(
            f"(lower(u.email) LIKE lower('%{q}%') "
            f"OR lower(u.name) LIKE lower('%{q}%') "
            f"OR CAST(u.id AS TEXT) = '{q}')"
        )
    if flt == "active":
        where_parts.append("COALESCE(f.is_blocked, FALSE) = FALSE")
    elif flt == "blocked":
        where_parts.append("COALESCE(f.is_blocked, FALSE) = TRUE")

    where_sql = ("WHERE " + " AND ".join(where_parts)) if where_parts else ""

    base_sql = f"""
        FROM {s}.users u
        LEFT JOIN {s}.admin_user_flags f ON f.user_id = u.id
        LEFT JOIN {s}.wallet_accounts  w ON w.user_id = u.id
        {where_sql}
    """

    with conn.cursor() as cur:
        cur.execute(f"SELECT COUNT(*) {base_sql}")
        total = cur.fetchone()[0]

        cur.execute(f"""
            SELECT
                u.id, u.email, u.name, u.created_at,
                COALESCE(f.is_blocked, FALSE) AS is_blocked,
                f.blocked_at,
                COALESCE(w.balance_kopecks, 0) AS balance_kopecks,
                (SELECT COUNT(*) FROM {s}.admin_tickets t
                 WHERE t.requester_email = u.email
                   AND t.status NOT IN ('resolved','closed')) AS open_tickets,
                (SELECT MAX(al.created_at) FROM {s}.activity_log al
                 WHERE al.user_id = u.id) AS last_activity_at
            {base_sql}
            ORDER BY u.created_at DESC
            LIMIT {per_page} OFFSET {offset}
        """)
        rows = cur.fetchall()

    users = []
    for r in rows:
        users.append({
            "id":              r[0],
            "email":           r[1],
            "name":            r[2],
            "created_at":      r[3],
            "is_blocked":      r[4],
            "blocked_at":      r[5],
            "balance_kopecks": r[6],
            "balance_rub":     round(r[6] / 100, 2),
            "open_tickets":    r[7],
            "last_activity_at": str(r[8]) if r[8] else None,
        })

    return resp({
        "users":    users,
        "total":    total,
        "page":     page,
        "per_page": per_page,
        "pages":    max(1, -(-total // per_page)),
    }, origin=origin)


def action_get(conn, user_id: int, origin: str) -> dict:
    """User 360: базовая инфо + статистика + tickets + comms + activity."""
    s = SCHEMA
    user = get_user_row(conn, user_id)
    if not user:
        return resp({"error": "not_found"}, 404, origin)

    with conn.cursor() as cur:
        cur.execute(
            f"SELECT COUNT(*) FROM {s}.projects WHERE owner_id = {user_id} AND archived_at IS NULL"
        )
        projects_count = cur.fetchone()[0]

        cur.execute(
            f"SELECT COUNT(*) FROM {s}.tasks WHERE created_by = {user_id} AND archived_at IS NULL"
        )
        tasks_count = cur.fetchone()[0]

        cur.execute(
            f"SELECT COUNT(*) FROM {s}.documents d "
            f"JOIN {s}.project_members pm ON pm.project_id = d.project_id AND pm.user_id = {user_id} "
            f"WHERE d.archived_at IS NULL"
        )
        docs_count = cur.fetchone()[0]

        cur.execute(
            f"SELECT COUNT(*) FROM {s}.sessions WHERE user_id = {user_id} AND expires_at > NOW()"
        )
        active_sessions = cur.fetchone()[0]

        # ── Tickets (по email пользователя) ──────────────────────────────────
        user_email_safe = user["email"].replace("'", "''")
        cur.execute(f"""
            SELECT id, ticket_no, status, priority, subject, created_at, assignee_email
            FROM {s}.admin_tickets
            WHERE requester_email = '{user_email_safe}'
            ORDER BY created_at DESC LIMIT 5
        """)
        tickets_rows = cur.fetchall()
        tickets = [{
            "id": r[0], "ticket_no": r[1], "status": r[2], "priority": r[3],
            "subject": r[4][:100], "created_at": str(r[5]), "assignee_email": r[6],
        } for r in tickets_rows]

        cur.execute(f"""
            SELECT COUNT(*) FROM {s}.admin_tickets
            WHERE requester_email = '{user_email_safe}'
            AND status NOT IN ('resolved','closed')
        """)
        tickets_open = cur.fetchone()[0]

        cur.execute(f"""
            SELECT COUNT(*) FROM {s}.admin_tickets
            WHERE requester_email = '{user_email_safe}'
            AND priority = 'urgent' AND status NOT IN ('resolved','closed')
        """)
        tickets_urgent = cur.fetchone()[0]

        # ── Communications (по audience или subject-match) ────────────────────
        cur.execute(f"""
            SELECT id, comm_no, channel, status, subject, sent_at, audience
            FROM {s}.admin_communications
            WHERE audience = 'all'
               OR audience = 'learners'
            ORDER BY created_at DESC LIMIT 5
        """)
        comms_rows = cur.fetchall()
        comms = [{
            "id": r[0], "comm_no": r[1], "channel": r[2], "status": r[3],
            "subject": r[4][:100], "sent_at": str(r[5]) if r[5] else None, "audience": r[6],
        } for r in comms_rows]

        # ── Last activity events ──────────────────────────────────────────────
        cur.execute(f"""
            SELECT id, action, entity_type, entity_id, details, created_at
            FROM {s}.activity_log
            WHERE user_id = {user_id}
            ORDER BY created_at DESC LIMIT 8
        """)
        activity_rows = cur.fetchall()
        activity = [{
            "id": r[0], "action": r[1], "entity_type": r[2],
            "entity_id": r[3], "details": (r[4] or "")[:120], "created_at": str(r[5]),
        } for r in activity_rows]

        # ── Last audit events (по entity_type=user) ──────────────────────────
        cur.execute(f"""
            SELECT id, action, actor_email, reason, created_at
            FROM {s}.admin_audit_log
            WHERE entity_type = 'user' AND entity_id = {user_id}
            ORDER BY created_at DESC LIMIT 5
        """)
        audit_rows = cur.fetchall()
        audit_events = [{
            "id": r[0], "action": r[1], "actor_email": r[2],
            "reason": r[3], "created_at": str(r[4]),
        } for r in audit_rows]

        # ── Passport / learning modules ───────────────────────────────────────
        cur.execute(f"""
            SELECT id, goal_text, target_level, status, started_at, target_date
            FROM {s}.learning_goals
            WHERE user_id = {user_id}
            ORDER BY created_at DESC LIMIT 3
        """)
        goals_rows = cur.fetchall()
        learning_goals = [{
            "id": r[0], "goal_text": (r[1] or "")[:80], "target_level": r[2],
            "status": r[3], "started_at": str(r[4]) if r[4] else None,
            "target_date": str(r[5]) if r[5] else None,
        } for r in goals_rows]

    user["projects_count"]  = projects_count
    user["tasks_count"]     = tasks_count
    user["documents_count"] = docs_count
    user["active_sessions"] = active_sessions
    user["tickets"]         = tickets
    user["tickets_open"]    = tickets_open
    user["tickets_urgent"]  = tickets_urgent
    user["communications"]  = comms
    user["activity"]        = activity
    user["audit_events"]    = audit_events
    user["learning_goals"]  = learning_goals

    return resp({"user": user}, origin=origin)


# ── Notes ─────────────────────────────────────────────────────────

def action_user_notes(conn, user_id: int, origin: str) -> dict:
    """Список заметок по пользователю."""
    s = SCHEMA
    with conn.cursor() as cur:
        cur.execute(f"""
            SELECT id, user_id, note_text, visibility, created_at, created_by, updated_at, updated_by
            FROM {s}.admin_user_notes WHERE user_id = {user_id}
            ORDER BY created_at DESC LIMIT 50
        """)
        rows = cur.fetchall()
    notes = [{
        "id": r[0], "user_id": r[1], "note_text": r[2], "visibility": r[3],
        "created_at": str(r[4]), "created_by": r[5],
        "updated_at": str(r[6]) if r[6] else None, "updated_by": r[7],
    } for r in rows]
    return resp({"notes": notes}, origin=origin)


def action_add_user_note(conn, actor: dict, body: dict, ip: str, ua: str, origin: str) -> dict:
    """Добавить internal note к пользователю."""
    s = SCHEMA
    user_id = body.get("user_id")
    note_text = (body.get("note_text") or "").strip()
    if not user_id or not note_text:
        return resp({"error": "user_id and note_text required"}, 400, origin)
    user_id = int(user_id)
    actor_email = actor["actor_email"]
    with conn.cursor() as cur:
        cur.execute(f"""
            INSERT INTO {s}.admin_user_notes (user_id, note_text, visibility, created_by)
            VALUES ({user_id}, %s, 'internal', %s)
            RETURNING id
        """, (note_text, actor_email))
        new_id = cur.fetchone()[0]
    conn.commit()
    write_audit(conn, actor, "user.note_added", user_id,
                {}, {"note_id": new_id, "preview": note_text[:60]},
                f"Note #{new_id}", ip, ua)
    conn.commit()
    return resp({"ok": True, "id": new_id}, origin=origin)


def action_delete_user_note(conn, actor: dict, body: dict, ip: str, ua: str, origin: str) -> dict:
    """Мягкое удаление заметки (помечаем как deleted через visibility='deleted')."""
    s = SCHEMA
    note_id = body.get("note_id")
    if not note_id:
        return resp({"error": "note_id required"}, 400, origin)
    note_id = int(note_id)
    actor_email = actor["actor_email"]
    with conn.cursor() as cur:
        cur.execute(f"""
            UPDATE {s}.admin_user_notes
            SET visibility = 'deleted', updated_at = NOW(), updated_by = %s
            WHERE id = {note_id}
        """, (actor_email,))
    conn.commit()
    return resp({"ok": True}, origin=origin)


# ── Case flags ────────────────────────────────────────────────────

FLAG_TYPES = ["observation", "risk", "fraud_suspicion", "payment_issue",
              "support_escalation", "vip", "churn_risk", "custom"]


def action_user_case_flags(conn, user_id: int, origin: str) -> dict:
    """Список casework-флагов по пользователю."""
    s = SCHEMA
    with conn.cursor() as cur:
        cur.execute(f"""
            SELECT id, user_id, flag_type, title, description, status,
                   created_at, created_by, resolved_at, resolved_by
            FROM {s}.admin_user_case_flags
            WHERE user_id = {user_id}
            ORDER BY CASE status WHEN 'open' THEN 0 ELSE 1 END, created_at DESC LIMIT 20
        """)
        rows = cur.fetchall()
    flags = [{
        "id": r[0], "user_id": r[1], "flag_type": r[2], "title": r[3],
        "description": r[4], "status": r[5],
        "created_at": str(r[6]), "created_by": r[7],
        "resolved_at": str(r[8]) if r[8] else None, "resolved_by": r[9],
    } for r in rows]
    return resp({"flags": flags}, origin=origin)


def action_add_user_case_flag(conn, actor: dict, body: dict, ip: str, ua: str, origin: str) -> dict:
    """Добавить casework-флаг к пользователю."""
    s = SCHEMA
    user_id = body.get("user_id")
    title = (body.get("title") or "").strip()
    if not user_id or not title:
        return resp({"error": "user_id and title required"}, 400, origin)
    user_id = int(user_id)
    flag_type = body.get("flag_type", "observation")
    if flag_type not in FLAG_TYPES:
        flag_type = "observation"
    description = (body.get("description") or "").strip()
    actor_email = actor["actor_email"]
    with conn.cursor() as cur:
        cur.execute(f"""
            INSERT INTO {s}.admin_user_case_flags
              (user_id, flag_type, title, description, status, created_by)
            VALUES ({user_id}, %s, %s, %s, 'open', %s)
            RETURNING id
        """, (flag_type, title, description, actor_email))
        new_id = cur.fetchone()[0]
    conn.commit()
    write_audit(conn, actor, "user.flag_created", user_id,
                {}, {"flag_id": new_id, "flag_type": flag_type, "title": title},
                f"Flag: {title[:60]}", ip, ua)
    conn.commit()
    return resp({"ok": True, "id": new_id}, origin=origin)


def action_resolve_user_case_flag(conn, actor: dict, body: dict, ip: str, ua: str, origin: str) -> dict:
    """Закрыть casework-флаг."""
    s = SCHEMA
    flag_id = body.get("flag_id")
    if not flag_id:
        return resp({"error": "flag_id required"}, 400, origin)
    flag_id = int(flag_id)
    actor_email = actor["actor_email"]
    with conn.cursor() as cur:
        cur.execute(f"""
            UPDATE {s}.admin_user_case_flags
            SET status = 'resolved', resolved_at = NOW(), resolved_by = %s
            WHERE id = {flag_id} AND status = 'open'
            RETURNING user_id, title
        """, (actor_email,))
        row = cur.fetchone()
    if not row:
        return resp({"error": "not found or already resolved"}, 404, origin)
    conn.commit()
    write_audit(conn, actor, "user.flag_resolved", row[0],
                {"status": "open"}, {"status": "resolved", "flag_id": flag_id},
                f"Flag resolved: {row[1][:60]}", ip, ua)
    conn.commit()
    return resp({"ok": True}, origin=origin)


# ── Create ticket from user profile ──────────────────────────────

def action_create_user_ticket(conn, actor: dict, body: dict, ip: str, ua: str, origin: str) -> dict:
    """Создать тикет прямо из профиля пользователя."""
    s = SCHEMA
    user_id = body.get("user_id")
    subject = (body.get("subject") or "").strip()
    if not user_id or not subject:
        return resp({"error": "user_id and subject required"}, 400, origin)
    user_id = int(user_id)

    # Берём email/name пользователя
    user = get_user_row(conn, user_id)
    if not user:
        return resp({"error": "user not found"}, 404, origin)

    actor_email = actor["actor_email"]

    # Получаем следующий ticket_no через sequences
    with conn.cursor() as cur:
        cur.execute(f"SELECT nextval('{s}.ticket_no_seq')")
        tno_num = cur.fetchone()[0]
    tno = f"TCK-{tno_num}"

    with conn.cursor() as cur:
        cur.execute(f"""
            INSERT INTO {s}.admin_tickets
              (ticket_no, status, priority, source, module_slug,
               requester_name, requester_email, requester_user_id,
               subject, body, assignee_email, owner_email,
               tags_json, created_by, updated_by)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            RETURNING id
        """, (
            tno,
            body.get("status", "new"),
            body.get("priority", "medium"),
            "admin_ui",
            body.get("module_slug", ""),
            user["name"],
            user["email"],
            user_id,
            subject,
            body.get("body", ""),
            actor_email,
            actor_email,
            "[]",
            actor_email, actor_email,
        ))
        ticket_id = cur.fetchone()[0]
    conn.commit()

    # System message
    with conn.cursor() as cur:
        cur.execute(f"""
            INSERT INTO {s}.admin_ticket_messages
              (ticket_id, message_type, author_name, author_email, body, created_by)
            VALUES ({ticket_id}, 'system_event', 'System', %s,
                    'Тикет создан из профиля пользователя', %s)
        """, (actor_email, actor_email))
    conn.commit()

    write_audit(conn, actor, "user.ticket_created", user_id,
                {}, {"ticket_id": ticket_id, "ticket_no": tno, "subject": subject[:60]},
                f"Ticket {tno}: {subject[:60]}", ip, ua)
    conn.commit()

    return resp({"ok": True, "ticket_id": ticket_id, "ticket_no": tno}, origin=origin)


# ── Access (learning + education + groups) ────────────────────────

def action_user_access(conn, user_id: int, origin: str) -> dict:
    """Сводка доступа: learning goals, last checkins, education items, groups."""
    s = SCHEMA

    with conn.cursor() as cur:
        # Learning goals
        cur.execute(f"""
            SELECT g.id, g.title, g.status, g.start_date, g.created_at, g.updated_at,
                   (SELECT COUNT(*) FROM {s}.learning_topics t WHERE t.goal_id = g.id) AS topics_total,
                   (SELECT COUNT(*) FROM {s}.learning_topics t WHERE t.goal_id = g.id AND t.status = 'completed') AS topics_done,
                   (SELECT MAX(c.created_at) FROM {s}.learning_checkins c WHERE c.goal_id = g.id) AS last_checkin_at
            FROM {s}.learning_goals g
            WHERE g.user_id = {user_id}
            ORDER BY g.created_at DESC LIMIT 20
        """)
        goals_rows = cur.fetchall()
        learning_goals = [{
            "id": r[0], "title": r[1], "status": r[2],
            "start_date": str(r[3]) if r[3] else None,
            "created_at": str(r[4]), "updated_at": str(r[5]),
            "topics_total": r[6], "topics_done": r[7],
            "last_checkin_at": str(r[8]) if r[8] else None,
        } for r in goals_rows]

        # Last checkin
        cur.execute(f"""
            SELECT c.id, c.goal_id, c.week_start, c.learned, c.next_focus, c.ai_summary, c.created_at
            FROM {s}.learning_checkins c
            WHERE c.user_id = {user_id}
            ORDER BY c.created_at DESC LIMIT 3
        """)
        checkin_rows = cur.fetchall()
        recent_checkins = [{
            "id": r[0], "goal_id": r[1],
            "week_start": str(r[2]) if r[2] else None,
            "learned": (r[3] or "")[:200],
            "next_focus": (r[4] or "")[:200],
            "ai_summary": (r[5] or "")[:200],
            "created_at": str(r[6]),
        } for r in checkin_rows]

        # Education items
        cur.execute(f"""
            SELECT id, kind, title, issuer_name, institution_name,
                   status, study_status, issued_at, end_date, is_confirmed, confidence
            FROM {s}.education_items
            WHERE user_id = {user_id} AND (archived_at IS NULL OR archived_at > NOW())
            ORDER BY issued_at DESC NULLS LAST, created_at DESC LIMIT 20
        """)
        edu_rows = cur.fetchall()
        education_items = [{
            "id": r[0], "kind": r[1], "title": r[2],
            "issuer_name": r[3], "institution_name": r[4],
            "status": r[5], "study_status": r[6],
            "issued_at": str(r[7]) if r[7] else None,
            "end_date": str(r[8]) if r[8] else None,
            "is_confirmed": r[9], "confidence": r[10],
        } for r in edu_rows]

        # Groups
        cur.execute(f"""
            SELECT id, group_key, group_label, created_at, created_by
            FROM {s}.admin_user_groups WHERE user_id = {user_id}
            ORDER BY created_at DESC
        """)
        group_rows = cur.fetchall()
        groups = [{
            "id": r[0], "group_key": r[1], "group_label": r[2],
            "created_at": str(r[3]), "created_by": r[4],
        } for r in group_rows]

        # Project memberships
        cur.execute(f"""
            SELECT pm.project_id, p.title, pm.role, pm.joined_at
            FROM {s}.project_members pm
            JOIN {s}.projects p ON p.id = pm.project_id AND p.archived_at IS NULL
            WHERE pm.user_id = {user_id}
            ORDER BY pm.joined_at DESC LIMIT 10
        """)
        proj_rows = cur.fetchall()
        projects = [{
            "project_id": r[0], "title": r[1], "role": r[2],
            "joined_at": str(r[3]) if r[3] else None,
        } for r in proj_rows]

    return resp({
        "learning_goals":   learning_goals,
        "recent_checkins":  recent_checkins,
        "education_items":  education_items,
        "groups":           groups,
        "projects":         projects,
    }, origin=origin)


def action_reopen_learning_goal(conn, actor: dict, body: dict, ip: str, ua: str, origin: str) -> dict:
    """Переоткрыть learning goal (статус → active)."""
    s = SCHEMA
    goal_id = body.get("goal_id")
    if not goal_id:
        return resp({"error": "goal_id required"}, 400, origin)
    goal_id = int(goal_id)
    actor_email = actor["actor_email"]

    with conn.cursor() as cur:
        cur.execute(f"SELECT user_id, title, status FROM {s}.learning_goals WHERE id = {goal_id}")
        row = cur.fetchone()
    if not row:
        return resp({"error": "not found"}, 404, origin)
    user_id, title, before_status = row[0], row[1], row[2]

    with conn.cursor() as cur:
        cur.execute(f"""
            UPDATE {s}.learning_goals
            SET status = 'active', updated_at = NOW()
            WHERE id = {goal_id}
        """)
    conn.commit()

    write_audit(conn, actor, "user.learning_reopened", user_id,
                {"status": before_status, "goal_title": title},
                {"status": "active", "goal_id": goal_id},
                f"Reopened: {title[:60]}", ip, ua)
    conn.commit()

    return resp({"ok": True}, origin=origin)


def action_archive_learning_goal(conn, actor: dict, body: dict, ip: str, ua: str, origin: str) -> dict:
    """Архивировать learning goal (статус → archived)."""
    s = SCHEMA
    goal_id = body.get("goal_id")
    if not goal_id:
        return resp({"error": "goal_id required"}, 400, origin)
    goal_id = int(goal_id)

    with conn.cursor() as cur:
        cur.execute(f"SELECT user_id, title, status FROM {s}.learning_goals WHERE id = {goal_id}")
        row = cur.fetchone()
    if not row:
        return resp({"error": "not found"}, 404, origin)
    user_id, title, before_status = row[0], row[1], row[2]

    with conn.cursor() as cur:
        cur.execute(f"""
            UPDATE {s}.learning_goals
            SET status = 'archived', updated_at = NOW()
            WHERE id = {goal_id}
        """)
    conn.commit()

    write_audit(conn, actor, "user.learning_archived", user_id,
                {"status": before_status, "goal_title": title},
                {"status": "archived", "goal_id": goal_id},
                f"Archived: {title[:60]}", ip, ua)
    conn.commit()

    return resp({"ok": True}, origin=origin)


def action_add_user_group(conn, actor: dict, body: dict, ip: str, ua: str, origin: str) -> dict:
    """Добавить пользователя в admin-группу."""
    s = SCHEMA
    user_id = body.get("user_id")
    group_key = (body.get("group_key") or "").strip().lower().replace(" ", "_")
    group_label = (body.get("group_label") or "").strip() or None
    if not user_id or not group_key:
        return resp({"error": "user_id and group_key required"}, 400, origin)
    user_id = int(user_id)
    actor_email = actor["actor_email"]

    with conn.cursor() as cur:
        cur.execute(f"""
            INSERT INTO {s}.admin_user_groups (user_id, group_key, group_label, created_by)
            VALUES ({user_id}, %s, %s, %s)
            ON CONFLICT (user_id, group_key) DO UPDATE SET group_label = EXCLUDED.group_label
            RETURNING id
        """, (group_key, group_label, actor_email))
        new_id = cur.fetchone()[0]
    conn.commit()

    write_audit(conn, actor, "user.group_added", user_id,
                {}, {"group_key": group_key, "group_label": group_label},
                f"Group: {group_key}", ip, ua)
    conn.commit()

    return resp({"ok": True, "id": new_id}, origin=origin)


def action_remove_user_group(conn, actor: dict, body: dict, ip: str, ua: str, origin: str) -> dict:
    """Убрать пользователя из admin-группы."""
    s = SCHEMA
    group_id = body.get("group_id")
    if not group_id:
        return resp({"error": "group_id required"}, 400, origin)
    group_id = int(group_id)

    with conn.cursor() as cur:
        cur.execute(f"SELECT user_id, group_key FROM {s}.admin_user_groups WHERE id = {group_id}")
        row = cur.fetchone()
    if not row:
        return resp({"error": "not found"}, 404, origin)
    user_id, group_key = row[0], row[1]

    with conn.cursor() as cur:
        cur.execute(f"DELETE FROM {s}.admin_user_groups WHERE id = {group_id}")
    conn.commit()

    write_audit(conn, actor, "user.group_removed", user_id,
                {"group_key": group_key}, {},
                f"Group removed: {group_key}", ip, ua)
    conn.commit()

    return resp({"ok": True}, origin=origin)


def action_block(conn, actor: dict, body: dict, ip: str, ua: str, origin: str) -> dict:
    """
    Блокировка пользователя:
    1. Upsert admin_user_flags.is_blocked = TRUE
    2. Инвалидируем ВСЕ пользовательские sessions (expires_at = now())
    3. Пишем admin_audit_log
    """
    user_id = body.get("user_id")
    reason = (body.get("reason") or "").strip()
    if not user_id:
        return resp({"error": "user_id required"}, 400, origin)
    if len(reason) < 10:
        return resp({"error": "reason must be at least 10 characters"}, 400, origin)

    user_id = int(user_id)
    s = SCHEMA
    before = get_user_row(conn, user_id)
    if not before:
        return resp({"error": "user not found"}, 404, origin)
    if before["is_blocked"]:
        return resp({"error": "already_blocked"}, 409, origin)

    r = reason.replace("'", "''")
    with conn.cursor() as cur:
        # Upsert флага блокировки
        cur.execute(f"""
            INSERT INTO {s}.admin_user_flags (user_id, is_blocked, reason, blocked_at, updated_at)
            VALUES ({user_id}, TRUE, '{r}', NOW(), NOW())
            ON CONFLICT (user_id) DO UPDATE SET
                is_blocked   = TRUE,
                reason       = '{r}',
                blocked_at   = NOW(),
                unblocked_at = NULL,
                updated_at   = NOW()
        """)

        # Инвалидируем все активные пользовательские сессии
        cur.execute(
            f"UPDATE {s}.sessions SET expires_at = NOW() "
            f"WHERE user_id = {user_id} AND expires_at > NOW()"
        )
        invalidated = cur.rowcount

    after = get_user_row(conn, user_id)
    write_audit(conn, actor, "user.block", user_id,
                {"is_blocked": False, "email": before["email"]},
                {"is_blocked": True, "reason": reason, "invalidated_sessions": invalidated},
                reason, ip, ua)
    conn.commit()

    return resp({
        "ok": True,
        "user_id": user_id,
        "invalidated_sessions": invalidated,
        "user": after,
    }, origin=origin)


def action_unblock(conn, actor: dict, body: dict, ip: str, ua: str, origin: str) -> dict:
    """Разблокировка: снимаем флаг, пишем audit."""
    user_id = body.get("user_id")
    reason = (body.get("reason") or "").strip()
    if not user_id:
        return resp({"error": "user_id required"}, 400, origin)
    if len(reason) < 10:
        return resp({"error": "reason must be at least 10 characters"}, 400, origin)

    user_id = int(user_id)
    s = SCHEMA
    before = get_user_row(conn, user_id)
    if not before:
        return resp({"error": "user not found"}, 404, origin)
    if not before["is_blocked"]:
        return resp({"error": "not_blocked"}, 409, origin)

    r = reason.replace("'", "''")
    with conn.cursor() as cur:
        cur.execute(f"""
            UPDATE {s}.admin_user_flags
            SET is_blocked = FALSE, unblocked_at = NOW(), updated_at = NOW(), reason = '{r}'
            WHERE user_id = {user_id}
        """)

    after = get_user_row(conn, user_id)
    write_audit(conn, actor, "user.unblock", user_id,
                {"is_blocked": True, "email": before["email"]},
                {"is_blocked": False, "reason": reason},
                reason, ip, ua)
    conn.commit()

    return resp({"ok": True, "user_id": user_id, "user": after}, origin=origin)


# ── Handler ───────────────────────────────────────────────────────

def handler(event: dict, context) -> dict:
    """Phase 3A admin-users: list / get / block / unblock."""
    headers = event.get("headers") or {}
    origin = headers.get("origin") or headers.get("Origin") or ""
    method = event.get("httpMethod", "GET")

    if method == "OPTIONS":
        return resp({}, 200, origin)

    # Auth
    token = headers.get("X-Admin-Token") or headers.get("x-admin-token") or ""
    conn = get_db()
    try:
        admin = get_admin_session(conn, token)
        if not admin:
            return resp({"error": "unauthorized"}, 401, origin)

        params = event.get("queryStringParameters") or {}
        action = params.get("action", "list")

        ip = (event.get("requestContext") or {}).get("identity", {}).get("sourceIp", "")
        ua = headers.get("User-Agent") or headers.get("user-agent") or ""

        body = {}
        if event.get("body"):
            try:
                body = json.loads(event["body"])
            except Exception:
                pass

        if action == "list":
            return action_list(conn, params, origin)

        if action == "get":
            uid = params.get("user_id") or body.get("user_id")
            if not uid:
                return resp({"error": "user_id required"}, 400, origin)
            return action_get(conn, int(uid), origin)

        if action == "block":
            if method != "POST":
                return resp({"error": "POST required"}, 405, origin)
            return action_block(conn, admin, body, ip, ua, origin)

        if action == "unblock":
            if method != "POST":
                return resp({"error": "POST required"}, 405, origin)
            return action_unblock(conn, admin, body, ip, ua, origin)

        # ── Notes ──────────────────────────────────────────────────────────
        if action == "user_notes":
            uid = params.get("user_id") or body.get("user_id")
            if not uid:
                return resp({"error": "user_id required"}, 400, origin)
            return action_user_notes(conn, int(uid), origin)

        if action == "add_user_note":
            if method != "POST":
                return resp({"error": "POST required"}, 405, origin)
            return action_add_user_note(conn, admin, body, ip, ua, origin)

        if action == "delete_user_note":
            if method != "POST":
                return resp({"error": "POST required"}, 405, origin)
            return action_delete_user_note(conn, admin, body, ip, ua, origin)

        # ── Case flags ─────────────────────────────────────────────────────
        if action == "user_case_flags":
            uid = params.get("user_id") or body.get("user_id")
            if not uid:
                return resp({"error": "user_id required"}, 400, origin)
            return action_user_case_flags(conn, int(uid), origin)

        if action == "add_user_case_flag":
            if method != "POST":
                return resp({"error": "POST required"}, 405, origin)
            return action_add_user_case_flag(conn, admin, body, ip, ua, origin)

        if action == "resolve_user_case_flag":
            if method != "POST":
                return resp({"error": "POST required"}, 405, origin)
            return action_resolve_user_case_flag(conn, admin, body, ip, ua, origin)

        # ── Create ticket from user profile ────────────────────────────────
        if action == "create_user_ticket":
            if method != "POST":
                return resp({"error": "POST required"}, 405, origin)
            return action_create_user_ticket(conn, admin, body, ip, ua, origin)

        # ── Access (learning + education + groups) ──────────────────────────
        if action == "user_access":
            uid = params.get("user_id") or body.get("user_id")
            if not uid:
                return resp({"error": "user_id required"}, 400, origin)
            return action_user_access(conn, int(uid), origin)

        if action == "reopen_learning_goal":
            if method != "POST":
                return resp({"error": "POST required"}, 405, origin)
            return action_reopen_learning_goal(conn, admin, body, ip, ua, origin)

        if action == "archive_learning_goal":
            if method != "POST":
                return resp({"error": "POST required"}, 405, origin)
            return action_archive_learning_goal(conn, admin, body, ip, ua, origin)

        if action == "add_user_group":
            if method != "POST":
                return resp({"error": "POST required"}, 405, origin)
            return action_add_user_group(conn, admin, body, ip, ua, origin)

        if action == "remove_user_group":
            if method != "POST":
                return resp({"error": "POST required"}, 405, origin)
            return action_remove_user_group(conn, admin, body, ip, ua, origin)

        return resp({"error": "unknown action"}, 400, origin)

    finally:
        conn.close()