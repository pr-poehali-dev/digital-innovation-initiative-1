import json
import os
import hashlib
import psycopg2

DB = os.environ["DATABASE_URL"]
_s = os.environ.get("MAIN_DB_SCHEMA", "").strip()
SCHEMA = _s if _s else "t_p61016064_digital_innovation_i"


def cors(body: dict, code: int = 200) -> dict:
    return {
        "statusCode": code,
        "headers": {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, X-Admin-Token, X-Session-Id",
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
    """Настройки AI доступны только владельцу кабинета (head) или супер-админу."""
    token = headers.get("x-admin-token") or headers.get("X-Admin-Token", "")
    email = get_admin(conn, token)
    if email:
        return {"email": email, "role": "head"}
    sid = headers.get("x-session-id") or headers.get("X-Session-Id", "")
    user = get_cabinet_user(conn, sid)
    if user and user.get("role") == "head":
        return user
    return None


def rows(cur):
    cols = [d[0] for d in cur.description]
    return [dict(zip(cols, r)) for r in cur.fetchall()]


EMERGENCY_ENV_FLAGS = {
    "media_upload": "MEDIA_EXTERNAL_AI_ENABLED",
    "education": "EDUCATION_EXTERNAL_AI_ENABLED",
}


def list_modules(cur):
    cur.execute(f"SELECT is_enabled FROM {SCHEMA}.ai_global_settings ORDER BY id DESC LIMIT 1")
    g = cur.fetchone()
    global_enabled = bool(g[0]) if g else False

    cur.execute(f"""
        SELECT module_code, module_label, service, trigger_type, is_enabled,
               data_description, last_used_at, last_result, updated_by, updated_at
        FROM {SCHEMA}.ai_module_settings
        ORDER BY module_label
    """)
    items = rows(cur)
    # Аварийный server-side блок (env). ВАЖНО: эта функция читает СВОЁ окружение,
    # а не окружение функций media_upload/education. В serverless-среде это разные
    # процессы, поэтому состояние считается НЕПОДТВЕРЖДЁННЫМ и помечается как
    # "требует проверки" — мы не выдаём его за установленный факт.
    for it in items:
        env_name = EMERGENCY_ENV_FLAGS.get(it["module_code"])
        if env_name:
            env_allows_here = os.environ.get(env_name, "") == "true"
            it["emergency_env_flag"] = env_name
            it["emergency_env_state"] = "unverified"
            it["emergency_env_blocked_here"] = not env_allows_here
            # Консервативно: при неподтверждённом состоянии не показываем модуль
            # фактически активным.
            it["effective_enabled"] = (
                bool(it["is_enabled"]) and global_enabled and env_allows_here
            )
        else:
            it["emergency_env_flag"] = None
            it["emergency_env_state"] = "not_applicable"
            it["emergency_env_blocked_here"] = False
            it["effective_enabled"] = bool(it["is_enabled"]) and global_enabled
    return {"global_enabled": global_enabled, "modules": items}


def set_global(cur, enabled: bool, actor: str):
    cur.execute(
        f"UPDATE {SCHEMA}.ai_global_settings SET is_enabled = %s, updated_by = %s, updated_at = now()",
        (enabled, actor),
    )


def set_module(cur, module_code: str, enabled: bool, actor: str):
    cur.execute(
        f"""UPDATE {SCHEMA}.ai_module_settings
            SET is_enabled = %s, updated_by = %s, updated_at = now()
            WHERE module_code = %s RETURNING id""",
        (enabled, actor, module_code),
    )
    return cur.fetchone()


def list_log(cur, limit: int = 100, module_code: str = None):
    if module_code:
        cur.execute(f"""
            SELECT id, module_code, service, action, object_type, object_id,
                   data_kind, approx_volume, result, error_message, duration_ms,
                   initiated_by, created_at
            FROM {SCHEMA}.ai_operation_log
            WHERE module_code = %s
            ORDER BY created_at DESC LIMIT %s
        """, (module_code, limit))
    else:
        cur.execute(f"""
            SELECT id, module_code, service, action, object_type, object_id,
                   data_kind, approx_volume, result, error_message, duration_ms,
                   initiated_by, created_at
            FROM {SCHEMA}.ai_operation_log
            ORDER BY created_at DESC LIMIT %s
        """, (limit,))
    return rows(cur)


def handler(event: dict, context) -> dict:
    """Единое управление внешними AI-интеграциями: глобальный и модульные переключатели,
    журнал фактов вызовов (без сохранения содержимого документов)."""
    if event.get("httpMethod") == "OPTIONS":
        return cors({})

    headers = event.get("headers") or {}
    conn = psycopg2.connect(DB)
    try:
        user = authenticate(conn, headers)
        if not user:
            return cors({"ok": False, "error": {"message": "Доступ только для владельца кабинета"}}, 403)

        qs = event.get("queryStringParameters") or {}
        action = qs.get("action", "list")
        body = json.loads(event["body"]) if event.get("body") else {}
        cur = conn.cursor()

        if action == "list":
            return cors({"ok": True, "data": list_modules(cur)})

        if action == "set_global":
            enabled = bool(body.get("enabled"))
            set_global(cur, enabled, user["email"])
            conn.commit()
            return cors({"ok": True, "data": {"global_enabled": enabled}})

        if action == "set_module":
            module_code = (body.get("module_code") or "").strip()
            if not module_code:
                return cors({"ok": False, "error": {"message": "Не указан модуль"}}, 400)
            enabled = bool(body.get("enabled"))
            row = set_module(cur, module_code, enabled, user["email"])
            if not row:
                return cors({"ok": False, "error": {"message": "Модуль не найден"}}, 404)
            conn.commit()
            return cors({"ok": True, "data": {"module_code": module_code, "enabled": enabled}})

        if action == "log":
            limit = min(int(qs.get("limit", 100)), 500)
            module_code = qs.get("module_code")
            return cors({"ok": True, "data": {"items": list_log(cur, limit, module_code)}})

        return cors({"ok": False, "error": {"message": "Неизвестное действие"}}, 400)
    finally:
        conn.close()