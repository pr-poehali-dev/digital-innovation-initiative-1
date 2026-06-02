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
                COALESCE(w.balance_kopecks, 0) AS balance_kopecks
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
        })

    return resp({
        "users":    users,
        "total":    total,
        "page":     page,
        "per_page": per_page,
        "pages":    max(1, -(-total // per_page)),
    }, origin=origin)


def action_get(conn, user_id: int, origin: str) -> dict:
    """Карточка пользователя: базовая инфо + статистика."""
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

    user["projects_count"]    = projects_count
    user["tasks_count"]       = tasks_count
    user["documents_count"]   = docs_count
    user["active_sessions"]   = active_sessions

    return resp({"user": user}, origin=origin)


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

        return resp({"error": "unknown action"}, 400, origin)

    finally:
        conn.close()