"""
Управление заданиями ИИ: создание, список, детали, назначение ролей документам.
"""
import json
import os
import psycopg2


INDEXER_URL = os.environ.get("SEARCH_INDEXER_URL", "")


def get_db():
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    conn.autocommit = False
    return conn


def notify_indexer(action: str, entity_type: str = None, entity_id: int = None):
    if not INDEXER_URL:
        return
    try:
        import urllib.request
        body = {}
        if entity_type:
            body["entity_type"] = entity_type
        if entity_id:
            body["entity_id"] = entity_id
        req = urllib.request.Request(
            f"{INDEXER_URL}?action={action}",
            data=json.dumps(body).encode(),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        urllib.request.urlopen(req, timeout=3)
    except Exception:
        pass


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


def _is_allowed_origin(origin: str) -> bool:
    """Безопасная проверка origin через urlparse — не raw endswith.
    Защита от попыток типа https://attacker.com/.poehali.dev"""
    if not origin:
        return False
    if origin in ALLOWED_ORIGINS:
        return True
    try:
        from urllib.parse import urlparse
        parsed = urlparse(origin)
        # Только https + допустимый hostname
        if parsed.scheme not in ("https", "http"):
            return False
        hostname = (parsed.hostname or "").lower()
        # Точное совпадение с poehali.dev или его поддоменом
        if hostname == "poehali.dev" or hostname.endswith(".poehali.dev"):
            return True
        return False
    except Exception:
        return False


def cors_headers(origin: str = None):
    """Strict CORS: deny-by-default. Без Allow-Credentials — auth через header, не cookies."""
    headers = {
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-Session-Id",
        "Vary": "Origin",
    }
    if _is_allowed_origin(origin):
        headers["Access-Control-Allow-Origin"] = origin
    return headers


def json_response(data, status=200, origin=None):
    return {
        "statusCode": status,
        "headers": {**cors_headers(origin), "Content-Type": "application/json"},
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
    origin = (event.get("headers") or {}).get("Origin") or (event.get("headers") or {}).get("origin")

    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": cors_headers(origin), "body": ""}

    method = event.get("httpMethod", "GET")
    path = event.get("path", "/")
    body = {}
    if event.get("body"):
        try:
            body = json.loads(event["body"])
        except Exception:
            pass

    session_id = event.get("headers", {}).get("X-Session-Id", "")
    params = event.get("queryStringParameters") or {}
    conn = get_db()
    schema = get_schema()
    path_parts = path.strip("/").split("/")

    try:
        user = get_current_user(conn, session_id)
        if not user:
            return json_response({"error": "Не авторизован"}, 401, origin=origin)

        cur = conn.cursor()

        action = body.get("action")

        # POST action=list_tasks — задания проекта
        project_id_q = params.get("project_id")
        body_pid = body.get("project_id") if action == "list_tasks" else None
        if (method == "GET" and ("project" in path_parts or project_id_q)) or body_pid:
            if body_pid:
                project_id = int(body_pid)
            elif project_id_q:
                project_id = int(project_id_q)
            else:
                idx = path_parts.index("project")
                project_id = int(path_parts[idx + 1])

            cur.execute(
                f"SELECT role FROM {schema}.project_members WHERE project_id = %s AND user_id = %s",
                (project_id, user["id"]),
            )
            if not cur.fetchone():
                return json_response({"error": "Нет доступа"}, 403, origin=origin)

            cur.execute(
                f"""SELECT t.id, t.title, t.task_type, t.topic, t.status, t.created_at, u.name,
                    (SELECT COUNT(*) FROM {schema}.generation_runs WHERE task_id = t.id) as versions
                    FROM {schema}.tasks t JOIN {schema}.users u ON u.id = t.created_by
                    WHERE t.project_id = %s ORDER BY t.created_at DESC""",
                (project_id,),
            )
            tasks = [
                {
                    "id": r[0], "title": r[1], "task_type": r[2], "topic": r[3],
                    "status": r[4], "created_at": str(r[5]), "created_by": r[6], "versions": r[7],
                }
                for r in cur.fetchall()
            ]
            return json_response({"tasks": tasks}, origin=origin)

        # POST / — создать задание (только если нет action)
        if method == "POST" and not action and body.get("title") and body.get("task_type"):
            project_id = body.get("project_id")
            title = body.get("title", "").strip()
            task_type = body.get("task_type", "")
            topic = body.get("topic", "")

            if not project_id or not title or not task_type:
                return json_response({"error": "Обязательные поля: project_id, title, task_type"}, 400, origin=origin)

            cur.execute(
                f"SELECT role FROM {schema}.project_members WHERE project_id = %s AND user_id = %s",
                (project_id, user["id"]),
            )
            if not cur.fetchone():
                return json_response({"error": "Нет доступа"}, 403, origin=origin)

            cur.execute(
                f"""INSERT INTO {schema}.tasks
                    (project_id, created_by, title, task_type, topic, goal, audience, language, style, requested_slide_count, additional_instructions, style_preset)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id""",
                (
                    project_id, user["id"], title, task_type, topic,
                    body.get("goal"), body.get("audience"),
                    body.get("language", "ru"), body.get("style"),
                    body.get("requested_slide_count"), body.get("additional_instructions"),
                    body.get("style_preset"),
                ),
            )
            task_id = cur.fetchone()[0]

            # Привязать документы с ролями + метаданными orchestration (P0)
            doc_roles = body.get("document_roles", [])
            for dr in doc_roles:
                cur.execute(
                    f"""INSERT INTO {schema}.task_documents
                        (task_id, document_id, role, usage_mode, priority, must_use, instruction)
                        VALUES (%s, %s, %s, %s, %s, %s, %s)
                        ON CONFLICT (task_id, document_id) DO UPDATE SET
                            role = EXCLUDED.role,
                            usage_mode = EXCLUDED.usage_mode,
                            priority = EXCLUDED.priority,
                            must_use = EXCLUDED.must_use,
                            instruction = EXCLUDED.instruction""",
                    (
                        task_id, dr["document_id"], dr["role"],
                        dr.get("usage_mode"), dr.get("priority", "medium"),
                        bool(dr.get("must_use", False)), dr.get("instruction", ""),
                    ),
                )

            log_activity(cur, schema, project_id, user["id"], "created_task", "task", task_id, title)
            conn.commit()
            notify_indexer("upsert", "task", task_id)
            return json_response({"id": task_id, "title": title, "task_type": task_type}, origin=origin)

        # GET /{id} — детали задания
        task_id_q = params.get("task_id")
        body_tid = body.get("task_id") if action == "get_task" else None
        if (method == "GET" and ((len(path_parts) >= 1 and path_parts[-1].isdigit()) or task_id_q)) or body_tid:
            if body_tid:
                task_id = int(body_tid)
            elif task_id_q:
                task_id = int(task_id_q)
            else:
                task_id = int(path_parts[-1])
            cur.execute(
                f"""SELECT t.id, t.project_id, t.title, t.task_type, t.topic, t.goal, t.audience,
                    t.language, t.style, t.requested_slide_count, t.additional_instructions,
                    t.status, t.created_at, u.name, t.style_preset
                    FROM {schema}.tasks t JOIN {schema}.users u ON u.id = t.created_by
                    WHERE t.id = %s""",
                (task_id,),
            )
            row = cur.fetchone()
            if not row:
                return json_response({"error": "Задание не найдено"}, 404, origin=origin)

            cur.execute(
                f"SELECT role FROM {schema}.project_members WHERE project_id = %s AND user_id = %s",
                (row[1], user["id"]),
            )
            if not cur.fetchone():
                return json_response({"error": "Нет доступа"}, 403, origin=origin)

            # Документы задания с метаданными orchestration (P0)
            cur.execute(
                f"""SELECT td.document_id, td.role, d.original_name, d.file_type,
                    td.usage_mode, td.priority, td.must_use, td.instruction
                    FROM {schema}.task_documents td JOIN {schema}.documents d ON d.id = td.document_id
                    WHERE td.task_id = %s""",
                (task_id,),
            )
            docs = [
                {
                    "id": r[0], "role": r[1], "name": r[2], "file_type": r[3],
                    "usage_mode": r[4], "priority": r[5] or "medium",
                    "must_use": bool(r[6]), "instruction": r[7] or "",
                }
                for r in cur.fetchall()
            ]

            # Версии генерации
            cur.execute(
                f"""SELECT id, version_number, output_summary, status, created_at
                    FROM {schema}.generation_runs WHERE task_id = %s ORDER BY version_number DESC""",
                (task_id,),
            )
            runs = [{"id": r[0], "version": r[1], "summary": r[2], "status": r[3], "created_at": str(r[4])} for r in cur.fetchall()]

            return json_response({
                "id": row[0], "project_id": row[1], "title": row[2],
                "task_type": row[3], "topic": row[4], "goal": row[5],
                "audience": row[6], "language": row[7], "style": row[8],
                "requested_slide_count": row[9], "additional_instructions": row[10],
                "status": row[11], "created_at": str(row[12]), "created_by": row[13],
                "style_preset": row[14],
                "documents": docs, "runs": runs,
            }, origin=origin)

        # PUT /{id}/documents — обновить роли документов
        if method == "PUT" and "documents" in path_parts:
            task_id = int(path_parts[-2])
            doc_roles = body.get("document_roles", [])

            cur.execute(f"SELECT project_id FROM {schema}.tasks WHERE id = %s", (task_id,))
            task_row = cur.fetchone()
            if not task_row:
                return json_response({"error": "Задание не найдено"}, 404, origin=origin)

            cur.execute(
                f"SELECT role FROM {schema}.project_members WHERE project_id = %s AND user_id = %s",
                (task_row[0], user["id"]),
            )
            if not cur.fetchone():
                return json_response({"error": "Нет доступа"}, 403, origin=origin)

            for dr in doc_roles:
                cur.execute(
                    f"""INSERT INTO {schema}.task_documents
                        (task_id, document_id, role, usage_mode, priority, must_use, instruction)
                        VALUES (%s, %s, %s, %s, %s, %s, %s)
                        ON CONFLICT (task_id, document_id) DO UPDATE SET
                            role = EXCLUDED.role,
                            usage_mode = EXCLUDED.usage_mode,
                            priority = EXCLUDED.priority,
                            must_use = EXCLUDED.must_use,
                            instruction = EXCLUDED.instruction""",
                    (
                        task_id, dr["document_id"], dr["role"],
                        dr.get("usage_mode"), dr.get("priority", "medium"),
                        bool(dr.get("must_use", False)), dr.get("instruction", ""),
                    ),
                )
            conn.commit()
            return json_response({"ok": True}, origin=origin)

        # ============================================================
        # NEW ACTIONS: редактирование настроек существующего задания
        # ============================================================

        # action=update_task_settings — обновить параметры задания (тема, стиль, слайды, ...)
        if action == "update_task_settings":
            task_id = int(body.get("task_id"))
            cur.execute(f"SELECT project_id FROM {schema}.tasks WHERE id = %s", (task_id,))
            tr = cur.fetchone()
            if not tr:
                return json_response({"error": "Задание не найдено"}, 404, origin=origin)
            cur.execute(
                f"SELECT role FROM {schema}.project_members WHERE project_id = %s AND user_id = %s",
                (tr[0], user["id"]),
            )
            if not cur.fetchone():
                return json_response({"error": "Нет доступа"}, 403, origin=origin)

            allowed = ("title", "topic", "goal", "audience", "style",
                       "requested_slide_count", "additional_instructions", "style_preset")
            sets = []
            params_sql = []
            for f in allowed:
                if f in body:
                    sets.append(f"{f} = %s")
                    params_sql.append(body[f] if body[f] != "" else None)
            if sets:
                sets.append("updated_at = NOW()")
                params_sql.append(task_id)
                cur.execute(
                    f"UPDATE {schema}.tasks SET {', '.join(sets)} WHERE id = %s",
                    tuple(params_sql),
                )
                log_activity(cur, schema, tr[0], user["id"], "updated_task_settings", "task", task_id, None)
                conn.commit()
                notify_indexer("upsert", "task", task_id)
            return json_response({"ok": True, "updated_fields": [f for f in allowed if f in body]}, origin=origin)

        # action=set_doc_role — изменить роль/инструкцию одного документа в задании
        if action == "set_doc_role":
            task_id = int(body.get("task_id"))
            document_id = int(body.get("document_id"))
            cur.execute(f"SELECT project_id FROM {schema}.tasks WHERE id = %s", (task_id,))
            tr = cur.fetchone()
            if not tr:
                return json_response({"error": "Задание не найдено"}, 404, origin=origin)
            cur.execute(
                f"SELECT role FROM {schema}.project_members WHERE project_id = %s AND user_id = %s",
                (tr[0], user["id"]),
            )
            if not cur.fetchone():
                return json_response({"error": "Нет доступа"}, 403, origin=origin)

            cur.execute(
                f"""INSERT INTO {schema}.task_documents
                    (task_id, document_id, role, usage_mode, priority, must_use, instruction)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (task_id, document_id) DO UPDATE SET
                        role = EXCLUDED.role,
                        usage_mode = COALESCE(EXCLUDED.usage_mode, task_documents.usage_mode),
                        priority = COALESCE(EXCLUDED.priority, task_documents.priority),
                        must_use = EXCLUDED.must_use,
                        instruction = EXCLUDED.instruction""",
                (
                    task_id, document_id, body.get("role", "content"),
                    body.get("usage_mode"), body.get("priority", "medium"),
                    bool(body.get("must_use", False)), body.get("instruction", "") or "",
                ),
            )
            conn.commit()
            return json_response({"ok": True}, origin=origin)

        # action=attach_document — добавить документ к существующему заданию
        if action == "attach_document":
            task_id = int(body.get("task_id"))
            document_id = int(body.get("document_id"))
            role = body.get("role", "content")

            cur.execute(f"SELECT project_id FROM {schema}.tasks WHERE id = %s", (task_id,))
            tr = cur.fetchone()
            if not tr:
                return json_response({"error": "Задание не найдено"}, 404, origin=origin)
            cur.execute(
                f"SELECT role FROM {schema}.project_members WHERE project_id = %s AND user_id = %s",
                (tr[0], user["id"]),
            )
            if not cur.fetchone():
                return json_response({"error": "Нет доступа"}, 403, origin=origin)

            # Документ должен принадлежать тому же проекту
            cur.execute(
                f"SELECT id FROM {schema}.documents WHERE id = %s AND project_id = %s",
                (document_id, tr[0]),
            )
            if not cur.fetchone():
                return json_response({"error": "Документ не из этого проекта"}, 400, origin=origin)

            cur.execute(
                f"""INSERT INTO {schema}.task_documents
                    (task_id, document_id, role, usage_mode, priority, must_use, instruction)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (task_id, document_id) DO NOTHING""",
                (
                    task_id, document_id, role,
                    body.get("usage_mode"), body.get("priority", "medium"),
                    bool(body.get("must_use", False)), body.get("instruction", "") or "",
                ),
            )
            conn.commit()
            return json_response({"ok": True, "attached": True}, origin=origin)

        # action=detach_document — отвязать документ от задания
        if action == "detach_document":
            task_id = int(body.get("task_id"))
            document_id = int(body.get("document_id"))

            cur.execute(f"SELECT project_id FROM {schema}.tasks WHERE id = %s", (task_id,))
            tr = cur.fetchone()
            if not tr:
                return json_response({"error": "Задание не найдено"}, 404, origin=origin)
            cur.execute(
                f"SELECT role FROM {schema}.project_members WHERE project_id = %s AND user_id = %s",
                (tr[0], user["id"]),
            )
            if not cur.fetchone():
                return json_response({"error": "Нет доступа"}, 403, origin=origin)

            cur.execute(
                f"DELETE FROM {schema}.task_documents WHERE task_id = %s AND document_id = %s",
                (task_id, document_id),
            )
            conn.commit()
            return json_response({"ok": True, "detached": True}, origin=origin)

        # action=list_project_documents — все документы проекта (для модалки прикрепления)
        if action == "list_project_documents":
            task_id = int(body.get("task_id"))
            cur.execute(f"SELECT project_id FROM {schema}.tasks WHERE id = %s", (task_id,))
            tr = cur.fetchone()
            if not tr:
                return json_response({"error": "Задание не найдено"}, 404, origin=origin)
            cur.execute(
                f"SELECT role FROM {schema}.project_members WHERE project_id = %s AND user_id = %s",
                (tr[0], user["id"]),
            )
            if not cur.fetchone():
                return json_response({"error": "Нет доступа"}, 403, origin=origin)

            cur.execute(
                f"""SELECT d.id, d.original_name, d.file_type,
                    (SELECT td.role FROM {schema}.task_documents td WHERE td.task_id = %s AND td.document_id = d.id) as attached_role
                    FROM {schema}.documents d
                    WHERE d.project_id = %s AND d.archived_at IS NULL
                    ORDER BY d.created_at DESC""",
                (task_id, tr[0]),
            )
            docs = [
                {"id": r[0], "name": r[1], "file_type": r[2], "attached_role": r[3]}
                for r in cur.fetchall()
            ]
            return json_response({"documents": docs}, origin=origin)

        return json_response({"error": "Not found"}, 404, origin=origin)

    finally:
        conn.close()