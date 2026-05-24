"""
Аутентификация пользователей: регистрация, вход, выход, проверка сессии.
Пароли — Argon2id (OWASP recommended).
SHA-256 хеши автоматически мигрируются в Argon2 при следующем успешном входе.
"""
import json
import os
import hashlib
import secrets
from datetime import datetime, timedelta
import psycopg2

try:
    from argon2 import PasswordHasher
    from argon2.exceptions import VerifyMismatchError, InvalidHash
    _argon = PasswordHasher(time_cost=2, memory_cost=19456, parallelism=1)
    ARGON2_AVAILABLE = True
except ImportError:
    ARGON2_AVAILABLE = False


def get_db():
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    conn.autocommit = False
    return conn


def get_schema():
    return os.environ.get("MAIN_DB_SCHEMA", "public")


def hash_password(password: str) -> str:
    """Хеширует новый пароль через Argon2id."""
    if ARGON2_AVAILABLE:
        return _argon.hash(password)
    # Fallback (не должно случиться в проде)
    return hashlib.sha256(password.encode()).hexdigest()


def verify_password(password: str, stored_hash: str) -> tuple:
    """Проверяет пароль. Возвращает (valid: bool, needs_rehash: bool).
    Поддерживает оба формата: Argon2 и legacy SHA-256.
    """
    if not stored_hash:
        return False, False
    # Argon2 хеш начинается с $argon2
    if stored_hash.startswith("$argon2"):
        if not ARGON2_AVAILABLE:
            return False, False
        try:
            _argon.verify(stored_hash, password)
            return True, False
        except (VerifyMismatchError, InvalidHash):
            return False, False
    # Legacy SHA-256 (64 hex символа)
    legacy = hashlib.sha256(password.encode()).hexdigest()
    if legacy == stored_hash:
        return True, True  # нужна миграция в Argon2
    return False, False


import uuid

ALLOWED_ORIGINS = {
    "https://raven.moscow",
    "https://www.raven.moscow",
    "https://docmind.ai",
    "https://digital-innovation-initiative-1--preview.poehali.dev",
    "https://poehali.dev",
    "http://localhost:5173",
    "http://localhost:3000",
}


def cors_headers(origin: str = None):
    """Возвращает CORS headers — origin reflection с whitelist."""
    allow_origin = "*"
    if origin and origin in ALLOWED_ORIGINS:
        allow_origin = origin
    elif origin:
        # Для preview-сабдоменов poehali.dev
        if origin.endswith(".poehali.dev"):
            allow_origin = origin
    return {
        "Access-Control-Allow-Origin": allow_origin,
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-Session-Id",
        "Access-Control-Allow-Credentials": "true",
        "Vary": "Origin",
        "X-Api-Version": "v1",
    }


def json_response(data, status=200, request_id=None):
    """Возвращает ответ. Если в data есть 'error' — заворачиваем в формат v1.
    Иначе сохраняем обратную совместимость: поля корня + добавляем ok/request_id."""
    rid = request_id or str(uuid.uuid4())
    headers = {**cors_headers(), "Content-Type": "application/json", "X-Request-Id": rid}

    # Ошибка — единый формат
    if isinstance(data, dict) and "error" in data and status >= 400:
        return {
            "statusCode": status,
            "headers": headers,
            "body": json.dumps({
                "ok": False,
                "request_id": rid,
                "error": {"code": "auth_error", "message": data["error"]},
            }, ensure_ascii=False),
        }

    # Успех — добавляем ok/request_id, но сохраняем поля для обратной совместимости
    out = {"ok": True, "request_id": rid, **(data if isinstance(data, dict) else {"data": data})}
    return {
        "statusCode": status,
        "headers": headers,
        "body": json.dumps(out, ensure_ascii=False, default=str),
    }


def get_current_user(conn, session_id):
    if not session_id:
        return None
    schema = get_schema()
    cur = conn.cursor()
    cur.execute(
        f"SELECT u.id, u.email, u.name FROM {schema}.sessions s JOIN {schema}.users u ON u.id = s.user_id WHERE s.id = %s AND s.expires_at > NOW()",
        (session_id,),
    )
    row = cur.fetchone()
    if row:
        return {"id": row[0], "email": row[1], "name": row[2]}
    return None


def check_rate_limit(conn, schema, key: str, bucket: str, max_hits: int, window_seconds: int):
    """Storage-backed atomic rate limiter в БД.

    Защита от race conditions через INSERT ... ON CONFLICT DO UPDATE с условным сбросом
    счётчика внутри одной SQL-операции. Не подвержен TOCTOU между несколькими запросами.

    Возвращает (allowed: bool, retry_after_seconds: int, hits: int).
    """
    cur = conn.cursor()
    # Один атомарный UPSERT: создаёт запись если её нет,
    # сбрасывает счётчик если окно истекло, иначе инкрементирует.
    # Всё это в ОДНОЙ SQL-операции — гонок быть не может.
    cur.execute(
        f"""INSERT INTO {schema}.rate_limits (key, bucket, hit_count, first_hit_at, last_hit_at)
            VALUES (%s, %s, 1, NOW(), NOW())
            ON CONFLICT (key, bucket) DO UPDATE SET
                hit_count = CASE
                    WHEN {schema}.rate_limits.blocked_until IS NOT NULL
                         AND {schema}.rate_limits.blocked_until > NOW() THEN {schema}.rate_limits.hit_count
                    WHEN EXTRACT(EPOCH FROM (NOW() - {schema}.rate_limits.first_hit_at)) > %s THEN 1
                    ELSE {schema}.rate_limits.hit_count + 1
                END,
                first_hit_at = CASE
                    WHEN EXTRACT(EPOCH FROM (NOW() - {schema}.rate_limits.first_hit_at)) > %s THEN NOW()
                    ELSE {schema}.rate_limits.first_hit_at
                END,
                last_hit_at = NOW(),
                blocked_until = CASE
                    WHEN EXTRACT(EPOCH FROM (NOW() - {schema}.rate_limits.first_hit_at)) > %s THEN NULL
                    ELSE {schema}.rate_limits.blocked_until
                END
            RETURNING hit_count, blocked_until""",
        (key, bucket, window_seconds, window_seconds, window_seconds),
    )
    row = cur.fetchone()
    hit_count, blocked_until = row

    now = datetime.now()
    # Если уже заблокирован — отказ
    if blocked_until and blocked_until > now:
        seconds_left = int((blocked_until - now).total_seconds())
        conn.commit()
        return False, max(seconds_left, 1), hit_count

    # Превысили лимит — блокируем на окно
    if hit_count > max_hits:
        cur.execute(
            f"""UPDATE {schema}.rate_limits
                SET blocked_until = NOW() + (%s || ' seconds')::INTERVAL
                WHERE key = %s AND bucket = %s""",
            (window_seconds, key, bucket),
        )
        conn.commit()
        return False, window_seconds, hit_count

    conn.commit()
    return True, 0, hit_count


def rate_limit_response(retry_after: int, request_id: str, reason: str):
    """Возвращает 429 Too Many Requests с Retry-After заголовком."""
    return {
        "statusCode": 429,
        "headers": {
            **cors_headers(),
            "Content-Type": "application/json",
            "Retry-After": str(retry_after),
            "X-Request-Id": request_id,
        },
        "body": json.dumps({
            "ok": False,
            "request_id": request_id,
            "error": {
                "code": "rate_limit_exceeded",
                "message": f"Слишком много запросов. {reason} Повторите через {retry_after} сек.",
                "retry_after": retry_after,
            },
        }, ensure_ascii=False),
    }


def get_client_ip(event):
    """Извлекает IP клиента из event."""
    try:
        return event.get("requestContext", {}).get("identity", {}).get("sourceIp", "unknown")
    except Exception:
        return "unknown"


def handler(event: dict, context) -> dict:
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": cors_headers(), "body": ""}

    method = event.get("httpMethod", "GET")
    path = event.get("path", "/")
    body = {}
    if event.get("body"):
        try:
            body = json.loads(event["body"])
        except Exception:
            pass

    session_id = event.get("headers", {}).get("X-Session-Id", "")
    request_id = getattr(context, "request_id", None) or secrets.token_hex(8)
    client_ip = get_client_ip(event)
    conn = get_db()
    schema = get_schema()

    try:
        action = body.get("action", "")
        if not action:
            if path.endswith("/register"):
                action = "register"
            elif path.endswith("/login"):
                action = "login"
            elif path.endswith("/logout"):
                action = "logout"
            elif path.endswith("/me"):
                action = "me"
            elif method == "GET":
                action = "me"

        # POST register
        if method == "POST" and action == "register":
            email = body.get("email", "").strip().lower()
            password = body.get("password", "")
            name = body.get("name", "").strip()

            if not email or not password or not name:
                return json_response({"error": "Заполните все поля"}, 400)

            # Rate limit: max 10 регистраций / час с одного IP
            allowed, retry_after, _ = check_rate_limit(
                conn, schema, key=f"register:{client_ip}", bucket="register_ip",
                max_hits=10, window_seconds=3600,
            )
            if not allowed:
                return rate_limit_response(retry_after, request_id, "Слишком много регистраций с этого IP.")

            cur = conn.cursor()
            cur.execute(f"SELECT id FROM {schema}.users WHERE email = %s", (email,))
            if cur.fetchone():
                return json_response({"error": "Email уже зарегистрирован"}, 400)

            pw_hash = hash_password(password)
            cur.execute(
                f"INSERT INTO {schema}.users (email, password_hash, name) VALUES (%s, %s, %s) RETURNING id",
                (email, pw_hash, name),
            )
            user_id = cur.fetchone()[0]

            sid = secrets.token_hex(32)
            expires = datetime.now() + timedelta(days=30)
            cur.execute(
                f"INSERT INTO {schema}.sessions (id, user_id, expires_at) VALUES (%s, %s, %s)",
                (sid, user_id, expires),
            )
            conn.commit()
            return json_response({"session_id": sid, "user": {"id": user_id, "email": email, "name": name}})

        # POST login
        if method == "POST" and action == "login":
            email = body.get("email", "").strip().lower()
            password = body.get("password", "")

            # Rate limit: 5 попыток / 15 минут на пару IP+email
            # Защита от brute-force подбора паролей
            rl_key = f"login:{client_ip}:{email}"
            allowed, retry_after, hits = check_rate_limit(
                conn, schema, key=rl_key, bucket="login_attempts",
                max_hits=5, window_seconds=900,
            )
            if not allowed:
                return rate_limit_response(retry_after, request_id, "Слишком много неудачных попыток входа.")

            cur = conn.cursor()
            # Загружаем user и хеш — НЕ сравниваем в SQL (это позволяет timing-attack
            # и не работает с Argon2 где хеш содержит соль и параметры)
            cur.execute(
                f"SELECT id, name, password_hash FROM {schema}.users WHERE email = %s",
                (email,),
            )
            row = cur.fetchone()
            if not row:
                # Не раскрываем что email не существует
                return json_response({"error": "Неверный email или пароль"}, 401)

            user_id, name, stored_hash = row
            valid, needs_rehash = verify_password(password, stored_hash)
            if not valid:
                return json_response({"error": "Неверный email или пароль"}, 401)

            # Автоматическая миграция legacy SHA-256 → Argon2id
            if needs_rehash:
                new_hash = hash_password(password)
                cur.execute(
                    f"UPDATE {schema}.users SET password_hash = %s WHERE id = %s",
                    (new_hash, user_id),
                )

            # Успешный вход — сбрасываем счётчик rate limit для этой пары IP+email
            cur.execute(
                f"UPDATE {schema}.rate_limits SET hit_count = 0, blocked_until = NULL WHERE key = %s AND bucket = %s",
                (rl_key, "login_attempts"),
            )

            sid = secrets.token_hex(32)
            expires = datetime.now() + timedelta(days=30)
            cur.execute(
                f"INSERT INTO {schema}.sessions (id, user_id, expires_at) VALUES (%s, %s, %s)",
                (sid, user_id, expires),
            )
            conn.commit()
            return json_response({"session_id": sid, "user": {"id": user_id, "email": email, "name": name}})

        # GET /me
        if (method == "GET" and (path.endswith("/me") or action == "me")) or action == "me":
            user = get_current_user(conn, session_id)
            if not user:
                return json_response({"error": "Не авторизован"}, 401)
            return json_response({"user": user})

        # POST logout
        if method == "POST" and action == "logout":
            if session_id:
                cur = conn.cursor()
                cur.execute(f"DELETE FROM {schema}.sessions WHERE id = %s", (session_id,))
                conn.commit()
            return json_response({"ok": True})

        # POST reset_password — сбросить пароль на временный
        if method == "POST" and action == "reset_password":
            email = body.get("email", "").strip().lower()
            if not email:
                return json_response({"error": "Введите email"}, 400)

            cur = conn.cursor()
            cur.execute(f"SELECT id, name FROM {schema}.users WHERE email = %s", (email,))
            row = cur.fetchone()
            if not row:
                # Не раскрываем что пользователя нет
                return json_response({"ok": True, "message": "Если email зарегистрирован, временный пароль отправлен"})

            # Генерируем временный пароль
            temp_password = secrets.token_urlsafe(9)
            pw_hash = hash_password(temp_password)
            cur.execute(
                f"UPDATE {schema}.users SET password_hash = %s WHERE id = %s",
                (pw_hash, row[0]),
            )
            conn.commit()

            # MVP: возвращаем временный пароль на клиент (для личного использования)
            return json_response({
                "ok": True,
                "temp_password": temp_password,
                "message": "Временный пароль создан. Войдите с ним и сразу смените на постоянный.",
            })

        # POST change_password — сменить пароль (требует сессию)
        if method == "POST" and action == "change_password":
            user = get_current_user(conn, session_id)
            if not user:
                return json_response({"error": "Не авторизован"}, 401)

            old_password = body.get("old_password", "")
            new_password = body.get("new_password", "")
            if not new_password or len(new_password) < 6:
                return json_response({"error": "Новый пароль минимум 6 символов"}, 400)

            cur = conn.cursor()
            cur.execute(
                f"SELECT password_hash FROM {schema}.users WHERE id = %s",
                (user["id"],),
            )
            current_hash = cur.fetchone()[0]
            valid, _ = verify_password(old_password, current_hash)
            if not valid:
                return json_response({"error": "Старый пароль неверный"}, 400)

            cur.execute(
                f"UPDATE {schema}.users SET password_hash = %s WHERE id = %s",
                (hash_password(new_password), user["id"]),
            )
            conn.commit()
            return json_response({"ok": True})

        return json_response({"error": "Not found"}, 404)

    finally:
        conn.close()