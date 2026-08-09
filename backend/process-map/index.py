"""
Карта макропроцессов подразделения: верхний читаемый уровень над функциями.
Показывает состояние «как есть» и целевое состояние, разрыв между ними.

ВСЕ запросы: POST / с обязательным полем action.
Поддерживаемые action:
  - process_map.list    — список макропроцессов проекта со сводкой
  - process_map.get     — один макропроцесс с функциями и подразделениями
  - process_map.update  — изменить поля макропроцесса

Формат ответа:
  Success: {"ok": true, "data": {...}}
  Error:   {"ok": false, "error": {"code": "...", "message": "..."}}
"""
import json
import os
import uuid
import psycopg2

ALLOWED_ACTIONS = {
    "process_map.list",
    "process_map.get",
    "process_map.update",
}

ALLOWED_ORIGINS = {
    "https://raven.moscow",
    "https://www.raven.moscow",
    "https://docmind.ai",
    "https://digital-innovation-initiative-1--preview.poehali.dev",
    "https://poehali.dev",
    "http://localhost:5173",
    "http://localhost:3000",
}


def get_db():
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    conn.autocommit = False
    return conn


def get_schema():
    return os.environ.get("MAIN_DB_SCHEMA", "public")


def _is_allowed_origin(origin: str) -> bool:
    if not origin:
        return False
    if origin in ALLOWED_ORIGINS:
        return True
    try:
        from urllib.parse import urlparse
        parsed = urlparse(origin)
        if parsed.scheme not in ("https", "http"):
            return False
        hostname = (parsed.hostname or "").lower()
        return hostname == "poehali.dev" or hostname.endswith(".poehali.dev")
    except Exception:
        return False


def cors_headers(origin: str = None):
    headers = {
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-Session-Id",
        "Vary": "Origin",
    }
    if _is_allowed_origin(origin):
        headers["Access-Control-Allow-Origin"] = origin
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
        f"SELECT u.id FROM {schema}.sessions s JOIN {schema}.users u ON u.id = s.user_id WHERE s.id = %s AND s.expires_at > NOW()",
        (session_id,),
    )
    row = cur.fetchone()
    return {"id": row[0]} if row else None


def check_access(cur, schema, project_id, user_id):
    cur.execute(
        f"SELECT role FROM {schema}.project_members WHERE project_id = %s AND user_id = %s",
        (project_id, user_id),
    )
    row = cur.fetchone()
    return row[0] if row else None


PROC_FIELDS = """id, code, name, stage, purpose, trigger_event, result_output, owner_unit_code,
    current_state, pain_points, target_state, target_effect, ai_opportunity,
    maturity_current, maturity_target, ai_potential, priority, horizon, sort_order"""


def row_to_proc(r):
    return {
        "id": r[0], "code": r[1], "name": r[2], "stage": r[3],
        "purpose": r[4], "trigger_event": r[5], "result_output": r[6],
        "owner_unit_code": r[7], "current_state": r[8], "pain_points": r[9],
        "target_state": r[10], "target_effect": r[11], "ai_opportunity": r[12],
        "maturity_current": r[13], "maturity_target": r[14],
        "ai_potential": r[15], "priority": r[16], "horizon": r[17], "sort_order": r[18],
    }


def handle_list(conn, user, body, request_id, origin=None):
    schema = get_schema()
    project_id = body.get("project_id")
    if not project_id:
        return err_response("validation_error", "Поле project_id обязательно", 400, request_id, origin=origin)
    project_id = int(project_id)

    cur = conn.cursor()
    if not check_access(cur, schema, project_id, user["id"]):
        return err_response("access_denied", "Нет доступа к проекту", 403, request_id, origin=origin)

    cur.execute(
        f"SELECT {PROC_FIELDS} FROM {schema}.macro_processes WHERE project_id = %s ORDER BY sort_order, code",
        (project_id,),
    )
    procs = [row_to_proc(r) for r in cur.fetchall()]
    if not procs:
        return ok_response({"processes": [], "summary": {}}, request_id, origin=origin)

    proc_ids = [p["id"] for p in procs]

    cur.execute(
        f"""SELECT mpf.macro_process_id, COUNT(*),
                   SUM(CASE WHEN a.current_status = 'automated' THEN 1 ELSE 0 END),
                   SUM(CASE WHEN a.current_status = 'partial' THEN 1 ELSE 0 END)
            FROM {schema}.macro_process_functions mpf
            LEFT JOIN {schema}.dept_automation a ON a.function_id = mpf.function_id
            WHERE mpf.macro_process_id = ANY(%s)
            GROUP BY mpf.macro_process_id""",
        (proc_ids,),
    )
    fn_stats = {r[0]: {"functions": r[1], "automated": r[2] or 0, "partial": r[3] or 0} for r in cur.fetchall()}

    cur.execute(
        f"""SELECT mpu.macro_process_id, u.code, u.name, u.type, mpu.role
            FROM {schema}.macro_process_units mpu
            JOIN {schema}.org_units u ON u.id = mpu.org_unit_id
            WHERE mpu.macro_process_id = ANY(%s)
            ORDER BY u.code""",
        (proc_ids,),
    )
    units_map = {}
    for r in cur.fetchall():
        units_map.setdefault(r[0], []).append({"code": r[1], "name": r[2], "type": r[3], "role": r[4]})

    for p in procs:
        stats = fn_stats.get(p["id"], {"functions": 0, "automated": 0, "partial": 0})
        p["function_count"] = stats["functions"]
        p["automated_count"] = stats["automated"]
        p["partial_count"] = stats["partial"]
        p["units"] = units_map.get(p["id"], [])
        p["gap"] = p["maturity_target"] - p["maturity_current"]

    summary = {
        "total": len(procs),
        "core": len([p for p in procs if p["stage"] == "core"]),
        "enabling": len([p for p in procs if p["stage"] == "enabling"]),
        "functions_total": sum(p["function_count"] for p in procs),
        "high_ai": len([p for p in procs if p["ai_potential"] >= 8]),
        "avg_maturity_current": round(sum(p["maturity_current"] for p in procs) / len(procs), 1),
        "avg_maturity_target": round(sum(p["maturity_target"] for p in procs) / len(procs), 1),
    }

    return ok_response({"processes": procs, "summary": summary}, request_id, origin=origin)


def handle_get(conn, user, body, request_id, origin=None):
    schema = get_schema()
    process_id = body.get("process_id")
    if not process_id:
        return err_response("validation_error", "Поле process_id обязательно", 400, request_id, origin=origin)
    process_id = int(process_id)

    cur = conn.cursor()
    cur.execute(
        f"SELECT {PROC_FIELDS}, project_id FROM {schema}.macro_processes WHERE id = %s",
        (process_id,),
    )
    row = cur.fetchone()
    if not row:
        return err_response("not_found", "Процесс не найден", 404, request_id, origin=origin)
    if not check_access(cur, schema, row[19], user["id"]):
        return err_response("access_denied", "Нет доступа к проекту", 403, request_id, origin=origin)

    proc = row_to_proc(row)

    cur.execute(
        f"""SELECT df.id, df.title, df.category, df.priority,
                   COALESCE(a.current_status, 'manual'), COALESCE(a.ai_potential_score, 0)
            FROM {schema}.macro_process_functions mpf
            JOIN {schema}.dept_functions df ON df.id = mpf.function_id
            LEFT JOIN {schema}.dept_automation a ON a.function_id = df.id
            WHERE mpf.macro_process_id = %s
            ORDER BY COALESCE(a.ai_potential_score, 0) DESC, df.title""",
        (process_id,),
    )
    proc["functions"] = [
        {"id": r[0], "title": r[1], "category": r[2], "priority": r[3],
         "status": r[4], "ai_score": r[5]}
        for r in cur.fetchall()
    ]

    cur.execute(
        f"""SELECT u.code, u.name, u.type, mpu.role
            FROM {schema}.macro_process_units mpu
            JOIN {schema}.org_units u ON u.id = mpu.org_unit_id
            WHERE mpu.macro_process_id = %s ORDER BY u.code""",
        (process_id,),
    )
    proc["units"] = [{"code": r[0], "name": r[1], "type": r[2], "role": r[3]} for r in cur.fetchall()]

    return ok_response({"process": proc}, request_id, origin=origin)


def handle_update(conn, user, body, request_id, origin=None):
    schema = get_schema()
    process_id = body.get("process_id")
    if not process_id:
        return err_response("validation_error", "Поле process_id обязательно", 400, request_id, origin=origin)
    process_id = int(process_id)

    cur = conn.cursor()
    cur.execute(f"SELECT project_id FROM {schema}.macro_processes WHERE id = %s", (process_id,))
    row = cur.fetchone()
    if not row:
        return err_response("not_found", "Процесс не найден", 404, request_id, origin=origin)
    role = check_access(cur, schema, row[0], user["id"])
    if role not in ("owner", "admin"):
        return err_response("access_denied", "Только владелец проекта может менять карту", 403, request_id, origin=origin)

    allowed = ["name", "purpose", "trigger_event", "result_output", "current_state",
               "pain_points", "target_state", "target_effect", "ai_opportunity",
               "maturity_current", "maturity_target", "ai_potential", "priority", "horizon"]
    sets, params = [], []
    for field in allowed:
        if field in body:
            sets.append(f"{field} = %s")
            params.append(body[field])
    if not sets:
        return err_response("validation_error", "Нет полей для обновления", 400, request_id, origin=origin)

    sets.append("updated_at = NOW()")
    params.append(process_id)
    cur.execute(f"UPDATE {schema}.macro_processes SET {', '.join(sets)} WHERE id = %s", tuple(params))
    conn.commit()
    return ok_response({"ok": True}, request_id, origin=origin)


def handler(event: dict, context) -> dict:
    origin = (event.get("headers") or {}).get("Origin") or (event.get("headers") or {}).get("origin")
    request_id = getattr(context, "request_id", None) or str(uuid.uuid4())

    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": cors_headers(origin), "body": ""}

    if event.get("httpMethod", "GET") != "POST":
        return err_response("method_not_allowed", "Используйте POST", 405, request_id, origin=origin)

    body = {}
    if event.get("body"):
        try:
            body = json.loads(event["body"])
        except Exception:
            return err_response("invalid_json", "Тело запроса не является JSON", 400, request_id, origin=origin)

    action = body.get("action", "")
    if action not in ALLOWED_ACTIONS:
        return err_response(
            "unknown_action",
            f"Неизвестное action. Допустимые: {sorted(ALLOWED_ACTIONS)}",
            400, request_id, origin=origin,
        )

    session_id = (event.get("headers") or {}).get("X-Session-Id", "")
    conn = get_db()
    try:
        user = get_current_user(conn, session_id)
        if not user:
            return err_response("auth_required", "Требуется авторизация", 401, request_id, origin=origin)

        if action == "process_map.list":
            return handle_list(conn, user, body, request_id, origin=origin)
        if action == "process_map.get":
            return handle_get(conn, user, body, request_id, origin=origin)
        if action == "process_map.update":
            return handle_update(conn, user, body, request_id, origin=origin)

        return err_response("not_implemented", "Не реализовано", 501, request_id, origin=origin)

    except Exception as e:
        return err_response("internal_error", f"Ошибка сервера: {str(e)[:200]}", 500, request_id, origin=origin)
    finally:
        conn.close()
