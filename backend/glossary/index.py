"""
Глоссарий руководителя: термины, аббревиатуры, профессиональный сленг.

ВСЕ запросы: POST / с обязательным полем action.
Поддерживаемые action:
  - glossary.list        — список терминов (фильтр category, search)
  - glossary.get         — один термин (term_id), увеличивает счётчик просмотров
  - glossary.explain     — AI объясняет незнакомый термин и сохраняет его в глоссарий
  - glossary.create      — добавить термин вручную
  - glossary.update      — изменить термин
  - glossary.mark        — избранное / выучено / личная заметка
  - glossary.categories  — список категорий со счётчиками

Формат ответа:
  Success: {"ok": true, "data": {...}}
  Error:   {"ok": false, "error": {"code": "...", "message": "..."}}
"""
import json
import os
import uuid
import psycopg2
import requests

ALLOWED_ACTIONS = {
    "glossary.list",
    "glossary.get",
    "glossary.explain",
    "glossary.create",
    "glossary.update",
    "glossary.mark",
    "glossary.categories",
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

YANDEX_GPT_KEY = os.environ.get("YANDEX_GPT_API_KEY", "")
YANDEX_FOLDER_ID = os.environ.get("YANDEX_FOLDER_ID", "")
GPT_URL = "https://llm.api.cloud.yandex.net/foundationModels/v1/completion"
MODEL_URI = f"gpt://{YANDEX_FOLDER_ID}/yandexgpt/latest"

CATEGORIES = {
    "internal_control": "Внутренний контроль",
    "digital": "Цифровизация",
    "ai": "Искусственный интеллект",
    "budget": "Бюджет и финансы",
    "management": "Управление",
    "roles": "Функции и должности",
    "general": "Общее",
}

EXPLAIN_PROMPT = """Ты — опытный наставник для руководителя банка, который недавно занял должность
Директора цифровизации и развития технологий внутреннего контроля.

Он просит объяснить термин: «{term}»

Объясни ЧЕСТНО и ПРОСТО, без воды. Если термин многозначный — бери значение,
релевантное банковскому внутреннему контролю, цифровизации или управлению.
Если ты не уверен в точном значении термина — прямо скажи об этом в поле short_definition.

Верни СТРОГО валидный JSON без markdown-обёртки, по схеме:
{{
  "term": "каноничное написание термина",
  "aliases": "синонимы и англоязычный вариант через запятую, или пустая строка",
  "short_definition": "одно предложение — суть термина",
  "plain_explanation": "2-3 предложения простыми словами, как объяснил бы коллега",
  "why_matters": "1-2 предложения: почему это важно именно руководителю цифровизации внутреннего контроля",
  "example": "один короткий конкретный пример из банковской практики",
  "category": "одна из: internal_control, digital, ai, budget, management, roles, general"
}}"""


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
        f"SELECT u.id, u.name FROM {schema}.sessions s JOIN {schema}.users u ON u.id = s.user_id WHERE s.id = %s AND s.expires_at > NOW()",
        (session_id,),
    )
    row = cur.fetchone()
    return {"id": row[0], "name": row[1]} if row else None


TERM_FIELDS = """t.id, t.term, t.aliases, t.short_definition, t.plain_explanation,
    t.why_matters, t.example, t.category, t.scope, t.is_ai_generated, t.is_verified,
    t.view_count, t.created_at,
    COALESCE(m.is_favorite, FALSE), COALESCE(m.is_learned, FALSE), m.personal_note"""


def row_to_term(r):
    return {
        "id": r[0], "term": r[1], "aliases": r[2], "short_definition": r[3],
        "plain_explanation": r[4], "why_matters": r[5], "example": r[6],
        "category": r[7], "category_label": CATEGORIES.get(r[7], r[7]),
        "scope": r[8], "is_ai_generated": r[9], "is_verified": r[10],
        "view_count": r[11], "created_at": str(r[12]),
        "is_favorite": r[13], "is_learned": r[14], "personal_note": r[15],
    }


def handle_list(conn, user, body, request_id, origin=None):
    schema = get_schema()
    category = (body.get("category") or "").strip()
    search = (body.get("search") or "").strip()
    only_favorites = bool(body.get("only_favorites"))

    sql = f"""SELECT {TERM_FIELDS}
        FROM {schema}.glossary_terms t
        LEFT JOIN {schema}.glossary_user_marks m ON m.term_id = t.id AND m.user_id = %s
        WHERE (t.scope = 'global' OR t.user_id = %s)"""
    params = [user["id"], user["id"]]

    if category and category != "all":
        sql += " AND t.category = %s"
        params.append(category)
    if search:
        sql += " AND (t.term ILIKE %s OR t.aliases ILIKE %s OR t.short_definition ILIKE %s)"
        like = f"%{search}%"
        params.extend([like, like, like])
    if only_favorites:
        sql += " AND m.is_favorite = TRUE"

    sql += " ORDER BY t.term ASC LIMIT 300"

    cur = conn.cursor()
    cur.execute(sql, tuple(params))
    items = [row_to_term(r) for r in cur.fetchall()]
    return ok_response({"items": items}, request_id, origin=origin)


def handle_categories(conn, user, request_id, origin=None):
    schema = get_schema()
    cur = conn.cursor()
    cur.execute(
        f"""SELECT category, COUNT(*) FROM {schema}.glossary_terms
            WHERE scope = 'global' OR user_id = %s
            GROUP BY category""",
        (user["id"],),
    )
    counts = {r[0]: r[1] for r in cur.fetchall()}
    cur.execute(
        f"""SELECT COUNT(*) FROM {schema}.glossary_terms t
            JOIN {schema}.glossary_user_marks m ON m.term_id = t.id AND m.user_id = %s
            WHERE m.is_favorite = TRUE""",
        (user["id"],),
    )
    fav_count = cur.fetchone()[0]
    total = sum(counts.values())
    items = [{"key": k, "label": v, "count": counts.get(k, 0)} for k, v in CATEGORIES.items() if counts.get(k, 0) > 0]
    return ok_response({"categories": items, "total": total, "favorites": fav_count}, request_id, origin=origin)


def handle_get(conn, user, body, request_id, origin=None):
    schema = get_schema()
    term_id = body.get("term_id")
    if not term_id:
        return err_response("validation_error", "Поле term_id обязательно", 400, request_id, origin=origin)
    cur = conn.cursor()
    cur.execute(
        f"""SELECT {TERM_FIELDS}
            FROM {schema}.glossary_terms t
            LEFT JOIN {schema}.glossary_user_marks m ON m.term_id = t.id AND m.user_id = %s
            WHERE t.id = %s AND (t.scope = 'global' OR t.user_id = %s)""",
        (user["id"], int(term_id), user["id"]),
    )
    row = cur.fetchone()
    if not row:
        return err_response("not_found", "Термин не найден", 404, request_id, origin=origin)
    cur.execute(f"UPDATE {schema}.glossary_terms SET view_count = view_count + 1 WHERE id = %s", (int(term_id),))
    conn.commit()
    return ok_response({"term": row_to_term(row)}, request_id, origin=origin)


def call_gpt(prompt: str) -> str:
    payload = {
        "modelUri": MODEL_URI,
        "completionOptions": {"stream": False, "temperature": 0.3, "maxTokens": 1200},
        "messages": [{"role": "user", "text": prompt}],
    }
    r = requests.post(
        GPT_URL,
        headers={"Authorization": f"Api-Key {YANDEX_GPT_KEY}", "Content-Type": "application/json"},
        json=payload,
        timeout=30,
    )
    r.raise_for_status()
    return r.json()["result"]["alternatives"][0]["message"]["text"]


def parse_json_block(text: str) -> dict:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("```")[1]
        if cleaned.startswith("json"):
            cleaned = cleaned[4:]
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("AI вернул не JSON")
    return json.loads(cleaned[start:end + 1])


def handle_explain(conn, user, body, request_id, origin=None):
    schema = get_schema()
    term = (body.get("term") or "").strip()
    if not term:
        return err_response("validation_error", "Укажите термин", 400, request_id, origin=origin)
    if len(term) > 200:
        return err_response("validation_error", "Термин слишком длинный", 400, request_id, origin=origin)
    if not YANDEX_GPT_KEY:
        return err_response("ai_unavailable", "AI временно недоступен", 503, request_id, origin=origin)

    cur = conn.cursor()
    cur.execute(
        f"""SELECT {TERM_FIELDS}
            FROM {schema}.glossary_terms t
            LEFT JOIN {schema}.glossary_user_marks m ON m.term_id = t.id AND m.user_id = %s
            WHERE lower(t.term) = lower(%s) AND (t.scope = 'global' OR t.user_id = %s)
            LIMIT 1""",
        (user["id"], term, user["id"]),
    )
    existing = cur.fetchone()
    if existing:
        return ok_response({"term": row_to_term(existing), "was_existing": True}, request_id, origin=origin)

    raw = call_gpt(EXPLAIN_PROMPT.format(term=term))
    data = parse_json_block(raw)

    category = data.get("category", "general")
    if category not in CATEGORIES:
        category = "general"

    cur.execute(
        f"""INSERT INTO {schema}.glossary_terms
            (user_id, term, aliases, short_definition, plain_explanation, why_matters,
             example, category, scope, source, is_ai_generated, created_by)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 'personal', 'ai', TRUE, %s)
            RETURNING id, created_at""",
        (
            user["id"],
            (data.get("term") or term)[:255],
            data.get("aliases", ""),
            data.get("short_definition", ""),
            data.get("plain_explanation", ""),
            data.get("why_matters", ""),
            data.get("example", ""),
            category,
            user["id"],
        ),
    )
    new_id, created_at = cur.fetchone()
    conn.commit()

    return ok_response({
        "term": {
            "id": new_id,
            "term": data.get("term") or term,
            "aliases": data.get("aliases", ""),
            "short_definition": data.get("short_definition", ""),
            "plain_explanation": data.get("plain_explanation", ""),
            "why_matters": data.get("why_matters", ""),
            "example": data.get("example", ""),
            "category": category,
            "category_label": CATEGORIES.get(category, category),
            "scope": "personal",
            "is_ai_generated": True,
            "is_verified": False,
            "view_count": 0,
            "created_at": str(created_at),
            "is_favorite": False,
            "is_learned": False,
            "personal_note": None,
        },
        "was_existing": False,
    }, request_id, origin=origin)


def handle_create(conn, user, body, request_id, origin=None):
    schema = get_schema()
    term = (body.get("term") or "").strip()
    short_definition = (body.get("short_definition") or "").strip()
    if not term or not short_definition:
        return err_response("validation_error", "Нужны term и short_definition", 400, request_id, origin=origin)
    category = body.get("category", "general")
    if category not in CATEGORIES:
        category = "general"

    cur = conn.cursor()
    cur.execute(
        f"""INSERT INTO {schema}.glossary_terms
            (user_id, term, aliases, short_definition, plain_explanation, why_matters,
             example, category, scope, source, created_by)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 'personal', 'manual', %s)
            RETURNING id""",
        (
            user["id"], term[:255], body.get("aliases", ""), short_definition,
            body.get("plain_explanation", ""), body.get("why_matters", ""),
            body.get("example", ""), category, user["id"],
        ),
    )
    new_id = cur.fetchone()[0]
    conn.commit()
    return ok_response({"id": new_id}, request_id, origin=origin)


def handle_update(conn, user, body, request_id, origin=None):
    schema = get_schema()
    term_id = body.get("term_id")
    if not term_id:
        return err_response("validation_error", "Поле term_id обязательно", 400, request_id, origin=origin)

    allowed = ["term", "aliases", "short_definition", "plain_explanation", "why_matters", "example", "category"]
    sets, params = [], []
    for field in allowed:
        if field in body:
            value = body[field]
            if field == "category" and value not in CATEGORIES:
                continue
            sets.append(f"{field} = %s")
            params.append(value)
    if not sets:
        return err_response("validation_error", "Нет полей для обновления", 400, request_id, origin=origin)

    sets.append("updated_at = NOW()")
    params.extend([int(term_id), user["id"]])
    cur = conn.cursor()
    cur.execute(
        f"UPDATE {schema}.glossary_terms SET {', '.join(sets)} WHERE id = %s AND user_id = %s",
        tuple(params),
    )
    if cur.rowcount == 0:
        return err_response("access_denied", "Можно редактировать только свои термины", 403, request_id, origin=origin)
    conn.commit()
    return ok_response({"ok": True}, request_id, origin=origin)


def handle_mark(conn, user, body, request_id, origin=None):
    schema = get_schema()
    term_id = body.get("term_id")
    if not term_id:
        return err_response("validation_error", "Поле term_id обязательно", 400, request_id, origin=origin)

    cur = conn.cursor()
    cur.execute(
        f"""INSERT INTO {schema}.glossary_user_marks (user_id, term_id, is_favorite, is_learned, personal_note)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (user_id, term_id) DO UPDATE SET
                is_favorite = COALESCE(%s, {schema}.glossary_user_marks.is_favorite),
                is_learned = COALESCE(%s, {schema}.glossary_user_marks.is_learned),
                personal_note = COALESCE(%s, {schema}.glossary_user_marks.personal_note),
                updated_at = NOW()""",
        (
            user["id"], int(term_id),
            bool(body.get("is_favorite", False)),
            bool(body.get("is_learned", False)),
            body.get("personal_note"),
            body.get("is_favorite"),
            body.get("is_learned"),
            body.get("personal_note"),
        ),
    )
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

        if action == "glossary.list":
            return handle_list(conn, user, body, request_id, origin=origin)
        if action == "glossary.categories":
            return handle_categories(conn, user, request_id, origin=origin)
        if action == "glossary.get":
            return handle_get(conn, user, body, request_id, origin=origin)
        if action == "glossary.explain":
            return handle_explain(conn, user, body, request_id, origin=origin)
        if action == "glossary.create":
            return handle_create(conn, user, body, request_id, origin=origin)
        if action == "glossary.update":
            return handle_update(conn, user, body, request_id, origin=origin)
        if action == "glossary.mark":
            return handle_mark(conn, user, body, request_id, origin=origin)

        return err_response("not_implemented", "Не реализовано", 501, request_id, origin=origin)

    except Exception as e:
        return err_response("internal_error", f"Ошибка сервера: {str(e)[:200]}", 500, request_id, origin=origin)
    finally:
        conn.close()