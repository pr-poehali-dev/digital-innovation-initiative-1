"""
AI-генерация: анализ документов, структура презентации, текст слайдов, итерации.
Использует OpenAI GPT-4o для обработки загруженных материалов.
"""
import json
import os
import psycopg2


def get_db():
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    conn.autocommit = False
    return conn


def get_schema():
    return os.environ.get("MAIN_DB_SCHEMA", "public")


def cors_headers():
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-Session-Id",
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
        f"SELECT u.id, u.email, u.name FROM {schema}.sessions s JOIN {schema}.users u ON u.id = s.user_id WHERE s.id = %s AND s.expires_at > NOW()",
        (session_id,),
    )
    row = cur.fetchone()
    if row:
        return {"id": row[0], "email": row[1], "name": row[2]}
    return None


def call_openai(messages: list, model="gpt-4o") -> str:
    api_key = os.environ.get("OPENAI_API_KEY", "")
    if not api_key:
        return "[AI недоступен: не задан OPENAI_API_KEY. Добавьте ключ в настройках проекта.]"

    import urllib.request
    payload = json.dumps({
        "model": model,
        "messages": messages,
        "max_tokens": 4000,
        "temperature": 0.7,
    }).encode()

    req = urllib.request.Request(
        "https://api.openai.com/v1/chat/completions",
        data=payload,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            result = json.loads(resp.read())
            return result["choices"][0]["message"]["content"]
    except Exception as e:
        return f"[Ошибка AI: {e}]"


def build_system_prompt(task: dict, documents: list) -> str:
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

    for doc in documents:
        if doc["role"] == "excluded":
            continue
        role_names = {
            "standard": "НОРМАТИВНЫЙ ДОКУМЕНТ / СТАНДАРТ",
            "reference_presentation": "РЕФЕРЕНСНАЯ ПРЕЗЕНТАЦИЯ (образец формы)",
            "content_source": "СОДЕРЖАТЕЛЬНЫЙ МАТЕРИАЛ",
            "draft": "ЧЕРНОВИК / ТЕКУЩАЯ ВЕРСИЯ",
        }
        role_label = role_names.get(doc["role"], doc["role"].upper())
        parts.append(f"--- {role_label}: {doc['name']} ---")
        if doc.get("structure") and doc["role"] == "reference_presentation":
            parts.append("Структура слайдов:")
            for s in doc["structure"][:20]:
                parts.append(f"  Слайд {s['index']}: {s['title']}")
                if s.get("bullets"):
                    for b in s["bullets"][:3]:
                        parts.append(f"    • {b}")
        text = (doc.get("text") or "")[:8000]
        parts.append(text)
        parts.append("")

    parts.append("""При генерации:
1. Явно указывай источник каждого утверждения: [из стандарта], [из образца], [из материалов], [предложено AI]
2. Структурируй ответ чётко: заголовки слайдов, буллеты, заметки спикера
3. Соблюдай требования нормативного документа если он задан
4. Повторяй логику и стиль референсной презентации если она задана""")

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

        cur = conn.cursor()

        # POST /run — запустить генерацию
        if method == "POST" and path_parts[-1] == "run":
            task_id = body.get("task_id")
            user_prompt = body.get("prompt", "")

            if not task_id:
                return json_response({"error": "Нужен task_id"}, 400)

            # Загрузить задание
            cur.execute(
                f"""SELECT t.id, t.project_id, t.title, t.task_type, t.topic, t.goal, t.audience,
                    t.language, t.style, t.requested_slide_count, t.additional_instructions
                    FROM {schema}.tasks t WHERE t.id = %s""",
                (task_id,),
            )
            task_row = cur.fetchone()
            if not task_row:
                return json_response({"error": "Задание не найдено"}, 404)

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
                return json_response({"error": "Нет доступа"}, 403)

            # Загрузить документы задания с текстами
            cur.execute(
                f"""SELECT td.document_id, td.role, d.original_name, d.file_type,
                    d.extracted_text, d.structure_json
                    FROM {schema}.task_documents td
                    JOIN {schema}.documents d ON d.id = td.document_id
                    WHERE td.task_id = %s AND td.role != 'excluded'""",
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
                })

            # Определить номер версии
            cur.execute(
                f"SELECT COALESCE(MAX(version_number), 0) FROM {schema}.generation_runs WHERE task_id = %s",
                (task_id,),
            )
            last_version = cur.fetchone()[0]
            version_number = last_version + 1

            # Построить промпты
            system_prompt = build_system_prompt(task, documents)
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
            ai_result = call_openai(messages)

            # Сохранить результат
            result_json = json.dumps({"content": ai_result, "version": version_number}, ensure_ascii=False)
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
            })

        # GET /run/{run_id} — получить результат генерации
        if method == "GET" and len(path_parts) >= 2 and path_parts[-2] == "run":
            run_id = int(path_parts[-1])
            cur.execute(
                f"""SELECT gr.id, gr.task_id, gr.version_number, gr.result_json, gr.output_summary, gr.status, gr.created_at, u.name
                    FROM {schema}.generation_runs gr JOIN {schema}.users u ON u.id = gr.created_by
                    WHERE gr.id = %s""",
                (run_id,),
            )
            row = cur.fetchone()
            if not row:
                return json_response({"error": "Не найдено"}, 404)

            result_content = None
            if row[3]:
                try:
                    result_content = json.loads(row[3]).get("content")
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
            })

        return json_response({"error": "Not found"}, 404)

    finally:
        conn.close()
