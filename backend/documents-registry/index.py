"""
Документный контур: единый реестр источников, редакций, файлов, страниц,
пунктов, чанков и записей знания.

Принципы:
- оригинал не перезаписывается, новая версия = новая редакция;
- фиктивные страницы не создаются (page_number NULL = "страница не установлена");
- происхождение (origin_kind) неизменяемо: подтверждение человеком не превращает
  AI-материал в созданный человеком;
- внешний AI НЕ вызывается: поиск и сборка контекста выполняются локально.
"""
import json
import os
import hashlib
import psycopg2

DB = os.environ["DATABASE_URL"]
_s = os.environ.get("MAIN_DB_SCHEMA", "").strip()
SCHEMA = _s if _s else "t_p61016064_digital_innovation_i"


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
            f"SELECT u.email, a.access_role FROM {SCHEMA}.sessions s "
            f"JOIN {SCHEMA}.users u ON u.id = s.user_id "
            f"JOIN {SCHEMA}.exec_cabinet_access a ON LOWER(a.email) = LOWER(u.email) "
            f"LEFT JOIN {SCHEMA}.admin_user_flags fl ON fl.user_id = u.id "
            f"WHERE s.id = %s AND s.expires_at > NOW() AND a.is_active = true "
            f"AND COALESCE(fl.is_blocked, false) = false LIMIT 1",
            (session_id,),
        )
        row = cur.fetchone()
    return {"email": row[0], "role": row[1]} if row else None


def authenticate(conn, headers: dict):
    token = headers.get("x-admin-token") or headers.get("X-Admin-Token", "")
    email = get_admin(conn, token)
    if email:
        return {"email": email, "role": "head"}
    sid = headers.get("x-session-id") or headers.get("X-Session-Id", "")
    return get_cabinet_user(conn, sid)


def rows(cur):
    cols = [d[0] for d in cur.description]
    return [dict(zip(cols, r)) for r in cur.fetchall()]


def as_int(v):
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


def list_materials(cur):
    """Единый список: документы-источники + записи знания."""
    cur.execute(f"""
        SELECT
            'source'::text           AS material_kind,
            ds.id                    AS id,
            ds.title                 AS title,
            COALESCE(ds.display_title, ds.title) AS display_title,
            ds.source_kind           AS type_code,
            ds.source_status         AS source_status,
            dr.id                    AS revision_id,
            dr.revision_label        AS revision_label,
            dr.origin_kind           AS origin_kind,
            dr.processing_state      AS processing_state,
            dr.verification_state    AS verification_state,
            dr.applicability         AS applicability,
            COALESCE(df.file_presence, 'unknown') AS file_presence,
            'not_allowed'::text      AS ai_usage_policy,
            ds.updated_at            AS updated_at,
            (SELECT count(*) FROM {SCHEMA}.doc_chunk c WHERE c.revision_id = dr.id) AS chunk_count,
            (SELECT count(*) FROM {SCHEMA}.doc_page p WHERE p.revision_id = dr.id
                AND p.page_number IS NOT NULL) AS page_count
        FROM {SCHEMA}.doc_source ds
        LEFT JOIN {SCHEMA}.doc_revision dr ON dr.source_id = ds.id
        LEFT JOIN {SCHEMA}.doc_file df ON df.revision_id = dr.id

        UNION ALL

        SELECT
            'entry'::text, ke.id, ke.title, COALESCE(ke.display_title, ke.title),
            ke.entry_type, 'not_established', NULL, NULL, ke.origin_kind,
            'registered', ke.verification_state, ke.applicability,
            'no_file', ke.ai_usage_policy, ke.updated_at,
            0, 0
        FROM {SCHEMA}.knowledge_entry ke
        ORDER BY updated_at DESC
    """)
    return rows(cur)


def get_material(cur, kind: str, mid: int):
    if kind == "entry":
        cur.execute(f"""
            SELECT ke.*, lm.legacy_id, lm.migration_note
            FROM {SCHEMA}.knowledge_entry ke
            LEFT JOIN {SCHEMA}.legacy_knowledge_map lm ON lm.target_entry_id = ke.id
            WHERE ke.id = %s
        """, (mid,))
        r = rows(cur)
        if not r:
            return None
        item = r[0]
        item["material_kind"] = "entry"
        return item

    cur.execute(f"""
        SELECT ds.*, lm.legacy_id, lm.migration_note
        FROM {SCHEMA}.doc_source ds
        LEFT JOIN {SCHEMA}.legacy_knowledge_map lm ON lm.target_source_id = ds.id
        WHERE ds.id = %s
    """, (mid,))
    r = rows(cur)
    if not r:
        return None
    item = r[0]
    item["material_kind"] = "source"

    cur.execute(f"""
        SELECT dr.*, df.original_name, df.mime_type, df.size_bytes,
               df.s3_key, df.file_presence, df.content_sha256
        FROM {SCHEMA}.doc_revision dr
        LEFT JOIN {SCHEMA}.doc_file df ON df.revision_id = dr.id
        WHERE dr.source_id = %s ORDER BY dr.id DESC
    """, (mid,))
    item["revisions"] = rows(cur)

    if item["revisions"]:
        rid = item["revisions"][0]["id"]
        cur.execute(f"""
            SELECT id, page_number, page_label, text_layer,
                   length(page_text) AS text_length
            FROM {SCHEMA}.doc_page WHERE revision_id = %s
            ORDER BY COALESCE(page_number, 999999), id
        """, (rid,))
        item["pages"] = rows(cur)
        cur.execute(f"""
            SELECT id, clause_path, clause_title, char_start, char_end
            FROM {SCHEMA}.doc_clause WHERE revision_id = %s ORDER BY id
        """, (rid,))
        item["clauses"] = rows(cur)
        cur.execute(f"""
            SELECT id, chunk_index, content_length, char_start, char_end,
                   left(content, 400) AS preview
            FROM {SCHEMA}.doc_chunk WHERE revision_id = %s ORDER BY chunk_index
        """, (rid,))
        item["chunks"] = rows(cur)
    else:
        item["pages"] = []
        item["clauses"] = []
        item["chunks"] = []
    return item


def build_citation(cur, chunk_id: int):
    """Честная ссылка: отсутствующие уровни помечаются явно, ничего не домысливается."""
    cur.execute(f"""
        SELECT c.id, c.content, c.char_start, c.char_end, c.chunk_index,
               dr.revision_label, dr.verification_state, dr.origin_kind,
               ds.title, COALESCE(ds.display_title, ds.title) AS display_title,
               ds.source_status, p.page_number, p.page_label,
               cl.clause_path, cl.clause_title
        FROM {SCHEMA}.doc_chunk c
        JOIN {SCHEMA}.doc_revision dr ON dr.id = c.revision_id
        JOIN {SCHEMA}.doc_source ds ON ds.id = dr.source_id
        LEFT JOIN {SCHEMA}.doc_page p ON p.id = c.page_id
        LEFT JOIN {SCHEMA}.doc_clause cl ON cl.id = c.clause_id
        WHERE c.id = %s
    """, (chunk_id,))
    r = rows(cur)
    if not r:
        return None
    c = r[0]
    return {
        "document": c["display_title"],
        "original_title": c["title"],
        "source_status": c["source_status"],
        "revision": c["revision_label"] or "Редакция не установлена",
        "page": (f"с. {c['page_number']}" if c["page_number"] is not None
                 else (c["page_label"] or "Страница не установлена")),
        "clause": c["clause_path"] or "Пункт не установлен",
        "fragment_ref": f"фрагмент {c['chunk_index']}, символы {c['char_start']}–{c['char_end']}",
        "quote": c["content"],
        "verification": ("Текст сверен с оригиналом"
                         if c["verification_state"] == "checked_against_original"
                         else "Текст не проверен по оригиналу"),
        "origin_kind": c["origin_kind"],
    }


def local_search(cur, query: str, limit: int = 20):
    """Локальный поиск по чанкам и записям знания. Внешний AI не вызывается."""
    q = f"%{query.lower()}%"
    cur.execute(f"""
        SELECT 'chunk'::text AS hit_kind, c.id AS chunk_id, c.chunk_index,
               c.char_start, c.char_end, left(c.content, 300) AS preview,
               ds.id AS source_id, COALESCE(ds.display_title, ds.title) AS document,
               dr.verification_state, dr.origin_kind, p.page_number
        FROM {SCHEMA}.doc_chunk c
        JOIN {SCHEMA}.doc_revision dr ON dr.id = c.revision_id
        JOIN {SCHEMA}.doc_source ds ON ds.id = dr.source_id
        LEFT JOIN {SCHEMA}.doc_page p ON p.id = c.page_id
        WHERE lower(c.content) LIKE %s
        LIMIT %s
    """, (q, limit))
    hits = rows(cur)

    cur.execute(f"""
        SELECT 'entry'::text AS hit_kind, ke.id AS entry_id, ke.entry_type,
               COALESCE(ke.display_title, ke.title) AS document,
               left(ke.body, 300) AS preview, ke.origin_kind,
               ke.verification_state, ke.ai_usage_policy
        FROM {SCHEMA}.knowledge_entry ke
        WHERE lower(COALESCE(ke.body, '')) LIKE %s
           OR lower(ke.title) LIKE %s
        LIMIT %s
    """, (q, q, limit))
    return {"chunks": hits, "entries": rows(cur)}


def preview_ai_context(cur, query: str, max_fragments: int = 8, budget: int = 7000):
    """Показывает, какие фрагменты БЫЛИ БЫ переданы в AI. Ничего не отправляет.

    Учитывает ai_usage_policy: материалы с not_allowed в контекст не попадают.
    """
    q = f"%{query.lower()}%"
    cur.execute(f"""
        SELECT c.id AS chunk_id, c.content, c.chunk_index,
               COALESCE(ds.display_title, ds.title) AS document,
               dr.verification_state, dr.origin_kind, p.page_number
        FROM {SCHEMA}.doc_chunk c
        JOIN {SCHEMA}.doc_revision dr ON dr.id = c.revision_id
        JOIN {SCHEMA}.doc_source ds ON ds.id = dr.source_id
        LEFT JOIN {SCHEMA}.doc_page p ON p.id = c.page_id
        WHERE lower(c.content) LIKE %s
        ORDER BY c.id
        LIMIT %s
    """, (q, max_fragments))
    candidates = rows(cur)

    selected, used = [], 0
    for c in candidates:
        text = c["content"] or ""
        if used + len(text) > budget:
            text = text[: max(0, budget - used)]
            if not text:
                break
        selected.append({
            "chunk_id": c["chunk_id"],
            "document": c["document"],
            "page": (f"с. {c['page_number']}" if c["page_number"] is not None
                     else "Страница не установлена"),
            "verification": ("сверено с оригиналом"
                             if c["verification_state"] == "checked_against_original"
                             else "не проверено по оригиналу"),
            "origin_kind": c["origin_kind"],
            "chars": len(text),
            "text": text,
        })
        used += len(text)

    cur.execute(f"""
        SELECT count(*) FROM {SCHEMA}.knowledge_entry
        WHERE ai_usage_policy = 'not_allowed'
    """)
    blocked = cur.fetchone()[0]

    return {
        "query": query,
        "would_send_fragments": len(selected),
        "would_send_chars": used,
        "budget": budget,
        "fragments": selected,
        "excluded_by_policy": blocked,
        "note": "Это предварительный просмотр. Данные во внешний AI НЕ отправлялись.",
    }


def handler(event: dict, context) -> dict:
    """Документный контур: реестр источников, редакции, страницы, пункты,
    чанки, записи знания, честное цитирование и локальный поиск без внешнего AI."""
    if event.get("httpMethod") == "OPTIONS":
        return cors({})

    headers = event.get("headers") or {}
    conn = psycopg2.connect(DB)
    try:
        user = authenticate(conn, headers)
        if not user:
            return cors({"ok": False, "error": {"message": "Не авторизован"}}, 401)

        qs = event.get("queryStringParameters") or {}
        action = qs.get("action", "list")
        body = json.loads(event["body"]) if event.get("body") else {}
        cur = conn.cursor()

        if action == "list":
            return cors({"ok": True, "data": {"items": list_materials(cur)}})

        if action == "get":
            kind = qs.get("kind") or body.get("kind") or "entry"
            mid = as_int(qs.get("id")) or as_int(body.get("id"))
            if not mid:
                return cors({"ok": False, "error": {"message": "Не указан материал"}}, 400)
            item = get_material(cur, kind, mid)
            if not item:
                return cors({"ok": False, "error": {"message": "Материал не найден"}}, 404)
            return cors({"ok": True, "data": item})

        if action == "citation":
            chunk_id = as_int(qs.get("chunk_id")) or as_int(body.get("chunk_id"))
            if not chunk_id:
                return cors({"ok": False, "error": {"message": "Не указан фрагмент"}}, 400)
            cit = build_citation(cur, chunk_id)
            if not cit:
                return cors({"ok": False, "error": {"message": "Фрагмент не найден"}}, 404)
            return cors({"ok": True, "data": cit})

        if action == "search":
            query = (qs.get("q") or body.get("q") or "").strip()
            if not query:
                return cors({"ok": False, "error": {"message": "Пустой запрос"}}, 400)
            return cors({"ok": True, "data": local_search(cur, query)})

        if action == "preview_context":
            query = (qs.get("q") or body.get("q") or "").strip()
            if not query:
                return cors({"ok": False, "error": {"message": "Пустой запрос"}}, 400)
            return cors({"ok": True, "data": preview_ai_context(cur, query)})

        if action == "legacy_map":
            cur.execute(f"""
                SELECT lm.*, COALESCE(ke.display_title, ds.display_title) AS target_title
                FROM {SCHEMA}.legacy_knowledge_map lm
                LEFT JOIN {SCHEMA}.knowledge_entry ke ON ke.id = lm.target_entry_id
                LEFT JOIN {SCHEMA}.doc_source ds ON ds.id = lm.target_source_id
                ORDER BY lm.legacy_id
            """)
            return cors({"ok": True, "data": {"items": rows(cur)}})

        return cors({"ok": False, "error": {"message": "Неизвестное действие"}}, 400)
    finally:
        conn.close()
