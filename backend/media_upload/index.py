"""
Загрузка медиа: фото лекций (OCR через Yandex Vision) и аудио (Yandex SpeechKit).
Извлекает текст и сохраняет как обычный документ в базе знаний.
"""
import json
import os
import base64
import psycopg2
import urllib.request
import urllib.error


def get_db():
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    conn.autocommit = False
    return conn


def get_schema():
    return os.environ.get("MAIN_DB_SCHEMA", "public")


def cors_headers():
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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
        f"SELECT u.id FROM {schema}.sessions s JOIN {schema}.users u ON u.id = s.user_id WHERE s.id = %s AND s.expires_at > NOW()",
        (session_id,),
    )
    row = cur.fetchone()
    return {"id": row[0]} if row else None


def get_s3_client():
    import boto3
    return boto3.client(
        "s3",
        endpoint_url="https://bucket.poehali.dev",
        aws_access_key_id=os.environ["AWS_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["AWS_SECRET_ACCESS_KEY"],
    )


def ocr_image(image_bytes: bytes) -> dict:
    """Распознавание текста на фото через Yandex Vision API."""
    api_key = os.environ.get("YANDEX_GPT_API_KEY", "")
    folder_id = os.environ.get("YANDEX_FOLDER_ID", "")
    if not api_key or not folder_id:
        return {"text": "[Yandex Vision недоступен: добавьте YANDEX_GPT_API_KEY и YANDEX_FOLDER_ID]", "error": True}

    b64 = base64.b64encode(image_bytes).decode("ascii")
    payload = json.dumps({
        "folderId": folder_id,
        "analyze_specs": [{
            "content": b64,
            "features": [{
                "type": "TEXT_DETECTION",
                "text_detection_config": {"language_codes": ["ru", "en"]}
            }]
        }]
    }).encode()

    req = urllib.request.Request(
        "https://vision.api.cloud.yandex.net/vision/v1/batchAnalyze",
        data=payload,
        headers={
            "Authorization": f"Api-Key {api_key}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            result = json.loads(resp.read())

        # Собираем весь распознанный текст
        text_parts = []
        for r in result.get("results", []):
            for sub in r.get("results", []):
                td = sub.get("textDetection", {})
                for page in td.get("pages", []):
                    for block in page.get("blocks", []):
                        for line in block.get("lines", []):
                            words = [w.get("text", "") for w in line.get("words", [])]
                            line_text = " ".join(words)
                            if line_text.strip():
                                text_parts.append(line_text)
        return {"text": "\n".join(text_parts), "error": False}
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="ignore")
        return {"text": f"[Ошибка Vision {e.code}: {body[:300]}]", "error": True}
    except Exception as e:
        return {"text": f"[Ошибка OCR: {e}]", "error": True}


def transcribe_audio(audio_bytes: bytes) -> dict:
    """Распознавание речи через Yandex SpeechKit (краткое распознавание до 1 МБ / 30 сек)."""
    api_key = os.environ.get("YANDEX_GPT_API_KEY", "")
    folder_id = os.environ.get("YANDEX_FOLDER_ID", "")
    if not api_key or not folder_id:
        return {"text": "[SpeechKit недоступен: добавьте YANDEX_GPT_API_KEY и YANDEX_FOLDER_ID]", "error": True}

    if len(audio_bytes) > 1024 * 1024:
        return {"text": "[Файл больше 1 МБ — для длинных аудио нужен async-режим. Загрузите короткий фрагмент или попросите внедрить async]", "error": True}

    url = f"https://stt.api.cloud.yandex.net/speech/v1/stt:recognize?folderId={folder_id}&lang=ru-RU&format=oggopus"

    req = urllib.request.Request(
        url,
        data=audio_bytes,
        headers={
            "Authorization": f"Api-Key {api_key}",
            "Content-Type": "audio/ogg",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            result = json.loads(resp.read())
        return {"text": result.get("result", "[Пустой ответ]"), "error": False}
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="ignore")
        return {"text": f"[Ошибка SpeechKit {e.code}: {body[:300]}]", "error": True}
    except Exception as e:
        return {"text": f"[Ошибка распознавания: {e}]", "error": True}


def chunk_text(text: str, size=1500, overlap=200) -> list:
    if not text:
        return []
    chunks = []
    start = 0
    idx = 0
    while start < len(text):
        end = min(start + size, len(text))
        if end < len(text):
            for sep in [". ", "!\n", "?\n", "\n\n", ".\n", "\n"]:
                cut = text.rfind(sep, start, end)
                if cut > start + size // 2:
                    end = cut + len(sep)
                    break
        chunk = text[start:end].strip()
        if chunk:
            chunks.append({"index": idx, "content": chunk})
            idx += 1
        start = end - overlap if end - overlap > start else end
    return chunks


def log_activity(cur, schema, project_id, user_id, action, entity_type, entity_id, details):
    cur.execute(
        f"INSERT INTO {schema}.activity_log (project_id, user_id, action, entity_type, entity_id, details) VALUES (%s, %s, %s, %s, %s, %s)",
        (project_id, user_id, action, entity_type, entity_id, details),
    )


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

        project_id = body.get("project_id")
        filename = body.get("filename", "media")
        file_data_b64 = body.get("file_data", "")
        media_type = body.get("media_type", "image")  # image | audio
        category = body.get("category", "notes")

        if not project_id or not file_data_b64:
            return json_response({"error": "Не хватает данных"}, 400)

        cur = conn.cursor()
        cur.execute(
            f"SELECT role FROM {schema}.project_members WHERE project_id = %s AND user_id = %s",
            (project_id, user["id"]),
        )
        if not cur.fetchone():
            return json_response({"error": "Нет доступа"}, 403)

        file_bytes = base64.b64decode(file_data_b64)
        file_size = len(file_bytes)
        ext = filename.split(".")[-1].lower() if "." in filename else media_type

        # Загружаем в S3
        s3_key = f"media/{project_id}/{user['id']}_{filename}"
        s3 = get_s3_client()
        content_type_map = {
            "jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png",
            "webp": "image/webp", "heic": "image/heic",
            "ogg": "audio/ogg", "oga": "audio/ogg", "opus": "audio/ogg",
            "mp3": "audio/mpeg", "wav": "audio/wav", "m4a": "audio/mp4",
        }
        s3.put_object(
            Bucket="files",
            Key=s3_key,
            Body=file_bytes,
            ContentType=content_type_map.get(ext, "application/octet-stream"),
        )

        # Распознаём
        if media_type == "image":
            result = ocr_image(file_bytes)
        elif media_type == "audio":
            result = transcribe_audio(file_bytes)
        else:
            return json_response({"error": "Неподдерживаемый тип медиа"}, 400)

        extracted_text = result["text"]

        # Сохраняем как документ
        cur.execute(
            f"""INSERT INTO {schema}.documents
                (project_id, uploaded_by, filename, original_name, file_type, file_size, s3_key,
                 extracted_text, status, category, extracted_length, media_type)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 'ready', %s, %s, %s)
                RETURNING id""",
            (project_id, user["id"], s3_key, filename, ext, file_size, s3_key,
             extracted_text, category, len(extracted_text), media_type),
        )
        doc_id = cur.fetchone()[0]

        # Чанкуем
        chunks = chunk_text(extracted_text)
        for ch in chunks[:200]:
            cur.execute(
                f"""INSERT INTO {schema}.document_chunks (document_id, chunk_index, content, content_length)
                    VALUES (%s, %s, %s, %s)""",
                (doc_id, ch["index"], ch["content"], len(ch["content"])),
            )

        action_label = "uploaded_image" if media_type == "image" else "uploaded_audio"
        log_activity(cur, schema, project_id, user["id"], action_label, "document", doc_id, filename)
        conn.commit()

        return json_response({
            "id": doc_id,
            "filename": filename,
            "media_type": media_type,
            "category": category,
            "text_length": len(extracted_text),
            "chunks_count": len(chunks),
            "extracted_preview": extracted_text[:500],
            "status": "ready",
        })

    finally:
        conn.close()
