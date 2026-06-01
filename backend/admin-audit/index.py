"""
Phase 3C — admin-audit.
Read-only журнал действий супер-админа.
Действия: list, get.
Redaction: sensitive fields маскируются на выдаче.
"""
import json
import os
import hashlib
import psycopg2

DB = os.environ["DATABASE_URL"]
SCHEMA = os.environ.get("MAIN_DB_SCHEMA", "public")

# Поля, которые никогда не должны попадать в UI в явном виде
SENSITIVE_KEYS = frozenset({
    "password_hash", "password", "token", "token_hash", "secret",
    "session_id", "session_token", "access_token", "refresh_token",
    "api_key", "private_key", "auth_header", "authorization",
    "x_internal_token", "x_admin_token", "x_session_id",
})


def get_db():
    conn = psycopg2.connect(DB)
    conn.autocommit = False
    return conn


# ── CORS ──────────────────────────────────────────────────────────

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
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-Admin-Token",
        "Vary": "Origin",
    }


def resp(data: dict, code: int = 200, origin: str = None) -> dict:
    return {
        "statusCode": code,
        "headers": {**cors(origin), "Content-Type": "application/json"},
        "body": json.dumps(data, ensure_ascii=False, default=str),
    }


# ── Auth ──────────────────────────────────────────────────────────

def get_admin_session(conn, token: str) -> dict | None:
    if not token:
        return None
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    s = SCHEMA
    with conn.cursor() as cur:
        cur.execute(
            f"SELECT actor_email, actor_role FROM {s}.admin_sessions "
            f"WHERE token_hash = '{token_hash}' AND expires_at > NOW() LIMIT 1"
        )
        row = cur.fetchone()
    return {"actor_email": row[0], "actor_role": row[1]} if row else None


# ── Redaction ─────────────────────────────────────────────────────

def redact(obj, depth: int = 0) -> object:
    """Рекурсивно маскирует чувствительные поля в dict/list."""
    if depth > 10:
        return obj
    if isinstance(obj, dict):
        result = {}
        for k, v in obj.items():
            if k.lower().replace("-", "_") in SENSITIVE_KEYS:
                result[k] = "***REDACTED***"
            else:
                result[k] = redact(v, depth + 1)
        return result
    if isinstance(obj, list):
        return [redact(i, depth + 1) for i in obj]
    return obj


def parse_json_field(raw) -> object:
    """Парсит JSONB-поле из БД (может прийти как dict или строка)."""
    if raw is None:
        return None
    if isinstance(raw, dict):
        return raw
    try:
        return json.loads(raw)
    except Exception:
        return raw


# ── Row mappers ───────────────────────────────────────────────────

def row_to_list_item(row) -> dict:
    """row = (id, created_at, actor_email, actor_role, action,
              entity_type, entity_id, reason, ip_address, user_agent)"""
    ua = row[9] or ""
    return {
        "id":               row[0],
        "created_at":       row[1],
        "actor_email":      row[2],
        "actor_role":       row[3],
        "action":           row[4],
        "entity_type":      row[5],
        "entity_id":        row[6],
        "reason":           row[7],
        "ip_address":       row[8],
        "user_agent_preview": ua[:80] + ("…" if len(ua) > 80 else ""),
    }


def row_to_detail(row) -> dict:
    """row = (id, created_at, actor_email, actor_role, action,
              entity_type, entity_id, before_json, after_json,
              reason, ip_address, user_agent)"""
    before = redact(parse_json_field(row[7]))
    after  = redact(parse_json_field(row[8]))
    return {
        "id":           row[0],
        "created_at":   row[1],
        "actor_email":  row[2],
        "actor_role":   row[3],
        "action":       row[4],
        "entity_type":  row[5],
        "entity_id":    row[6],
        "before_json":  before,
        "after_json":   after,
        "reason":       row[9],
        "ip_address":   row[10],
        "user_agent":   row[11],
    }


# ── Actions ───────────────────────────────────────────────────────

def action_list(conn, params: dict, origin: str) -> dict:
    s = SCHEMA
    q           = (params.get("q") or "").strip().replace("'", "''")
    action_f    = (params.get("action_filter") or "").strip().replace("'", "''")
    entity_type = (params.get("entity_type") or "").strip().replace("'", "''")
    actor_email = (params.get("actor_email") or "").strip().replace("'", "''")
    date_from   = (params.get("date_from") or "").strip()
    date_to     = (params.get("date_to") or "").strip()
    page        = max(1, int(params.get("page", 1)))
    per         = min(100, max(1, int(params.get("per_page", 20))))
    off         = (page - 1) * per

    where = []

    if q:
        where.append(
            f"(lower(coalesce(l.reason,'')) LIKE lower('%{q}%') "
            f"OR lower(l.actor_email) LIKE lower('%{q}%') "
            f"OR CAST(l.entity_id AS TEXT) = '{q}' "
            f"OR lower(l.action) LIKE lower('%{q}%') "
            f"OR lower(coalesce(l.entity_type,'')) LIKE lower('%{q}%'))"
        )
    if action_f:
        where.append(f"l.action = '{action_f}'")
    if entity_type:
        where.append(f"l.entity_type = '{entity_type}'")
    if actor_email:
        where.append(f"lower(l.actor_email) = lower('{actor_email}')")
    if date_from:
        where.append(f"l.created_at >= '{date_from}'::timestamp")
    if date_to:
        where.append(f"l.created_at < ('{date_to}'::timestamp + INTERVAL '1 day')")

    where_sql = ("WHERE " + " AND ".join(where)) if where else ""

    with conn.cursor() as cur:
        cur.execute(f"SELECT COUNT(*) FROM {s}.admin_audit_log l {where_sql}")
        total = cur.fetchone()[0]

        cur.execute(f"""
            SELECT l.id, l.created_at, l.actor_email, l.actor_role,
                   l.action, l.entity_type, l.entity_id,
                   l.reason, l.ip_address, l.user_agent
            FROM {s}.admin_audit_log l
            {where_sql}
            ORDER BY l.created_at DESC
            LIMIT {per} OFFSET {off}
        """)
        rows = cur.fetchall()

    # Собираем уникальные actions и entity_types для фильтров
    with conn.cursor() as cur:
        cur.execute(f"SELECT DISTINCT action FROM {s}.admin_audit_log ORDER BY action")
        actions = [r[0] for r in cur.fetchall()]
        cur.execute(f"SELECT DISTINCT entity_type FROM {s}.admin_audit_log WHERE entity_type IS NOT NULL ORDER BY entity_type")
        entity_types = [r[0] for r in cur.fetchall()]

    return resp({
        "entries":      [row_to_list_item(r) for r in rows],
        "total":        total,
        "page":         page,
        "per_page":     per,
        "pages":        max(1, -(-total // per)),
        "filter_options": {
            "actions":      actions,
            "entity_types": entity_types,
        },
    }, origin=origin)


def action_get(conn, entry_id: int, origin: str) -> dict:
    s = SCHEMA
    with conn.cursor() as cur:
        cur.execute(f"""
            SELECT l.id, l.created_at, l.actor_email, l.actor_role,
                   l.action, l.entity_type, l.entity_id,
                   l.before_json, l.after_json,
                   l.reason, l.ip_address, l.user_agent
            FROM {s}.admin_audit_log l
            WHERE l.id = {entry_id}
            LIMIT 1
        """)
        row = cur.fetchone()

    if not row:
        return resp({"error": "not_found"}, 404, origin)
    return resp({"entry": row_to_detail(row)}, origin=origin)


# ── Handler ───────────────────────────────────────────────────────

def handler(event: dict, context) -> dict:
    """Phase 3C admin-audit: list / get. Read-only."""
    headers = event.get("headers") or {}
    origin  = headers.get("origin") or headers.get("Origin") or ""
    method  = event.get("httpMethod", "GET")

    if method == "OPTIONS":
        return resp({}, 200, origin)

    if method != "GET":
        return resp({"error": "GET only"}, 405, origin)

    token = headers.get("X-Admin-Token") or headers.get("x-admin-token") or ""
    conn = get_db()
    try:
        admin = get_admin_session(conn, token)
        if not admin:
            return resp({"error": "unauthorized"}, 401, origin)

        params = event.get("queryStringParameters") or {}
        action = params.get("action", "list")

        if action == "list":
            return action_list(conn, params, origin)

        if action == "get":
            eid = params.get("id")
            if not eid:
                return resp({"error": "id required"}, 400, origin)
            return action_get(conn, int(eid), origin)

        return resp({"error": "unknown action. Use: list, get"}, 400, origin)

    finally:
        conn.close()
