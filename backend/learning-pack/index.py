"""
Learning Pack — verified content-first learning engine.
ADR-001: material = first-class entity, AI = post-processing layer.
ADR-002: показываем только верифицированные материалы с extracted content.

Действия:
  - lp.generate    — подобрать + верифицировать материалы для milestone
  - lp.list        — список материалов с прогрессом
  - lp.reader      — получить in-app reader контент (markdown)
  - lp.summarize   — AI-выжимка по snapshot_text
  - lp.assets      — key_points + study_notes для milestone
  - lp.progress    — обновить статус изучения
  - lp.status      — статус job
"""
import json
import os
import re
import uuid
import logging
import html as html_lib
import urllib.request
import urllib.parse
import psycopg2

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("learning-pack")

ALLOWED_ACTIONS = {
    "lp.generate", "lp.status", "lp.list",
    "lp.reader", "lp.summarize", "lp.assets", "lp.progress",
    "lp.reading_list",
}

ALLOWED_ORIGINS = {
    "https://raven.moscow", "https://www.raven.moscow",
    "https://docmind.ai",
    "https://digital-innovation-initiative-1--preview.poehali.dev",
    "https://poehali.dev", "http://localhost:5173", "http://localhost:3000",
}

TRUST_LABELS = {"A": "Официальный", "B": "Проверенный", "C": "Открытый"}
TRUST_COLORS = {"A": "emerald", "B": "blue", "C": "slate"}

# Минимальный размер контента чтобы считать его полезным
MIN_CONTENT_WORDS = 80


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


# ── Helpers ───────────────────────────────────────────────────────────────────

def extract_domain(url: str) -> str:
    try:
        return urllib.parse.urlparse(url).hostname or ""
    except Exception:
        return ""


def get_trusted_sources(conn) -> dict:
    schema = get_schema()
    cur = conn.cursor()
    cur.execute(f"SELECT domain, trust_level, source_type, name FROM {schema}.content_sources WHERE is_active = true")
    return {row[0]: {"trust_level": row[1], "source_type": row[2], "name": row[3]} for row in cur.fetchall()}


def yandex_gpt(prompt: str, system: str = "", max_tokens: int = 2000) -> str:
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
        "completionOptions": {"stream": False, "temperature": 0.3, "maxTokens": max_tokens},
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


def detect_format(url: str, title: str, source_type: str) -> str:
    low = (url + title).lower()
    if source_type == "video" or "youtube" in low:
        return "video"
    if source_type == "course_platform" or any(w in low for w in ("курс", "course", "обучение", "stepik", "coursera", "edx")):
        return "course"
    if any(w in low for w in (".pdf", "книга", "учебник")):
        return "book"
    if any(w in low for w in ("docs.", "documentation", "справочник", "регламент", "стандарт")):
        return "doc"
    return "article"


def estimate_time(format_: str) -> int:
    return {"article": 10, "course": 120, "video": 20, "book": 180, "doc": 15, "report": 30}.get(format_, 10)


# ── URL verification + content fetch ─────────────────────────────────────────

def _clean_html_to_text(html: str) -> str:
    """Грубая очистка HTML → читаемый текст."""
    # Удаляем скрипты и стили
    html = re.sub(r'<(script|style|nav|header|footer|aside)[^>]*>.*?</\1>', ' ', html, flags=re.DOTALL | re.IGNORECASE)
    # Заголовки → текст с переносами
    html = re.sub(r'<h[1-6][^>]*>(.*?)</h[1-6]>', r'\n\n## \1\n\n', html, flags=re.DOTALL | re.IGNORECASE)
    # Параграфы → переносы
    html = re.sub(r'<(p|div|li|tr|br)[^>]*>', '\n', html, flags=re.IGNORECASE)
    # Убираем все теги
    html = re.sub(r'<[^>]+>', ' ', html)
    # HTML entities
    html = html_lib.unescape(html)
    # Схлопываем пробелы и переносы
    html = re.sub(r'[ \t]+', ' ', html)
    html = re.sub(r'\n{3,}', '\n\n', html)
    return html.strip()


def _html_to_markdown(html: str, base_url: str = "") -> str:
    """Конвертация HTML в markdown (основные элементы)."""
    # Заголовки
    for i in range(6, 0, -1):
        html = re.sub(rf'<h{i}[^>]*>(.*?)</h{i}>', lambda m: '\n' + '#' * i + ' ' + re.sub(r'<[^>]+>', '', m.group(1)).strip() + '\n', html, flags=re.DOTALL | re.IGNORECASE)
    # Жирный
    html = re.sub(r'<(strong|b)[^>]*>(.*?)</\1>', r'**\2**', html, flags=re.DOTALL | re.IGNORECASE)
    # Курсив
    html = re.sub(r'<(em|i)[^>]*>(.*?)</\1>', r'*\2*', html, flags=re.DOTALL | re.IGNORECASE)
    # Списки
    html = re.sub(r'<li[^>]*>(.*?)</li>', r'\n- \1', html, flags=re.DOTALL | re.IGNORECASE)
    # Параграфы
    html = re.sub(r'<(p|div)[^>]*>', '\n\n', html, flags=re.IGNORECASE)
    # Удаляем остальные теги
    html = re.sub(r'<[^>]+>', ' ', html)
    html = html_lib.unescape(html)
    html = re.sub(r'[ \t]+', ' ', html)
    html = re.sub(r'\n{3,}', '\n\n', html)
    return html.strip()


def verify_and_fetch(url: str) -> dict:
    """
    Верифицируем URL + извлекаем контент.
    Возвращает: {http_status, resolved_url, content_type, plain_text, reader_markdown, word_count, availability_mode}
    """
    result = {
        "http_status": 0, "resolved_url": url, "content_type": "",
        "plain_text": "", "reader_markdown": "", "word_count": 0,
        "availability_mode": "unknown", "error": "",
    }
    try:
        req = urllib.request.Request(url, headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8",
        })
        with urllib.request.urlopen(req, timeout=7) as resp:
            result["http_status"] = resp.status
            result["resolved_url"] = resp.url
            result["content_type"] = resp.headers.get("Content-Type", "")
            raw = resp.read(150_000)  # максимум 150KB

        # Определяем кодировку
        ct = result["content_type"].lower()
        if "charset=" in ct:
            charset = ct.split("charset=")[-1].split(";")[0].strip()
        else:
            charset = "utf-8"
        try:
            html_text = raw.decode(charset, errors="replace")
        except Exception:
            html_text = raw.decode("utf-8", errors="replace")

        # Проверяем на login/paywall/пустую страницу
        low = html_text.lower()
        is_loginwall = any(p in low for p in ("sign in to", "log in to", "войдите чтобы", "требуется авторизация", "access denied", "403 forbidden", "sign up to access"))
        if is_loginwall:
            result["availability_mode"] = "source_only"
            result["plain_text"] = ""
            return result

        # Пробуем извлечь main content — ищем article/main/content
        main_match = re.search(
            r'<(article|main|div[^>]+(?:class|id)=["\'][^"\']*(?:content|article|post|text|body|entry|main)[^"\']*["\'])[^>]*>(.*?)</\1>',
            html_text, re.DOTALL | re.IGNORECASE
        )
        if main_match:
            content_html = main_match.group(2)
        else:
            # Fallback: всё body
            body_match = re.search(r'<body[^>]*>(.*?)</body>', html_text, re.DOTALL | re.IGNORECASE)
            content_html = body_match.group(1) if body_match else html_text

        # Убираем ненужные блоки
        for tag in ('script', 'style', 'nav', 'header', 'footer', 'aside', 'form', 'iframe', 'noscript'):
            content_html = re.sub(rf'<{tag}[^>]*>.*?</{tag}>', '', content_html, flags=re.DOTALL | re.IGNORECASE)

        plain = _clean_html_to_text(content_html)
        markdown = _html_to_markdown(content_html, url)

        words = len(plain.split())
        result["plain_text"] = plain[:50_000]
        result["reader_markdown"] = markdown[:80_000]
        result["word_count"] = words

        if words >= MIN_CONTENT_WORDS:
            result["availability_mode"] = "in_app"
        else:
            result["availability_mode"] = "source_only"

    except urllib.error.HTTPError as e:
        result["http_status"] = e.code
        result["availability_mode"] = "unavailable"
        result["error"] = f"HTTP {e.code}"
    except Exception as e:
        result["availability_mode"] = "unavailable"
        result["error"] = str(e)[:200]

    return result


# ── AI pipeline ───────────────────────────────────────────────────────────────

def ai_retrieve_candidates(ms_title: str, ms_desc: str, goal_title: str, target_role: str, preferred_domains: list) -> list:
    """AI подбирает кандидатов — только учебные материалы (курсы, учебники, образовательные статьи)."""
    prompt = f"""Ты — куратор учебных программ. Подбери 6-8 УЧЕБНЫХ материалов для изучения темы.

Цель обучения: {goal_title}
Роль: {target_role or '—'}
Тема шага: {ms_title}
Описание: {ms_desc or '—'}

Верни СТРОГО валидный JSON-массив:
[{{
  "title": "точное название курса/учебного пособия/лекции",
  "url": "реальный https:// URL",
  "domain": "домен",
  "description": "чему учит этот материал, 1-2 предложения",
  "format": "course | book | lecture | article",
  "estimated_minutes": число,
  "reason": "что конкретно студент узнает из этого материала применительно к теме"
}}]

СТРОГИЕ ПРАВИЛА (нарушение = плохой результат):
1. ТОЛЬКО УЧЕБНЫЕ материалы: онлайн-курсы, учебники, лекции, образовательные статьи
2. ЗАПРЕЩЕНО включать: нормативные акты, законы, приказы, новостные статьи, пресс-релизы, корпоративные страницы
3. Лучшие источники: stepik.org, coursera.org, openedu.ru, hse.ru/edu, edx.org, habr.com (только обучающие статьи)
4. URL должен вести ПРЯМО на курс/лекцию/статью, НЕ на главную страницу платформы
5. Приоритет — практические курсы с программой и структурой, а не обзорные статьи
6. Лучше 4 реальных курса чем 8 придуманных ссылок
7. ТОЛЬКО JSON без пояснений."""

    try:
        raw = yandex_gpt(prompt, max_tokens=3000).strip()
        if "```" in raw:
            for p in raw.split("```"):
                p2 = p.strip()
                if p2.startswith("json"):
                    p2 = p2[4:].strip()
                if p2.startswith("["):
                    raw = p2
                    break
        start, end = raw.find("["), raw.rfind("]")
        if start != -1 and end != -1:
            raw = raw[start:end + 1]
        items = json.loads(raw)
        result = []
        for it in (items if isinstance(items, list) else []):
            url = str(it.get("url") or "").strip()
            title = str(it.get("title") or "").strip()
            if url.startswith("http") and title:
                result.append({
                    "url": url, "title": title[:300],
                    "description": str(it.get("description") or "")[:500],
                    "domain": extract_domain(url),
                    "format": it.get("format", "article"),
                    "estimated_minutes": int(it.get("estimated_minutes") or 15),
                    "reason": str(it.get("reason") or "")[:400],
                })
        log.info("ai_retrieve: %d candidates", len(result))
        return result
    except Exception as e:
        log.warning("ai_retrieve failed: %s", e)
        return []


def ai_build_assets(snapshot_text: str, ms_title: str, goal_title: str, mat_title: str) -> dict:
    """Строит learning assets по snapshot_text (не по title!)."""
    text_excerpt = snapshot_text[:6000]
    prompt = f"""Ты — педагогический дизайнер. На основе РЕАЛЬНОГО ТЕКСТА материала построй учебный конспект.

Материал: «{mat_title}»
Шаг плана: {ms_title}
Цель: {goal_title}

Текст материала (фрагмент):
\"\"\"
{text_excerpt}
\"\"\"

Верни СТРОГО валидный JSON:
{{
  "summary": "краткое содержание материала в 3-4 предложениях (по тексту, не по названию)",
  "key_points": ["тезис 1 из текста", "тезис 2", "тезис 3", "тезис 4", "тезис 5"],
  "study_notes": "что важно запомнить применительно к шагу плана, 2-3 предложения",
  "relevance": "как именно этот материал помогает закрыть шаг плана, 1-2 предложения"
}}

ВАЖНО:
- summary — по фактическому содержимому текста, не по названию
- key_points — конкретные тезисы из текста, не общие слова
- Если текст не относится к теме — напиши об этом честно
- ТОЛЬКО JSON без пояснений."""

    try:
        raw = yandex_gpt(prompt, max_tokens=1500).strip()
        if "```" in raw:
            for p in raw.split("```"):
                p2 = p.strip()
                if p2.startswith("json"):
                    p2 = p2[4:].strip()
                if p2.startswith("{"):
                    raw = p2
                    break
        start, end = raw.find("{"), raw.rfind("}")
        if start != -1 and end != -1:
            raw = raw[start:end + 1]
        return json.loads(raw)
    except Exception as e:
        log.warning("ai_build_assets failed: %s", e)
        return {}


# ── Main pipeline ─────────────────────────────────────────────────────────────

def run_pipeline(conn, milestone_id: int, goal_id: int, user_id: int) -> int:
    """
    ADR-002 verified content-first pipeline:
    1. AI подбирает кандидатов
    2. Каждый URL верифицируется + контент извлекается
    3. Сохраняем snapshot
    4. AI строит assets по snapshot_text
    5. Только verified/in_app попадают в milestone_materials
    """
    schema = get_schema()
    cur = conn.cursor()

    cur.execute(
        f"SELECT m.title, m.description, g.title, g.target_role FROM {schema}.milestones m JOIN {schema}.goals g ON g.id = m.goal_id WHERE m.id = %s AND m.user_id = %s",
        (milestone_id, user_id),
    )
    row = cur.fetchone()
    if not row:
        raise ValueError(f"milestone {milestone_id} не найден")
    ms_title, ms_desc, goal_title, target_role = row

    trusted = get_trusted_sources(conn)
    preferred = [d for d, info in trusted.items() if info["trust_level"] in ("A", "B")]

    log.info("pipeline start: milestone=%s '%s'", milestone_id, ms_title)

    # 1. AI-кандидаты
    candidates = ai_retrieve_candidates(ms_title, ms_desc or "", goal_title, target_role or "", preferred)
    if not candidates:
        log.warning("no candidates for milestone=%s", milestone_id)
        return 0

    # 2. Верификация + fetch — строго не более 4 URL, timeout 7 сек каждый
    # Assets строим LAZY (по запросу lp.summarize), чтобы pipeline уложился в 25 сек
    MAX_FETCH = 4
    verified = []
    seen_urls = set()
    for c in candidates[:8]:
        if len(verified) >= MAX_FETCH:
            break
        url = c["url"]
        if url in seen_urls:
            continue
        seen_urls.add(url)

        # Доверие по домену (до fetch — быстро)
        domain = c.get("domain") or extract_domain(url)
        trust_info = trusted.get(domain)
        if not trust_info:
            for td, ti in trusted.items():
                if td in domain:
                    trust_info = ti
                    break
        c["trust_level"] = trust_info["trust_level"] if trust_info else "C"
        c["source_type"] = trust_info["source_type"] if trust_info else "article"
        c["format"] = detect_format(url, c["title"], c.get("source_type", "article"))

        log.info("verifying %d/%d: %s", len(verified)+1, MAX_FETCH, url)
        fetch = verify_and_fetch(url)
        c["http_status"] = fetch["http_status"]
        c["resolved_url"] = fetch.get("resolved_url", url)
        c["content_type"] = fetch.get("content_type", "")
        c["availability_mode"] = fetch["availability_mode"]
        c["plain_text"] = fetch.get("plain_text", "")
        c["reader_markdown"] = fetch.get("reader_markdown", "")
        c["word_count"] = fetch.get("word_count", 0)
        c["fetch_error"] = fetch.get("error", "")
        # Assets — не строим сейчас, будут по запросу через lp.summarize
        c["assets"] = {}
        c["summary_basis"] = "content" if c["availability_mode"] == "in_app" and c.get("plain_text") else "metadata"

        if c["availability_mode"] == "unavailable":
            log.info("skip unavailable: %s [%s]", url, c.get("fetch_error",""))
            continue

        verified.append(c)

    log.info("verified: %d / %d candidates", len(verified), len(candidates))
    if not verified:
        return 0

    # 3. Атомарное сохранение
    try:
        cur.execute(f"DELETE FROM {schema}.milestone_materials WHERE milestone_id = %s AND user_id = %s", (milestone_id, user_id))
        saved = 0
        for sort_i, c in enumerate(verified):
            assets = c.get("assets", {})

            # Upsert material
            cur.execute(
                f"""INSERT INTO {schema}.materials
                    (url, domain, title, description, source_type, trust_level, format, estimated_minutes,
                     resolved_url, http_status, content_type, availability_mode, verification_status, summary_basis, last_verified_at)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'verified',%s,NOW())
                    ON CONFLICT (url) DO UPDATE SET
                        title=EXCLUDED.title, description=EXCLUDED.description,
                        resolved_url=EXCLUDED.resolved_url, http_status=EXCLUDED.http_status,
                        availability_mode=EXCLUDED.availability_mode, verification_status='verified',
                        summary_basis=EXCLUDED.summary_basis, last_verified_at=NOW()
                    RETURNING id""",
                (c["url"], c.get("domain", ""), c["title"], c.get("description", ""),
                 c.get("source_type", "article"), c["trust_level"], c["format"], c.get("estimated_minutes", 15),
                 c.get("resolved_url", c["url"]), c.get("http_status", 0), c.get("content_type", ""),
                 c["availability_mode"], c["summary_basis"]),
            )
            mat_id = cur.fetchone()[0]

            # Snapshot (если есть контент)
            if c.get("reader_markdown") or c.get("plain_text"):
                import hashlib
                content_hash = hashlib.md5((c.get("plain_text") or "").encode()).hexdigest()
                cur.execute(
                    f"""INSERT INTO {schema}.material_snapshots
                        (material_id, reader_markdown, plain_text, word_count, content_hash, fetched_at)
                        VALUES (%s,%s,%s,%s,%s,NOW())
                        ON CONFLICT (material_id) DO UPDATE SET
                            reader_markdown=EXCLUDED.reader_markdown, plain_text=EXCLUDED.plain_text,
                            word_count=EXCLUDED.word_count, content_hash=EXCLUDED.content_hash, fetched_at=NOW()""",
                    (mat_id, c.get("reader_markdown", "")[:80000], c.get("plain_text", "")[:50000],
                     c.get("word_count", 0), content_hash),
                )

                # Learning assets
                if assets.get("summary") or assets.get("key_points"):
                    kp = assets.get("key_points") or []
                    cur.execute(
                        f"""INSERT INTO {schema}.material_learning_assets
                            (material_id, milestone_id, content_summary, key_points, study_notes, generated_from_hash)
                            VALUES (%s,%s,%s,%s,%s,%s)
                            ON CONFLICT (material_id, milestone_id) DO UPDATE SET
                                content_summary=EXCLUDED.content_summary, key_points=EXCLUDED.key_points,
                                study_notes=EXCLUDED.study_notes, generated_from_hash=EXCLUDED.generated_from_hash,
                                generated_at=NOW()""",
                        (mat_id, milestone_id, assets.get("summary", ""), kp, assets.get("study_notes", ""), content_hash),
                    )

            # milestone_materials
            selection_reason = c.get("reason") or assets.get("relevance", "")
            cur.execute(
                f"""INSERT INTO {schema}.milestone_materials
                    (milestone_id, goal_id, user_id, material_id, relevance_score, selection_reason, sort_order)
                    VALUES (%s,%s,%s,%s,%s,%s,%s)""",
                (milestone_id, goal_id, user_id, mat_id, 0.8, selection_reason, sort_i),
            )
            saved += 1

        conn.commit()
        log.info("pipeline done: milestone=%s saved=%d", milestone_id, saved)
        return saved
    except Exception:
        conn.rollback()
        raise


# ── Handlers ──────────────────────────────────────────────────────────────────

def handle_generate(conn, user, body, rid, origin):
    """Запустить подбор + верификацию + построение учебных материалов."""
    schema = get_schema()
    milestone_id = body.get("milestone_id")
    goal_id = body.get("goal_id")
    if not milestone_id or not goal_id:
        return err("validation_error", "Нужны milestone_id и goal_id", 400, rid, origin)

    cur = conn.cursor()
    cur.execute(f"SELECT user_id FROM {schema}.milestones WHERE id = %s", (int(milestone_id),))
    row = cur.fetchone()
    if not row or row[0] != user["id"]:
        return err("access_denied", "Нет доступа", 403, rid, origin)

    cur.execute(
        f"""INSERT INTO {schema}.learning_jobs (user_id, milestone_id, goal_id, status, started_at)
            VALUES (%s,%s,%s,'running',NOW())
            ON CONFLICT (user_id, milestone_id)
            DO UPDATE SET status='running', started_at=NOW(), error_text=NULL, finished_at=NULL""",
        (user["id"], int(milestone_id), int(goal_id)),
    )
    conn.commit()

    try:
        count = run_pipeline(conn, int(milestone_id), int(goal_id), user["id"])
        cur.execute(
            f"UPDATE {schema}.learning_jobs SET status='ready', finished_at=NOW(), materials_found=%s WHERE user_id=%s AND milestone_id=%s",
            (count, user["id"], int(milestone_id)),
        )
        conn.commit()
        return ok({"status": "ready", "materials_found": count}, rid, origin)
    except Exception as e:
        log.error("pipeline error: %s", e)
        cur.execute(
            f"UPDATE {schema}.learning_jobs SET status='failed', finished_at=NOW(), error_text=%s WHERE user_id=%s AND milestone_id=%s",
            (str(e)[:500], user["id"], int(milestone_id)),
        )
        conn.commit()
        return err("pipeline_error", str(e), 500, rid, origin)


def handle_list(conn, user, body, rid, origin):
    """Список верифицированных материалов с assets."""
    schema = get_schema()
    milestone_id = body.get("milestone_id")
    if not milestone_id:
        return err("validation_error", "Нужен milestone_id", 400, rid, origin)

    cur = conn.cursor()
    cur.execute(
        f"""SELECT mm.id, m.id, m.url, m.domain, m.title, m.description,
                   m.source_type, m.trust_level, m.format, m.estimated_minutes,
                   m.availability_mode, m.verification_status, m.summary_basis,
                   mm.relevance_score, mm.selection_reason, mm.sort_order,
                   ump.status,
                   mla.content_summary, mla.key_points, mla.study_notes,
                   ms.word_count
            FROM {schema}.milestone_materials mm
            JOIN {schema}.materials m ON m.id = mm.material_id
            LEFT JOIN {schema}.user_material_progress ump
                ON ump.material_id = m.id AND ump.user_id = %s AND ump.milestone_id = %s
            LEFT JOIN {schema}.material_learning_assets mla
                ON mla.material_id = m.id AND mla.milestone_id = %s
            LEFT JOIN {schema}.material_snapshots ms ON ms.material_id = m.id
            WHERE mm.milestone_id = %s AND mm.user_id = %s
            ORDER BY mm.sort_order""",
        (user["id"], int(milestone_id), int(milestone_id), int(milestone_id), user["id"]),
    )
    materials = []
    for row in cur.fetchall():
        (mm_id, mat_id, url, domain, title, description,
         source_type, trust_level, fmt, est_min,
         avail_mode, verif_status, summary_basis,
         relevance, selection_reason, sort_order,
         prog_status,
         content_summary, key_points, study_notes,
         word_count) = row

        materials.append({
            "mm_id": mm_id, "id": mat_id,
            "url": url, "domain": domain, "title": title, "description": description,
            "source_type": source_type, "trust_level": trust_level,
            "trust_label": TRUST_LABELS.get(trust_level, "Открытый"),
            "trust_color": TRUST_COLORS.get(trust_level, "slate"),
            "format": fmt, "estimated_minutes": est_min,
            "availability_mode": avail_mode or "unknown",
            "verification_status": verif_status or "pending",
            "summary_basis": summary_basis or "none",
            "has_reader": avail_mode == "in_app",
            "has_assets": bool(content_summary or key_points),
            "relevance_score": float(relevance or 0.8),
            "selection_reason": selection_reason or "",
            "sort_order": sort_order,
            "progress_status": prog_status or "new",
            "content_summary": content_summary or "",
            "key_points": key_points or [],
            "study_notes": study_notes or "",
            "word_count": word_count or 0,
        })

    cur.execute(
        f"SELECT status, materials_found, error_text FROM {schema}.learning_jobs WHERE user_id=%s AND milestone_id=%s ORDER BY created_at DESC LIMIT 1",
        (user["id"], int(milestone_id)),
    )
    job = cur.fetchone()
    job_data = {"status": job[0], "materials_found": job[1], "error": job[2]} if job else None

    return ok({"materials": materials, "job": job_data}, rid, origin)


def handle_reader(conn, user, body, rid, origin):
    """In-app reader контент по material_id."""
    schema = get_schema()
    material_id = body.get("material_id")
    if not material_id:
        return err("validation_error", "Нужен material_id", 400, rid, origin)

    cur = conn.cursor()
    # Проверяем доступ
    cur.execute(f"SELECT id FROM {schema}.milestone_materials WHERE material_id=%s AND user_id=%s LIMIT 1", (int(material_id), user["id"]))
    if not cur.fetchone():
        return err("access_denied", "Нет доступа", 403, rid, origin)

    cur.execute(f"SELECT reader_markdown, plain_text, word_count, fetched_at FROM {schema}.material_snapshots WHERE material_id=%s", (int(material_id),))
    snap = cur.fetchone()
    if not snap:
        return err("not_found", "Контент ещё не извлечён", 404, rid, origin)

    cur.execute(f"SELECT title, url FROM {schema}.materials WHERE id=%s", (int(material_id),))
    mat = cur.fetchone()

    return ok({
        "material_id": int(material_id),
        "title": mat[0] if mat else "",
        "source_url": mat[1] if mat else "",
        "reader_markdown": snap[0] or "",
        "word_count": snap[2] or 0,
        "fetched_at": snap[3],
    }, rid, origin)


def handle_summarize(conn, user, body, rid, origin):
    """AI-выжимка — ТОЛЬКО по snapshot_text (ADR-002)."""
    schema = get_schema()
    material_id = body.get("material_id")
    milestone_id = body.get("milestone_id")
    if not material_id:
        return err("validation_error", "Нужен material_id", 400, rid, origin)

    cur = conn.cursor()
    cur.execute(f"SELECT id FROM {schema}.milestone_materials WHERE material_id=%s AND user_id=%s LIMIT 1", (int(material_id), user["id"]))
    if not cur.fetchone():
        return err("access_denied", "Нет доступа", 403, rid, origin)

    # Проверяем cached assets
    if milestone_id:
        cur.execute(
            f"SELECT content_summary, key_points, study_notes FROM {schema}.material_learning_assets WHERE material_id=%s AND milestone_id=%s",
            (int(material_id), int(milestone_id)),
        )
        cached = cur.fetchone()
        if cached and cached[0]:
            return ok({"summary": cached[0], "key_points": cached[1] or [], "study_notes": cached[2] or "", "cached": True, "basis": "content"}, rid, origin)

    # Нужен snapshot_text
    cur.execute(f"SELECT plain_text, content_hash FROM {schema}.material_snapshots WHERE material_id=%s", (int(material_id),))
    snap = cur.fetchone()
    if not snap or not snap[0]:
        return err("no_content", "Нет извлечённого содержимого для выжимки. Только верифицированные материалы поддерживают эту функцию.", 422, rid, origin)

    cur.execute(f"SELECT title FROM {schema}.materials WHERE id=%s", (int(material_id),))
    mat = cur.fetchone()
    mat_title = mat[0] if mat else ""

    ms_title, goal_title = "", ""
    if milestone_id:
        cur.execute(
            f"SELECT m.title, g.title FROM {schema}.milestones m JOIN {schema}.goals g ON g.id = m.goal_id WHERE m.id=%s",
            (int(milestone_id),),
        )
        ms_row = cur.fetchone()
        if ms_row:
            ms_title, goal_title = ms_row

    assets = ai_build_assets(snap[0], ms_title, goal_title, mat_title)
    if not assets:
        return err("ai_error", "Не удалось построить выжимку", 500, rid, origin)

    # Кешируем
    if milestone_id:
        kp = assets.get("key_points") or []
        cur.execute(
            f"""INSERT INTO {schema}.material_learning_assets
                (material_id, milestone_id, content_summary, key_points, study_notes, generated_from_hash)
                VALUES (%s,%s,%s,%s,%s,%s)
                ON CONFLICT (material_id, milestone_id) DO UPDATE SET
                    content_summary=EXCLUDED.content_summary, key_points=EXCLUDED.key_points,
                    study_notes=EXCLUDED.study_notes, generated_at=NOW()""",
            (int(material_id), int(milestone_id), assets.get("summary", ""), kp, assets.get("study_notes", ""), snap[1]),
        )
        conn.commit()

    return ok({
        "summary": assets.get("summary", ""),
        "key_points": assets.get("key_points") or [],
        "study_notes": assets.get("study_notes", ""),
        "cached": False, "basis": "content",
    }, rid, origin)


def handle_assets(conn, user, body, rid, origin):
    """Получить learning assets для материала."""
    schema = get_schema()
    material_id = body.get("material_id")
    milestone_id = body.get("milestone_id")
    if not material_id:
        return err("validation_error", "Нужен material_id", 400, rid, origin)

    cur = conn.cursor()
    query = f"SELECT content_summary, key_points, study_notes, generated_at FROM {schema}.material_learning_assets WHERE material_id=%s"
    params = [int(material_id)]
    if milestone_id:
        query += " AND milestone_id=%s"
        params.append(int(milestone_id))
    cur.execute(query + " LIMIT 1", params)
    row = cur.fetchone()
    if not row:
        return err("not_found", "Assets не найдены. Запустите подбор материалов.", 404, rid, origin)
    return ok({"content_summary": row[0], "key_points": row[1] or [], "study_notes": row[2], "generated_at": row[3]}, rid, origin)


def handle_reading_list(conn, user, body, rid, origin):
    """
    AI генерирует список рекомендуемых учебников/курсов для самостоятельного поиска.
    Пользователь находит их сам и загружает в Educational Passport.
    Результат кешируется по milestone_id.
    """
    schema = get_schema()
    milestone_id = body.get("milestone_id")
    goal_id = body.get("goal_id")
    if not milestone_id:
        return err("validation_error", "Нужен milestone_id", 400, rid, origin)

    cur = conn.cursor()

    # Получаем данные milestone + goal
    cur.execute(
        f"SELECT m.title, m.description, g.title, g.target_role FROM {schema}.milestones m JOIN {schema}.goals g ON g.id = m.goal_id WHERE m.id = %s AND m.user_id = %s",
        (int(milestone_id), user["id"]),
    )
    row = cur.fetchone()
    if not row:
        return err("not_found", "Milestone не найден", 404, rid, origin)
    ms_title, ms_desc, goal_title, target_role = row

    prompt = f"""Ты — методист. Составь список учебной литературы и онлайн-курсов для самостоятельного изучения.

Цель: {goal_title}
Роль: {target_role or '—'}
Тема: {ms_title}
Описание: {ms_desc or '—'}

Верни СТРОГО валидный JSON-массив из 5-8 позиций:
[{{
  "type": "book | course | textbook | video_series",
  "title": "точное название",
  "author": "автор или организация-издатель (если известно)",
  "where_to_find": "Stepik / Coursera / ЛитРес / Библиотека / Amazon / Google Scholar / официальный сайт",
  "why": "что конкретно даёт этот материал для освоения темы, 1-2 предложения",
  "level": "начальный | средний | продвинутый",
  "estimated_hours": число часов на изучение
}}]

ПРАВИЛА:
1. Только реально существующие книги и курсы с точными названиями
2. Предпочитай: российские учебники по теме, курсы на Stepik/Coursera/OpenEdu, классические учебники
3. Не включай нормативные акты и законы — только учебная литература
4. Разнообразие форматов: 2-3 книги/учебника + 2-3 онлайн-курса
5. Для профессиональной темы — включи курсы с сертификацией если есть
6. ТОЛЬКО JSON без пояснений."""

    try:
        raw = yandex_gpt(prompt, max_tokens=2500).strip()
        if "```" in raw:
            for p in raw.split("```"):
                p2 = p.strip()
                if p2.startswith("json"):
                    p2 = p2[4:].strip()
                if p2.startswith("["):
                    raw = p2
                    break
        start, end = raw.find("["), raw.rfind("]")
        if start != -1 and end != -1:
            raw = raw[start:end + 1]
        items = json.loads(raw)
        reading_list = []
        for it in (items if isinstance(items, list) else []):
            title = str(it.get("title") or "").strip()
            if title:
                reading_list.append({
                    "type": str(it.get("type") or "book"),
                    "title": title,
                    "author": str(it.get("author") or ""),
                    "where_to_find": str(it.get("where_to_find") or ""),
                    "why": str(it.get("why") or ""),
                    "level": str(it.get("level") or "средний"),
                    "estimated_hours": int(it.get("estimated_hours") or 5),
                })
    except Exception as e:
        log.warning("reading_list failed: %s", e)
        return err("ai_error", f"Не удалось сгенерировать список: {e}", 500, rid, origin)

    return ok({"reading_list": reading_list, "milestone_title": ms_title}, rid, origin)


def handle_progress(conn, user, body, rid, origin):
    schema = get_schema()
    material_id = body.get("material_id")
    milestone_id = body.get("milestone_id")
    status = body.get("status")
    if not material_id or not milestone_id or status not in ("new", "opened", "in_progress", "done", "saved"):
        return err("validation_error", "Нужны material_id, milestone_id и статус", 400, rid, origin)

    cur = conn.cursor()
    cur.execute(
        f"""INSERT INTO {schema}.user_material_progress (user_id, material_id, milestone_id, status, opened_at, completed_at)
            VALUES (%s,%s,%s,%s,
                CASE WHEN %s IN ('opened','in_progress','done') THEN NOW() ELSE NULL END,
                CASE WHEN %s = 'done' THEN NOW() ELSE NULL END)
            ON CONFLICT (user_id, material_id, milestone_id) DO UPDATE
            SET status=EXCLUDED.status,
                opened_at=COALESCE(user_material_progress.opened_at, EXCLUDED.opened_at),
                completed_at=CASE WHEN EXCLUDED.status='done' THEN NOW() ELSE user_material_progress.completed_at END,
                updated_at=NOW()""",
        (user["id"], int(material_id), int(milestone_id), status, status, status),
    )
    conn.commit()
    return ok({"material_id": int(material_id), "status": status}, rid, origin)


def handle_status(conn, user, body, rid, origin):
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
    return ok({"status": row[0], "materials_found": row[1], "error": row[2], "created_at": row[3], "finished_at": row[4]}, rid, origin)


HANDLERS = {
    "lp.generate": handle_generate,
    "lp.list": handle_list,
    "lp.reader": handle_reader,
    "lp.summarize": handle_summarize,
    "lp.assets": handle_assets,
    "lp.progress": handle_progress,
    "lp.status": handle_status,
    "lp.reading_list": handle_reading_list,
}


def handler(event: dict, context) -> dict:
    """Learning Pack — verified content-first engine (ADR-002)."""
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