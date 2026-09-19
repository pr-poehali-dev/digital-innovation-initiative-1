"""
Поручения и портфель: проекты/мероприятия, задачи, результаты, эффекты,
универсальные связи (exec_link) и сводный дашборд руководителя.

Не дублирует существующие модули:
- поручения (exec_action), риски, проблемы, вехи, решения — уже есть в exec-control;
- инициативы — уже есть в exec-cabinet;
- этот модуль добавляет недостающий уровень (проекты, задачи, результаты, эффекты)
  и связывает всё через гибкую M2M exec_link, а не жёсткую цепочку.

Архивирование вместо физического удаления. История значимых изменений — в
общем exec_audit_log (та же таблица, что использует exec-control/exec-cabinet).
Снимки отчётов (exec_report_snapshot) неизменяемы: UPDATE payload_json запрещён
на уровне этого backend (см. update_snapshot ниже — action отсутствует намеренно).

AI не используется нигде в этом модуле.
"""
import json
import os
import hashlib
import datetime
import psycopg2

DB = os.environ["DATABASE_URL"]
_s = os.environ.get("MAIN_DB_SCHEMA", "").strip()
SCHEMA = _s if _s else "t_p61016064_digital_innovation_i"

# Допустимые типы объектов для exec_link и история изменений.
# Отображение технического kind -> (таблица, поле заголовка) для проверки существования.
LINKABLE = {
    "action": ("exec_action", "title"),
    "initiative": ("exec_initiative", "title"),
    "project": ("exec_project", "title"),
    "task": ("exec_task", "title"),
    "milestone": ("exec_milestone", "title"),
    "result": ("exec_result", "title"),
    "effect": ("exec_effect", "title"),
    "risk": ("exec_risk", "description"),
    "issue": ("exec_issue", "title"),
    "decision": ("exec_decision_instance", "question"),
    "doc_source": ("doc_source", "title"),
    "goal": ("exec_center_goal", "title"),
    "indicator": ("exec_indicator", "title"),
    "center_function": ("exec_center_function", "title"),
}

LINK_TYPE_LABEL = {
    "related": "связано с",
    "implements": "реализует",
    "blocks": "блокирует",
    "depends_on": "зависит от",
    "supports": "подтверждает",
}


def cors(body: dict, code: int = 200) -> dict:
    return {
        "statusCode": code,
        "headers": {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
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


def log_change(cur, actor, entity, eid, action, before=None, after=None, changed_fields=None):
    """История значимых изменений в общем exec_audit_log. Одна учётная запись —
    достаточно фиксировать актора/время/объект/изменённые поля, без полного
    снимка чувствительного текста."""
    payload = {"changed_fields": changed_fields} if changed_fields else after
    cur.execute(
        f"INSERT INTO {SCHEMA}.exec_audit_log (entity_type, entity_id, action, actor, before_json, after_json) "
        f"VALUES (%s,%s,%s,%s,%s,%s)",
        (entity, eid, action, actor,
         json.dumps(before, ensure_ascii=False, default=str) if before else None,
         json.dumps(payload, ensure_ascii=False, default=str) if payload else None),
    )


def diff_fields(existing: dict, new: dict) -> list:
    if not existing:
        return list(new.keys())
    return [k for k, v in new.items() if str(existing.get(k)) != str(v)]


# ---------- ЖУРНАЛ ИЗМЕНЕНИЙ РАСПИСАНИЯ ----------

DATE_FIELD_LAYER = {
    "plan_start": "plan", "plan_end": "plan", "due_at": "plan", "plan_date": "plan",
    "forecast_end": "forecast", "forecast_date": "forecast",
    "fact_start": "fact", "fact_end": "fact", "fact_date": "fact",
}


def log_schedule_change(cur, actor: str, object_kind: str, object_id: int, project_id,
                         existing: dict, new_fields: dict, reason: str = None,
                         related_decision_id: int = None, related_document_id: int = None):
    """Специализированная запись в exec_schedule_change_log для каждого
    изменённого поля даты (план/прогноз/факт) — отдельно от общего
    exec_audit_log. Считает величину сдвига, помечает затронутые
    зависимости и (для проекта) явно фиксирует смещение конечной даты.
    Секреты и длинные комментарии сюда не пишутся — только сжатая причина,
    подробности — по ссылке на решение/документ."""
    if not existing:
        return
    for field, new_val in new_fields.items():
        if field not in DATE_FIELD_LAYER:
            continue
        old_val = existing.get(field)
        if str(old_val) == str(new_val):
            continue
        shift_days = None
        if old_val and new_val:
            try:
                shift_days = (_to_date(new_val) - _to_date(old_val)).days
            except (ValueError, TypeError):
                shift_days = None

        affected = 0
        if object_kind in ("task", "milestone", "stage"):
            cur.execute(f"""
                SELECT count(*) AS c FROM {SCHEMA}.exec_schedule_dependency
                WHERE archived_at IS NULL AND (
                    (src_kind = %s AND src_id = %s) OR (tgt_kind = %s AND tgt_id = %s)
                )
            """, (object_kind, object_id, object_kind, object_id))
            affected = rows(cur)[0]["c"]

        cur.execute(f"""
            INSERT INTO {SCHEMA}.exec_schedule_change_log
                (object_kind, object_id, project_id, layer, field_name, old_value, new_value,
                 shift_days, reason, related_decision_id, related_document_id,
                 affected_dependency_count, actor)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        """, (object_kind, object_id, project_id, DATE_FIELD_LAYER[field], field,
              old_val or None, new_val or None, shift_days, reason,
              related_decision_id, related_document_id, affected, actor))


def fetch_one(cur, table, eid):
    cur.execute(f"SELECT * FROM {SCHEMA}.{table} WHERE id = %s", (eid,))
    r = rows(cur)
    return r[0] if r else None


# ============ ПРОЕКТЫ ============

def list_projects(cur, include_archived=False, include_test_data=False):
    conds = [] if include_archived else ["p.archived_at IS NULL"]
    if not include_test_data:
        conds.append("p.is_test_data = false")
    where = ("WHERE " + " AND ".join(conds)) if conds else ""
    cur.execute(f"""
        SELECT p.*, ei.title AS initiative_title,
            (SELECT count(*) FROM {SCHEMA}.exec_task t WHERE t.project_id = p.id AND t.archived_at IS NULL) AS task_count,
            (SELECT count(*) FROM {SCHEMA}.exec_task t WHERE t.project_id = p.id AND t.archived_at IS NULL
                AND t.status NOT IN ('done','cancelled')
                AND t.due_at IS NOT NULL AND t.due_at < CURRENT_DATE) AS overdue_task_count
        FROM {SCHEMA}.exec_project p
        LEFT JOIN {SCHEMA}.exec_initiative ei ON ei.id = p.initiative_id
        {where}
        ORDER BY p.updated_at DESC
    """)
    return rows(cur)


def get_project(cur, pid):
    p = fetch_one(cur, "exec_project", pid)
    if not p:
        return None
    cur.execute(f"SELECT * FROM {SCHEMA}.exec_project_stage WHERE project_id = %s ORDER BY sort_order, id", (pid,))
    p["stages"] = rows(cur)
    cur.execute(f"SELECT * FROM {SCHEMA}.exec_task WHERE project_id = %s AND archived_at IS NULL ORDER BY (due_at IS NULL), due_at", (pid,))
    p["tasks"] = rows(cur)
    cur.execute(f"SELECT * FROM {SCHEMA}.exec_milestone WHERE project_id = %s ORDER BY plan_date", (pid,))
    p["milestones"] = rows(cur)
    cur.execute(f"SELECT * FROM {SCHEMA}.exec_result WHERE project_id = %s AND archived_at IS NULL ORDER BY updated_at DESC", (pid,))
    p["results"] = rows(cur)
    cur.execute(f"SELECT * FROM {SCHEMA}.exec_risk WHERE project_id = %s ORDER BY probability * impact DESC", (pid,))
    p["risks"] = rows(cur)
    cur.execute(f"SELECT * FROM {SCHEMA}.exec_issue WHERE project_id = %s ORDER BY updated_at DESC", (pid,))
    p["issues"] = rows(cur)
    p["links"] = list_links(cur, "project", pid)
    return p


PROJECT_FIELDS = ["title", "project_kind", "description", "goal", "customer_person_id",
    "result_owner_person_id", "manager_person_id", "coordinator_person_id",
    "initiative_id", "status", "priority", "progress_pct",
    "plan_start", "plan_end", "fact_start", "fact_end", "forecast_end"]


def save_project(cur, body: dict, actor: str):
    pid = as_int(body.get("id"))
    fields = {k: (as_int(body[k]) if k.endswith("_id") else (body[k] or None if k in
              ("plan_start", "plan_end", "fact_start", "fact_end", "forecast_end") else body.get(k)))
              for k in PROJECT_FIELDS if k in body}
    if "progress_pct" in fields:
        fields["progress_pct"] = as_int(fields["progress_pct"]) or 0
    existing = fetch_one(cur, "exec_project", pid) if pid else None

    if pid:
        sets = ", ".join(f"{k} = %s" for k in fields)
        cur.execute(
            f"UPDATE {SCHEMA}.exec_project SET {sets}, updated_at = now() WHERE id = %s RETURNING id",
            (*fields.values(), pid),
        )
        changed = diff_fields(existing, fields)
        new_id = cur.fetchone()[0]
        log_change(cur, actor, "project", new_id, "update", changed_fields=changed)
        log_schedule_change(cur, actor, "project", new_id, new_id, existing, fields,
                             reason=body.get("reschedule_reason"),
                             related_decision_id=as_int(body.get("related_decision_id")),
                             related_document_id=as_int(body.get("related_document_id")))
    else:
        fields.setdefault("status", "idea")
        fields.setdefault("priority", "normal")
        fields.setdefault("progress_pct", 0)
        cols = ", ".join(fields.keys())
        ph = ", ".join(["%s"] * len(fields))
        cur.execute(
            f"INSERT INTO {SCHEMA}.exec_project ({cols}, created_by) VALUES ({ph}, %s) RETURNING id",
            (*fields.values(), actor),
        )
        new_id = cur.fetchone()[0]
        log_change(cur, actor, "project", new_id, "create", after=fields)
    return new_id


def archive_project(cur, pid, actor):
    cur.execute(
        f"UPDATE {SCHEMA}.exec_project SET archived_at = now(), archived_by = %s WHERE id = %s AND archived_at IS NULL RETURNING id",
        (actor, pid),
    )
    r = cur.fetchone()
    if r:
        log_change(cur, actor, "project", pid, "archive")
    return r[0] if r else None


# ============ ЗАДАЧИ ============

def list_tasks(cur, project_id=None, include_archived=False, include_test_data=False):
    conds = [] if include_archived else ["t.archived_at IS NULL"]
    if not include_test_data:
        conds.append("t.is_test_data = false")
    params = []
    if project_id:
        conds.append("t.project_id = %s")
        params.append(project_id)
    where = ("WHERE " + " AND ".join(conds)) if conds else ""
    cur.execute(f"""
        SELECT t.*, p.title AS project_title, pr.email AS responsible_email,
            (t.due_at IS NOT NULL AND t.due_at < CURRENT_DATE
                AND t.status NOT IN ('done','cancelled')) AS is_overdue
        FROM {SCHEMA}.exec_task t
        LEFT JOIN {SCHEMA}.exec_project p ON p.id = t.project_id
        LEFT JOIN {SCHEMA}.exec_person pr ON pr.id = t.responsible_person_id
        {where}
        ORDER BY (t.due_at IS NULL), t.due_at, t.priority DESC
    """, params)
    return rows(cur)


TASK_FIELDS = ["title", "description", "project_id", "stage_id", "milestone_id", "action_id",
    "responsible_person_id", "due_at", "priority", "status", "progress_pct",
    "expected_result", "actual_result", "delay_reason", "blocker", "fact_date",
    "result_confirmed_by_person_id", "forecast_date"]


def save_task(cur, body: dict, actor: str):
    tid = as_int(body.get("id"))
    fields = {}
    for k in TASK_FIELDS:
        if k not in body:
            continue
        if k in ("project_id", "stage_id", "milestone_id", "action_id",
                  "responsible_person_id", "result_confirmed_by_person_id"):
            fields[k] = as_int(body[k])
        elif k in ("due_at", "fact_date", "forecast_date"):
            fields[k] = body[k] or None
        elif k == "progress_pct":
            fields[k] = as_int(body[k]) or 0
        else:
            fields[k] = body.get(k)

    existing = fetch_one(cur, "exec_task", tid) if tid else None

    if tid:
        sets = ", ".join(f"{k} = %s" for k in fields)
        cur.execute(
            f"UPDATE {SCHEMA}.exec_task SET {sets}, updated_at = now() WHERE id = %s RETURNING id",
            (*fields.values(), tid),
        )
        new_id = cur.fetchone()[0]
        log_change(cur, actor, "task", new_id, "update", changed_fields=diff_fields(existing, fields))
        proj_id = fields.get("project_id", existing.get("project_id") if existing else None)
        log_schedule_change(cur, actor, "task", new_id, proj_id, existing, fields,
                             reason=body.get("reschedule_reason"),
                             related_decision_id=as_int(body.get("related_decision_id")),
                             related_document_id=as_int(body.get("related_document_id")))
    else:
        fields.setdefault("status", "not_started")
        fields.setdefault("priority", "normal")
        fields.setdefault("progress_pct", 0)
        cols = ", ".join(fields.keys())
        ph = ", ".join(["%s"] * len(fields))
        cur.execute(
            f"INSERT INTO {SCHEMA}.exec_task ({cols}, created_by) VALUES ({ph}, %s) RETURNING id",
            (*fields.values(), actor),
        )
        new_id = cur.fetchone()[0]
        log_change(cur, actor, "task", new_id, "create", after=fields)
    return new_id


def archive_task(cur, tid, actor):
    cur.execute(
        f"UPDATE {SCHEMA}.exec_task SET archived_at = now(), archived_by = %s WHERE id = %s AND archived_at IS NULL RETURNING id",
        (actor, tid),
    )
    r = cur.fetchone()
    if r:
        log_change(cur, actor, "task", tid, "archive")
    return r[0] if r else None


STAGE_FIELDS = ["project_id", "title", "sort_order", "status",
    "plan_start", "plan_end", "forecast_end", "fact_start", "fact_end"]


def save_stage(cur, body: dict, actor: str):
    """Штатное сохранение этапа проекта — раньше этапы создавались только
    вручную через миграции, из-за чего слой прогноза этапа фактически был
    доступен только на чтение. save_project/save_task уже поддерживали
    forecast_*, эта функция закрывает тот же путь для exec_project_stage."""
    sid = as_int(body.get("id"))
    fields = {}
    for k in STAGE_FIELDS:
        if k not in body:
            continue
        if k == "project_id":
            fields[k] = as_int(body[k])
        elif k == "sort_order":
            fields[k] = as_int(body[k]) or 100
        elif k in ("plan_start", "plan_end", "forecast_end", "fact_start", "fact_end"):
            fields[k] = body[k] or None
        else:
            fields[k] = body.get(k)

    existing = fetch_one(cur, "exec_project_stage", sid) if sid else None

    if sid:
        if not fields:
            return sid, None
        sets = ", ".join(f"{k} = %s" for k in fields)
        cur.execute(
            f"UPDATE {SCHEMA}.exec_project_stage SET {sets}, updated_at = now() WHERE id = %s RETURNING id",
            (*fields.values(), sid),
        )
        r = cur.fetchone()
        if not r:
            return None, "Этап не найден"
        new_id = r[0]
        log_change(cur, actor, "stage", new_id, "update", changed_fields=diff_fields(existing, fields))
        proj_id = fields.get("project_id", existing.get("project_id") if existing else None)
        log_schedule_change(cur, actor, "stage", new_id, proj_id, existing, fields,
                             reason=body.get("reschedule_reason"),
                             related_decision_id=as_int(body.get("related_decision_id")),
                             related_document_id=as_int(body.get("related_document_id")))
    else:
        if not fields.get("project_id") or not fields.get("title"):
            return None, "Не указан проект или название этапа"
        fields.setdefault("status", "not_started")
        fields.setdefault("sort_order", 100)
        cols = ", ".join(fields.keys())
        ph = ", ".join(["%s"] * len(fields))
        cur.execute(
            f"INSERT INTO {SCHEMA}.exec_project_stage ({cols}) VALUES ({ph}) RETURNING id",
            tuple(fields.values()),
        )
        new_id = cur.fetchone()[0]
        log_change(cur, actor, "stage", new_id, "create", after=fields)
    return new_id, None


# ============ РЕЗУЛЬТАТЫ И ЭФФЕКТЫ ============

def list_results(cur, project_id=None, include_archived=False, include_test_data=False):
    conds = [] if include_archived else ["r.archived_at IS NULL"]
    if not include_test_data:
        conds.append("r.is_test_data = false")
    params = []
    if project_id:
        conds.append("r.project_id = %s")
        params.append(project_id)
    where = ("WHERE " + " AND ".join(conds)) if conds else ""
    cur.execute(f"""
        SELECT r.*, p.title AS project_title,
            (SELECT count(*) FROM {SCHEMA}.exec_effect e WHERE e.result_id = r.id AND e.archived_at IS NULL) AS effect_count
        FROM {SCHEMA}.exec_result r
        LEFT JOIN {SCHEMA}.exec_project p ON p.id = r.project_id
        {where}
        ORDER BY r.updated_at DESC
    """, params)
    return rows(cur)


RESULT_FIELDS = ["title", "result_kind", "description", "project_id", "initiative_id",
    "owner_person_id", "achieved_at", "document_source_id"]


def save_result(cur, body: dict, actor: str):
    rid = as_int(body.get("id"))
    fields = {}
    for k in RESULT_FIELDS:
        if k not in body:
            continue
        if k in ("project_id", "initiative_id", "owner_person_id", "document_source_id"):
            fields[k] = as_int(body[k])
        elif k == "achieved_at":
            fields[k] = body[k] or None
        else:
            fields[k] = body.get(k)

    existing = fetch_one(cur, "exec_result", rid) if rid else None
    if rid:
        sets = ", ".join(f"{k} = %s" for k in fields)
        cur.execute(
            f"UPDATE {SCHEMA}.exec_result SET {sets}, updated_at = now() WHERE id = %s RETURNING id",
            (*fields.values(), rid),
        )
        new_id = cur.fetchone()[0]
        log_change(cur, actor, "result", new_id, "update", changed_fields=diff_fields(existing, fields))
    else:
        fields.setdefault("result_kind", "other")
        cols = ", ".join(fields.keys())
        ph = ", ".join(["%s"] * len(fields))
        cur.execute(
            f"INSERT INTO {SCHEMA}.exec_result ({cols}, created_by) VALUES ({ph}, %s) RETURNING id",
            (*fields.values(), actor),
        )
        new_id = cur.fetchone()[0]
        log_change(cur, actor, "result", new_id, "create", after=fields)
    return new_id


def archive_result(cur, rid, actor):
    cur.execute(
        f"UPDATE {SCHEMA}.exec_result SET archived_at = now() WHERE id = %s AND archived_at IS NULL RETURNING id",
        (rid,),
    )
    r = cur.fetchone()
    if r:
        log_change(cur, actor, "result", rid, "archive")
    return r[0] if r else None


def list_effects(cur, result_id=None, include_archived=False, include_test_data=False):
    conds = [] if include_archived else ["e.archived_at IS NULL"]
    if not include_test_data:
        conds.append("e.is_test_data = false")
    params = []
    if result_id:
        conds.append("e.result_id = %s")
        params.append(result_id)
    where = ("WHERE " + " AND ".join(conds)) if conds else ""
    cur.execute(f"""
        SELECT e.*, r.title AS result_title
        FROM {SCHEMA}.exec_effect e
        LEFT JOIN {SCHEMA}.exec_result r ON r.id = e.result_id
        {where}
        ORDER BY e.updated_at DESC
    """, params)
    return rows(cur)


EFFECT_FIELDS = ["title", "result_id", "project_id", "initiative_id", "metric", "unit",
    "baseline_value", "plan_value", "actual_value", "measured_at", "calculation_method",
    "data_source", "owner_person_id", "confirmed_by_person_id", "confirmation_status"]


def save_effect(cur, body: dict, actor: str):
    eid = as_int(body.get("id"))
    fields = {}
    for k in EFFECT_FIELDS:
        if k not in body:
            continue
        if k in ("result_id", "project_id", "initiative_id", "owner_person_id", "confirmed_by_person_id"):
            fields[k] = as_int(body[k])
        elif k == "measured_at":
            fields[k] = body[k] or None
        else:
            fields[k] = body.get(k)

    # Не рассчитывать факт автоматически, если методика не задана.
    if fields.get("actual_value") and not fields.get("calculation_method") and not (
        fetch_one(cur, "exec_effect", eid) or {}
    ).get("calculation_method"):
        return None, "Укажите методику расчёта перед фиксацией фактического значения эффекта"

    existing = fetch_one(cur, "exec_effect", eid) if eid else None
    if eid:
        sets = ", ".join(f"{k} = %s" for k in fields)
        cur.execute(
            f"UPDATE {SCHEMA}.exec_effect SET {sets}, updated_at = now() WHERE id = %s RETURNING id",
            (*fields.values(), eid),
        )
        new_id = cur.fetchone()[0]
        log_change(cur, actor, "effect", new_id, "update", changed_fields=diff_fields(existing, fields))
    else:
        fields.setdefault("confirmation_status", "not_confirmed")
        cols = ", ".join(fields.keys())
        ph = ", ".join(["%s"] * len(fields))
        cur.execute(
            f"INSERT INTO {SCHEMA}.exec_effect ({cols}, created_by) VALUES ({ph}, %s) RETURNING id",
            (*fields.values(), actor),
        )
        new_id = cur.fetchone()[0]
        log_change(cur, actor, "effect", new_id, "create", after=fields)
    return new_id, None


def archive_effect(cur, eid, actor):
    cur.execute(
        f"UPDATE {SCHEMA}.exec_effect SET archived_at = now() WHERE id = %s AND archived_at IS NULL RETURNING id",
        (eid,),
    )
    r = cur.fetchone()
    if r:
        log_change(cur, actor, "effect", eid, "archive")
    return r[0] if r else None


# ============ УНИВЕРСАЛЬНЫЕ СВЯЗИ (с серверной валидацией) ============

def save_link(cur, body: dict, actor: str):
    link_type = body.get("link_type", "related")
    src_kind, src_id = body.get("src_kind"), as_int(body.get("src_id"))
    tgt_kind, tgt_id = body.get("tgt_kind"), as_int(body.get("tgt_id"))

    if src_kind not in LINKABLE or tgt_kind not in LINKABLE:
        return None, "Недопустимый тип объекта для связи"
    if not src_id or not tgt_id:
        return None, "Не указан один из объектов связи"
    if src_kind == tgt_kind and src_id == tgt_id:
        return None, "Нельзя связать объект с самим собой"

    src_table, _ = LINKABLE[src_kind]
    tgt_table, _ = LINKABLE[tgt_kind]
    if not fetch_one(cur, src_table, src_id):
        return None, f"Исходный объект ({src_kind} #{src_id}) не найден"
    if not fetch_one(cur, tgt_table, tgt_id):
        return None, f"Целевой объект ({tgt_kind} #{tgt_id}) не найден"

    cur.execute(f"""
        SELECT id FROM {SCHEMA}.exec_link
        WHERE link_type = %s AND src_kind = %s AND src_id = %s
          AND tgt_kind = %s AND tgt_id = %s AND archived_at IS NULL
    """, (link_type, src_kind, src_id, tgt_kind, tgt_id))
    if cur.fetchone():
        return None, "Такая связь уже существует"

    cur.execute(
        f"""INSERT INTO {SCHEMA}.exec_link (link_type, src_kind, src_id, tgt_kind, tgt_id, note, created_by)
            VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id""",
        (link_type, src_kind, src_id, tgt_kind, tgt_id, body.get("note"), actor),
    )
    lid = cur.fetchone()[0]
    log_change(cur, actor, "link", lid, "create", after={"link_type": link_type,
               "src": f"{src_kind}#{src_id}", "tgt": f"{tgt_kind}#{tgt_id}"})
    return lid, None


def archive_link(cur, lid, actor):
    cur.execute(
        f"UPDATE {SCHEMA}.exec_link SET archived_at = now() WHERE id = %s AND archived_at IS NULL RETURNING id",
        (lid,),
    )
    r = cur.fetchone()
    if r:
        log_change(cur, actor, "link", lid, "archive")
    return r[0] if r else None


def list_links(cur, kind: str, oid: int):
    cur.execute(f"""
        SELECT * FROM {SCHEMA}.exec_link
        WHERE ((src_kind = %s AND src_id = %s) OR (tgt_kind = %s AND tgt_id = %s))
          AND archived_at IS NULL
        ORDER BY created_at DESC
    """, (kind, oid, kind, oid))
    links = rows(cur)
    # Дополняем человекочитаемым заголовком противоположного объекта
    for l in links:
        other_kind = l["tgt_kind"] if l["src_kind"] == kind and l["src_id"] == oid else l["src_kind"]
        other_id = l["tgt_id"] if l["src_kind"] == kind and l["src_id"] == oid else l["src_id"]
        table, title_field = LINKABLE.get(other_kind, (None, None))
        l["other_kind"] = other_kind
        l["other_id"] = other_id
        l["link_type_label"] = LINK_TYPE_LABEL.get(l["link_type"], l["link_type"])
        if table:
            obj = fetch_one(cur, table, other_id)
            l["other_title"] = obj.get(title_field) if obj else None
        else:
            l["other_title"] = None
    return links


# ============ ИСТОРИЯ ИЗМЕНЕНИЙ ============

def object_history(cur, kind: str, oid: int):
    cur.execute(f"""
        SELECT id, entity_type, entity_id, action, actor, after_json, created_at
        FROM {SCHEMA}.exec_audit_log
        WHERE entity_type = %s AND entity_id = %s
        ORDER BY created_at DESC LIMIT 100
    """, (kind, oid))
    return rows(cur)


# ============ ДАШБОРД ============

def dashboard(cur):
    cur.execute(f"""
        SELECT a.id, a.title, a.status, a.priority, a.due_at, a.is_on_control,
               a.initiative_id, i.title AS initiative_title, i.external_code AS initiative_code
        FROM {SCHEMA}.exec_action a
        LEFT JOIN {SCHEMA}.exec_initiative i ON i.id = a.initiative_id
        WHERE COALESCE(a.is_test_data, false) = false
          AND a.status NOT IN ('done_by_executor','accepted_by_head','cancelled','done')
          AND a.due_at IS NOT NULL AND a.due_at < CURRENT_DATE
        ORDER BY a.due_at
    """)
    overdue_actions = rows(cur)

    cur.execute(f"""
        SELECT a.id, a.title, a.status, a.priority, a.due_at,
               a.initiative_id, i.title AS initiative_title, i.external_code AS initiative_code
        FROM {SCHEMA}.exec_action a
        LEFT JOIN {SCHEMA}.exec_initiative i ON i.id = a.initiative_id
        WHERE COALESCE(a.is_test_data, false) = false
          AND a.status NOT IN ('done_by_executor','accepted_by_head','cancelled','done')
          AND a.due_at IS NOT NULL AND a.due_at BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
        ORDER BY a.due_at
    """)
    upcoming_actions = rows(cur)

    cur.execute(f"""
        SELECT t.id, t.title, t.status, t.priority, t.project_id, t.due_at,
            (t.due_at IS NOT NULL AND t.due_at < CURRENT_DATE) AS is_overdue,
            p.initiative_id, ii.title AS initiative_title, ii.external_code AS initiative_code
        FROM {SCHEMA}.exec_task t
        LEFT JOIN {SCHEMA}.exec_project p ON p.id = t.project_id
        LEFT JOIN {SCHEMA}.exec_initiative ii ON ii.id = p.initiative_id
        WHERE t.archived_at IS NULL AND t.is_test_data = false AND t.status NOT IN ('done','cancelled')
          AND t.due_at IS NOT NULL AND t.due_at < CURRENT_DATE
          AND (t.project_id IS NULL OR (p.archived_at IS NULL AND p.is_test_data = false))
        ORDER BY t.due_at
    """)
    overdue_tasks = rows(cur)

    cur.execute(f"""
        SELECT m.id, m.title, m.plan_date, m.status, m.initiative_id, m.project_id,
               COALESCE(i.title, ip.title) AS initiative_title,
               COALESCE(i.external_code, ip.external_code) AS initiative_code
        FROM {SCHEMA}.exec_milestone m
        LEFT JOIN {SCHEMA}.exec_project p ON p.id = m.project_id
        LEFT JOIN {SCHEMA}.exec_initiative i ON i.id = m.initiative_id
        LEFT JOIN {SCHEMA}.exec_initiative ip ON ip.id = p.initiative_id
        WHERE COALESCE(m.is_test_data, false) = false AND m.status NOT IN ('achieved','cancelled')
          AND COALESCE(m.is_conditional_scenario, false) = false
          AND m.plan_date IS NOT NULL AND m.plan_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
          AND (m.project_id IS NULL OR (p.archived_at IS NULL AND p.is_test_data = false))
          AND (m.initiative_id IS NULL OR COALESCE(i.is_test_data, false) = false)
        ORDER BY m.plan_date
    """)
    upcoming_milestones = rows(cur)

    cur.execute(f"""
        SELECT status, count(*) AS cnt FROM {SCHEMA}.exec_project
        WHERE archived_at IS NULL AND is_test_data = false GROUP BY status
    """)
    projects_by_status = rows(cur)

    cur.execute(f"""
        SELECT d.id, d.question, d.status, d.due_at,
               d.initiative_id, i.title AS initiative_title, i.external_code AS initiative_code
        FROM {SCHEMA}.exec_decision_instance d
        LEFT JOIN {SCHEMA}.exec_initiative i ON i.id = d.initiative_id
        WHERE d.status IN ('raised','in_progress') ORDER BY d.due_at NULLS LAST LIMIT 20
    """)
    pending_decisions = rows(cur)

    cur.execute(f"""
        SELECT r.id, r.description, r.probability, r.impact, r.probability * r.impact AS risk_score, r.status,
               r.initiative_id, i.title AS initiative_title, i.external_code AS initiative_code
        FROM {SCHEMA}.exec_risk r
        LEFT JOIN {SCHEMA}.exec_initiative i ON i.id = r.initiative_id
        WHERE r.status = 'active' ORDER BY r.probability * r.impact DESC LIMIT 10
    """)
    top_risks = rows(cur)

    cur.execute(f"""
        SELECT id, title, achieved_at, result_kind FROM {SCHEMA}.exec_result
        WHERE archived_at IS NULL AND is_test_data = false
        ORDER BY achieved_at DESC NULLS LAST, updated_at DESC LIMIT 10
    """)
    recent_results = rows(cur)

    return {
        "overdue_actions": overdue_actions,
        "upcoming_actions": upcoming_actions,
        "overdue_tasks": overdue_tasks,
        "upcoming_milestones": upcoming_milestones,
        "projects_by_status": projects_by_status,
        "pending_decisions": pending_decisions,
        "top_risks": top_risks,
        "recent_results": recent_results,
    }


def create_snapshot(cur, body: dict, actor: str):
    """Неизменяемый снимок отчёта. У этого backend НЕТ action для редактирования
    или удаления существующего снимка — только создание новой версии.

    ВАЖНО (честная граница гарантии): неизменяемость обеспечивается ТОЛЬКО при
    работе через этот backend. Полноценный BEFORE UPDATE триггер на уровне БД
    недоступен в этой среде (CREATE FUNCTION запрещён платформой). Пользователь
    или сервис с прямым правом UPDATE в БД технически может изменить снимок.
    Чтобы такое изменение было обнаружимо, при создании считается SHA-256 от
    payload_json и сохраняется отдельно; get_snapshot всегда пересчитывает хеш
    и сравнивает с сохранённым — расхождение возвращается явным полем
    integrity_ok=false, а не тихо."""
    payload = dashboard(cur)
    payload_str = json.dumps(payload, ensure_ascii=False, default=str)
    payload_hash = hashlib.sha256(payload_str.encode("utf-8")).hexdigest()
    cur.execute(
        f"""INSERT INTO {SCHEMA}.exec_report_snapshot
            (title, report_kind, period_from, period_to, payload_json, payload_sha256, created_by, is_test_data)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s) RETURNING id, created_at""",
        (body.get("title", "Справка руководителю"), body.get("report_kind", "portfolio_summary"),
         body.get("period_from") or None, body.get("period_to") or None,
         payload_str, payload_hash, actor, bool(body.get("is_test_data"))),
    )
    row = cur.fetchone()
    log_change(cur, actor, "snapshot", row[0], "create", after={"payload_sha256": payload_hash})
    return {"id": row[0], "created_at": row[1], "payload_sha256": payload_hash}


def list_snapshots(cur, include_test_data=False):
    where = "" if include_test_data else "WHERE is_test_data = false"
    cur.execute(f"""
        SELECT id, title, report_kind, period_from, period_to, created_by, created_at, is_test_data
        FROM {SCHEMA}.exec_report_snapshot {where} ORDER BY created_at DESC LIMIT 50
    """)
    return rows(cur)


def get_snapshot(cur, sid: int):
    cur.execute(f"SELECT * FROM {SCHEMA}.exec_report_snapshot WHERE id = %s", (sid,))
    r = rows(cur)
    if not r:
        return None
    item = r[0]
    payload_str = item.pop("payload_json")
    stored_hash = item.get("payload_sha256")
    actual_hash = hashlib.sha256(payload_str.encode("utf-8")).hexdigest()
    item["payload"] = json.loads(payload_str)
    item["integrity_ok"] = (stored_hash is None) or (stored_hash == actual_hash)
    return item


# ============================================================
# ДОРОЖНАЯ КАРТА И ШКАЛА ВЕХ (Фаза 1) + ЗАВИСИМОСТИ И BASELINE (Фаза 3)
#
# Roadmap читает существующие exec_project/exec_project_stage/exec_milestone
# с серверной фильтрацией по диапазону дат — не отдаёт весь портфель разом.
# Зависимости и baseline — новые служебные таблицы exec_schedule_dependency/
# exec_schedule_baseline, без дублирования уже существующих plan_*/fact_*
# полей на проектах/задачах/вехах.
# ============================================================

DEPENDENCY_KINDS = ("task", "milestone", "project", "stage")
DEPENDENCY_KIND_TABLE = {
    "task": "exec_task", "milestone": "exec_milestone",
    "project": "exec_project", "stage": "exec_project_stage",
}
DEPENDENCY_TYPES = ("FS", "SS", "FF", "SF")


def roadmap_data(cur, date_from, date_to, filters: dict):
    """Дорожная карта портфеля: инициативы → проекты, с этапами и вехами
    внутри. Диапазон дат обязателен для ограничения объёма — на масштабе
    «год» вехи агрегируются по месяцам на фронте, а не здесь (сырые даты
    отдаются, агрегация — вопрос отрисовки)."""
    conds = ["p.archived_at IS NULL", "p.is_test_data = false"]
    params = []

    # Проект попадает в диапазон, если его период пересекается с [date_from, date_to]
    if date_from and date_to:
        conds.append("(p.plan_start IS NULL OR p.plan_start <= %s) AND (p.plan_end IS NULL OR p.plan_end >= %s)")
        params += [date_to, date_from]

    if filters.get("initiative_id"):
        conds.append("p.initiative_id = %s")
        params.append(filters["initiative_id"])
    if filters.get("project_kind"):
        conds.append("p.project_kind = %s")
        params.append(filters["project_kind"])
    if filters.get("status"):
        conds.append("p.status = %s")
        params.append(filters["status"])
    if filters.get("priority"):
        conds.append("p.priority = %s")
        params.append(filters["priority"])
    if filters.get("owner_person_id"):
        conds.append("(p.manager_person_id = %s OR p.result_owner_person_id = %s)")
        params += [filters["owner_person_id"], filters["owner_person_id"]]
    if filters.get("overdue_only"):
        conds.append("p.plan_end IS NOT NULL AND p.plan_end < CURRENT_DATE AND p.status NOT IN ('completed','cancelled')")

    where = "WHERE " + " AND ".join(conds)
    cur.execute(f"""
        SELECT p.id, p.title, p.project_kind, p.status, p.priority, p.progress_pct,
               p.initiative_id, ei.title AS initiative_title,
               p.plan_start, p.plan_end, p.fact_start, p.fact_end, p.forecast_end,
               p.manager_person_id, mp.display_name AS manager_name,
               (p.plan_end IS NOT NULL AND p.plan_end < CURRENT_DATE
                   AND p.status NOT IN ('completed','cancelled')) AS is_overdue,
               (SELECT count(*) FROM {SCHEMA}.exec_risk r
                 WHERE r.project_id = p.id AND r.status = 'active' AND r.probability * r.impact >= 15) AS critical_risk_count,
               (SELECT count(*) FROM {SCHEMA}.exec_issue i
                 WHERE i.project_id = p.id AND i.status IN ('open','in_progress')) AS open_issue_count,
               (SELECT count(*) FROM {SCHEMA}.exec_resource_requirement rr
                 WHERE rr.project_id = p.id AND rr.status NOT IN ('closed','cancelled')) AS resource_gap_count
        FROM {SCHEMA}.exec_project p
        LEFT JOIN {SCHEMA}.exec_initiative ei ON ei.id = p.initiative_id
        LEFT JOIN {SCHEMA}.exec_person mp ON mp.id = p.manager_person_id
        {where}
        ORDER BY ei.title NULLS LAST, p.plan_start NULLS LAST
    """, params)
    projects = rows(cur)
    if not projects:
        return {"initiatives": [], "projects": []}

    project_ids = [p["id"] for p in projects]
    cur.execute(f"""
        SELECT * FROM {SCHEMA}.exec_project_stage WHERE project_id = ANY(%s) ORDER BY project_id, sort_order, id
    """, (project_ids,))
    stages_by_project: dict = {}
    for s in rows(cur):
        stages_by_project.setdefault(s["project_id"], []).append(s)

    cur.execute(f"""
        SELECT id, title, project_id, initiative_id, plan_date_original, plan_date, fact_date,
               status, milestone_type, responsible_person_id, reschedule_count
        FROM {SCHEMA}.exec_milestone
        WHERE project_id = ANY(%s) AND is_test_data = false
        ORDER BY project_id, plan_date
    """, (project_ids,))
    milestones_by_project: dict = {}
    for m in rows(cur):
        milestones_by_project.setdefault(m["project_id"], []).append(m)

    cur.execute(f"""
        SELECT id, project_id, due_at FROM {SCHEMA}.exec_task
        WHERE project_id = ANY(%s) AND archived_at IS NULL
    """, (project_ids,))
    cur_tasks_by_project: dict = {}
    for t in rows(cur):
        cur_tasks_by_project.setdefault(t["project_id"], []).append(t)

    # Прогнозируемый перерасход: активная версия бюджета проекта, у которой
    # план по строкам меньше уже свершившегося факта.
    cur.execute(f"""
        SELECT p.id FROM {SCHEMA}.exec_project p
        WHERE p.id = ANY(%s) AND p.archived_at IS NULL
          AND EXISTS (
            SELECT 1 FROM {SCHEMA}.exec_budget_version v
            WHERE v.project_id = p.id AND v.is_active = true
              AND (SELECT COALESCE(SUM(l.amount_plan),0) FROM {SCHEMA}.exec_budget_line l WHERE l.version_id = v.id)
                  < (SELECT COALESCE(SUM(a.amount),0) FROM {SCHEMA}.exec_financial_actual a WHERE a.project_id = p.id)
          )
    """, (project_ids,))
    budget_overrun_ids = {r["id"] for r in rows(cur)}

    # Межпроектная зависимость: строим карту "kind:id -> project_id" для
    # задач/вех/проектов этого списка, затем одним проходом по активным
    # зависимостям находим пары, где оба конца разрешились в РАЗНЫЕ проекты.
    cur.execute(f"""
        SELECT 'task' AS kind, id, project_id FROM {SCHEMA}.exec_task WHERE project_id = ANY(%(pids)s)
        UNION ALL
        SELECT 'milestone' AS kind, id, project_id FROM {SCHEMA}.exec_milestone WHERE project_id = ANY(%(pids)s)
        UNION ALL
        SELECT 'project' AS kind, id, id AS project_id FROM {SCHEMA}.exec_project WHERE id = ANY(%(pids)s)
    """, {"pids": project_ids})
    owner_of = {(r["kind"], r["id"]): r["project_id"] for r in rows(cur)}

    cur.execute(f"""
        SELECT src_kind, src_id, tgt_kind, tgt_id FROM {SCHEMA}.exec_schedule_dependency
        WHERE archived_at IS NULL AND (
            (src_kind = ANY(ARRAY['task','milestone','project']) AND src_id = ANY(
                SELECT id FROM {SCHEMA}.exec_task WHERE project_id = ANY(%(pids)s)
                UNION SELECT id FROM {SCHEMA}.exec_milestone WHERE project_id = ANY(%(pids)s)
                UNION SELECT id FROM {SCHEMA}.exec_project WHERE id = ANY(%(pids)s)
            ))
            OR (tgt_kind = ANY(ARRAY['task','milestone','project']) AND tgt_id = ANY(
                SELECT id FROM {SCHEMA}.exec_task WHERE project_id = ANY(%(pids)s)
                UNION SELECT id FROM {SCHEMA}.exec_milestone WHERE project_id = ANY(%(pids)s)
                UNION SELECT id FROM {SCHEMA}.exec_project WHERE id = ANY(%(pids)s)
            ))
        )
    """, {"pids": project_ids})
    cross_dependency_ids = set()
    for e in rows(cur):
        src_pid = owner_of.get((e["src_kind"], e["src_id"]))
        tgt_pid = owner_of.get((e["tgt_kind"], e["tgt_id"]))
        if src_pid and tgt_pid and src_pid != tgt_pid:
            cross_dependency_ids.add(src_pid)
            cross_dependency_ids.add(tgt_pid)
        elif src_pid and not tgt_pid:
            cross_dependency_ids.add(src_pid)
        elif tgt_pid and not src_pid:
            cross_dependency_ids.add(tgt_pid)

    # Baseline-сводка: для каждого проекта — действующая версия (если есть)
    # и лёгкое сравнение дат объектов (без полного пересчёта CPM на весь
    # портфель — это дорого; критический путь конкретного проекта считается
    # отдельно через critical_path/schedule_comparison по требованию).
    cur.execute(f"""
        SELECT id, scope_id, version_number, payload_json, payload_sha256, created_at
        FROM {SCHEMA}.exec_schedule_baseline
        WHERE scope_kind = 'project' AND scope_id = ANY(%s) AND is_active = true
    """, (project_ids,))
    baseline_rows = rows(cur)
    baseline_by_project = {}
    for b in baseline_rows:
        payload_str = b.pop("payload_json")
        actual_hash = hashlib.sha256(payload_str.encode("utf-8")).hexdigest()
        b["integrity_ok"] = b["payload_sha256"] == actual_hash
        b["payload"] = json.loads(payload_str) if b["integrity_ok"] else None
        baseline_by_project[b["scope_id"]] = b

    for p in projects:
        p["stages"] = stages_by_project.get(p["id"], [])
        p["milestones"] = milestones_by_project.get(p["id"], [])
        p["is_overbudget"] = p["id"] in budget_overrun_ids
        p["has_cross_project_dependency"] = p["id"] in cross_dependency_ids

        b = baseline_by_project.get(p["id"])
        deviation = {
            "has_baseline": b is not None,
            "baseline_version": b["version_number"] if b else None,
            "baseline_integrity_ok": b["integrity_ok"] if b else None,
            "has_forecast": bool(p.get("forecast_end")),
            "has_fact_data": bool(p.get("fact_start") or p.get("fact_end")),
            "baseline_start": None, "baseline_end": None,
            "deviation_start_days": None, "deviation_end_days": None,
            "shifted_tasks_count": 0, "shifted_milestones_count": 0,
        }
        if b and b["integrity_ok"] and b["payload"]:
            bp = b["payload"].get("project", {})
            deviation["baseline_start"] = bp.get("plan_start")
            deviation["baseline_end"] = bp.get("plan_end")
            deviation["deviation_start_days"] = _diff_days(bp.get("plan_start"), p["fact_start"] or p["plan_start"])
            deviation["deviation_end_days"] = _diff_days(bp.get("plan_end"), p["fact_end"] or p.get("forecast_end") or p["plan_end"])
            b_tasks = {t["id"]: t.get("due_at") for t in b["payload"].get("tasks", [])}
            b_milestones = {m["id"]: m.get("plan_date") for m in b["payload"].get("milestones", [])}
            for t in cur_tasks_by_project.get(p["id"], []):
                bd = b_tasks.get(t["id"])
                if bd and str(bd) != str(t.get("due_at")):
                    deviation["shifted_tasks_count"] += 1
            for m in milestones_by_project.get(p["id"], []):
                bd = b_milestones.get(m["id"])
                if bd and str(bd) != str(m.get("plan_date")):
                    deviation["shifted_milestones_count"] += 1
        p["baseline_deviation"] = deviation

    # "Изменился критический путь" — единственный признак, требующий
    # полного CPM, поэтому считается ЛЕНИВО: только когда фильтр реально
    # запрошен, и только для проектов с целым baseline (без него сравнивать
    # не с чем). Переиспользует то же ядро _cpm_compute, что и карточка
    # проекта/schedule_comparison — не отдельная реализация.
    if filters.get("critical_path_changed_only"):
        for p in projects:
            b = baseline_by_project.get(p["id"])
            p["critical_path_changed"] = False
            if not (b and b["integrity_ok"] and b["payload"]):
                continue
            g = _build_schedule_graph(cur, p["id"])
            current_nodes, _ = _cpm_nodes_from_current(g)
            current_cpm, _, current_cycle, _ = _cpm_compute(current_nodes, g["edges"])
            current_critical = {(n["kind"], n["id"]) for n in current_cpm if n["is_critical"]} if not current_cycle else set()

            bp = b["payload"]
            b_nodes = {}
            for s in bp.get("stages", []):
                ps, pe = _to_date(s.get("plan_start")), _to_date(s.get("plan_end"))
                if ps and pe:
                    b_nodes[("stage", s["id"])] = {"kind": "stage", "id": s["id"], "title": s["title"], "duration": max(0, (pe - ps).days), "anchor_start": ps}
            for t in bp.get("tasks", []):
                due = _to_date(t.get("due_at"))
                if due:
                    b_nodes[("task", t["id"])] = {"kind": "task", "id": t["id"], "title": t["title"], "duration": 0, "anchor_start": due}
            for m in bp.get("milestones", []):
                pd = _to_date(m.get("plan_date"))
                if pd:
                    b_nodes[("milestone", m["id"])] = {"kind": "milestone", "id": m["id"], "title": m["title"], "duration": 0, "anchor_start": pd}
            b_cpm, _, b_cycle, _ = _cpm_compute(b_nodes, bp.get("dependencies", []))
            baseline_critical = {(n["kind"], n["id"]) for n in b_cpm if n["is_critical"]} if not b_cycle else set()

            p["critical_path_changed"] = current_critical != baseline_critical
        projects = [p for p in projects if p.get("critical_path_changed")]

    if filters.get("overbudget_only"):
        projects = [p for p in projects if p["is_overbudget"]]
    if filters.get("critical_risk_only"):
        projects = [p for p in projects if p["critical_risk_count"] > 0]
    if filters.get("resource_gap_only"):
        projects = [p for p in projects if p["resource_gap_count"] > 0]
    if filters.get("overdue_only"):
        projects = [p for p in projects if p["is_overdue"]]
    if filters.get("cross_dependency_only"):
        projects = [p for p in projects if p["has_cross_project_dependency"]]
    if filters.get("shifted_only"):
        projects = [p for p in projects if (p["baseline_deviation"]["deviation_end_days"] or 0) != 0]
    if filters.get("min_shift_days"):
        min_shift = filters["min_shift_days"]
        projects = [p for p in projects if abs(p["baseline_deviation"]["deviation_end_days"] or 0) >= min_shift]
    if filters.get("no_baseline_only"):
        projects = [p for p in projects if not p["baseline_deviation"]["has_baseline"]]
    if filters.get("no_forecast_only"):
        projects = [p for p in projects if not p["baseline_deviation"]["has_forecast"]]
    if filters.get("no_fact_only"):
        projects = [p for p in projects if not p["baseline_deviation"]["has_fact_data"]]
    if filters.get("integrity_violated_only"):
        projects = [p for p in projects if p["baseline_deviation"]["has_baseline"] and not p["baseline_deviation"]["baseline_integrity_ok"]]

    initiatives_map = {}
    for p in projects:
        iid = p["initiative_id"] or 0
        if iid not in initiatives_map:
            initiatives_map[iid] = {"id": p["initiative_id"], "title": p["initiative_title"] or "Без инициативы", "projects": []}
        initiatives_map[iid]["projects"].append(p)

    return {"initiatives": list(initiatives_map.values()), "projects": projects}


def milestones_timeline(cur, date_from, date_to, filters: dict):
    """Отдельная шкала контрольных точек всех проектов. Отклонение в днях
    считается между актуальным planned (plan_date) и исходным
    (plan_date_original), а также между planned и fact для достигнутых."""
    conds = ["m.is_test_data = false"]
    params = []
    if date_from and date_to:
        conds.append("m.plan_date BETWEEN %s AND %s")
        params += [date_from, date_to]
    if filters.get("project_id"):
        conds.append("m.project_id = %s")
        params.append(filters["project_id"])
    if filters.get("initiative_id"):
        conds.append("m.initiative_id = %s")
        params.append(filters["initiative_id"])
    if filters.get("status"):
        conds.append("m.status = %s")
        params.append(filters["status"])
    if filters.get("overdue_only"):
        conds.append("m.status <> 'achieved' AND m.plan_date < CURRENT_DATE")

    where = "WHERE " + " AND ".join(conds)
    cur.execute(f"""
        SELECT m.id, m.title, m.milestone_type, m.plan_date_original, m.plan_date, m.fact_date,
               m.status, m.achievement_criteria, m.achievement_evidence, m.reschedule_count,
               m.reschedule_reason, m.project_id, p.title AS project_title,
               m.initiative_id, ei.title AS initiative_title,
               m.responsible_person_id, per.display_name AS responsible_name,
               m.confirmed_by_person_id, m.confirmed_at,
               m.is_conditional_scenario, m.decision_request_id,
               (m.status <> 'achieved' AND m.plan_date < CURRENT_DATE) AS is_overdue,
               CASE WHEN m.plan_date_original IS NOT NULL
                    THEN (m.plan_date - m.plan_date_original) ELSE NULL END AS deviation_days,
               (SELECT count(*) FROM {SCHEMA}.exec_task t WHERE t.milestone_id = m.id AND t.archived_at IS NULL) AS dependent_task_count
        FROM {SCHEMA}.exec_milestone m
        LEFT JOIN {SCHEMA}.exec_project p ON p.id = m.project_id
        LEFT JOIN {SCHEMA}.exec_initiative ei ON ei.id = m.initiative_id
        LEFT JOIN {SCHEMA}.exec_person per ON per.id = m.responsible_person_id
        {where}
        ORDER BY m.plan_date
    """, params)
    return rows(cur)


# ---------- ЗАВИСИМОСТИ РАСПИСАНИЯ ----------

def _dependency_object_exists(cur, kind: str, oid: int) -> bool:
    table = DEPENDENCY_KIND_TABLE.get(kind)
    if not table:
        return False
    cur.execute(f"SELECT 1 FROM {SCHEMA}.{table} WHERE id = %s", (oid,))
    return cur.fetchone() is not None


def _has_dependency_cycle(cur, new_src_kind, new_src_id, new_tgt_kind, new_tgt_id) -> bool:
    """Обходит граф зависимостей от новой цели (tgt) — если можно дойти
    обратно до источника (src), добавление создаст цикл."""
    cur.execute(f"""
        SELECT src_kind, src_id, tgt_kind, tgt_id FROM {SCHEMA}.exec_schedule_dependency
        WHERE archived_at IS NULL
    """)
    edges = rows(cur)
    edges.append({"src_kind": new_src_kind, "src_id": new_src_id, "tgt_kind": new_tgt_kind, "tgt_id": new_tgt_id})

    adjacency: dict = {}
    for e in edges:
        key = (e["src_kind"], e["src_id"])
        adjacency.setdefault(key, []).append((e["tgt_kind"], e["tgt_id"]))

    start = (new_tgt_kind, new_tgt_id)
    target = (new_src_kind, new_src_id)
    visited = set()
    stack = [start]
    while stack:
        node = stack.pop()
        if node == target:
            return True
        if node in visited:
            continue
        visited.add(node)
        stack.extend(adjacency.get(node, []))
    return False


def save_dependency(cur, body: dict, actor: str):
    dep_type = body.get("dependency_type", "FS")
    src_kind, src_id = body.get("src_kind"), as_int(body.get("src_id"))
    tgt_kind, tgt_id = body.get("tgt_kind"), as_int(body.get("tgt_id"))

    if dep_type not in DEPENDENCY_TYPES:
        return None, "Недопустимый тип зависимости"
    if src_kind not in DEPENDENCY_KINDS or tgt_kind not in DEPENDENCY_KINDS:
        return None, "Недопустимый тип объекта зависимости"
    if not src_id or not tgt_id:
        return None, "Не указан один из объектов зависимости"
    if src_kind == tgt_kind and src_id == tgt_id:
        return None, "Нельзя создать зависимость объекта от самого себя"
    if not _dependency_object_exists(cur, src_kind, src_id):
        return None, f"Исходный объект ({src_kind} #{src_id}) не найден"
    if not _dependency_object_exists(cur, tgt_kind, tgt_id):
        return None, f"Целевой объект ({tgt_kind} #{tgt_id}) не найден"

    cur.execute(f"""
        SELECT id FROM {SCHEMA}.exec_schedule_dependency
        WHERE dependency_type = %s AND src_kind = %s AND src_id = %s
          AND tgt_kind = %s AND tgt_id = %s AND archived_at IS NULL
    """, (dep_type, src_kind, src_id, tgt_kind, tgt_id))
    if cur.fetchone():
        return None, "Такая зависимость уже существует"

    if _has_dependency_cycle(cur, src_kind, src_id, tgt_kind, tgt_id):
        return None, "Эта зависимость создаёт цикл (объект косвенно зависит сам от себя) — сохранение отклонено"

    lag_days = as_int(body.get("lag_days")) or 0
    lag_kind = body.get("lag_kind", "calendar")
    if lag_kind not in ("calendar", "working"):
        return None, "Недопустимый вид лага"

    cur.execute(f"""
        INSERT INTO {SCHEMA}.exec_schedule_dependency
            (dependency_type, src_kind, src_id, tgt_kind, tgt_id, lag_days, lag_kind, note, created_by)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id
    """, (dep_type, src_kind, src_id, tgt_kind, tgt_id, lag_days, lag_kind, body.get("note"), actor))
    new_id = cur.fetchone()[0]
    log_change(cur, actor, "schedule_dependency", new_id, "create",
               after={"type": dep_type, "src": f"{src_kind}#{src_id}", "tgt": f"{tgt_kind}#{tgt_id}"})
    return new_id, None


def archive_dependency(cur, did, actor):
    cur.execute(f"""
        UPDATE {SCHEMA}.exec_schedule_dependency SET archived_at = now(), archived_by = %s
        WHERE id = %s AND archived_at IS NULL RETURNING id
    """, (actor, did))
    r = cur.fetchone()
    if r:
        log_change(cur, actor, "schedule_dependency", did, "archive")
    return r[0] if r else None


def list_dependencies(cur, kind: str = None, oid: int = None):
    conds = ["archived_at IS NULL"]
    params = []
    if kind and oid:
        conds.append("((src_kind = %s AND src_id = %s) OR (tgt_kind = %s AND tgt_id = %s))")
        params += [kind, oid, kind, oid]
    where = "WHERE " + " AND ".join(conds)
    cur.execute(f"SELECT * FROM {SCHEMA}.exec_schedule_dependency {where} ORDER BY created_at DESC", params)
    return rows(cur)


# ---------- BASELINE (ВЕРСИИ РАСПИСАНИЯ) ----------

def _project_schedule_payload(cur, project_id: int):
    """Снимок расписания для baseline. Фиксирует ПЛАН (даты, на которые
    ориентируются при сравнении) и зависимости между объектами на момент
    фиксации — не факт и не прогноз, у них нет смысла в неизменяемом
    историческом снимке точки старта. Зависимости нужны, чтобы можно было
    воспроизвести критический путь baseline и сравнить его с текущим."""
    p = fetch_one(cur, "exec_project", project_id)
    if not p:
        return None
    cur.execute(f"SELECT id, title, plan_start, plan_end FROM {SCHEMA}.exec_project_stage WHERE project_id = %s", (project_id,))
    stages = rows(cur)
    cur.execute(f"SELECT id, title, due_at FROM {SCHEMA}.exec_task WHERE project_id = %s AND archived_at IS NULL", (project_id,))
    tasks = rows(cur)
    cur.execute(f"SELECT id, title, plan_date FROM {SCHEMA}.exec_milestone WHERE project_id = %s", (project_id,))
    milestones = rows(cur)

    task_ids, milestone_ids, stage_ids = [t["id"] for t in tasks], [m["id"] for m in milestones], [s["id"] for s in stages]
    cur.execute(f"""
        SELECT dependency_type, src_kind, src_id, tgt_kind, tgt_id, lag_days, lag_kind
        FROM {SCHEMA}.exec_schedule_dependency
        WHERE archived_at IS NULL AND (
            (src_kind = 'project' AND src_id = %(pid)s) OR (tgt_kind = 'project' AND tgt_id = %(pid)s)
            OR (src_kind = 'task' AND src_id = ANY(%(task_ids)s)) OR (tgt_kind = 'task' AND tgt_id = ANY(%(task_ids)s))
            OR (src_kind = 'milestone' AND src_id = ANY(%(milestone_ids)s)) OR (tgt_kind = 'milestone' AND tgt_id = ANY(%(milestone_ids)s))
            OR (src_kind = 'stage' AND src_id = ANY(%(stage_ids)s)) OR (tgt_kind = 'stage' AND tgt_id = ANY(%(stage_ids)s))
        )
    """, {"pid": project_id, "task_ids": task_ids or [0], "milestone_ids": milestone_ids or [0], "stage_ids": stage_ids or [0]})
    dependencies = rows(cur)

    return {
        "project": {"id": p["id"], "title": p["title"], "plan_start": p["plan_start"], "plan_end": p["plan_end"]},
        "stages": stages, "tasks": tasks, "milestones": milestones, "dependencies": dependencies,
    }


def create_baseline(cur, body: dict, actor: str):
    scope_kind = body.get("scope_kind", "project")
    scope_id = as_int(body.get("scope_id"))
    if scope_kind not in ("project", "portfolio"):
        return None, "Недопустимая область baseline"
    if scope_kind == "project" and not scope_id:
        return None, "Не указан проект"

    if scope_kind == "project":
        payload = _project_schedule_payload(cur, scope_id)
        if payload is None:
            return None, "Проект не найден"
    else:
        cur.execute(f"SELECT id FROM {SCHEMA}.exec_project WHERE archived_at IS NULL AND is_test_data = false")
        pids = [r["id"] for r in rows(cur)]
        payload = {"projects": [_project_schedule_payload(cur, pid) for pid in pids]}

    payload_str = json.dumps(payload, ensure_ascii=False, default=str)
    payload_hash = hashlib.sha256(payload_str.encode("utf-8")).hexdigest()

    cur.execute(f"""
        SELECT COALESCE(MAX(version_number), 0) FROM {SCHEMA}.exec_schedule_baseline
        WHERE scope_kind = %s AND scope_id IS NOT DISTINCT FROM %s
    """, (scope_kind, scope_id))
    next_version = cur.fetchone()[0] + 1
    title = body.get("title") or f"Baseline {scope_kind} — версия {next_version}"

    cur.execute(f"""
        INSERT INTO {SCHEMA}.exec_schedule_baseline
            (scope_kind, scope_id, title, version_number, payload_json, payload_sha256, is_test_data, created_by)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id, created_at
    """, (scope_kind, scope_id, title, next_version, payload_str, payload_hash, bool(body.get("is_test_data")), actor))
    row = cur.fetchone()
    log_change(cur, actor, "schedule_baseline", row[0], "create",
               after={"scope_kind": scope_kind, "scope_id": scope_id, "version_number": next_version})
    return {"id": row[0], "created_at": row[1], "version_number": next_version, "payload_sha256": payload_hash, "title": title}, None


def list_baselines(cur, scope_kind=None, scope_id=None):
    conds = []
    params = []
    if scope_kind:
        conds.append("scope_kind = %s")
        params.append(scope_kind)
    if scope_id:
        conds.append("scope_id = %s")
        params.append(scope_id)
    where = ("WHERE " + " AND ".join(conds)) if conds else ""
    cur.execute(f"""
        SELECT id, scope_kind, scope_id, title, version_number, payload_sha256, created_by, created_at, is_test_data, is_active
        FROM {SCHEMA}.exec_schedule_baseline {where} ORDER BY version_number DESC
    """, params)
    return rows(cur)


def set_active_baseline(cur, bid: int, actor: str):
    """Явно помечает версию baseline как действующую для её scope.
    Частичный уникальный индекс на (scope_kind, scope_id) WHERE is_active
    гарантирует ровно одну активную версию — снимаем флаг со старой перед
    установкой на новую в одной транзакции."""
    cur.execute(f"SELECT scope_kind, scope_id FROM {SCHEMA}.exec_schedule_baseline WHERE id = %s", (bid,))
    r = rows(cur)
    if not r:
        return None, "Baseline не найден"
    scope_kind, scope_id = r[0]["scope_kind"], r[0]["scope_id"]
    cur.execute(f"""
        UPDATE {SCHEMA}.exec_schedule_baseline SET is_active = false
        WHERE scope_kind = %s AND scope_id IS NOT DISTINCT FROM %s AND is_active = true
    """, (scope_kind, scope_id))
    cur.execute(f"UPDATE {SCHEMA}.exec_schedule_baseline SET is_active = true WHERE id = %s", (bid,))
    log_change(cur, actor, "schedule_baseline", bid, "set_active")
    return bid, None


def compare_baseline_versions(cur, baseline_id_a: int, baseline_id_b: int):
    """Сравнение двух версий baseline друг с другом (не с текущим планом) —
    что изменилось между двумя историческими снимками."""
    a = get_baseline(cur, baseline_id_a)
    b = get_baseline(cur, baseline_id_b)
    if not a or not b:
        return None, "Одна из версий baseline не найдена"

    def index_by_id(items):
        return {i["id"]: i for i in items}

    diffs = {"project": None, "stages": [], "tasks": [], "milestones": []}
    pa, pb = a["payload"].get("project", {}), b["payload"].get("project", {})
    if pa.get("plan_start") != pb.get("plan_start") or pa.get("plan_end") != pb.get("plan_end"):
        diffs["project"] = {
            "plan_start_a": pa.get("plan_start"), "plan_start_b": pb.get("plan_start"),
            "plan_end_a": pa.get("plan_end"), "plan_end_b": pb.get("plan_end"),
        }
    for key, date_field in (("stages", "plan_end"), ("tasks", "due_at"), ("milestones", "plan_date")):
        idx_a, idx_b = index_by_id(a["payload"].get(key, [])), index_by_id(b["payload"].get(key, []))
        for oid, item_b in idx_b.items():
            item_a = idx_a.get(oid)
            if item_a is None:
                diffs[key].append({"id": oid, "title": item_b["title"], "change": "added_in_b"})
            elif item_a.get(date_field) != item_b.get(date_field):
                diffs[key].append({
                    "id": oid, "title": item_b["title"], "change": "date_changed",
                    "value_a": item_a.get(date_field), "value_b": item_b.get(date_field),
                })
        for oid, item_a in idx_a.items():
            if oid not in idx_b:
                diffs[key].append({"id": oid, "title": item_a["title"], "change": "removed_in_b"})

    return {
        "baseline_a": {"id": a["id"], "version_number": a["version_number"], "created_at": a["created_at"]},
        "baseline_b": {"id": b["id"], "version_number": b["version_number"], "created_at": b["created_at"]},
        "diffs": diffs,
    }, None


# ---------- СРАВНЕНИЕ РАСПИСАНИЙ: BASELINE / АКТУАЛЬНЫЙ ПЛАН / ПРОГНОЗ / ФАКТ ----------

def _to_date(v):
    """Нормализует дату из любого источника к datetime.date: значения из
    текущих таблиц приходят как datetime.date (psycopg2), а значения из
    JSON-снимка baseline — как строки ISO (JSON не имеет типа даты)."""
    if v is None:
        return None
    if isinstance(v, datetime.date):
        return v
    return datetime.date.fromisoformat(str(v)[:10])


def _diff_days(a, b):
    """b − a в днях, либо None если одна из дат отсутствует."""
    da, db = _to_date(a), _to_date(b)
    if da is None or db is None:
        return None
    return (db - da).days


def schedule_change_log(cur, pid: int, limit: int = 200):
    """Специализированная история изменений расписания проекта — читает
    exec_schedule_change_log (не общий exec_audit_log). Каждая строка —
    одно изменение одной даты одного объекта: старое/новое значение,
    величина сдвига, причина, связанные решение/документ и признак того,
    затрагивает ли изменение зависимости."""
    cur.execute(f"""
        SELECT l.*, 
            CASE l.object_kind
                WHEN 'project' THEN (SELECT title FROM {SCHEMA}.exec_project WHERE id = l.object_id)
                WHEN 'stage' THEN (SELECT title FROM {SCHEMA}.exec_project_stage WHERE id = l.object_id)
                WHEN 'task' THEN (SELECT title FROM {SCHEMA}.exec_task WHERE id = l.object_id)
                WHEN 'milestone' THEN (SELECT title FROM {SCHEMA}.exec_milestone WHERE id = l.object_id)
            END AS object_title
        FROM {SCHEMA}.exec_schedule_change_log l
        WHERE l.project_id = %s
        ORDER BY l.created_at DESC
        LIMIT %s
    """, (pid, limit))
    return rows(cur)


def schedule_comparison(cur, pid: int, baseline_id: int = None):
    """Сравнение четырёх слоёв расписания проекта на одной шкале:
    baseline (зафиксированный снимок) / актуальный план / прогноз / факт.
    Не путает прогноз с планом — если прогнозное поле не заполнено,
    явно возвращает null, а не подменяет его текущим планом.

    Если baseline не передан явно — берётся ДЕЙСТВУЮЩАЯ (is_active) версия
    для этого проекта. Если действующей версии нет вовсе — сравнение
    выполняется без слоя baseline, с явным предупреждением."""
    p = fetch_one(cur, "exec_project", pid)
    if not p:
        return None, "Проект не найден"

    warnings = []

    if baseline_id:
        baseline = get_baseline(cur, baseline_id)
        if not baseline:
            return None, "Указанная версия baseline не найдена"
    else:
        cur.execute(f"""
            SELECT id FROM {SCHEMA}.exec_schedule_baseline
            WHERE scope_kind = 'project' AND scope_id = %s AND is_active = true LIMIT 1
        """, (pid,))
        r = rows(cur)
        baseline = get_baseline(cur, r[0]["id"]) if r else None
        if not baseline:
            warnings.append("Для проекта нет действующей версии baseline — сравнение показывает только актуальный план, прогноз и факт.")

    if baseline and not baseline["integrity_ok"]:
        return None, "Целостность выбранного baseline нарушена (SHA-256 не совпадает) — сравнение и экспорт заблокированы до расследования."

    bp = baseline["payload"] if baseline else None
    b_stage = {s["id"]: s for s in (bp["stages"] if bp else [])}
    b_task = {t["id"]: t for t in (bp["tasks"] if bp else [])}
    b_milestone = {m["id"]: m for m in (bp["milestones"] if bp else [])}

    g = _build_schedule_graph(cur, pid)

    rows_out = {"project": None, "stages": [], "tasks": [], "milestones": []}

    # --- Проект ---
    b_proj = bp["project"] if bp else {}
    proj_row = {
        "kind": "project", "id": p["id"], "title": p["title"], "status": p["status"],
        "baseline_start": b_proj.get("plan_start"), "baseline_end": b_proj.get("plan_end"),
        "actual_start": p["plan_start"], "actual_end": p["plan_end"],
        "forecast_end": p.get("forecast_end"),
        "fact_start": p["fact_start"], "fact_end": p["fact_end"],
        "progress_pct": p["progress_pct"],
    }
    proj_row["deviation_start_days"] = _diff_days(proj_row["baseline_start"], proj_row["actual_start"] or proj_row["fact_start"])
    proj_row["deviation_end_days"] = _diff_days(proj_row["baseline_end"], proj_row["fact_end"] or proj_row["forecast_end"] or proj_row["actual_end"])
    if proj_row["status"] == "completed" and not proj_row["fact_end"]:
        proj_row["data_quality_warning"] = "Статус «Завершено», но фактическая дата завершения не указана."
    rows_out["project"] = proj_row

    # --- Этапы ---
    for s in g["stages"]:
        b = b_stage.get(s["id"])
        row = {
            "kind": "stage", "id": s["id"], "title": s["title"], "status": s["status"],
            "baseline_start": b.get("plan_start") if b else None, "baseline_end": b.get("plan_end") if b else None,
            "actual_start": s["plan_start"], "actual_end": s["plan_end"],
            "forecast_end": s.get("forecast_end"),
            "fact_start": s["fact_start"], "fact_end": s["fact_end"],
        }
        row["deviation_start_days"] = _diff_days(row["baseline_start"], row["actual_start"] or row["fact_start"])
        row["deviation_end_days"] = _diff_days(row["baseline_end"], row["fact_end"] or row["forecast_end"] or row["actual_end"])
        if row["status"] == "done" and not row["fact_end"]:
            row["data_quality_warning"] = "Статус «Готово», но фактическая дата завершения не указана."
        if not b and bp is not None:
            row["baseline_missing"] = True
        rows_out["stages"].append(row)

    # --- Задачи ---
    for t in g["tasks"]:
        b = b_task.get(t["id"])
        row = {
            "kind": "task", "id": t["id"], "title": t["title"], "status": t["status"],
            "responsible_name": t.get("responsible_name"),
            "baseline_end": b.get("due_at") if b else None,
            "actual_end": t["due_at"], "forecast_end": t.get("forecast_date"),
            "fact_end": t.get("fact_date"), "progress_pct": t.get("progress_pct"),
        }
        row["deviation_end_days"] = _diff_days(row["baseline_end"], row["fact_end"] or row["forecast_end"] or row["actual_end"])
        if row["status"] == "done" and not row["fact_end"]:
            row["data_quality_warning"] = "Статус «Выполнена», но фактическая дата не указана."
        if not b and bp is not None:
            row["baseline_missing"] = True
        rows_out["tasks"].append(row)

    # --- Вехи ---
    for m in g["milestones"]:
        b = b_milestone.get(m["id"])
        row = {
            "kind": "milestone", "id": m["id"], "title": m["title"], "status": m["status"],
            "responsible_name": m.get("responsible_name"),
            "baseline_end": b.get("plan_date") if b else None,
            "actual_end": m["plan_date"], "forecast_end": m.get("forecast_date"),
            "fact_end": m.get("fact_date"),
        }
        row["deviation_end_days"] = _diff_days(row["baseline_end"], row["fact_end"] or row["forecast_end"] or row["actual_end"])
        if row["status"] == "achieved" and not row["fact_end"]:
            row["data_quality_warning"] = "Статус «Достигнута», но фактическая дата не указана."
        if not b and bp is not None:
            row["baseline_missing"] = True
        rows_out["milestones"].append(row)

    # --- Критический путь: текущий vs baseline ---
    current_nodes, _ = _cpm_nodes_from_current(g)
    current_cpm_nodes, _, current_cycle, _ = _cpm_compute(current_nodes, g["edges"])
    current_critical = {(n["kind"], n["id"]) for n in current_cpm_nodes if n["is_critical"]} if not current_cycle else set()

    baseline_critical = set()
    baseline_duration = None
    if bp:
        # Даты в payload baseline — строки ISO (JSON не имеет типа даты),
        # приводим к datetime.date, иначе арифметика в _cpm_compute упадёт.
        b_nodes = {}
        for s in bp["stages"]:
            ps, pe = _to_date(s.get("plan_start")), _to_date(s.get("plan_end"))
            if ps and pe:
                b_nodes[("stage", s["id"])] = {"kind": "stage", "id": s["id"], "title": s["title"],
                    "duration": max(0, (pe - ps).days), "anchor_start": ps}
        for t in bp["tasks"]:
            due = _to_date(t.get("due_at"))
            if due:
                b_nodes[("task", t["id"])] = {"kind": "task", "id": t["id"], "title": t["title"],
                    "duration": 0, "anchor_start": due}
        for m in bp["milestones"]:
            pd = _to_date(m.get("plan_date"))
            if pd:
                b_nodes[("milestone", m["id"])] = {"kind": "milestone", "id": m["id"], "title": m["title"],
                    "duration": 0, "anchor_start": pd}
        b_edges = bp.get("dependencies", [])
        b_cpm_nodes, baseline_duration, b_cycle, _ = _cpm_compute(b_nodes, b_edges)
        if not b_cycle:
            baseline_critical = {(n["kind"], n["id"]) for n in b_cpm_nodes if n["is_critical"]}

    newly_critical = current_critical - baseline_critical
    no_longer_critical = baseline_critical - current_critical

    # --- Сводка ---
    all_rows = rows_out["stages"] + rows_out["tasks"] + rows_out["milestones"]
    shifted = [r for r in all_rows if r.get("deviation_end_days")]
    shifted_tasks = [r for r in shifted if r["kind"] == "task"]
    shifted_milestones = [r for r in shifted if r["kind"] == "milestone"]
    today = datetime.date.today()
    overdue_count = sum(1 for r in all_rows if r.get("status") not in ("done", "achieved", "cancelled")
                         and _to_date(r.get("actual_end") or r.get("forecast_end"))
                         and _to_date(r.get("actual_end") or r.get("forecast_end")) < today)
    no_fact_count = sum(1 for r in all_rows if r.get("status") in ("done", "achieved") and not r.get("fact_end"))

    summary = {
        "project_end_shift_days": proj_row["deviation_end_days"],
        "shifted_tasks_count": len(shifted_tasks),
        "shifted_milestones_count": len(shifted_milestones),
        "newly_critical": [{"kind": k, "id": i} for k, i in newly_critical],
        "no_longer_critical": [{"kind": k, "id": i} for k, i in no_longer_critical],
        "overdue_count": overdue_count,
        "no_fact_data_count": no_fact_count,
        "top_shifts": sorted(
            [r for r in shifted], key=lambda r: abs(r["deviation_end_days"]), reverse=True
        )[:10],
    }

    return {
        "project": {"id": p["id"], "title": p["title"]},
        "baseline": ({"id": baseline["id"], "version_number": baseline["version_number"],
                      "created_at": baseline["created_at"], "created_by": baseline["created_by"],
                      "integrity_ok": baseline["integrity_ok"]} if baseline else None),
        "warnings": warnings,
        "rows": rows_out,
        "current_cpm_computable": not current_cycle,
        "baseline_cpm_computable": bool(bp) and baseline_duration is not None,
        "summary": summary,
        "calendar_mode": "calendar_days",
    }, None


def project_gantt(cur, pid: int):
    """Данные для интерактивной диаграммы Ганта одного проекта (режим
    просмотра): этапы → задачи, вехи, зависимости внутри проекта и
    последний baseline для сравнения план/факт. Один запрос вместо
    дублирования отдельных вызовов stages/tasks/milestones/dependencies —
    экономит round-trip для тяжёлого экрана."""
    p = fetch_one(cur, "exec_project", pid)
    if not p:
        return None

    cur.execute(f"""
        SELECT * FROM {SCHEMA}.exec_project_stage WHERE project_id = %s ORDER BY sort_order, id
    """, (pid,))
    stages = rows(cur)

    cur.execute(f"""
        SELECT t.*, per.display_name AS responsible_name,
            (t.due_at IS NOT NULL AND t.due_at < CURRENT_DATE
                AND t.status NOT IN ('done','cancelled')) AS is_overdue
        FROM {SCHEMA}.exec_task t
        LEFT JOIN {SCHEMA}.exec_person per ON per.id = t.responsible_person_id
        WHERE t.project_id = %s AND t.archived_at IS NULL
        ORDER BY (t.stage_id IS NULL), t.stage_id, (t.due_at IS NULL), t.due_at
    """, (pid,))
    tasks = rows(cur)

    cur.execute(f"""
        SELECT m.*, per.display_name AS responsible_name
        FROM {SCHEMA}.exec_milestone m
        LEFT JOIN {SCHEMA}.exec_person per ON per.id = m.responsible_person_id
        WHERE m.project_id = %s
        ORDER BY m.plan_date
    """, (pid,))
    milestones = rows(cur)

    # Зависимости, где хотя бы один конец принадлежит объектам этого проекта
    # (включая межпроектные — другой конец может быть в другом проекте).
    task_ids = [t["id"] for t in tasks]
    milestone_ids = [m["id"] for m in milestones]
    stage_ids = [s["id"] for s in stages]

    cur.execute(f"""
        SELECT * FROM {SCHEMA}.exec_schedule_dependency
        WHERE archived_at IS NULL AND (
            (src_kind = 'project' AND src_id = %(pid)s) OR (tgt_kind = 'project' AND tgt_id = %(pid)s)
            OR (src_kind = 'task' AND src_id = ANY(%(task_ids)s)) OR (tgt_kind = 'task' AND tgt_id = ANY(%(task_ids)s))
            OR (src_kind = 'milestone' AND src_id = ANY(%(milestone_ids)s)) OR (tgt_kind = 'milestone' AND tgt_id = ANY(%(milestone_ids)s))
            OR (src_kind = 'stage' AND src_id = ANY(%(stage_ids)s)) OR (tgt_kind = 'stage' AND tgt_id = ANY(%(stage_ids)s))
        )
    """, {"pid": pid, "task_ids": task_ids or [0], "milestone_ids": milestone_ids or [0], "stage_ids": stage_ids or [0]})
    dependencies = rows(cur)

    cur.execute(f"""
        SELECT id, version_number, created_by, created_at, payload_sha256
        FROM {SCHEMA}.exec_schedule_baseline
        WHERE scope_kind = 'project' AND scope_id = %s
        ORDER BY version_number DESC LIMIT 1
    """, (pid,))
    latest_baseline = rows(cur)

    return {
        "project": p, "stages": stages, "tasks": tasks, "milestones": milestones,
        "dependencies": dependencies, "latest_baseline": latest_baseline[0] if latest_baseline else None,
    }


# ---------- КАРТА ЗАВИСИМОСТЕЙ И КРИТИЧЕСКИЙ ПУТЬ ----------

def _build_schedule_graph(cur, pid: int):
    """Строит узлы (этапы/задачи/вехи проекта) и рёбра (зависимости между
    ними, включая межпроектные — второй конец тогда помечен external=true)
    для карты зависимостей и расчёта критического пути. Не рассчитывает
    портфель целиком — только выбранный проект и его прямых соседей по
    зависимостям (глубина внешних связей ограничена одним шагом)."""
    cur.execute(f"""
        SELECT id, title, status, plan_start, plan_end, forecast_end, fact_start, fact_end, sort_order
        FROM {SCHEMA}.exec_project_stage WHERE project_id = %s ORDER BY sort_order, id
    """, (pid,))
    stages = rows(cur)

    cur.execute(f"""
        SELECT t.id, t.title, t.status, t.progress_pct, t.due_at, t.forecast_date, t.fact_date, t.stage_id,
               t.responsible_person_id, per.display_name AS responsible_name,
               (t.due_at IS NOT NULL AND t.due_at < CURRENT_DATE
                   AND t.status NOT IN ('done','cancelled')) AS is_overdue
        FROM {SCHEMA}.exec_task t
        LEFT JOIN {SCHEMA}.exec_person per ON per.id = t.responsible_person_id
        WHERE t.project_id = %s AND t.archived_at IS NULL
    """, (pid,))
    tasks = rows(cur)

    cur.execute(f"""
        SELECT m.id, m.title, m.status, m.plan_date, m.forecast_date, m.fact_date,
               m.responsible_person_id, per.display_name AS responsible_name,
               m.is_conditional_scenario,
               (m.status <> 'achieved' AND m.plan_date < CURRENT_DATE) AS is_overdue
        FROM {SCHEMA}.exec_milestone m
        LEFT JOIN {SCHEMA}.exec_person per ON per.id = m.responsible_person_id
        WHERE m.project_id = %s
    """, (pid,))
    milestones = rows(cur)

    node_ids = {"stage": {s["id"] for s in stages}, "task": {t["id"] for t in tasks}, "milestone": {m["id"] for m in milestones}}

    cur.execute(f"""
        SELECT * FROM {SCHEMA}.exec_schedule_dependency
        WHERE archived_at IS NULL AND (
            (src_kind = 'project' AND src_id = %(pid)s) OR (tgt_kind = 'project' AND tgt_id = %(pid)s)
            OR (src_kind = 'task' AND src_id = ANY(%(task_ids)s)) OR (tgt_kind = 'task' AND tgt_id = ANY(%(task_ids)s))
            OR (src_kind = 'milestone' AND src_id = ANY(%(milestone_ids)s)) OR (tgt_kind = 'milestone' AND tgt_id = ANY(%(milestone_ids)s))
            OR (src_kind = 'stage' AND src_id = ANY(%(stage_ids)s)) OR (tgt_kind = 'stage' AND tgt_id = ANY(%(stage_ids)s))
        )
    """, {"pid": pid, "task_ids": list(node_ids["task"]) or [0],
          "milestone_ids": list(node_ids["milestone"]) or [0], "stage_ids": list(node_ids["stage"]) or [0]})
    raw_edges = rows(cur)

    def is_local(kind, oid):
        return kind in node_ids and oid in node_ids[kind]

    # Внешние узлы одним шагом наружу — только заголовок и принадлежность
    # к другому проекту, без рекурсивного разворачивания их собственных связей.
    external_refs = set()
    for e in raw_edges:
        if not is_local(e["src_kind"], e["src_id"]):
            external_refs.add((e["src_kind"], e["src_id"]))
        if not is_local(e["tgt_kind"], e["tgt_id"]):
            external_refs.add((e["tgt_kind"], e["tgt_id"]))

    external_nodes = {}
    for kind, oid in external_refs:
        table = DEPENDENCY_KIND_TABLE.get(kind)
        if not table:
            continue
        if kind == "project":
            cur.execute(f"SELECT id, title, id AS project_id FROM {SCHEMA}.exec_project WHERE id = %s", (oid,))
        else:
            cur.execute(f"SELECT id, title, project_id FROM {SCHEMA}.{table} WHERE id = %s", (oid,))
        r = rows(cur)
        if r:
            external_nodes[(kind, oid)] = {"kind": kind, "id": oid, "title": r[0]["title"], "project_id": r[0].get("project_id")}

    return {
        "stages": stages, "tasks": tasks, "milestones": milestones,
        "edges": raw_edges, "node_ids": node_ids, "external_nodes": external_nodes,
        "is_local": is_local,
    }


def dependency_graph(cur, pid: int):
    """Карта зависимостей проекта: узлы (этап/задача/веха) с датами,
    статусом, готовностью, ответственным, просрочкой, принадлежностью к
    этапу и числом входящих/исходящих связей; рёбра — с типом, лагом,
    межпроектным признаком и нарушением (просрочен предшественник, а
    последователь уже должен был начаться/завершиться)."""
    p = fetch_one(cur, "exec_project", pid)
    if not p:
        return None
    g = _build_schedule_graph(cur, pid)

    nodes = []
    stage_title = {s["id"]: s["title"] for s in g["stages"]}

    for s in g["stages"]:
        nodes.append({
            "kind": "stage", "id": s["id"], "title": s["title"], "status": s["status"],
            "plan_start": s["plan_start"], "plan_end": s["plan_end"], "is_overdue": False,
            "progress_pct": None, "responsible_name": None, "stage_id": None, "external": False,
        })
    for t in g["tasks"]:
        nodes.append({
            "kind": "task", "id": t["id"], "title": t["title"], "status": t["status"],
            "plan_start": None, "plan_end": t["due_at"], "is_overdue": t["is_overdue"],
            "progress_pct": t["progress_pct"], "responsible_name": t["responsible_name"],
            "stage_id": t["stage_id"], "stage_title": stage_title.get(t["stage_id"]), "external": False,
        })
    for m in g["milestones"]:
        nodes.append({
            "kind": "milestone", "id": m["id"], "title": m["title"], "status": m["status"],
            "plan_start": m["plan_date"], "plan_end": m["plan_date"], "is_overdue": m["is_overdue"],
            "progress_pct": None, "responsible_name": m["responsible_name"], "stage_id": None, "external": False,
        })
    for (kind, oid), ext in g["external_nodes"].items():
        nodes.append({
            "kind": kind, "id": oid, "title": ext["title"], "status": None,
            "plan_start": None, "plan_end": None, "is_overdue": False,
            "progress_pct": None, "responsible_name": None, "stage_id": None,
            "external": True, "external_project_id": ext.get("project_id"),
        })

    in_count = {}
    out_count = {}
    edges_out = []
    for e in g["edges"]:
        src_key, tgt_key = (e["src_kind"], e["src_id"]), (e["tgt_kind"], e["tgt_id"])
        out_count[src_key] = out_count.get(src_key, 0) + 1
        in_count[tgt_key] = in_count.get(tgt_key, 0) + 1
        edges_out.append({
            "id": e["id"], "dependency_type": e["dependency_type"],
            "src_kind": e["src_kind"], "src_id": e["src_id"],
            "tgt_kind": e["tgt_kind"], "tgt_id": e["tgt_id"],
            "lag_days": e["lag_days"], "lag_kind": e["lag_kind"],
            "is_cross_project": not (g["is_local"](e["src_kind"], e["src_id"]) and g["is_local"](e["tgt_kind"], e["tgt_id"])),
        })

    node_by_key = {}
    for n in nodes:
        key = (n["kind"], n["id"])
        n["in_count"] = in_count.get(key, 0)
        n["out_count"] = out_count.get(key, 0)
        node_by_key[key] = n

    # Нарушение зависимости: предшественник просрочен/не завершён, а срок
    # последователя уже наступил или прошёл — сигнал, что связь фактически нарушена.
    for e in edges_out:
        src = node_by_key.get((e["src_kind"], e["src_id"]))
        tgt = node_by_key.get((e["tgt_kind"], e["tgt_id"]))
        violated = False
        if src and tgt and not src.get("external") and not tgt.get("external"):
            src_done = src["status"] in ("done", "achieved", "cancelled")
            if not src_done and tgt.get("plan_end") and tgt["plan_end"] <= datetime.date.today():
                violated = True
        e["violated"] = violated

    return {"project": {"id": p["id"], "title": p["title"]}, "nodes": nodes, "edges": edges_out}


# ---------- КРИТИЧЕСКИЙ ПУТЬ (CPM) ----------

def _cpm_compute(nodes: dict, edges: list):
    """Ядро метода критического пути, не зависящее от источника данных —
    переиспользуется и для текущего состояния проекта, и для дат,
    зафиксированных в снимке baseline (чтобы сравнить критические пути).
    nodes: (kind,id) -> {duration, anchor_start, title, status, ...}
    edges: список зависимостей с полями dependency_type/src_*/tgt_*/lag_days.
    Возвращает (result_nodes, project_duration, cycle_chain_or_None, isolated_keys).

    ВАЖНО: объекты, не связанные НИ ОДНОЙ зависимостью с остальным графом
    (нет ни входящей, ни исходящей связи), исключаются из расчёта целиком —
    иначе они математически получают нулевой резерв (LS=LF=0 по умолчанию,
    ES=EF=0 при нулевой длительности) и ложно помечаются критичными, хотя
    по смыслу метода критический путь для них попросту не определён."""
    local_edges = [e for e in edges
                   if (e["src_kind"], e["src_id"]) in nodes and (e["tgt_kind"], e["tgt_id"]) in nodes]
    connected_keys = set()
    for e in local_edges:
        connected_keys.add((e["src_kind"], e["src_id"]))
        connected_keys.add((e["tgt_kind"], e["tgt_id"]))
    isolated_keys = set(nodes) - connected_keys

    if len(connected_keys) < 2 or not local_edges:
        return [], None, None, isolated_keys

    nodes = {k: v for k, v in nodes.items() if k in connected_keys}

    adjacency: dict = {k: [] for k in nodes}
    indegree = {k: 0 for k in nodes}
    for e in local_edges:
        src_key, tgt_key = (e["src_kind"], e["src_id"]), (e["tgt_kind"], e["tgt_id"])
        adjacency[src_key].append((tgt_key, e))
        indegree[tgt_key] += 1

    queue = [k for k, d in indegree.items() if d == 0]
    order = []
    indegree_work = dict(indegree)
    while queue:
        node = queue.pop()
        order.append(node)
        for nxt, _ in adjacency[node]:
            indegree_work[nxt] -= 1
            if indegree_work[nxt] == 0:
                queue.append(nxt)

    if len(order) != len(nodes):
        remaining = set(nodes) - set(order)
        chain = _find_cycle_chain(remaining, adjacency)
        return [], None, [{"kind": k[0], "id": k[1], "title": nodes[k]["title"]} for k in chain], isolated_keys

    day0 = min(n["anchor_start"] for n in nodes.values())
    ES = {k: 0 for k in nodes}
    EF = {k: nodes[k]["duration"] for k in nodes}

    for node_key in order:
        preds_applied = False
        for e in local_edges:
            src_key, tgt_key = (e["src_kind"], e["src_id"]), (e["tgt_kind"], e["tgt_id"])
            if tgt_key != node_key:
                continue
            lag = e["lag_days"] or 0
            dtype = e["dependency_type"]
            if dtype == "FS":
                candidate = EF[src_key] + lag
            elif dtype == "SS":
                candidate = ES[src_key] + lag
            elif dtype == "FF":
                candidate = EF[src_key] + lag - nodes[node_key]["duration"]
            else:  # SF
                candidate = ES[src_key] + lag - nodes[node_key]["duration"]
            if not preds_applied or candidate > ES[node_key]:
                ES[node_key] = candidate
                preds_applied = True
        EF[node_key] = ES[node_key] + nodes[node_key]["duration"]

    project_duration = max(EF.values())

    LF = {k: project_duration for k in nodes}
    LS = {k: project_duration - nodes[k]["duration"] for k in nodes}
    for node_key in reversed(order):
        succs = [(tgt_key, e) for tgt_key, e in adjacency[node_key]]
        if not succs:
            continue
        candidates = []
        for tgt_key, e in succs:
            lag = e["lag_days"] or 0
            dtype = e["dependency_type"]
            if dtype == "FS":
                candidates.append(LS[tgt_key] - lag)
            elif dtype == "SS":
                candidates.append(LS[tgt_key] - lag + nodes[node_key]["duration"])
            elif dtype == "FF":
                candidates.append(LF[tgt_key] - lag)
            else:  # SF
                candidates.append(LF[tgt_key] - lag + nodes[node_key]["duration"])
        LF[node_key] = min(candidates)
        LS[node_key] = LF[node_key] - nodes[node_key]["duration"]

    free_float = {}
    for node_key in nodes:
        fs_succ_es = [ES[tgt_key] - (e["lag_days"] or 0) for tgt_key, e in adjacency[node_key] if e["dependency_type"] == "FS"]
        if fs_succ_es:
            free_float[node_key] = min(fs_succ_es) - EF[node_key]
        else:
            free_float[node_key] = LS[node_key] - ES[node_key]

    result_nodes = []
    for k in order:
        n = nodes[k]
        total_float = LS[k] - ES[k]
        is_critical = total_float <= 0
        next_critical = None
        if is_critical:
            for tgt_key, e in adjacency[k]:
                if (LS[tgt_key] - ES[tgt_key]) <= 0:
                    next_critical = {"kind": tgt_key[0], "id": tgt_key[1], "title": nodes[tgt_key]["title"]}
                    break
        reason = "Резерв времени равен нулю — любая задержка этого объекта немедленно сдвигает срок проекта." if is_critical else None
        result_nodes.append({
            "kind": n["kind"], "id": n["id"], "title": n["title"], "status": n.get("status"),
            "early_start": (day0 + datetime.timedelta(days=ES[k])).isoformat(),
            "early_finish": (day0 + datetime.timedelta(days=EF[k])).isoformat(),
            "late_start": (day0 + datetime.timedelta(days=LS[k])).isoformat(),
            "late_finish": (day0 + datetime.timedelta(days=LF[k])).isoformat(),
            "total_float_days": total_float, "free_float_days": free_float[k],
            "is_critical": is_critical, "criticality_reason": reason, "next_critical": next_critical,
        })
    return result_nodes, project_duration, None, isolated_keys


def _cpm_nodes_from_current(g: dict):
    """Строит узлы CPM из текущего состояния графа проекта (актуальные
    plan_*/due_at даты). Возвращает (nodes, incomplete_objects)."""
    nodes = {}
    incomplete = []
    for s in g["stages"]:
        if s["plan_start"] and s["plan_end"]:
            nodes[("stage", s["id"])] = {
                "kind": "stage", "id": s["id"], "title": s["title"],
                "duration": max(0, (s["plan_end"] - s["plan_start"]).days),
                "anchor_start": s["plan_start"], "status": s["status"],
            }
        else:
            incomplete.append({"kind": "stage", "id": s["id"], "title": s["title"], "reason": "нет плановых дат начала/окончания этапа"})
    for t in g["tasks"]:
        if t["due_at"]:
            nodes[("task", t["id"])] = {
                "kind": "task", "id": t["id"], "title": t["title"], "duration": 0,
                "anchor_start": t["due_at"], "status": t["status"], "responsible_name": t.get("responsible_name"),
            }
        else:
            incomplete.append({"kind": "task", "id": t["id"], "title": t["title"], "reason": "нет срока выполнения (due_at) — задача без даты не может участвовать в расчёте"})
    for m in g["milestones"]:
        if m.get("is_conditional_scenario"):
            incomplete.append({"kind": "milestone", "id": m["id"], "title": m["title"],
                                "reason": "условный сценарий (требует решения руководителя) — не включается в расчёт критического пути до подтверждения"})
        elif m["plan_date"]:
            nodes[("milestone", m["id"])] = {
                "kind": "milestone", "id": m["id"], "title": m["title"], "duration": 0,
                "anchor_start": m["plan_date"], "status": m["status"], "responsible_name": m.get("responsible_name"),
            }
        else:
            incomplete.append({"kind": "milestone", "id": m["id"], "title": m["title"], "reason": "нет плановой даты вехи"})
    return nodes, incomplete


def critical_path(cur, pid: int):
    """Метод критического пути (Critical Path Method) для одного проекта
    на ТЕКУЩИХ данных. Режим расчёта — календарные дни (лаг с
    lag_kind='working' применяется как календарный с явным предупреждением:
    рабочего календаря с праздниками в системе пока нет, смешивать режимы
    незаметно нельзя).

    Узлы без достаточных дат исключаются из графа расчёта и перечисляются
    в incomplete_objects — путь не выдумывается поверх отсутствующих данных.
    При обнаружении цикла расчёт блокируется, цепочка возвращается отдельно."""
    p = fetch_one(cur, "exec_project", pid)
    if not p:
        return None, "Проект не найден"

    g = _build_schedule_graph(cur, pid)
    warnings = []
    nodes, incomplete = _cpm_nodes_from_current(g)

    working_lag_seen = any(e["lag_kind"] == "working" for e in g["edges"])
    if working_lag_seen:
        warnings.append("Часть зависимостей задана в рабочих днях, но рабочий календарь (выходные, праздники) в системе пока не реализован — такой лаг применён как календарные дни, чтобы не смешивать режимы незаметно.")
    if incomplete:
        warnings.append(f"{len(incomplete)} объект(ов) исключены из расчёта из-за отсутствующих дат — см. incomplete_objects.")

    if len(nodes) < 2 or not [e for e in g["edges"] if (e["src_kind"], e["src_id"]) in nodes and (e["tgt_kind"], e["tgt_id"]) in nodes]:
        return {
            "project": {"id": p["id"], "title": p["title"]},
            "computable": False,
            "warnings": warnings + ["Недостаточно данных для расчёта критического пути: нужно минимум два объекта с датами, связанных зависимостью."],
            "incomplete_objects": incomplete,
            "cycle": None, "nodes": [], "project_duration_days": None,
        }, None

    result_nodes, project_duration, cycle_chain, isolated_keys = _cpm_compute(nodes, g["edges"])

    isolated_incomplete = [
        {"kind": k[0], "id": k[1], "title": nodes[k]["title"],
         "reason": "не связан ни одной зависимостью с остальным планом — критический путь для одиночного объекта не определён"}
        for k in isolated_keys
    ]
    incomplete = incomplete + isolated_incomplete
    if isolated_incomplete:
        warnings.append(f"{len(isolated_incomplete)} объект(ов) не связаны зависимостями с остальным планом и исключены из расчёта критического пути.")

    if cycle_chain:
        return {
            "project": {"id": p["id"], "title": p["title"]},
            "computable": False, "warnings": warnings, "incomplete_objects": incomplete,
            "cycle": {"chain": cycle_chain}, "nodes": [], "project_duration_days": None,
        }, None

    if not result_nodes:
        return {
            "project": {"id": p["id"], "title": p["title"]},
            "computable": False,
            "warnings": warnings + ["Недостаточно связанных зависимостями объектов с датами для расчёта критического пути."],
            "incomplete_objects": incomplete,
            "cycle": None, "nodes": [], "project_duration_days": None,
        }, None

    return {
        "project": {"id": p["id"], "title": p["title"]},
        "computable": True, "warnings": warnings, "incomplete_objects": incomplete,
        "cycle": None, "nodes": result_nodes, "project_duration_days": project_duration,
    }, None


def _find_cycle_chain(remaining, adjacency):
    """DFS для восстановления одной конкретной цикличной цепочки среди
    узлов, не попавших в топологический порядок (то есть входящих в цикл
    или зависящих от цикла)."""
    color = {k: 0 for k in remaining}  # 0=white,1=gray,2=black
    path = []

    def dfs(node):
        color[node] = 1
        path.append(node)
        for nxt, _ in adjacency.get(node, []):
            if nxt not in remaining:
                continue
            if color.get(nxt) == 1:
                idx = path.index(nxt)
                return path[idx:] + [nxt]
            if color.get(nxt, 0) == 0:
                found = dfs(nxt)
                if found:
                    return found
        path.pop()
        color[node] = 2
        return None

    for start in remaining:
        if color[start] == 0:
            found = dfs(start)
            if found:
                return found
    return list(remaining)[:2]


# ---------- МЕЖПРОЕКТНЫЕ ЗАВИСИМОСТИ (СВОДКА ДЛЯ КАРТОЧКИ ПРОЕКТА) ----------

def project_external_dependencies(cur, pid: int):
    """Что блокирует этот проект и какие проекты блокирует он — сводка по
    межпроектным зависимостям с внешней датой, ответственным владельцем и
    признаком текущего нарушения."""
    g = _build_schedule_graph(cur, pid)
    blocking_in = []   # внешний объект -> блокирует объект этого проекта
    blocking_out = []  # объект этого проекта -> блокирует внешний объект

    local_nodes = {}
    for s in g["stages"]:
        local_nodes[("stage", s["id"])] = {"title": s["title"], "status": s["status"], "plan_end": s["plan_end"]}
    for t in g["tasks"]:
        local_nodes[("task", t["id"])] = {"title": t["title"], "status": t["status"], "plan_end": t["due_at"]}
    for m in g["milestones"]:
        local_nodes[("milestone", m["id"])] = {"title": m["title"], "status": m["status"], "plan_end": m["plan_date"]}

    for e in g["edges"]:
        src_key, tgt_key = (e["src_kind"], e["src_id"]), (e["tgt_kind"], e["tgt_id"])
        src_local, tgt_local = g["is_local"](*src_key), g["is_local"](*tgt_key)
        if src_local == tgt_local:
            continue  # не межпроектная связь
        if not src_local:
            ext = g["external_nodes"].get(src_key)
            loc = local_nodes.get(tgt_key)
            if ext and loc:
                blocking_in.append({
                    "dependency_type": e["dependency_type"], "lag_days": e["lag_days"],
                    "external_kind": ext["kind"], "external_id": ext["id"], "external_title": ext["title"],
                    "external_project_id": ext.get("project_id"),
                    "local_kind": tgt_key[0], "local_id": tgt_key[1], "local_title": loc["title"],
                    "local_status": loc["status"],
                })
        else:
            ext = g["external_nodes"].get(tgt_key)
            loc = local_nodes.get(src_key)
            if ext and loc:
                blocking_out.append({
                    "dependency_type": e["dependency_type"], "lag_days": e["lag_days"],
                    "external_kind": ext["kind"], "external_id": ext["id"], "external_title": ext["title"],
                    "external_project_id": ext.get("project_id"),
                    "local_kind": src_key[0], "local_id": src_key[1], "local_title": loc["title"],
                    "local_status": loc["status"],
                })

    return {"blocking_in": blocking_in, "blocking_out": blocking_out}


def get_baseline(cur, bid: int):
    cur.execute(f"SELECT * FROM {SCHEMA}.exec_schedule_baseline WHERE id = %s", (bid,))
    r = rows(cur)
    if not r:
        return None
    item = r[0]
    payload_str = item.pop("payload_json")
    actual_hash = hashlib.sha256(payload_str.encode("utf-8")).hexdigest()
    item["payload"] = json.loads(payload_str)
    item["integrity_ok"] = item.get("payload_sha256") == actual_hash
    return item


def handler(event: dict, context) -> dict:
    """Поручения и портфель: проекты/мероприятия, задачи, результаты, эффекты,
    гибкие связи (exec_link) и сводный дашборд руководителя. AI не используется."""
    if event.get("httpMethod") == "OPTIONS":
        return cors({})

    headers = event.get("headers") or {}
    conn = psycopg2.connect(DB)
    try:
        user = authenticate(conn, headers)
        if not user:
            return cors({"ok": False, "error": {"message": "Не авторизован"}}, 401)

        qs = event.get("queryStringParameters") or {}
        action = qs.get("action", "dashboard")
        body = json.loads(event["body"]) if event.get("body") else {}
        cur = conn.cursor()

        if action == "dashboard":
            return cors({"ok": True, "data": dashboard(cur)})

        if action == "projects":
            return cors({"ok": True, "data": {"items": list_projects(
                cur, qs.get("include_archived") == "1", qs.get("include_test_data") == "1")}})

        if action == "project":
            pid = as_int(qs.get("id"))
            item = get_project(cur, pid) if pid else None
            if not item:
                return cors({"ok": False, "error": {"message": "Проект не найден"}}, 404)
            return cors({"ok": True, "data": item})

        if action == "save_project":
            pid = save_project(cur, body, user["email"])
            conn.commit()
            return cors({"ok": True, "data": {"id": pid}})

        if action == "archive_project":
            pid = archive_project(cur, as_int(body.get("id")), user["email"])
            conn.commit()
            if not pid:
                return cors({"ok": False, "error": {"message": "Проект не найден или уже архивирован"}}, 404)
            return cors({"ok": True, "data": {"id": pid}})

        if action == "tasks":
            pid = as_int(qs.get("project_id"))
            return cors({"ok": True, "data": {"items": list_tasks(
                cur, pid, qs.get("include_archived") == "1", qs.get("include_test_data") == "1")}})

        if action == "save_task":
            tid = save_task(cur, body, user["email"])
            conn.commit()
            return cors({"ok": True, "data": {"id": tid}})

        if action == "archive_task":
            tid = archive_task(cur, as_int(body.get("id")), user["email"])
            conn.commit()
            if not tid:
                return cors({"ok": False, "error": {"message": "Задача не найдена или уже архивирована"}}, 404)
            return cors({"ok": True, "data": {"id": tid}})

        if action == "save_stage":
            sid, err = save_stage(cur, body, user["email"])
            if err:
                return cors({"ok": False, "error": {"message": err}}, 400)
            conn.commit()
            return cors({"ok": True, "data": {"id": sid}})

        if action == "results":
            pid = as_int(qs.get("project_id"))
            return cors({"ok": True, "data": {"items": list_results(
                cur, pid, qs.get("include_archived") == "1", qs.get("include_test_data") == "1")}})

        if action == "save_result":
            rid = save_result(cur, body, user["email"])
            conn.commit()
            return cors({"ok": True, "data": {"id": rid}})

        if action == "archive_result":
            rid = archive_result(cur, as_int(body.get("id")), user["email"])
            conn.commit()
            if not rid:
                return cors({"ok": False, "error": {"message": "Результат не найден или уже архивирован"}}, 404)
            return cors({"ok": True, "data": {"id": rid}})

        if action == "effects":
            rid = as_int(qs.get("result_id"))
            return cors({"ok": True, "data": {"items": list_effects(
                cur, rid, qs.get("include_archived") == "1", qs.get("include_test_data") == "1")}})

        if action == "save_effect":
            eid, err = save_effect(cur, body, user["email"])
            if err:
                return cors({"ok": False, "error": {"message": err}}, 400)
            conn.commit()
            return cors({"ok": True, "data": {"id": eid}})

        if action == "archive_effect":
            eid = archive_effect(cur, as_int(body.get("id")), user["email"])
            conn.commit()
            if not eid:
                return cors({"ok": False, "error": {"message": "Эффект не найден или уже архивирован"}}, 404)
            return cors({"ok": True, "data": {"id": eid}})

        if action == "save_link":
            lid, err = save_link(cur, body, user["email"])
            if err:
                return cors({"ok": False, "error": {"message": err}}, 400)
            conn.commit()
            return cors({"ok": True, "data": {"id": lid}})

        if action == "archive_link":
            lid = archive_link(cur, as_int(body.get("id")), user["email"])
            conn.commit()
            if not lid:
                return cors({"ok": False, "error": {"message": "Связь не найдена или уже удалена"}}, 404)
            return cors({"ok": True, "data": {"id": lid}})

        if action == "links":
            kind, oid = qs.get("kind"), as_int(qs.get("id"))
            if not kind or not oid:
                return cors({"ok": False, "error": {"message": "Не указан объект"}}, 400)
            return cors({"ok": True, "data": {"items": list_links(cur, kind, oid)}})

        if action == "history":
            kind, oid = qs.get("kind"), as_int(qs.get("id"))
            if not kind or not oid:
                return cors({"ok": False, "error": {"message": "Не указан объект"}}, 400)
            return cors({"ok": True, "data": {"items": object_history(cur, kind, oid)}})

        if action == "create_snapshot":
            snap = create_snapshot(cur, body, user["email"])
            conn.commit()
            return cors({"ok": True, "data": snap})

        if action == "snapshots":
            return cors({"ok": True, "data": {"items": list_snapshots(cur, qs.get("include_test_data") == "1")}})

        if action == "snapshot":
            sid = as_int(qs.get("id"))
            snap = get_snapshot(cur, sid) if sid else None
            if not snap:
                return cors({"ok": False, "error": {"message": "Снимок не найден"}}, 404)
            return cors({"ok": True, "data": snap})

        # ============ ГАНТ ПРОЕКТА (РЕЖИМ ПРОСМОТРА) ============

        if action == "project_gantt":
            gpid = as_int(qs.get("id"))
            item = project_gantt(cur, gpid) if gpid else None
            if not item:
                return cors({"ok": False, "error": {"message": "Проект не найден"}}, 404)
            return cors({"ok": True, "data": item})

        # ============ КАРТА ЗАВИСИМОСТЕЙ И КРИТИЧЕСКИЙ ПУТЬ ============

        if action == "dependency_graph":
            gpid = as_int(qs.get("id"))
            item = dependency_graph(cur, gpid) if gpid else None
            if not item:
                return cors({"ok": False, "error": {"message": "Проект не найден"}}, 404)
            return cors({"ok": True, "data": item})

        if action == "critical_path":
            gpid = as_int(qs.get("id"))
            if not gpid:
                return cors({"ok": False, "error": {"message": "Не указан проект"}}, 400)
            result, err = critical_path(cur, gpid)
            if err:
                return cors({"ok": False, "error": {"message": err}}, 404)
            return cors({"ok": True, "data": result})

        if action == "project_external_dependencies":
            gpid = as_int(qs.get("id"))
            if not gpid:
                return cors({"ok": False, "error": {"message": "Не указан проект"}}, 400)
            return cors({"ok": True, "data": project_external_dependencies(cur, gpid)})

        # ============ ДОРОЖНАЯ КАРТА И ШКАЛА ВЕХ ============

        if action == "roadmap":
            filters = {
                "initiative_id": as_int(qs.get("initiative_id")),
                "project_kind": qs.get("project_kind"),
                "status": qs.get("status"),
                "priority": qs.get("priority"),
                "owner_person_id": as_int(qs.get("owner_person_id")),
                "overdue_only": qs.get("overdue_only") == "1",
                "critical_risk_only": qs.get("critical_risk_only") == "1",
                "resource_gap_only": qs.get("resource_gap_only") == "1",
                "overbudget_only": qs.get("overbudget_only") == "1",
                "cross_dependency_only": qs.get("cross_dependency_only") == "1",
                "shifted_only": qs.get("shifted_only") == "1",
                "min_shift_days": as_int(qs.get("min_shift_days")),
                "no_baseline_only": qs.get("no_baseline_only") == "1",
                "no_forecast_only": qs.get("no_forecast_only") == "1",
                "no_fact_only": qs.get("no_fact_only") == "1",
                "integrity_violated_only": qs.get("integrity_violated_only") == "1",
            }
            data = roadmap_data(cur, qs.get("date_from"), qs.get("date_to"), filters)
            return cors({"ok": True, "data": data})

        if action == "milestones_timeline":
            filters = {
                "project_id": as_int(qs.get("project_id")),
                "initiative_id": as_int(qs.get("initiative_id")),
                "status": qs.get("status"),
                "overdue_only": qs.get("overdue_only") == "1",
            }
            items = milestones_timeline(cur, qs.get("date_from"), qs.get("date_to"), filters)
            return cors({"ok": True, "data": {"items": items}})

        # ============ ЗАВИСИМОСТИ РАСПИСАНИЯ ============

        if action == "save_dependency":
            did, err = save_dependency(cur, body, user["email"])
            if err:
                return cors({"ok": False, "error": {"message": err}}, 400)
            conn.commit()
            return cors({"ok": True, "data": {"id": did}})

        if action == "archive_dependency":
            did = archive_dependency(cur, as_int(body.get("id")), user["email"])
            conn.commit()
            if not did:
                return cors({"ok": False, "error": {"message": "Зависимость не найдена или уже архивирована"}}, 404)
            return cors({"ok": True, "data": {"id": did}})

        if action == "dependencies":
            items = list_dependencies(cur, qs.get("kind"), as_int(qs.get("id")))
            return cors({"ok": True, "data": {"items": items}})

        # ============ BASELINE (ВЕРСИИ РАСПИСАНИЯ) ============

        if action == "create_baseline":
            result, err = create_baseline(cur, body, user["email"])
            if err:
                return cors({"ok": False, "error": {"message": err}}, 400)
            conn.commit()
            return cors({"ok": True, "data": result})

        if action == "baselines":
            items = list_baselines(cur, qs.get("scope_kind"), as_int(qs.get("scope_id")))
            return cors({"ok": True, "data": {"items": items}})

        if action == "baseline":
            bid = as_int(qs.get("id"))
            item = get_baseline(cur, bid) if bid else None
            if not item:
                return cors({"ok": False, "error": {"message": "Baseline не найден"}}, 404)
            return cors({"ok": True, "data": item})

        if action == "set_active_baseline":
            bid = as_int(body.get("id"))
            if not bid:
                return cors({"ok": False, "error": {"message": "Не указан baseline"}}, 400)
            result, err = set_active_baseline(cur, bid, user["email"])
            if err:
                return cors({"ok": False, "error": {"message": err}}, 404)
            conn.commit()
            return cors({"ok": True, "data": {"id": result}})

        if action == "compare_baselines":
            bid_a, bid_b = as_int(qs.get("a")), as_int(qs.get("b"))
            if not bid_a or not bid_b:
                return cors({"ok": False, "error": {"message": "Нужно указать обе версии для сравнения (a и b)"}}, 400)
            result, err = compare_baseline_versions(cur, bid_a, bid_b)
            if err:
                return cors({"ok": False, "error": {"message": err}}, 404)
            return cors({"ok": True, "data": result})

        # ============ СРАВНЕНИЕ РАСПИСАНИЙ ============

        if action == "schedule_comparison":
            gpid = as_int(qs.get("id"))
            if not gpid:
                return cors({"ok": False, "error": {"message": "Не указан проект"}}, 400)
            result, err = schedule_comparison(cur, gpid, as_int(qs.get("baseline_id")))
            if err:
                return cors({"ok": False, "error": {"message": err}}, 400)
            return cors({"ok": True, "data": result})

        if action == "schedule_change_log":
            gpid = as_int(qs.get("id"))
            if not gpid:
                return cors({"ok": False, "error": {"message": "Не указан проект"}}, 400)
            items = schedule_change_log(cur, gpid)
            return cors({"ok": True, "data": {"items": items}})

        return cors({"ok": False, "error": {"message": "Неизвестное действие"}}, 400)
    finally:
        conn.close()