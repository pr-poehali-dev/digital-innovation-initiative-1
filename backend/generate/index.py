"""
AI-генерация: анализ документов, структура презентации, текст слайдов, итерации.
Использует YandexGPT.
"""
import json
import os
import secrets
from datetime import datetime, timedelta
import psycopg2


def get_db():
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    conn.autocommit = False
    return conn


def check_rate_limit(conn, schema, key: str, bucket: str, max_hits: int, window_seconds: int):
    """Atomic storage-backed rate limiter. UPSERT в одной SQL-операции — нет TOCTOU."""
    cur = conn.cursor()
    cur.execute(
        f"""INSERT INTO {schema}.rate_limits (key, bucket, hit_count, first_hit_at, last_hit_at)
            VALUES (%s, %s, 1, NOW(), NOW())
            ON CONFLICT (key, bucket) DO UPDATE SET
                hit_count = CASE
                    WHEN {schema}.rate_limits.blocked_until IS NOT NULL
                         AND {schema}.rate_limits.blocked_until > NOW() THEN {schema}.rate_limits.hit_count
                    WHEN EXTRACT(EPOCH FROM (NOW() - {schema}.rate_limits.first_hit_at)) > %s THEN 1
                    ELSE {schema}.rate_limits.hit_count + 1
                END,
                first_hit_at = CASE
                    WHEN EXTRACT(EPOCH FROM (NOW() - {schema}.rate_limits.first_hit_at)) > %s THEN NOW()
                    ELSE {schema}.rate_limits.first_hit_at
                END,
                last_hit_at = NOW(),
                blocked_until = CASE
                    WHEN EXTRACT(EPOCH FROM (NOW() - {schema}.rate_limits.first_hit_at)) > %s THEN NULL
                    ELSE {schema}.rate_limits.blocked_until
                END
            RETURNING hit_count, blocked_until""",
        (key, bucket, window_seconds, window_seconds, window_seconds),
    )
    row = cur.fetchone()
    hit_count, blocked_until = row
    now = datetime.now()
    if blocked_until and blocked_until > now:
        conn.commit()
        return False, max(int((blocked_until - now).total_seconds()), 1)
    if hit_count > max_hits:
        cur.execute(
            f"UPDATE {schema}.rate_limits SET blocked_until = NOW() + (%s || ' seconds')::INTERVAL WHERE key = %s AND bucket = %s",
            (window_seconds, key, bucket),
        )
        conn.commit()
        return False, window_seconds
    conn.commit()
    return True, 0


def rate_limit_response(retry_after: int, request_id: str, reason: str, origin=None):
    """429 Too Many Requests с CORS-whitelist + Retry-After."""
    return {
        "statusCode": 429,
        "headers": {
            **cors_headers(origin),
            "Content-Type": "application/json",
            "Retry-After": str(retry_after),
            "X-Request-Id": request_id,
        },
        "body": json.dumps({
            "ok": False,
            "request_id": request_id,
            "error": {"code": "rate_limit_exceeded", "message": f"{reason} Повторите через {retry_after} сек.", "retry_after": retry_after},
        }, ensure_ascii=False),
    }


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


def call_yandex_gpt(messages: list) -> str:
    api_key = os.environ.get("YANDEX_GPT_API_KEY", "")
    folder_id = os.environ.get("YANDEX_FOLDER_ID", "")
    if not api_key or not folder_id:
        return "[AI недоступен: добавьте YANDEX_GPT_API_KEY и YANDEX_FOLDER_ID в настройках проекта.]"

    import urllib.request

    # Конвертируем формат сообщений в YandexGPT
    yandex_messages = []
    for m in messages:
        role = m["role"]
        if role == "system":
            role = "system"
        elif role == "assistant":
            role = "assistant"
        else:
            role = "user"
        yandex_messages.append({"role": role, "text": m["content"]})

    payload = json.dumps({
        "modelUri": f"gpt://{folder_id}/yandexgpt/latest",
        "completionOptions": {
            "stream": False,
            "temperature": 0.7,
            "maxTokens": 8000,
        },
        "messages": yandex_messages,
    }).encode()

    req = urllib.request.Request(
        "https://llm.api.cloud.yandex.net/foundationModels/v1/completion",
        data=payload,
        headers={
            "Authorization": f"Api-Key {api_key}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            result = json.loads(resp.read())
            return result["result"]["alternatives"][0]["message"]["text"]
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="ignore")
        return f"[Ошибка YandexGPT {e.code}: {body[:300]}]"
    except Exception as e:
        return f"[Ошибка AI: {e}]"


def web_search_simple(query: str, limit: int = 5) -> list:
    """Дополнение материалами из интернета через DuckDuckGo HTML."""
    import urllib.request as _r
    import urllib.parse as _p
    import re as _re
    try:
        encoded = _p.quote(query)
        url = f"https://html.duckduckgo.com/html/?q={encoded}"
        req = _r.Request(url, headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        })
        with _r.urlopen(req, timeout=15) as resp:
            html = resp.read().decode("utf-8", errors="ignore")
        results = []
        pattern = _re.compile(
            r'<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>(.*?)</a>.*?'
            r'<a[^>]+class="result__snippet"[^>]*>(.*?)</a>',
            _re.DOTALL
        )
        for m in pattern.finditer(html):
            if len(results) >= limit:
                break
            link = m.group(1)
            title = _re.sub(r'<[^>]+>', '', m.group(2)).strip()
            snippet = _re.sub(r'<[^>]+>', '', m.group(3)).strip()
            if link.startswith("//duckduckgo.com/l/?uddg="):
                try:
                    link = _p.unquote(link.split("uddg=")[1].split("&")[0])
                except Exception:
                    pass
            if title and snippet:
                results.append({"title": title[:200], "snippet": snippet[:400], "url": link})
        return results
    except Exception:
        return []


def build_system_prompt(task: dict, documents: list, web_results: list = None) -> str:
    parts = ["Ты — профессиональный AI-ассистент для подготовки презентаций и учебных работ."]
    parts.append(f"Задание: {task['task_type']}")
    if task.get("topic"):
        parts.append(f"Тема: {task['topic']}")
    if task.get("goal"):
        parts.append(f"Цель: {task['goal']}")
    if task.get("audience"):
        parts.append(f"Аудитория: {task['audience']}")
    if task.get("style"):
        parts.append(f"Стиль: {task['style']}")
    if task.get("requested_slide_count"):
        parts.append(f"Желаемое число слайдов: {task['requested_slide_count']}")
    parts.append(f"Язык ответа: {task.get('language', 'ru')}")
    parts.append("")

    # P0 (этап 0.5): structured orchestration по ролям документов.
    # Принцип: AI получает документы НЕ единым мешком, а с явной иерархией:
    #   1. STANDARD       — высший приоритет, обязательно соблюдать
    #   2. CONTENT        — источник фактов, тезисов и формулировок
    #   3. METHODOLOGY    — логика и подход (как делать)
    #   4. TEMPLATE       — ТОЛЬКО формат / композиция / стиль (НЕ содержание)
    #   5. BACKGROUND     — фоновый контекст, использовать осторожно

    # Группируем документы по ролям
    by_role = {
        "standard": [],
        "content": [],
        "methodology": [],
        "template": [],
        "background": [],
    }
    legacy_role_map = {
        # Совместимость со старыми именами ролей
        "reference_presentation": "template",
        "content_source": "content",
        "draft": "content",
    }
    for doc in documents:
        role = doc.get("role", "")
        if role == "excluded":
            continue
        role = legacy_role_map.get(role, role)
        if role not in by_role:
            role = "background"
        by_role[role].append(doc)

    # Чёткая инструкция AI о ролях и приоритетах
    parts.append("=" * 60)
    parts.append("ВАЖНО: ИЕРАРХИЯ ИСПОЛЬЗОВАНИЯ ДОКУМЕНТОВ")
    parts.append("=" * 60)
    parts.append("""Документы имеют РОЛИ. Используй их строго по назначению:

1️⃣ STANDARD (стандарты, нормативы) — ВЫСШИЙ ПРИОРИТЕТ.
   Из них берётся СТРУКТУРА результата, обязательные разделы, требования к оформлению.
   При конфликте с любым другим документом — побеждает STANDARD.

2️⃣ CONTENT (содержательные материалы пользователя) — ВЫСОКИЙ ПРИОРИТЕТ.
   Из них берутся ФАКТЫ, тезисы, формулировки, аргументы.
   Это «мясо» результата.

3️⃣ METHODOLOGY (методики, guideline) — СРЕДНИЙ ПРИОРИТЕТ.
   Из них берётся ЛОГИКА построения, методы аргументации.

4️⃣ TEMPLATE (шаблоны, образцы формата) — НИЗКИЙ ПРИОРИТЕТ для содержания.
   ⚠️ ИЗ TEMPLATE БЕРИ ТОЛЬКО: формат, композицию, стиль подачи, длину блоков, уровень детализации.
   ⛔ НЕ КОПИРУЙ из TEMPLATE: содержательные тезисы, факты, вехи, выводы — они относятся к ЧУЖОЙ работе.

5️⃣ BACKGROUND (фоновый контекст) — низший приоритет, использовать только при необходимости.

ПРАВИЛО КОНФЛИКТА: STANDARD > CONTENT > METHODOLOGY > TEMPLATE > BACKGROUND.
""")
    parts.append("")

    # Выкладываем документы по ролям с явными метками
    role_blocks = [
        ("standard", "📜 STANDARD — НОРМАТИВНЫЕ ДОКУМЕНТЫ (структура и требования)"),
        ("content", "📚 CONTENT — СОДЕРЖАТЕЛЬНЫЕ МАТЕРИАЛЫ (факты, тезисы, формулировки)"),
        ("methodology", "🧭 METHODOLOGY — МЕТОДИКИ (логика, подход)"),
        ("template", "🎨 TEMPLATE — ОБРАЗЦЫ ФОРМАТА (ТОЛЬКО формат, НЕ содержание!)"),
        ("background", "📎 BACKGROUND — ФОНОВЫЙ КОНТЕКСТ"),
    ]
    for role_key, role_header in role_blocks:
        docs_in_role = by_role[role_key]
        if not docs_in_role:
            continue
        parts.append("=" * 60)
        parts.append(role_header)
        parts.append("=" * 60)
        for doc in docs_in_role:
            priority = doc.get("priority", "medium")
            must_use = doc.get("must_use", False)
            usage_mode = doc.get("usage_mode", "")
            user_instruction = doc.get("instruction", "")
            mark_must = "🔴 ОБЯЗАТЕЛЬНЫЙ" if must_use else ""
            mark_priority = f"приоритет: {priority}"
            parts.append(f"--- {doc['name']} ({mark_priority}) {mark_must} ---")
            if usage_mode:
                parts.append(f"Режим использования: {usage_mode}")
            if user_instruction:
                parts.append(f"📝 Инструкция пользователя: {user_instruction}")

            if role_key == "template" and doc.get("structure"):
                # Для шаблонов — показываем только структуру, без полного контента
                parts.append("Структура (бери только её, НЕ содержание!):")
                for s in doc["structure"][:25]:
                    parts.append(f"  • Слайд {s['index']}: {s['title']}")
                # Из шаблонов берём только КОРОТКИЙ фрагмент текста — чтобы видеть стиль, но не вехи
                text_preview = (doc.get("text") or "")[:2000]
                if text_preview:
                    parts.append(f"\nКраткий пример стиля (для тона, НЕ для копирования содержания):\n{text_preview}")
            else:
                # Для standard / content / methodology / background — больше текста
                text = (doc.get("text") or "")[:15000]
                parts.append(text)
            parts.append("")

    # Веб-результаты
    if web_results:
        parts.append("=" * 60)
        parts.append("🌐 ДОПОЛНЕНИЯ ИЗ ИНТЕРНЕТА (вспомогательно)")
        parts.append("=" * 60)
        for i, r in enumerate(web_results, 1):
            parts.append(f"{i}. {r.get('title', '')}")
            parts.append(f"   {r.get('snippet', '')}")
            parts.append(f"   Источник: {r.get('url', '')}")
        parts.append("")

    parts.append("""ПРИ ГЕНЕРАЦИИ:
1. Сначала возьми СТРУКТУРУ из документов с ролью STANDARD (если есть).
2. Затем НАПОЛНИ её содержанием из документов с ролью CONTENT.
3. Применяй ЛОГИКУ из METHODOLOGY.
4. Перенеси ФОРМАТ / стиль / композицию из TEMPLATE — но НЕ содержательные тезисы из них.
5. Каждый раздел/слайд/абзац помечай источником в квадратных скобках:
   [из стандарта: <название>]
   [из материалов: <название>]
   [по методике: <название>]
   [формат по образцу: <название>]
   [предложено AI]
6. В КОНЦЕ результата добавь блок «🗺 КАРТА ВЛИЯНИЯ ДОКУМЕНТОВ» в формате:
   - Структура → из <названия standard-документа>
   - Контент → из <названий content-документов>
   - Формат → из <названия template-документа>
   - Дополнения AI → перечисли

7. В САМОМ КОНЦЕ ОТВЕТА (после всего!) добавь блок JSON в следующем формате — это машинная карта влияния для UI:

```json INFLUENCE_MAP
{
  "structure_from": ["название документа из STANDARD"],
  "content_from": ["названия документов из CONTENT"],
  "methodology_from": ["названия методичек"],
  "format_from": ["название образца"],
  "background_from": ["фоновые документы"],
  "ignored": ["документы которые не использовал — с причиной"],
  "ai_additions": ["краткое описание что добавлено самим AI"],
  "conflicts_resolved": ["описание конфликтов и как решено по иерархии"]
}
```

ВАЖНО: JSON-блок должен быть валидным, без комментариев. Если документа какой-то роли нет — пустой массив [].
""")

    return "\n".join(parts)


TASK_TYPE_PROMPTS = {
    "answer_question": "Ответь на вопрос пользователя опираясь только на загруженные документы. Укажи источник каждого тезиса.",
    "analyze": "Проанализируй загруженные материалы. Выдели ключевые идеи, структуру, выводы. Укажи из каких документов что взято.",
    "structure": "Предложи 2-3 варианта структуры презентации по заданной теме. Для каждого варианта: список слайдов с заголовками и краткой логикой. Учти стандарт и образец если заданы.",
    "write_text": "Напиши полноценный текст работы по теме. Используй все загруженные материалы. Структура: введение, основные разделы, выводы.",
    "prepare_presentation": "Создай полную презентацию. Для каждого слайда: номер, заголовок, буллеты (3-5 пунктов), краткая мысль слайда, заметки спикера. В конце — отчёт о покрытии стандарта.",
    "presentation_by_reference": "Создай новую презентацию по форме референсной презентации. Сохрани логику, структуру и стиль подачи образца. Наполни новым содержанием по теме, используя загруженные материалы и соблюдая стандарт. Для каждого слайда: номер, заголовок, буллеты, заметки спикера. В конце — блок прозрачности: что из образца, что из стандарта, что из материалов, что предложено AI.",
    "revise": "Переработай результат согласно инструкции пользователя. Чётко укажи что изменено, что осталось. Выдай обновлённую версию.",
}


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
    conn = get_db()
    schema = get_schema()
    path_parts = path.strip("/").split("/")

    try:
        user = get_current_user(conn, session_id)
        if not user:
            return json_response({"error": "Не авторизован"}, 401, origin=origin)

        cur = conn.cursor()

        # === Explainable AI endpoints ===

        # POST action=explain_block — AI объясняет откуда и почему этот блок
        if method == "POST" and body.get("action") == "explain_block":
            run_id = body.get("run_id")
            block_text = body.get("block_text", "").strip()
            if not run_id or not block_text:
                return json_response({"error": "Нужны run_id и block_text"}, 400, origin=origin)

            # Изоляция: достаём run и проверяем доступ к проекту
            cur.execute(
                f"""SELECT gr.task_id, t.project_id, t.topic, t.title
                    FROM {schema}.generation_runs gr
                    JOIN {schema}.tasks t ON t.id = gr.task_id
                    WHERE gr.id = %s""",
                (int(run_id),),
            )
            row = cur.fetchone()
            if not row:
                return json_response({"error": "Не найдено"}, 404, origin=origin)
            task_id, project_id, topic, task_title = row
            cur.execute(
                f"SELECT role FROM {schema}.project_members WHERE project_id = %s AND user_id = %s",
                (project_id, user["id"]),
            )
            if not cur.fetchone():
                return json_response({"error": "Нет доступа"}, 403, origin=origin)

            # Собираем источники: документы задания с ролями + их фрагменты
            cur.execute(
                f"""SELECT td.role, d.original_name, d.extracted_text, d.id
                    FROM {schema}.task_documents td
                    JOIN {schema}.documents d ON d.id = td.document_id
                    WHERE td.task_id = %s AND d.archived_at IS NULL""",
                (task_id,),
            )
            docs = cur.fetchall()

            sources_context = []
            for role, name, text, doc_id in docs:
                role_label = {
                    "standard": "СТАНДАРТ",
                    "reference_presentation": "ОБРАЗЕЦ",
                    "content_source": "МАТЕРИАЛ",
                    "draft": "ЧЕРНОВИК",
                }.get(role, role.upper())
                sources_context.append(f"--- {role_label}: {name} (id={doc_id}) ---\n{(text or '')[:4000]}")

            sources_text = "\n\n".join(sources_context) if sources_context else "(нет приложенных документов)"

            explain_prompt = f"""Тебя просят объяснить происхождение конкретного фрагмента сгенерированной презентации/работы.

ТЕМА ЗАДАНИЯ: {topic or task_title}

ИСТОЧНИКИ (документы пользователя):
{sources_text}

ФРАГМЕНТ КОТОРЫЙ НУЖНО ОБЪЯСНИТЬ:
\"\"\"
{block_text[:3000]}
\"\"\"

Объясни ЧЁТКО и КРАТКО (3-7 предложений):
1. Откуда взяты конкретные факты/формулировки (укажи название документа из источников выше или скажи что это твоя интерпретация/общеизвестные знания)
2. Почему именно так сформулировано (логика, требование стандарта, копирование структуры образца)
3. Что можно проверить/уточнить у пользователя

Формат: обычный текст без markdown. Если есть прямые цитаты из документов — указывай их в кавычках с пометкой [из {{name}}].
"""

            answer = call_yandex_gpt([
                {"role": "system", "content": "Ты — explainable AI. Отвечаешь короткими прозрачными обоснованиями откуда что взято."},
                {"role": "user", "content": explain_prompt},
            ])

            return json_response({"explanation": answer, "block_text": block_text[:500]}, origin=origin)

        # POST action=refine_block — AI перерабатывает только указанный фрагмент с правкой
        if method == "POST" and body.get("action") == "refine_block":
            run_id = body.get("run_id")
            block_text = body.get("block_text", "").strip()
            instruction = body.get("instruction", "").strip()
            if not run_id or not block_text or not instruction:
                return json_response({"error": "Нужны run_id, block_text и instruction"}, 400, origin=origin)

            cur.execute(
                f"""SELECT gr.task_id, gr.result_json, t.project_id, t.topic
                    FROM {schema}.generation_runs gr
                    JOIN {schema}.tasks t ON t.id = gr.task_id
                    WHERE gr.id = %s""",
                (int(run_id),),
            )
            row = cur.fetchone()
            if not row:
                return json_response({"error": "Не найдено"}, 404, origin=origin)
            task_id, result_json, project_id, topic = row
            cur.execute(
                f"SELECT role FROM {schema}.project_members WHERE project_id = %s AND user_id = %s",
                (project_id, user["id"]),
            )
            if not cur.fetchone():
                return json_response({"error": "Нет доступа"}, 403, origin=origin)

            # Получаем источники для контекста
            cur.execute(
                f"""SELECT td.role, d.original_name, d.extracted_text
                    FROM {schema}.task_documents td
                    JOIN {schema}.documents d ON d.id = td.document_id
                    WHERE td.task_id = %s AND td.role != 'excluded' AND d.archived_at IS NULL""",
                (task_id,),
            )
            docs = cur.fetchall()
            sources_text = "\n\n".join(
                f"[{role.upper()}: {name}]\n{(text or '')[:3000]}"
                for role, name, text in docs
            ) or "(нет документов)"

            refine_prompt = f"""Тебя просят переработать ТОЛЬКО ОДИН ФРАГМЕНТ работы по указанию пользователя.
Не трогай остальную работу. Верни ТОЛЬКО переработанный фрагмент — без пояснений, без префиксов.

ТЕМА: {topic or ''}

ИСТОЧНИКИ:
{sources_text}

ИСХОДНЫЙ ФРАГМЕНТ:
\"\"\"
{block_text[:3000]}
\"\"\"

УКАЗАНИЕ ПОЛЬЗОВАТЕЛЯ:
{instruction[:1000]}

Переработанный фрагмент (сохрани формат, стиль, метки [из материалов]/[из образца]/[предложено AI] если они были):"""

            new_block = call_yandex_gpt([
                {"role": "system", "content": "Ты редактируешь ТОЛЬКО указанный фрагмент. Возвращаешь только новый текст этого фрагмента, ничего другого."},
                {"role": "user", "content": refine_prompt},
            ])

            # Подставляем новый фрагмент в полный результат
            try:
                full_result = json.loads(result_json) if result_json else {}
                full_content = full_result.get("content", "")
                new_full_content = full_content.replace(block_text, new_block, 1)

                # Создаём новую версию
                cur.execute(
                    f"SELECT COALESCE(MAX(version_number), 0) FROM {schema}.generation_runs WHERE task_id = %s",
                    (task_id,),
                )
                new_version = cur.fetchone()[0] + 1

                new_result_json = json.dumps({"content": new_full_content, "version": new_version, "refined_from": int(run_id)}, ensure_ascii=False)
                summary = f"Локальная правка фрагмента (v{new_version}): {instruction[:120]}"

                cur.execute(
                    f"""INSERT INTO {schema}.generation_runs
                        (task_id, created_by, version_number, input_prompt, result_json, output_summary, status)
                        VALUES (%s, %s, %s, %s, %s, %s, 'done') RETURNING id""",
                    (task_id, user["id"], new_version, f"REFINE_BLOCK: {instruction}", new_result_json, summary),
                )
                new_run_id = cur.fetchone()[0]

                # Сохраняем как revision
                cur.execute(
                    f"INSERT INTO {schema}.revisions (generation_run_id, user_id, instruction_text, scope) VALUES (%s, %s, %s, 'block')",
                    (new_run_id, user["id"], instruction),
                )

                # Лог активности
                cur.execute(
                    f"INSERT INTO {schema}.activity_log (project_id, user_id, action, entity_type, entity_id, details) VALUES (%s, %s, %s, %s, %s, %s)",
                    (project_id, user["id"], "refined_block", "generation_run", new_run_id, instruction[:200]),
                )
                conn.commit()

                return json_response({
                    "new_run_id": new_run_id,
                    "new_version": new_version,
                    "new_block": new_block,
                    "full_content": new_full_content,
                }, origin=origin)
            except Exception as e:
                return json_response({"error": f"Не удалось применить правку: {e}"}, 500, origin=origin)

        # POST /run или POST / с task_id — запустить генерацию (не если это get_run/explain/refine)
        special_actions = {"get_run", "explain_block", "refine_block"}
        if method == "POST" and body.get("action") not in special_actions and (path_parts[-1] == "run" or body.get("task_id")):
            task_id = body.get("task_id")
            user_prompt = body.get("prompt", "")

            if not task_id:
                return json_response({"error": "Нужен task_id"}, 400, origin=origin)

            # Rate limit: 10 генераций / минуту на пользователя
            # Генерации дорогие (yandex GPT) и долгие — защита от спама/абьюза
            request_id_rl = secrets.token_hex(8)
            allowed, retry_after = check_rate_limit(
                conn, schema, key=f"generate:{user['id']}", bucket="generate_user",
                max_hits=10, window_seconds=60,
            )
            if not allowed:
                return rate_limit_response(retry_after, request_id_rl, "Слишком много запросов на генерацию.", origin=origin)

            # Загрузить задание
            cur.execute(
                f"""SELECT t.id, t.project_id, t.title, t.task_type, t.topic, t.goal, t.audience,
                    t.language, t.style, t.requested_slide_count, t.additional_instructions
                    FROM {schema}.tasks t WHERE t.id = %s""",
                (task_id,),
            )
            task_row = cur.fetchone()
            if not task_row:
                return json_response({"error": "Задание не найдено"}, 404, origin=origin)

            task = {
                "id": task_row[0], "project_id": task_row[1], "title": task_row[2],
                "task_type": task_row[3], "topic": task_row[4], "goal": task_row[5],
                "audience": task_row[6], "language": task_row[7], "style": task_row[8],
                "requested_slide_count": task_row[9], "additional_instructions": task_row[10],
            }

            cur.execute(
                f"SELECT role FROM {schema}.project_members WHERE project_id = %s AND user_id = %s",
                (task["project_id"], user["id"]),
            )
            if not cur.fetchone():
                return json_response({"error": "Нет доступа"}, 403, origin=origin)

            # Загрузить документы задания с метаданными orchestration (P0)
            cur.execute(
                f"""SELECT td.document_id, td.role, d.original_name, d.file_type,
                    d.extracted_text, d.structure_json,
                    td.usage_mode, td.priority, td.must_use, td.instruction
                    FROM {schema}.task_documents td
                    JOIN {schema}.documents d ON d.id = td.document_id
                    WHERE td.task_id = %s AND td.role != 'excluded' AND d.archived_at IS NULL""",
                (task_id,),
            )
            documents = []
            for r in cur.fetchall():
                structure = None
                if r[5]:
                    try:
                        structure = json.loads(r[5])
                    except Exception:
                        pass
                documents.append({
                    "id": r[0], "role": r[1], "name": r[2],
                    "file_type": r[3], "text": r[4], "structure": structure,
                    "usage_mode": r[6], "priority": r[7] or "medium",
                    "must_use": bool(r[8]), "instruction": r[9] or "",
                })

            # P0: валидация must_use — если обязательный документ пуст/не распарсился,
            # возвращаем ошибку, не запускаем генерацию (это потеря источника правды)
            missing_must_use = []
            for d in documents:
                if d["must_use"]:
                    text = (d.get("text") or "").strip()
                    if not text or text.startswith("[Ошибка"):
                        missing_must_use.append(d["name"])
            if missing_must_use:
                return json_response({
                    "error": "Не удалось использовать обязательные документы: " + ", ".join(missing_must_use)
                            + ". Проверьте файлы (пустые / не распарсились) или снимите флаг «Обязательный»."
                }, 400, origin=origin)

            # Определить номер версии
            cur.execute(
                f"SELECT COALESCE(MAX(version_number), 0) FROM {schema}.generation_runs WHERE task_id = %s",
                (task_id,),
            )
            last_version = cur.fetchone()[0]
            version_number = last_version + 1

            # Веб-поиск (опционально по запросу пользователя)
            web_results = []
            use_web = body.get("use_web_search", False)
            if use_web and task.get("topic"):
                web_results = web_search_simple(task["topic"], limit=5)
                # Сохраняем в БД для прозрачности источников
                if web_results:
                    cur.execute(
                        f"INSERT INTO {schema}.web_search_results (task_id, query, results_json) VALUES (%s, %s, %s)",
                        (task_id, task["topic"], json.dumps(web_results, ensure_ascii=False)),
                    )
                    conn.commit()

            # Построить промпты
            system_prompt = build_system_prompt(task, documents, web_results)
            task_instruction = TASK_TYPE_PROMPTS.get(task["task_type"], "Выполни задание.")

            if task.get("additional_instructions"):
                task_instruction += f"\nДополнительно: {task['additional_instructions']}"

            final_user_prompt = user_prompt if user_prompt else task_instruction

            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": final_user_prompt},
            ]

            # Для ревизии — добавить предыдущий результат
            if task["task_type"] == "revise" or body.get("revision_of"):
                prev_run_id = body.get("revision_of")
                if prev_run_id:
                    cur.execute(
                        f"SELECT result_json FROM {schema}.generation_runs WHERE id = %s",
                        (prev_run_id,),
                    )
                    prev = cur.fetchone()
                    if prev and prev[0]:
                        try:
                            prev_result = json.loads(prev[0])
                            prev_text = prev_result.get("content", "")[:6000]
                            messages.insert(1, {
                                "role": "assistant",
                                "content": prev_text,
                            })
                        except Exception:
                            pass

            # Создать запись run
            cur.execute(
                f"""INSERT INTO {schema}.generation_runs
                    (task_id, created_by, version_number, input_prompt, system_constraints, status)
                    VALUES (%s, %s, %s, %s, %s, 'running') RETURNING id""",
                (task_id, user["id"], version_number, final_user_prompt, system_prompt[:2000]),
            )
            run_id = cur.fetchone()[0]
            conn.commit()

            # Вызов AI
            ai_result = call_yandex_gpt(messages)

            # P0: извлекаем INFLUENCE_MAP JSON если AI его добавил
            influence_map = None
            import re as _re
            map_match = _re.search(r"```json\s*INFLUENCE_MAP\s*(\{.*?\})\s*```", ai_result, _re.DOTALL)
            if map_match:
                try:
                    influence_map = json.loads(map_match.group(1))
                    ai_result = ai_result[:map_match.start()].rstrip() + "\n" + ai_result[map_match.end():].lstrip()
                except Exception:
                    pass

            # ================================================================
            # VISUAL PIPELINE: собираем visual_plan из документов + инструкций
            # ================================================================
            use_visuals = body.get("use_visuals", True)
            allow_ai_images = body.get("allow_ai_images", True)
            visual_plan = []
            visual_warnings = []

            if use_visuals:
                try:
                    from visual_parser import (
                        collect_visual_prompts_from_documents,
                        collect_visual_prompts_from_task,
                        build_visual_plan_entry,
                    )

                    # Собираем все промпты
                    raw_prompts = collect_visual_prompts_from_task(task)
                    raw_prompts += collect_visual_prompts_from_documents(documents)

                    if raw_prompts:
                        # Привязываем к слайдам через AI
                        # Передаём AI outline + промпты → получаем slide_index для каждого
                        slide_outline = ai_result[:3000]
                        prompts_txt = "\n".join(
                            f"{i+1}. [{p['visual_type'].upper()}] {p['source_prompt'][:120]}"
                            for i, p in enumerate(raw_prompts)
                        )
                        mapping_prompt = (
                            f"Вот план презентации (начало):\n{slide_outline}\n\n"
                            f"Вот список визуальных промптов:\n{prompts_txt}\n\n"
                            "Для каждого промпта укажи, на каком слайде (slide_index, начиная с 1) "
                            "он лучше всего подходит. Ответь ТОЛЬКО JSON массивом, без пояснений: "
                            '[{"prompt_index":1,"slide_index":2,"slide_title":"Название слайда"},...]\n'
                            "Если промпт не подходит ни к одному слайду — slide_index=0."
                        )
                        mapping_json_str = call_yandex_gpt([
                            {"role": "system", "content": "Ты — помощник по привязке визуальных элементов к слайдам."},
                            {"role": "user", "content": mapping_prompt},
                        ])
                        # Парсим JSON из ответа AI
                        mapping = []
                        try:
                            json_match = _re.search(r'\[.*?\]', mapping_json_str, _re.DOTALL)
                            if json_match:
                                mapping = json.loads(json_match.group(0))
                        except Exception:
                            pass

                        # Строим visual_plan
                        for entry in mapping:
                            pi = int(entry.get("prompt_index", 1)) - 1
                            si = int(entry.get("slide_index", 0))
                            if si > 0 and 0 <= pi < len(raw_prompts):
                                p = raw_prompts[pi]
                                # Пропускаем ai_image если не разрешено
                                if p["render_mode"] == "ai_image" and not allow_ai_images:
                                    visual_warnings.append(f"Пропущено изображение (отключено): {p['source_prompt'][:60]}")
                                    continue
                                visual_plan.append(build_visual_plan_entry(
                                    slide_index=si,
                                    slide_title=entry.get("slide_title", f"Слайд {si}"),
                                    prompt_obj=p,
                                ))

                        # Рендерим картинки (ai_image) немедленно
                        if allow_ai_images:
                            try:
                                from visual_renderer import render_image
                                for vp in visual_plan:
                                    if vp["render_mode"] == "ai_image" and vp["generation_status"] == "pending":
                                        s3_key = f"visuals/{user['id']}/{run_id}_slide{vp['slide_index']}.png"
                                        result_img = render_image(vp["source_prompt"], s3_key)
                                        if result_img.get("ok"):
                                            vp["generation_status"] = "done"
                                            vp["asset_s3_key"] = result_img["s3_key"]
                                            vp["asset_url"] = result_img["asset_url"]
                                        else:
                                            vp["generation_status"] = "failed"
                                            vp["warnings"].append(result_img.get("warning", "Ошибка генерации"))
                                            visual_warnings.append(f"Слайд {vp['slide_index']}: {result_img.get('warning','')}")
                            except Exception as e:
                                visual_warnings.append(f"Image render error: {str(e)[:100]}")

                        # Схемы помечаем как pending_render (рендерятся при экспорте)
                        for vp in visual_plan:
                            if vp["render_mode"] == "pptx_shapes" and vp["generation_status"] == "pending":
                                vp["generation_status"] = "pending_render"

                except Exception as e:
                    visual_warnings.append(f"Visual pipeline error: {str(e)[:100]}")

            # Сохранить результат
            result_payload = {"content": ai_result, "version": version_number}
            if influence_map:
                result_payload["influence_map"] = influence_map
            if visual_plan:
                result_payload["visual_plan"] = visual_plan
            if visual_warnings:
                result_payload["visual_warnings"] = visual_warnings
            result_json = json.dumps(result_payload, ensure_ascii=False)
            summary = ai_result[:300] + "..." if len(ai_result) > 300 else ai_result

            cur.execute(
                f"""UPDATE {schema}.generation_runs
                    SET result_json = %s, output_summary = %s, status = 'done'
                    WHERE id = %s""",
                (result_json, summary, run_id),
            )
            cur.execute(
                f"UPDATE {schema}.tasks SET status = 'active', updated_at = NOW() WHERE id = %s",
                (task_id,),
            )

            # Сохранить ревизию если есть
            if body.get("revision_of") and user_prompt:
                cur.execute(
                    f"INSERT INTO {schema}.revisions (generation_run_id, user_id, instruction_text) VALUES (%s, %s, %s)",
                    (run_id, user["id"], user_prompt),
                )

            log_activity(cur, schema, task["project_id"], user["id"], "generated", "generation_run", run_id, f"v{version_number}")
            conn.commit()

            return json_response({
                "run_id": run_id,
                "version": version_number,
                "content": ai_result,
            }, origin=origin)

        # POST action=get_run или GET /run/{N} — получить результат генерации
        qs = event.get("queryStringParameters") or {}
        run_id_q = qs.get("run_id")
        body_rid = body.get("run_id") if body.get("action") == "get_run" else None
        if (method == "GET" and ((len(path_parts) >= 2 and path_parts[-2] == "run") or run_id_q)) or body_rid:
            if body_rid:
                run_id = int(body_rid)
            elif run_id_q:
                run_id = int(run_id_q)
            else:
                run_id = int(path_parts[-1])
            cur.execute(
                f"""SELECT gr.id, gr.task_id, gr.version_number, gr.result_json, gr.output_summary, gr.status, gr.created_at, u.name, t.project_id
                    FROM {schema}.generation_runs gr
                    JOIN {schema}.users u ON u.id = gr.created_by
                    JOIN {schema}.tasks t ON t.id = gr.task_id
                    WHERE gr.id = %s""",
                (run_id,),
            )
            row = cur.fetchone()
            if not row:
                return json_response({"error": "Не найдено"}, 404, origin=origin)

            # 🔒 ИЗОЛЯЦИЯ: проверяем доступ к проекту, к которому относится task
            project_id_of_run = row[8]
            cur.execute(
                f"SELECT role FROM {schema}.project_members WHERE project_id = %s AND user_id = %s",
                (project_id_of_run, user["id"]),
            )
            if not cur.fetchone():
                return json_response({"error": "Нет доступа"}, 403, origin=origin)

            result_content = None
            influence_map = None
            visual_plan_out = None
            visual_warnings_out = None
            if row[3]:
                try:
                    parsed = json.loads(row[3])
                    result_content = parsed.get("content")
                    influence_map = parsed.get("influence_map")
                    visual_plan_out = parsed.get("visual_plan")
                    visual_warnings_out = parsed.get("visual_warnings")
                except Exception:
                    pass

            # Ревизии
            cur.execute(
                f"SELECT instruction_text, created_at FROM {schema}.revisions WHERE generation_run_id = %s ORDER BY created_at",
                (run_id,),
            )
            revisions = [{"instruction": r[0], "created_at": str(r[1])} for r in cur.fetchall()]

            return json_response({
                "id": row[0], "task_id": row[1], "version": row[2],
                "content": result_content, "summary": row[4],
                "status": row[5], "created_at": str(row[6]),
                "created_by": row[7], "revisions": revisions,
                "influence_map": influence_map,
                "visual_plan": visual_plan_out,
                "visual_warnings": visual_warnings_out,
            }, origin=origin)

        # action=render_visual — перегенерировать один визуал
        if body.get("action") == "render_visual":
            run_id = int(body.get("run_id"))
            slide_index = int(body.get("slide_index", 0))
            new_prompt = body.get("prompt", "").strip()

            cur.execute(
                f"""SELECT gr.result_json, t.project_id
                    FROM {schema}.generation_runs gr
                    JOIN {schema}.tasks t ON t.id = gr.task_id
                    WHERE gr.id = %s""",
                (run_id,),
            )
            rrow = cur.fetchone()
            if not rrow:
                return json_response({"error": "Run не найден"}, 404, origin=origin)

            cur.execute(
                f"SELECT role FROM {schema}.project_members WHERE project_id = %s AND user_id = %s",
                (rrow[1], user["id"]),
            )
            if not cur.fetchone():
                return json_response({"error": "Нет доступа"}, 403, origin=origin)

            rj = {}
            try:
                rj = json.loads(rrow[0]) if rrow[0] else {}
            except Exception:
                pass

            vplan = rj.get("visual_plan") or []
            target = None
            for vp in vplan:
                if int(vp.get("slide_index", -1)) == slide_index:
                    target = vp
                    break

            if not target:
                return json_response({"error": "Визуал не найден"}, 404, origin=origin)

            if new_prompt:
                target["source_prompt"] = new_prompt
                target["normalized_prompt"] = new_prompt

            render_mode = target.get("render_mode", "ai_image")
            visual_type = target.get("visual_type", "image")
            prompt = target.get("source_prompt", "")

            if render_mode == "ai_image":
                try:
                    from visual_renderer import render_image
                    s3_key = f"visuals/{user['id']}/{run_id}_slide{slide_index}_rerend.png"
                    res = render_image(prompt, s3_key)
                    if res.get("ok"):
                        target["generation_status"] = "done"
                        target["asset_s3_key"] = res["s3_key"]
                        target["asset_url"] = res["asset_url"]
                        target["warnings"] = []
                    else:
                        target["generation_status"] = "failed"
                        target["warnings"] = [res.get("warning", "Ошибка")]
                except Exception as e:
                    target["generation_status"] = "failed"
                    target["warnings"] = [str(e)[:100]]
            else:
                # pptx_shapes — при экспорте отрисуется, ставим ready
                target["generation_status"] = "pending_render"
                target["warnings"] = []

            rj["visual_plan"] = vplan
            cur.execute(
                f"UPDATE {schema}.generation_runs SET result_json = %s WHERE id = %s",
                (json.dumps(rj, ensure_ascii=False), run_id),
            )
            conn.commit()
            return json_response({"ok": True, "visual": target}, origin=origin)

        return json_response({"error": "Not found"}, 404, origin=origin)

    finally:
        conn.close()