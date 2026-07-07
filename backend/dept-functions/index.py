"""
dept-functions — управление функциями подразделения.

Actions:
  GET  functions          — список функций проекта
  POST create_function    — создать функцию вручную
  PUT  update_function    — обновить функцию
  POST extract_functions  — AI извлекает функции из base64-изображения (скрин), PDF (текстовый слой или скан ≤1 стр. через OCR) или DOCX. Возвращает черновик, ничего не сохраняет.
  POST confirm_functions  — сохраняет подтверждённый/отредактированный пользователем список функций из черновика
  GET  automation         — список записей автоматизации
  PUT  update_automation  — обновить запись автоматизации
  POST ai_recommend       — AI генерирует рекомендации по автоматизации функции
"""
import base64
import io
import json
import os
import urllib.request

import psycopg2

DB = os.environ["DATABASE_URL"]
SCHEMA = os.environ.get("MAIN_DB_SCHEMA", "t_p61016064_digital_innovation_i")
YANDEX_GPT_API_KEY = os.environ.get("YANDEX_GPT_API_KEY", "")
YANDEX_FOLDER_ID = os.environ.get("YANDEX_FOLDER_ID", "")
YANDEX_VISION_API_KEY = os.environ.get("YANDEX_GPT_API_KEY", "")

HORIZONS = {"short": "до 3 мес", "medium": "3–12 мес", "long": "1–3 года"}
STATUSES = {"manual": "Ручной", "partial": "Частично автоматизирован", "automated": "Автоматизирован", "planned": "Планируется"}


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


def get_user(conn, session_id: str):
    if not session_id:
        return None
    with conn.cursor() as cur:
        cur.execute(
            f"SELECT user_id FROM {SCHEMA}.sessions WHERE id = %s AND expires_at > NOW()",
            (session_id,),
        )
        row = cur.fetchone()
    return row[0] if row else None


def check_project_access(conn, project_id: int, user_id: int) -> bool:
    with conn.cursor() as cur:
        cur.execute(
            f"""SELECT 1 FROM {SCHEMA}.projects p
                LEFT JOIN {SCHEMA}.project_members m ON m.project_id = p.id AND m.user_id = %s
                WHERE p.id = %s AND (p.owner_id = %s OR m.user_id = %s) AND p.archived_at IS NULL""",
            (user_id, project_id, user_id, user_id),
        )
        return cur.fetchone() is not None


def yandex_gpt(prompt: str, system: str = "", max_tokens: int = 3000) -> str:
    url = "https://llm.api.cloud.yandex.net/foundationModels/v1/completion"
    messages = []
    if system:
        messages.append({"role": "system", "text": system})
    messages.append({"role": "user", "text": prompt})
    payload = json.dumps({
        "modelUri": f"gpt://{YANDEX_FOLDER_ID}/yandexgpt/latest",
        "completionOptions": {"stream": False, "temperature": 0.3, "maxTokens": max_tokens},
        "messages": messages,
    }).encode()
    req = urllib.request.Request(
        url,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Api-Key {YANDEX_GPT_API_KEY}",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=55) as resp:
        data = json.loads(resp.read())
    return data["result"]["alternatives"][0]["message"]["text"]


def yandex_vision_ocr(content_b64: str, mime_type: str = "image/png") -> str:
    """OCR через Yandex Vision API. Поддерживает изображения (JPEG/PNG) и PDF (до 1 страницы —
    ограничение самого Yandex Vision API для формата PDF)."""
    url = "https://ocr.api.cloud.yandex.net/ocr/v1/recognizeText"
    payload = json.dumps({
        "mimeType": mime_type,
        "languageCodes": ["ru", "en"],
        "content": content_b64,
    }).encode()
    req = urllib.request.Request(
        url,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Api-Key {YANDEX_VISION_API_KEY}",
            "x-folder-id": YANDEX_FOLDER_ID,
            "x-data-logging-enabled": "false",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read())
    blocks = data.get("result", {}).get("textAnnotation", {}).get("blocks", [])
    lines = []
    for block in blocks:
        for line in block.get("lines", []):
            text = " ".join(w.get("text", "") for w in line.get("words", []))
            if text.strip():
                lines.append(text.strip())
    return "\n".join(lines)


MAX_TEXT_LEN = 60000


def pdf_page_count(data: bytes) -> int:
    import PyPDF2
    reader = PyPDF2.PdfReader(io.BytesIO(data))
    return len(reader.pages)


def extract_text_from_pdf(data: bytes) -> str:
    """Извлекает текст из PDF с текстовым слоем."""
    import PyPDF2
    reader = PyPDF2.PdfReader(io.BytesIO(data))
    parts = [page.extract_text() or "" for page in reader.pages]
    return "\n".join(parts)[:MAX_TEXT_LEN]


def extract_text_from_docx(data: bytes) -> str:
    import docx
    doc = docx.Document(io.BytesIO(data))
    paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
    return "\n".join(paragraphs)[:MAX_TEXT_LEN]


def get_or_create_automation(conn, function_id: int, project_id: int) -> dict:
    with conn.cursor() as cur:
        cur.execute(
            f"SELECT id, current_tools, current_status, planned_tools, ai_potential_score, ai_recommendation, ai_recommendation_generated, implementation_horizon, notes FROM {SCHEMA}.dept_automation WHERE function_id = %s",
            (function_id,),
        )
        row = cur.fetchone()
        if row:
            return {"id": row[0], "current_tools": row[1], "current_status": row[2], "planned_tools": row[3],
                    "ai_potential_score": row[4], "ai_recommendation": row[5],
                    "ai_recommendation_generated": row[6], "implementation_horizon": row[7], "notes": row[8]}
        cur.execute(
            f"INSERT INTO {SCHEMA}.dept_automation (function_id, project_id) VALUES (%s, %s) RETURNING id",
            (function_id, project_id),
        )
        new_id = cur.fetchone()[0]
    return {"id": new_id, "current_tools": "", "current_status": "manual", "planned_tools": "",
            "ai_potential_score": 0, "ai_recommendation": "", "ai_recommendation_generated": False,
            "implementation_horizon": "medium", "notes": ""}


def handler(event: dict, context) -> dict:
    """Управление функциями подразделения: CRUD + AI-распознавание скринов + рекомендации по автоматизации."""
    if event.get("httpMethod") == "OPTIONS":
        return cors({})

    headers = event.get("headers") or {}
    session_id = headers.get("X-Session-Id", "")
    method = event.get("httpMethod", "GET")
    qs = event.get("queryStringParameters") or {}
    action = qs.get("action", "")
    body = {}
    if event.get("body"):
        body = json.loads(event["body"])

    conn = psycopg2.connect(DB)
    try:
        user_id = get_user(conn, session_id)
        if not user_id:
            return cors({"ok": False, "error": "Unauthorized"}, 401)

        project_id = int(qs.get("project_id") or body.get("project_id") or 0)
        if not project_id:
            return cors({"ok": False, "error": "project_id required"}, 400)
        if not check_project_access(conn, project_id, user_id):
            return cors({"ok": False, "error": "Нет доступа"}, 403)

        # ── Список функций ────────────────────────────────────────
        if method == "GET" and action == "functions":
            with conn.cursor() as cur:
                cur.execute(
                    f"""SELECT id, dept_name, title, description, goals, category, priority, source_image_url, created_at
                        FROM {SCHEMA}.dept_functions
                        WHERE project_id = %s ORDER BY priority, id""",
                    (project_id,),
                )
                rows = cur.fetchall()
            functions = [
                {"id": r[0], "dept_name": r[1], "title": r[2], "description": r[3],
                 "goals": r[4], "category": r[5], "priority": r[6], "source_image_url": r[7],
                 "created_at": r[8]}
                for r in rows
            ]
            return cors({"ok": True, "functions": functions})

        # ── Создать функцию вручную ───────────────────────────────
        if method == "POST" and action == "create_function":
            title = (body.get("title") or "").strip()
            if not title:
                return cors({"ok": False, "error": "title required"}, 400)
            with conn.cursor() as cur:
                cur.execute(
                    f"""INSERT INTO {SCHEMA}.dept_functions
                        (project_id, dept_name, title, description, goals, category, priority, created_by)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s) RETURNING id""",
                    (project_id, body.get("dept_name", ""), title,
                     body.get("description", ""), body.get("goals", ""),
                     body.get("category", "operational"),
                     int(body.get("priority", 0)), user_id),
                )
                func_id = cur.fetchone()[0]
            get_or_create_automation(conn, func_id, project_id)
            conn.commit()
            return cors({"ok": True, "id": func_id})

        # ── Обновить функцию ──────────────────────────────────────
        if method == "PUT" and action == "update_function":
            func_id = int(body.get("id") or 0)
            if not func_id:
                return cors({"ok": False, "error": "id required"}, 400)
            with conn.cursor() as cur:
                cur.execute(
                    f"""UPDATE {SCHEMA}.dept_functions
                        SET dept_name=%s, title=%s, description=%s, goals=%s, category=%s, priority=%s, updated_at=NOW()
                        WHERE id=%s AND project_id=%s""",
                    (body.get("dept_name", ""), body.get("title", ""), body.get("description", ""),
                     body.get("goals", ""), body.get("category", "operational"),
                     int(body.get("priority", 0)), func_id, project_id),
                )
            conn.commit()
            return cors({"ok": True})

        # ── AI извлечение функций из скрина / документа (PDF, DOCX) ─
        if method == "POST" and action == "extract_functions":
            image_b64 = body.get("image_b64", "")
            file_b64 = body.get("file_b64", "")
            file_type = (body.get("file_type") or "").lower()
            dept_name = (body.get("dept_name") or "").strip()
            if not image_b64 and not file_b64:
                return cors({"ok": False, "error": "image_b64 или file_b64 required"}, 400)

            if image_b64:
                ocr_text = yandex_vision_ocr(image_b64, "image/png")
            else:
                file_bytes = base64.b64decode(file_b64)
                if file_type == "pdf":
                    ocr_text = extract_text_from_pdf(file_bytes)
                    if not ocr_text.strip():
                        # Похоже на скан без текстового слоя — пробуем распознать через Vision OCR.
                        # Ограничение самого Yandex Vision API: PDF поддерживается только на 1 страницу.
                        pages = pdf_page_count(file_bytes)
                        if pages > 1:
                            return cors({"ok": False, "error": f"Это скан без текстового слоя на {pages} страниц. Распознавание сканов поддерживает только 1 страницу за раз — загрузите документ постранично как отдельные изображения (скрины)."}, 400)
                        ocr_text = yandex_vision_ocr(file_b64, "application/pdf")
                        if not ocr_text.strip():
                            return cors({"ok": False, "error": "Не удалось распознать текст в PDF."}, 400)
                elif file_type == "docx":
                    ocr_text = extract_text_from_docx(file_bytes)
                    if not ocr_text.strip():
                        return cors({"ok": False, "error": "Не удалось извлечь текст из DOCX."}, 400)
                else:
                    return cors({"ok": False, "error": "file_type должен быть pdf или docx"}, 400)

            system = """Ты эксперт по организационному анализу. 
Твоя задача — извлечь из текста положения о подразделении структурированный список функций и целей.
Отвечай строго в формате JSON — массив объектов. Никакого другого текста кроме JSON."""

            prompt = f"""Из текста положения о подразделении извлеки все функции и цели.

Текст положения:
{ocr_text}

Верни JSON-массив объектов, каждый объект:
{{
  "title": "краткое название функции (до 10 слов)",
  "description": "детальное описание функции из документа",
  "goals": "цели которые преследует эта функция",
  "category": "одно из: regulatory/operational/analytical/communication/control/planning"
}}

Только JSON, без пояснений."""

            raw = yandex_gpt(prompt, system, max_tokens=4000)
            start = raw.find("[")
            end = raw.rfind("]") + 1
            extracted = json.loads(raw[start:end]) if start >= 0 else []

            # Ничего не сохраняем в БД — только возвращаем черновик для проверки пользователем.
            # Сохранение происходит через action=confirm_functions после подтверждения.
            draft = [
                {"title": f.get("title", ""), "description": f.get("description", ""),
                 "goals": f.get("goals", ""), "category": f.get("category", "operational")}
                for f in extracted
            ]
            return cors({"ok": True, "functions": draft, "dept_name": dept_name, "ocr_text": ocr_text})

        # ── Подтверждение черновика функций после проверки пользователем ─
        if method == "POST" and action == "confirm_functions":
            items = body.get("functions") or []
            if not isinstance(items, list) or not items:
                return cors({"ok": False, "error": "functions (непустой список) required"}, 400)

            created_ids = []
            for i, f in enumerate(items):
                title = (f.get("title") or "").strip()
                if not title:
                    continue
                with conn.cursor() as cur:
                    cur.execute(
                        f"""INSERT INTO {SCHEMA}.dept_functions
                            (project_id, dept_name, title, description, goals, category, priority, created_by)
                            VALUES (%s, %s, %s, %s, %s, %s, %s, %s) RETURNING id""",
                        (project_id, (f.get("dept_name") or "").strip(), title,
                         f.get("description", ""), f.get("goals", ""),
                         f.get("category", "operational"), i, user_id),
                    )
                    func_id = cur.fetchone()[0]
                get_or_create_automation(conn, func_id, project_id)
                created_ids.append(func_id)

            conn.commit()
            return cors({"ok": True, "created": len(created_ids), "ids": created_ids})

        # ── Список автоматизации ──────────────────────────────────
        if method == "GET" and action == "automation":
            with conn.cursor() as cur:
                cur.execute(
                    f"""SELECT a.id, a.function_id, f.title, f.dept_name, f.category,
                               a.current_tools, a.current_status, a.planned_tools,
                               a.ai_potential_score, a.ai_recommendation, a.ai_recommendation_generated,
                               a.implementation_horizon, a.notes
                        FROM {SCHEMA}.dept_automation a
                        JOIN {SCHEMA}.dept_functions f ON f.id = a.function_id
                        WHERE a.project_id = %s ORDER BY a.ai_potential_score DESC, f.priority""",
                    (project_id,),
                )
                rows = cur.fetchall()
            result = [
                {"id": r[0], "function_id": r[1], "function_title": r[2], "dept_name": r[3],
                 "category": r[4], "current_tools": r[5], "current_status": r[6],
                 "planned_tools": r[7], "ai_potential_score": r[8], "ai_recommendation": r[9],
                 "ai_recommendation_generated": r[10], "implementation_horizon": r[11], "notes": r[12]}
                for r in rows
            ]
            return cors({"ok": True, "automation": result})

        # ── Обновить автоматизацию ────────────────────────────────
        if method == "PUT" and action == "update_automation":
            auto_id = int(body.get("id") or 0)
            if not auto_id:
                return cors({"ok": False, "error": "id required"}, 400)
            with conn.cursor() as cur:
                cur.execute(
                    f"""UPDATE {SCHEMA}.dept_automation
                        SET current_tools=%s, current_status=%s, planned_tools=%s,
                            implementation_horizon=%s, notes=%s, updated_at=NOW()
                        WHERE id=%s AND project_id=%s""",
                    (body.get("current_tools", ""), body.get("current_status", "manual"),
                     body.get("planned_tools", ""), body.get("implementation_horizon", "medium"),
                     body.get("notes", ""), auto_id, project_id),
                )
            conn.commit()
            return cors({"ok": True})

        # ── AI рекомендация по автоматизации функции ─────────────
        if method == "POST" and action == "ai_recommend":
            func_id = int(body.get("function_id") or 0)
            if not func_id:
                return cors({"ok": False, "error": "function_id required"}, 400)

            with conn.cursor() as cur:
                cur.execute(
                    f"""SELECT f.title, f.description, f.goals, f.category,
                               a.id, a.current_tools, a.current_status, a.notes
                        FROM {SCHEMA}.dept_functions f
                        LEFT JOIN {SCHEMA}.dept_automation a ON a.function_id = f.id
                        WHERE f.id = %s AND f.project_id = %s""",
                    (func_id, project_id),
                )
                row = cur.fetchone()
            if not row:
                return cors({"ok": False, "error": "Функция не найдена"}, 404)

            title, desc, goals, category, auto_id, cur_tools, cur_status, notes = row

            system = """Ты эксперт по цифровой трансформации и автоматизации бизнес-процессов в госсекторе и корпоративной среде.
Давай конкретные, реалистичные рекомендации с примерами реальных инструментов."""

            prompt = f"""Оцени потенциал автоматизации и дай рекомендации для следующей функции подразделения:

Функция: {title}
Описание: {desc}
Цели: {goals}
Категория: {category}
Текущие инструменты: {cur_tools or 'не указаны'}
Текущий статус: {cur_status}
Заметки: {notes or 'нет'}

Дай ответ строго в JSON:
{{
  "ai_potential_score": <число от 0 до 10, где 10 = максимальный потенциал автоматизации>,
  "ai_recommendation": "<подробный текст 200-400 слов: что автоматизировать, какими инструментами (RPA, AI, low-code, конкретные системы), ожидаемый эффект, риски, приоритет внедрения>",
  "implementation_horizon": "<short|medium|long>",
  "quick_wins": ["<конкретное действие 1>", "<конкретное действие 2>", "<конкретное действие 3>"]
}}

Только JSON, без пояснений."""

            raw = yandex_gpt(prompt, system, max_tokens=2000)
            start = raw.find("{")
            end = raw.rfind("}") + 1
            rec = json.loads(raw[start:end]) if start >= 0 else {}

            score = int(rec.get("ai_potential_score", 5))
            recommendation = rec.get("ai_recommendation", raw)
            horizon = rec.get("implementation_horizon", "medium")
            quick_wins = rec.get("quick_wins", [])

            with conn.cursor() as cur:
                cur.execute(
                    f"""UPDATE {SCHEMA}.dept_automation
                        SET ai_potential_score=%s, ai_recommendation=%s,
                            implementation_horizon=%s, ai_recommendation_generated=TRUE, updated_at=NOW()
                        WHERE id=%s""",
                    (score, recommendation, horizon, auto_id),
                )
            conn.commit()

            return cors({
                "ok": True,
                "ai_potential_score": score,
                "ai_recommendation": recommendation,
                "implementation_horizon": horizon,
                "quick_wins": quick_wins,
            })

        return cors({"ok": False, "error": f"Unknown action: {action}"}, 400)

    finally:
        conn.close()