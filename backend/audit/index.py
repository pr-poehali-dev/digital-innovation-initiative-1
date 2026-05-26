"""
Presentation Audit — проверка готовой презентации на соответствие документам.

Действия:
  audit.run     — запустить анализ PPTX против документов с ролями
  audit.get     — получить результат аудита по run_id
  audit.list    — список аудитов проекта
"""
import json
import os
import io
import uuid
import base64
import logging
import psycopg2

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("audit")

ROLE_PRIORITY = {
    "standard":  1,
    "criteria":  2,
    "source":    3,
    "material":  4,
    "template":  5,
    "example":   6,
}

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Session-Id",
}


def get_db():
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    conn.autocommit = False
    return conn


def get_schema():
    return os.environ.get("MAIN_DB_SCHEMA", "public")


def ok_resp(data, origin=None):
    return {
        "statusCode": 200,
        "headers": {**CORS_HEADERS, "Content-Type": "application/json"},
        "body": json.dumps({"ok": True, "data": data}, ensure_ascii=False, default=str),
    }


def err_resp(msg, status=400, origin=None):
    return {
        "statusCode": status,
        "headers": {**CORS_HEADERS, "Content-Type": "application/json"},
        "body": json.dumps({"ok": False, "error": msg}, ensure_ascii=False),
    }


def get_user(conn, session_id: str):
    if not session_id:
        return None
    schema = get_schema()
    cur = conn.cursor()
    cur.execute(
        f"SELECT u.id, u.email FROM {schema}.sessions s "
        f"JOIN {schema}.users u ON u.id = s.user_id "
        f"WHERE s.id = %s AND s.expires_at > NOW()",
        (session_id,),
    )
    row = cur.fetchone()
    return {"id": row[0], "email": row[1]} if row else None


# ------------------------------------------------------------------ #
#  PPTX text extractor                                                #
# ------------------------------------------------------------------ #

def extract_pptx_text(pptx_bytes: bytes) -> list:
    """Возвращает список {"slide": N, "title": str, "text": str}."""
    try:
        from pptx import Presentation
        prs = Presentation(io.BytesIO(pptx_bytes))
        slides = []
        for i, slide in enumerate(prs.slides, 1):
            title = ""
            texts = []
            for shape in slide.shapes:
                if not shape.has_text_frame:
                    continue
                t = shape.text_frame.text.strip()
                if not t:
                    continue
                if shape.shape_type == 13:  # picture
                    continue
                if not title and len(t) < 120 and shape.shape_id in (2, 3) or (
                    hasattr(shape, "placeholder_format") and shape.placeholder_format
                    and shape.placeholder_format.idx == 0
                ):
                    title = t
                else:
                    texts.append(t)
            # Notes
            notes_text = ""
            if slide.has_notes_slide:
                notes_text = slide.notes_slide.notes_text_frame.text.strip()
            full_text = "\n".join(texts)
            slides.append({
                "slide": i,
                "title": title or f"Слайд {i}",
                "text": full_text,
                "notes": notes_text,
            })
        return slides
    except Exception as e:
        return [{"slide": 1, "title": "Ошибка", "text": f"[Не удалось прочитать PPTX: {e}]", "notes": ""}]


# ------------------------------------------------------------------ #
#  YandexGPT call                                                     #
# ------------------------------------------------------------------ #

def call_gpt(messages: list) -> str:
    import urllib.request
    api_key = os.environ.get("YANDEX_GPT_API_KEY", "")
    folder_id = os.environ.get("YANDEX_FOLDER_ID", "")
    if not api_key or not folder_id:
        return "[AI недоступен]"
    payload = json.dumps({
        "modelUri": f"gpt://{folder_id}/yandexgpt/latest",
        "completionOptions": {"stream": False, "temperature": 0.3, "maxTokens": 6000},
        "messages": [{"role": m["role"], "text": m["content"]} for m in messages],
    }).encode()
    req = urllib.request.Request(
        "https://llm.api.cloud.yandex.net/foundationModels/v1/completion",
        data=payload,
        headers={"Authorization": f"Api-Key {api_key}", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            result = json.loads(resp.read())
            return result["result"]["alternatives"][0]["message"]["text"]
    except Exception as e:
        return f"[Ошибка AI: {e}]"


# ------------------------------------------------------------------ #
#  Audit engine                                                       #
# ------------------------------------------------------------------ #

ISSUE_TYPES = [
    "missing_required_topic",
    "missing_required_slide",
    "contradiction_with_source",
    "unsupported_claim",
    "terminology_mismatch",
    "number_mismatch",
    "structure_noncompliance",
    "criteria_noncompliance",
    "template_content_leak",
    "weak_justification",
    "redundancy_or_irrelevance",
]

SYSTEM_PROMPT = """Ты — эксперт по аудиту презентаций. Твоя задача:
1. Проанализировать слайды презентации.
2. Сравнить содержимое с предоставленными документами по их ролям.
3. Найти проблемы: отсутствующие разделы, противоречия, ненадёжные утверждения, несоответствия критериям.
4. Для каждой проблемы указать: slide, issue_type, severity, объяснение, фрагмент из презентации, фрагмент из документа.

Роли документов:
- STANDARD / CRITERIA: нормативные требования — главный приоритет
- SOURCE: источник фактов — проверять на соответствие
- TEMPLATE / EXAMPLE: только для структуры, не источник истины
- MATERIAL: дополнительный контекст

Правила:
- Не галлюцинировать несоответствия. Низкая уверенность → пометить "нужна ручная проверка".
- Каждое замечание — конкретное, с цитатами.
- Не ругать за расхождение с TEMPLATE/EXAMPLE по предметному содержанию.

Отвечай ТОЛЬКО валидным JSON без пояснений и markdown-обёрток.
"""


def run_audit(pptx_slides: list, documents: list) -> dict:
    """Запускает AI-анализ и возвращает structured audit result."""

    # Формируем контекст документов
    doc_ctx_parts = []
    for doc in sorted(documents, key=lambda d: ROLE_PRIORITY.get(d.get("role", "material"), 99)):
        role = doc.get("role", "material").upper()
        name = doc.get("name", "Документ")
        text = (doc.get("text") or "")[:4000]
        instruction = doc.get("instruction") or ""
        part = f"=== [{role}] {name} ===\n{text}"
        if instruction:
            part += f"\n[Инструкция: {instruction}]"
        doc_ctx_parts.append(part)
    doc_context = "\n\n".join(doc_ctx_parts)

    # Контекст слайдов
    slides_ctx = "\n\n".join(
        f"--- Слайд {s['slide']}: {s['title']} ---\n{s['text']}"
        + (f"\n[Notes: {s['notes']}]" if s.get("notes") else "")
        for s in pptx_slides
    )

    user_prompt = f"""ДОКУМЕНТЫ ДЛЯ ПРОВЕРКИ:
{doc_context}

СЛАЙДЫ ПРЕЗЕНТАЦИИ:
{slides_ctx}

Проверь презентацию и верни JSON в формате:
{{
  "audit_summary": {{
    "total_slides": <число>,
    "total_issues": <число>,
    "critical_count": <число>,
    "high_count": <число>,
    "medium_count": <число>,
    "low_count": <число>,
    "compliance_score": <0-100>,
    "key_risks": ["..."]
  }},
  "findings": [
    {{
      "issue_id": "F001",
      "severity": "critical|high|medium|low",
      "slide_index": <номер>,
      "slide_title": "...",
      "issue_type": "<тип из списка: {', '.join(ISSUE_TYPES)}>",
      "short_title": "...",
      "explanation": "...",
      "evidence_from_presentation": "цитата из слайда",
      "evidence_from_source_docs": "цитата из документа",
      "related_document_name": "название документа",
      "violated_criterion": "...",
      "suggested_fix": "Конкретная правка текста",
      "rationale": "Почему именно такая правка",
      "confidence": "high|medium|low"
    }}
  ],
  "slide_reports": [
    {{
      "slide_index": <N>,
      "slide_title": "...",
      "status": "ok|needs_attention|critical",
      "issue_count": <число>,
      "summary": "Краткое резюме по слайду"
    }}
  ],
  "compliance_matrix": [
    {{
      "criterion": "Описание требования",
      "source": "Название документа",
      "status": "met|partially_met|not_met|not_checked",
      "slide_index": <N или null>,
      "comment": "..."
    }}
  ],
  "suggested_changes": [
    {{
      "slide_index": <N>,
      "slide_title": "...",
      "action": "rewrite|add|remove|replace",
      "current_text": "...",
      "proposed_text": "...",
      "rationale": "..."
    }}
  ],
  "warnings": ["..."]
}}"""

    raw = call_gpt([
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": user_prompt},
    ])

    # Парсим JSON из ответа
    import re
    json_match = re.search(r'\{.*\}', raw, re.DOTALL)
    if json_match:
        try:
            return json.loads(json_match.group(0))
        except Exception:
            pass

    # Fallback
    return {
        "audit_summary": {
            "total_slides": len(pptx_slides),
            "total_issues": 0,
            "critical_count": 0,
            "high_count": 0,
            "medium_count": 0,
            "low_count": 0,
            "compliance_score": None,
            "key_risks": [],
        },
        "findings": [],
        "slide_reports": [],
        "compliance_matrix": [],
        "suggested_changes": [],
        "warnings": [f"AI вернул нечитаемый ответ: {raw[:200]}"],
    }


# ------------------------------------------------------------------ #
#  Handler                                                            #
# ------------------------------------------------------------------ #

def handler(event: dict, context) -> dict:
    """Аудит презентаций: проверка PPTX на соответствие документам."""
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": CORS_HEADERS, "body": ""}

    if event.get("httpMethod") != "POST":
        return err_resp("Только POST", 405)

    body = {}
    try:
        body = json.loads(event.get("body") or "{}")
    except Exception:
        return err_resp("Невалидный JSON", 400)

    session_id = event.get("headers", {}).get("X-Session-Id", "")
    conn = get_db()
    try:
        user = get_user(conn, session_id)
        if not user:
            return err_resp("Требуется авторизация", 401)

        schema = get_schema()
        action = body.get("action", "")

        # ---- audit.run ----
        if action == "audit.run":
            project_id = body.get("project_id")
            pptx_b64 = body.get("pptx_file")      # base64 PPTX
            documents = body.get("documents") or [] # [{name, role, text, instruction}]

            if not project_id or not pptx_b64:
                return err_resp("Нужны project_id и pptx_file (base64)")

            cur = conn.cursor()
            cur.execute(
                f"SELECT role FROM {schema}.project_members WHERE project_id = %s AND user_id = %s",
                (project_id, user["id"]),
            )
            if not cur.fetchone():
                return err_resp("Нет доступа к проекту", 403)

            # Если документы не переданы напрямую — берём из задания по doc_ids
            if not documents and body.get("document_ids"):
                doc_ids = body["document_ids"]
                placeholders = ",".join(["%s"] * len(doc_ids))
                cur.execute(
                    f"""SELECT id, original_name, file_type, extracted_text
                        FROM {schema}.documents
                        WHERE id IN ({placeholders}) AND archived_at IS NULL""",
                    doc_ids,
                )
                for r in cur.fetchall():
                    role_map = body.get("document_roles") or {}
                    documents.append({
                        "name": r[1],
                        "role": role_map.get(str(r[0]), "material"),
                        "text": r[3] or "",
                        "instruction": "",
                    })

            # Декодируем PPTX
            try:
                pptx_bytes = base64.b64decode(pptx_b64)
            except Exception:
                return err_resp("Невалидный base64 для pptx_file")

            # Извлекаем текст слайдов
            pptx_slides = extract_pptx_text(pptx_bytes)

            # Запускаем AI-анализ
            audit_result = run_audit(pptx_slides, documents)
            audit_result["slide_count"] = len(pptx_slides)
            audit_result["document_count"] = len(documents)

            # Сохраняем в БД
            cur.execute(
                f"""INSERT INTO {schema}.audit_runs
                    (project_id, user_id, slide_count, doc_count, result_json, status)
                    VALUES (%s, %s, %s, %s, %s, 'done') RETURNING id""",
                (
                    project_id, user["id"],
                    len(pptx_slides), len(documents),
                    json.dumps(audit_result, ensure_ascii=False, default=str),
                ),
            )
            audit_id = cur.fetchone()[0]
            conn.commit()

            return ok_resp({"audit_id": audit_id, "result": audit_result})

        # ---- audit.get ----
        if action == "audit.get":
            audit_id = body.get("audit_id")
            if not audit_id:
                return err_resp("Нужен audit_id")
            cur = conn.cursor()
            cur.execute(
                f"""SELECT ar.id, ar.project_id, ar.slide_count, ar.doc_count,
                           ar.result_json, ar.status, ar.created_at
                    FROM {schema}.audit_runs ar
                    WHERE ar.id = %s AND ar.user_id = %s""",
                (int(audit_id), user["id"]),
            )
            row = cur.fetchone()
            if not row:
                return err_resp("Аудит не найден", 404)
            result = json.loads(row[4]) if row[4] else {}
            return ok_resp({
                "audit_id": row[0], "project_id": row[1],
                "slide_count": row[2], "doc_count": row[3],
                "result": result, "status": row[5],
                "created_at": str(row[6]),
            })

        # ---- audit.list ----
        if action == "audit.list":
            project_id = body.get("project_id")
            if not project_id:
                return err_resp("Нужен project_id")
            cur = conn.cursor()
            cur.execute(
                f"SELECT role FROM {schema}.project_members WHERE project_id = %s AND user_id = %s",
                (project_id, user["id"]),
            )
            if not cur.fetchone():
                return err_resp("Нет доступа", 403)
            cur.execute(
                f"""SELECT id, slide_count, doc_count, status, created_at,
                           (result_json::json->'audit_summary'->>'compliance_score') as score,
                           (result_json::json->'audit_summary'->>'total_issues') as issues
                    FROM {schema}.audit_runs
                    WHERE project_id = %s AND user_id = %s
                    ORDER BY created_at DESC LIMIT 20""",
                (project_id, user["id"]),
            )
            rows = cur.fetchall()
            return ok_resp({"audits": [
                {
                    "audit_id": r[0], "slide_count": r[1], "doc_count": r[2],
                    "status": r[3], "created_at": str(r[4]),
                    "compliance_score": r[5], "total_issues": r[6],
                }
                for r in rows
            ]})

        return err_resp("Неизвестное действие")

    except Exception as e:
        log.exception("audit error")
        return err_resp(f"Ошибка сервера: {str(e)[:200]}", 500)
    finally:
        conn.close()
