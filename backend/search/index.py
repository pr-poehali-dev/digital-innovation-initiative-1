"""
Поиск по базе знаний и чат с документом.
Этап 2: ключевой поиск по чанкам + AI-чат по конкретному документу с цитатами.
"""
import json
import os
import re
import urllib.request
import psycopg2


def get_db():
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    conn.autocommit = False
    return conn


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


def cors_headers(origin: str = None):
    """Возвращает CORS headers с whitelist origins (security hardening)."""
    allow_origin = "*"
    if origin and origin in ALLOWED_ORIGINS:
        allow_origin = origin
    elif origin and origin.endswith(".poehali.dev"):
        allow_origin = origin
    return {
        "Access-Control-Allow-Origin": allow_origin,
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-Session-Id",
        "Access-Control-Allow-Credentials": "true",
        "Vary": "Origin",
    }


def json_response(data, status=200):
    return {
        "statusCode": status,
        "headers": {**cors_headers(), "Content-Type": "application/json"},
        "body": json.dumps(data, ensure_ascii=False, default=str),
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


def call_yandex_gpt(messages: list) -> str:
    api_key = os.environ.get("YANDEX_GPT_API_KEY", "")
    folder_id = os.environ.get("YANDEX_FOLDER_ID", "")
    if not api_key or not folder_id:
        return "[AI недоступен: добавьте YANDEX_GPT_API_KEY и YANDEX_FOLDER_ID в настройках.]"

    yandex_messages = [{"role": m["role"], "text": m["content"]} for m in messages]
    payload = json.dumps({
        "modelUri": f"gpt://{folder_id}/yandexgpt/latest",
        "completionOptions": {"stream": False, "temperature": 0.3, "maxTokens": 4000},
        "messages": yandex_messages,
    }).encode()

    req = urllib.request.Request(
        "https://llm.api.cloud.yandex.net/foundationModels/v1/completion",
        data=payload,
        headers={"Authorization": f"Api-Key {api_key}", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=90) as resp:
            result = json.loads(resp.read())
            return result["result"]["alternatives"][0]["message"]["text"]
    except Exception as e:
        return f"[Ошибка AI: {e}]"


def keyword_score(text: str, terms: list) -> float:
    """Оценка релевантности по ключевым словам с учётом частоты."""
    if not text or not terms:
        return 0.0
    text_lower = text.lower()
    score = 0.0
    for t in terms:
        if len(t) < 3:
            continue
        count = text_lower.count(t.lower())
        score += count * (1.0 + len(t) / 20.0)
    return score


def extract_keywords(query: str) -> list:
    """Простое извлечение ключевых слов из запроса."""
    # Убираем стоп-слова
    stop = {"и", "в", "на", "с", "по", "о", "об", "от", "для", "что", "как", "где",
            "это", "это", "так", "же", "из", "к", "у", "за", "не", "ли", "то", "ну",
            "the", "a", "an", "is", "are", "of", "to", "and", "or"}
    words = re.findall(r"[\w\-]{3,}", query.lower())
    return [w for w in words if w not in stop]


def handler(event: dict, context) -> dict:
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": cors_headers(), "body": ""}

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
            return json_response({"error": "Не авторизован"}, 401)

        if method != "POST":
            return json_response({"error": "Method not allowed"}, 405)

        action = body.get("action", "")

        # ACTION: глобальный поиск по проекту
        if action == "search_knowledge":
            project_id = body.get("project_id")
            query = (body.get("query") or "").strip()
            if not project_id or not query:
                return json_response({"error": "Нужны project_id и query"}, 400)

            cur = conn.cursor()
            cur.execute(
                f"SELECT role FROM {schema}.project_members WHERE project_id = %s AND user_id = %s",
                (project_id, user["id"]),
            )
            if not cur.fetchone():
                return json_response({"error": "Нет доступа"}, 403)

            # Загружаем все чанки проекта
            cur.execute(
                f"""SELECT ch.id, ch.document_id, ch.chunk_index, ch.page_number, ch.content,
                    d.original_name, d.file_type, d.category
                    FROM {schema}.document_chunks ch
                    JOIN {schema}.documents d ON d.id = ch.document_id
                    WHERE d.project_id = %s
                    LIMIT 2000""",
                (project_id,),
            )
            rows = cur.fetchall()

            terms = extract_keywords(query)
            scored = []
            for r in rows:
                s = keyword_score(r[4], terms)
                if s > 0:
                    scored.append((s, r))
            scored.sort(key=lambda x: -x[0])
            top = scored[:15]

            results = []
            for s, r in top:
                content = r[4]
                # Подсветка
                snippet = content[:300] + ("…" if len(content) > 300 else "")
                results.append({
                    "chunk_id": r[0],
                    "document_id": r[1],
                    "document_name": r[5],
                    "file_type": r[6],
                    "category": r[7],
                    "chunk_index": r[2],
                    "page_number": r[3],
                    "snippet": snippet,
                    "score": round(float(s), 2),
                })

            # История поиска
            cur.execute(
                f"INSERT INTO {schema}.knowledge_searches (project_id, user_id, query, results_count) VALUES (%s, %s, %s, %s)",
                (project_id, user["id"], query, len(results)),
            )
            conn.commit()

            return json_response({"query": query, "results": results, "total": len(results)})

        # ACTION: чат с документом — задать вопрос по конкретному файлу
        if action == "chat_with_document":
            doc_id = body.get("document_id")
            question = (body.get("question") or "").strip()
            if not doc_id or not question:
                return json_response({"error": "Нужны document_id и question"}, 400)

            cur = conn.cursor()
            cur.execute(
                f"SELECT project_id, original_name, extracted_text FROM {schema}.documents WHERE id = %s",
                (doc_id,),
            )
            doc_row = cur.fetchone()
            if not doc_row:
                return json_response({"error": "Документ не найден"}, 404)

            project_id, doc_name, full_text = doc_row
            cur.execute(
                f"SELECT role FROM {schema}.project_members WHERE project_id = %s AND user_id = %s",
                (project_id, user["id"]),
            )
            if not cur.fetchone():
                return json_response({"error": "Нет доступа"}, 403)

            # Находим релевантные чанки в документе
            cur.execute(
                f"SELECT id, chunk_index, page_number, content FROM {schema}.document_chunks WHERE document_id = %s ORDER BY chunk_index",
                (doc_id,),
            )
            all_chunks = cur.fetchall()

            terms = extract_keywords(question)
            scored = []
            for r in all_chunks:
                s = keyword_score(r[3], terms)
                if s > 0:
                    scored.append((s, r))
            scored.sort(key=lambda x: -x[0])

            # Берём топ-5 чанков или первые если ничего не нашлось
            relevant = [r for _, r in scored[:5]]
            if not relevant and all_chunks:
                relevant = list(all_chunks[:3])

            # Готовим контекст
            context_parts = []
            sources = []
            for r in relevant:
                page_info = f" (стр. {r[2]})" if r[2] else f" (фрагмент {r[1] + 1})"
                context_parts.append(f"[Источник{page_info}]\n{r[3]}")
                sources.append({
                    "chunk_id": r[0],
                    "chunk_index": r[1],
                    "page_number": r[2],
                    "snippet": r[3][:200] + ("…" if len(r[3]) > 200 else ""),
                })

            context_text = "\n\n---\n\n".join(context_parts)

            system_prompt = (
                f"Ты — AI-ассистент. Отвечай на вопрос пользователя строго на основе фрагментов документа «{doc_name}».\n"
                f"Если ответа в документе нет — честно скажи об этом.\n"
                f"После ответа укажи на какие фрагменты ты опирался (например: [стр. 5], [фрагмент 3]).\n\n"
                f"ФРАГМЕНТЫ ДОКУМЕНТА:\n{context_text}"
            )

            answer = call_yandex_gpt([
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": question},
            ])

            # Сохраняем чат
            cur.execute(
                f"""INSERT INTO {schema}.document_chats (document_id, user_id, question, answer, sources_json)
                    VALUES (%s, %s, %s, %s, %s) RETURNING id""",
                (doc_id, user["id"], question, answer, json.dumps(sources, ensure_ascii=False)),
            )
            chat_id = cur.fetchone()[0]
            conn.commit()

            return json_response({
                "chat_id": chat_id,
                "question": question,
                "answer": answer,
                "sources": sources,
            })

        # ACTION: история чата с документом
        if action == "get_chat_history":
            doc_id = body.get("document_id")
            if not doc_id:
                return json_response({"error": "Нужен document_id"}, 400)
            cur = conn.cursor()

            # 🔒 ИЗОЛЯЦИЯ: проверяем что user имеет доступ к проекту документа
            cur.execute(
                f"SELECT project_id FROM {schema}.documents WHERE id = %s",
                (int(doc_id),),
            )
            doc_row = cur.fetchone()
            if not doc_row:
                return json_response({"error": "Документ не найден"}, 404)
            cur.execute(
                f"SELECT role FROM {schema}.project_members WHERE project_id = %s AND user_id = %s",
                (doc_row[0], user["id"]),
            )
            if not cur.fetchone():
                return json_response({"error": "Нет доступа"}, 403)

            cur.execute(
                f"""SELECT c.id, c.question, c.answer, c.sources_json, c.created_at, u.name
                    FROM {schema}.document_chats c
                    JOIN {schema}.users u ON u.id = c.user_id
                    WHERE c.document_id = %s ORDER BY c.created_at DESC LIMIT 50""",
                (doc_id,),
            )
            rows = cur.fetchall()
            history = []
            for r in rows:
                sources = []
                if r[3]:
                    try:
                        sources = json.loads(r[3])
                    except Exception:
                        pass
                history.append({
                    "id": r[0], "question": r[1], "answer": r[2],
                    "sources": sources, "created_at": str(r[4]), "user_name": r[5],
                })
            return json_response({"history": history})

        return json_response({"error": "Неизвестное действие"}, 400)

    finally:
        conn.close()