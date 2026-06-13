"""
Goal Builder — конструктор целей развития.

Действия (action namespace v1):
  - goals.list             — список целей пользователя
  - goals.get              — детали цели (с learning_path и milestones)
  - goals.create           — создать цель
  - goals.update           — обновить цель
  - goals.archive          — архивировать цель
  - goals.analyze          — AI-анализ: целевые компетенции + gap analysis с паспортом
  - goals.generate_path    — построить learning path + milestones на основе AI-анализа
  - goals.update_milestone — обновить статус milestone
"""
import json
import os
import uuid
import logging
import psycopg2
from datetime import datetime

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("goals")

ALLOWED_ACTIONS = {
    "goals.list",
    "goals.get",
    "goals.create",
    "goals.update",
    "goals.archive",
    "goals.analyze",
    "goals.generate_path",
    "goals.update_milestone",
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


def get_schema():
    return os.environ.get("MAIN_DB_SCHEMA", "public")


def get_db():
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    conn.autocommit = False
    return conn


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


def cors_headers(origin=None):
    h = {
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-Session-Id",
        "Vary": "Origin",
    }
    if _is_allowed_origin(origin):
        h["Access-Control-Allow-Origin"] = origin
    return h


def ok_response(data, request_id, origin=None):
    return {
        "statusCode": 200,
        "headers": {**cors_headers(origin), "Content-Type": "application/json", "X-Request-Id": request_id},
        "body": json.dumps({"ok": True, "request_id": request_id, "data": data}, ensure_ascii=False, default=str),
    }


def err_response(code, message, status, request_id, origin=None):
    return {
        "statusCode": status,
        "headers": {**cors_headers(origin), "Content-Type": "application/json", "X-Request-Id": request_id},
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


def yandex_gpt(prompt: str, system: str = "", folder_id: str = "", api_key: str = "") -> str:
    """Вызов YandexGPT."""
    import urllib.request, urllib.error
    messages = []
    if system:
        messages.append({"role": "system", "text": system})
    messages.append({"role": "user", "text": prompt})
    payload = json.dumps({
        "modelUri": f"gpt://{folder_id}/yandexgpt/latest",
        "completionOptions": {"stream": False, "temperature": 0.3, "maxTokens": 3000},
        "messages": messages,
    }).encode()
    req = urllib.request.Request(
        "https://llm.api.cloud.yandex.net/foundationModels/v1/completion",
        data=payload,
        headers={
            "Authorization": f"Api-Key {api_key}",
            "Content-Type": "application/json",
            "x-folder-id": folder_id,
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=55) as resp:
            result = json.loads(resp.read())
        return result.get("result", {}).get("alternatives", [{}])[0].get("message", {}).get("text", "")
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")[:300]
        log.error("YandexGPT HTTP %d: %s", e.code, body)
        raise


# ============================================================
# Handlers
# ============================================================

def handle_list(conn, user, body, request_id, origin):
    """Список целей пользователя."""
    schema = get_schema()
    status_filter = body.get("status")
    cur = conn.cursor()
    if status_filter and status_filter != "all":
        cur.execute(
            f"SELECT id, title, target_role, goal_type, priority, deadline, status, ai_analyzed_at, created_at, updated_at FROM {schema}.goals WHERE user_id = %s AND status = %s ORDER BY created_at DESC",
            (user["id"], status_filter),
        )
    else:
        cur.execute(
            f"SELECT id, title, target_role, goal_type, priority, deadline, status, ai_analyzed_at, created_at, updated_at FROM {schema}.goals WHERE user_id = %s AND status != 'archived' ORDER BY created_at DESC",
            (user["id"],),
        )
    cols = ["id", "title", "target_role", "goal_type", "priority", "deadline", "status", "ai_analyzed_at", "created_at", "updated_at"]
    goals = [dict(zip(cols, row)) for row in cur.fetchall()]
    return ok_response({"goals": goals}, request_id, origin)


def handle_get(conn, user, body, request_id, origin):
    """Детали цели + learning_path + milestones."""
    schema = get_schema()
    goal_id = body.get("id")
    if not goal_id:
        return err_response("validation_error", "Нужен id", 400, request_id, origin)
    cur = conn.cursor()
    cur.execute(
        f"SELECT id, title, target_role, goal_type, description, priority, deadline, status, ai_target_profile_json, ai_gap_analysis_json, ai_analyzed_at, created_at, updated_at FROM {schema}.goals WHERE id = %s",
        (int(goal_id),),
    )
    row = cur.fetchone()
    if not row:
        return err_response("not_found", "Цель не найдена", 404, request_id, origin)
    cols = ["id", "title", "target_role", "goal_type", "description", "priority", "deadline", "status", "ai_target_profile_json", "ai_gap_analysis_json", "ai_analyzed_at", "created_at", "updated_at"]
    goal = dict(zip(cols, row))
    if goal["user_id"] if "user_id" in goal else None:
        pass
    # Проверка доступа
    cur.execute(f"SELECT user_id FROM {schema}.goals WHERE id = %s", (int(goal_id),))
    owner = cur.fetchone()
    if not owner or owner[0] != user["id"]:
        return err_response("access_denied", "Нет доступа", 403, request_id, origin)

    # Learning path
    cur.execute(
        f"SELECT id, title, summary, ai_plan_json, created_at FROM {schema}.learning_paths WHERE goal_id = %s AND user_id = %s ORDER BY created_at DESC LIMIT 1",
        (int(goal_id), user["id"]),
    )
    lp_row = cur.fetchone()
    learning_path = None
    if lp_row:
        lp_cols = ["id", "title", "summary", "ai_plan_json", "created_at"]
        learning_path = dict(zip(lp_cols, lp_row))
        # Milestones
        cur.execute(
            f"SELECT id, title, description, due_date, sort_order, status FROM {schema}.milestones WHERE learning_path_id = %s ORDER BY sort_order",
            (learning_path["id"],),
        )
        ms_cols = ["id", "title", "description", "due_date", "sort_order", "status"]
        learning_path["milestones"] = [dict(zip(ms_cols, m)) for m in cur.fetchall()]

    goal["learning_path"] = learning_path
    return ok_response({"goal": goal}, request_id, origin)


def handle_create(conn, user, body, request_id, origin):
    """Создать цель."""
    schema = get_schema()
    title = (body.get("title") or "").strip()
    if not title:
        return err_response("validation_error", "Нужен title", 400, request_id, origin)
    target_role = (body.get("target_role") or "").strip() or None
    goal_type = body.get("goal_type", "skill")
    description = (body.get("description") or "").strip() or None
    priority = body.get("priority", "medium")
    deadline = body.get("deadline") or None
    cur = conn.cursor()
    cur.execute(
        f"INSERT INTO {schema}.goals (user_id, title, target_role, goal_type, description, priority, deadline) VALUES (%s,%s,%s,%s,%s,%s,%s) RETURNING id",
        (user["id"], title, target_role, goal_type, description, priority, deadline),
    )
    goal_id = cur.fetchone()[0]
    conn.commit()
    log.info("goals.create user_id=%s goal_id=%s", user["id"], goal_id)
    return ok_response({"id": goal_id, "title": title}, request_id, origin)


def handle_update(conn, user, body, request_id, origin):
    """Обновить цель."""
    schema = get_schema()
    goal_id = body.get("id")
    if not goal_id:
        return err_response("validation_error", "Нужен id", 400, request_id, origin)
    cur = conn.cursor()
    cur.execute(f"SELECT user_id FROM {schema}.goals WHERE id = %s", (int(goal_id),))
    row = cur.fetchone()
    if not row:
        return err_response("not_found", "Цель не найдена", 404, request_id, origin)
    if row[0] != user["id"]:
        return err_response("access_denied", "Нет доступа", 403, request_id, origin)
    fields, vals = [], []
    for col in ("title", "target_role", "goal_type", "description", "priority", "deadline", "status"):
        if col in body:
            fields.append(f"{col} = %s")
            vals.append(body[col])
    if not fields:
        return err_response("validation_error", "Нет полей для обновления", 400, request_id, origin)
    fields.append("updated_at = NOW()")
    vals.append(int(goal_id))
    cur.execute(f"UPDATE {schema}.goals SET {', '.join(fields)} WHERE id = %s", vals)
    conn.commit()
    return ok_response({"id": int(goal_id)}, request_id, origin)


def handle_archive(conn, user, body, request_id, origin):
    """Архивировать цель."""
    schema = get_schema()
    goal_id = body.get("id")
    if not goal_id:
        return err_response("validation_error", "Нужен id", 400, request_id, origin)
    cur = conn.cursor()
    cur.execute(f"SELECT user_id FROM {schema}.goals WHERE id = %s", (int(goal_id),))
    row = cur.fetchone()
    if not row or row[0] != user["id"]:
        return err_response("access_denied", "Нет доступа", 403, request_id, origin)
    cur.execute(f"UPDATE {schema}.goals SET status = 'archived', updated_at = NOW() WHERE id = %s", (int(goal_id),))
    conn.commit()
    return ok_response({"archived": True}, request_id, origin)


def handle_analyze(conn, user, body, request_id, origin):
    """AI-анализ цели: целевые компетенции + gap analysis с паспортом образования."""
    schema = get_schema()
    goal_id = body.get("id")
    if not goal_id:
        return err_response("validation_error", "Нужен id", 400, request_id, origin)
    cur = conn.cursor()
    cur.execute(
        f"SELECT user_id, title, target_role, goal_type, description FROM {schema}.goals WHERE id = %s",
        (int(goal_id),),
    )
    row = cur.fetchone()
    if not row:
        return err_response("not_found", "Цель не найдена", 404, request_id, origin)
    if row[0] != user["id"]:
        return err_response("access_denied", "Нет доступа", 403, request_id, origin)
    _, title, target_role, goal_type, description = row

    # Собираем данные из паспорта образования
    cur.execute(
        f"""SELECT title, institution_name, field_of_study, kind, topics_json, competencies_json, extracted_json
            FROM {schema}.education_items
            WHERE user_id = %s AND status NOT IN ('archived') AND is_confirmed = true
            ORDER BY created_at DESC LIMIT 20""",
        (user["id"],),
    )
    edu_rows = cur.fetchall()
    passport_text = ""
    if edu_rows:
        items = []
        for r in edu_rows:
            t, inst, field, kind, topics_raw, comp_raw, ext_raw = r
            topics = json.loads(topics_raw) if topics_raw else []
            comps = json.loads(comp_raw) if comp_raw else []
            items.append(f"- {t} ({kind})" + (f", {inst}" if inst else "") + (f": темы: {', '.join(topics[:5])}" if topics else "") + (f"; компетенции: {', '.join(comps[:5])}" if comps else ""))
        passport_text = "\n".join(items)
    else:
        passport_text = "(паспорт образования пуст — нет подтверждённых записей)"

    api_key = os.environ.get("YANDEX_GPT_API_KEY", "")
    folder_id = os.environ.get("YANDEX_FOLDER_ID", "")
    if not api_key or not folder_id:
        return err_response("config_error", "AI недоступен", 500, request_id, origin)

    prompt = f"""Цель пользователя:
Название: {title}
Целевая роль: {target_role or '—'}
Тип цели: {goal_type}
Описание: {description or '—'}

Образовательный паспорт пользователя (подтверждённые документы и курсы):
{passport_text}

Проведи анализ и верни СТРОГО валидный JSON без markdown-блоков:
{{
  "target_competencies": [
    {{"name": "...", "target_level": "basic|intermediate|advanced", "reason": "..."}}
  ],
  "gap_analysis": [
    {{"name": "...", "status": "has|partial|missing", "evidence": "..."}}
  ],
  "summary": "краткое резюме в 2-3 предложения",
  "recommended_milestones": [
    {{"title": "...", "description": "...", "timeframe": "30 дней"}}
  ]
}}

Правила:
- target_competencies: 4-8 ключевых компетенций для достижения цели
- gap_analysis: для каждой компетенции укажи что уже есть в паспорте
- has = подтверждено в паспорте, partial = частично есть, missing = нет данных
- recommended_milestones: 3-6 конкретных шагов с реалистичными сроками
- Не фантазируй — опирайся только на данные паспорта"""

    try:
        raw = yandex_gpt(prompt, folder_id=folder_id, api_key=api_key)
        # Очищаем от возможных markdown-блоков
        raw = raw.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        raw = raw.strip().rstrip("```").strip()
        extracted = json.loads(raw)
    except json.JSONDecodeError as e:
        log.error("AI JSON parse error: %s, raw=%r", e, raw[:200])
        return err_response("ai_parse_error", "AI вернул невалидный JSON", 500, request_id, origin)
    except Exception as e:
        log.error("AI analyze error: %s", e)
        return err_response("ai_error", f"Ошибка AI-анализа: {e}", 500, request_id, origin)

    cur.execute(
        f"""UPDATE {schema}.goals SET
            ai_target_profile_json = %s,
            ai_gap_analysis_json = %s,
            ai_analyzed_at = NOW(),
            status = CASE WHEN status = 'draft' THEN 'active' ELSE status END,
            updated_at = NOW()
            WHERE id = %s""",
        (
            json.dumps(extracted.get("target_competencies", []), ensure_ascii=False),
            json.dumps({
                "gap_analysis": extracted.get("gap_analysis", []),
                "summary": extracted.get("summary", ""),
                "recommended_milestones": extracted.get("recommended_milestones", []),
            }, ensure_ascii=False),
            int(goal_id),
        ),
    )
    conn.commit()
    log.info("goals.analyze done goal_id=%s competencies=%d", goal_id, len(extracted.get("target_competencies", [])))
    return ok_response({"goal_id": int(goal_id), "analysis": extracted}, request_id, origin)


def handle_generate_path(conn, user, body, request_id, origin):
    """Генерирует learning_path + milestones на основе AI-анализа цели."""
    schema = get_schema()
    goal_id = body.get("id")
    if not goal_id:
        return err_response("validation_error", "Нужен id", 400, request_id, origin)
    cur = conn.cursor()
    cur.execute(
        f"SELECT user_id, title, target_role, ai_target_profile_json, ai_gap_analysis_json FROM {schema}.goals WHERE id = %s",
        (int(goal_id),),
    )
    row = cur.fetchone()
    if not row:
        return err_response("not_found", "Цель не найдена", 404, request_id, origin)
    if row[0] != user["id"]:
        return err_response("access_denied", "Нет доступа", 403, request_id, origin)
    _, title, target_role, profile_raw, gap_raw = row
    if not profile_raw or not gap_raw:
        return err_response("not_analyzed", "Сначала выполни AI-анализ цели (goals.analyze)", 400, request_id, origin)

    profile = json.loads(profile_raw) if isinstance(profile_raw, str) else profile_raw
    gap_data = json.loads(gap_raw) if isinstance(gap_raw, str) else gap_raw
    recommended = gap_data.get("recommended_milestones", [])

    # Используем уже готовые milestones из AI-анализа если они есть
    path_title = f"План развития: {title}"
    path_summary = gap_data.get("summary", "")

    # Удаляем старый path если был
    cur.execute(f"SELECT id FROM {schema}.learning_paths WHERE goal_id = %s AND user_id = %s", (int(goal_id), user["id"]))
    old_path = cur.fetchone()
    if old_path:
        cur.execute(f"UPDATE {schema}.milestones SET status = 'planned' WHERE learning_path_id = %s", (old_path[0],))
        cur.execute(f"UPDATE {schema}.learning_paths SET title = %s, summary = %s, updated_at = NOW() WHERE id = %s",
                    (path_title, path_summary, old_path[0]))
        path_id = old_path[0]
        cur.execute(f"DELETE FROM {schema}.milestones WHERE learning_path_id = %s", (path_id,))
    else:
        cur.execute(
            f"INSERT INTO {schema}.learning_paths (goal_id, user_id, title, summary, ai_plan_json) VALUES (%s,%s,%s,%s,%s) RETURNING id",
            (int(goal_id), user["id"], path_title, path_summary, json.dumps(gap_data, ensure_ascii=False)),
        )
        path_id = cur.fetchone()[0]

    # Вставляем milestones
    milestones_created = []
    for i, m in enumerate(recommended):
        cur.execute(
            f"INSERT INTO {schema}.milestones (learning_path_id, goal_id, user_id, title, description, sort_order) VALUES (%s,%s,%s,%s,%s,%s) RETURNING id",
            (path_id, int(goal_id), user["id"], m.get("title", f"Шаг {i+1}"), m.get("description", ""), i),
        )
        ms_id = cur.fetchone()[0]
        milestones_created.append({"id": ms_id, "title": m.get("title"), "timeframe": m.get("timeframe", "")})

    conn.commit()
    log.info("goals.generate_path done goal_id=%s path_id=%s milestones=%d", goal_id, path_id, len(milestones_created))
    return ok_response({
        "learning_path_id": path_id,
        "milestones": milestones_created,
    }, request_id, origin)


def handle_update_milestone(conn, user, body, request_id, origin):
    """Обновить статус milestone."""
    schema = get_schema()
    ms_id = body.get("id")
    status = body.get("status")
    if not ms_id or status not in ("planned", "in_progress", "done"):
        return err_response("validation_error", "Нужен id и status (planned|in_progress|done)", 400, request_id, origin)
    cur = conn.cursor()
    cur.execute(f"SELECT user_id FROM {schema}.milestones WHERE id = %s", (int(ms_id),))
    row = cur.fetchone()
    if not row or row[0] != user["id"]:
        return err_response("access_denied", "Нет доступа", 403, request_id, origin)
    cur.execute(f"UPDATE {schema}.milestones SET status = %s, updated_at = NOW() WHERE id = %s", (status, int(ms_id)))
    conn.commit()
    return ok_response({"id": int(ms_id), "status": status}, request_id, origin)


# ============================================================
# Router
# ============================================================

HANDLERS = {
    "goals.list": handle_list,
    "goals.get": handle_get,
    "goals.create": handle_create,
    "goals.update": handle_update,
    "goals.archive": handle_archive,
    "goals.analyze": handle_analyze,
    "goals.generate_path": handle_generate_path,
    "goals.update_milestone": handle_update_milestone,
}


def handler(event: dict, context) -> dict:
    """Goal Builder — CRUD целей развития + AI-анализ + learning path."""
    request_id = getattr(context, "request_id", None) or str(uuid.uuid4())
    origin = (event.get("headers") or {}).get("Origin") or (event.get("headers") or {}).get("origin")

    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": cors_headers(origin), "body": ""}

    if event.get("httpMethod") != "POST":
        return err_response("method_not_allowed", "Используйте POST", 405, request_id, origin)

    body = {}
    if event.get("body"):
        try:
            body = json.loads(event["body"])
        except Exception:
            return err_response("invalid_json", "Невалидный JSON", 400, request_id, origin)

    action = body.get("action", "")
    if action not in ALLOWED_ACTIONS:
        return err_response("unknown_action", f"Допустимые: {sorted(ALLOWED_ACTIONS)}", 400, request_id, origin)

    session_id = (event.get("headers") or {}).get("X-Session-Id") or body.get("session_id")
    conn = get_db()
    try:
        user = get_current_user(conn, session_id)
        if not user:
            return err_response("unauthorized", "Требуется авторизация", 401, request_id, origin)
        return HANDLERS[action](conn, user, body, request_id, origin)
    finally:
        conn.close()
