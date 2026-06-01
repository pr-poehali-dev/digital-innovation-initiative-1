"""
Индексатор для глобального поиска.
Действия: index_all, upsert, delete, rebuild_acl.
Вызывается внутренне при create/update/delete сущностей.
"""
import json
import os
import psycopg2

DB = os.environ["DATABASE_URL"]
SCHEMA = os.environ.get("MAIN_DB_SCHEMA", "public")
INTERNAL_TOKEN = os.environ.get("SEARCH_INDEXER_TOKEN", "")


def get_db():
    conn = psycopg2.connect(DB)
    conn.autocommit = False
    return conn


def cors() -> dict:
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-Internal-Token",
    }


def resp(data: dict, code: int = 200) -> dict:
    return {
        "statusCode": code,
        "headers": {**cors(), "Content-Type": "application/json"},
        "body": json.dumps(data, ensure_ascii=False, default=str),
    }


def check_token(event: dict) -> bool:
    if not INTERNAL_TOKEN:
        return False  # Токен обязателен — без него запрещаем
    headers = event.get("headers") or {}
    token = headers.get("X-Internal-Token") or headers.get("x-internal-token") or ""
    return token == INTERNAL_TOKEN


def upsert_entity(conn, entity_type: str, entity_id: int,
                  title: str, content_text: str, project_id, meta: dict,
                  acl_user_ids: list):
    """Upsert одной сущности в search_index + пересобирает search_acl."""
    s = SCHEMA
    title_safe = (title or "").replace("'", "''")[:500]
    content_safe = (content_text or "").replace("'", "''")[:5000]
    meta_json = json.dumps(meta, ensure_ascii=False).replace("'", "''")
    project_id_sql = str(project_id) if project_id else "NULL"

    # Формируем search_vector: title с весом A, content с весом C
    vector_sql = f"setweight(to_tsvector('russian', '{title_safe}'), 'A')"
    if content_safe:
        vector_sql += f" || setweight(to_tsvector('russian', '{content_safe[:1000]}'), 'C')"

    with conn.cursor() as cur:
        cur.execute(f"""
            INSERT INTO {s}.search_index
                (entity_type, entity_id, project_id, title, content_text, search_vector, meta, updated_at)
            VALUES
                ('{entity_type}', {entity_id}, {project_id_sql},
                 '{title_safe}', '{content_safe}', {vector_sql},
                 '{meta_json}'::jsonb, now())
            ON CONFLICT (entity_type, entity_id) DO UPDATE SET
                project_id = EXCLUDED.project_id,
                title = EXCLUDED.title,
                content_text = EXCLUDED.content_text,
                search_vector = EXCLUDED.search_vector,
                meta = EXCLUDED.meta,
                updated_at = now()
        """)

        # Пересобираем ACL: удаляем старые, вставляем новые
        cur.execute(
            f"DELETE FROM {s}.search_acl WHERE entity_type = '{entity_type}' AND entity_id = {entity_id}"
        )
        for uid in set(acl_user_ids):
            cur.execute(
                f"INSERT INTO {s}.search_acl (entity_type, entity_id, user_id) "
                f"VALUES ('{entity_type}', {entity_id}, {uid}) "
                f"ON CONFLICT DO NOTHING"
            )

    conn.commit()


def delete_entity(conn, entity_type: str, entity_id: int):
    s = SCHEMA
    with conn.cursor() as cur:
        cur.execute(
            f"DELETE FROM {s}.search_index WHERE entity_type = '{entity_type}' AND entity_id = {entity_id}"
        )
        cur.execute(
            f"DELETE FROM {s}.search_acl WHERE entity_type = '{entity_type}' AND entity_id = {entity_id}"
        )
    conn.commit()


def get_project_user_ids(conn, project_id: int) -> list:
    """Все пользователи с доступом к проекту: owner + members."""
    s = SCHEMA
    with conn.cursor() as cur:
        cur.execute(
            f"SELECT owner_id FROM {s}.projects WHERE id = {project_id} AND owner_id IS NOT NULL"
        )
        row = cur.fetchone()
        owner_ids = [row[0]] if row else []

        cur.execute(
            f"SELECT user_id FROM {s}.project_members WHERE project_id = {project_id} AND user_id IS NOT NULL"
        )
        member_ids = [r[0] for r in cur.fetchall()]

    return list(set(owner_ids + member_ids))


def action_index_all(conn) -> dict:
    """Полный пересчёт индекса для всех сущностей."""
    s = SCHEMA
    indexed = 0

    # --- Projects ---
    with conn.cursor() as cur:
        cur.execute(
            f"SELECT id, title, description, owner_id FROM {s}.projects "
            f"WHERE archived_at IS NULL"
        )
        projects = cur.fetchall()

    for pid, title, desc, owner_id in projects:
        user_ids = get_project_user_ids(conn, pid)
        upsert_entity(conn, "project", pid,
                      title or "",
                      desc or "",
                      None,
                      {"route": f"/cabinet/project/{pid}"},
                      user_ids)
        indexed += 1

    # --- Tasks ---
    with conn.cursor() as cur:
        cur.execute(
            f"SELECT t.id, t.project_id, t.title, t.topic, t.goal, t.created_by "
            f"FROM {s}.tasks t "
            f"WHERE t.archived_at IS NULL"
        )
        tasks = cur.fetchall()

    for tid, project_id, title, topic, goal, created_by in tasks:
        content = " ".join(filter(None, [topic, goal]))
        user_ids = get_project_user_ids(conn, project_id) if project_id else (
            [created_by] if created_by else []
        )
        upsert_entity(conn, "task", tid,
                      title or "",
                      content,
                      project_id,
                      {"route": f"/cabinet/project/{project_id}/task/{tid}",
                       "project_id": project_id},
                      user_ids)
        indexed += 1

    # --- Documents ---
    with conn.cursor() as cur:
        cur.execute(
            f"SELECT d.id, d.project_id, d.original_name, d.extracted_text, d.extracted_length "
            f"FROM {s}.documents d "
            f"WHERE d.archived_at IS NULL"
        )
        documents = cur.fetchall()

    for did, project_id, name, extracted_text, extracted_length in documents:
        content = ""
        if extracted_text and (extracted_length or 0) > 0:
            content = extracted_text[:3000]
        user_ids = get_project_user_ids(conn, project_id) if project_id else []
        upsert_entity(conn, "document", did,
                      name or "",
                      content,
                      project_id,
                      {"route": f"/cabinet/project/{project_id}/document/{did}",
                       "project_id": project_id},
                      user_ids)
        indexed += 1

    # --- Education items ---
    with conn.cursor() as cur:
        cur.execute(
            f"SELECT id, user_id, title, description, field_of_study, issuer_name "
            f"FROM {s}.education_items "
            f"WHERE archived_at IS NULL"
        )
        edu_items = cur.fetchall()

    for eid, user_id, title, desc, field, issuer in edu_items:
        content = " ".join(filter(None, [desc, field, issuer]))
        upsert_entity(conn, "education", eid,
                      title or "",
                      content,
                      None,
                      {"route": f"/cabinet/passport"},
                      [user_id] if user_id else [])
        indexed += 1

    return {"ok": True, "indexed": indexed}


def action_upsert(conn, body: dict) -> dict:
    """Upsert одной сущности по entity_type + entity_id."""
    entity_type = body.get("entity_type")
    entity_id = body.get("entity_id")
    if not entity_type or not entity_id:
        return {"error": "entity_type and entity_id required"}

    s = SCHEMA

    if entity_type == "project":
        with conn.cursor() as cur:
            cur.execute(
                f"SELECT id, title, description FROM {s}.projects WHERE id = {entity_id}"
            )
            row = cur.fetchone()
        if not row:
            return {"error": "not_found"}
        user_ids = get_project_user_ids(conn, entity_id)
        upsert_entity(conn, "project", entity_id,
                      row[1] or "", row[2] or "", None,
                      {"route": f"/cabinet/project/{entity_id}"},
                      user_ids)

    elif entity_type == "task":
        with conn.cursor() as cur:
            cur.execute(
                f"SELECT id, project_id, title, topic, goal, created_by "
                f"FROM {s}.tasks WHERE id = {entity_id}"
            )
            row = cur.fetchone()
        if not row:
            return {"error": "not_found"}
        tid, project_id, title, topic, goal, created_by = row
        content = " ".join(filter(None, [topic, goal]))
        user_ids = get_project_user_ids(conn, project_id) if project_id else (
            [created_by] if created_by else []
        )
        upsert_entity(conn, "task", entity_id,
                      title or "", content, project_id,
                      {"route": f"/cabinet/project/{project_id}/task/{entity_id}",
                       "project_id": project_id},
                      user_ids)

    elif entity_type == "document":
        with conn.cursor() as cur:
            cur.execute(
                f"SELECT id, project_id, original_name, extracted_text, extracted_length "
                f"FROM {s}.documents WHERE id = {entity_id}"
            )
            row = cur.fetchone()
        if not row:
            return {"error": "not_found"}
        did, project_id, name, extracted_text, extracted_length = row
        content = extracted_text[:3000] if extracted_text and (extracted_length or 0) > 0 else ""
        user_ids = get_project_user_ids(conn, project_id) if project_id else []
        upsert_entity(conn, "document", entity_id,
                      name or "", content, project_id,
                      {"route": f"/cabinet/project/{project_id}/document/{entity_id}",
                       "project_id": project_id},
                      user_ids)

    elif entity_type == "education":
        with conn.cursor() as cur:
            cur.execute(
                f"SELECT id, user_id, title, description, field_of_study, issuer_name "
                f"FROM {s}.education_items WHERE id = {entity_id}"
            )
            row = cur.fetchone()
        if not row:
            return {"error": "not_found"}
        eid, user_id, title, desc, field, issuer = row
        content = " ".join(filter(None, [desc, field, issuer]))
        upsert_entity(conn, "education", entity_id,
                      title or "", content, None,
                      {"route": "/cabinet/passport"},
                      [user_id] if user_id else [])
    else:
        return {"error": f"unknown entity_type: {entity_type}"}

    return {"ok": True, "entity_type": entity_type, "entity_id": entity_id}


def action_delete(conn, body: dict) -> dict:
    entity_type = body.get("entity_type")
    entity_id = body.get("entity_id")
    if not entity_type or not entity_id:
        return {"error": "entity_type and entity_id required"}
    delete_entity(conn, entity_type, int(entity_id))
    return {"ok": True, "deleted": f"{entity_type}:{entity_id}"}


def action_rebuild_acl(conn, body: dict) -> dict:
    """Пересобирает ACL для всех сущностей проекта (при добавлении/удалении участника)."""
    project_id = body.get("project_id")
    if not project_id:
        return {"error": "project_id required"}

    s = SCHEMA
    user_ids = get_project_user_ids(conn, int(project_id))

    with conn.cursor() as cur:
        cur.execute(
            f"SELECT entity_type, entity_id FROM {s}.search_index "
            f"WHERE project_id = {project_id}"
        )
        entities = cur.fetchall()

    rebuilt = 0
    for entity_type, entity_id in entities:
        with conn.cursor() as cur:
            cur.execute(
                f"DELETE FROM {s}.search_acl WHERE entity_type = '{entity_type}' AND entity_id = {entity_id}"
            )
            for uid in user_ids:
                cur.execute(
                    f"INSERT INTO {s}.search_acl (entity_type, entity_id, user_id) "
                    f"VALUES ('{entity_type}', {entity_id}, {uid}) ON CONFLICT DO NOTHING"
                )
        conn.commit()
        rebuilt += 1

    return {"ok": True, "rebuilt": rebuilt, "project_id": project_id}


def handler(event: dict, context) -> dict:
    """Индексатор поиска: index_all / upsert / delete / rebuild_acl."""
    method = event.get("httpMethod", "POST")

    if method == "OPTIONS":
        return resp({})

    if not check_token(event):
        return resp({"error": "forbidden"}, 403)

    params = event.get("queryStringParameters") or {}
    action = params.get("action", "")

    body = {}
    if event.get("body"):
        try:
            body = json.loads(event["body"])
        except Exception:
            pass

    conn = get_db()
    try:
        if action == "index_all":
            return resp(action_index_all(conn))

        if action == "upsert":
            return resp(action_upsert(conn, body))

        if action == "delete":
            return resp(action_delete(conn, body))

        if action == "rebuild_acl":
            return resp(action_rebuild_acl(conn, body))

        return resp({"error": "unknown action. Use: index_all, upsert, delete, rebuild_acl"}, 400)

    finally:
        conn.close()