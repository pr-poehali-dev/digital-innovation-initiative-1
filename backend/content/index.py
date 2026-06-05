import json
import os
import hashlib
import re
import psycopg2

DB = os.environ["DATABASE_URL"]
_s = os.environ.get("MAIN_DB_SCHEMA", "").strip()
S = _s if _s else "t_p61016064_digital_innovation_i"

CONTENT_TYPES    = ["announcement", "release_note", "faq", "guide", "article", "template"]
CONTENT_STATUSES = ["draft", "review", "published", "archived"]
COMM_CHANNELS    = ["in_app", "email", "system"]
COMM_STATUSES    = ["draft", "scheduled", "sent", "failed", "cancelled"]
AUDIENCES        = ["all", "learners", "admins", "support", "project_team"]
EVENT_TYPES      = ["queued", "sent", "delivered", "failed", "opened", "clicked"]


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


def slugify(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"[\s_-]+", "-", text)
    return text[:80]


def next_no(conn, seq: str) -> str:
    prefix = "CNT" if "content" in seq else "COM"
    with conn.cursor() as cur:
        cur.execute(f"SELECT nextval('{S}.{seq}')")
        n = cur.fetchone()[0]
    return f"{prefix}-{n}"


CONTENT_COLS = """
    id, content_no, type, status, title, slug, summary, body_markdown,
    module_slug, audience, tags_json, published_at,
    created_at, created_by, updated_at, updated_by
"""

COMM_COLS = """
    id, comm_no, content_item_id, channel, status, audience,
    subject, body, module_slug, scheduled_at, sent_at,
    created_at, created_by, updated_at, updated_by
"""


def row_to_content(r) -> dict:
    return {
        "id": r[0], "content_no": r[1], "type": r[2], "status": r[3],
        "title": r[4], "slug": r[5], "summary": r[6], "body_markdown": r[7],
        "module_slug": r[8], "audience": r[9],
        "tags_json": r[10] or [],
        "published_at": str(r[11]) if r[11] else None,
        "created_at": str(r[12]), "created_by": r[13],
        "updated_at": str(r[14]), "updated_by": r[15],
    }


def row_to_comm(r) -> dict:
    return {
        "id": r[0], "comm_no": r[1], "content_item_id": r[2],
        "channel": r[3], "status": r[4], "audience": r[5],
        "subject": r[6], "body": r[7], "module_slug": r[8],
        "scheduled_at": str(r[9]) if r[9] else None,
        "sent_at": str(r[10]) if r[10] else None,
        "created_at": str(r[11]), "created_by": r[12],
        "updated_at": str(r[13]), "updated_by": r[14],
    }


def handler(event: dict, context) -> dict:
    """Content Registry + Communications Log: CRUD, publish, send, events."""
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

        # ════════════════════════════════════════════════════════════════════
        # CONTENT
        # ════════════════════════════════════════════════════════════════════

        if action == "content_summary":
            with conn.cursor() as cur:
                cur.execute(f"""
                    SELECT
                        COUNT(*) FILTER (WHERE status = 'draft')     AS draft_cnt,
                        COUNT(*) FILTER (WHERE status = 'review')    AS review_cnt,
                        COUNT(*) FILTER (WHERE status = 'published') AS published_cnt,
                        COUNT(*) FILTER (WHERE status = 'archived')  AS archived_cnt,
                        COUNT(*) FILTER (WHERE status = 'published'
                            AND published_at >= NOW() - INTERVAL '7 days') AS published_week
                    FROM {S}.admin_content_items
                """)
                r = cur.fetchone()
            return cors({"ok": True, "summary": {
                "draft": r[0], "review": r[1], "published": r[2],
                "archived": r[3], "published_week": r[4],
            }})

        if action == "content_list":
            filters, vals = [], []
            if qs.get("status"):   filters.append("status = %s");      vals.append(qs["status"])
            if qs.get("type"):     filters.append("type = %s");         vals.append(qs["type"])
            if qs.get("module"):   filters.append("module_slug = %s");  vals.append(qs["module"])
            if qs.get("audience"): filters.append("audience = %s");     vals.append(qs["audience"])
            if qs.get("q"):
                filters.append("(title ILIKE %s OR summary ILIKE %s OR content_no ILIKE %s)")
                q = "%" + qs["q"] + "%"
                vals += [q, q, q]
            where = ("WHERE " + " AND ".join(filters)) if filters else ""
            with conn.cursor() as cur:
                cur.execute(
                    f"SELECT {CONTENT_COLS} FROM {S}.admin_content_items {where} "
                    f"ORDER BY updated_at DESC LIMIT 100",
                    vals,
                )
                rows = cur.fetchall()
            return cors({"ok": True, "items": [row_to_content(r) for r in rows]})

        if action == "content_get":
            cid = int(qs.get("id", 0))
            with conn.cursor() as cur:
                cur.execute(f"SELECT {CONTENT_COLS} FROM {S}.admin_content_items WHERE id = %s", (cid,))
                row = cur.fetchone()
            if not row:
                return cors({"ok": False, "error": {"message": "Не найден"}}, 404)
            return cors({"ok": True, "item": row_to_content(row)})

        if method == "POST" and action == "add_content":
            title = body.get("title", "").strip()
            if not title:
                return cors({"ok": False, "error": {"message": "Нужен title"}}, 400)
            cno  = next_no(conn, "content_no_seq")
            slug = body.get("slug") or slugify(title)
            with conn.cursor() as cur:
                cur.execute(f"""
                    INSERT INTO {S}.admin_content_items
                      (content_no, type, status, title, slug, summary, body_markdown,
                       module_slug, audience, tags_json, created_by, updated_by)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                    RETURNING id
                """, (
                    cno,
                    body.get("type", "announcement"),
                    body.get("status", "draft"),
                    title, slug,
                    body.get("summary", ""),
                    body.get("body_markdown", ""),
                    body.get("module_slug", ""),
                    body.get("audience", "all"),
                    json.dumps(body.get("tags", [])),
                    actor, actor,
                ))
                new_id = cur.fetchone()[0]
            conn.commit()
            return cors({"ok": True, "id": new_id, "content_no": cno})

        if method in ("POST", "PUT") and action == "update_content":
            cid = int(body.get("id", 0))
            allowed = ["type", "status", "title", "slug", "summary",
                       "body_markdown", "module_slug", "audience"]
            fields, vals = [], []
            for f in allowed:
                if f in body:
                    fields.append(f"{f} = %s"); vals.append(body[f])
            if "tags" in body:
                fields.append("tags_json = %s"); vals.append(json.dumps(body["tags"]))
            if fields:
                vals += [actor, cid]
                with conn.cursor() as cur:
                    cur.execute(
                        f"UPDATE {S}.admin_content_items SET {', '.join(fields)}, "
                        f"updated_at = NOW(), updated_by = %s WHERE id = %s",
                        vals,
                    )
                conn.commit()
            return cors({"ok": True})

        if method == "POST" and action == "publish_content":
            cid = int(body.get("id", 0))
            with conn.cursor() as cur:
                cur.execute(
                    f"UPDATE {S}.admin_content_items "
                    f"SET status = 'published', published_at = NOW(), updated_at = NOW(), updated_by = %s "
                    f"WHERE id = %s AND status != 'published'",
                    (actor, cid),
                )
            conn.commit()
            return cors({"ok": True})

        if method == "POST" and action == "archive_content":
            cid = int(body.get("id", 0))
            with conn.cursor() as cur:
                cur.execute(
                    f"UPDATE {S}.admin_content_items "
                    f"SET status = 'archived', updated_at = NOW(), updated_by = %s WHERE id = %s",
                    (actor, cid),
                )
            conn.commit()
            return cors({"ok": True})

        # ════════════════════════════════════════════════════════════════════
        # COMMUNICATIONS
        # ════════════════════════════════════════════════════════════════════

        if action == "communications_summary":
            with conn.cursor() as cur:
                cur.execute(f"""
                    SELECT
                        COUNT(*) FILTER (WHERE status = 'draft')      AS draft_cnt,
                        COUNT(*) FILTER (WHERE status = 'scheduled')  AS scheduled_cnt,
                        COUNT(*) FILTER (WHERE status = 'sent'
                            AND sent_at >= NOW() - INTERVAL '24 hours') AS sent_today,
                        COUNT(*) FILTER (WHERE status = 'failed')     AS failed_cnt,
                        COUNT(*) FILTER (WHERE status = 'sent')       AS sent_total
                    FROM {S}.admin_communications
                """)
                r = cur.fetchone()
            return cors({"ok": True, "summary": {
                "draft": r[0], "scheduled": r[1], "sent_today": r[2],
                "failed": r[3], "sent_total": r[4],
            }})

        if action == "communications_list":
            filters, vals = [], []
            if qs.get("status"):   filters.append("status = %s");     vals.append(qs["status"])
            if qs.get("channel"):  filters.append("channel = %s");    vals.append(qs["channel"])
            if qs.get("module"):   filters.append("module_slug = %s");vals.append(qs["module"])
            if qs.get("audience"): filters.append("audience = %s");   vals.append(qs["audience"])
            if qs.get("q"):
                filters.append("(subject ILIKE %s OR comm_no ILIKE %s)")
                q = "%" + qs["q"] + "%"
                vals += [q, q]
            where = ("WHERE " + " AND ".join(filters)) if filters else ""
            with conn.cursor() as cur:
                cur.execute(
                    f"SELECT {COMM_COLS} FROM {S}.admin_communications {where} "
                    f"ORDER BY updated_at DESC LIMIT 100",
                    vals,
                )
                rows = cur.fetchall()
            return cors({"ok": True, "communications": [row_to_comm(r) for r in rows]})

        if action == "communication_get":
            cid = int(qs.get("id", 0))
            with conn.cursor() as cur:
                cur.execute(f"SELECT {COMM_COLS} FROM {S}.admin_communications WHERE id = %s", (cid,))
                row = cur.fetchone()
            if not row:
                return cors({"ok": False, "error": {"message": "Не найден"}}, 404)
            return cors({"ok": True, "communication": row_to_comm(row)})

        if method == "POST" and action == "add_communication":
            subject = body.get("subject", "").strip()
            if not subject:
                return cors({"ok": False, "error": {"message": "Нужен subject"}}, 400)
            cno = next_no(conn, "comm_no_seq")
            with conn.cursor() as cur:
                cur.execute(f"""
                    INSERT INTO {S}.admin_communications
                      (comm_no, content_item_id, channel, status, audience,
                       subject, body, module_slug, scheduled_at, created_by, updated_by)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                    RETURNING id
                """, (
                    cno,
                    body.get("content_item_id"),
                    body.get("channel", "in_app"),
                    body.get("status", "draft"),
                    body.get("audience", "all"),
                    subject,
                    body.get("body", ""),
                    body.get("module_slug", ""),
                    body.get("scheduled_at"),
                    actor, actor,
                ))
                new_id = cur.fetchone()[0]
            conn.commit()
            return cors({"ok": True, "id": new_id, "comm_no": cno})

        if method in ("POST", "PUT") and action == "update_communication":
            cid = int(body.get("id", 0))
            allowed = ["channel", "status", "audience", "subject", "body", "module_slug"]
            fields, vals = [], []
            for f in allowed:
                if f in body:
                    fields.append(f"{f} = %s"); vals.append(body[f])
            if "scheduled_at" in body:
                fields.append("scheduled_at = %s"); vals.append(body["scheduled_at"])
            if "content_item_id" in body:
                fields.append("content_item_id = %s"); vals.append(body["content_item_id"])
            if fields:
                vals += [actor, cid]
                with conn.cursor() as cur:
                    cur.execute(
                        f"UPDATE {S}.admin_communications SET {', '.join(fields)}, "
                        f"updated_at = NOW(), updated_by = %s WHERE id = %s",
                        vals,
                    )
                conn.commit()
            return cors({"ok": True})

        if method == "POST" and action == "send_communication":
            cid = int(body.get("id", 0))
            with conn.cursor() as cur:
                cur.execute(
                    f"UPDATE {S}.admin_communications "
                    f"SET status = 'sent', sent_at = NOW(), updated_at = NOW(), updated_by = %s "
                    f"WHERE id = %s AND status NOT IN ('sent','cancelled')",
                    (actor, cid),
                )
            conn.commit()
            _add_event(conn, cid, "sent", None, {}, actor)
            return cors({"ok": True})

        if method == "POST" and action == "cancel_communication":
            cid = int(body.get("id", 0))
            with conn.cursor() as cur:
                cur.execute(
                    f"UPDATE {S}.admin_communications "
                    f"SET status = 'cancelled', updated_at = NOW(), updated_by = %s "
                    f"WHERE id = %s AND status NOT IN ('sent','cancelled')",
                    (actor, cid),
                )
            conn.commit()
            _add_event(conn, cid, "failed", "cancelled_by_user", {}, actor)
            return cors({"ok": True})

        if action == "communication_events":
            cid = int(qs.get("communication_id", 0))
            with conn.cursor() as cur:
                cur.execute(f"""
                    SELECT id, communication_id, event_type, event_value, meta_json, created_at, created_by
                    FROM {S}.admin_communication_events
                    WHERE communication_id = %s ORDER BY created_at
                """, (cid,))
                rows = cur.fetchall()
            events = [{
                "id": r[0], "communication_id": r[1], "event_type": r[2],
                "event_value": r[3], "meta_json": r[4] or {},
                "created_at": str(r[5]), "created_by": r[6],
            } for r in rows]
            return cors({"ok": True, "events": events})

        return cors({"ok": False, "error": {"message": "Неизвестное действие"}}, 400)

    finally:
        conn.close()


def _add_event(conn, comm_id: int, etype: str, evalue, meta: dict, actor: str):
    with conn.cursor() as cur:
        cur.execute(f"""
            INSERT INTO {S}.admin_communication_events
              (communication_id, event_type, event_value, meta_json, created_by)
            VALUES (%s,%s,%s,%s,%s)
        """, (comm_id, etype, evalue, json.dumps(meta), actor))
    conn.commit()
