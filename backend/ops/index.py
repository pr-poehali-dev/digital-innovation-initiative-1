import json
import os
import hashlib
import psycopg2

DB = os.environ["DATABASE_URL"]
_s = os.environ.get("MAIN_DB_SCHEMA", "").strip()
S = _s if _s else "t_p61016064_digital_innovation_i"


def cors(body: dict, code: int = 200) -> dict:
    return {
        "statusCode": code,
        "headers": {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, X-Admin-Token",
            "Content-Type": "application/json",
        },
        "body": json.dumps(body, ensure_ascii=False, default=str),
    }


def get_actor(conn, token: str) -> str | None:
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


def patch(conn, table: str, row_id: int, body: dict, allowed: list, actor: str) -> None:
    fields, vals = [], []
    for f in allowed:
        if f in body:
            fields.append(f"{f} = %s")
            vals.append(body[f])
    if fields:
        vals += [actor, row_id]
        with conn.cursor() as cur:
            cur.execute(
                f"UPDATE {S}.{table} SET {', '.join(fields)}, updated_at = NOW(), updated_by = %s WHERE id = %s",
                vals,
            )
        conn.commit()


def handler(event: dict, context) -> dict:
    """Ops: errors, alerts, feature flags — операционное ядро платформы."""
    if event.get("httpMethod") == "OPTIONS":
        return cors({})

    headers = event.get("headers") or {}
    token = headers.get("x-admin-token") or headers.get("X-Admin-Token", "")

    conn = psycopg2.connect(DB)
    try:
        actor = get_actor(conn, token)
        if not actor:
            return cors({"ok": False, "error": {"message": "Не авторизован"}}, 401)

        method = event.get("httpMethod", "GET")
        qs = event.get("queryStringParameters") or {}
        action = qs.get("action", "")
        module = qs.get("module", "")
        body = {}
        if event.get("body"):
            body = json.loads(event["body"])

        # ── GET all — по модулю ────────────────────────────────────────────────
        if method == "GET" and action == "all":

            if module == "errors":
                with conn.cursor() as cur:
                    cur.execute(f"""
                        SELECT id, title, fingerprint, module_slug, source, environment,
                               severity, status, occurrences_count, first_seen_at, last_seen_at,
                               owner_email, details, resolution_notes, updated_at, updated_by
                        FROM {S}.admin_errors
                        ORDER BY CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2
                                               WHEN 'medium' THEN 3 ELSE 4 END,
                                 last_seen_at DESC
                    """)
                    rows = cur.fetchall()
                errors = [{
                    "id": r[0], "title": r[1], "fingerprint": r[2], "module_slug": r[3],
                    "source": r[4], "environment": r[5], "severity": r[6], "status": r[7],
                    "occurrences_count": r[8], "first_seen_at": str(r[9]), "last_seen_at": str(r[10]),
                    "owner_email": r[11], "details": r[12], "resolution_notes": r[13],
                    "updated_at": str(r[14]), "updated_by": r[15],
                } for r in rows]
                summary = {
                    "open":         sum(1 for e in errors if e["status"] == "open"),
                    "critical":     sum(1 for e in errors if e["severity"] == "critical"),
                    "investigating":sum(1 for e in errors if e["status"] == "investigating"),
                    "resolved":     sum(1 for e in errors if e["status"] == "resolved"),
                }
                return cors({"ok": True, "errors": errors, "summary": summary})

            if module == "alerts":
                with conn.cursor() as cur:
                    cur.execute(f"""
                        SELECT id, name, module_slug, condition_text, threshold_value,
                               window_minutes, severity, status, channel, owner_email,
                               last_triggered_at, notes, updated_at, updated_by
                        FROM {S}.admin_alerts
                        ORDER BY CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2
                                               WHEN 'medium' THEN 3 ELSE 4 END, name
                    """)
                    rows = cur.fetchall()
                alerts = [{
                    "id": r[0], "name": r[1], "module_slug": r[2], "condition_text": r[3],
                    "threshold_value": r[4], "window_minutes": r[5], "severity": r[6],
                    "status": r[7], "channel": r[8], "owner_email": r[9],
                    "last_triggered_at": str(r[10]) if r[10] else None,
                    "notes": r[11], "updated_at": str(r[12]), "updated_by": r[13],
                } for r in rows]
                summary = {
                    "active":   sum(1 for a in alerts if a["status"] == "active"),
                    "triggered":sum(1 for a in alerts if a["status"] == "triggered"),
                    "muted":    sum(1 for a in alerts if a["status"] == "muted"),
                    "no_owner": sum(1 for a in alerts if not a["owner_email"]),
                }
                return cors({"ok": True, "alerts": alerts, "summary": summary})

            if module == "flags":
                with conn.cursor() as cur:
                    cur.execute(f"""
                        SELECT id, key, name, description, environment, enabled,
                               rollout_percent, owner_email, status, notes,
                               updated_at, updated_by
                        FROM {S}.admin_feature_flags
                        ORDER BY status, name
                    """)
                    rows = cur.fetchall()
                flags = [{
                    "id": r[0], "key": r[1], "name": r[2], "description": r[3],
                    "environment": r[4], "enabled": r[5], "rollout_percent": r[6],
                    "owner_email": r[7], "status": r[8], "notes": r[9],
                    "updated_at": str(r[10]), "updated_by": r[11],
                } for r in rows]
                summary = {
                    "enabled":    sum(1 for f in flags if f["enabled"]),
                    "disabled":   sum(1 for f in flags if not f["enabled"]),
                    "planned":    sum(1 for f in flags if f["status"] == "planned"),
                    "deprecated": sum(1 for f in flags if f["status"] == "deprecated"),
                }
                return cors({"ok": True, "flags": flags, "summary": summary})

            return cors({"ok": False, "error": {"message": "Нужен ?module=errors|alerts|flags"}}, 400)

        # ── Errors CRUD ────────────────────────────────────────────────────────
        if method == "POST" and action == "add_error":
            title = body.get("title", "").strip()
            if not title:
                return cors({"ok": False, "error": {"message": "Нужен title"}}, 400)
            with conn.cursor() as cur:
                cur.execute(
                    f"INSERT INTO {S}.admin_errors (title,fingerprint,module_slug,source,environment,severity,status,details,owner_email,created_by,updated_by) "
                    f"VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id",
                    (title, body.get("fingerprint",""), body.get("module_slug",""),
                     body.get("source",""), body.get("environment","production"),
                     body.get("severity","medium"), body.get("status","open"),
                     body.get("details",""), body.get("owner_email",""), actor, actor),
                )
                new_id = cur.fetchone()[0]
            conn.commit()
            return cors({"ok": True, "id": new_id})

        if method == "PUT" and action == "update_error":
            eid = body.get("id")
            if not eid:
                return cors({"ok": False, "error": {"message": "Нужен id"}}, 400)
            patch(conn, "admin_errors", eid, body,
                ["title","fingerprint","module_slug","source","environment","severity",
                 "status","owner_email","details","resolution_notes","occurrences_count"], actor)
            return cors({"ok": True})

        # ── Alerts CRUD ────────────────────────────────────────────────────────
        if method == "POST" and action == "add_alert":
            name = body.get("name", "").strip()
            if not name:
                return cors({"ok": False, "error": {"message": "Нужен name"}}, 400)
            with conn.cursor() as cur:
                cur.execute(
                    f"INSERT INTO {S}.admin_alerts (name,module_slug,condition_text,threshold_value,window_minutes,severity,status,channel,owner_email,notes,created_by,updated_by) "
                    f"VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id",
                    (name, body.get("module_slug",""), body.get("condition_text",""),
                     body.get("threshold_value",""), body.get("window_minutes",60),
                     body.get("severity","medium"), body.get("status","active"),
                     body.get("channel",""), body.get("owner_email",""),
                     body.get("notes",""), actor, actor),
                )
                new_id = cur.fetchone()[0]
            conn.commit()
            return cors({"ok": True, "id": new_id})

        if method == "PUT" and action == "update_alert":
            aid = body.get("id")
            if not aid:
                return cors({"ok": False, "error": {"message": "Нужен id"}}, 400)
            patch(conn, "admin_alerts", aid, body,
                ["name","module_slug","condition_text","threshold_value","window_minutes",
                 "severity","status","channel","owner_email","notes"], actor)
            return cors({"ok": True})

        # ── Flags CRUD ─────────────────────────────────────────────────────────
        if method == "POST" and action == "add_flag":
            key = body.get("key", "").strip()
            name = body.get("name", "").strip()
            if not key or not name:
                return cors({"ok": False, "error": {"message": "Нужны key и name"}}, 400)
            with conn.cursor() as cur:
                cur.execute(
                    f"INSERT INTO {S}.admin_feature_flags (key,name,description,environment,enabled,rollout_percent,owner_email,status,notes,created_by,updated_by) "
                    f"VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id",
                    (key, name, body.get("description",""), body.get("environment","production"),
                     body.get("enabled", False), body.get("rollout_percent",100),
                     body.get("owner_email",""), body.get("status","active"),
                     body.get("notes",""), actor, actor),
                )
                new_id = cur.fetchone()[0]
            conn.commit()
            return cors({"ok": True, "id": new_id})

        if method == "PUT" and action == "update_flag":
            fid = body.get("id")
            if not fid:
                return cors({"ok": False, "error": {"message": "Нужен id"}}, 400)
            patch(conn, "admin_feature_flags", fid, body,
                ["key","name","description","environment","enabled","rollout_percent",
                 "owner_email","status","notes"], actor)
            return cors({"ok": True})

        if method == "PUT" and action == "toggle_flag":
            fid = body.get("id")
            if not fid:
                return cors({"ok": False, "error": {"message": "Нужен id"}}, 400)
            with conn.cursor() as cur:
                cur.execute(
                    f"UPDATE {S}.admin_feature_flags SET enabled = NOT enabled, updated_at = NOW(), updated_by = %s WHERE id = %s RETURNING enabled",
                    (actor, fid),
                )
                new_val = cur.fetchone()[0]
            conn.commit()
            return cors({"ok": True, "enabled": new_val})

        return cors({"ok": False, "error": {"message": "Неизвестное действие"}}, 400)

    finally:
        conn.close()
