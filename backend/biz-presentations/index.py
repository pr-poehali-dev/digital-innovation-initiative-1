import json
import os
import hashlib
import re
import psycopg2

DB = os.environ["DATABASE_URL"]
_s = os.environ.get("MAIN_DB_SCHEMA", "").strip()
S = _s if _s else "t_p61016064_digital_innovation_i"

LAYOUTS = ["cover", "content", "metrics", "process", "roles", "quote", "closing"]


def cors(body: dict, code: int = 200) -> dict:
    return {
        "statusCode": code,
        "headers": {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, X-Admin-Token",
            "Content-Type": "application/json",
        },
        "body": json.dumps(body, ensure_ascii=False, default=str),
    }


def get_actor(conn, token: str):
    if not token:
        return None
    h = hashlib.sha256(token.encode()).hexdigest()
    with conn.cursor() as cur:
        cur.execute(
            f"SELECT actor_email FROM {S}.admin_sessions "
            f"WHERE session_token_hash = %s AND expires_at > NOW() AND revoked_at IS NULL LIMIT 1",
            (h,),
        )
        row = cur.fetchone()
    return row[0] if row else None


def slugify(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r"[^\w\s-]", "", text, flags=re.UNICODE)
    text = re.sub(r"[\s_-]+", "-", text)
    return text[:100] or "presentation"


PRES_COLS = """
    id, slug, title, subtitle, cover_icon, cover_color, is_published,
    created_at, created_by, updated_at, updated_by
"""

SLIDE_COLS = """
    id, presentation_id, order_index, layout, title, subtitle, blocks_json,
    created_at, updated_at
"""


def row_to_pres(r) -> dict:
    return {
        "id": r[0], "slug": r[1], "title": r[2], "subtitle": r[3],
        "cover_icon": r[4], "cover_color": r[5], "is_published": r[6],
        "created_at": str(r[7]), "created_by": r[8],
        "updated_at": str(r[9]), "updated_by": r[10],
    }


def row_to_slide(r) -> dict:
    return {
        "id": r[0], "presentation_id": r[1], "order_index": r[2], "layout": r[3],
        "title": r[4], "subtitle": r[5], "blocks": r[6] or [],
        "created_at": str(r[7]), "updated_at": str(r[8]),
    }


def handler(event: dict, context) -> dict:
    """Хаб бизнес-презентаций: CRUD презентаций и слайдов (светлый конструктор)."""
    if event.get("httpMethod") == "OPTIONS":
        return cors({})

    headers = event.get("headers") or {}
    token = headers.get("x-admin-token") or headers.get("X-Admin-Token", "")

    conn = psycopg2.connect(DB)
    try:
        method = event.get("httpMethod", "GET")
        qs = event.get("queryStringParameters") or {}
        action = qs.get("action", "")
        body = {}
        if event.get("body"):
            body = json.loads(event["body"])

        # ── публичные, только чтение опубликованных ──
        if action == "public_get" and method == "GET":
            slug = qs.get("slug", "")
            with conn.cursor() as cur:
                cur.execute(
                    f"SELECT {PRES_COLS} FROM {S}.biz_presentations "
                    f"WHERE slug = %s AND is_published = true", (slug,)
                )
                prow = cur.fetchone()
                if not prow:
                    return cors({"ok": False, "error": {"message": "Презентация не найдена"}}, 404)
                cur.execute(
                    f"SELECT {SLIDE_COLS} FROM {S}.biz_slides "
                    f"WHERE presentation_id = %s ORDER BY order_index", (prow[0],)
                )
                slides = cur.fetchall()
            return cors({"ok": True, "data": {
                "presentation": row_to_pres(prow),
                "slides": [row_to_slide(s) for s in slides],
            }})

        # ── всё остальное требует авторизации ──
        actor = get_actor(conn, token)
        if not actor:
            return cors({"ok": False, "error": {"message": "Не авторизован"}}, 401)

        if action == "list" and method == "GET":
            with conn.cursor() as cur:
                cur.execute(
                    f"SELECT {PRES_COLS} FROM {S}.biz_presentations ORDER BY updated_at DESC"
                )
                rows = cur.fetchall()
                cur.execute(
                    f"SELECT presentation_id, COUNT(*) FROM {S}.biz_slides GROUP BY presentation_id"
                )
                counts = dict(cur.fetchall())
            items = []
            for r in rows:
                item = row_to_pres(r)
                item["slides_count"] = counts.get(r[0], 0)
                items.append(item)
            return cors({"ok": True, "data": {"items": items}})

        if action == "get" and method == "GET":
            pid = int(qs.get("id", 0))
            with conn.cursor() as cur:
                cur.execute(f"SELECT {PRES_COLS} FROM {S}.biz_presentations WHERE id = %s", (pid,))
                prow = cur.fetchone()
                if not prow:
                    return cors({"ok": False, "error": {"message": "Не найдена"}}, 404)
                cur.execute(
                    f"SELECT {SLIDE_COLS} FROM {S}.biz_slides "
                    f"WHERE presentation_id = %s ORDER BY order_index", (pid,)
                )
                slides = cur.fetchall()
            return cors({"ok": True, "data": {
                "presentation": row_to_pres(prow),
                "slides": [row_to_slide(s) for s in slides],
            }})

        if action == "create" and method == "POST":
            title = (body.get("title") or "").strip()
            if not title:
                return cors({"ok": False, "error": {"message": "Нужен заголовок"}}, 400)
            slug = slugify(body.get("slug") or title)
            with conn.cursor() as cur:
                base_slug = slug
                n = 1
                while True:
                    cur.execute(f"SELECT 1 FROM {S}.biz_presentations WHERE slug = %s", (slug,))
                    if not cur.fetchone():
                        break
                    n += 1
                    slug = f"{base_slug}-{n}"
                cur.execute(f"""
                    INSERT INTO {S}.biz_presentations
                        (slug, title, subtitle, cover_icon, cover_color, is_published, created_by, updated_by)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
                    RETURNING id
                """, (
                    slug, title, body.get("subtitle", ""),
                    body.get("cover_icon", "Presentation"),
                    body.get("cover_color", "violet"),
                    body.get("is_published", True),
                    actor, actor,
                ))
                new_id = cur.fetchone()[0]
            conn.commit()
            return cors({"ok": True, "data": {"id": new_id, "slug": slug}})

        if action == "update" and method == "PUT":
            pid = int(body.get("id", 0))
            fields, vals = [], []
            for k in ("title", "subtitle", "cover_icon", "cover_color", "is_published", "slug"):
                if k in body:
                    fields.append(f"{k} = %s")
                    vals.append(body[k])
            if not fields:
                return cors({"ok": False, "error": {"message": "Нечего обновлять"}}, 400)
            fields.append("updated_at = now()")
            fields.append("updated_by = %s")
            vals.append(actor)
            vals.append(pid)
            with conn.cursor() as cur:
                cur.execute(
                    f"UPDATE {S}.biz_presentations SET {', '.join(fields)} WHERE id = %s RETURNING id",
                    vals,
                )
                row = cur.fetchone()
            conn.commit()
            if not row:
                return cors({"ok": False, "error": {"message": "Не найдена"}}, 404)
            return cors({"ok": True, "data": {"id": row[0]}})

        if action == "delete" and method == "DELETE":
            pid = int(qs.get("id", 0))
            with conn.cursor() as cur:
                cur.execute(f"UPDATE {S}.biz_presentations SET is_published = false, updated_by = %s, updated_at = now() WHERE id = %s RETURNING id", (actor, pid))
                row = cur.fetchone()
            conn.commit()
            if not row:
                return cors({"ok": False, "error": {"message": "Не найдена"}}, 404)
            return cors({"ok": True, "data": {"id": row[0]}})

        # ── слайды ──

        if action == "slide_add" and method == "POST":
            pid = int(body.get("presentation_id", 0))
            with conn.cursor() as cur:
                cur.execute(
                    f"SELECT COALESCE(MAX(order_index), -1) + 1 FROM {S}.biz_slides WHERE presentation_id = %s",
                    (pid,),
                )
                next_idx = cur.fetchone()[0]
                cur.execute(f"""
                    INSERT INTO {S}.biz_slides
                        (presentation_id, order_index, layout, title, subtitle, blocks_json)
                    VALUES (%s,%s,%s,%s,%s,%s)
                    RETURNING id
                """, (
                    pid, body.get("order_index", next_idx),
                    body.get("layout", "content"),
                    body.get("title", ""), body.get("subtitle", ""),
                    json.dumps(body.get("blocks", [])),
                ))
                new_id = cur.fetchone()[0]
                cur.execute(f"UPDATE {S}.biz_presentations SET updated_at = now(), updated_by = %s WHERE id = %s", (actor, pid))
            conn.commit()
            return cors({"ok": True, "data": {"id": new_id}})

        if action == "slide_update" and method == "PUT":
            sid = int(body.get("id", 0))
            fields, vals = [], []
            for k in ("layout", "title", "subtitle"):
                if k in body:
                    fields.append(f"{k} = %s")
                    vals.append(body[k])
            if "blocks" in body:
                fields.append("blocks_json = %s")
                vals.append(json.dumps(body["blocks"]))
            if "order_index" in body:
                fields.append("order_index = %s")
                vals.append(body["order_index"])
            if not fields:
                return cors({"ok": False, "error": {"message": "Нечего обновлять"}}, 400)
            fields.append("updated_at = now()")
            vals.append(sid)
            with conn.cursor() as cur:
                cur.execute(
                    f"UPDATE {S}.biz_slides SET {', '.join(fields)} WHERE id = %s RETURNING presentation_id",
                    vals,
                )
                row = cur.fetchone()
                if row:
                    cur.execute(f"UPDATE {S}.biz_presentations SET updated_at = now(), updated_by = %s WHERE id = %s", (actor, row[0]))
            conn.commit()
            if not row:
                return cors({"ok": False, "error": {"message": "Слайд не найден"}}, 404)
            return cors({"ok": True, "data": {"id": sid}})

        if action == "slide_delete" and method == "DELETE":
            sid = int(qs.get("id", 0))
            with conn.cursor() as cur:
                cur.execute(f"SELECT presentation_id FROM {S}.biz_slides WHERE id = %s", (sid,))
                row = cur.fetchone()
                if not row:
                    return cors({"ok": False, "error": {"message": "Слайд не найден"}}, 404)
                cur.execute(f"DELETE FROM {S}.biz_slides WHERE id = %s", (sid,))
                cur.execute(f"UPDATE {S}.biz_presentations SET updated_at = now(), updated_by = %s WHERE id = %s", (actor, row[0]))
            conn.commit()
            return cors({"ok": True, "data": {"id": sid}})

        if action == "slide_reorder" and method == "PUT":
            order = body.get("order") or []
            with conn.cursor() as cur:
                for i, sid in enumerate(order):
                    cur.execute(f"UPDATE {S}.biz_slides SET order_index = %s WHERE id = %s", (i, int(sid)))
            conn.commit()
            return cors({"ok": True, "data": {"updated": len(order)}})

        return cors({"ok": False, "error": {"message": "Неизвестное действие"}}, 400)
    finally:
        conn.close()
