"""
Черновая карта деятельности подразделения.

ВАЖНО: это НЕ карта процессов. Группировка функций — неподтверждённая AI-гипотеза,
построенная механически по владеющей организационной единице из положения.
Реальные последовательности действий не восстанавливались.

Отображаются только сведения, подтверждённые внутренними документами.
Описания из типовой банковской практики перенесены в архивный слой
и НЕ показываются как фактическое состояние (AS IS).

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


PROC_FIELDS = """id, code, name, stage, purpose, owner_unit_code, sort_order,
    verification_status, source_type, confidence, grouping_basis,
    archive_reason, display_mode"""


def row_to_proc(r):
    return {
        "id": r[0], "code": r[1], "name": r[2], "stage": r[3],
        "purpose": r[4], "owner_unit_code": r[5], "sort_order": r[6],
        "verification_status": r[7], "source_type": r[8], "confidence": r[9],
        "grouping_basis": r[10], "archive_reason": r[11], "display_mode": r[12],
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
                   SUM(CASE WHEN mpf.is_confirmed THEN 1 ELSE 0 END)
            FROM {schema}.macro_process_functions mpf
            WHERE mpf.macro_process_id = ANY(%s)
            GROUP BY mpf.macro_process_id""",
        (proc_ids,),
    )
    fn_stats = {r[0]: {"functions": r[1], "confirmed": r[2] or 0} for r in cur.fetchall()}

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
        stats = fn_stats.get(p["id"], {"functions": 0, "confirmed": 0})
        p["function_count"] = stats["functions"]
        p["confirmed_count"] = stats["confirmed"]
        p["units"] = units_map.get(p["id"], [])

    # Честное покрытие: сколько функций из документов реально попало в группировку
    cur.execute(
        f"""SELECT COUNT(*) FROM {schema}.dept_functions
            WHERE project_id = %s AND dept_name NOT LIKE '%%SMOKETEST%%'""",
        (project_id,),
    )
    fns_total = cur.fetchone()[0]

    cur.execute(
        f"""SELECT COUNT(DISTINCT mpf.function_id)
            FROM {schema}.macro_process_functions mpf
            WHERE mpf.macro_process_id = ANY(%s)""",
        (proc_ids,),
    )
    fns_covered = cur.fetchone()[0]

    cur.execute(
        f"""SELECT df.id, df.title FROM {schema}.dept_functions df
            WHERE df.project_id = %s AND df.dept_name NOT LIKE '%%SMOKETEST%%'
              AND df.id NOT IN (
                  SELECT function_id FROM {schema}.macro_process_functions
              )
            ORDER BY df.id""",
        (project_id,),
    )
    uncovered = [{"id": r[0], "title": r[1]} for r in cur.fetchall()]

    cur.execute(
        f"""SELECT COUNT(*) FROM {schema}.macro_process_functions mpf
            WHERE mpf.macro_process_id = ANY(%s)""",
        (proc_ids,),
    )
    links_total = cur.fetchone()[0]

    summary = {
        "total": len(procs),
        "core": len([p for p in procs if p["stage"] == "core"]),
        "enabling": len([p for p in procs if p["stage"] == "enabling"]),
        "functions_total": fns_total,
        "functions_covered": fns_covered,
        "functions_uncovered": fns_total - fns_covered,
        "links_total": links_total,
        "multi_assigned": links_total - fns_covered,
        "confirmed_groups": len([p for p in procs if p["verification_status"] == "confirmed"]),
        "is_hypothesis": True,
        "disclaimer": (
            "Черновая AI-гипотеза группировки функций. Функции извлечены из положения "
            "о подразделении. Группировка выполнена механически по владеющей "
            "организационной единице и НЕ является описанием процессов. "
            "Требует проверки владельцами деятельности."
        ),
    }

    return ok_response(
        {"processes": procs, "summary": summary, "uncovered_functions": uncovered},
        request_id, origin=origin,
    )


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
    if not check_access(cur, schema, row[13], user["id"]):
        return err_response("access_denied", "Нет доступа к проекту", 403, request_id, origin=origin)

    proc = row_to_proc(row)

    # Только функции из документов + основание связи и уровень уверенности
    cur.execute(
        f"""SELECT df.id, df.title, df.category, df.priority,
                   mpf.link_basis, mpf.confidence, mpf.is_confirmed,
                   COALESCE(df.source_section_code, '')
            FROM {schema}.macro_process_functions mpf
            JOIN {schema}.dept_functions df ON df.id = mpf.function_id
            WHERE mpf.macro_process_id = %s
            ORDER BY df.id""",
        (process_id,),
    )
    proc["functions"] = [
        {"id": r[0], "title": r[1], "category": r[2], "priority": r[3],
         "link_basis": r[4], "confidence": r[5], "is_confirmed": r[6],
         "source_section": r[7]}
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

    allowed = ["name", "purpose", "grouping_basis", "verification_status", "confidence"]
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