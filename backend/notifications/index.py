"""
Уведомления пользователя (колокольчик в шапке).

ВСЕ запросы: POST / с обязательным полем action.
Поддерживаемые action:
  - notification.list        — список уведомлений текущего пользователя (последние 30)
  - notification.mark_read   — отметить одно уведомление прочитанным (требует notification_id)
  - notification.mark_all_read — отметить все уведомления прочитанными

Формат ответа:
  Success: {"ok": true, "data": {...}}
  Error:   {"ok": false, "error": {"code": "...", "message": "..."}}
"""
import json
import os
import uuid
import psycopg2

ALLOWED_ACTIONS = {
    "notification.list",
    "notification.mark_read",
    "notification.mark_all_read",
}

ALLOWED_ORIGINS = {
    "https://raven.moscow",
    "https://www.raven.moscow",
    "https://docmind.ai",
    "https://digital-innovation-initiative-1--preview.poehali.dev",
    "https://poehali.dev",
    "http://localhost:5173",
    "http://localhost:3000",
}


def get_db():
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    conn.autocommit = False
    return conn


def get_schema():
    return os.environ.get("MAIN_DB_SCHEMA", "public")


def _is_allowed_origin(origin: str) -> bool:
    if not origin:
        return False
    if origin in ALLOWED_ORIGINS:
        return True
    try:
        from urllib.parse import urlparse
        parsed = urlparse(origin)
        if parsed.scheme not in ("https", "http"):
            return False
        hostname = (parsed.hostname or "").lower()
        if hostname == "poehali.dev" or hostname.endswith(".poehali.dev"):
            return True
        return False
    except Exception:
        return False


def cors_headers(origin: str = None):
    headers = {
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-Session-Id",
        "Vary": "Origin",
    }
    if _is_allowed_origin(origin):
        headers["Access-Control-Allow-Origin"] = origin
    return headers


def ok_response(data, request_id, origin=None):
    return {
        "statusCode": 200,
        "headers": {**cors_headers(origin), "Content-Type": "application/json", "X-Request-Id": request_id, "X-Api-Version": "v1"},
        "body": json.dumps({"ok": True, "request_id": request_id, "data": data}, ensure_ascii=False, default=str),
    }


def err_response(code, message, status, request_id, origin=None):
    return {
        "statusCode": status,
        "headers": {**cors_headers(origin), "Content-Type": "application/json", "X-Request-Id": request_id, "X-Api-Version": "v1"},
        "body": json.dumps({"ok": False, "request_id": request_id, "error": {"code": code, "message": message}}, ensure_ascii=False),
    }


def get_current_user(conn, session_id):
    if not session_id:
        return None
    schema = get_schema()
    cur = conn.cursor()
    cur.execute(
        f"SELECT u.id FROM {schema}.sessions s JOIN {schema}.users u ON u.id = s.user_id WHERE s.id = %s AND s.expires_at > NOW()",
        (session_id,),
    )
    row = cur.fetchone()
    return {"id": row[0]} if row else None


def handle_list(conn, user, request_id, origin=None):
    schema = get_schema()
    cur = conn.cursor()
    cur.execute(
        f"""SELECT id, type, title, message, project_id, link, is_read, created_at
            FROM {schema}.notifications
            WHERE user_id = %s
            ORDER BY created_at DESC
            LIMIT 30""",
        (user["id"],),
    )
    items = [
        {
            "id": r[0], "type": r[1], "title": r[2], "message": r[3],
            "project_id": r[4], "link": r[5], "is_read": r[6], "created_at": str(r[7]),
        }
        for r in cur.fetchall()
    ]
    cur.execute(
        f"SELECT COUNT(*) FROM {schema}.notifications WHERE user_id = %s AND is_read = FALSE",
        (user["id"],),
    )
    unread_count = cur.fetchone()[0]
    return ok_response({"items": items, "unread_count": unread_count}, request_id, origin=origin)


def handle_mark_read(conn, user, body, request_id, origin=None):
    schema = get_schema()
    notification_id = body.get("notification_id")
    if not notification_id:
        return err_response("validation_error", "Поле notification_id обязательно", 400, request_id, origin=origin)
    cur = conn.cursor()
    cur.execute(
        f"UPDATE {schema}.notifications SET is_read = TRUE WHERE id = %s AND user_id = %s",
        (int(notification_id), user["id"]),
    )
    conn.commit()
    return ok_response({"ok": True}, request_id, origin=origin)


def handle_mark_all_read(conn, user, request_id, origin=None):
    schema = get_schema()
    cur = conn.cursor()
    cur.execute(
        f"UPDATE {schema}.notifications SET is_read = TRUE WHERE user_id = %s AND is_read = FALSE",
        (user["id"],),
    )
    conn.commit()
    return ok_response({"ok": True}, request_id, origin=origin)


def handler(event: dict, context) -> dict:
    origin = (event.get("headers") or {}).get("Origin") or (event.get("headers") or {}).get("origin")
    request_id = getattr(context, "request_id", None) or str(uuid.uuid4())

    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": cors_headers(origin), "body": ""}

    method = event.get("httpMethod", "GET")
    if method != "POST":
        return err_response("method_not_allowed", "Используйте POST", 405, request_id, origin=origin)

    body = {}
    if event.get("body"):
        try:
            body = json.loads(event["body"])
        except Exception:
            return err_response("invalid_json", "Тело запроса не является JSON", 400, request_id, origin=origin)

    action = body.get("action", "")
    if action not in ALLOWED_ACTIONS:
        return err_response(
            "unknown_action",
            f"Неизвестное action. Допустимые: {sorted(ALLOWED_ACTIONS)}",
            400,
            request_id,
            origin=origin,
        )

    session_id = event.get("headers", {}).get("X-Session-Id", "")
    conn = get_db()
    try:
        user = get_current_user(conn, session_id)
        if not user:
            return err_response("auth_required", "Требуется авторизация", 401, request_id, origin=origin)

        if action == "notification.list":
            return handle_list(conn, user, request_id, origin=origin)
        if action == "notification.mark_read":
            return handle_mark_read(conn, user, body, request_id, origin=origin)
        if action == "notification.mark_all_read":
            return handle_mark_all_read(conn, user, request_id, origin=origin)

        return err_response("not_implemented", "Не реализовано", 501, request_id, origin=origin)

    except Exception as e:
        return err_response("internal_error", f"Ошибка сервера: {str(e)[:200]}", 500, request_id, origin=origin)
    finally:
        conn.close()
