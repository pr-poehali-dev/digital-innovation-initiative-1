"""
Управление проектами: создание, список, детали, добавление участников.
"""
import json
import os
import psycopg2


def get_db():
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    conn.autocommit = False
    return conn


def get_schema():
    return os.environ.get("MAIN_DB_SCHEMA", "public")


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


def log_activity(cur, schema, project_id, user_id, action, entity_type=None, entity_id=None, details=None):
    cur.execute(
        f"INSERT INTO {schema}.activity_log (project_id, user_id, action, entity_type, entity_id, details) VALUES (%s, %s, %s, %s, %s, %s)",
        (project_id, user_id, action, entity_type, entity_id, details),
    )


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

    params = event.get("queryStringParameters") or {}
    session_id = event.get("headers", {}).get("X-Session-Id", "")
    conn = get_db()
    schema = get_schema()

    try:
        user = get_current_user(conn, session_id)
        if not user:
            return json_response({"error": "Не авторизован"}, 401)

        cur = conn.cursor()

        # GET / — список проектов пользователя
        if method == "GET" and (path.endswith("/projects") or path == "/"):
            cur.execute(
                f"""SELECT p.id, p.title, p.description, p.owner_id, p.created_at, p.updated_at,
                    u.name as owner_name,
                    (SELECT COUNT(*) FROM {schema}.documents WHERE project_id = p.id) as doc_count,
                    (SELECT COUNT(*) FROM {schema}.tasks WHERE project_id = p.id) as task_count,
                    pm.role
                FROM {schema}.projects p
                JOIN {schema}.project_members pm ON pm.project_id = p.id AND pm.user_id = %s
                JOIN {schema}.users u ON u.id = p.owner_id
                ORDER BY p.updated_at DESC""",
                (user["id"],),
            )
            rows = cur.fetchall()
            projects = [
                {
                    "id": r[0], "title": r[1], "description": r[2],
                    "owner_id": r[3], "created_at": str(r[4]), "updated_at": str(r[5]),
                    "owner_name": r[6], "doc_count": r[7], "task_count": r[8], "my_role": r[9],
                }
                for r in rows
            ]
            return json_response({"projects": projects})

        # POST / — создать проект
        if method == "POST" and (path.endswith("/projects") or path == "/"):
            title = body.get("title", "").strip()
            description = body.get("description", "")
            if not title:
                return json_response({"error": "Название обязательно"}, 400)

            cur.execute(
                f"INSERT INTO {schema}.projects (title, description, owner_id) VALUES (%s, %s, %s) RETURNING id",
                (title, description, user["id"]),
            )
            project_id = cur.fetchone()[0]
            # Добавить создателя как owner
            cur.execute(
                f"INSERT INTO {schema}.project_members (project_id, user_id, role) VALUES (%s, %s, 'owner')",
                (project_id, user["id"]),
            )
            log_activity(cur, schema, project_id, user["id"], "created_project", "project", project_id, title)
            conn.commit()
            return json_response({"id": project_id, "title": title, "description": description})

        # POST с action=get_project — детали проекта (надёжнее чем query/path через прокси)
        path_parts = path.strip("/").split("/")
        project_id_from_query = params.get("id") if params else None
        project_id_from_body = body.get("project_id") if body.get("action") == "get_project" else None
        if (len(path_parts) >= 1 and path_parts[-1].isdigit()) or project_id_from_query or project_id_from_body:
            if project_id_from_body:
                project_id = int(project_id_from_body)
            elif project_id_from_query:
                project_id = int(project_id_from_query)
            else:
                project_id = int(path_parts[-1])

            # Проверка доступа
            cur.execute(
                f"SELECT role FROM {schema}.project_members WHERE project_id = %s AND user_id = %s",
                (project_id, user["id"]),
            )
            access = cur.fetchone()
            if not access:
                return json_response({"error": "Нет доступа"}, 403)

            if method == "GET":
                cur.execute(
                    f"SELECT id, title, description, owner_id, created_at, updated_at FROM {schema}.projects WHERE id = %s",
                    (project_id,),
                )
                p = cur.fetchone()
                if not p:
                    return json_response({"error": "Проект не найден"}, 404)

                # Участники
                cur.execute(
                    f"SELECT u.id, u.name, u.email, pm.role, pm.joined_at FROM {schema}.project_members pm JOIN {schema}.users u ON u.id = pm.user_id WHERE pm.project_id = %s",
                    (project_id,),
                )
                members = [{"id": r[0], "name": r[1], "email": r[2], "role": r[3], "joined_at": str(r[4])} for r in cur.fetchall()]

                # Последняя активность
                cur.execute(
                    f"SELECT a.action, a.entity_type, a.entity_id, a.details, a.created_at, u.name FROM {schema}.activity_log a JOIN {schema}.users u ON u.id = a.user_id WHERE a.project_id = %s ORDER BY a.created_at DESC LIMIT 20",
                    (project_id,),
                )
                activity = [{"action": r[0], "entity_type": r[1], "entity_id": r[2], "details": r[3], "created_at": str(r[4]), "user_name": r[5]} for r in cur.fetchall()]

                return json_response({
                    "id": p[0], "title": p[1], "description": p[2],
                    "owner_id": p[3], "created_at": str(p[4]), "updated_at": str(p[5]),
                    "members": members, "activity": activity, "my_role": access[0],
                })

            if method == "PUT":
                title = body.get("title")
                description = body.get("description")
                if title:
                    cur.execute(
                        f"UPDATE {schema}.projects SET title = %s, description = %s, updated_at = NOW() WHERE id = %s",
                        (title, description, project_id),
                    )
                    log_activity(cur, schema, project_id, user["id"], "updated_project", "project", project_id)
                    conn.commit()
                return json_response({"ok": True})

        # POST invite — пригласить по email (action в body)
        if method == "POST" and (body.get("action") == "invite" or "invite" in path):
            project_id = body.get("project_id")
            if not project_id:
                path_parts = path.strip("/").split("/")
                if len(path_parts) >= 2 and path_parts[-1] == "invite":
                    project_id = int(path_parts[-2])
            if not project_id:
                return json_response({"error": "Неверный запрос"}, 400)

            cur.execute(
                f"SELECT role FROM {schema}.project_members WHERE project_id = %s AND user_id = %s",
                (project_id, user["id"]),
            )
            access = cur.fetchone()
            if not access or access[0] not in ("owner", "admin"):
                return json_response({"error": "Нет прав"}, 403)

            email = body.get("email", "").strip().lower()
            cur.execute(f"SELECT id, name FROM {schema}.users WHERE email = %s", (email,))
            invite_user = cur.fetchone()
            if not invite_user:
                return json_response({"error": "Пользователь не найден"}, 404)

            cur.execute(
                f"INSERT INTO {schema}.project_members (project_id, user_id, role) VALUES (%s, %s, 'member') ON CONFLICT DO NOTHING",
                (project_id, invite_user[0]),
            )
            log_activity(cur, schema, project_id, user["id"], "invited_member", "user", invite_user[0], email)
            conn.commit()
            return json_response({"ok": True, "name": invite_user[1]})

        return json_response({"error": "Not found"}, 404)

    finally:
        conn.close()