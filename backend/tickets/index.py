import json
import os
import hashlib
import psycopg2
from datetime import datetime, timezone

DB = os.environ["DATABASE_URL"]
_s = os.environ.get("MAIN_DB_SCHEMA", "").strip()
S = _s if _s else "t_p61016064_digital_innovation_i"

STATUSES  = ["new", "open", "pending", "waiting_user", "resolved", "closed"]
PRIORITIES = ["low", "medium", "high", "urgent"]
MSG_TYPES  = ["public_reply", "internal_note", "system_event"]

# SLA limits (calendar hours, no business-hours)
SLA_RESPONSE_H  = {"urgent": 2,  "high": 8,  "medium": 24, "low": 72}
SLA_RESOLVE_H   = {"urgent": 8,  "high": 24, "medium": 72, "low": 168}


def _sla_state(created_at_str: str, priority: str,
               first_response_at: str | None, resolved_at: str | None) -> dict:
    """Вычисляет SLA-состояние тикета без сохранения в БД."""
    now = datetime.now(timezone.utc)

    def parse(s):
        if not s:
            return None
        try:
            dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
            return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
        except Exception:
            return None

    created = parse(created_at_str)
    if not created:
        return {"sla_state": "ok", "is_overdue": False, "age_hours": 0,
                "response_due_at": None, "resolve_due_at": None}

    age_h = (now - created).total_seconds() / 3600
    resp_h = SLA_RESPONSE_H.get(priority, 24)
    res_h  = SLA_RESOLVE_H.get(priority, 72)

    from datetime import timedelta
    resp_due = created + timedelta(hours=resp_h)
    res_due  = created + timedelta(hours=res_h)

    # Если уже ответили — response SLA закрыт
    resp_ok = first_response_at is not None
    is_resolved = resolved_at is not None

    # Определяем активный дедлайн
    if is_resolved:
        sla_state = "ok"
        is_overdue = False
    elif not resp_ok and now > resp_due:
        sla_state = "overdue"
        is_overdue = True
    elif not is_resolved and now > res_due:
        sla_state = "overdue"
        is_overdue = True
    elif not resp_ok and (resp_due - now).total_seconds() < 3600:
        sla_state = "due_soon"
        is_overdue = False
    elif (res_due - now).total_seconds() < 3600 * 4:
        sla_state = "due_soon"
        is_overdue = False
    else:
        sla_state = "ok"
        is_overdue = False

    return {
        "sla_state":      sla_state,
        "is_overdue":     is_overdue,
        "age_hours":      round(age_h, 1),
        "response_due_at": resp_due.isoformat(),
        "resolve_due_at":  res_due.isoformat(),
        "resp_sla_met":    resp_ok,
    }


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


def _audit(conn, actor: str, action: str,
           entity_type: str, entity_id: int,
           before: dict, after: dict, reason: str = "") -> None:
    with conn.cursor() as cur:
        cur.execute(
            f"INSERT INTO {S}.admin_audit_log "
            f"(actor_email, actor_role, action, entity_type, entity_id, "
            f"before_json, after_json, reason) "
            f"VALUES (%s,'super_admin',%s,%s,%s,%s,%s,%s)",
            (actor, action, entity_type, entity_id,
             json.dumps(before, default=str),
             json.dumps(after, default=str),
             reason),
        )
    conn.commit()


def next_ticket_no(conn) -> str:
    with conn.cursor() as cur:
        cur.execute(f"SELECT nextval('{S}.ticket_no_seq')")
        n = cur.fetchone()[0]
    return f"TCK-{n}"


def row_to_ticket(r) -> dict:
    created_at  = str(r[18])
    priority    = r[3]
    first_resp  = str(r[14]) if r[14] else None
    resolved_at = str(r[16]) if r[16] else None

    sla = _sla_state(created_at, priority, first_resp, resolved_at)

    return {
        "id": r[0], "ticket_no": r[1], "status": r[2], "priority": r[3],
        "source": r[4], "module_slug": r[5],
        "requester_name": r[6], "requester_email": r[7], "requester_user_id": r[8],
        "subject": r[9], "body": r[10],
        "assignee_email": r[11], "owner_email": r[12],
        "tags_json": r[13] or [],
        "first_response_at": first_resp,
        "last_message_at":   str(r[15]) if r[15] else None,
        "resolved_at":       resolved_at,
        "closed_at":         str(r[17]) if r[17] else None,
        "created_at": created_at, "created_by": r[19],
        "updated_at": str(r[20]), "updated_by": r[21],
        # SLA (computed)
        **sla,
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
                        COUNT(*) FILTER (WHERE status NOT IN ('resolved','closed')) AS active_cnt,
                        COUNT(*) FILTER (WHERE status NOT IN ('resolved','closed') AND (
                            (priority = 'urgent' AND created_at < NOW() - INTERVAL '8 hours') OR
                            (priority = 'high'   AND created_at < NOW() - INTERVAL '24 hours') OR
                            (priority = 'medium' AND created_at < NOW() - INTERVAL '72 hours') OR
                            (priority = 'low'    AND created_at < NOW() - INTERVAL '168 hours')
                        ))                                                        AS overdue_cnt
                    FROM {S}.admin_tickets
                """)
                r = cur.fetchone()
            return cors({"ok": True, "summary": {
                "new": r[0], "open": r[1], "waiting_user": r[2],
                "urgent": r[3], "unassigned": r[4],
                "resolved_today": r[5], "active": r[6], "overdue": r[7],
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
                filters.append("status NOT IN ('resolved','closed')")
            if qs.get("urgent") == "1":
                filters.append("priority = 'urgent'")
                filters.append("status NOT IN ('resolved','closed')")
            if qs.get("queue") == "overdue":
                # Просрочены по SLA: дольше чем resolve_sla с момента created_at
                filters.append("""status NOT IN ('resolved','closed') AND (
                    (priority = 'urgent'  AND created_at < NOW() - INTERVAL '8 hours') OR
                    (priority = 'high'    AND created_at < NOW() - INTERVAL '24 hours') OR
                    (priority = 'medium'  AND created_at < NOW() - INTERVAL '72 hours') OR
                    (priority = 'low'     AND created_at < NOW() - INTERVAL '168 hours')
                )""")
            elif qs.get("queue") == "due_soon":
                filters.append("""status NOT IN ('resolved','closed') AND (
                    (priority = 'urgent'  AND created_at BETWEEN NOW() - INTERVAL '8 hours'   AND NOW() - INTERVAL '4 hours') OR
                    (priority = 'high'    AND created_at BETWEEN NOW() - INTERVAL '24 hours'  AND NOW() - INTERVAL '20 hours') OR
                    (priority = 'medium'  AND created_at BETWEEN NOW() - INTERVAL '72 hours'  AND NOW() - INTERVAL '68 hours') OR
                    (priority = 'low'     AND created_at BETWEEN NOW() - INTERVAL '168 hours' AND NOW() - INTERVAL '164 hours')
                )""")
            elif qs.get("queue") == "waiting_user":
                filters.append("status = 'waiting_user'")
            if qs.get("q"):
                filters.append("(subject ILIKE %s OR requester_email ILIKE %s OR ticket_no ILIKE %s)")
                q = "%" + qs["q"] + "%"
                vals += [q, q, q]

            where = ("WHERE " + " AND ".join(filters)) if filters else ""
            with conn.cursor() as cur:
                cur.execute(
                    f"SELECT {TICKET_COLS} FROM {S}.admin_tickets {where} "
                    f"ORDER BY CASE priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END, created_at DESC "
                    f"LIMIT 200",
                    vals,
                )
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
            audit_fields = ["status", "priority", "assignee_email"]
            allowed = ["status", "priority", "source", "module_slug",
                       "requester_name", "requester_email", "subject", "body",
                       "assignee_email", "owner_email"]

            # Снимаем before для audit-полей
            with conn.cursor() as cur:
                cur.execute(
                    f"SELECT ticket_no, status, priority, assignee_email FROM {S}.admin_tickets WHERE id = %s",
                    (tid,),
                )
                before_row = cur.fetchone()
            before_snap = {}
            if before_row:
                before_snap = {"ticket_no": before_row[0], "status": before_row[1],
                               "priority": before_row[2], "assignee_email": before_row[3]}

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

                # Audit: логируем только если изменилось значимое поле
                after_snap = {f: body[f] for f in audit_fields if f in body}
                if after_snap:
                    changed = {f: v for f, v in after_snap.items()
                               if v != before_snap.get(f)}
                    if changed:
                        action_name = (
                            "ticket.status_changed"   if "status"         in changed else
                            "ticket.priority_changed" if "priority"       in changed else
                            "ticket.assignee_changed"
                        )
                        _audit(conn, actor, action_name, "ticket", tid,
                               {f: before_snap.get(f) for f in changed},
                               changed,
                               reason=before_snap.get("ticket_no", ""))

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

        # ── BULK ACTIONS ──────────────────────────────────────────────────────
        if method == "POST" and action == "bulk_tickets":
            ids = body.get("ids", [])
            op  = body.get("op", "")   # assign | status | priority
            if not ids or not op:
                return cors({"ok": False, "error": {"message": "ids and op required"}}, 400)
            ids_clean = [int(i) for i in ids if str(i).isdigit()]
            if not ids_clean:
                return cors({"ok": False, "error": {"message": "no valid ids"}}, 400)
            ids_sql = ",".join(str(i) for i in ids_clean)

            if op == "assign":
                assignee = body.get("assignee_email", "").strip()
                with conn.cursor() as cur:
                    cur.execute(
                        f"UPDATE {S}.admin_tickets SET assignee_email = %s, updated_at = NOW(), updated_by = %s "
                        f"WHERE id IN ({ids_sql})",
                        (assignee, actor),
                    )
                conn.commit()
                _audit(conn, actor, "ticket.bulk_assigned", "ticket", 0,
                       {}, {"ids": ids_clean, "assignee_email": assignee},
                       reason=f"bulk assign {len(ids_clean)} tickets")

            elif op == "status":
                new_status = body.get("status", "")
                if new_status not in STATUSES:
                    return cors({"ok": False, "error": {"message": "invalid status"}}, 400)
                extra = ""
                if new_status == "resolved":
                    extra = ", resolved_at = NOW()"
                elif new_status == "closed":
                    extra = ", closed_at = NOW()"
                with conn.cursor() as cur:
                    cur.execute(
                        f"UPDATE {S}.admin_tickets SET status = %s{extra}, updated_at = NOW(), updated_by = %s "
                        f"WHERE id IN ({ids_sql})",
                        (new_status, actor),
                    )
                conn.commit()
                _audit(conn, actor, "ticket.bulk_status_changed", "ticket", 0,
                       {}, {"ids": ids_clean, "status": new_status},
                       reason=f"bulk status→{new_status} {len(ids_clean)} tickets")

            elif op == "priority":
                new_prio = body.get("priority", "")
                if new_prio not in PRIORITIES:
                    return cors({"ok": False, "error": {"message": "invalid priority"}}, 400)
                with conn.cursor() as cur:
                    cur.execute(
                        f"UPDATE {S}.admin_tickets SET priority = %s, updated_at = NOW(), updated_by = %s "
                        f"WHERE id IN ({ids_sql})",
                        (new_prio, actor),
                    )
                conn.commit()
                _audit(conn, actor, "ticket.bulk_priority_changed", "ticket", 0,
                       {}, {"ids": ids_clean, "priority": new_prio},
                       reason=f"bulk priority→{new_prio} {len(ids_clean)} tickets")

            else:
                return cors({"ok": False, "error": {"message": "unknown op"}}, 400)

            return cors({"ok": True, "updated": len(ids_clean)})

        # ── SAVED VIEWS ───────────────────────────────────────────────────────
        if action == "views_list":
            with conn.cursor() as cur:
                cur.execute(f"""
                    SELECT id, name, description, scope, filters,
                           order_index, use_count, last_used_at,
                           created_at, created_by, updated_at, updated_by
                    FROM {S}.ticket_saved_views
                    WHERE scope = 'shared' OR created_by = %s
                    ORDER BY scope DESC, order_index, created_at
                """, (actor,))
                rows = cur.fetchall()
            views = [{
                "id": r[0], "name": r[1], "description": r[2], "scope": r[3],
                "filters": r[4] if isinstance(r[4], dict) else {},
                "order_index": r[5], "use_count": r[6],
                "last_used_at": str(r[7]) if r[7] else None,
                "created_at": str(r[8]), "created_by": r[9],
                "updated_at": str(r[10]), "updated_by": r[11],
                "is_mine": r[9] == actor,
            } for r in rows]
            return cors({"ok": True, "views": views})

        if method == "POST" and action == "views_create":
            name = (body.get("name") or "").strip()
            if not name:
                return cors({"ok": False, "error": {"message": "name required"}}, 400)
            scope       = body.get("scope", "personal")
            if scope not in ("personal", "shared"):
                scope = "personal"
            description = (body.get("description") or "").strip()
            filters     = body.get("filters") or {}
            order_index = int(body.get("order_index", 0))
            with conn.cursor() as cur:
                cur.execute(f"""
                    INSERT INTO {S}.ticket_saved_views
                      (name, description, scope, filters, order_index, created_by, updated_by)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    RETURNING id
                """, (name, description, scope,
                      json.dumps(filters, ensure_ascii=False),
                      order_index, actor, actor))
                new_id = cur.fetchone()[0]
            conn.commit()
            return cors({"ok": True, "id": new_id})

        if method == "POST" and action == "views_update":
            vid = body.get("id")
            if not vid:
                return cors({"ok": False, "error": {"message": "id required"}}, 400)
            vid = int(vid)
            fields, vals = [], []
            if "name" in body:
                fields.append("name = %s"); vals.append(body["name"])
            if "description" in body:
                fields.append("description = %s"); vals.append(body["description"])
            if "scope" in body and body["scope"] in ("personal", "shared"):
                fields.append("scope = %s"); vals.append(body["scope"])
            if "filters" in body:
                fields.append("filters = %s"); vals.append(json.dumps(body["filters"], ensure_ascii=False))
            if "order_index" in body:
                fields.append("order_index = %s"); vals.append(int(body["order_index"]))
            if not fields:
                return cors({"ok": True})
            fields.append("updated_at = NOW()"); fields.append("updated_by = %s")
            vals += [actor, vid]
            with conn.cursor() as cur:
                cur.execute(
                    f"UPDATE {S}.ticket_saved_views SET {', '.join(fields)} WHERE id = %s AND created_by = %s",
                    vals + [actor],
                )
            conn.commit()
            return cors({"ok": True})

        if method == "POST" and action == "views_delete":
            vid = body.get("id")
            if not vid:
                return cors({"ok": False, "error": {"message": "id required"}}, 400)
            with conn.cursor() as cur:
                cur.execute(
                    f"DELETE FROM {S}.ticket_saved_views WHERE id = %s AND created_by = %s",
                    (int(vid), actor),
                )
            conn.commit()
            return cors({"ok": True})

        if method == "POST" and action == "views_use":
            vid = body.get("id")
            if not vid:
                return cors({"ok": False, "error": {"message": "id required"}}, 400)
            with conn.cursor() as cur:
                cur.execute(
                    f"UPDATE {S}.ticket_saved_views SET use_count = use_count + 1, last_used_at = NOW() WHERE id = %s",
                    (int(vid),),
                )
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