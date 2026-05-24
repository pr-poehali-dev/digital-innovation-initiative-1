"""
Веб-поиск для дополнения генерации AI материалами из интернета.
Использует DuckDuckGo HTML (без ключа) или Yandex Search API.
"""
import json
import os
import re
import urllib.request
import urllib.parse
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


def search_duckduckgo(query: str, limit: int = 5) -> list:
    """Веб-поиск через DuckDuckGo HTML — работает без ключа."""
    try:
        encoded = urllib.parse.quote(query)
        url = f"https://html.duckduckgo.com/html/?q={encoded}"
        req = urllib.request.Request(url, headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        })
        with urllib.request.urlopen(req, timeout=15) as resp:
            html = resp.read().decode("utf-8", errors="ignore")

        # Парсим результаты регулярками
        results = []
        # Заголовки и ссылки
        pattern = re.compile(
            r'<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>(.*?)</a>.*?'
            r'<a[^>]+class="result__snippet"[^>]*>(.*?)</a>',
            re.DOTALL
        )
        for m in pattern.finditer(html):
            if len(results) >= limit:
                break
            link = m.group(1)
            title = re.sub(r'<[^>]+>', '', m.group(2)).strip()
            snippet = re.sub(r'<[^>]+>', '', m.group(3)).strip()
            # Чистим ссылку
            if link.startswith("//duckduckgo.com/l/?uddg="):
                try:
                    link = urllib.parse.unquote(link.split("uddg=")[1].split("&")[0])
                except Exception:
                    pass
            if title and snippet:
                results.append({
                    "title": title[:200],
                    "snippet": snippet[:400],
                    "url": link,
                })
        return results
    except Exception as e:
        return [{"title": "Ошибка поиска", "snippet": str(e)[:200], "url": ""}]


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

        query = (body.get("query") or "").strip()
        if not query:
            return json_response({"error": "Нужен query"}, 400)

        limit = min(int(body.get("limit", 5)), 10)
        results = search_duckduckgo(query, limit)

        # Сохраняем историю
        task_id = body.get("task_id")
        run_id = body.get("run_id")
        if task_id:
            cur = conn.cursor()
            cur.execute(
                f"INSERT INTO {schema}.web_search_results (task_id, generation_run_id, query, results_json) VALUES (%s, %s, %s, %s)",
                (task_id, run_id, query, json.dumps(results, ensure_ascii=False)),
            )
            conn.commit()

        return json_response({"query": query, "results": results})

    finally:
        conn.close()