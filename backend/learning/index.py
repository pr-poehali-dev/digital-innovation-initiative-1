import json
import os
import psycopg2
import urllib.request

DB = os.environ["DATABASE_URL"]
SCHEMA = os.environ.get("MAIN_DB_SCHEMA", "public")
YANDEX_GPT_API_KEY = os.environ.get("YANDEX_GPT_API_KEY", "")
YANDEX_FOLDER_ID = os.environ.get("YANDEX_FOLDER_ID", "")


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
            with conn.cursor() as cur:
                cur.execute(
                    f"""UPDATE {SCHEMA}.learning_topics
                        SET status = %s, updated_at = NOW()
                        WHERE id = %s AND goal_id IN (SELECT id FROM {SCHEMA}.learning_goals WHERE user_id = %s)""",
                    (new_status, topic_id, user_id),
                )
            conn.commit()
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

        return cors({"ok": False, "error": {"message": "Неизвестное действие"}}, 400)

    finally:
        conn.close()