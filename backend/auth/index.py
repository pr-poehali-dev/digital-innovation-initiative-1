"""
Аутентификация пользователей: регистрация, вход, выход, проверка сессии.
"""
import json
import os
import hashlib
import secrets
from datetime import datetime, timedelta
import psycopg2


def get_db():
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    conn.autocommit = False
    return conn


def get_schema():
    return os.environ.get("MAIN_DB_SCHEMA", "public")


def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()


def cors_headers():
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-Session-Id",
    }


def json_response(data, status=200):
    return {
        "statusCode": status,
        "headers": {**cors_headers(), "Content-Type": "application/json"},
        "body": json.dumps(data, ensure_ascii=False, default=str),
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
            pw_hash = hash_password(password)

            cur = conn.cursor()
            cur.execute(
                f"SELECT id, name FROM {schema}.users WHERE email = %s AND password_hash = %s",
                (email, pw_hash),
            )
            row = cur.fetchone()
            if not row:
                return json_response({"error": "Неверный email или пароль"}, 401)

            user_id, name = row
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
            if hash_password(old_password) != current_hash:
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