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
  GET  function_processes — список процессов, связанных с функцией
  POST link_process       — привязать существующий процесс к функции
  DELETE unlink_process    — отвязать процесс от функции
  POST create_and_link_process — создать новый процесс (в wb_processes) и сразу связать с функцией
  GET  org_tree           — оргдерево проекта (узлы + число функций + непривязанные)
  GET  org_functions      — функции узла (роли, направления, автоматизация); include_children=true — с дочерними
  GET  unassigned_functions — функции без привязки к оргединице
  POST assign_org_unit    — привязать функцию к узлу (owner/co_executor/participant/reviewer)
  DELETE unassign_org_unit — снять привязку функции к узлу
  POST assign_direction   — привязать код направления (18, 93, 32.2…) к функции
  DELETE unassign_direction — снять направление
  GET  overlaps_report    — отчёт «Пересечения функций»: кластеры дублей между узлами + матрица узел×узел + связь с автоматизацией
"""
import base64
import io
import json
import os
import re
import urllib.error
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
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read())
    except urllib.error.HTTPError as e:
        err_body = e.read().decode(errors="replace")
        print(f"[VISION_OCR] HTTPError {e.code}: {err_body}")
        raise RuntimeError(f"Vision API {e.code}: {err_body}") from e
    except Exception as e:
        print(f"[VISION_OCR] {type(e).__name__}: {e}")
        raise
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


# Служебные/стоп-слова, которые не несут смысла при сравнении функций
_STOP_WORDS = {
    "и", "в", "во", "на", "по", "с", "со", "к", "о", "об", "от", "для", "при",
    "а", "также", "или", "их", "его", "ее", "том", "числе", "части", "рамках",
    "целях", "том числе", "банка", "подразделения", "деятельности",
}

# Приведение частых глагольных форм к канону (грубая лемматизация «действия»)
_VERB_CANON = [
    (r"осуществлени\w*|осуществля\w*", "осуществление"),
    (r"обеспечени\w*|обеспечива\w*", "обеспечение"),
    (r"разработк\w*|разрабат\w*", "разработка"),
    (r"проведени\w*|провод\w*", "проведение"),
    (r"организаци\w*|организу\w*", "организация"),
    (r"подготовк\w*|подготов\w*", "подготовка"),
    (r"участи\w*|участв\w*", "участие"),
    (r"консультировани\w*|консультир\w*|методическ\w+ помощ\w*", "консультирование"),
    (r"выявлени\w*|выявля\w*", "выявление"),
    (r"контрол\w*", "контроль"),
    (r"мониторинг\w*", "мониторинг"),
    (r"оценк\w*|оценива\w*", "оценка"),
    (r"анализ\w*|анализир\w*", "анализ"),
    (r"взаимодействи\w*", "взаимодействие"),
    (r"формировани\w*|формиру\w*", "формирование"),
    (r"согласовани\w*|согласу\w*", "согласование"),
    (r"рассмотрени\w*|рассматрив\w*", "рассмотрение"),
]


def normalize_function_text(text: str) -> str:
    """Нормализует формулировку функции для exact/normalized-сравнения:
    lower-case, чистка пунктуации, лемматизация частых глаголов, удаление стоп-слов."""
    t = (text or "").lower().replace("ё", "е")
    t = re.sub(r"[^\w\s]", " ", t)
    for pattern, canon in _VERB_CANON:
        t = re.sub(pattern, canon, t)
    words = [w for w in t.split() if w and w not in _STOP_WORDS and len(w) > 2]
    words.sort()
    return " ".join(words)


def find_org_unit_by_code(conn, project_id: int, code: str):
    """Находит id узла оргдерева по коду раздела (4.1.2 / 4.3.3...)."""
    code = (code or "").strip().rstrip(".")
    if not code:
        return None
    with conn.cursor() as cur:
        cur.execute(
            f"SELECT id FROM {SCHEMA}.org_units WHERE project_id = %s AND code = %s AND is_archived = false LIMIT 1",
            (project_id, code),
        )
        row = cur.fetchone()
    return row[0] if row else None


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
            image_mime = (body.get("image_mime") or "image/png").lower()
            if image_mime not in ("image/png", "image/jpeg", "image/jpg"):
                image_mime = "image/png"
            if image_mime == "image/jpg":
                image_mime = "image/jpeg"
            file_b64 = body.get("file_b64", "")
            file_type = (body.get("file_type") or "").lower()
            dept_name = (body.get("dept_name") or "").strip()
            if not image_b64 and not file_b64:
                return cors({"ok": False, "error": "image_b64 или file_b64 required"}, 400)

            print(f"[EXTRACT] image_b64={bool(image_b64)} mime={image_mime} file_type={file_type} vision_key_len={len(YANDEX_VISION_API_KEY)} folder={bool(YANDEX_FOLDER_ID)}")
            try:
                if image_b64:
                    ocr_text = yandex_vision_ocr(image_b64, image_mime)
                    print(f"[EXTRACT] ocr_text_len={len(ocr_text)}")
                else:
                    try:
                        file_bytes = base64.b64decode(file_b64, validate=True)
                    except Exception:
                        return cors({"ok": False, "error": "Файл повреждён или имеет неверный формат"}, 400)
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
            except RuntimeError as e:
                return cors({"ok": False, "error": f"Не удалось распознать файл: {e}"}, 400)
            except Exception:
                return cors({"ok": False, "error": "Файл повреждён, имеет неверный формат или не поддерживается"}, 400)

            system = """Ты эксперт по организационному анализу банковских подразделений.
Ты анализируешь текст, распознанный OCR из положения о подразделении (часто это таблица).
Отвечай ТОЛЬКО валидным JSON-массивом объектов, без пояснений и markdown."""

            prompt = f"""Ниже — текст (распознан OCR, возможны опечатки и разрывы) из положения о подразделении банка.
Обычно это таблица: слева — название управления/отдела/группы (например «4.1. Управление методологии и организации процессов»),
а напротив него в соседней колонке маркированным списком (буллетами «•») перечислены ВЫПОЛНЯЕМЫЕ ИМ ФУНКЦИИ.
Также встречаются колонки «Направление деятельности» и «Область специализации».

ВАЖНО:
- Каждый пункт маркированного списка (каждый буллет/абзац действия — «Разработка…», «Осуществление…», «Проведение…», «Организация…», «Обеспечение…», «Подготовка…», «Участие…», «Консультирование…» и т.п.) — это ОТДЕЛЬНАЯ ФУНКЦИЯ. Извлекай их все.
- Слово «функция» в тексте явно НЕ пишется — определяй функции по смыслу: это описание действия/деятельности подразделения.
- Не пропускай функции из-за того, что текст выглядит как обычный абзац. Сопоставляй и извлекай смысл.
- Если функций много — верни их все, каждую отдельным объектом.

Текст:
{ocr_text}

Верни JSON-массив. Каждый объект:
{{
  "title": "краткое название функции глаголом/отглагольным существительным, до 10 слов",
  "description": "полный текст функции из документа (можно слегка причесать опечатки OCR)",
  "goals": "цель функции, если понятна из контекста, иначе пустая строка",
  "category": "одно из: regulatory (нормативка, ПВК, методология), operational (операционная деятельность), analytical (анализ, аналитика, оценка рисков), communication (консультирование, взаимодействие, ответы на обращения), control (контроль, проверки, мониторинг, выявление), planning (планирование, разработка ТЗ, автоматизация)",
  "source_section_code": "код структурного пункта (например 4.1.2, 4.3.3), из блока которого взята функция; если рядом с функцией стоит номер управления/отдела/группы — укажи его, иначе пустая строка"
}}

Только JSON-массив, без текста до и после."""

            def parse_functions(text: str) -> list:
                t = text.strip()
                if "```" in t:
                    t = t.replace("```json", "```").replace("```JSON", "```")
                    parts = t.split("```")
                    for part in parts:
                        if "[" in part and "]" in part:
                            t = part
                            break
                s = t.find("[")
                e = t.rfind("]") + 1
                if s < 0 or e <= s:
                    return []
                try:
                    data = json.loads(t[s:e])
                    return data if isinstance(data, list) else []
                except json.JSONDecodeError as err:
                    print(f"[EXTRACT] JSON parse error: {err}")
                    return []

            extracted = []
            for attempt in range(2):
                raw = yandex_gpt(prompt, system, max_tokens=8000)
                print(f"[EXTRACT] attempt={attempt} gpt_raw_len={len(raw)} preview={raw[:150]!r}")
                extracted = parse_functions(raw)
                if extracted:
                    break
                print(f"[EXTRACT] attempt={attempt} empty, retrying" if attempt == 0 else "[EXTRACT] final empty")
            print(f"[EXTRACT] extracted_count={len(extracted)}")

            if not extracted:
                return cors({"ok": False, "error": "ИИ не смог выделить функции из текста. Проверьте, что на скрине есть перечень функций подразделения, или добавьте функции вручную.", "ocr_text": ocr_text}, 200)

            # Ничего не сохраняем в БД — только возвращаем черновик для проверки пользователем.
            # Сохранение происходит через action=confirm_functions после подтверждения.
            draft = [
                {"title": f.get("title", ""), "description": f.get("description", ""),
                 "goals": f.get("goals", ""), "category": f.get("category", "operational"),
                 "source_section_code": (f.get("source_section_code") or "").strip()}
                for f in extracted
            ]
            return cors({"ok": True, "functions": draft, "dept_name": dept_name, "ocr_text": ocr_text})

        # ── Подтверждение черновика функций после проверки пользователем ─
        if method == "POST" and action == "confirm_functions":
            items = body.get("functions") or []
            if not isinstance(items, list) or not items:
                return cors({"ok": False, "error": "functions (непустой список) required"}, 400)

            created_ids = []
            auto_linked = 0
            for i, f in enumerate(items):
                title = (f.get("title") or "").strip()
                if not title:
                    continue
                section_code = (f.get("source_section_code") or "").strip()
                normalized = normalize_function_text(title)
                with conn.cursor() as cur:
                    cur.execute(
                        f"""INSERT INTO {SCHEMA}.dept_functions
                            (project_id, dept_name, title, description, goals, category, priority, created_by,
                             normalized_title, source_section_code)
                            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id""",
                        (project_id, (f.get("dept_name") or "").strip(), title,
                         f.get("description", ""), f.get("goals", ""),
                         f.get("category", "operational"), i, user_id,
                         normalized, section_code),
                    )
                    func_id = cur.fetchone()[0]
                get_or_create_automation(conn, func_id, project_id)
                # Автопредзаполнение в узел дерева по коду раздела источника
                unit_id = find_org_unit_by_code(conn, project_id, section_code)
                if unit_id:
                    with conn.cursor() as cur:
                        cur.execute(
                            f"""INSERT INTO {SCHEMA}.function_org_units (function_id, org_unit_id, role, confidence, source_ref)
                                VALUES (%s, %s, 'owner', 0.7, %s)
                                ON CONFLICT (function_id, org_unit_id, role) DO NOTHING""",
                            (func_id, unit_id, f"auto:{section_code}"),
                        )
                    auto_linked += 1
                created_ids.append(func_id)

            conn.commit()

            # Итог дозагрузки (source of truth для post-import баннера)
            left_unmatched = 0
            if created_ids:
                with conn.cursor() as cur:
                    cur.execute(
                        f"""SELECT COUNT(*) FROM {SCHEMA}.dept_functions f
                            WHERE f.id = ANY(%s)
                              AND NOT EXISTS (SELECT 1 FROM {SCHEMA}.function_org_units l WHERE l.function_id = f.id)""",
                        (created_ids,),
                    )
                    left_unmatched = cur.fetchone()[0]
            # статус покрытия после импорта: partial, если остались тонкие управления или unmatched
            with conn.cursor() as cur:
                cur.execute(
                    f"""SELECT COUNT(*) FROM {SCHEMA}.dept_functions f
                        WHERE f.project_id = %s AND f.dept_name NOT LIKE '[SMOKETEST%%'
                          AND NOT EXISTS (SELECT 1 FROM {SCHEMA}.function_org_units l WHERE l.function_id = f.id)""",
                    (project_id,),
                )
                total_unassigned = cur.fetchone()[0]
                cur.execute(
                    f"""SELECT COUNT(*) FROM {SCHEMA}.org_units u
                        WHERE u.project_id = %s AND u.is_archived = false AND u.type = 'management'
                          AND (SELECT COUNT(*) FROM {SCHEMA}.function_org_units l WHERE l.org_unit_id = u.id) < 3""",
                    (project_id,),
                )
                thin_mgmt = cur.fetchone()[0]
            coverage_status_after = "partial" if (total_unassigned > 0 or thin_mgmt > 0) else "complete"

            return cors({"ok": True, "created": len(created_ids), "ids": created_ids,
                         "auto_linked": auto_linked, "left_unmatched": left_unmatched,
                         "coverage_status_after": coverage_status_after})

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

        # ── Список процессов, связанных с функцией ───────────────
        if method == "GET" and action == "function_processes":
            func_id = int(qs.get("function_id") or 0)
            if not func_id:
                return cors({"ok": False, "error": "function_id required"}, 400)
            with conn.cursor() as cur:
                cur.execute(
                    f"""SELECT 1 FROM {SCHEMA}.dept_functions WHERE id = %s AND project_id = %s""",
                    (func_id, project_id),
                )
                if not cur.fetchone():
                    return cors({"ok": False, "error": "Функция не найдена"}, 404)
            with conn.cursor() as cur:
                cur.execute(
                    f"""SELECT p.id, p.title, p.description, p.department, p.maturity_level,
                               p.digital_maturity, p.ai_potential,
                               COUNT(s.id) as step_count
                        FROM {SCHEMA}.dept_function_process_links lnk
                        JOIN {SCHEMA}.wb_processes p ON p.id = lnk.process_id
                        LEFT JOIN {SCHEMA}.wb_process_steps s ON s.process_id = p.id AND s.is_archived = FALSE
                        WHERE lnk.function_id = %s AND p.is_archived = FALSE
                        GROUP BY p.id ORDER BY p.created_at DESC""",
                    (func_id,),
                )
                rows = cur.fetchall()
            linked = [
                {"id": r[0], "title": r[1], "description": r[2], "department": r[3],
                 "maturity_level": r[4], "digital_maturity": r[5], "ai_potential": r[6], "step_count": r[7]}
                for r in rows
            ]
            return cors({"ok": True, "processes": linked})

        # ── Привязать существующий процесс к функции ─────────────
        if method == "POST" and action == "link_process":
            func_id = int(body.get("function_id") or 0)
            proc_id = int(body.get("process_id") or 0)
            if not func_id or not proc_id:
                return cors({"ok": False, "error": "function_id и process_id required"}, 400)
            with conn.cursor() as cur:
                cur.execute(
                    f"SELECT 1 FROM {SCHEMA}.dept_functions WHERE id = %s AND project_id = %s",
                    (func_id, project_id),
                )
                if not cur.fetchone():
                    return cors({"ok": False, "error": "Функция не найдена"}, 404)
                cur.execute(
                    f"""SELECT 1 FROM {SCHEMA}.wb_processes p
                        JOIN {SCHEMA}.wb_case_process_links lnk ON lnk.process_id = p.id AND lnk.case_id = %s
                        WHERE p.id = %s AND p.is_archived = FALSE""",
                    (project_id, proc_id),
                )
                if not cur.fetchone():
                    return cors({"ok": False, "error": "Процесс не найден в этом проекте"}, 404)
                cur.execute(
                    f"""INSERT INTO {SCHEMA}.dept_function_process_links (function_id, process_id, created_by)
                        VALUES (%s, %s, %s) ON CONFLICT DO NOTHING""",
                    (func_id, proc_id, user_id),
                )
            conn.commit()
            return cors({"ok": True})

        # ── Отвязать процесс от функции ───────────────────────────
        if method == "DELETE" and action == "unlink_process":
            func_id = int(qs.get("function_id") or body.get("function_id") or 0)
            proc_id = int(qs.get("process_id") or body.get("process_id") or 0)
            if not func_id or not proc_id:
                return cors({"ok": False, "error": "function_id и process_id required"}, 400)
            with conn.cursor() as cur:
                cur.execute(
                    f"SELECT 1 FROM {SCHEMA}.dept_functions WHERE id = %s AND project_id = %s",
                    (func_id, project_id),
                )
                if not cur.fetchone():
                    return cors({"ok": False, "error": "Функция не найдена"}, 404)
                cur.execute(
                    f"""DELETE FROM {SCHEMA}.dept_function_process_links
                        WHERE function_id = %s AND process_id = %s""",
                    (func_id, proc_id),
                )
            conn.commit()
            return cors({"ok": True})

        # ── Создать новый процесс и сразу связать с функцией ─────
        if method == "POST" and action == "create_and_link_process":
            func_id = int(body.get("function_id") or 0)
            title = (body.get("title") or "").strip()
            if not func_id or not title:
                return cors({"ok": False, "error": "function_id и title required"}, 400)
            with conn.cursor() as cur:
                cur.execute(
                    f"SELECT dept_name FROM {SCHEMA}.dept_functions WHERE id = %s AND project_id = %s",
                    (func_id, project_id),
                )
                row = cur.fetchone()
                if not row:
                    return cors({"ok": False, "error": "Функция не найдена"}, 404)
                dept_name = row[0]
                cur.execute(
                    f"""INSERT INTO {SCHEMA}.wb_processes
                        (user_id, title, description, department, maturity_level, digital_maturity, ai_potential)
                        VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id""",
                    (user_id, title, body.get("description", ""), dept_name,
                     body.get("maturity_level", "initial"), body.get("digital_maturity", "paper"),
                     body.get("ai_potential", "unknown")),
                )
                proc_id = cur.fetchone()[0]
                cur.execute(
                    f"""INSERT INTO {SCHEMA}.wb_case_process_links (case_id, process_id)
                        VALUES (%s, %s) ON CONFLICT DO NOTHING""",
                    (project_id, proc_id),
                )
                cur.execute(
                    f"""INSERT INTO {SCHEMA}.dept_function_process_links (function_id, process_id, created_by)
                        VALUES (%s, %s, %s) ON CONFLICT DO NOTHING""",
                    (func_id, proc_id, user_id),
                )
            conn.commit()
            return cors({"ok": True, "id": proc_id})

        # ── Отчёт «Пересечения функций» (exact/normalized match) ──
        if method == "GET" and action == "overlaps_report":
            with conn.cursor() as cur:
                # Берём функции проекта, у которых есть привязка хотя бы к одному узлу,
                # группируем по нормализованной формулировке.
                cur.execute(
                    f"""SELECT f.id, f.title, f.normalized_title, f.category,
                               a.current_status, a.ai_potential_score
                        FROM {SCHEMA}.dept_functions f
                        LEFT JOIN {SCHEMA}.dept_automation a ON a.function_id = f.id
                        WHERE f.project_id = %s
                          AND f.dept_name NOT LIKE '[SMOKETEST%%'
                          AND COALESCE(f.normalized_title, '') <> ''""",
                    (project_id,),
                )
                frows = cur.fetchall()
                # id -> инфо
                finfo = {r[0]: {"id": r[0], "title": r[1], "norm": r[2], "category": r[3],
                                "automation_status": r[4] or "manual", "ai": r[5] or 0} for r in frows}
                fids = list(finfo.keys())
                # узлы каждой функции
                units_by_func: dict = {}
                dirs_by_func: dict = {}
                if fids:
                    cur.execute(
                        f"""SELECT l.function_id, l.role, u.id, u.code, u.name
                            FROM {SCHEMA}.function_org_units l
                            JOIN {SCHEMA}.org_units u ON u.id = l.org_unit_id
                            WHERE l.function_id = ANY(%s)""",
                        (fids,),
                    )
                    for r in cur.fetchall():
                        units_by_func.setdefault(r[0], []).append(
                            {"role": r[1], "unit_id": r[2], "code": r[3], "name": r[4]})
                    cur.execute(
                        f"""SELECT function_id, direction_code FROM {SCHEMA}.function_directions
                            WHERE function_id = ANY(%s)""",
                        (fids,),
                    )
                    for r in cur.fetchall():
                        dirs_by_func.setdefault(r[0], set()).add(r[1])

            # группировка по нормализованной формулировке
            groups: dict = {}
            for fid, info in finfo.items():
                groups.setdefault(info["norm"], []).append(fid)

            clusters = []
            matrix: dict = {}
            for norm, group_fids in groups.items():
                # уникальные узлы среди всех функций группы
                unit_ids = set()
                member_units = []
                for fid in group_fids:
                    for u in units_by_func.get(fid, []):
                        unit_ids.add(u["unit_id"])
                        member_units.append(u)
                # пересечение = одна и та же функция в 2+ разных узлах
                if len(unit_ids) < 2:
                    continue
                statuses = [finfo[fid]["automation_status"] for fid in group_fids]
                ais = [finfo[fid]["ai"] for fid in group_fids if finfo[fid]["ai"] > 0]
                all_dirs = set()
                for fid in group_fids:
                    all_dirs |= dirs_by_func.get(fid, set())
                # дедуп узлов для карточки
                seen = {}
                for u in member_units:
                    seen[u["unit_id"]] = u
                units_list = list(seen.values())
                clusters.append({
                    "canonical_name": finfo[group_fids[0]]["title"],
                    "normalized_key": norm,
                    "function_ids": group_fids,
                    "repeat_count": len(group_fids),
                    "unit_count": len(unit_ids),
                    "units": units_list,
                    "directions": sorted(all_dirs),
                    "manual_count": sum(1 for s in statuses if s == "manual"),
                    "avg_ai_potential": round(sum(ais) / len(ais)) if ais else 0,
                })
                # матрица узел×узел
                ulist = sorted(unit_ids)
                for a in range(len(ulist)):
                    for b in range(a + 1, len(ulist)):
                        key = f"{ulist[a]}_{ulist[b]}"
                        matrix[key] = matrix.get(key, 0) + 1

            clusters.sort(key=lambda c: (c["unit_count"], c["repeat_count"]), reverse=True)
            # имена узлов для матрицы
            unit_names = {}
            for c in clusters:
                for u in c["units"]:
                    unit_names[u["unit_id"]] = {"code": u["code"], "name": u["name"]}
            matrix_list = [
                {"unit_a": int(k.split("_")[0]), "unit_b": int(k.split("_")[1]), "count": v,
                 "a": unit_names.get(int(k.split("_")[0])), "b": unit_names.get(int(k.split("_")[1]))}
                for k, v in matrix.items()
            ]
            matrix_list.sort(key=lambda m: m["count"], reverse=True)
            return cors({"ok": True, "clusters": clusters, "matrix": matrix_list,
                         "total_overlaps": len(clusters)})

        # ── Оргдерево: список узлов с числом функций ──────────────
        if method == "GET" and action == "org_tree":
            with conn.cursor() as cur:
                cur.execute(
                    f"""SELECT u.id, u.code, u.name, u.type, u.parent_id, u.path, u.level, u.sort_order,
                               COALESCE(o.own_cnt, 0) AS own_cnt
                        FROM {SCHEMA}.org_units u
                        LEFT JOIN (
                            SELECT org_unit_id, COUNT(*) AS own_cnt
                            FROM {SCHEMA}.function_org_units GROUP BY org_unit_id
                        ) o ON o.org_unit_id = u.id
                        WHERE u.project_id = %s AND u.is_archived = false
                        ORDER BY u.sort_order, u.code""",
                    (project_id,),
                )
                nodes = [{"id": r[0], "code": r[1], "name": r[2], "type": r[3], "parent_id": r[4],
                          "path": r[5], "level": r[6], "sort_order": r[7], "own_count": r[8]}
                         for r in cur.fetchall()]
                # непривязанные функции проекта (без единой связи с оргединицей)
                cur.execute(
                    f"""SELECT COUNT(*) FROM {SCHEMA}.dept_functions f
                        WHERE f.project_id = %s
                          AND f.dept_name NOT LIKE '[SMOKETEST%%'
                          AND NOT EXISTS (SELECT 1 FROM {SCHEMA}.function_org_units l WHERE l.function_id = f.id)""",
                    (project_id,),
                )
                unassigned = cur.fetchone()[0]
                # Признак неполноты источника: управления (level=1, management) с малым числом
                # собственных функций + наличие функций с пустым source_section_code.
                cur.execute(
                    f"""SELECT COUNT(*) FROM {SCHEMA}.dept_functions f
                        WHERE f.project_id = %s
                          AND f.dept_name NOT LIKE '[SMOKETEST%%'
                          AND COALESCE(f.source_section_code, '') = ''""",
                    (project_id,),
                )
                missing_code_cnt = cur.fetchone()[0]

            # Управления с подозрительно малым покрытием (< 3 функций на узле)
            THIN_THRESHOLD = 3
            thin_mgmt = [
                {"code": n["code"], "name": n["name"], "own_count": n["own_count"]}
                for n in nodes
                if n["type"] == "management" and n["own_count"] < THIN_THRESHOLD
            ]
            coverage = {
                "status": "partial" if (thin_mgmt or unassigned > 0 or missing_code_cnt > 0) else "complete",
                "thin_managements": thin_mgmt,
                "missing_section_code_count": missing_code_cnt,
                "show_upload_reminder": bool(thin_mgmt or unassigned > 0 or missing_code_cnt > 0),
            }
            return cors({"ok": True, "nodes": nodes, "unassigned": unassigned, "coverage": coverage})

        # ── Функции узла (с ролями, направлениями, автоматизацией) ─
        if method == "GET" and action == "org_functions":
            org_unit_id = int(qs.get("org_unit_id") or 0)
            include_children = (qs.get("include_children") or "false").lower() == "true"
            if not org_unit_id:
                return cors({"ok": False, "error": "org_unit_id required"}, 400)
            with conn.cursor() as cur:
                if include_children:
                    cur.execute(
                        f"""WITH RECURSIVE sub AS (
                                SELECT id FROM {SCHEMA}.org_units WHERE id = %s
                                UNION ALL
                                SELECT c.id FROM {SCHEMA}.org_units c JOIN sub ON c.parent_id = sub.id
                            ) SELECT id FROM sub""",
                        (org_unit_id,),
                    )
                    unit_ids = [r[0] for r in cur.fetchall()]
                else:
                    unit_ids = [org_unit_id]
                cur.execute(
                    f"""SELECT DISTINCT f.id, f.title, f.description, f.category, f.priority,
                               l.role, l.org_unit_id, u.code AS unit_code,
                               a.current_status, a.ai_potential_score
                        FROM {SCHEMA}.function_org_units l
                        JOIN {SCHEMA}.dept_functions f ON f.id = l.function_id
                        JOIN {SCHEMA}.org_units u ON u.id = l.org_unit_id
                        LEFT JOIN {SCHEMA}.dept_automation a ON a.function_id = f.id
                        WHERE l.org_unit_id = ANY(%s)
                        ORDER BY f.priority DESC, f.title""",
                    (unit_ids,),
                )
                rows = cur.fetchall()
                fids = list({r[0] for r in rows})
                dirs_map: dict = {}
                if fids:
                    cur.execute(
                        f"""SELECT function_id, direction_code, direction_name
                            FROM {SCHEMA}.function_directions WHERE function_id = ANY(%s)
                            ORDER BY direction_code""",
                        (fids,),
                    )
                    for fr in cur.fetchall():
                        dirs_map.setdefault(fr[0], []).append({"code": fr[1], "name": fr[2]})
            funcs = [{"id": r[0], "title": r[1], "description": r[2], "category": r[3],
                      "priority": r[4], "role": r[5], "org_unit_id": r[6], "unit_code": r[7],
                      "automation_status": r[8] or "manual", "ai_potential_score": r[9] or 0,
                      "directions": dirs_map.get(r[0], [])}
                     for r in rows]
            return cors({"ok": True, "functions": funcs})

        # ── Непривязанные функции проекта ─────────────────────────
        if method == "GET" and action == "unassigned_functions":
            with conn.cursor() as cur:
                cur.execute(
                    f"""SELECT f.id, f.title, f.dept_name, f.category
                        FROM {SCHEMA}.dept_functions f
                        WHERE f.project_id = %s
                          AND f.dept_name NOT LIKE '[SMOKETEST%%'
                          AND NOT EXISTS (SELECT 1 FROM {SCHEMA}.function_org_units l WHERE l.function_id = f.id)
                        ORDER BY f.title""",
                    (project_id,),
                )
                funcs = [{"id": r[0], "title": r[1], "dept_name": r[2], "category": r[3]}
                         for r in cur.fetchall()]
            return cors({"ok": True, "functions": funcs})

        # ── Привязать функцию к узлу (owner/co_executor/...) ───────
        if method == "POST" and action == "assign_org_unit":
            func_id = int(body.get("function_id") or 0)
            org_unit_id = int(body.get("org_unit_id") or 0)
            role = (body.get("role") or "owner").strip()
            if role not in ("owner", "co_executor", "participant", "reviewer"):
                return cors({"ok": False, "error": "invalid role"}, 400)
            if not func_id or not org_unit_id:
                return cors({"ok": False, "error": "function_id и org_unit_id required"}, 400)
            with conn.cursor() as cur:
                cur.execute(
                    f"SELECT 1 FROM {SCHEMA}.dept_functions WHERE id = %s AND project_id = %s",
                    (func_id, project_id),
                )
                if not cur.fetchone():
                    return cors({"ok": False, "error": "Функция не найдена"}, 404)
                # правило "один owner": при назначении owner снимаем прежнего
                if role == "owner":
                    cur.execute(
                        f"DELETE FROM {SCHEMA}.function_org_units WHERE function_id = %s AND role = 'owner'",
                        (func_id,),
                    )
                cur.execute(
                    f"""INSERT INTO {SCHEMA}.function_org_units (function_id, org_unit_id, role, source_ref)
                        VALUES (%s, %s, %s, %s)
                        ON CONFLICT (function_id, org_unit_id, role) DO NOTHING""",
                    (func_id, org_unit_id, role, body.get("source_ref", "manual")),
                )
            conn.commit()
            return cors({"ok": True})

        # ── Снять привязку функции к узлу ─────────────────────────
        if method == "DELETE" and action == "unassign_org_unit":
            func_id = int(qs.get("function_id") or body.get("function_id") or 0)
            org_unit_id = int(qs.get("org_unit_id") or body.get("org_unit_id") or 0)
            role = (qs.get("role") or body.get("role") or "").strip()
            if not func_id or not org_unit_id:
                return cors({"ok": False, "error": "function_id и org_unit_id required"}, 400)
            with conn.cursor() as cur:
                if role:
                    cur.execute(
                        f"DELETE FROM {SCHEMA}.function_org_units WHERE function_id = %s AND org_unit_id = %s AND role = %s",
                        (func_id, org_unit_id, role),
                    )
                else:
                    cur.execute(
                        f"DELETE FROM {SCHEMA}.function_org_units WHERE function_id = %s AND org_unit_id = %s",
                        (func_id, org_unit_id),
                    )
            conn.commit()
            return cors({"ok": True})

        # ── Привязать направление к функции ───────────────────────
        if method == "POST" and action == "assign_direction":
            func_id = int(body.get("function_id") or 0)
            code = (body.get("direction_code") or "").strip()
            if not func_id or not code:
                return cors({"ok": False, "error": "function_id и direction_code required"}, 400)
            with conn.cursor() as cur:
                cur.execute(
                    f"""INSERT INTO {SCHEMA}.function_directions (function_id, direction_code, direction_name, source_ref)
                        VALUES (%s, %s, %s, %s)
                        ON CONFLICT (function_id, direction_code) DO UPDATE SET direction_name = EXCLUDED.direction_name""",
                    (func_id, code, body.get("direction_name", ""), body.get("source_ref", "manual")),
                )
            conn.commit()
            return cors({"ok": True})

        # ── Снять направление ─────────────────────────────────────
        if method == "DELETE" and action == "unassign_direction":
            func_id = int(qs.get("function_id") or body.get("function_id") or 0)
            code = (qs.get("direction_code") or body.get("direction_code") or "").strip()
            if not func_id or not code:
                return cors({"ok": False, "error": "function_id и direction_code required"}, 400)
            with conn.cursor() as cur:
                cur.execute(
                    f"DELETE FROM {SCHEMA}.function_directions WHERE function_id = %s AND direction_code = %s",
                    (func_id, code),
                )
            conn.commit()
            return cors({"ok": True})

        return cors({"ok": False, "error": f"Unknown action: {action}"}, 400)

    finally:
        conn.close()