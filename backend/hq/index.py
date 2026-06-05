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
    """Возвращает actor_email если токен валиден, иначе None."""
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
    """Project HQ — командный штаб: блоки, цели, решения, риски, правила, идеи."""
    if event.get("httpMethod") == "OPTIONS":
        return cors({})

    headers = event.get("headers") or {}
    token = (headers.get("x-admin-token") or headers.get("X-Admin-Token", ""))

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

        # ── Загрузить всё сразу (главная HQ) ─────────────────────────
        if method == "GET" and action == "all":
            with conn.cursor() as cur:
                cur.execute(f"SELECT block_key, title, content, updated_at, updated_by FROM {SCHEMA}.hq_blocks ORDER BY id")
                blocks = {r[0]: {"title": r[1], "content": r[2], "updated_at": str(r[3]), "updated_by": r[4]} for r in cur.fetchall()}

                cur.execute(f"SELECT id, title, horizon, status, criterion, order_index FROM {SCHEMA}.hq_goals ORDER BY order_index, id")
                goals = [{"id": r[0], "title": r[1], "horizon": r[2], "status": r[3], "criterion": r[4], "order_index": r[5]} for r in cur.fetchall()]

                cur.execute(f"SELECT id, what, why, changed, decided_at, created_at, created_by FROM {SCHEMA}.hq_decisions ORDER BY decided_at DESC, id DESC LIMIT 20")
                decisions = [{"id": r[0], "what": r[1], "why": r[2], "changed": r[3], "decided_at": str(r[4]), "created_at": str(r[5]), "created_by": r[6]} for r in cur.fetchall()]

                cur.execute(f"SELECT id, title, impact, mitigation, status FROM {SCHEMA}.hq_risks ORDER BY CASE impact WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, id")
                risks = [{"id": r[0], "title": r[1], "impact": r[2], "mitigation": r[3], "status": r[4]} for r in cur.fetchall()]

                cur.execute(f"SELECT id, category, rule_text, order_index FROM {SCHEMA}.hq_rules ORDER BY category, order_index, id")
                rules = [{"id": r[0], "category": r[1], "rule_text": r[2], "order_index": r[3]} for r in cur.fetchall()]

                cur.execute(f"SELECT id, title, why, priority, status, source, created_at FROM {SCHEMA}.hq_ideas ORDER BY CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, id DESC")
                ideas = [{"id": r[0], "title": r[1], "why": r[2], "priority": r[3], "status": r[4], "source": r[5], "created_at": str(r[6])} for r in cur.fetchall()]

            return cors({"ok": True, "blocks": blocks, "goals": goals, "decisions": decisions,
                         "risks": risks, "rules": rules, "ideas": ideas})

        # ── Блоки (vision / mission / focus / scratch) ────────────────
        if method == "PUT" and action == "save_block":
            key = body.get("key", "").strip()
            content = body.get("content", "")
            if not key:
                return cors({"ok": False, "error": {"message": "Нужен key"}}, 400)
            with conn.cursor() as cur:
                cur.execute(
                    f"UPDATE {SCHEMA}.hq_blocks SET content = %s, updated_at = NOW(), updated_by = %s WHERE block_key = %s",
                    (content, actor, key),
                )
            conn.commit()
            return cors({"ok": True, "updated_at": "now", "updated_by": actor})

        # ── Цели ──────────────────────────────────────────────────────
        if method == "POST" and action == "add_goal":
            title = body.get("title", "").strip()
            if not title:
                return cors({"ok": False, "error": {"message": "Нужен title"}}, 400)
            with conn.cursor() as cur:
                cur.execute(
                    f"INSERT INTO {SCHEMA}.hq_goals (title, horizon, status, criterion) VALUES (%s, %s, %s, %s) RETURNING id",
                    (title, body.get("horizon", ""), body.get("status", "planned"), body.get("criterion", "")),
                )
                new_id = cur.fetchone()[0]
            conn.commit()
            return cors({"ok": True, "id": new_id})

        if method == "PUT" and action == "update_goal":
            goal_id = body.get("id")
            if not goal_id:
                return cors({"ok": False, "error": {"message": "Нужен id"}}, 400)
            fields, vals = [], []
            for f in ("title", "horizon", "status", "criterion"):
                if f in body:
                    fields.append(f"{f} = %s")
                    vals.append(body[f])
            if fields:
                vals += [goal_id]
                with conn.cursor() as cur:
                    cur.execute(f"UPDATE {SCHEMA}.hq_goals SET {', '.join(fields)}, updated_at = NOW() WHERE id = %s", vals)
                conn.commit()
            return cors({"ok": True})

        # ── Решения ───────────────────────────────────────────────────
        if method == "POST" and action == "add_decision":
            what = body.get("what", "").strip()
            if not what:
                return cors({"ok": False, "error": {"message": "Нужен what"}}, 400)
            with conn.cursor() as cur:
                cur.execute(
                    f"INSERT INTO {SCHEMA}.hq_decisions (what, why, changed, decided_at, created_by) VALUES (%s, %s, %s, %s, %s) RETURNING id, created_at",
                    (what, body.get("why", ""), body.get("changed", ""), body.get("decided_at") or "CURRENT_DATE", actor),
                )
                row = cur.fetchone()
            conn.commit()
            return cors({"ok": True, "id": row[0], "created_at": str(row[1]), "created_by": actor})

        # ── Риски ─────────────────────────────────────────────────────
        if method == "POST" and action == "add_risk":
            title = body.get("title", "").strip()
            if not title:
                return cors({"ok": False, "error": {"message": "Нужен title"}}, 400)
            with conn.cursor() as cur:
                cur.execute(
                    f"INSERT INTO {SCHEMA}.hq_risks (title, impact, mitigation, status) VALUES (%s, %s, %s, %s) RETURNING id",
                    (title, body.get("impact", "medium"), body.get("mitigation", ""), body.get("status", "open")),
                )
                new_id = cur.fetchone()[0]
            conn.commit()
            return cors({"ok": True, "id": new_id})

        if method == "PUT" and action == "update_risk":
            risk_id = body.get("id")
            if not risk_id:
                return cors({"ok": False, "error": {"message": "Нужен id"}}, 400)
            fields, vals = [], []
            for f in ("title", "impact", "mitigation", "status"):
                if f in body:
                    fields.append(f"{f} = %s")
                    vals.append(body[f])
            if fields:
                vals += [risk_id]
                with conn.cursor() as cur:
                    cur.execute(f"UPDATE {SCHEMA}.hq_risks SET {', '.join(fields)}, updated_at = NOW() WHERE id = %s", vals)
                conn.commit()
            return cors({"ok": True})

        # ── Правила ───────────────────────────────────────────────────
        if method == "POST" and action == "add_rule":
            rule_text = body.get("rule_text", "").strip()
            if not rule_text:
                return cors({"ok": False, "error": {"message": "Нужен rule_text"}}, 400)
            with conn.cursor() as cur:
                cur.execute(
                    f"INSERT INTO {SCHEMA}.hq_rules (category, rule_text, order_index) VALUES (%s, %s, %s) RETURNING id",
                    (body.get("category", "general"), rule_text, body.get("order_index", 0)),
                )
                new_id = cur.fetchone()[0]
            conn.commit()
            return cors({"ok": True, "id": new_id})

        # ── Идеи ──────────────────────────────────────────────────────
        if method == "POST" and action == "add_idea":
            title = body.get("title", "").strip()
            if not title:
                return cors({"ok": False, "error": {"message": "Нужен title"}}, 400)
            with conn.cursor() as cur:
                cur.execute(
                    f"INSERT INTO {SCHEMA}.hq_ideas (title, why, priority, status, source) VALUES (%s, %s, %s, %s, %s) RETURNING id",
                    (title, body.get("why", ""), body.get("priority", "medium"), "new", body.get("source", "")),
                )
                new_id = cur.fetchone()[0]
            conn.commit()
            return cors({"ok": True, "id": new_id})

        if method == "PUT" and action == "update_idea":
            idea_id = body.get("id")
            if not idea_id:
                return cors({"ok": False, "error": {"message": "Нужен id"}}, 400)
            fields, vals = [], []
            for f in ("title", "why", "priority", "status", "source"):
                if f in body:
                    fields.append(f"{f} = %s")
                    vals.append(body[f])
            if fields:
                vals += [idea_id]
                with conn.cursor() as cur:
                    cur.execute(f"UPDATE {SCHEMA}.hq_ideas SET {', '.join(fields)}, updated_at = NOW() WHERE id = %s", vals)
                conn.commit()
            return cors({"ok": True})

        return cors({"ok": False, "error": {"message": "Неизвестное действие"}}, 400)

    finally:
        conn.close()