"""
Супер-админ аутентификация: login / logout / check session. v2
Защита: bcrypt-пароль, SHA-256 токен в БД, brute-force (5 попыток / 10 мин),
httpOnly cookie через X-Set-Cookie прокси, Origin/Referer check для state-changing запросов.
"""
import json
import os
import hashlib
import secrets
import psycopg2
from datetime import datetime, timedelta

DB = os.environ["DATABASE_URL"]
SCHEMA = os.environ.get("MAIN_DB_SCHEMA", "public")

ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "")
ADMIN_PASSWORD_HASH = os.environ.get("ADMIN_PASSWORD_HASH", "")
COOKIE_NAME = os.environ.get("ADMIN_COOKIE_NAME", "trajectory_admin_session")
_ttl_raw = os.environ.get("ADMIN_SESSION_TTL_HOURS", "12")
SESSION_TTL_HOURS = int(_ttl_raw) if _ttl_raw.isdigit() else 12
MAX_ATTEMPTS = 5
ATTEMPT_WINDOW_MINUTES = 10

ALLOWED_ORIGINS = {
    "https://raven.moscow",
    "https://www.raven.moscow",
    "http://localhost:5173",
    "http://localhost:3000",
}

ALLOWED_ORIGIN_SUFFIXES = (
    ".poehali.dev",
    "poehali.dev",
)


def get_db():
    conn = psycopg2.connect(DB)
    conn.autocommit = False
    return conn


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def verify_bcrypt(password: str, stored_hash: str) -> bool:
    try:
        import bcrypt
        return bcrypt.checkpw(password.encode(), stored_hash.encode())
    except Exception:
        return False


def _is_allowed(origin: str) -> bool:
    if not origin:
        return False
    if origin in ALLOWED_ORIGINS:
        return True
    try:
        from urllib.parse import urlparse
        host = (urlparse(origin).hostname or "").lower()
        return host == "poehali.dev" or host.endswith(".poehali.dev")
    except Exception:
        return False


def cors_headers(origin: str = None) -> dict:
    allowed = origin if _is_allowed(origin) else "*"
    return {
        "Access-Control-Allow-Origin": allowed,
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-Cookie",
        "Access-Control-Allow-Credentials": "true",
        "Vary": "Origin",
    }


def resp(data: dict, code: int = 200, extra_headers: dict = None, origin: str = None) -> dict:
    headers = {**cors_headers(origin), "Content-Type": "application/json"}
    if extra_headers:
        headers.update(extra_headers)
    return {"statusCode": code, "headers": headers, "body": json.dumps(data, ensure_ascii=False)}


def get_ip(event: dict) -> str:
    return (event.get("requestContext") or {}).get("identity", {}).get("sourceIp", "unknown")


def get_origin(event: dict) -> str:
    headers = event.get("headers") or {}
    return headers.get("origin") or headers.get("Origin") or ""


def check_origin(event: dict) -> bool:
    """CSRF protection: проверяем Origin или Referer для state-changing запросов."""
    headers = event.get("headers") or {}
    origin = headers.get("origin") or headers.get("Origin") or ""
    referer = headers.get("referer") or headers.get("Referer") or ""
    if origin and _is_allowed(origin):
        return True
    if referer:
        try:
            from urllib.parse import urlparse
            host = (urlparse(referer).hostname or "").lower()
            if host == "poehali.dev" or host.endswith(".poehali.dev"):
                return True
            for o in ALLOWED_ORIGINS:
                if referer.startswith(o):
                    return True
        except Exception:
            pass
    return False


def get_session_token(event: dict) -> str:
    """Читаем токен из X-Cookie (проксируется из Cookie браузера)."""
    headers = event.get("headers") or {}
    cookie_str = headers.get("X-Cookie") or headers.get("x-cookie") or ""
    for part in cookie_str.split(";"):
        part = part.strip()
        if part.startswith(f"{COOKIE_NAME}="):
            return part[len(f"{COOKIE_NAME}="):]
    return ""


def check_session(conn, token: str) -> dict | None:
    """Возвращает запись сессии или None если невалидна/истекла/отозвана."""
    if not token:
        return None
    token_hash = hash_token(token)
    schema = SCHEMA
    with conn.cursor() as cur:
        cur.execute(
            f"SELECT id, actor_email, actor_role, expires_at, revoked_at "
            f"FROM {schema}.admin_sessions "
            f"WHERE session_token_hash = '{token_hash}' LIMIT 1"
        )
        row = cur.fetchone()
    if not row:
        return None
    sid, email, role, expires_at, revoked_at = row
    if revoked_at is not None:
        return None
    if datetime.utcnow() > expires_at:
        return None
    # Обновляем last_seen_at
    with conn.cursor() as cur:
        cur.execute(
            f"UPDATE {schema}.admin_sessions SET last_seen_at = now() WHERE id = {sid}"
        )
    conn.commit()
    return {"id": sid, "actor_email": email, "actor_role": role}


def is_rate_limited(conn, ip: str, email: str) -> bool:
    schema = SCHEMA
    window = datetime.utcnow() - timedelta(minutes=ATTEMPT_WINDOW_MINUTES)
    window_str = window.strftime("%Y-%m-%d %H:%M:%S")
    with conn.cursor() as cur:
        cur.execute(
            f"SELECT COUNT(*) FROM {schema}.admin_login_attempts "
            f"WHERE ip_address = '{ip}' AND email = '{email}' "
            f"AND success = false AND attempted_at > '{window_str}'"
        )
        count = cur.fetchone()[0]
    return count >= MAX_ATTEMPTS


def log_attempt(conn, ip: str, email: str, success: bool):
    schema = SCHEMA
    with conn.cursor() as cur:
        cur.execute(
            f"INSERT INTO {schema}.admin_login_attempts (ip_address, email, success) "
            f"VALUES ('{ip}', '{email}', {'true' if success else 'false'})"
        )
    conn.commit()


def write_audit(conn, actor_email: str, action: str, ip: str, user_agent: str, reason: str = None):
    schema = SCHEMA
    reason_sql = f"'{reason}'" if reason else "NULL"
    with conn.cursor() as cur:
        cur.execute(
            f"INSERT INTO {schema}.admin_audit_log (actor_email, action, ip_address, user_agent, reason) "
            f"VALUES ('{actor_email}', '{action}', '{ip}', $ua$, {reason_sql})"
            .replace("$ua$", f"'{user_agent[:500] if user_agent else ''}'")
        )
    conn.commit()


def action_login(event: dict) -> dict:
    origin = get_origin(event)
    ip = get_ip(event)
    user_agent = (event.get("headers") or {}).get("user-agent") or ""

    body = json.loads(event.get("body") or "{}")
    email = (body.get("email") or "").strip().lower()
    password = body.get("password") or ""

    conn = get_db()
    try:
        if is_rate_limited(conn, ip, email):
            return resp({"error": "too_many_attempts"}, 429, origin=origin)

        # Проверяем credentials
        valid = (
            email == ADMIN_EMAIL.lower()
            and bool(ADMIN_PASSWORD_HASH)
            and verify_bcrypt(password, ADMIN_PASSWORD_HASH)
        )

        log_attempt(conn, ip, email, valid)

        if not valid:
            return resp({"error": "unauthorized"}, 401, origin=origin)

        # Создаём сессию
        token = secrets.token_urlsafe(48)
        token_hash = hash_token(token)
        expires_at = datetime.utcnow() + timedelta(hours=SESSION_TTL_HOURS)
        expires_str = expires_at.strftime("%Y-%m-%d %H:%M:%S")
        schema = SCHEMA

        with conn.cursor() as cur:
            cur.execute(
                f"INSERT INTO {schema}.admin_sessions "
                f"(session_token_hash, actor_email, actor_role, ip_address, user_agent, expires_at) "
                f"VALUES ('{token_hash}', '{email}', 'super_admin', '{ip}', "
                f"$ua$, '{expires_str}')".replace("$ua$", f"'{user_agent[:500]}'")
            )
        conn.commit()

        write_audit(conn, email, "admin.login", ip, user_agent)

        cookie = (
            f"{COOKIE_NAME}={token}; "
            f"HttpOnly; Secure; SameSite=Lax; "
            f"Path=/; Max-Age={SESSION_TTL_HOURS * 3600}"
        )
        return resp(
            {"ok": True, "actor_email": email, "actor_role": "super_admin"},
            200,
            extra_headers={"X-Set-Cookie": cookie},
            origin=origin,
        )
    finally:
        conn.close()


def action_logout(event: dict) -> dict:
    origin = get_origin(event)
    ip = get_ip(event)
    user_agent = (event.get("headers") or {}).get("user-agent") or ""

    token = get_session_token(event)
    if token:
        conn = get_db()
        try:
            session = check_session(conn, token)
            if session:
                token_hash = hash_token(token)
                schema = SCHEMA
                with conn.cursor() as cur:
                    cur.execute(
                        f"UPDATE {schema}.admin_sessions SET revoked_at = now() "
                        f"WHERE session_token_hash = '{token_hash}'"
                    )
                conn.commit()
                write_audit(conn, session["actor_email"], "admin.logout", ip, user_agent)
        finally:
            conn.close()

    # Сбрасываем cookie
    cookie = f"{COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0"
    return resp({"ok": True}, 200, extra_headers={"X-Set-Cookie": cookie}, origin=origin)


def action_me(event: dict) -> dict:
    origin = get_origin(event)
    token = get_session_token(event)
    conn = get_db()
    try:
        session = check_session(conn, token)
        if not session:
            return resp({"error": "unauthorized"}, 401, origin=origin)
        return resp(
            {"ok": True, "actor_email": session["actor_email"], "actor_role": session["actor_role"]},
            origin=origin,
        )
    finally:
        conn.close()


def handler(event: dict, context) -> dict:
    """Супер-админ auth: login / logout / me."""
    method = event.get("httpMethod", "GET")
    origin = get_origin(event)

    if method == "OPTIONS":
        return resp({}, 200, origin=origin)

    params = event.get("queryStringParameters") or {}
    action = params.get("action", "me")

    if action == "login":
        if method != "POST":
            return resp({"error": "method_not_allowed"}, 405, origin=origin)
        if not check_origin(event):
            return resp({"error": "forbidden"}, 403, origin=origin)
        return action_login(event)

    if action == "logout":
        if not check_origin(event):
            return resp({"error": "forbidden"}, 403, origin=origin)
        return action_logout(event)

    if action == "me":
        return action_me(event)

    return resp({"error": "unknown_action"}, 400, origin=origin)