"""
Загрузка и управление документами (PDF, DOCX, PPTX).
Извлечение текста и структуры из файлов.
"""
import json
import os
import base64
import io
import psycopg2
import boto3


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


def get_s3():
    return boto3.client(
        "s3",
        endpoint_url="https://bucket.poehali.dev",
        aws_access_key_id=os.environ["AWS_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["AWS_SECRET_ACCESS_KEY"],
    )


def extract_text_from_pdf(data: bytes) -> str:
    try:
        import PyPDF2
        reader = PyPDF2.PdfReader(io.BytesIO(data))
        text = []
        for page in reader.pages:
            text.append(page.extract_text() or "")
        return "\n".join(text)[:50000]
    except Exception as e:
        return f"[Ошибка извлечения текста PDF: {e}]"


def extract_text_from_docx(data: bytes) -> str:
    try:
        import docx
        doc = docx.Document(io.BytesIO(data))
        paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
        return "\n".join(paragraphs)[:50000]
    except Exception as e:
        return f"[Ошибка извлечения текста DOCX: {e}]"


def extract_from_pptx(data: bytes) -> dict:
    try:
        from pptx import Presentation
        prs = Presentation(io.BytesIO(data))
        slides = []
        for i, slide in enumerate(prs.slides):
            title = ""
            bullets = []
            notes = ""
            for shape in slide.shapes:
                if shape.has_text_frame:
                    if shape.shape_type == 13:
                        continue
                    for j, para in enumerate(shape.text_frame.paragraphs):
                        text = para.text.strip()
                        if not text:
                            continue
                        if j == 0 and not title:
                            title = text
                        else:
                            bullets.append(text)
            if slide.has_notes_slide:
                notes = slide.notes_slide.notes_text_frame.text.strip()
            slides.append({
                "index": i + 1,
                "title": title,
                "bullets": bullets,
                "notes": notes,
            })
        full_text = "\n\n".join(
            f"Слайд {s['index']}: {s['title']}\n" + "\n".join(s['bullets'])
            for s in slides
        )
        return {"text": full_text[:50000], "structure": slides}
    except Exception as e:
        return {"text": f"[Ошибка извлечения PPTX: {e}]", "structure": []}


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

    try:
        user = get_current_user(conn, session_id)
        if not user:
            return json_response({"error": "Не авторизован"}, 401)

        cur = conn.cursor()
        path_parts = path.strip("/").split("/")

        # POST /upload — загрузить файл
        if method == "POST" and "upload" in path:
            project_id = body.get("project_id")
            filename = body.get("filename", "file")
            file_data_b64 = body.get("file_data", "")
            file_type = body.get("file_type", "").lower()

            if not project_id or not file_data_b64:
                return json_response({"error": "Не хватает данных"}, 400)

            # Проверка доступа к проекту
            cur.execute(
                f"SELECT role FROM {schema}.project_members WHERE project_id = %s AND user_id = %s",
                (project_id, user["id"]),
            )
            if not cur.fetchone():
                return json_response({"error": "Нет доступа"}, 403)

            file_bytes = base64.b64decode(file_data_b64)
            file_size = len(file_bytes)

            # Загрузить в S3
            s3_key = f"documents/{project_id}/{user['id']}_{filename}"
            s3 = get_s3()
            content_types = {
                "pdf": "application/pdf",
                "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                "pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            }
            s3.put_object(
                Bucket="files",
                Key=s3_key,
                Body=file_bytes,
                ContentType=content_types.get(file_type, "application/octet-stream"),
            )

            # Извлечь текст
            extracted_text = ""
            structure_json = None

            if file_type == "pdf":
                extracted_text = extract_text_from_pdf(file_bytes)
            elif file_type == "docx":
                extracted_text = extract_text_from_docx(file_bytes)
            elif file_type == "pptx":
                result = extract_from_pptx(file_bytes)
                extracted_text = result["text"]
                structure_json = json.dumps(result["structure"], ensure_ascii=False)

            cur.execute(
                f"""INSERT INTO {schema}.documents
                    (project_id, uploaded_by, filename, original_name, file_type, file_size, s3_key, extracted_text, structure_json, status)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, 'ready')
                    RETURNING id""",
                (project_id, user["id"], s3_key, filename, file_type, file_size, s3_key, extracted_text, structure_json),
            )
            doc_id = cur.fetchone()[0]
            log_activity(cur, schema, project_id, user["id"], "uploaded_document", "document", doc_id, filename)
            conn.commit()

            return json_response({
                "id": doc_id,
                "filename": filename,
                "file_type": file_type,
                "file_size": file_size,
                "status": "ready",
                "has_structure": structure_json is not None,
            })

        # GET /project/{project_id} — список документов проекта
        if method == "GET" and "project" in path:
            for i, part in enumerate(path_parts):
                if part == "project" and i + 1 < len(path_parts):
                    project_id = int(path_parts[i + 1])
                    break
            else:
                return json_response({"error": "Нет project_id"}, 400)

            cur.execute(
                f"SELECT role FROM {schema}.project_members WHERE project_id = %s AND user_id = %s",
                (project_id, user["id"]),
            )
            if not cur.fetchone():
                return json_response({"error": "Нет доступа"}, 403)

            cur.execute(
                f"""SELECT d.id, d.original_name, d.file_type, d.file_size, d.status, d.created_at, u.name
                    FROM {schema}.documents d JOIN {schema}.users u ON u.id = d.uploaded_by
                    WHERE d.project_id = %s ORDER BY d.created_at DESC""",
                (project_id,),
            )
            docs = [
                {
                    "id": r[0], "name": r[1], "file_type": r[2],
                    "file_size": r[3], "status": r[4],
                    "created_at": str(r[5]), "uploaded_by": r[6],
                }
                for r in cur.fetchall()
            ]
            return json_response({"documents": docs})

        # GET /{id}/text — получить извлечённый текст документа
        if method == "GET" and path_parts[-1] == "text":
            doc_id = int(path_parts[-2])
            cur.execute(
                f"SELECT d.extracted_text, d.structure_json, d.project_id FROM {schema}.documents d WHERE d.id = %s",
                (doc_id,),
            )
            row = cur.fetchone()
            if not row:
                return json_response({"error": "Не найдено"}, 404)
            cur.execute(
                f"SELECT role FROM {schema}.project_members WHERE project_id = %s AND user_id = %s",
                (row[2], user["id"]),
            )
            if not cur.fetchone():
                return json_response({"error": "Нет доступа"}, 403)
            structure = None
            if row[1]:
                try:
                    structure = json.loads(row[1])
                except Exception:
                    pass
            return json_response({"text": row[0], "structure": structure})

        return json_response({"error": "Not found"}, 404)

    finally:
        conn.close()
