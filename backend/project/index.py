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
            "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, X-Admin-Token",
            "Content-Type": "application/json",
        },
        "body": json.dumps(body, ensure_ascii=False, default=str),
    }


def get_admin(conn, token: str) -> str | None:
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


def handler(event: dict, context) -> dict:
    """Project Architecture — as-is, to-be, gaps, decisions, waves."""
    if event.get("httpMethod") == "OPTIONS":
        return cors({})

    headers = event.get("headers") or {}
    token = headers.get("x-admin-token") or headers.get("X-Admin-Token", "")

    conn = psycopg2.connect(DB)
    try:
        actor = get_admin(conn, token)
        if not actor:
            return cors({"ok": False, "error": {"message": "Не авторизован"}}, 401)

        method = event.get("httpMethod", "GET")
        qs = event.get("queryStringParameters") or {}
        action = qs.get("action", "")
        body = {}
        if event.get("body"):
            body = json.loads(event["body"])

        # ── Загрузить всё ─────────────────────────────────────────────
        if method == "GET" and action == "all":
            with conn.cursor() as cur:
                cur.execute(f"SELECT section_key, title, content, updated_at, updated_by FROM {SCHEMA}.project_sections ORDER BY id")
                sections = {r[0]: {"title": r[1], "content": r[2], "updated_at": str(r[3]), "updated_by": r[4]} for r in cur.fetchall()}

                cur.execute(f"SELECT id, title, description, gap_type, status, created_at, created_by FROM {SCHEMA}.project_gaps ORDER BY gap_type, status, id")
                gaps = [{"id": r[0], "title": r[1], "description": r[2], "gap_type": r[3], "status": r[4], "created_at": str(r[5]), "created_by": r[6]} for r in cur.fetchall()]

                cur.execute(f"SELECT id, what, why, changed, decided_at, created_at, created_by FROM {SCHEMA}.project_decisions ORDER BY decided_at DESC, id DESC")
                decisions = [{"id": r[0], "what": r[1], "why": r[2], "changed": r[3], "decided_at": str(r[4]), "created_at": str(r[5]), "created_by": r[6]} for r in cur.fetchall()]

                cur.execute(f"SELECT id, wave_num, title, goal, status, order_index FROM {SCHEMA}.project_waves ORDER BY order_index, wave_num")
                waves_rows = cur.fetchall()
                waves = []
                for w in waves_rows:
                    cur.execute(f"SELECT id, title, status, order_index FROM {SCHEMA}.project_wave_items WHERE wave_id = %s ORDER BY order_index, id", (w[0],))
                    items = [{"id": i[0], "title": i[1], "status": i[2]} for i in cur.fetchall()]
                    waves.append({"id": w[0], "wave_num": w[1], "title": w[2], "goal": w[3], "status": w[4], "items": items})

            return cors({"ok": True, "sections": sections, "gaps": gaps, "decisions": decisions, "waves": waves})

        # ── Секции (as_is / to_be / notes) ───────────────────────────
        if method == "PUT" and action == "save_section":
            key = body.get("key", "").strip()
            content = body.get("content", "")
            if not key:
                return cors({"ok": False, "error": {"message": "Нужен key"}}, 400)
            with conn.cursor() as cur:
                cur.execute(
                    f"UPDATE {SCHEMA}.project_sections SET content = %s, updated_at = NOW(), updated_by = %s WHERE section_key = %s",
                    (content, actor, key),
                )
            conn.commit()
            return cors({"ok": True})

        # ── Gap / Conflict ────────────────────────────────────────────
        if method == "POST" and action == "add_gap":
            title = body.get("title", "").strip()
            if not title:
                return cors({"ok": False, "error": {"message": "Нужен title"}}, 400)
            with conn.cursor() as cur:
                cur.execute(
                    f"INSERT INTO {SCHEMA}.project_gaps (title, description, gap_type, status, created_by) VALUES (%s, %s, %s, %s, %s) RETURNING id",
                    (title, body.get("description", ""), body.get("gap_type", "gap"), body.get("status", "open"), actor),
                )
                new_id = cur.fetchone()[0]
            conn.commit()
            return cors({"ok": True, "id": new_id})

        if method == "PUT" and action == "update_gap":
            gap_id = body.get("id")
            if not gap_id:
                return cors({"ok": False, "error": {"message": "Нужен id"}}, 400)
            fields, vals = [], []
            for f in ("title", "description", "gap_type", "status"):
                if f in body:
                    fields.append(f"{f} = %s")
                    vals.append(body[f])
            if fields:
                vals += [gap_id]
                with conn.cursor() as cur:
                    cur.execute(f"UPDATE {SCHEMA}.project_gaps SET {', '.join(fields)}, updated_at = NOW() WHERE id = %s", vals)
                conn.commit()
            return cors({"ok": True})

        # ── Архитектурные решения ─────────────────────────────────────
        if method == "POST" and action == "add_decision":
            what = body.get("what", "").strip()
            if not what:
                return cors({"ok": False, "error": {"message": "Нужен what"}}, 400)
            with conn.cursor() as cur:
                cur.execute(
                    f"INSERT INTO {SCHEMA}.project_decisions (what, why, changed, decided_at, created_by) VALUES (%s, %s, %s, %s, %s) RETURNING id, created_at",
                    (what, body.get("why", ""), body.get("changed", ""), body.get("decided_at") or "CURRENT_DATE", actor),
                )
                row = cur.fetchone()
            conn.commit()
            return cors({"ok": True, "id": row[0], "created_at": str(row[1]), "created_by": actor})

        # ── Волны (Waves) ─────────────────────────────────────────────
        if method == "POST" and action == "add_wave":
            title = body.get("title", "").strip()
            if not title:
                return cors({"ok": False, "error": {"message": "Нужен title"}}, 400)
            with conn.cursor() as cur:
                cur.execute(f"SELECT COALESCE(MAX(wave_num), 0) + 1 FROM {SCHEMA}.project_waves")
                next_num = cur.fetchone()[0]
                cur.execute(
                    f"INSERT INTO {SCHEMA}.project_waves (wave_num, title, goal, status, order_index, updated_by) VALUES (%s, %s, %s, %s, %s, %s) RETURNING id",
                    (next_num, title, body.get("goal", ""), body.get("status", "planned"), next_num, actor),
                )
                new_id = cur.fetchone()[0]
            conn.commit()
            return cors({"ok": True, "id": new_id, "wave_num": next_num})

        if method == "PUT" and action == "update_wave":
            wave_id = body.get("id")
            if not wave_id:
                return cors({"ok": False, "error": {"message": "Нужен id"}}, 400)
            fields, vals = [], []
            for f in ("title", "goal", "status"):
                if f in body:
                    fields.append(f"{f} = %s")
                    vals.append(body[f])
            if fields:
                vals += [actor, wave_id]
                with conn.cursor() as cur:
                    cur.execute(f"UPDATE {SCHEMA}.project_waves SET {', '.join(fields)}, updated_at = NOW(), updated_by = %s WHERE id = %s", vals)
                conn.commit()
            return cors({"ok": True})

        if method == "POST" and action == "add_wave_item":
            wave_id = body.get("wave_id")
            title = body.get("title", "").strip()
            if not wave_id or not title:
                return cors({"ok": False, "error": {"message": "Нужны wave_id и title"}}, 400)
            with conn.cursor() as cur:
                cur.execute(f"SELECT COALESCE(MAX(order_index), 0) + 1 FROM {SCHEMA}.project_wave_items WHERE wave_id = %s", (wave_id,))
                next_idx = cur.fetchone()[0]
                cur.execute(
                    f"INSERT INTO {SCHEMA}.project_wave_items (wave_id, title, status, order_index) VALUES (%s, %s, %s, %s) RETURNING id",
                    (wave_id, title, "todo", next_idx),
                )
                new_id = cur.fetchone()[0]
            conn.commit()
            return cors({"ok": True, "id": new_id})

        if method == "PUT" and action == "update_wave_item":
            item_id = body.get("id")
            if not item_id:
                return cors({"ok": False, "error": {"message": "Нужен id"}}, 400)
            fields, vals = [], []
            for f in ("title", "status"):
                if f in body:
                    fields.append(f"{f} = %s")
                    vals.append(body[f])
            if fields:
                vals += [item_id]
                with conn.cursor() as cur:
                    cur.execute(f"UPDATE {SCHEMA}.project_wave_items SET {', '.join(fields)} WHERE id = %s", vals)
                conn.commit()
            return cors({"ok": True})

        return cors({"ok": False, "error": {"message": "Неизвестное действие"}}, 400)

    finally:
        conn.close()
