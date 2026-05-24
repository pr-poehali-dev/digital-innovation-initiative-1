"""
Управление проектами. Единый API-контракт v1.

ВСЕ запросы: POST / с обязательным полем action.
Поддерживаемые action:
  - project.list      — список своих проектов
  - project.get       — детали проекта (требует project_id)
  - project.create    — создать проект (требует title)
  - project.update    — обновить проект (требует project_id, title)
  - project.invite    — пригласить в проект (требует project_id, email)

Формат ответа:
  Success: {"ok": true, "data": {...}}
  Error:   {"ok": false, "error": {"code": "...", "message": "..."}}
"""
import json
import os
import uuid
import logging
import psycopg2

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("projects")


ALLOWED_ACTIONS = {
    "project.list",
    "project.get",
    "project.create",
    "project.update",
    "project.archive",
    "project.restore",
    "project.invite",
}


def get_db():
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    conn.autocommit = False
    return conn


def get_schema():
    return os.environ.get("MAIN_DB_SCHEMA", "public")


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
    """Strict CORS: deny-by-default. Если origin не в whitelist — НЕ возвращаем Access-Control-Allow-Origin.
    Это корректное поведение для credentialed CORS и предотвращает несанкционированный кросс-доменный доступ."""
    headers = {
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-Session-Id",
        "Access-Control-Allow-Credentials": "true",
        "Vary": "Origin",
    }
    if origin and (origin in ALLOWED_ORIGINS or origin.endswith(".poehali.dev")):
        headers["Access-Control-Allow-Origin"] = origin
    # Если origin неизвестен — Access-Control-Allow-Origin НЕ устанавливается,
    # браузер заблокирует кросс-доменный запрос (что и требуется)
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
        f"SELECT u.id, u.email, u.name FROM {schema}.sessions s JOIN {schema}.users u ON u.id = s.user_id WHERE s.id = %s AND s.expires_at > NOW()",
        (session_id,),
    )
    row = cur.fetchone()
    return {"id": row[0], "email": row[1], "name": row[2]} if row else None


def log_activity(cur, schema, project_id, user_id, action, entity_type=None, entity_id=None, details=None):
    cur.execute(
        f"INSERT INTO {schema}.activity_log (project_id, user_id, action, entity_type, entity_id, details) VALUES (%s, %s, %s, %s, %s, %s)",
        (project_id, user_id, action, entity_type, entity_id, details),
    )


def check_access(cur, schema, project_id, user_id):
    """Возвращает роль или None если нет доступа."""
    cur.execute(
        f"SELECT role FROM {schema}.project_members WHERE project_id = %s AND user_id = %s",
        (project_id, user_id),
    )
    row = cur.fetchone()
    return row[0] if row else None


def handle_list(conn, user, request_id, origin=None):
    schema = get_schema()
    cur = conn.cursor()
    # Фильтр archived_at IS NULL — архивные проекты не показываем
    cur.execute(
        f"""SELECT p.id, p.title, p.description, p.owner_id, p.created_at, p.updated_at,
            u.name as owner_name,
            (SELECT COUNT(*) FROM {schema}.documents WHERE project_id = p.id AND archived_at IS NULL) as doc_count,
            (SELECT COUNT(*) FROM {schema}.tasks WHERE project_id = p.id AND archived_at IS NULL) as task_count,
            pm.role
        FROM {schema}.projects p
        JOIN {schema}.project_members pm ON pm.project_id = p.id AND pm.user_id = %s
        JOIN {schema}.users u ON u.id = p.owner_id
        WHERE p.archived_at IS NULL
        ORDER BY p.updated_at DESC""",
        (user["id"],),
    )
    projects = [
        {
            "id": r[0], "title": r[1], "description": r[2],
            "owner_id": r[3], "created_at": str(r[4]), "updated_at": str(r[5]),
            "owner_name": r[6], "doc_count": r[7], "task_count": r[8], "my_role": r[9],
        }
        for r in cur.fetchall()
    ]
    return ok_response({"projects": projects}, request_id, origin=origin)


def handle_get(conn, user, body, request_id, origin=None):
    schema = get_schema()
    project_id = body.get("project_id")
    if not project_id:
        return err_response("validation_error", "Поле project_id обязательно", 400, request_id, origin=origin)
    try:
        project_id = int(project_id)
    except (TypeError, ValueError):
        return err_response("validation_error", "project_id должен быть числом", 400, request_id, origin=origin)

    cur = conn.cursor()
    role = check_access(cur, schema, project_id, user["id"])
    if not role:
        return err_response("access_denied", "Нет доступа к проекту", 403, request_id, origin=origin)

    cur.execute(
        f"SELECT id, title, description, owner_id, created_at, updated_at, archived_at FROM {schema}.projects WHERE id = %s",
        (project_id,),
    )
    p = cur.fetchone()
    if not p:
        return err_response("not_found", "Проект не найден", 404, request_id, origin=origin)
    if p[6] is not None:
        return err_response("not_found", "Проект архивирован", 404, request_id, origin=origin)

    cur.execute(
        f"SELECT u.id, u.name, u.email, pm.role, pm.joined_at FROM {schema}.project_members pm JOIN {schema}.users u ON u.id = pm.user_id WHERE pm.project_id = %s",
        (project_id,),
    )
    members = [{"id": r[0], "name": r[1], "email": r[2], "role": r[3], "joined_at": str(r[4])} for r in cur.fetchall()]

    cur.execute(
        f"SELECT a.action, a.entity_type, a.entity_id, a.details, a.created_at, u.name FROM {schema}.activity_log a JOIN {schema}.users u ON u.id = a.user_id WHERE a.project_id = %s ORDER BY a.created_at DESC LIMIT 20",
        (project_id,),
    )
    activity = [{"action": r[0], "entity_type": r[1], "entity_id": r[2], "details": r[3], "created_at": str(r[4]), "user_name": r[5]} for r in cur.fetchall()]

    return ok_response({
        "id": p[0], "title": p[1], "description": p[2],
        "owner_id": p[3], "created_at": str(p[4]), "updated_at": str(p[5]),
        "members": members, "activity": activity, "my_role": role,
    }, request_id, origin=origin)


def handle_create(conn, user, body, request_id, origin=None):
    schema = get_schema()
    title = (body.get("title") or "").strip()
    description = body.get("description") or ""
    if not title:
        return err_response("validation_error", "Поле title обязательно", 400, request_id, origin=origin)

    cur = conn.cursor()
    cur.execute(
        f"INSERT INTO {schema}.projects (title, description, owner_id) VALUES (%s, %s, %s) RETURNING id",
        (title, description, user["id"]),
    )
    project_id = cur.fetchone()[0]
    cur.execute(
        f"INSERT INTO {schema}.project_members (project_id, user_id, role) VALUES (%s, %s, 'owner')",
        (project_id, user["id"]),
    )
    log_activity(cur, schema, project_id, user["id"], "created_project", "project", project_id, title)
    conn.commit()
    return ok_response({"id": project_id, "title": title, "description": description}, request_id, origin=origin)


def handle_update(conn, user, body, request_id, origin=None):
    schema = get_schema()
    project_id = body.get("project_id")
    title = (body.get("title") or "").strip()
    description = body.get("description") or ""
    if not project_id or not title:
        return err_response("validation_error", "Поля project_id и title обязательны", 400, request_id, origin=origin)
    project_id = int(project_id)

    cur = conn.cursor()
    role = check_access(cur, schema, project_id, user["id"])
    if not role:
        return err_response("access_denied", "Нет доступа к проекту", 403, request_id, origin=origin)
    if role not in ("owner", "admin"):
        return err_response("access_denied", "Только владелец может редактировать", 403, request_id, origin=origin)

    cur.execute(
        f"UPDATE {schema}.projects SET title = %s, description = %s, updated_at = NOW() WHERE id = %s",
        (title, description, project_id),
    )
    log_activity(cur, schema, project_id, user["id"], "updated_project", "project", project_id)
    conn.commit()
    return ok_response({"ok": True}, request_id, origin=origin)


def handle_archive(conn, user, body, request_id, origin=None):
    """Soft delete проекта. Файлы/задания/история сохраняются — только скрытие из UI."""
    schema = get_schema()
    project_id = body.get("project_id")
    if not project_id:
        return err_response("validation_error", "Поле project_id обязательно", 400, request_id, origin=origin)
    project_id = int(project_id)

    cur = conn.cursor()
    role = check_access(cur, schema, project_id, user["id"])
    if not role:
        return err_response("access_denied", "Нет доступа к проекту", 403, request_id, origin=origin)
    if role != "owner":
        return err_response("access_denied", "Только владелец может архивировать", 403, request_id, origin=origin)

    cur.execute(
        f"SELECT title, archived_at FROM {schema}.projects WHERE id = %s",
        (project_id,),
    )
    row = cur.fetchone()
    if not row:
        return err_response("not_found", "Проект не найден", 404, request_id, origin=origin)
    if row[1] is not None:
        return err_response("validation_error", "Проект уже архивирован", 400, request_id, origin=origin)

    cur.execute(
        f"UPDATE {schema}.projects SET archived_at = NOW() WHERE id = %s",
        (project_id,),
    )
    log_activity(cur, schema, project_id, user["id"], "archived_project", "project", project_id, row[0])
    conn.commit()
    return ok_response({"ok": True, "archived": True, "can_restore": True}, request_id, origin=origin)


def handle_restore(conn, user, body, request_id, origin=None):
    """Восстановить проект из архива (только owner)."""
    schema = get_schema()
    project_id = body.get("project_id")
    if not project_id:
        return err_response("validation_error", "Поле project_id обязательно", 400, request_id, origin=origin)
    project_id = int(project_id)

    cur = conn.cursor()
    role = check_access(cur, schema, project_id, user["id"])
    if not role:
        return err_response("access_denied", "Нет доступа", 403, request_id, origin=origin)
    if role != "owner":
        return err_response("access_denied", "Только владелец", 403, request_id, origin=origin)

    cur.execute(
        f"UPDATE {schema}.projects SET archived_at = NULL WHERE id = %s RETURNING title",
        (project_id,),
    )
    row = cur.fetchone()
    if not row:
        return err_response("not_found", "Проект не найден", 404, request_id, origin=origin)
    log_activity(cur, schema, project_id, user["id"], "restored_project", "project", project_id, row[0])
    conn.commit()
    return ok_response({"ok": True}, request_id, origin=origin)


def handle_invite(conn, user, body, request_id, origin=None):
    schema = get_schema()
    project_id = body.get("project_id")
    email = (body.get("email") or "").strip().lower()
    if not project_id or not email:
        return err_response("validation_error", "Поля project_id и email обязательны", 400, request_id, origin=origin)
    project_id = int(project_id)

    cur = conn.cursor()
    role = check_access(cur, schema, project_id, user["id"])
    if not role:
        return err_response("access_denied", "Нет доступа к проекту", 403, request_id, origin=origin)
    if role not in ("owner", "admin"):
        return err_response("access_denied", "Только владелец может приглашать", 403, request_id, origin=origin)

    cur.execute(f"SELECT id, name FROM {schema}.users WHERE email = %s", (email,))
    invite_user = cur.fetchone()
    if not invite_user:
        return err_response("not_found", "Пользователь с таким email не найден", 404, request_id, origin=origin)

    cur.execute(
        f"INSERT INTO {schema}.project_members (project_id, user_id, role) VALUES (%s, %s, 'member') ON CONFLICT DO NOTHING",
        (project_id, invite_user[0]),
    )
    log_activity(cur, schema, project_id, user["id"], "invited_member", "user", invite_user[0], email)
    conn.commit()
    return ok_response({"name": invite_user[1]}, request_id, origin=origin)


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
    log.info("request_id=%s action=%s", request_id, action)

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

        if action == "project.list":
            return handle_list(conn, user, request_id, origin=origin)
        if action == "project.get":
            return handle_get(conn, user, body, request_id, origin=origin)
        if action == "project.create":
            return handle_create(conn, user, body, request_id, origin=origin)
        if action == "project.update":
            return handle_update(conn, user, body, request_id, origin=origin)
        if action == "project.archive":
            return handle_archive(conn, user, body, request_id, origin=origin)
        if action == "project.restore":
            return handle_restore(conn, user, body, request_id, origin=origin)
        if action == "project.invite":
            return handle_invite(conn, user, body, request_id, origin=origin)

        return err_response("not_implemented", "Не реализовано", 501, request_id, origin=origin)

    except Exception as e:
        log.exception("Unhandled error request_id=%s", request_id)
        return err_response("internal_error", f"Ошибка сервера: {str(e)[:200]}", 500, request_id, origin=origin)
    finally:
        conn.close()