import json
import os
import re
import hashlib
import datetime
import urllib.request
import psycopg2

DB = os.environ["DATABASE_URL"]
_s = os.environ.get("MAIN_DB_SCHEMA", "").strip()
SCHEMA = _s if _s else "t_p61016064_digital_innovation_i"

YANDEX_GPT_KEY = os.environ.get("YANDEX_GPT_API_KEY", "")
YANDEX_FOLDER_ID = os.environ.get("YANDEX_FOLDER_ID", "")
GPT_URL = "https://llm.api.cloud.yandex.net/foundationModels/v1/completion"
MODEL_URI = f"gpt://{YANDEX_FOLDER_ID}/yandexgpt/latest"


def cors(body: dict, code: int = 200) -> dict:
    return {
        "statusCode": code,
        "headers": {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, X-Admin-Token, X-Session-Id",
            "Content-Type": "application/json",
        },
        "body": json.dumps(body, ensure_ascii=False, default=str),
    }


def get_admin(conn, token: str):
    if not token:
        return None
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    with conn.cursor() as cur:
        cur.execute(
            f"SELECT actor_email FROM {SCHEMA}.admin_sessions "
            f"WHERE session_token_hash = %s AND expires_at > NOW() AND revoked_at IS NULL LIMIT 1",
            (token_hash,),
        )
        row = cur.fetchone()
    return row[0] if row else None


def get_cabinet_user(conn, session_id: str):
    if not session_id:
        return None
    with conn.cursor() as cur:
        cur.execute(
            f"SELECT u.email, a.access_role, a.can_confirm "
            f"FROM {SCHEMA}.sessions s "
            f"JOIN {SCHEMA}.users u ON u.id = s.user_id "
            f"JOIN {SCHEMA}.exec_cabinet_access a ON LOWER(a.email) = LOWER(u.email) "
            f"LEFT JOIN {SCHEMA}.admin_user_flags fl ON fl.user_id = u.id "
            f"WHERE s.id = %s AND s.expires_at > NOW() "
            f"AND a.is_active = true AND COALESCE(fl.is_blocked, false) = false LIMIT 1",
            (session_id,),
        )
        row = cur.fetchone()
    if not row:
        return None
    return {"email": row[0], "role": row[1], "can_confirm": row[2]}


def authenticate(conn, headers: dict):
    token = headers.get("x-admin-token") or headers.get("X-Admin-Token", "")
    email = get_admin(conn, token)
    if email:
        return {"email": email, "role": "head", "can_confirm": True}
    sid = headers.get("x-session-id") or headers.get("X-Session-Id", "")
    return get_cabinet_user(conn, sid)


def nz(v):
    if v is None:
        return None
    if isinstance(v, str) and not v.strip():
        return None
    return v


AI_SYSTEM = (
    "Ты — опытный руководитель проектного офиса в крупной российской организации. "
    "Ты раскладываешь управленческую задачу на понятный пошаговый план. "
    "Пишешь строго по-деловому, на русском языке, без воды и англицизмов."
)

AI_PROMPT = """Задача руководителя: {title}
{goal}{period}{people}

Составь пошаговый план выполнения этой задачи.

Требования:
1. От 4 до 7 крупных шагов в логической последовательности.
2. У 2-4 шагов добавь вложенные действия (substeps) — по 2-4 штуки, это конкретные операции.
3. Отметь 1-3 ключевых шага как веху (is_milestone: true) — это проверяемый результат:
   «согласовано», «утверждено», «запущено», «принято в эксплуатацию».
4. Для каждого шага и действия укажи offset_start и offset_end — смещение в днях
   от начала задачи (целые числа, offset_start <= offset_end).
   Все сроки должны укладываться в {days} дней. Шаги идут последовательно, без больших разрывов.
5. Для вехи offset_start = offset_end (это точка, а не отрезок).
6. Для каждого шага напиши result — краткий критерий выполнения (одно предложение).
7. Если в списке есть участники, предложи для шага роль исполнителя в поле role
   (например «аналитик», «руководитель направления»), иначе оставь role пустым.

Верни ТОЛЬКО JSON без пояснений и markdown-обёртки, строго в таком виде:
{{"steps":[{{"title":"...","description":"...","result":"...","role":"","is_milestone":false,"offset_start":0,"offset_end":10,"substeps":[{{"title":"...","offset_start":0,"offset_end":4}}]}}]}}"""


def call_gpt(system: str, prompt: str) -> str:
    if not YANDEX_GPT_KEY or not YANDEX_FOLDER_ID:
        raise RuntimeError("AI недоступен: не настроен ключ YandexGPT")
    payload = json.dumps({
        "modelUri": MODEL_URI,
        "completionOptions": {"stream": False, "temperature": 0.3, "maxTokens": 3000},
        "messages": [
            {"role": "system", "text": system},
            {"role": "user", "text": prompt},
        ],
    }).encode()
    req = urllib.request.Request(
        GPT_URL,
        data=payload,
        headers={
            "Authorization": f"Api-Key {YANDEX_GPT_KEY}",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=90) as resp:
        result = json.loads(resp.read())
    return result["result"]["alternatives"][0]["message"]["text"]


def parse_json_block(text: str) -> dict:
    """Убирает markdown-обёртку и достаёт JSON-объект из ответа модели."""
    cleaned = (text or "").strip()
    if cleaned.startswith("```"):
        parts = cleaned.split("```")
        if len(parts) > 1:
            cleaned = parts[1]
        if cleaned.lstrip().startswith("json"):
            cleaned = cleaned.lstrip()[4:]
    m = re.search(r"\{.*\}", cleaned, re.DOTALL)
    if not m:
        raise ValueError("AI вернул ответ не в формате JSON")
    return json.loads(m.group(0))


def shift(base, days):
    try:
        return (base + datetime.timedelta(days=int(days))).isoformat()
    except Exception:
        return None


def ai_suggest(cur, body: dict):
    """Просит модель разложить задачу на шаги. Ничего не сохраняет."""
    title = (body.get("title") or "").strip()
    if not title:
        return None, "Опишите задачу — по ней будет построен план"

    goal = (body.get("goal") or "").strip()
    start_raw = nz(body.get("start_date"))
    due_raw = nz(body.get("due_date"))

    try:
        start = datetime.date.fromisoformat(str(start_raw)[:10]) if start_raw else datetime.date.today()
    except Exception:
        start = datetime.date.today()
    try:
        due = datetime.date.fromisoformat(str(due_raw)[:10]) if due_raw else None
    except Exception:
        due = None

    days = (due - start).days if due and due > start else 60
    if days < 3:
        days = 3

    cur.execute(f"""
        SELECT display_name, position_title FROM {SCHEMA}.exec_person
        WHERE COALESCE(record_state,'active') = 'active'
        ORDER BY display_name LIMIT 15
    """)
    people = [f"{r[0]}{f' — {r[1]}' if r[1] else ''}" for r in cur.fetchall()]

    prompt = AI_PROMPT.format(
        title=title,
        goal=f"Цель и ожидаемый результат: {goal}\n" if goal else "",
        period=f"Срок выполнения: с {start.isoformat()} по {due.isoformat()}\n" if due else "",
        people=("Доступные участники:\n" + "\n".join(people) + "\n") if people else "",
        days=days,
    )

    raw = call_gpt(AI_SYSTEM, prompt)
    data = parse_json_block(raw)

    steps_in = data.get("steps") or []
    if not isinstance(steps_in, list) or not steps_in:
        return None, "AI не смог разложить задачу — уточните формулировку"

    def clamp(v, lo=0):
        try:
            n = int(v)
        except Exception:
            n = lo
        return max(0, min(n, days))

    steps_out = []
    for s in steps_in[:10]:
        if not isinstance(s, dict):
            continue
        st = clamp(s.get("offset_start", 0))
        en = clamp(s.get("offset_end", st))
        if en < st:
            en = st
        is_ms = bool(s.get("is_milestone"))
        subs = []
        for sub in (s.get("substeps") or [])[:6]:
            if not isinstance(sub, dict) or not (sub.get("title") or "").strip():
                continue
            ss = clamp(sub.get("offset_start", st))
            se = clamp(sub.get("offset_end", ss))
            if se < ss:
                se = ss
            subs.append({
                "title": str(sub.get("title")).strip()[:500],
                "start_date": shift(start, ss),
                "due_date": shift(start, se),
            })
        steps_out.append({
            "title": str(s.get("title") or "").strip()[:500],
            "description": str(s.get("description") or "").strip(),
            "result_criteria": str(s.get("result") or "").strip(),
            "role_hint": str(s.get("role") or "").strip(),
            "is_milestone": is_ms,
            "start_date": None if is_ms else shift(start, st),
            "due_date": shift(start, en),
            "substeps": [] if is_ms else subs,
        })

    steps_out = [s for s in steps_out if s["title"]]
    if not steps_out:
        return None, "AI не смог разложить задачу — уточните формулировку"
    return {"steps": steps_out, "days": days, "start_date": start.isoformat()}, None


def handler(event: dict, context) -> dict:
    """AI-помощник планировщика: раскладывает задачу руководителя на шаги и вехи."""
    if event.get("httpMethod") == "OPTIONS":
        return cors({})

    headers = event.get("headers") or {}
    conn = psycopg2.connect(DB)
    try:
        user = authenticate(conn, headers)
        if not user:
            return cors({"ok": False, "error": {"message": "Не авторизован"}}, 401)

        body = json.loads(event["body"]) if event.get("body") else {}
        cur = conn.cursor()

        try:
            data, err = ai_suggest(cur, body)
        except Exception as e:
            return cors({"ok": False, "error": {
                "message": f"Не удалось построить план: {e}"}}, 502)
        if err:
            return cors({"ok": False, "error": {"message": err}}, 400)
        return cors({"ok": True, "data": data})
    finally:
        conn.close()
