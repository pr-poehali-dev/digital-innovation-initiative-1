"""
Экспорт результата генерации в DOCX (Word).
Для дипломов, рефератов, эссе, аналитических записок.
"""
import json
import os
import re
import base64
import io
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
        f"SELECT u.id, u.name FROM {schema}.sessions s JOIN {schema}.users u ON u.id = s.user_id WHERE s.id = %s AND s.expires_at > NOW()",
        (session_id,),
    )
    row = cur.fetchone()
    return {"id": row[0], "name": row[1]} if row else None


def build_docx(content: str, title: str, author: str) -> bytes:
    from docx import Document
    from docx.shared import Pt, Cm, RGBColor
    from docx.enum.text import WD_ALIGN_PARAGRAPH

    doc = Document()

    # Поля по ГОСТ
    for section in doc.sections:
        section.left_margin = Cm(3)
        section.right_margin = Cm(1.5)
        section.top_margin = Cm(2)
        section.bottom_margin = Cm(2)

    # Стиль по умолчанию
    style = doc.styles["Normal"]
    style.font.name = "Times New Roman"
    style.font.size = Pt(14)
    style.paragraph_format.line_spacing = 1.5
    style.paragraph_format.first_line_indent = Cm(1.25)
    style.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY

    # Титульная страница
    title_para = doc.add_paragraph()
    title_para.alignment = WD_ALIGN_PARAGRAPH.CENTER
    title_run = title_para.add_run(title)
    title_run.font.size = Pt(20)
    title_run.font.bold = True

    if author:
        author_para = doc.add_paragraph()
        author_para.alignment = WD_ALIGN_PARAGRAPH.CENTER
        author_run = author_para.add_run(f"\nАвтор: {author}")
        author_run.font.size = Pt(12)
        author_run.font.italic = True

    doc.add_page_break()

    # Парсим контент построчно
    lines = content.split("\n")
    for raw in lines:
        line = raw.rstrip()
        if not line.strip():
            doc.add_paragraph()
            continue

        # Заголовки уровня 1: # Заголовок или ВСЕ ЗАГЛАВНЫМИ
        if line.startswith("# "):
            h = doc.add_heading(line[2:].strip(), level=1)
            h.paragraph_format.first_line_indent = Cm(0)
            continue
        if line.startswith("## "):
            h = doc.add_heading(line[3:].strip(), level=2)
            h.paragraph_format.first_line_indent = Cm(0)
            continue
        if line.startswith("### "):
            h = doc.add_heading(line[4:].strip(), level=3)
            h.paragraph_format.first_line_indent = Cm(0)
            continue

        # Слайд N: → как подзаголовок
        if re.match(r"^Слайд\s+\d+[:.]", line, re.IGNORECASE):
            h = doc.add_heading(line, level=2)
            h.paragraph_format.first_line_indent = Cm(0)
            continue

        # Жирный текст **Заголовок**
        if line.startswith("**") and line.endswith("**") and len(line) > 4:
            p = doc.add_paragraph()
            p.paragraph_format.first_line_indent = Cm(0)
            run = p.add_run(line.strip("*"))
            run.bold = True
            continue

        # Буллеты
        if re.match(r"^[•\-\*\–\—]\s", line) or re.match(r"^\d+\.\s", line):
            clean = re.sub(r"^[•\-\*\–\—]\s|^\d+\.\s", "", line).strip()
            p = doc.add_paragraph(style="List Bullet")
            p.paragraph_format.first_line_indent = Cm(0)
            # Убираем markdown bold внутри
            clean = re.sub(r"\*\*([^*]+)\*\*", r"\1", clean)
            p.add_run(clean)
            continue

        # Обычный абзац
        clean = re.sub(r"\*\*([^*]+)\*\*", r"\1", line)
        doc.add_paragraph(clean)

    # Сохраняем в байты
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


def handler(event: dict, context) -> dict:
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": cors_headers(), "body": ""}

    method = event.get("httpMethod", "GET")
    body = {}
    if event.get("body"):
        try:
            body = json.loads(event["body"])
        except Exception:
            pass

    session_id = event.get("headers", {}).get("X-Session-Id", "")
    conn = get_db()
    schema = get_schema()

    try:
        user = get_current_user(conn, session_id)
        if not user:
            return json_response({"error": "Не авторизован"}, 401)

        if method != "POST":
            return json_response({"error": "Method not allowed"}, 405)

        run_id = body.get("run_id")
        if not run_id:
            return json_response({"error": "Нужен run_id"}, 400)

        cur = conn.cursor()
        cur.execute(
            f"""SELECT gr.result_json, gr.task_id FROM {schema}.generation_runs gr WHERE gr.id = %s""",
            (run_id,),
        )
        row = cur.fetchone()
        if not row:
            return json_response({"error": "Результат не найден"}, 404)

        result_json, task_id = row
        cur.execute(
            f"SELECT title, topic, project_id FROM {schema}.tasks WHERE id = %s",
            (task_id,),
        )
        task_row = cur.fetchone()
        if not task_row:
            return json_response({"error": "Задание не найдено"}, 404)

        task_title, task_topic, project_id = task_row
        cur.execute(
            f"SELECT role FROM {schema}.project_members WHERE project_id = %s AND user_id = %s",
            (project_id, user["id"]),
        )
        if not cur.fetchone():
            return json_response({"error": "Нет доступа"}, 403)

        content = ""
        if result_json:
            try:
                content = json.loads(result_json).get("content", "")
            except Exception:
                content = result_json

        if not content:
            return json_response({"error": "Нет контента для экспорта"}, 400)

        doc_title = task_topic or task_title or "Работа"
        docx_bytes = build_docx(content, doc_title, user.get("name", ""))
        b64 = base64.b64encode(docx_bytes).decode("utf-8")
        safe_name = re.sub(r"[^\w\d\-_\u0400-\u04FF]", "_", doc_title[:50])

        return json_response({
            "filename": f"{safe_name}.docx",
            "file_data": b64,
        })

    finally:
        conn.close()