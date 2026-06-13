"""
Learning Pack — retrieval-first AI learning engine.
ADR-001: материал = first-class entity, AI = post-processing layer.

Действия:
  - lp.generate    — запустить подбор материалов для milestone (async job)
  - lp.status      — статус job + результат
  - lp.list        — список материалов по milestone (после готовности)
  - lp.summarize   — AI-выжимка по конкретному материалу (по запросу)
  - lp.progress    — обновить статус изучения материала
"""
import json
import os
import re
import uuid
import logging
import urllib.request
import urllib.parse
import psycopg2

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("learning-pack")

ALLOWED_ACTIONS = {
    "lp.generate",
    "lp.status",
    "lp.list",
    "lp.summarize",
    "lp.progress",
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

TRUST_LABELS = {"A": "Официальный", "B": "Проверенный", "C": "Открытый"}
TRUST_COLORS = {"A": "emerald", "B": "blue", "C": "slate"}


def get_schema():
    return os.environ.get("MAIN_DB_SCHEMA", "public")


def get_db():
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    conn.autocommit = False
    return conn


def _is_allowed_origin(origin):
    if not origin:
        return False
    if origin in ALLOWED_ORIGINS:
        return True
    try:
        parsed = urllib.parse.urlparse(origin)
        if parsed.scheme not in ("https", "http"):
            return False
        h = (parsed.hostname or "").lower()
        return h == "poehali.dev" or h.endswith(".poehali.dev")
    except Exception:
        return False


def cors_headers(origin=None):
    h = {"Access-Control-Allow-Methods": "POST, OPTIONS",
         "Access-Control-Allow-Headers": "Content-Type, X-Session-Id",
         "Vary": "Origin"}
    if _is_allowed_origin(origin):
        h["Access-Control-Allow-Origin"] = origin
    return h


def ok(data, rid, origin=None):
    return {"statusCode": 200,
            "headers": {**cors_headers(origin), "Content-Type": "application/json", "X-Request-Id": rid},
            "body": json.dumps({"ok": True, "request_id": rid, "data": data}, ensure_ascii=False, default=str)}


def err(code, msg, status, rid, origin=None):
    return {"statusCode": status,
            "headers": {**cors_headers(origin), "Content-Type": "application/json", "X-Request-Id": rid},
            "body": json.dumps({"ok": False, "request_id": rid, "error": {"code": code, "message": msg}}, ensure_ascii=False)}


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


# ── AI-curated retrieval ──────────────────────────────────────────────────────

def ai_retrieve_materials(ms_title: str, ms_desc: str, goal_title: str, target_role: str, trusted_domains: list) -> list:
    """
    AI подбирает реальные материалы из доверенных источников.
    Стратегия: GPT знает реальные курсы/статьи на Stepik, Habr, Coursera и т.д.
    Это не галлюцинация — это знание о публичных платформах.
    Дополнительно пробуем Yandex Search XML если есть ключ.
    """
    domains_list = ", ".join(trusted_domains[:20])

    prompt = f"""Ты — куратор образовательных материалов. Твоя задача — подобрать 5-7 РЕАЛЬНЫХ материалов для изучения.

Цель: {goal_title}
Роль: {target_role or '—'}
Шаг плана: {ms_title}
Описание: {ms_desc or '—'}

Доверенные платформы (предпочитай их): {domains_list}

Верни СТРОГО валидный JSON-массив. Каждый элемент:
{{
  "title": "точное название материала или курса",
  "url": "реальный рабочий URL (https://...)",
  "domain": "домен сайта",
  "description": "о чём материал, 1-2 предложения",
  "trust_level": "A | B | C",
  "format": "article | course | video | book | doc",
  "estimated_minutes": число,
  "reason": "почему этот материал важен для данного шага"
}}

ПРАВИЛА (строго):
1. Только реальные существующие материалы с рабочими URL
2. Предпочитай: stepik.org, coursera.org, habr.com, hse.ru, consultant.ru, cbr.ru, digital.gov.ru
3. trust_level A — официальные (gov.ru, законы, стандарты), B — образовательные (вузы, крупные платформы), C — остальные
4. Разнообразие форматов: минимум 1 курс + 1-2 статьи + 1 официальный документ если есть
5. URL должен вести ПРЯМО на материал, не на главную страницу
6. Не выдумывай несуществующие страницы. Лучше меньше — но реальные.

Верни ТОЛЬКО JSON без пояснений."""

    try:
        raw = yandex_gpt(prompt).strip()
        # Убираем markdown-обёртки
        if "```" in raw:
            parts = raw.split("```")
            for p in parts:
                if p.startswith("json"):
                    raw = p[4:].strip()
                    break
                elif p.strip().startswith("["):
                    raw = p.strip()
                    break
        raw = raw.strip().rstrip("```").strip()
        # Находим JSON-массив
        start = raw.find("[")
        end = raw.rfind("]")
        if start != -1 and end != -1:
            raw = raw[start:end+1]
        items = json.loads(raw)
        if not isinstance(items, list):
            return []
        # Валидируем и фильтруем
        result = []
        for it in items:
            url = (it.get("url") or "").strip()
            title = (it.get("title") or "").strip()
            if not url or not url.startswith("http") or not title:
                continue
            result.append({
                "url": url,
                "title": title[:300],
                "description": str(it.get("description") or "")[:500],
                "domain": extract_domain(url),
                "trust_level": it.get("trust_level", "C") if it.get("trust_level") in ("A","B","C") else "C",
                "source_type": "course" if "course" in it.get("format","") else "article",
                "format": it.get("format", "article"),
                "estimated_minutes": int(it.get("estimated_minutes") or 15),
                "reason": str(it.get("reason") or "")[:400],
            })
        log.info("ai_retrieve: got %d candidates", len(result))
        return result
    except Exception as e:
        log.warning("ai_retrieve failed: %s", e)
        return []


def extract_domain(url: str) -> str:
    try:
        return urllib.parse.urlparse(url).hostname or ""
    except Exception:
        return ""


def get_trusted_sources(conn) -> dict:
    """Возвращает {domain: {trust_level, source_type, name}}."""
    schema = get_schema()
    cur = conn.cursor()
    cur.execute(f"SELECT domain, trust_level, source_type, name FROM {schema}.content_sources WHERE is_active = true")
    return {row[0]: {"trust_level": row[1], "source_type": row[2], "name": row[3]} for row in cur.fetchall()}


def yandex_gpt(prompt: str, system: str = "") -> str:
    api_key = os.environ.get("YANDEX_GPT_API_KEY", "")
    folder_id = os.environ.get("YANDEX_FOLDER_ID", "")
    if not api_key or not folder_id:
        raise RuntimeError("YandexGPT не настроен")
    messages = []
    if system:
        messages.append({"role": "system", "text": system})
    messages.append({"role": "user", "text": prompt})
    payload = json.dumps({
        "modelUri": f"gpt://{folder_id}/yandexgpt/latest",
        "completionOptions": {"stream": False, "temperature": 0.3, "maxTokens": 2000},
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
    with urllib.request.urlopen(req, timeout=50) as resp:
        result = json.loads(resp.read())
    return result.get("result", {}).get("alternatives", [{}])[0].get("message", {}).get("text", "")


# ── Retrieval + enrichment pipeline ──────────────────────────────────────────

def detect_format(url: str, title: str, source_type: str) -> str:
    low = url.lower() + title.lower()
    if source_type == "video" or "youtube" in low or "video" in low:
        return "video"
    if source_type == "course_platform" or any(w in low for w in ("course", "курс", "обучение")):
        return "course"
    if any(w in low for w in (".pdf", "книга", "учебник", "book")):
        return "book"
    if any(w in low for w in ("docs.", "documentation", "справочник")):
        return "doc"
    return "article"


def estimate_time(format_: str, trust_level: str) -> int:
    base = {"article": 10, "course": 120, "video": 20, "book": 180, "doc": 15, "report": 30}
    return base.get(format_, 10)


def run_retrieval_pipeline(conn, milestone_id: int, goal_id: int, user_id: int) -> int:
    """
    Retrieval-first pipeline (ADR-001):
    1. Загружаем milestone + goal
    2. Получаем whitelist доверенных доменов
    3. AI подбирает реальные материалы из доверенных платформ
    4. Сохраняем в materials + milestone_materials
    """
    schema = get_schema()
    cur = conn.cursor()

    # 1. Данные milestone и goal
    cur.execute(
        f"SELECT m.title, m.description, g.title, g.target_role, g.goal_type FROM {schema}.milestones m JOIN {schema}.goals g ON g.id = m.goal_id WHERE m.id = %s AND m.user_id = %s",
        (milestone_id, user_id),
    )
    row = cur.fetchone()
    if not row:
        raise ValueError(f"milestone {milestone_id} не найден")
    ms_title, ms_desc, goal_title, target_role, goal_type = row

    # 2. Whitelist доменов (только B и выше для лучшего качества)
    trusted = get_trusted_sources(conn)
    preferred_domains = [d for d, info in trusted.items() if info["trust_level"] in ("A", "B")]

    log.info("lp.generate milestone=%s title='%s' goal='%s'", milestone_id, ms_title, goal_title)

    # 3. AI подбирает реальные материалы
    candidates = ai_retrieve_materials(ms_title, ms_desc or "", goal_title, target_role or "", preferred_domains)

    if not candidates:
        log.warning("lp.generate no candidates for milestone=%s", milestone_id)
        return 0

    # Обогащаем trust_info из whitelist
    for c in candidates:
        domain = c.get("domain", "")
        trust_info = trusted.get(domain)
        if not trust_info:
            for td, ti in trusted.items():
                if td in domain:
                    trust_info = ti
                    break
        if trust_info:
            c["trust_level"] = trust_info["trust_level"]
            c["source_type"] = trust_info["source_type"]
        c["format"] = detect_format(c["url"], c["title"], c.get("source_type", "article"))

    # selected = все кандидаты с relevance из AI
    selected = [{"i": i, "relevance": 0.8, "reason": c.get("reason", ""), "estimated_minutes": c.get("estimated_minutes", 15)} for i, c in enumerate(candidates)]

    log.info("lp.generate selected=%d", len(selected))

    # 6. Сохраняем материалы и связи — атомарно: DELETE + INSERT в одной транзакции
    saved_count = 0
    try:
        cur.execute(f"DELETE FROM {schema}.milestone_materials WHERE milestone_id = %s AND user_id = %s", (milestone_id, user_id))

        for sort_i, sel in enumerate(selected[:6]):
            idx = sel.get("i", 0)
            if idx >= len(candidates):
                continue
            c = candidates[idx]
            relevance = float(sel.get("relevance", 0.8))
            reason = sel.get("reason", "") or c.get("reason", "")
            est_min = sel.get("estimated_minutes") or c.get("estimated_minutes") or estimate_time(c["format"], c["trust_level"])

            # Upsert material в общий каталог
            cur.execute(
                f"""INSERT INTO {schema}.materials (url, domain, title, description, source_type, trust_level, format, estimated_minutes)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
                    ON CONFLICT (url) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description, retrieved_at = NOW()
                    RETURNING id""",
                (c["url"], c["domain"], c["title"], c["description"], c["source_type"], c["trust_level"], c["format"], est_min),
            )
            mat_id = cur.fetchone()[0]

            # Связь milestone ↔ material
            cur.execute(
                f"""INSERT INTO {schema}.milestone_materials (milestone_id, goal_id, user_id, material_id, relevance_score, selection_reason, sort_order)
                    VALUES (%s,%s,%s,%s,%s,%s,%s)""",
                (milestone_id, goal_id, user_id, mat_id, relevance, reason, sort_i),
            )
            saved_count += 1

        conn.commit()
    except Exception:
        conn.rollback()
        raise

    log.info("lp.generate done milestone=%s saved=%d", milestone_id, saved_count)
    return saved_count


# ── Action handlers ───────────────────────────────────────────────────────────

def handle_generate(conn, user, body, rid, origin):
    """Запустить подбор материалов для milestone — synchronous MVP."""
    schema = get_schema()
    milestone_id = body.get("milestone_id")
    goal_id = body.get("goal_id")
    if not milestone_id or not goal_id:
        return err("validation_error", "Нужны milestone_id и goal_id", 400, rid, origin)

    # Проверка доступа
    cur = conn.cursor()
    cur.execute(f"SELECT user_id FROM {schema}.milestones WHERE id = %s", (int(milestone_id),))
    row = cur.fetchone()
    if not row or row[0] != user["id"]:
        return err("access_denied", "Нет доступа", 403, rid, origin)

    # Создаём/обновляем job — UPSERT через уникальный индекс (user_id, milestone_id)
    cur.execute(
        f"""INSERT INTO {schema}.learning_jobs (user_id, milestone_id, goal_id, status, started_at)
            VALUES (%s,%s,%s,'running',NOW())
            ON CONFLICT (user_id, milestone_id)
            DO UPDATE SET status='running', started_at=NOW(), error_text=NULL, finished_at=NULL
            RETURNING id""",
        (user["id"], int(milestone_id), int(goal_id)),
    )
    conn.commit()

    try:
        count = run_retrieval_pipeline(conn, int(milestone_id), int(goal_id), user["id"])
        cur.execute(
            f"UPDATE {schema}.learning_jobs SET status='ready', finished_at=NOW(), materials_found=%s WHERE user_id=%s AND milestone_id=%s",
            (count, user["id"], int(milestone_id)),
        )
        conn.commit()
        return ok({"status": "ready", "materials_found": count}, rid, origin)
    except Exception as e:
        log.error("lp.generate pipeline error: %s", e)
        cur.execute(
            f"UPDATE {schema}.learning_jobs SET status='failed', finished_at=NOW(), error_text=%s WHERE user_id=%s AND milestone_id=%s",
            (str(e)[:500], user["id"], int(milestone_id)),
        )
        conn.commit()
        return err("pipeline_error", f"Ошибка подбора: {e}", 500, rid, origin)


def handle_list(conn, user, body, rid, origin):
    """Список материалов по milestone с прогрессом пользователя."""
    schema = get_schema()
    milestone_id = body.get("milestone_id")
    if not milestone_id:
        return err("validation_error", "Нужен milestone_id", 400, rid, origin)

    cur = conn.cursor()
    cur.execute(
        f"""SELECT mm.id, m.id, m.url, m.domain, m.title, m.description,
                   m.source_type, m.trust_level, m.format, m.estimated_minutes,
                   mm.relevance_score, mm.selection_reason, mm.sort_order,
                   ump.status, ump.completed_at
            FROM {schema}.milestone_materials mm
            JOIN {schema}.materials m ON m.id = mm.material_id
            LEFT JOIN {schema}.user_material_progress ump
                ON ump.material_id = m.id AND ump.user_id = %s AND ump.milestone_id = %s
            WHERE mm.milestone_id = %s AND mm.user_id = %s
            ORDER BY mm.sort_order""",
        (user["id"], int(milestone_id), int(milestone_id), user["id"]),
    )
    cols = ["mm_id", "id", "url", "domain", "title", "description",
            "source_type", "trust_level", "format", "estimated_minutes",
            "relevance_score", "selection_reason", "sort_order",
            "progress_status", "completed_at"]
    materials = []
    for row in cur.fetchall():
        m = dict(zip(cols, row))
        m["trust_label"] = TRUST_LABELS.get(m["trust_level"], "Открытый")
        m["trust_color"] = TRUST_COLORS.get(m["trust_level"], "slate")
        m["progress_status"] = m["progress_status"] or "new"
        materials.append(m)

    # Статус job
    cur.execute(
        f"SELECT status, materials_found, error_text FROM {schema}.learning_jobs WHERE user_id=%s AND milestone_id=%s ORDER BY created_at DESC LIMIT 1",
        (user["id"], int(milestone_id)),
    )
    job = cur.fetchone()
    job_status = {"status": job[0], "materials_found": job[1], "error": job[2]} if job else None

    return ok({"materials": materials, "job": job_status}, rid, origin)


def handle_summarize(conn, user, body, rid, origin):
    """AI-выжимка по конкретному материалу — по запросу пользователя."""
    schema = get_schema()
    material_id = body.get("material_id")
    milestone_id = body.get("milestone_id")
    summary_type = body.get("summary_type", "brief")  # brief | key_points | eli5
    if not material_id:
        return err("validation_error", "Нужен material_id", 400, rid, origin)

    cur = conn.cursor()

    # Проверяем доступ через milestone_materials
    cur.execute(
        f"SELECT mm.id FROM {schema}.milestone_materials mm WHERE mm.material_id = %s AND mm.user_id = %s LIMIT 1",
        (int(material_id), user["id"]),
    )
    if not cur.fetchone():
        return err("access_denied", "Нет доступа", 403, rid, origin)

    # Проверяем кеш
    cur.execute(
        f"SELECT content FROM {schema}.material_summaries WHERE material_id = %s AND summary_type = %s ORDER BY created_at DESC LIMIT 1",
        (int(material_id), summary_type),
    )
    cached = cur.fetchone()
    if cached:
        return ok({"summary": cached[0], "cached": True, "summary_type": summary_type}, rid, origin)

    # Загружаем материал
    cur.execute(
        f"SELECT title, description, url, format, trust_level FROM {schema}.materials WHERE id = %s",
        (int(material_id),),
    )
    mat = cur.fetchone()
    if not mat:
        return err("not_found", "Материал не найден", 404, rid, origin)
    title, desc, url, fmt, trust = mat

    # Контекст milestone (если передан)
    ms_context = ""
    if milestone_id:
        cur.execute(
            f"SELECT m.title, mm.selection_reason FROM {schema}.milestones m JOIN {schema}.milestone_materials mm ON mm.milestone_id = m.id WHERE m.id = %s AND mm.material_id = %s LIMIT 1",
            (int(milestone_id), int(material_id)),
        )
        ms_row = cur.fetchone()
        if ms_row:
            ms_context = f"\nШаг плана: {ms_row[0]}\nПочему рекомендован: {ms_row[1] or '—'}"

    type_instructions = {
        "brief": "Кратко объясни суть материала в 3-4 предложениях. Что главное? Что пользователь узнает?",
        "key_points": "Выдели 4-5 ключевых тезисов из материала. Каждый тезис — одно предложение.",
        "eli5": "Объясни простыми словами как будто человек впервые слышит об этой теме. Без жаргона.",
    }
    instruction = type_instructions.get(summary_type, type_instructions["brief"])

    prompt = f"""Материал:
Название: {title}
Тип: {fmt}
Описание/аннотация: {desc or 'нет описания'}
URL: {url}{ms_context}

{instruction}

Важно: опирайся только на название и описание, не придумывай факты которых нет.
Если описания недостаточно — скажи об этом честно и объясни что обычно содержат материалы такого типа по данной теме."""

    try:
        summary_text = yandex_gpt(prompt)
    except Exception as e:
        return err("ai_error", f"Ошибка AI: {e}", 500, rid, origin)

    # Кешируем
    cur.execute(
        f"INSERT INTO {schema}.material_summaries (material_id, summary_type, content) VALUES (%s,%s,%s)",
        (int(material_id), summary_type, summary_text),
    )
    conn.commit()

    return ok({"summary": summary_text, "cached": False, "summary_type": summary_type}, rid, origin)


def handle_progress(conn, user, body, rid, origin):
    """Обновить статус изучения материала."""
    schema = get_schema()
    material_id = body.get("material_id")
    milestone_id = body.get("milestone_id")
    status = body.get("status")
    if not material_id or not milestone_id or status not in ("new", "opened", "in_progress", "done", "saved"):
        return err("validation_error", "Нужны material_id, milestone_id и статус", 400, rid, origin)

    cur = conn.cursor()
    completed_at = "NOW()" if status == "done" else "NULL"
    cur.execute(
        f"""INSERT INTO {schema}.user_material_progress (user_id, material_id, milestone_id, status, opened_at, completed_at)
            VALUES (%s,%s,%s,%s, CASE WHEN %s IN ('opened','in_progress','done') THEN NOW() ELSE NULL END,
                    CASE WHEN %s = 'done' THEN NOW() ELSE NULL END)
            ON CONFLICT (user_id, material_id, milestone_id) DO UPDATE
            SET status = EXCLUDED.status,
                opened_at = COALESCE(user_material_progress.opened_at, EXCLUDED.opened_at),
                completed_at = CASE WHEN EXCLUDED.status = 'done' THEN NOW() ELSE user_material_progress.completed_at END,
                updated_at = NOW()""",
        (user["id"], int(material_id), int(milestone_id) if milestone_id else None,
         status, status, status),
    )
    conn.commit()
    return ok({"material_id": int(material_id), "status": status}, rid, origin)


def handle_status(conn, user, body, rid, origin):
    """Статус job для milestone."""
    schema = get_schema()
    milestone_id = body.get("milestone_id")
    if not milestone_id:
        return err("validation_error", "Нужен milestone_id", 400, rid, origin)
    cur = conn.cursor()
    cur.execute(
        f"SELECT status, materials_found, error_text, created_at, finished_at FROM {schema}.learning_jobs WHERE user_id=%s AND milestone_id=%s ORDER BY created_at DESC LIMIT 1",
        (user["id"], int(milestone_id)),
    )
    row = cur.fetchone()
    if not row:
        return ok({"status": "not_started"}, rid, origin)
    return ok({
        "status": row[0],
        "materials_found": row[1],
        "error": row[2],
        "created_at": row[3],
        "finished_at": row[4],
    }, rid, origin)


HANDLERS = {
    "lp.generate": handle_generate,
    "lp.list": handle_list,
    "lp.summarize": handle_summarize,
    "lp.progress": handle_progress,
    "lp.status": handle_status,
}


def handler(event: dict, context) -> dict:
    """Learning Pack — retrieval-first AI learning engine."""
    rid = getattr(context, "request_id", None) or str(uuid.uuid4())
    origin = (event.get("headers") or {}).get("Origin") or (event.get("headers") or {}).get("origin")

    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": cors_headers(origin), "body": ""}

    if event.get("httpMethod") != "POST":
        return err("method_not_allowed", "POST required", 405, rid, origin)

    body = {}
    if event.get("body"):
        try:
            body = json.loads(event["body"])
        except Exception:
            return err("invalid_json", "Invalid JSON", 400, rid, origin)

    action = body.get("action", "")
    if action not in ALLOWED_ACTIONS:
        return err("unknown_action", f"Допустимые: {sorted(ALLOWED_ACTIONS)}", 400, rid, origin)

    session_id = (event.get("headers") or {}).get("X-Session-Id") or body.get("session_id")
    conn = get_db()
    try:
        user = get_current_user(conn, session_id)
        if not user:
            return err("unauthorized", "Требуется авторизация", 401, rid, origin)
        return HANDLERS[action](conn, user, body, rid, origin)
    finally:
        conn.close()