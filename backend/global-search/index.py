"""
Глобальный поиск по платформе: проекты, задачи, документы, образование.
Гибридный FTS (русский) + LIKE. Контроль доступа через search_acl.
"""
import json
import os
import psycopg2

DB = os.environ["DATABASE_URL"]
SCHEMA = os.environ.get("MAIN_DB_SCHEMA", "public")


def get_db():
    conn = psycopg2.connect(DB)
    conn.autocommit = False
    return conn


def _is_allowed(origin: str) -> bool:
    if not origin:
        return False
    try:
        from urllib.parse import urlparse
        host = (urlparse(origin).hostname or "").lower()
        return (host in ("raven.moscow", "www.raven.moscow", "localhost")
                or host.endswith(".poehali.dev"))
    except Exception:
        return False


def cors(origin: str = None) -> dict:
    allowed = origin if _is_allowed(origin) else "*"
    return {
        "Access-Control-Allow-Origin": allowed,
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-Session-Id",
        "Vary": "Origin",
    }


def resp(data: dict, code: int = 200, origin: str = None) -> dict:
    return {
        "statusCode": code,
        "headers": {**cors(origin), "Content-Type": "application/json"},
        "body": json.dumps(data, ensure_ascii=False, default=str),
    }


def get_user(conn, session_id: str):
    if not session_id:
        return None
    s = SCHEMA
    with conn.cursor() as cur:
        cur.execute(
            f"SELECT u.id FROM {s}.sessions s JOIN {s}.users u ON u.id = s.user_id "
            f"WHERE s.id = '{session_id}' AND s.expires_at > NOW() LIMIT 1"
        )
        row = cur.fetchone()
    return {"id": row[0]} if row else None


def handler(event: dict, context) -> dict:
    """Глобальный поиск: GET ?q=... Возвращает результаты по категориям."""
    headers = event.get("headers") or {}
    origin = headers.get("origin") or headers.get("Origin") or ""
    method = event.get("httpMethod", "GET")

    if method == "OPTIONS":
        return resp({}, 200, origin)

    session_id = headers.get("X-Session-Id") or headers.get("x-session-id") or ""
    params = event.get("queryStringParameters") or {}
    q = (params.get("q") or "").strip()

    if not q or len(q) < 2:
        return resp({"results": [], "total": 0, "query": q}, origin=origin)

    conn = get_db()
    try:
        user = get_user(conn, session_id)
        if not user:
            return resp({"error": "unauthorized"}, 401, origin)

        user_id = user["id"]
        s = SCHEMA
        limit = 30

        # Экранируем запрос для LIKE и для FTS
        q_safe = q.replace("'", "''")
        q_like = f"%{q_safe}%"
        # FTS: plainto_tsquery с русским конфигом
        q_fts = q_safe

        sql = f"""
            SELECT
                si.entity_type,
                si.entity_id,
                si.title,
                si.content_text,
                si.meta,
                (
                    CASE WHEN lower(si.title) = lower('{q_safe}') THEN 5.0
                         WHEN lower(si.title) LIKE lower('{q_safe}%%') THEN 3.0
                         WHEN si.search_vector @@ plainto_tsquery('russian', '{q_fts}') THEN
                              ts_rank(si.search_vector, plainto_tsquery('russian', '{q_fts}')) * 2.5
                         WHEN lower(si.title) LIKE lower('{q_like}') THEN 1.5
                         WHEN lower(coalesce(si.content_text,'')) LIKE lower('{q_like}') THEN 0.8
                         ELSE 0.1
                    END
                ) AS score
            FROM {s}.search_index si
            JOIN {s}.search_acl acl
                ON acl.entity_type = si.entity_type
               AND acl.entity_id = si.entity_id
               AND acl.user_id = {user_id}
            WHERE (
                si.search_vector @@ plainto_tsquery('russian', '{q_fts}')
                OR lower(si.title) LIKE lower('{q_like}')
                OR lower(coalesce(si.content_text,'')) LIKE lower('{q_like}')
            )
            ORDER BY score DESC
            LIMIT {limit}
        """

        with conn.cursor() as cur:
            cur.execute(sql)
            rows = cur.fetchall()

        results = []
        for row in rows:
            entity_type, entity_id, title, content_text, meta_raw, score = row
            try:
                meta = json.loads(meta_raw) if isinstance(meta_raw, str) else (meta_raw or {})
            except Exception:
                meta = {}

            # Snippet из content_text
            snippet = ""
            if content_text:
                idx = content_text.lower().find(q.lower())
                if idx >= 0:
                    start = max(0, idx - 60)
                    end = min(len(content_text), idx + 120)
                    snippet = ("…" if start > 0 else "") + content_text[start:end].strip() + ("…" if end < len(content_text) else "")
                else:
                    snippet = content_text[:150]

            results.append({
                "entity_type": entity_type,
                "entity_id": entity_id,
                "title": title,
                "snippet": snippet,
                "route": meta.get("route", ""),
                "score": round(float(score), 3),
            })

        # Группируем по типу
        grouped: dict = {}
        for r in results:
            t = r["entity_type"]
            grouped.setdefault(t, []).append(r)

        return resp({
            "query": q,
            "results": results,
            "grouped": grouped,
            "total": len(results),
        }, origin=origin)

    finally:
        conn.close()
