"""
AI-помощник для Траектории — YandexGPT чат с контекстом развития.
Actions: chat
"""
import json, os, requests, psycopg2

DB  = os.environ["DATABASE_URL"]
_s  = os.environ.get("MAIN_DB_SCHEMA", "").strip()
S   = _s if _s else "t_p61016064_digital_innovation_i"

YANDEX_GPT_KEY    = os.environ.get("YANDEX_GPT_API_KEY", "")
YANDEX_FOLDER_ID  = os.environ.get("YANDEX_FOLDER_ID", "")
GPT_URL           = "https://llm.api.cloud.yandex.net/foundationModels/v1/completion"
MODEL_URI         = f"gpt://{YANDEX_FOLDER_ID}/yandexgpt-lite"

SYSTEM_PROMPT = """Ты — AI-помощник платформы «Траектория», помогающий специалистам развиваться профессионально.

Ты помогаешь:
— разобраться в компетенциях и зонах роста
— выбрать целевую роль и путь развития
— понять как пользоваться платформой
— ответить на вопросы об обучении, планах, карьере

Отвечай коротко (2-4 абзаца), по-русски, дружелюбно и конкретно.
Не придумывай данные о пользователе — только то, что он сам скажет.
Если вопрос не по теме развития — вежливо направь в нужное русло."""


# ── CORS / response ────────────────────────────────────────────────────

def cors(origin=""):
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-Session-Id",
    }

def resp(data, code=200, origin=""):
    return {
        "statusCode": code,
        "headers": {**cors(origin), "Content-Type": "application/json"},
        "body": json.dumps(data, ensure_ascii=False),
    }


# ── Auth ────────────────────────────────────────────────────────────────

def get_user(conn, session_id: str):
    if not session_id:
        return None
    safe_sid = session_id.replace("'", "''")
    with conn.cursor() as cur:
        cur.execute(
            f"SELECT user_id FROM {S}.sessions WHERE session_id='{safe_sid}' AND expires_at>NOW() LIMIT 1"
        )
        row = cur.fetchone()
    return row[0] if row else None


# ── YandexGPT call ─────────────────────────────────────────────────────

def call_gpt(messages: list) -> str:
    payload = {
        "modelUri": MODEL_URI,
        "completionOptions": {
            "stream": False,
            "temperature": 0.5,
            "maxTokens": 800,
        },
        "messages": messages,
    }
    r = requests.post(
        GPT_URL,
        headers={
            "Authorization": f"Api-Key {YANDEX_GPT_KEY}",
            "Content-Type": "application/json",
        },
        json=payload,
        timeout=25,
    )
    r.raise_for_status()
    data = r.json()
    return data["result"]["alternatives"][0]["message"]["text"]


# ── Handler ────────────────────────────────────────────────────────────

def handler(event: dict, context) -> dict:
    """AI-помощник — YandexGPT чат для Траектории."""
    headers = event.get("headers") or {}
    origin  = headers.get("origin") or headers.get("Origin") or ""
    method  = event.get("httpMethod", "GET")

    if method == "OPTIONS":
        return resp({}, 200, origin)

    # Auth
    sid  = headers.get("X-Session-Id") or headers.get("x-session-id") or ""
    conn = psycopg2.connect(DB)
    try:
        user_id = get_user(conn, sid)
        if not user_id:
            return resp({"error": "unauthorized"}, 401, origin)

        body = {}
        if event.get("body"):
            try:
                body = json.loads(event["body"])
            except Exception:
                pass

        # Список сообщений от клиента: [{role: "user"|"assistant", text: "..."}]
        history = body.get("messages", [])
        if not history:
            return resp({"error": "messages required"}, 400, origin)

        # Формируем messages для YandexGPT
        gpt_messages = [{"role": "system", "text": SYSTEM_PROMPT}]
        for m in history[-10:]:  # последние 10 сообщений
            role = "user" if m.get("role") == "user" else "assistant"
            gpt_messages.append({"role": role, "text": str(m.get("text", ""))})

        answer = call_gpt(gpt_messages)
        return resp({"answer": answer}, 200, origin)

    finally:
        conn.close()