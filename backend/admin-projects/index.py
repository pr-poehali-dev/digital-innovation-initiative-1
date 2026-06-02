"""
Phase 3B — admin-projects.
Действия: list, get, members, tasks, documents, archive, restore.
Аутентификация: X-Admin-Token (admin-auth сессия).
archive/restore: та же семантика что и в основном projects backend.
Side effects: activity_log + admin_audit_log + search index (delete/upsert).
"""
import json
import os
import hashlib
import psycopg2
import urllib.request

DB = os.environ["DATABASE_URL"]
_schema_env = os.environ.get("MAIN_DB_SCHEMA", "").strip()
SCHEMA = _schema_env if _schema_env else "t_p61016064_digital_innovation_i"
INDEXER_URL = os.environ.get("SEARCH_INDEXER_URL", "")
INDEXER_TOKEN = os.environ.get("SEARCH_INDEXER_TOKEN", "")
print(f"[admin-projects] SCHEMA={SCHEMA}")


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


# ── Helpers ───────────────────────────────────────────────────────

def notify_indexer(action: str, entity_type: str = None, entity_id: int = None,
                   project_id: int = None):
    """Уведомляет search-indexer. Ошибки не блокируют основной запрос."""
    if not INDEXER_URL:
        return
    try:
        body = {}
        if entity_type:
            body["entity_type"] = entity_type
        if entity_id:
            body["entity_id"] = entity_id
        if project_id:
            body["project_id"] = project_id
        hdrs = {"Content-Type": "application/json"}
        if INDEXER_TOKEN:
            hdrs["X-Internal-Token"] = INDEXER_TOKEN
        req = urllib.request.Request(
            f"{INDEXER_URL}?action={action}",
            data=json.dumps(body).encode(),
            headers=hdrs,
            method="POST",
        )
        urllib.request.urlopen(req, timeout=3)
    except Exception:
        pass


def write_audit(conn, actor: dict, action: str, entity_id: int | None,
                before: dict, after: dict, reason: str, ip: str, ua: str,
                entity_type: str = "project"):
    s = SCHEMA
    b = json.dumps(before, ensure_ascii=False, default=str).replace("'", "''")
    a = json.dumps(after, ensure_ascii=False, default=str).replace("'", "''")
    r = (reason or "").replace("'", "''")
    ip_s = (ip or "")[:64].replace("'", "''")
    ua_s = (ua or "")[:500].replace("'", "''")
    eid_sql = str(entity_id) if entity_id else "NULL"
    et_sql = entity_type.replace("'", "''")
    with conn.cursor() as cur:
        cur.execute(f"""
            INSERT INTO {s}.admin_audit_log
                (actor_email, actor_role, action, entity_type, entity_id,
                 before_json, after_json, reason, ip_address, user_agent)
            VALUES (
                '{actor["actor_email"]}', '{actor["actor_role"]}',
                '{action}', '{et_sql}', {eid_sql},
                '{b}'::jsonb, '{a}'::jsonb,
                '{r}', '{ip_s}', '{ua_s}'
            )
        """)


def write_activity(conn, project_id: int, action: str, title: str = ""):
    """Пишет в activity_log — та же таблица, что и основной бэкенд."""
    s = SCHEMA
    t = (title or "").replace("'", "''")
    with conn.cursor() as cur:
        cur.execute(f"""
            INSERT INTO {s}.activity_log
                (project_id, user_id, action, entity_type, entity_id, details)
            VALUES ({project_id}, NULL, '{action}', 'project', {project_id}, '{t}')
        """)


def get_project_base(conn, project_id: int) -> dict | None:
    s = SCHEMA
    with conn.cursor() as cur:
        cur.execute(f"""
            SELECT
                p.id, p.title, p.description, p.owner_id, p.created_at, p.updated_at,
                p.archived_at,
                u.email  AS owner_email,
                u.name   AS owner_name,
                (SELECT COUNT(*) FROM {s}.project_members pm WHERE pm.project_id = p.id) AS members_count,
                (SELECT COUNT(*) FROM {s}.tasks t
                 WHERE t.project_id = p.id AND t.archived_at IS NULL)              AS tasks_count,
                (SELECT COUNT(*) FROM {s}.documents d
                 WHERE d.project_id = p.id AND d.archived_at IS NULL)              AS docs_count
            FROM {s}.projects p
            LEFT JOIN {s}.users u ON u.id = p.owner_id
            WHERE p.id = {project_id}
            LIMIT 1
        """)
        row = cur.fetchone()
    if not row:
        return None
    return {
        "id":               row[0],
        "title":            row[1],
        "description":      row[2],
        "owner_id":         row[3],
        "created_at":       row[4],
        "updated_at":       row[5],
        "archived_at":      row[6],
        "is_archived":      row[6] is not None,
        "owner_email":      row[7],
        "owner_name":       row[8],
        "members_count":    row[9],
        "tasks_count":      row[10],
        "documents_count":  row[11],
    }


# ── Actions ───────────────────────────────────────────────────────

def action_list(conn, params: dict, origin: str) -> dict:
    s = SCHEMA
    q    = (params.get("q") or "").strip().replace("'", "''")
    flt  = params.get("filter", "all")    # all | active | archived
    page = max(1, int(params.get("page", 1)))
    per  = min(100, max(1, int(params.get("per_page", 20))))
    off  = (page - 1) * per

    where_parts = []
    if q:
        where_parts.append(
            f"(lower(p.title) LIKE lower('%{q}%') "
            f"OR lower(coalesce(p.description,'')) LIKE lower('%{q}%'))"
        )
    if flt == "active":
        where_parts.append("p.archived_at IS NULL")
    elif flt == "archived":
        where_parts.append("p.archived_at IS NOT NULL")

    where_sql = ("WHERE " + " AND ".join(where_parts)) if where_parts else ""

    base = f"""
        FROM {s}.projects p
        LEFT JOIN {s}.users u ON u.id = p.owner_id
        {where_sql}
    """

    with conn.cursor() as cur:
        cur.execute(f"SELECT COUNT(*) {base}")
        total = cur.fetchone()[0]

        cur.execute(f"""
            SELECT
                p.id, p.title, p.description, p.owner_id,
                u.email AS owner_email, u.name AS owner_name,
                p.created_at, p.updated_at, p.archived_at,
                (SELECT COUNT(*) FROM {s}.project_members pm WHERE pm.project_id = p.id),
                (SELECT COUNT(*) FROM {s}.tasks t
                 WHERE t.project_id = p.id AND t.archived_at IS NULL),
                (SELECT COUNT(*) FROM {s}.documents d
                 WHERE d.project_id = p.id AND d.archived_at IS NULL)
            {base}
            ORDER BY p.created_at DESC
            LIMIT {per} OFFSET {off}
        """)
        rows = cur.fetchall()

    projects = []
    for r in rows:
        desc = r[2] or ""
        projects.append({
            "id":               r[0],
            "title":            r[1],
            "description_preview": desc[:120] + ("…" if len(desc) > 120 else ""),
            "owner_id":         r[3],
            "owner_email":      r[4],
            "owner_name":       r[5],
            "created_at":       r[6],
            "updated_at":       r[7],
            "archived_at":      r[8],
            "is_archived":      r[8] is not None,
            "members_count":    r[9],
            "tasks_count":      r[10],
            "documents_count":  r[11],
        })

    return resp({
        "projects": projects,
        "total":    total,
        "page":     page,
        "per_page": per,
        "pages":    max(1, -(-total // per)),
    }, origin=origin)


def action_get(conn, project_id: int, origin: str) -> dict:
    project = get_project_base(conn, project_id)
    if not project:
        return resp({"error": "not_found"}, 404, origin)
    return resp({"project": project}, origin=origin)


def action_members(conn, project_id: int, origin: str) -> dict:
    s = SCHEMA
    # Проверяем что проект существует
    with conn.cursor() as cur:
        cur.execute(f"SELECT id FROM {s}.projects WHERE id = {project_id} LIMIT 1")
        if not cur.fetchone():
            return resp({"error": "not_found"}, 404, origin)

        cur.execute(f"""
            SELECT u.id, u.name, u.email, pm.role, pm.joined_at,
                   COALESCE(f.is_blocked, FALSE) AS is_blocked
            FROM {s}.project_members pm
            JOIN {s}.users u ON u.id = pm.user_id
            LEFT JOIN {s}.admin_user_flags f ON f.user_id = u.id
            WHERE pm.project_id = {project_id}
            ORDER BY pm.joined_at ASC NULLS LAST
        """)
        rows = cur.fetchall()

    members = [
        {
            "user_id":   r[0],
            "name":      r[1],
            "email":     r[2],
            "role":      r[3],
            "joined_at": r[4],
            "is_blocked": r[5],
        }
        for r in rows
    ]
    return resp({"members": members, "total": len(members)}, origin=origin)


def action_tasks(conn, project_id: int, params: dict, origin: str) -> dict:
    s = SCHEMA
    page = max(1, int(params.get("page", 1)))
    per  = min(100, max(1, int(params.get("per_page", 20))))
    off  = (page - 1) * per

    with conn.cursor() as cur:
        cur.execute(f"SELECT id FROM {s}.projects WHERE id = {project_id} LIMIT 1")
        if not cur.fetchone():
            return resp({"error": "not_found"}, 404, origin)

        cur.execute(f"SELECT COUNT(*) FROM {s}.tasks WHERE project_id = {project_id}")
        total = cur.fetchone()[0]

        cur.execute(f"""
            SELECT t.id, t.title, t.task_type, t.status, t.created_at, t.updated_at,
                   t.archived_at, u.name AS creator_name, u.email AS creator_email,
                   (SELECT COUNT(*) FROM {s}.generation_runs gr WHERE gr.task_id = t.id) AS versions
            FROM {s}.tasks t
            LEFT JOIN {s}.users u ON u.id = t.created_by
            WHERE t.project_id = {project_id}
            ORDER BY t.created_at DESC
            LIMIT {per} OFFSET {off}
        """)
        rows = cur.fetchall()

    tasks = [
        {
            "id":            r[0],
            "title":         r[1],
            "task_type":     r[2],
            "status":        r[3],
            "created_at":    r[4],
            "updated_at":    r[5],
            "archived_at":   r[6],
            "is_archived":   r[6] is not None,
            "creator_name":  r[7],
            "creator_email": r[8],
            "versions":      r[9],
        }
        for r in rows
    ]
    return resp({
        "tasks": tasks, "total": total,
        "page": page, "per_page": per,
        "pages": max(1, -(-total // per)),
    }, origin=origin)


def action_documents(conn, project_id: int, params: dict, origin: str) -> dict:
    s = SCHEMA
    page = max(1, int(params.get("page", 1)))
    per  = min(100, max(1, int(params.get("per_page", 20))))
    off  = (page - 1) * per

    with conn.cursor() as cur:
        cur.execute(f"SELECT id FROM {s}.projects WHERE id = {project_id} LIMIT 1")
        if not cur.fetchone():
            return resp({"error": "not_found"}, 404, origin)

        cur.execute(f"SELECT COUNT(*) FROM {s}.documents WHERE project_id = {project_id}")
        total = cur.fetchone()[0]

        cur.execute(f"""
            SELECT d.id, d.original_name, d.file_type, d.file_size, d.category,
                   d.created_at, d.archived_at,
                   u.name AS uploader_name, u.email AS uploader_email,
                   d.extracted_length
            FROM {s}.documents d
            LEFT JOIN {s}.project_members pm
                ON pm.project_id = d.project_id AND pm.role = 'owner'
            LEFT JOIN {s}.users u ON u.id = pm.user_id
            WHERE d.project_id = {project_id}
            ORDER BY d.created_at DESC
            LIMIT {per} OFFSET {off}
        """)
        rows = cur.fetchall()

    docs = [
        {
            "id":             r[0],
            "original_name":  r[1],
            "file_type":      r[2],
            "file_size":      r[3],
            "category":       r[4],
            "created_at":     r[5],
            "archived_at":    r[6],
            "is_archived":    r[6] is not None,
            "uploader_name":  r[7],
            "uploader_email": r[8],
            "text_length":    r[9],
        }
        for r in rows
    ]
    return resp({
        "documents": docs, "total": total,
        "page": page, "per_page": per,
        "pages": max(1, -(-total // per)),
    }, origin=origin)


def action_archive(conn, actor: dict, body: dict, ip: str, ua: str, origin: str) -> dict:
    """
    Архивирование проекта: та же семантика, что и handle_archive в projects.
    UPDATE projects SET archived_at = NOW()
    + activity_log + admin_audit_log + search index delete + rebuild_acl
    """
    project_id = body.get("project_id")
    reason = (body.get("reason") or "").strip()
    if not project_id:
        return resp({"error": "project_id required"}, 400, origin)
    if len(reason) < 10:
        return resp({"error": "reason must be at least 10 characters"}, 400, origin)

    project_id = int(project_id)
    s = SCHEMA
    before = get_project_base(conn, project_id)
    if not before:
        return resp({"error": "not_found"}, 404, origin)
    if before["is_archived"]:
        return resp({"error": "already_archived"}, 409, origin)

    with conn.cursor() as cur:
        cur.execute(
            f"UPDATE {s}.projects SET archived_at = NOW() WHERE id = {project_id}"
        )

    write_activity(conn, project_id, "admin_archived_project", before["title"])
    write_audit(conn, actor, "project.archive", project_id,
                {"is_archived": False, "title": before["title"]},
                {"is_archived": True, "reason": reason},
                reason, ip, ua)
    conn.commit()

    # Search side effects: каскадное удаление проекта + всех его задач/документов из индекса
    notify_indexer("delete_project_cascade", project_id=project_id)

    after = get_project_base(conn, project_id)
    return resp({"ok": True, "project": after}, origin=origin)


def action_restore(conn, actor: dict, body: dict, ip: str, ua: str, origin: str) -> dict:
    """
    Восстановление проекта: та же семантика, что и handle_restore в projects.
    UPDATE projects SET archived_at = NULL
    + activity_log + admin_audit_log + search index upsert + rebuild_acl
    Примечание: оригинальный handle_restore не вызывал notify_indexer — это ошибка,
    исправлена здесь и в основном projects.
    """
    project_id = body.get("project_id")
    reason = (body.get("reason") or "").strip()
    if not project_id:
        return resp({"error": "project_id required"}, 400, origin)
    if len(reason) < 10:
        return resp({"error": "reason must be at least 10 characters"}, 400, origin)

    project_id = int(project_id)
    s = SCHEMA
    before = get_project_base(conn, project_id)
    if not before:
        return resp({"error": "not_found"}, 404, origin)
    if not before["is_archived"]:
        return resp({"error": "not_archived"}, 409, origin)

    with conn.cursor() as cur:
        cur.execute(
            f"UPDATE {s}.projects SET archived_at = NULL WHERE id = {project_id}"
        )

    write_activity(conn, project_id, "admin_restored_project", before["title"])
    write_audit(conn, actor, "project.restore", project_id,
                {"is_archived": True, "title": before["title"]},
                {"is_archived": False, "reason": reason},
                reason, ip, ua)
    conn.commit()

    # Search side effects: возвращаем проект и все его сущности в индекс
    notify_indexer("upsert", "project", project_id)
    notify_indexer("rebuild_acl", project_id=project_id)

    after = get_project_base(conn, project_id)
    return resp({"ok": True, "project": after}, origin=origin)


# ── Handler ───────────────────────────────────────────────────────

def handler(event: dict, context) -> dict:
    """Phase 3B admin-projects: list / get / members / tasks / documents / archive / restore."""
    headers = event.get("headers") or {}
    origin = headers.get("origin") or headers.get("Origin") or ""
    method = event.get("httpMethod", "GET")

    if method == "OPTIONS":
        return resp({}, 200, origin)

    # Bootstrap reindex — вызов без admin-сессии, только X-Internal-Token
    params_early = event.get("queryStringParameters") or {}
    if params_early.get("action") == "reindex_bootstrap":
        it = headers.get("X-Internal-Token") or headers.get("x-internal-token") or ""
        if not INDEXER_TOKEN or it != INDEXER_TOKEN:
            return resp({"error": "forbidden"}, 403, origin)
        if not INDEXER_URL:
            return resp({"error": "SEARCH_INDEXER_URL not configured"}, 500, origin)
        try:
            hdrs = {"Content-Type": "application/json", "X-Internal-Token": INDEXER_TOKEN}
            req = urllib.request.Request(
                f"{INDEXER_URL}?action=index_all",
                data=b"{}",
                headers=hdrs,
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=120) as r:
                result = json.loads(r.read())
            return resp({"ok": True, "indexed": result}, origin=origin)
        except Exception as e:
            return resp({"error": str(e)}, 500, origin)

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
            pid = params.get("project_id") or body.get("project_id")
            if not pid:
                return resp({"error": "project_id required"}, 400, origin)
            return action_get(conn, int(pid), origin)

        if action == "members":
            pid = params.get("project_id") or body.get("project_id")
            if not pid:
                return resp({"error": "project_id required"}, 400, origin)
            return action_members(conn, int(pid), origin)

        if action == "tasks":
            pid = params.get("project_id") or body.get("project_id")
            if not pid:
                return resp({"error": "project_id required"}, 400, origin)
            return action_tasks(conn, int(pid), params, origin)

        if action == "documents":
            pid = params.get("project_id") or body.get("project_id")
            if not pid:
                return resp({"error": "project_id required"}, 400, origin)
            return action_documents(conn, int(pid), params, origin)

        if action == "archive":
            if method != "POST":
                return resp({"error": "POST required"}, 405, origin)
            return action_archive(conn, admin, body, ip, ua, origin)

        if action == "restore":
            if method != "POST":
                return resp({"error": "POST required"}, 405, origin)
            return action_restore(conn, admin, body, ip, ua, origin)

        if action == "reindex_all":
            if method != "POST":
                return resp({"error": "POST required"}, 405, origin)
            # Перестроить весь поисковый индекс — вызывается вручную один раз
            if not INDEXER_URL:
                return resp({"error": "SEARCH_INDEXER_URL not configured"}, 500, origin)
            try:
                hdrs = {"Content-Type": "application/json"}
                if INDEXER_TOKEN:
                    hdrs["X-Internal-Token"] = INDEXER_TOKEN
                req = urllib.request.Request(
                    f"{INDEXER_URL}?action=index_all",
                    data=b"{}",
                    headers=hdrs,
                    method="POST",
                )
                with urllib.request.urlopen(req, timeout=60) as r:
                    result = json.loads(r.read())
                write_audit(conn, admin, "search.reindex_all", None,
                            {}, {"result": result}, "manual reindex", ip, ua,
                            entity_type="system")
                conn.commit()
                return resp({"ok": True, "indexed": result}, origin=origin)
            except Exception as e:
                return resp({"error": str(e)}, 500, origin)

        return resp({"error": "unknown action"}, 400, origin)

    finally:
        conn.close()