"""
W5.2 — Ticket Automation Rules.
CRUD правил + движок выполнения + лог.

Триггеры:  new_ticket | status_changed | priority_changed | stale | unassigned_timeout
Условия:   [{field, op, value}]  — поля тикета, операторы eq/ne/contains/in/gt/lt
Действия:  [{type, value}]       — assign | set_status | set_priority | add_tag |
                                    add_note | send_notification
"""
import json
import os
import hashlib
import psycopg2

DB = os.environ["DATABASE_URL"]
_s = os.environ.get("MAIN_DB_SCHEMA", "").strip()
S = _s if _s else "t_p61016064_digital_innovation_i"

TRIGGER_TYPES = [
    "new_ticket", "status_changed", "priority_changed",
    "stale", "unassigned_timeout",
]
CONDITION_FIELDS = ["priority", "status", "source", "module_slug",
                    "assignee_email", "requester_email", "subject"]
CONDITION_OPS    = ["eq", "ne", "contains", "not_contains", "in", "is_empty", "is_not_empty"]
ACTION_TYPES     = ["assign", "set_status", "set_priority",
                    "add_tag", "add_internal_note", "add_system_note"]


# ── CORS / response ────────────────────────────────────────────────

def cors(origin: str = "") -> dict:
    allowed = origin if _is_allowed(origin) else "*"
    return {
        "Access-Control-Allow-Origin":  allowed,
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-Admin-Token",
        "Vary": "Origin",
    }


def _is_allowed(origin: str) -> bool:
    if not origin:
        return False
    try:
        from urllib.parse import urlparse
        host = (urlparse(origin).hostname or "").lower()
        return host in ("raven.moscow", "www.raven.moscow", "localhost") \
               or host.endswith(".poehali.dev")
    except Exception:
        return False


def resp(data: dict, code: int = 200, origin: str = "") -> dict:
    return {
        "statusCode": code,
        "headers": {**cors(origin), "Content-Type": "application/json"},
        "body": json.dumps(data, ensure_ascii=False, default=str),
    }


# ── Auth ────────────────────────────────────────────────────────────

def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def get_actor(conn, token: str) -> dict | None:
    if not token:
        return None
    h = _hash(token)
    with conn.cursor() as cur:
        cur.execute(
            f"SELECT actor_email, actor_role FROM {S}.admin_sessions "
            f"WHERE session_token_hash = %s AND expires_at > NOW() AND revoked_at IS NULL LIMIT 1",
            (h,),
        )
        row = cur.fetchone()
    return {"email": row[0], "role": row[1]} if row else None


# ── Helpers ────────────────────────────────────────────────────────

def row_to_rule(r) -> dict:
    return {
        "id": r[0], "name": r[1], "description": r[2], "enabled": r[3],
        "trigger_type": r[4],
        "conditions":   r[5] if isinstance(r[5], list) else [],
        "rule_actions": r[6] if isinstance(r[6], list) else [],
        "order_index":  r[7], "run_count": r[8],
        "last_run_at":  str(r[9]) if r[9] else None,
        "created_at": str(r[10]), "created_by": r[11],
        "updated_at": str(r[12]), "updated_by": r[13],
    }


def _validate_conditions(conds: list) -> str | None:
    for c in conds:
        if c.get("field") not in CONDITION_FIELDS:
            return f"Unknown condition field: {c.get('field')}"
        if c.get("op") not in CONDITION_OPS:
            return f"Unknown condition op: {c.get('op')}"
    return None


def _validate_actions(actions: list) -> str | None:
    for a in actions:
        if a.get("type") not in ACTION_TYPES:
            return f"Unknown action type: {a.get('type')}"
    return None


# ── CRUD ────────────────────────────────────────────────────────────

def action_list(conn, origin: str) -> dict:
    """Список всех правил автоматизации."""
    with conn.cursor() as cur:
        cur.execute(f"""
            SELECT id, name, description, enabled, trigger_type,
                   conditions, rule_actions, order_index, run_count, last_run_at,
                   created_at, created_by, updated_at, updated_by
            FROM {S}.ticket_automation_rules
            ORDER BY order_index, created_at
        """)
        rows = cur.fetchall()
    return resp({"rules": [row_to_rule(r) for r in rows]}, origin=origin)


def action_get(conn, rule_id: int, origin: str) -> dict:
    """Одно правило + последние 20 записей лога."""
    with conn.cursor() as cur:
        cur.execute(f"""
            SELECT id, name, description, enabled, trigger_type,
                   conditions, rule_actions, order_index, run_count, last_run_at,
                   created_at, created_by, updated_at, updated_by
            FROM {S}.ticket_automation_rules WHERE id = {rule_id}
        """)
        row = cur.fetchone()
    if not row:
        return resp({"error": "not_found"}, 404, origin)
    rule = row_to_rule(row)

    with conn.cursor() as cur:
        cur.execute(f"""
            SELECT id, ticket_id, ticket_no, triggered_by, actions_taken, created_at
            FROM {S}.ticket_automation_log
            WHERE rule_id = {rule_id}
            ORDER BY created_at DESC LIMIT 20
        """)
        log_rows = cur.fetchall()
    rule["log"] = [{
        "id": r[0], "ticket_id": r[1], "ticket_no": r[2],
        "triggered_by": r[3],
        "actions_taken": r[4] if isinstance(r[4], list) else [],
        "created_at": str(r[5]),
    } for r in log_rows]

    return resp({"rule": rule}, origin=origin)


def action_create(conn, actor: dict, body: dict, origin: str) -> dict:
    """Создать новое правило автоматизации."""
    name = (body.get("name") or "").strip()
    if not name:
        return resp({"error": "name required"}, 400, origin)

    trigger_type = body.get("trigger_type", "new_ticket")
    if trigger_type not in TRIGGER_TYPES:
        return resp({"error": f"invalid trigger_type"}, 400, origin)

    conditions   = body.get("conditions", [])
    rule_actions = body.get("rule_actions", [])

    err = _validate_conditions(conditions)
    if err:
        return resp({"error": err}, 400, origin)
    err = _validate_actions(rule_actions)
    if err:
        return resp({"error": err}, 400, origin)

    description = (body.get("description") or "").strip()
    enabled     = bool(body.get("enabled", True))
    order_index = int(body.get("order_index", 0))
    conds_json  = json.dumps(conditions,   ensure_ascii=False)
    acts_json   = json.dumps(rule_actions, ensure_ascii=False)
    actor_email = actor["email"]

    with conn.cursor() as cur:
        cur.execute(f"""
            INSERT INTO {S}.ticket_automation_rules
              (name, description, enabled, trigger_type, conditions, rule_actions,
               order_index, created_by, updated_by)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id
        """, (name, description, enabled, trigger_type,
              conds_json, acts_json, order_index, actor_email, actor_email))
        new_id = cur.fetchone()[0]
    conn.commit()
    return resp({"ok": True, "id": new_id}, origin=origin)


def action_update(conn, actor: dict, body: dict, origin: str) -> dict:
    """Обновить правило (частичное)."""
    rule_id = body.get("id")
    if not rule_id:
        return resp({"error": "id required"}, 400, origin)
    rule_id = int(rule_id)

    fields, vals = [], []

    if "name" in body:
        fields.append("name = %s"); vals.append(body["name"])
    if "description" in body:
        fields.append("description = %s"); vals.append(body["description"])
    if "enabled" in body:
        fields.append("enabled = %s"); vals.append(bool(body["enabled"]))
    if "trigger_type" in body:
        tt = body["trigger_type"]
        if tt not in TRIGGER_TYPES:
            return resp({"error": "invalid trigger_type"}, 400, origin)
        fields.append("trigger_type = %s"); vals.append(tt)
    if "conditions" in body:
        conds = body["conditions"]
        err = _validate_conditions(conds)
        if err:
            return resp({"error": err}, 400, origin)
        fields.append("conditions = %s"); vals.append(json.dumps(conds, ensure_ascii=False))
    if "rule_actions" in body:
        acts = body["rule_actions"]
        err = _validate_actions(acts)
        if err:
            return resp({"error": err}, 400, origin)
        fields.append("rule_actions = %s"); vals.append(json.dumps(acts, ensure_ascii=False))
    if "order_index" in body:
        fields.append("order_index = %s"); vals.append(int(body["order_index"]))

    if not fields:
        return resp({"ok": True}, origin=origin)

    fields.append("updated_at = NOW()"); fields.append("updated_by = %s")
    vals.append(actor["email"]); vals.append(rule_id)

    with conn.cursor() as cur:
        cur.execute(
            f"UPDATE {S}.ticket_automation_rules SET {', '.join(fields)} WHERE id = %s",
            vals,
        )
    conn.commit()
    return resp({"ok": True}, origin=origin)


def action_delete(conn, body: dict, origin: str) -> dict:
    """Удалить правило."""
    rule_id = body.get("id")
    if not rule_id:
        return resp({"error": "id required"}, 400, origin)
    with conn.cursor() as cur:
        cur.execute(f"DELETE FROM {S}.ticket_automation_rules WHERE id = %s", (int(rule_id),))
    conn.commit()
    return resp({"ok": True}, origin=origin)


def action_toggle(conn, body: dict, origin: str) -> dict:
    """Быстрое включение/выключение правила."""
    rule_id = body.get("id")
    enabled = body.get("enabled")
    if rule_id is None or enabled is None:
        return resp({"error": "id and enabled required"}, 400, origin)
    with conn.cursor() as cur:
        cur.execute(
            f"UPDATE {S}.ticket_automation_rules SET enabled = %s, updated_at = NOW() WHERE id = %s",
            (bool(enabled), int(rule_id)),
        )
    conn.commit()
    return resp({"ok": True}, origin=origin)


# ── Engine ─────────────────────────────────────────────────────────

def _match_condition(ticket: dict, cond: dict) -> bool:
    field = cond.get("field", "")
    op    = cond.get("op", "eq")
    value = cond.get("value", "")
    actual = str(ticket.get(field, "") or "").lower()
    value_s = str(value).lower()

    if op == "eq":           return actual == value_s
    if op == "ne":           return actual != value_s
    if op == "contains":     return value_s in actual
    if op == "not_contains": return value_s not in actual
    if op == "in":
        vals = [v.strip().lower() for v in str(value).split(",")]
        return actual in vals
    if op == "is_empty":     return not actual
    if op == "is_not_empty": return bool(actual)
    return False


def _apply_action(conn, ticket_id: int, ticket_no: str, act: dict, actor_email: str) -> str:
    """Выполняет одно действие над тикетом. Возвращает описание."""
    atype = act.get("type", "")
    value = act.get("value", "")

    if atype == "assign":
        with conn.cursor() as cur:
            cur.execute(
                f"UPDATE {S}.admin_tickets SET assignee_email = %s, updated_at = NOW(), updated_by = %s WHERE id = %s",
                (value, actor_email, ticket_id),
            )
        return f"assigned → {value}"

    if atype == "set_status":
        extra = ""
        if value == "resolved": extra = ", resolved_at = NOW()"
        elif value == "closed": extra = ", closed_at = NOW()"
        with conn.cursor() as cur:
            cur.execute(
                f"UPDATE {S}.admin_tickets SET status = %s{extra}, updated_at = NOW(), updated_by = %s WHERE id = %s",
                (value, actor_email, ticket_id),
            )
        return f"status → {value}"

    if atype == "set_priority":
        with conn.cursor() as cur:
            cur.execute(
                f"UPDATE {S}.admin_tickets SET priority = %s, updated_at = NOW(), updated_by = %s WHERE id = %s",
                (value, actor_email, ticket_id),
            )
        return f"priority → {value}"

    if atype in ("add_internal_note", "add_system_note"):
        mtype = "internal_note" if atype == "add_internal_note" else "system_event"
        with conn.cursor() as cur:
            cur.execute(f"""
                INSERT INTO {S}.admin_ticket_messages
                  (ticket_id, message_type, author_name, author_email, body, created_by)
                VALUES (%s, %s, 'Automation', %s, %s, %s)
            """, (ticket_id, mtype, actor_email, value, actor_email))
        with conn.cursor() as cur:
            cur.execute(
                f"UPDATE {S}.admin_tickets SET last_message_at = NOW(), updated_at = NOW() WHERE id = %s",
                (ticket_id,),
            )
        return f"{mtype}: {str(value)[:40]}"

    if atype == "add_tag":
        with conn.cursor() as cur:
            cur.execute(
                f"UPDATE {S}.admin_tickets SET tags_json = tags_json || %s::jsonb, updated_at = NOW() WHERE id = %s",
                (json.dumps([value]), ticket_id),
            )
        return f"tag added: {value}"

    return f"unknown action: {atype}"


def action_run(conn, actor: dict, body: dict, origin: str) -> dict:
    """
    Запустить правило вручную над конкретным тикетом или всеми подходящими.
    body: {rule_id, ticket_id?}
    """
    rule_id   = body.get("rule_id")
    ticket_id = body.get("ticket_id")
    if not rule_id:
        return resp({"error": "rule_id required"}, 400, origin)
    rule_id = int(rule_id)

    # Загружаем правило
    with conn.cursor() as cur:
        cur.execute(f"""
            SELECT id, trigger_type, conditions, rule_actions, enabled
            FROM {S}.ticket_automation_rules WHERE id = {rule_id}
        """)
        row = cur.fetchone()
    if not row:
        return resp({"error": "rule not found"}, 404, origin)

    trigger_type = row[1]
    conditions   = row[2] if isinstance(row[2], list) else []
    rule_actions = row[3] if isinstance(row[3], list) else []

    # Загружаем тикеты (один или все активные)
    if ticket_id:
        with conn.cursor() as cur:
            cur.execute(
                f"SELECT id, ticket_no, status, priority, source, module_slug, "
                f"assignee_email, requester_email, subject FROM {S}.admin_tickets WHERE id = %s",
                (int(ticket_id),),
            )
            rows = cur.fetchall()
    else:
        with conn.cursor() as cur:
            cur.execute(
                f"SELECT id, ticket_no, status, priority, source, module_slug, "
                f"assignee_email, requester_email, subject FROM {S}.admin_tickets "
                f"WHERE status NOT IN ('resolved','closed') LIMIT 500"
            )
            rows = cur.fetchall()

    actor_email = actor["email"]
    executed = 0

    for r in rows:
        ticket = {
            "id": r[0], "ticket_no": r[1], "status": r[2], "priority": r[3],
            "source": r[4], "module_slug": r[5],
            "assignee_email": r[6], "requester_email": r[7], "subject": r[8],
        }
        # Проверяем условия
        if not all(_match_condition(ticket, c) for c in conditions):
            continue

        # Выполняем действия
        actions_taken = []
        for act in rule_actions:
            desc = _apply_action(conn, ticket["id"], ticket["ticket_no"], act, actor_email)
            actions_taken.append(desc)

        if actions_taken:
            # Пишем лог
            with conn.cursor() as cur:
                cur.execute(f"""
                    INSERT INTO {S}.ticket_automation_log
                      (rule_id, ticket_id, ticket_no, triggered_by, actions_taken)
                    VALUES (%s, %s, %s, %s, %s)
                """, (rule_id, ticket["id"], ticket["ticket_no"],
                      f"manual:{trigger_type}",
                      json.dumps(actions_taken, ensure_ascii=False)))
            executed += 1

    # Обновляем run_count + last_run_at
    with conn.cursor() as cur:
        cur.execute(
            f"UPDATE {S}.ticket_automation_rules SET run_count = run_count + 1, last_run_at = NOW() WHERE id = {rule_id}"
        )
    conn.commit()

    return resp({"ok": True, "executed": executed}, origin=origin)


def action_log(conn, rule_id: int, origin: str) -> dict:
    """Лог выполнений правила."""
    with conn.cursor() as cur:
        cur.execute(f"""
            SELECT id, ticket_id, ticket_no, triggered_by, actions_taken, created_at
            FROM {S}.ticket_automation_log WHERE rule_id = {rule_id}
            ORDER BY created_at DESC LIMIT 50
        """)
        rows = cur.fetchall()
    log = [{
        "id": r[0], "ticket_id": r[1], "ticket_no": r[2],
        "triggered_by": r[3],
        "actions_taken": r[4] if isinstance(r[4], list) else [],
        "created_at": str(r[5]),
    } for r in rows]
    return resp({"log": log}, origin=origin)


# ── Handler ─────────────────────────────────────────────────────────

def handler(event: dict, context) -> dict:
    """W5.2 Ticket Automation Rules: CRUD + engine."""
    headers = event.get("headers") or {}
    origin  = headers.get("origin") or headers.get("Origin") or ""
    method  = event.get("httpMethod", "GET")

    if method == "OPTIONS":
        return resp({}, 200, origin)

    token = headers.get("X-Admin-Token") or headers.get("x-admin-token") or ""
    conn  = psycopg2.connect(DB)
    try:
        actor = get_actor(conn, token)
        if not actor:
            return resp({"error": "unauthorized"}, 401, origin)

        qs     = event.get("queryStringParameters") or {}
        action = qs.get("action", "list")
        body   = {}
        if event.get("body"):
            try:
                body = json.loads(event["body"])
            except Exception:
                pass

        if action == "list":
            return action_list(conn, origin)

        if action == "get":
            rule_id = qs.get("id") or body.get("id")
            if not rule_id:
                return resp({"error": "id required"}, 400, origin)
            return action_get(conn, int(rule_id), origin)

        if action == "create":
            if method != "POST":
                return resp({"error": "POST required"}, 405, origin)
            return action_create(conn, actor, body, origin)

        if action == "update":
            if method not in ("POST", "PUT"):
                return resp({"error": "POST/PUT required"}, 405, origin)
            return action_update(conn, actor, body, origin)

        if action == "delete":
            if method != "POST":
                return resp({"error": "POST required"}, 405, origin)
            return action_delete(conn, body, origin)

        if action == "toggle":
            if method != "POST":
                return resp({"error": "POST required"}, 405, origin)
            return action_toggle(conn, body, origin)

        if action == "run":
            if method != "POST":
                return resp({"error": "POST required"}, 405, origin)
            return action_run(conn, actor, body, origin)

        if action == "log":
            rule_id = qs.get("id") or body.get("id")
            if not rule_id:
                return resp({"error": "id required"}, 400, origin)
            return action_log(conn, int(rule_id), origin)

        return resp({"error": "unknown action"}, 400, origin)

    finally:
        conn.close()
