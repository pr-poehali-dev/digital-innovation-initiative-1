"""
Phase 3D — admin-activity.
Read-only viewer для activity_log (действия пользователей / системы).
НЕ путать с admin_audit_log (действия администратора).

Схема activity_log:
  id, project_id, user_id, action, entity_type, entity_id, details (text), created_at

details — plain text (summary): название задачи/документа, версия генерации и т.д.
Никаких JSON-payload нет — редактировать нечего, redaction применяется к details превентивно.
"""
import json
import os
import hashlib
import psycopg2

DB = os.environ["DATABASE_URL"]
SCHEMA = os.environ.get("MAIN_DB_SCHEMA", "public")

# Максимум символов для details в списке
DETAILS_PREVIEW_LEN = 200
# Максимум символов для details в detail view
DETAILS_FULL_LEN = 2000

# Превентивный redaction: ключевые слова в details, которые намекают на чувствительные данные
SENSITIVE_PATTERNS = (
    "password", "token", "secret", "session", "api_key", "authorization",
    "bearer ", "access_key", "private_key",
)


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


# ── Redaction / safety ────────────────────────────────────────────

def safe_details(text: str | None, max_len: int = DETAILS_PREVIEW_LEN) -> str | None:
    """Усекает длинные строки и превентивно маскирует подозрительные паттерны."""
    if text is None:
        return None
    lo = text.lower()
    for pat in SENSITIVE_PATTERNS:
        if pat in lo:
            return "***REDACTED***"
    if len(text) > max_len:
        return text[:max_len] + "…"
    return text


# ── Human-readable action labels ──────────────────────────────────

ACTION_LABELS: dict[str, str] = {
    "created_project":          "Создал проект",
    "archived_project":         "Архивировал проект",
    "restored_project":         "Восстановил проект",
    "admin_archived_project":   "Администратор архивировал проект",
    "admin_restored_project":   "Администратор восстановил проект",
    "created_task":             "Создал задачу",
    "uploaded_document":        "Загрузил документ",
    "renamed_document":         "Переименовал документ",
    "generated":                "Сгенерировал версию",
    "invited_member":           "Пригласил участника",
}


# ── Row mapper ────────────────────────────────────────────────────

def row_to_item(row, full: bool = False) -> dict:
    """
    row = (id, created_at, user_id, user_email, user_name,
           project_id, project_title, action, entity_type, entity_id, details)
    """
    max_len = DETAILS_FULL_LEN if full else DETAILS_PREVIEW_LEN
    return {
        "id":             row[0],
        "created_at":     row[1],
        "user_id":        row[2],
        "user_email":     row[3],
        "user_name":      row[4],
        "project_id":     row[5],
        "project_title":  row[6],
        "action":         row[7],
        "action_label":   ACTION_LABELS.get(row[7], row[7]),
        "entity_type":    row[8],
        "entity_id":      row[9],
        "summary":        safe_details(row[10], max_len),
    }


BASE_SELECT = """
    SELECT
        l.id,
        l.created_at,
        l.user_id,
        u.email  AS user_email,
        u.name   AS user_name,
        l.project_id,
        p.title  AS project_title,
        l.action,
        l.entity_type,
        l.entity_id,
        l.details
    FROM {s}.activity_log l
    LEFT JOIN {s}.users    u ON u.id = l.user_id
    LEFT JOIN {s}.projects p ON p.id = l.project_id
"""


# ── Actions ───────────────────────────────────────────────────────

def action_list(conn, params: dict, origin: str) -> dict:
    s = SCHEMA
    q           = (params.get("q") or "").strip().replace("'", "''")
    action_f    = (params.get("action_filter") or "").strip().replace("'", "''")
    entity_type = (params.get("entity_type") or "").strip().replace("'", "''")
    user_id_f   = (params.get("user_id") or "").strip()
    project_id_f = (params.get("project_id") or "").strip()
    date_from   = (params.get("date_from") or "").strip()
    date_to     = (params.get("date_to") or "").strip()
    page        = max(1, int(params.get("page", 1)))
    per         = min(200, max(1, int(params.get("per_page", 50))))
    off         = (page - 1) * per

    where = []
    if q:
        where.append(
            f"(lower(coalesce(l.details,'')) LIKE lower('%{q}%') "
            f"OR lower(l.action) LIKE lower('%{q}%') "
            f"OR CAST(l.entity_id AS TEXT) = '{q}' "
            f"OR CAST(l.user_id AS TEXT) = '{q}')"
        )
    if action_f:
        where.append(f"l.action = '{action_f}'")
    if entity_type:
        where.append(f"l.entity_type = '{entity_type}'")
    if user_id_f.isdigit():
        where.append(f"l.user_id = {int(user_id_f)}")
    if project_id_f.isdigit():
        where.append(f"l.project_id = {int(project_id_f)}")
    if date_from:
        where.append(f"l.created_at >= '{date_from}'::timestamp")
    if date_to:
        where.append(f"l.created_at < ('{date_to}'::timestamp + INTERVAL '1 day')")

    where_sql = ("WHERE " + " AND ".join(where)) if where else ""
    base = BASE_SELECT.format(s=s)

    with conn.cursor() as cur:
        cur.execute(
            f"SELECT COUNT(*) FROM {s}.activity_log l {where_sql}"
        )
        total = cur.fetchone()[0]

        cur.execute(
            f"{base} {where_sql} ORDER BY l.created_at DESC LIMIT {per} OFFSET {off}"
        )
        rows = cur.fetchall()

        # Динамические опции фильтров
        cur.execute(f"SELECT DISTINCT action FROM {s}.activity_log ORDER BY action")
        actions = [r[0] for r in cur.fetchall()]

        cur.execute(
            f"SELECT DISTINCT entity_type FROM {s}.activity_log "
            f"WHERE entity_type IS NOT NULL ORDER BY entity_type"
        )
        entity_types = [r[0] for r in cur.fetchall()]

        cur.execute(
            f"SELECT DISTINCT l.user_id, u.email FROM {s}.activity_log l "
            f"LEFT JOIN {s}.users u ON u.id = l.user_id "
            f"WHERE l.user_id IS NOT NULL ORDER BY u.email"
        )
        users = [{"user_id": r[0], "email": r[1]} for r in cur.fetchall()]

    return resp({
        "entries":   [row_to_item(r) for r in rows],
        "total":     total,
        "page":      page,
        "per_page":  per,
        "pages":     max(1, -(-total // per)),
        "filter_options": {
            "actions":      actions,
            "entity_types": entity_types,
            "users":        users,
        },
    }, origin=origin)


def action_get(conn, entry_id: int, origin: str) -> dict:
    s = SCHEMA
    base = BASE_SELECT.format(s=s)
    with conn.cursor() as cur:
        cur.execute(f"{base} WHERE l.id = {entry_id} LIMIT 1")
        row = cur.fetchone()

    if not row:
        return resp({"error": "not_found"}, 404, origin)
    return resp({"entry": row_to_item(row, full=True)}, origin=origin)


# ── Handler ───────────────────────────────────────────────────────

def handler(event: dict, context) -> dict:
    """Phase 3D admin-activity: list / get. Read-only viewer для activity_log."""
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
