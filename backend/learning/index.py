import json
import os
import psycopg2
import re
import threading
import urllib.parse
import urllib.request

DB = os.environ["DATABASE_URL"]
SCHEMA = os.environ.get("MAIN_DB_SCHEMA", "public")
YANDEX_GPT_API_KEY = os.environ.get("YANDEX_GPT_API_KEY", "")
YANDEX_FOLDER_ID = os.environ.get("YANDEX_FOLDER_ID", "")
BRIDGE_URL   = os.environ.get("LEARNING_BRIDGE_URL", "https://functions.poehali.dev/e74b5863-44f8-4ddf-b5b8-6f9dd33434b4")
BRIDGE_TOKEN = os.environ.get("BRIDGE_SERVICE_TOKEN", "")


def cors(body: dict, code: int = 200) -> dict:
    return {
        "statusCode": code,
        "headers": {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, X-Session-Id",
            "Content-Type": "application/json",
        },
        "body": json.dumps(body, ensure_ascii=False, default=str),
    }


def get_user_id(conn, session_id: str):
    """Возвращает user_id по session_id или None."""
    with conn.cursor() as cur:
        cur.execute(
            f"SELECT user_id FROM {SCHEMA}.sessions WHERE id = %s AND expires_at > NOW()",
            (session_id,),
        )
        row = cur.fetchone()
    return row[0] if row else None


def yandex_gpt(prompt: str, system: str = "") -> str:
    """Вызов YandexGPT, возвращает текст ответа."""
    url = "https://llm.api.cloud.yandex.net/foundationModels/v1/completion"
    messages = []
    if system:
        messages.append({"role": "system", "text": system})
    messages.append({"role": "user", "text": prompt})
    payload = json.dumps({
        "modelUri": f"gpt://{YANDEX_FOLDER_ID}/yandexgpt/latest",
        "completionOptions": {"stream": False, "temperature": 0.4, "maxTokens": 3000},
        "messages": messages,
    }).encode()
    req = urllib.request.Request(url, data=payload, headers={
        "Authorization": f"Api-Key {YANDEX_GPT_API_KEY}",
        "Content-Type": "application/json",
    })
    with urllib.request.urlopen(req, timeout=25) as resp:
        data = json.loads(resp.read())
    return data["result"]["alternatives"][0]["message"]["text"]


# ── Link Resolver ─────────────────────────────────────────────────────────────
# In-memory кеш: key = (normalized_title, source_name) → результат верификации
_LINK_CACHE: dict = {}
_LINK_CACHE_LOCK = threading.Lock()

# Whitelist: source_name (lower) → допустимые домены
DOMAIN_WHITELIST: dict = {
    "coso":             ["coso.org"],
    "iia":              ["theiia.org", "global.theiia.org"],
    "institute of internal auditors": ["theiia.org"],
    "bis":              ["bis.org"],
    "bis / basel committee": ["bis.org"],
    "basel committee":  ["bis.org"],
    "nist":             ["nist.gov", "csrc.nist.gov"],
    "iso":              ["iso.org"],
    "isaca":            ["isaca.org"],
    "deloitte":         ["deloitte.com", "www2.deloitte.com"],
    "pwc":              ["pwc.com"],
    "ey":               ["ey.com"],
    "kpmg":             ["kpmg.com"],
    "mckinsey":         ["mckinsey.com"],
    "acfe":             ["acfe.com"],
    "ifc":              ["ifc.org"],
    "world bank":       ["worldbank.org"],
    "harvard business review": ["hbr.org"],
    "mit sloan":        ["sloanreview.mit.edu"],
    "gartner":          ["gartner.com"],
    "forrester":        ["forrester.com"],
}


def _normalize_key(title: str, source_name: str) -> str:
    return f"{title.lower().strip()}||{source_name.lower().strip()}"


def _extract_domain(url: str) -> str:
    try:
        parsed = urllib.parse.urlparse(url)
        host = parsed.hostname or ""
        return host.lstrip("www.")
    except Exception:
        return ""


def _is_trusted_domain(url: str, source_name: str) -> bool:
    domain = _extract_domain(url)
    if not domain:
        return False
    sn = source_name.lower()
    for key, allowed in DOMAIN_WHITELIST.items():
        if key in sn or sn in key:
            return any(domain == d or domain.endswith("." + d) for d in allowed)
    return False


def _title_matches(result_title: str, material_title: str) -> bool:
    """Проверяет, что заголовок результата поиска близок к названию материала."""
    rt = result_title.lower()
    mt = material_title.lower()
    # Точное совпадение
    if mt in rt or rt in mt:
        return True
    # Совпадение по ≥ 4 словам из названия материала
    words = [w for w in mt.split() if len(w) > 3]
    if len(words) >= 3:
        matches = sum(1 for w in words if w in rt)
        return matches >= max(3, len(words) // 2)
    return False


def _search_duckduckgo(query: str, limit: int = 5) -> list:
    """Поиск через DuckDuckGo HTML без ключа. Timeout 8 сек."""
    try:
        encoded = urllib.parse.quote(query)
        url = f"https://html.duckduckgo.com/html/?q={encoded}"
        req = urllib.request.Request(url, headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        })
        with urllib.request.urlopen(req, timeout=8) as resp:
            html = resp.read().decode("utf-8", errors="ignore")

        results = []
        pattern = re.compile(
            r'<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>(.*?)</a>.*?'
            r'<a[^>]+class="result__snippet"[^>]*>(.*?)</a>',
            re.DOTALL
        )
        for m in pattern.finditer(html):
            if len(results) >= limit:
                break
            link = m.group(1)
            title = re.sub(r'<[^>]+>', '', m.group(2)).strip()
            snippet = re.sub(r'<[^>]+>', '', m.group(3)).strip()
            if link.startswith("//duckduckgo.com/l/?uddg="):
                try:
                    link = urllib.parse.unquote(link.split("uddg=")[1].split("&")[0])
                except Exception:
                    pass
            if title and link and link.startswith("http"):
                results.append({"title": title, "snippet": snippet, "url": link})
        return results
    except Exception:
        return []


def _resolve_one(material: dict) -> dict:
    """
    Ищет верифицированный URL для одного материала.
    Возвращает обогащённый материал с полями source_url, link_status и др.
    Никогда не подставляет непроверенные ссылки.
    """
    title = material.get("title", "")
    source_name = material.get("source_name", "")
    source_type = material.get("source_type", "")

    cache_key = _normalize_key(title, source_name)
    with _LINK_CACHE_LOCK:
        if cache_key in _LINK_CACHE:
            cached = _LINK_CACHE[cache_key]
            return {**material, **cached}

    result_fields = {
        "source_url": None,
        "open_access_url": None,
        "source_domain": None,
        "link_status": "not_found",
        "verification_method": "web_search_domain_match",
    }

    # Формируем поисковые запросы по приоритету
    queries = []
    sn_lower = source_name.lower()
    # 1) site:-запрос для известного источника
    for key, domains in DOMAIN_WHITELIST.items():
        if key in sn_lower or sn_lower in key:
            queries.append(f'site:{domains[0]} "{title}"')
            break
    # 2) source_name + title
    queries.append(f'"{source_name}" "{title}"')
    # 3) title + тип
    if source_type in ("official_framework", "official_guidance", "professional_standard"):
        queries.append(f'"{title}" official pdf')
    else:
        queries.append(f'"{title}" {source_name}')

    found_url = None
    found_domain = None

    for query in queries:
        results = _search_duckduckgo(query, limit=5)
        for r in results:
            url = r.get("url", "")
            rtitle = r.get("title", "")
            if not url:
                continue
            # Проверяем домен по whitelist
            if _is_trusted_domain(url, source_name):
                if _title_matches(rtitle, title):
                    found_url = url
                    found_domain = _extract_domain(url)
                    result_fields["link_status"] = "verified_official"
                    break
                # Домен совпал, но заголовок нет — слабее, но допустимо для org
                if not found_url and source_type in ("official_framework", "official_guidance"):
                    found_url = url
                    found_domain = _extract_domain(url)
                    result_fields["link_status"] = "verified_org"
        if found_url and result_fields["link_status"] == "verified_official":
            break

    if found_url:
        result_fields["source_url"] = found_url
        result_fields["open_access_url"] = found_url
        result_fields["source_domain"] = found_domain

    with _LINK_CACHE_LOCK:
        _LINK_CACHE[cache_key] = result_fields

    return {**material, **result_fields}


def enrich_materials(materials: list) -> list:
    """
    Параллельно обогащает до 5 материалов verified links.
    Работает с жёстким timeout через threads: если поиск завис — возвращаем как есть.
    """
    if not materials:
        return materials

    results = list(materials)  # копия

    def resolve_idx(i: int):
        try:
            results[i] = _resolve_one(materials[i])
        except Exception:
            results[i] = {
                **materials[i],
                "source_url": None,
                "open_access_url": None,
                "source_domain": None,
                "link_status": "not_found",
                "verification_method": "web_search_domain_match",
            }

    threads = []
    for idx in range(min(len(materials), 5)):
        t = threading.Thread(target=resolve_idx, args=(idx,), daemon=True)
        t.start()
        threads.append(t)

    # Ждём максимум 12 секунд на все потоки
    for t in threads:
        t.join(timeout=12)

    return results


def handler(event: dict, context) -> dict:
    """Учебный кабинет: управление целями, темами, находками и AI-планированием."""
    if event.get("httpMethod") == "OPTIONS":
        return cors({})

    headers = event.get("headers") or {}
    session_id = headers.get("x-session-id") or headers.get("X-Session-Id", "")

    conn = psycopg2.connect(DB)
    try:
        user_id = get_user_id(conn, session_id)
        if not user_id:
            return cors({"ok": False, "error": {"message": "Не авторизован"}}, 401)

        method = event.get("httpMethod", "GET")
        qs = event.get("queryStringParameters") or {}
        action = qs.get("action", "")
        body = {}
        if event.get("body"):
            body = json.loads(event["body"])

        # ── Цели (goals) ──────────────────────────────────────────────
        if method == "GET" and action == "goals":
            with conn.cursor() as cur:
                cur.execute(
                    f"""SELECT id, title, description, status, ai_plan, created_at, updated_at, start_date
                        FROM {SCHEMA}.learning_goals
                        WHERE user_id = %s AND status != 'archived'
                        ORDER BY created_at DESC""",
                    (user_id,),
                )
                rows = cur.fetchall()
            goals = [
                {"id": r[0], "title": r[1], "description": r[2], "status": r[3],
                 "ai_plan": r[4], "created_at": r[5], "updated_at": r[6], "start_date": str(r[7]) if r[7] else None}
                for r in rows
            ]
            return cors({"ok": True, "goals": goals})

        if method == "POST" and action == "create_goal":
            title = (body.get("title") or "").strip()
            description = (body.get("description") or "").strip()
            if not title:
                return cors({"ok": False, "error": {"message": "Укажите название цели"}}, 400)
            with conn.cursor() as cur:
                cur.execute(
                    f"""INSERT INTO {SCHEMA}.learning_goals (user_id, title, description)
                        VALUES (%s, %s, %s) RETURNING id, created_at""",
                    (user_id, title, description or None),
                )
                goal_id, created_at = cur.fetchone()
            conn.commit()
            return cors({"ok": True, "goal": {"id": goal_id, "title": title, "description": description,
                                               "status": "active", "ai_plan": None, "created_at": created_at}})

        if method == "PUT" and action == "set_start_date":
            goal_id = body.get("goal_id")
            start_date = body.get("start_date")
            if not goal_id or not start_date:
                return cors({"ok": False, "error": {"message": "Нужны goal_id и start_date"}}, 400)
            with conn.cursor() as cur:
                cur.execute(
                    f"UPDATE {SCHEMA}.learning_goals SET start_date = %s, updated_at = NOW() WHERE id = %s AND user_id = %s",
                    (start_date, goal_id, user_id),
                )
            conn.commit()
            return cors({"ok": True})

        if method == "POST" and action == "weekly_checkin":
            goal_id = body.get("goal_id")
            studied = (body.get("studied") or "").strip()
            understood = (body.get("understood") or "").strip()
            gaps = (body.get("gaps") or "").strip()
            next_focus = (body.get("next_focus") or "").strip()
            if not goal_id or not studied:
                return cors({"ok": False, "error": {"message": "Нужны goal_id и studied"}}, 400)
            content = f"Изучено: {studied}\nСтало понятнее: {understood}\nПробелы: {gaps}\nФокус следующей недели: {next_focus}"
            with conn.cursor() as cur:
                cur.execute(
                    f"""INSERT INTO {SCHEMA}.learning_notes (user_id, goal_id, kind, title, content)
                        VALUES (%s, %s, 'summary', %s, %s) RETURNING id""",
                    (user_id, goal_id, f"Еженедельный check-in", content),
                )
                note_id = cur.fetchone()[0]
            conn.commit()
            # AI-саммари недели
            system = "Ты наставник. Пиши кратко, по-русски, тезисно."
            prompt = f"""Человек изучает тему «{body.get("goal_title", "")}».

Еженедельный отчёт:
- Изучено: {studied}
- Стало понятнее: {understood}
- Пробелы: {gaps}
- Фокус следующей недели: {next_focus}

Напиши:
1. Короткое (2-3 предложения) резюме прогресса за неделю
2. 3 конкретных рекомендации на следующую неделю"""
            try:
                ai_summary = yandex_gpt(prompt, system)
            except Exception:
                ai_summary = ""
            return cors({"ok": True, "note_id": note_id, "ai_summary": ai_summary})

        if method == "PUT" and action == "update_goal":
            goal_id = body.get("goal_id")
            if not goal_id:
                return cors({"ok": False, "error": {"message": "Нужен goal_id"}}, 400)
            fields, vals = [], []
            for f in ("title", "description", "status"):
                if f in body:
                    fields.append(f"{f} = %s")
                    vals.append(body[f])
            if not fields:
                return cors({"ok": False, "error": {"message": "Нечего обновлять"}}, 400)
            vals += [goal_id, user_id]
            with conn.cursor() as cur:
                cur.execute(
                    f"UPDATE {SCHEMA}.learning_goals SET {', '.join(fields)}, updated_at = NOW() WHERE id = %s AND user_id = %s",
                    vals,
                )
            conn.commit()
            return cors({"ok": True})

        # ── AI-план ───────────────────────────────────────────────────
        if method == "POST" and action == "generate_plan":
            goal_id = body.get("goal_id")
            title = (body.get("title") or "").strip()
            description = (body.get("description") or "").strip()
            if not title:
                return cors({"ok": False, "error": {"message": "Нужен title"}}, 400)

            system = (
                "Ты эксперт по обучению и развитию. Отвечай СТРОГО в формате JSON. "
                "Без markdown, без пояснений, только JSON."
            )
            prompt = f"""Составь структурированный план обучения по теме: «{title}».
{f'Контекст: {description}' if description else ''}

Верни JSON следующей структуры:
{{
  "summary": "Краткое описание плана (2-3 предложения)",
  "duration_weeks": <число недель>,
  "phases": [
    {{
      "phase": 1,
      "title": "Название этапа",
      "duration_weeks": <число>,
      "topics": [
        {{
          "title": "Тема",
          "description": "Что изучаем",
          "subtopics": ["подтема 1", "подтема 2"]
        }}
      ]
    }}
  ],
  "key_skills": ["навык 1", "навык 2"],
  "resources_hint": "Что рекомендуется изучать: книги, курсы, практика"
}}"""
            raw = yandex_gpt(prompt, system)
            raw = raw.strip()
            if raw.startswith("```"):
                raw = raw.split("```")[1]
                if raw.startswith("json"):
                    raw = raw[4:]
            plan = json.loads(raw.strip())

            if goal_id:
                with conn.cursor() as cur:
                    cur.execute(
                        f"UPDATE {SCHEMA}.learning_goals SET ai_plan = %s, updated_at = NOW() WHERE id = %s AND user_id = %s",
                        (json.dumps(plan), goal_id, user_id),
                    )
                conn.commit()

                # Создаём темы из плана автоматически
                with conn.cursor() as cur:
                    order = 0
                    for phase in plan.get("phases", []):
                        phase_title = f"Этап {phase['phase']}: {phase['title']}"
                        cur.execute(
                            f"""INSERT INTO {SCHEMA}.learning_topics (goal_id, title, description, order_index)
                                VALUES (%s, %s, %s, %s) RETURNING id""",
                            (goal_id, phase_title, f"{phase.get('duration_weeks', 1)} нед.", order),
                        )
                        phase_id = cur.fetchone()[0]
                        order += 1
                        for t in phase.get("topics", []):
                            cur.execute(
                                f"""INSERT INTO {SCHEMA}.learning_topics (goal_id, parent_id, title, description, order_index)
                                    VALUES (%s, %s, %s, %s, %s)""",
                                (goal_id, phase_id, t["title"], t.get("description", ""), order),
                            )
                            order += 1
                conn.commit()

            return cors({"ok": True, "plan": plan})

        # ── Темы (topics) ─────────────────────────────────────────────
        if method == "GET" and action == "topics":
            goal_id = qs.get("goal_id")
            if not goal_id:
                return cors({"ok": False, "error": {"message": "Нужен goal_id"}}, 400)
            with conn.cursor() as cur:
                cur.execute(
                    f"""SELECT id, parent_id, title, description, order_index, status, created_at
                        FROM {SCHEMA}.learning_topics
                        WHERE goal_id = %s
                        ORDER BY order_index, id""",
                    (goal_id,),
                )
                rows = cur.fetchall()
            topics = [
                {"id": r[0], "parent_id": r[1], "title": r[2], "description": r[3],
                 "order_index": r[4], "status": r[5], "created_at": r[6]}
                for r in rows
            ]
            return cors({"ok": True, "topics": topics})

        # ── Находки (notes) ───────────────────────────────────────────
        if method == "GET" and action == "notes":
            goal_id = qs.get("goal_id")
            topic_id = qs.get("topic_id")
            with conn.cursor() as cur:
                if topic_id:
                    cur.execute(
                        f"""SELECT id, goal_id, topic_id, kind, title, content, url, created_at
                            FROM {SCHEMA}.learning_notes
                            WHERE user_id = %s AND topic_id = %s
                            ORDER BY created_at DESC""",
                        (user_id, topic_id),
                    )
                elif goal_id:
                    cur.execute(
                        f"""SELECT id, goal_id, topic_id, kind, title, content, url, created_at
                            FROM {SCHEMA}.learning_notes
                            WHERE user_id = %s AND goal_id = %s
                            ORDER BY created_at DESC""",
                        (user_id, goal_id),
                    )
                else:
                    cur.execute(
                        f"""SELECT id, goal_id, topic_id, kind, title, content, url, created_at
                            FROM {SCHEMA}.learning_notes
                            WHERE user_id = %s
                            ORDER BY created_at DESC LIMIT 50""",
                        (user_id,),
                    )
                rows = cur.fetchall()
            notes = [
                {"id": r[0], "goal_id": r[1], "topic_id": r[2], "kind": r[3],
                 "title": r[4], "content": r[5], "url": r[6], "created_at": r[7]}
                for r in rows
            ]
            return cors({"ok": True, "notes": notes})

        if method == "POST" and action == "add_note":
            content = (body.get("content") or "").strip()
            if not content:
                return cors({"ok": False, "error": {"message": "Напишите что-нибудь"}}, 400)
            with conn.cursor() as cur:
                cur.execute(
                    f"""INSERT INTO {SCHEMA}.learning_notes (user_id, goal_id, topic_id, kind, title, content, url)
                        VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id, created_at""",
                    (user_id, body.get("goal_id"), body.get("topic_id"),
                     body.get("kind", "note"), body.get("title"), content, body.get("url")),
                )
                note_id, created_at = cur.fetchone()
            conn.commit()
            return cors({"ok": True, "note": {"id": note_id, "created_at": created_at}})

        # ── AI-помощник по теме ───────────────────────────────────────
        if method == "POST" and action == "ask_ai":
            question = (body.get("question") or "").strip()
            topic_title = (body.get("topic_title") or "").strip()
            goal_title = (body.get("goal_title") or "").strip()
            if not question:
                return cors({"ok": False, "error": {"message": "Задайте вопрос"}}, 400)

            system = (
                f"Ты персональный наставник. Помогаешь человеку освоить тему «{goal_title}»."
                + (f" Сейчас он изучает: «{topic_title}»." if topic_title else "")
                + " Отвечай чётко, по-русски, простым языком. Давай конкретные примеры и следующие шаги."
            )
            answer = yandex_gpt(question, system)
            return cors({"ok": True, "answer": answer})

        # ── Прогресс (веса: not_started=0, studying=0.33, understood=0.66, applied=1.0) ──
        if method == "GET" and action == "progress":
            goal_id = qs.get("goal_id")
            if not goal_id:
                return cors({"ok": False, "error": {"message": "Нужен goal_id"}}, 400)
            WEIGHTS = {"not_started": 0.0, "studying": 0.33, "understood": 0.66, "applied": 1.0,
                       "done": 1.0, "in_progress": 0.33}
            with conn.cursor() as cur:
                cur.execute(
                    f"SELECT status, COUNT(*) FROM {SCHEMA}.learning_topics WHERE goal_id = %s GROUP BY status",
                    (goal_id,),
                )
                counts = {r[0]: r[1] for r in cur.fetchall()}
                cur.execute(
                    f"SELECT COUNT(*) FROM {SCHEMA}.learning_notes WHERE goal_id = %s AND user_id = %s",
                    (goal_id, user_id),
                )
                notes_count = cur.fetchone()[0]
            total = sum(counts.values())
            weighted_sum = sum(WEIGHTS.get(s, 0) * n for s, n in counts.items())
            pct = int(weighted_sum / total * 100) if total else 0
            applied = counts.get("applied", 0) + counts.get("done", 0)
            understood = counts.get("understood", 0)
            studying = counts.get("studying", 0) + counts.get("in_progress", 0)
            not_started = counts.get("not_started", 0)
            return cors({"ok": True, "progress": {
                "total": total,
                "applied": applied,
                "understood": understood,
                "studying": studying,
                "not_started": not_started,
                "done": applied,
                "in_progress": studying,
                "percent": pct,
                "notes_count": notes_count,
            }})

        # ── Валидация статуса темы (4 уровня) ─────────────────────────
        if method == "PUT" and action == "update_topic":
            topic_id = body.get("topic_id")
            new_status = body.get("status")
            VALID = {"not_started", "studying", "understood", "applied"}
            if not topic_id or new_status not in VALID:
                return cors({"ok": False, "error": {"message": f"Статус должен быть одним из: {', '.join(VALID)}"}}, 400)
            topic_title = ""
            with conn.cursor() as cur:
                cur.execute(
                    f"""UPDATE {SCHEMA}.learning_topics
                        SET status = %s, updated_at = NOW()
                        WHERE id = %s AND goal_id IN (SELECT id FROM {SCHEMA}.learning_goals WHERE user_id = %s)
                        RETURNING title""",
                    (new_status, topic_id, user_id),
                )
                row = cur.fetchone()
                if row:
                    topic_title = row[0] or ""
            conn.commit()

            # W9.2.1: fire-and-forget bridge ingest при переходе в applied
            if new_status == "applied" and topic_title and BRIDGE_URL:
                try:
                    payload = json.dumps({
                        "user_id": user_id,
                        "content_source": "learning_topics",
                        "content_id": int(topic_id),
                        "content_title": topic_title,
                        "triggered_by": "update_topic.applied",
                    }).encode()
                    hdrs = {"Content-Type": "application/json"}
                    if BRIDGE_TOKEN:
                        hdrs["X-Service-Token"] = BRIDGE_TOKEN
                    req = urllib.request.Request(
                        f"{BRIDGE_URL}?action=learning_completion_ingest",
                        data=payload, headers=hdrs, method="POST",
                    )
                    urllib.request.urlopen(req, timeout=4)
                except Exception:
                    pass

            return cors({"ok": True})

        # ── Weekly check-in: сохранить ────────────────────────────────
        if method == "POST" and action == "save_checkin":
            goal_id = body.get("goal_id")
            learned     = (body.get("learned") or "").strip()
            clearer_now = (body.get("clearer_now") or "").strip()
            gaps        = (body.get("gaps") or "").strip()
            next_focus  = (body.get("next_focus") or "").strip()
            goal_title  = (body.get("goal_title") or "").strip()
            if not goal_id or not learned:
                return cors({"ok": False, "error": {"message": "Нужны goal_id и learned"}}, 400)
            # AI summary
            system = "Ты наставник. Пиши кратко, тезисно, по-русски."
            prompt = (
                f"Человек изучает: «{goal_title}».\n\n"
                f"Отчёт за неделю:\n"
                f"- Изучено: {learned}\n"
                f"- Стало понятнее: {clearer_now}\n"
                f"- Пробелы: {gaps}\n"
                f"- Фокус следующей недели: {next_focus}\n\n"
                "Напиши:\n1. Резюме прогресса (2–3 предложения)\n2. 3 конкретных рекомендации на следующую неделю"
            )
            try:
                ai_summary = yandex_gpt(prompt, system)
            except Exception:
                ai_summary = ""
            with conn.cursor() as cur:
                cur.execute(
                    f"""INSERT INTO {SCHEMA}.learning_checkins
                        (user_id, goal_id, week_start, learned, clearer_now, gaps, next_focus, ai_summary)
                        VALUES (%s, %s, CURRENT_DATE, %s, %s, %s, %s, %s)
                        RETURNING id, created_at""",
                    (user_id, goal_id, learned, clearer_now, gaps, next_focus, ai_summary),
                )
                row = cur.fetchone()
            conn.commit()
            return cors({"ok": True, "checkin": {
                "id": row[0], "learned": learned, "clearer_now": clearer_now,
                "gaps": gaps, "next_focus": next_focus, "ai_summary": ai_summary,
                "created_at": str(row[1]),
            }})

        # ── Weekly check-in: история ──────────────────────────────────
        if method == "GET" and action == "checkins":
            goal_id = qs.get("goal_id")
            if not goal_id:
                return cors({"ok": False, "error": {"message": "Нужен goal_id"}}, 400)
            with conn.cursor() as cur:
                cur.execute(
                    f"""SELECT id, week_start, learned, clearer_now, gaps, next_focus, ai_summary, created_at
                        FROM {SCHEMA}.learning_checkins
                        WHERE goal_id = %s AND user_id = %s
                        ORDER BY created_at DESC LIMIT 20""",
                    (goal_id, user_id),
                )
                rows = cur.fetchall()
            checkins = [
                {"id": r[0], "week_start": str(r[1]), "learned": r[2], "clearer_now": r[3],
                 "gaps": r[4], "next_focus": r[5], "ai_summary": r[6], "created_at": str(r[7])}
                for r in rows
            ]
            return cors({"ok": True, "checkins": checkins})

        # ── Memory: сохранить результат quiz ──────────────────────────
        if method == "POST" and action == "save_quiz_result":
            goal_id      = body.get("goal_id")
            topic_id     = body.get("topic_id")
            quiz_payload = body.get("quiz_payload") or []   # список вопросов с concept_tag
            user_answers = body.get("user_answers") or {}   # {str(idx): int(chosen)}
            duration_sec = body.get("duration_sec")

            if not goal_id or not topic_id or not quiz_payload:
                return cors({"ok": False, "error": {"message": "Нужны goal_id, topic_id, quiz_payload"}}, 400)

            # ── Считаем score на сервере ──────────────────────────────
            total = len(quiz_payload)
            correct = 0
            wrong_questions = []
            weak_set: dict = {}   # concept_tag → count_wrong

            for idx, q in enumerate(quiz_payload):
                chosen = user_answers.get(str(idx))
                right  = q.get("correct", -1)
                tag    = q.get("concept_tag") or "general"
                if chosen is not None and int(chosen) == int(right):
                    correct += 1
                else:
                    wrong_questions.append({
                        "idx": idx,
                        "question": q.get("question", ""),
                        "concept_tag": tag,
                        "correct": right,
                        "chosen": chosen,
                    })
                    weak_set[tag] = weak_set.get(tag, 0) + 1

            score = round(correct / total * 100, 1) if total > 0 else 0
            # Топ слабых концептов (сортируем по частоте ошибок)
            weak_concepts = [
                {"tag": t, "wrong_count": c}
                for t, c in sorted(weak_set.items(), key=lambda x: -x[1])
            ]

            # ── Сохраняем attempt ─────────────────────────────────────
            with conn.cursor() as cur:
                cur.execute(
                    f"""INSERT INTO {SCHEMA}.learning_quiz_attempts
                        (user_id, goal_id, topic_id, score, correct_count, total_questions,
                         weak_concepts, quiz_payload, user_answers, duration_sec)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                        RETURNING id""",
                    (user_id, goal_id, topic_id, score, correct, total,
                     json.dumps(weak_concepts, ensure_ascii=False),
                     json.dumps(quiz_payload, ensure_ascii=False),
                     json.dumps(user_answers, ensure_ascii=False),
                     duration_sec),
                )
                attempt_id = cur.fetchone()[0]

            # ── Обновляем summary memory (UPSERT) ─────────────────────
            # review_priority: high (<60), medium (60-79), none (>=80)
            if score < 60:
                review_priority = "high"
            elif score < 80:
                review_priority = "medium"
            else:
                review_priority = "none"

            needs_review = score < 80 or bool(weak_concepts)

            with conn.cursor() as cur:
                cur.execute(
                    f"""SELECT id, attempts_count, best_score, weak_concepts
                        FROM {SCHEMA}.learning_topic_memory
                        WHERE user_id = %s AND goal_id = %s AND topic_id = %s""",
                    (user_id, goal_id, topic_id),
                )
                existing = cur.fetchone()

            if existing:
                mem_id, prev_attempts, prev_best, prev_weak_json = existing
                prev_weak = prev_weak_json if isinstance(prev_weak_json, list) else []
                # Мёржим концепты: суммируем wrong_count
                merged: dict = {w["tag"]: w["wrong_count"] for w in prev_weak}
                for w in weak_concepts:
                    merged[w["tag"]] = merged.get(w["tag"], 0) + w["wrong_count"]
                merged_list = [{"tag": t, "wrong_count": c} for t, c in sorted(merged.items(), key=lambda x: -x[1])]
                new_best = max(float(prev_best), score)
                with conn.cursor() as cur:
                    cur.execute(
                        f"""UPDATE {SCHEMA}.learning_topic_memory
                            SET attempts_count = %s, last_score = %s, best_score = %s,
                                weak_concepts = %s, needs_review = %s,
                                review_priority = %s, last_quiz_at = NOW(), updated_at = NOW()
                            WHERE id = %s""",
                        (prev_attempts + 1, score, new_best,
                         json.dumps(merged_list, ensure_ascii=False),
                         needs_review, review_priority, mem_id),
                    )
            else:
                with conn.cursor() as cur:
                    cur.execute(
                        f"""INSERT INTO {SCHEMA}.learning_topic_memory
                            (user_id, goal_id, topic_id, attempts_count, last_score, best_score,
                             weak_concepts, needs_review, review_priority, last_quiz_at)
                            VALUES (%s, %s, %s, 1, %s, %s, %s, %s, %s, NOW())""",
                        (user_id, goal_id, topic_id, score, score,
                         json.dumps(weak_concepts, ensure_ascii=False),
                         needs_review, review_priority),
                    )

            conn.commit()
            return cors({
                "ok": True,
                "attempt_id": attempt_id,
                "score": score,
                "correct": correct,
                "total": total,
                "weak_concepts": weak_concepts,
                "wrong_questions": wrong_questions,
                "needs_review": needs_review,
                "review_priority": review_priority,
            })

        # ── Memory: получить память по теме ───────────────────────────
        if method == "GET" and action == "topic_memory":
            topic_id = qs.get("topic_id")
            goal_id  = qs.get("goal_id")
            if not topic_id or not goal_id:
                return cors({"ok": False, "error": {"message": "Нужны topic_id и goal_id"}}, 400)
            with conn.cursor() as cur:
                cur.execute(
                    f"""SELECT attempts_count, last_score, best_score, weak_concepts,
                               needs_review, review_priority, last_quiz_at
                        FROM {SCHEMA}.learning_topic_memory
                        WHERE user_id = %s AND goal_id = %s AND topic_id = %s""",
                    (user_id, int(goal_id), int(topic_id)),
                )
                row = cur.fetchone()
            if not row:
                return cors({"ok": True, "memory": None})
            return cors({"ok": True, "memory": {
                "attempts_count": row[0], "last_score": float(row[1]), "best_score": float(row[2]),
                "weak_concepts": row[3] if isinstance(row[3], list) else [],
                "needs_review": row[4], "review_priority": row[5],
                "last_quiz_at": str(row[6]) if row[6] else None,
            }})

        # ── Memory: список тем с review для цели ──────────────────────
        if method == "GET" and action == "review_topics":
            goal_id = qs.get("goal_id")
            if not goal_id:
                return cors({"ok": False, "error": {"message": "Нужен goal_id"}}, 400)
            with conn.cursor() as cur:
                cur.execute(
                    f"""SELECT m.topic_id, t.title, m.last_score, m.best_score,
                               m.weak_concepts, m.review_priority, m.attempts_count
                        FROM {SCHEMA}.learning_topic_memory m
                        JOIN {SCHEMA}.learning_topics t ON t.id = m.topic_id
                        WHERE m.user_id = %s AND m.goal_id = %s AND m.needs_review = TRUE
                        ORDER BY CASE m.review_priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END""",
                    (user_id, int(goal_id)),
                )
                rows = cur.fetchall()
            topics_review = [
                {"topic_id": r[0], "title": r[1], "last_score": float(r[2]), "best_score": float(r[3]),
                 "weak_concepts": r[4] if isinstance(r[4], list) else [],
                 "review_priority": r[5], "attempts_count": r[6]}
                for r in rows
            ]
            return cors({"ok": True, "review_topics": topics_review})

        # ── AI-режим обучения по теме ─────────────────────────────────
        if method == "POST" and action == "topic_learn":
            topic_id    = body.get("topic_id")
            topic_title = (body.get("topic_title") or "").strip()
            goal_title  = (body.get("goal_title") or "").strip()
            mode        = body.get("mode", "full")   # full | explain | materials | quiz | session

            if not topic_title:
                return cors({"ok": False, "error": {"message": "Нужен topic_title"}}, 400)

            # Контекст роли
            role_ctx = ""
            if goal_title:
                role_ctx = (
                    f"Учебная цель пользователя: «{goal_title}». "
                    "Пользователь — практик, изучает для применения в работе, "
                    "не студент. Все объяснения и примеры привязывай к этому контексту."
                )

            # ── Загружаем memory по теме (если есть topic_id) ─────────
            memory = None
            if topic_id:
                with conn.cursor() as cur:
                    cur.execute(
                        f"""SELECT attempts_count, last_score, best_score, weak_concepts,
                                   needs_review, review_priority
                            FROM {SCHEMA}.learning_topic_memory
                            WHERE user_id = %s AND topic_id = %s""",
                        (user_id, int(topic_id)),
                    )
                    mem_row = cur.fetchone()
                if mem_row:
                    memory = {
                        "attempts_count": mem_row[0],
                        "last_score": float(mem_row[1]),
                        "best_score": float(mem_row[2]),
                        "weak_concepts": mem_row[3] if isinstance(mem_row[3], list) else [],
                        "needs_review": mem_row[4],
                        "review_priority": mem_row[5],
                    }

            # Memory-контекст для промптов
            memory_ctx = ""
            if memory and memory["attempts_count"] > 0:
                weak_tags = [w["tag"] for w in memory["weak_concepts"][:3]]
                memory_ctx = (
                    f"\n\nПАМЯТЬ О ПОЛЬЗОВАТЕЛЕ: он уже изучал эту тему {memory['attempts_count']} раз(а). "
                    f"Последний результат проверки знаний: {memory['last_score']}%. "
                )
                if weak_tags:
                    memory_ctx += (
                        f"Слабые места (здесь были ошибки): {', '.join(weak_tags)}. "
                        "Уделяй особое внимание этим аспектам — объясняй их более детально и приводи дополнительные примеры. "
                        "Не пересказывай тему заново — фокусируйся на пробелах."
                    )
                else:
                    memory_ctx += "Повтори ключевые моменты, которые чаще вызывают затруднения."

            # Единый materials-промпт с provenance
            MATERIALS_SCHEMA = (
                '  "materials": [\n'
                '    {\n'
                '      "title": "Точное название документа / книги / ресурса",\n'
                '      "source_name": "Организация или автор-издатель (COSO, IIA, BIS, McKinsey и т.д.)",\n'
                '      "source_type": "official_framework|official_guidance|professional_standard|academic|consulting_overview|book|course|tool",\n'
                '      "trust_level": "high|medium|low",\n'
                '      "level": "basic|intermediate|advanced",\n'
                '      "description": "Что внутри и почему полезно (1-2 предложения)",\n'
                '      "why_recommended": "Конкретная причина рекомендации именно для этой темы",\n'
                '      "access_note": "Где найти: официальный сайт, открытый доступ, поисковый запрос, коммерческий"\n'
                "    }\n"
                "  ]\n"
            )

            def parse_json(raw: str, fallback: dict) -> dict:
                raw = raw.strip()
                if raw.startswith("```"):
                    raw = "\n".join(raw.split("\n")[1:])
                    raw = raw.rsplit("```", 1)[0]
                try:
                    return json.loads(raw.strip())
                except Exception:
                    return fallback

            if mode == "explain":
                system = (
                    "Ты эксперт-наставник. Объясняй чётко, по-русски, языком практика. "
                    "Давай примеры, привязанные к реальной работе. Отвечай СТРОГО в JSON."
                )
                prompt = (
                    f"Тема: «{topic_title}»\n"
                    f"{role_ctx}{memory_ctx}\n\n"
                    "Дай структурированное объяснение в формате JSON:\n"
                    "{\n"
                    '  "what": "Что это такое (2-3 предложения простым языком)",\n'
                    '  "why": "Почему важно именно для этой учебной цели (1-2 предложения)",\n'
                    '  "key_concepts": ["Ключевое понятие 1", "Ключевое понятие 2", "Ключевое понятие 3"],\n'
                    '  "common_mistakes": ["Типичная ошибка понимания 1", "Типичная ошибка 2"],\n'
                    '  "practical_tip": "Один конкретный совет как применить в работе"\n'
                    "}"
                )
                result = parse_json(yandex_gpt(prompt, system),
                                    {"what": "", "why": "", "key_concepts": [], "common_mistakes": [], "practical_tip": ""})
                return cors({"ok": True, "explanation": result, "memory": memory})

            if mode == "materials":
                system = (
                    "Ты эксперт-библиотекарь. Рекомендуй только реально существующие, "
                    "проверенные источники с указанием организации-автора. "
                    "Никаких выдуманных названий — только известные документы, фреймворки, книги. "
                    "trust_level: high — официальные стандарты и признанные профассоциации, "
                    "medium — консалтинговые обзоры и академические статьи, low — прочее. "
                    "Отвечай СТРОГО в JSON."
                )
                prompt = (
                    f"Тема: «{topic_title}»\n"
                    f"{role_ctx}\n\n"
                    "Подбери 5 лучших реально существующих источников для изучения темы.\n"
                    "Формат JSON:\n"
                    "{\n"
                    + MATERIALS_SCHEMA +
                    "}"
                )
                result = parse_json(yandex_gpt(prompt, system), {"materials": []})
                mats = enrich_materials(result.get("materials", []))
                return cors({"ok": True, "materials": mats})

            if mode == "quiz":
                # Если есть память — акцентируем вопросы на слабые концепты
                weak_focus = ""
                if memory and memory["weak_concepts"]:
                    weak_tags = [w["tag"] for w in memory["weak_concepts"][:3]]
                    weak_focus = (
                        f"\nВАЖНО: у пользователя были ошибки в прошлый раз по темам: {', '.join(weak_tags)}. "
                        "Сделай 2-3 вопроса прицельно по этим аспектам (targeted questions). "
                        "Остальные вопросы — общие по теме."
                    )
                system = (
                    "Ты преподаватель-эксперт. Составляй вопросы, проверяющие понимание концепций, "
                    "а не механическое запоминание терминов. Вопросы должны выявлять реальные пробелы. "
                    "Отвечай СТРОГО в JSON."
                )
                prompt = (
                    f"Тема: «{topic_title}»\n"
                    f"{role_ctx}{weak_focus}\n\n"
                    "Составь 5 вопросов с вариантами ответов для проверки понимания темы.\n"
                    "Вопросы должны проверять:\n"
                    "- понимание концепции, а не определения наизусть;\n"
                    "- умение отличить правильное от похожего неправильного;\n"
                    "- применение в практической ситуации.\n\n"
                    "Для каждого вопроса укажи concept_tag — короткую метку концепта (snake_case, например: "
                    "preventive_vs_detective, three_lines_model, risk_appetite, control_owner).\n\n"
                    "Формат JSON:\n"
                    "{\n"
                    '  "questions": [\n'
                    '    {\n'
                    '      "question": "Текст вопроса",\n'
                    '      "options": ["Вариант А", "Вариант Б", "Вариант В", "Вариант Г"],\n'
                    '      "correct": 0,\n'
                    '      "explanation": "Почему правильный ответ правильный, и в чём ошибка в остальных",\n'
                    '      "concept_tag": "snake_case_название_концепта"\n'
                    "    }\n"
                    "  ]\n"
                    "}"
                )
                result = parse_json(yandex_gpt(prompt, system), {"questions": []})
                return cors({"ok": True, "questions": result.get("questions", []), "memory": memory})

            if mode == "session":
                minutes = int(body.get("minutes", 30))
                depth = "краткий" if minutes <= 20 else ("стандартный" if minutes <= 30 else "углублённый")
                # Если есть память — строим remediation-сессию
                remediation_ctx = ""
                if memory and memory["weak_concepts"]:
                    weak_tags = [w["tag"] for w in memory["weak_concepts"][:3]]
                    remediation_ctx = (
                        f"\nВАЖНО: это remediation-сессия. Пользователь уже изучал тему, "
                        f"результат проверки: {memory['last_score']}%. "
                        f"Слабые места: {', '.join(weak_tags)}. "
                        "Не пересказывай базовые вещи заново. "
                        "Сфокусируй сессию на разборе именно этих пробелов с новыми примерами и объяснениями."
                    )
                system = (
                    "Ты наставник. Составляй структурированные учебные сессии. "
                    "Включай практические кейсы из реальной жизни. Отвечай СТРОГО в JSON."
                )
                prompt = (
                    f"Тема: «{topic_title}»\n"
                    f"{role_ctx}{remediation_ctx}\n"
                    f"Длина сессии: {minutes} минут. Уровень детализации: {depth}.\n\n"
                    "Составь учебную сессию в формате JSON:\n"
                    "{\n"
                    '  "intro": "Вводное объяснение темы (3-5 предложений, конкретно и по делу)",\n'
                    '  "key_points": [\n'
                    '    {"point": "Ключевой тезис", "detail": "Пояснение 1-2 предложения с примером"}\n'
                    "  ],\n"
                    '  "terms": [\n'
                    '    {"term": "Термин", "definition": "Простое определение без воды"}\n'
                    "  ],\n"
                    '  "practical_case": "Конкретный рабочий сценарий: ситуация, риск, как работает контроль / инструмент / принцип",\n'
                    '  "reflection_questions": [\n'
                    '    "Вопрос для самостоятельного обдумывания (не тест, а повод подумать)"\n'
                    "  ],\n"
                    '  "takeaway": "Главный вывод одним предложением",\n'
                    '  "next_step": "Конкретная тема или действие — что делать после этой сессии"\n'
                    "}"
                )
                result = parse_json(yandex_gpt(prompt, system),
                                    {"intro": "", "key_points": [], "terms": [], "practical_case": "", "reflection_questions": [], "takeaway": "", "next_step": ""})
                return cors({"ok": True, "session": result, "memory": memory})

            # mode == "full": полный пакет при открытии темы
            system = (
                "Ты эксперт-наставник и библиотекарь. "
                "Для материалов рекомендуй только реально существующие источники. "
                "trust_level: high — официальные стандарты и профессиональные ассоциации (COSO, IIA, BIS, ISO и т.д.), "
                "medium — консалтинговые обзоры крупных компаний и академические работы, "
                "low — прочее. "
                "Отвечай СТРОГО в формате JSON без markdown и без пояснений вне JSON."
            )
            prompt = (
                f"Тема: «{topic_title}»\n"
                f"{role_ctx}{memory_ctx}\n\n"
                "Составь полный учебный пакет в формате JSON:\n"
                "{\n"
                '  "explanation": {\n'
                '    "what": "Что это такое (2-3 предложения простым языком)",\n'
                '    "why": "Почему важно именно для этой учебной цели",\n'
                '    "practical_tip": "Один конкретный совет практика"\n'
                "  },\n"
                '  "terms": [\n'
                '    {"term": "Термин", "definition": "Простое определение"}\n'
                "  ],\n"
                "  " + MATERIALS_SCHEMA.strip() + ",\n"
                '  "questions": [\n'
                '    {"question": "Вопрос для самопроверки — проверяет понимание, не память"}\n'
                "  ],\n"
                '  "next_step": "Что изучить или сделать следующим"\n'
                "}"
            )
            pack = parse_json(yandex_gpt(prompt, system),
                              {"explanation": {"what": "", "why": "", "practical_tip": ""}, "terms": [], "materials": [], "questions": [], "next_step": ""})
            pack["materials"] = enrich_materials(pack.get("materials", []))
            return cors({"ok": True, "pack": pack, "memory": memory})

        return cors({"ok": False, "error": {"message": "Неизвестное действие"}}, 400)

    finally:
        conn.close()