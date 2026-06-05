import json
import os
import hashlib
import psycopg2

DB = os.environ["DATABASE_URL"]
_s = os.environ.get("MAIN_DB_SCHEMA", "").strip()
S = _s if _s else "t_p61016064_digital_innovation_i"

STATUSES  = ["new", "open", "pending", "waiting_user", "resolved", "closed"]
PRIORITIES = ["low", "medium", "high", "urgent"]
MSG_TYPES  = ["public_reply", "internal_note", "system_event"]


def cors(body: dict, code: int = 200) -> dict:
    return {
        "statusCode": code,
        "headers": {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, X-Admin-Token",
            "Content-Type": "application/json",
        },
        "body": json.dumps(body, ensure_ascii=False, default=str),
    }


def get_actor(conn, token: str) -> str | None:
    if not token:
        return None
    h = hashlib.sha256(token.encode()).hexdigest()
    with conn.cursor() as cur:
        cur.execute(
            f"SELECT actor_email FROM {S}.admin_sessions "
            f"WHERE session_token_hash = %s AND expires_at > NOW() AND revoked_at IS NULL LIMIT 1",
            (h,),
        )
        row = cur.fetchone()
    return row[0] if row else None


def next_ticket_no(conn) -> str:
    with conn.cursor() as cur:
        cur.execute(f"SELECT nextval('{S}.ticket_no_seq')")
        n = cur.fetchone()[0]
    return f"TCK-{n}"


def row_to_ticket(r) -> dict:
    return {
        "id": r[0], "ticket_no": r[1], "status": r[2], "priority": r[3],
        "source": r[4], "module_slug": r[5],
        "requester_name": r[6], "requester_email": r[7], "requester_user_id": r[8],
        "subject": r[9], "body": r[10],
        "assignee_email": r[11], "owner_email": r[12],
        "tags_json": r[13] or [],
        "first_response_at": str(r[14]) if r[14] else None,
        "last_message_at":   str(r[15]) if r[15] else None,
        "resolved_at":       str(r[16]) if r[16] else None,
        "closed_at":         str(r[17]) if r[17] else None,
        "created_at": str(r[18]), "created_by": r[19],
        "updated_at": str(r[20]), "updated_by": r[21],
    }


TICKET_COLS = """
    id, ticket_no, status, priority, source, module_slug,
    requester_name, requester_email, requester_user_id,
    subject, body, assignee_email, owner_email, tags_json,
    first_response_at, last_message_at, resolved_at, closed_at,
    created_at, created_by, updated_at, updated_by
"""


def handler(event: dict, context) -> dict:
    """Support Desk: tickets CRUD, messages, summary."""
    if event.get("httpMethod") == "OPTIONS":
        return cors({})

    headers = event.get("headers") or {}
    token = headers.get("x-admin-token") or headers.get("X-Admin-Token", "")

    conn = psycopg2.connect(DB)
    try:
        actor = get_actor(conn, token)
        if not actor:
            return cors({"ok": False, "error": {"message": "Не авторизован"}}, 401)

        method = event.get("httpMethod", "GET")
        qs     = event.get("queryStringParameters") or {}
        action = qs.get("action", "")
        body   = {}
        if event.get("body"):
            body = json.loads(event["body"])

        # ── SUMMARY ───────────────────────────────────────────────────────────
        if action == "tickets_summary":
            with conn.cursor() as cur:
                cur.execute(f"""
                    SELECT
                        COUNT(*) FILTER (WHERE status = 'new')                   AS new_cnt,
                        COUNT(*) FILTER (WHERE status = 'open')                  AS open_cnt,
                        COUNT(*) FILTER (WHERE status = 'waiting_user')          AS waiting_cnt,
                        COUNT(*) FILTER (WHERE priority = 'urgent'
                            AND status NOT IN ('resolved','closed'))              AS urgent_cnt,
                        COUNT(*) FILTER (WHERE assignee_email = ''
                            AND status NOT IN ('resolved','closed'))              AS unassigned_cnt,
                        COUNT(*) FILTER (WHERE status = 'resolved'
                            AND resolved_at >= NOW() - INTERVAL '24 hours')      AS resolved_today,
                        COUNT(*) FILTER (WHERE status NOT IN ('resolved','closed')) AS active_cnt
                    FROM {S}.admin_tickets
                """)
                r = cur.fetchone()
            return cors({"ok": True, "summary": {
                "new": r[0], "open": r[1], "waiting_user": r[2],
                "urgent": r[3], "unassigned": r[4],
                "resolved_today": r[5], "active": r[6],
            }})

        # ── LIST ──────────────────────────────────────────────────────────────
        if action == "tickets_all":
            filters, vals = [], []
            if qs.get("status"):
                filters.append("status = %s"); vals.append(qs["status"])
            if qs.get("priority"):
                filters.append("priority = %s"); vals.append(qs["priority"])
            if qs.get("module"):
                filters.append("module_slug = %s"); vals.append(qs["module"])
            if qs.get("assignee"):
                filters.append("assignee_email = %s"); vals.append(qs["assignee"])
            if qs.get("unassigned") == "1":
                filters.append("assignee_email = ''")
            if qs.get("urgent") == "1":
                filters.append("priority = 'urgent'")
                filters.append("status NOT IN ('resolved','closed')")
            if qs.get("q"):
                filters.append("(subject ILIKE %s OR requester_email ILIKE %s OR ticket_no ILIKE %s)")
                q = "%" + qs["q"] + "%"
                vals += [q, q, q]

            where = ("WHERE " + " AND ".join(filters)) if filters else ""
            with conn.cursor() as cur:
                cur.execute(f"SELECT {TICKET_COLS} FROM {S}.admin_tickets {where} ORDER BY CASE priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END, created_at DESC LIMIT 200", vals)
                rows = cur.fetchall()
            return cors({"ok": True, "tickets": [row_to_ticket(r) for r in rows]})

        # ── GET ONE ───────────────────────────────────────────────────────────
        if action == "ticket_get":
            tid = int(qs.get("id", 0))
            with conn.cursor() as cur:
                cur.execute(f"SELECT {TICKET_COLS} FROM {S}.admin_tickets WHERE id = %s", (tid,))
                row = cur.fetchone()
            if not row:
                return cors({"ok": False, "error": {"message": "Не найден"}}, 404)
            return cors({"ok": True, "ticket": row_to_ticket(row)})

        # ── ADD TICKET ────────────────────────────────────────────────────────
        if method == "POST" and action == "add_ticket":
            subject = body.get("subject", "").strip()
            if not subject:
                return cors({"ok": False, "error": {"message": "Нужен subject"}}, 400)
            tno = next_ticket_no(conn)
            with conn.cursor() as cur:
                cur.execute(f"""
                    INSERT INTO {S}.admin_tickets
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
                    body.get("source", "manual"),
                    body.get("module_slug", ""),
                    body.get("requester_name", ""),
                    body.get("requester_email", ""),
                    body.get("requester_user_id"),
                    subject,
                    body.get("body", ""),
                    body.get("assignee_email", ""),
                    body.get("owner_email", ""),
                    json.dumps(body.get("tags", [])),
                    actor, actor,
                ))
                new_id = cur.fetchone()[0]
            conn.commit()
            # System event
            _add_msg(conn, new_id, "system_event", "System", actor,
                     f"Тикет создан как {body.get('status','new')}", actor)
            return cors({"ok": True, "id": new_id, "ticket_no": tno})

        # ── UPDATE TICKET ─────────────────────────────────────────────────────
        if method == "PUT" and action == "update_ticket":
            tid = int(body.get("id", 0))
            allowed = ["status", "priority", "source", "module_slug",
                       "requester_name", "requester_email", "subject", "body",
                       "assignee_email", "owner_email"]
            fields, vals = [], []
            for f in allowed:
                if f in body:
                    fields.append(f"{f} = %s")
                    vals.append(body[f])

            # status-side-effects
            new_status = body.get("status")
            if new_status == "resolved":
                fields.append("resolved_at = NOW()")
            elif new_status == "closed":
                fields.append("closed_at = NOW()")

            if fields:
                vals += [actor, tid]
                with conn.cursor() as cur:
                    cur.execute(
                        f"UPDATE {S}.admin_tickets SET {', '.join(fields)}, updated_at = NOW(), updated_by = %s WHERE id = %s",
                        vals,
                    )
                conn.commit()
                if new_status:
                    _add_msg(conn, tid, "system_event", "System", actor,
                             f"Статус изменён → {new_status}", actor)
            return cors({"ok": True})

        # ── MESSAGES: GET ─────────────────────────────────────────────────────
        if action == "ticket_messages":
            tid = int(qs.get("ticket_id", 0))
            with conn.cursor() as cur:
                cur.execute(f"""
                    SELECT id, ticket_id, message_type, author_name, author_email,
                           body, created_at, created_by
                    FROM {S}.admin_ticket_messages
                    WHERE ticket_id = %s ORDER BY created_at
                """, (tid,))
                rows = cur.fetchall()
            msgs = [{
                "id": r[0], "ticket_id": r[1], "message_type": r[2],
                "author_name": r[3], "author_email": r[4], "body": r[5],
                "created_at": str(r[6]), "created_by": r[7],
            } for r in rows]
            return cors({"ok": True, "messages": msgs})

        # ── MESSAGES: ADD ─────────────────────────────────────────────────────
        if method == "POST" and action == "add_ticket_message":
            tid  = int(body.get("ticket_id", 0))
            mtyp = body.get("message_type", "public_reply")
            mbody = body.get("body", "").strip()
            if not tid or not mbody:
                return cors({"ok": False, "error": {"message": "Нужны ticket_id и body"}}, 400)
            if mtyp not in MSG_TYPES:
                mtyp = "public_reply"
            _add_msg(conn, tid, mtyp,
                     body.get("author_name", actor),
                     body.get("author_email", actor),
                     mbody, actor)
            # Обновляем last_message_at + first_response_at
            with conn.cursor() as cur:
                cur.execute(f"""
                    UPDATE {S}.admin_tickets
                    SET last_message_at = NOW(),
                        updated_at = NOW(), updated_by = %s,
                        first_response_at = COALESCE(first_response_at, CASE WHEN %s = 'public_reply' THEN NOW() END)
                    WHERE id = %s
                """, (actor, mtyp, tid))
            conn.commit()
            return cors({"ok": True})

        return cors({"ok": False, "error": {"message": "Неизвестное действие"}}, 400)

    finally:
        conn.close()


def _add_msg(conn, ticket_id: int, mtype: str,
             aname: str, aemail: str, mbody: str, created_by: str):
    with conn.cursor() as cur:
        cur.execute(f"""
            INSERT INTO {S}.admin_ticket_messages
              (ticket_id, message_type, author_name, author_email, body, created_by)
            VALUES (%s,%s,%s,%s,%s,%s)
        """, (ticket_id, mtype, aname, aemail, mbody, created_by))
    conn.commit()
