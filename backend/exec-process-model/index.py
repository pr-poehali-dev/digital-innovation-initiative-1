"""
Контур «Процессное управление» — единый раздел построения процессной модели
Блока ВК (функции подразделений, архитектура процессов, паспорт процесса,
справочники, детерминированные проверки).

Это НЕ AI-модуль. Ни один action не вызывает YandexGPT/Yandex Vision и не
передаёт содержимое документов во внешний AI-контур. Все проверки —
детерминированные (точные сравнения, нормализация строк, difflib для похожих
формулировок — без обращения к какой-либо генеративной модели). Функции
вводятся и подтверждаются вручную; source_kind='ai_suggested' зарезервирован
архитектурно на будущее и сейчас нигде не устанавливается.

Существующий этап 1 «Границы Блока ВК» (exec_process_model_scope и его
сателлиты) обслуживается отдельной функцией backend/exec-process-scope и
здесь НЕ дублируется — этот backend только читает exec_process_model_scope
как корень модели.

Сущности:
  exec_function                — реестр функций подразделений
  exec_process_node            — иерархия направление/процесс/подпроцесс/операция
  exec_function_process_link   — связь функций с узлами архитектуры
  exec_process_passport        — паспорт процесса
  exec_process_participant     — участники и роли процесса
  exec_info_system             — справочник информационных систем
  exec_process_system_link     — связь процесса с системами
  exec_process_document_link   — связь процесса с документами (exec_source_document)
  exec_process_clarification_note — заметки «требует уточнения» помощника

Формат ответа: {"ok": true, "data": {...}} / {"ok": false, "error": {"message": "..."}}
"""
import difflib
import json
import os
import re

import psycopg2

DB = os.environ["DATABASE_URL"]
_s = os.environ.get("MAIN_DB_SCHEMA", "").strip()
SCHEMA = _s if _s else "t_p61016064_digital_innovation_i"

PROCESS_LEVELS = {
    "direction": "Направление",
    "process": "Процесс",
    "sub" + "process": "Подпроцесс",
    "operation": "Операция",
}
MODEL_STATUSES = {
    "draft": "Черновик",
    "in_review": "На проверке",
    "confirmed": "Подтверждён",
    "published": "Опубликован",
    "archived": "Архив",
}
PARTICIPATION_KINDS = {
    "owner": "Владелец",
    "executor": "Исполнитель",
    "reviewer": "Проверяющий",
    "consumer": "Потребитель",
    "supplier": "Поставщик",
}
CONFIRMATION_STATUSES = {"user_draft": "Черновик", "confirmed": "Подтверждено"}


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
    import hashlib
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


def rows(cur):
    cols = [d[0] for d in cur.description]
    return [dict(zip(cols, r)) for r in cur.fetchall()]


def nz(v):
    if v is None:
        return None
    if isinstance(v, str) and not v.strip():
        return None
    return v


def as_int(v):
    v = nz(v)
    try:
        return int(v) if v is not None else None
    except (TypeError, ValueError):
        return None


def as_bool(v, default=False):
    if v is None:
        return default
    if isinstance(v, bool):
        return v
    return str(v).strip().lower() in ("1", "true", "yes", "on")


def log_change(cur, actor, entity, eid, action, before=None, after=None, reason=None):
    cur.execute(
        f"INSERT INTO {SCHEMA}.exec_audit_log "
        f"(entity_type, entity_id, action, actor, before_json, after_json, reason) "
        f"VALUES (%s,%s,%s,%s,%s,%s,%s)",
        (entity, eid, action, actor,
         json.dumps(before, ensure_ascii=False, default=str) if before is not None else None,
         json.dumps(after, ensure_ascii=False, default=str) if after is not None else None,
         reason),
    )


def normalize_text(s: str) -> str:
    s = (s or "").lower().strip()
    s = re.sub(r"[^\w\s]", " ", s, flags=re.UNICODE)
    s = re.sub(r"\s+", " ", s)
    return s.strip()


def similarity(a: str, b: str) -> float:
    """Чисто детерминированное сравнение строк (difflib, без ИИ)."""
    return difflib.SequenceMatcher(None, normalize_text(a), normalize_text(b)).ratio()


# ── Справочники / обзор ──────────────────────────────────────────────────────

def default_scope_id(cur):
    cur.execute(f"SELECT id FROM {SCHEMA}.exec_process_model_scope ORDER BY id LIMIT 1")
    r = cur.fetchone()
    return r[0] if r else None


def get_overview(cur, scope_id: int):
    cur.execute(f"SELECT * FROM {SCHEMA}.exec_process_model_scope WHERE id = %s", (scope_id,))
    scope_rows = rows(cur)
    scope = scope_rows[0] if scope_rows else None

    cur.execute(f"""
        SELECT su.org_unit_id, u.code, u.name, u.short_name, su.decision, su.confirmation_status
        FROM {SCHEMA}.exec_process_model_scope_unit su
        JOIN {SCHEMA}.org_units u ON u.id = su.org_unit_id
        WHERE su.scope_id = %s
        ORDER BY su.is_structural_child DESC, u.code
    """, (scope_id,))
    units = rows(cur)

    cur.execute(f"SELECT COUNT(*) FROM {SCHEMA}.exec_function WHERE scope_id = %s AND is_test_data = false", (scope_id,))
    functions_total = cur.fetchone()[0]
    cur.execute(
        f"SELECT COUNT(*) FROM {SCHEMA}.exec_function WHERE scope_id = %s AND is_test_data = false AND confirmation_status = 'confirmed'",
        (scope_id,))
    functions_confirmed = cur.fetchone()[0]

    cur.execute(f"""
        SELECT level, COUNT(*) FROM {SCHEMA}.exec_process_node
        WHERE scope_id = %s AND is_test_data = false GROUP BY level
    """, (scope_id,))
    by_level = {r[0]: r[1] for r in cur.fetchall()}
    processes_total = sum(by_level.values())

    cur.execute(f"""
        SELECT COUNT(*) FROM {SCHEMA}.exec_process_node n
        JOIN {SCHEMA}.exec_process_passport p ON p.process_node_id = n.id
        WHERE n.scope_id = %s AND n.is_test_data = false AND p.goal IS NOT NULL AND p.goal <> ''
    """, (scope_id,))
    passports_filled = cur.fetchone()[0]

    cur.execute(f"""
        SELECT d.variant, COUNT(*) FROM {SCHEMA}.exec_process_diagram d
        JOIN {SCHEMA}.exec_process_node n ON n.id = d.process_node_id
        WHERE n.scope_id = %s GROUP BY d.variant
    """, (scope_id,))
    diagrams_by_variant = {r[0]: r[1] for r in cur.fetchall()}

    cur.execute(f"""
        SELECT COUNT(*) FROM {SCHEMA}.exec_process_risk r
        JOIN {SCHEMA}.exec_process_node n ON n.id = r.process_node_id
        WHERE n.scope_id = %s AND r.is_test_data = false
          AND NOT EXISTS (SELECT 1 FROM {SCHEMA}.exec_process_control c WHERE c.risk_id = r.id)
    """, (scope_id,))
    risks_without_controls = cur.fetchone()[0]

    cur.execute(f"""
        SELECT COUNT(*) FROM {SCHEMA}.exec_process_node
        WHERE scope_id = %s AND is_test_data = false AND level = 'process' AND owner_person_id IS NULL
    """, (scope_id,))
    processes_without_owner = cur.fetchone()[0]

    cur.execute(f"""
        SELECT COUNT(*) FROM {SCHEMA}.exec_source_document
        WHERE scope_id = %s AND is_test_data = false AND state = 'active' AND confirmed_actual_at IS NULL
    """, (scope_id,))
    docs_need_confirmation = cur.fetchone()[0]

    cur.execute(f"""
        SELECT COUNT(*) FROM {SCHEMA}.exec_source_document
        WHERE scope_id = %s AND is_test_data = false AND confirmed_actual_at IS NOT NULL
    """, (scope_id,))
    docs_confirmed = cur.fetchone()[0]

    cur.execute(
        f"SELECT COUNT(*) FROM {SCHEMA}.exec_process_clarification_note WHERE scope_id = %s AND status = 'open'",
        (scope_id,))
    open_questions = cur.fetchone()[0]

    scope_confirmed = bool(scope and scope.get("model_status") == "confirmed")
    stages = [
        ("boundaries", "Границы Блока ВК", scope_confirmed),
        ("documents", "Нормативные документы", docs_confirmed > 0),
        ("functions", "Функции подразделений", functions_confirmed > 0),
        ("architecture", "Архитектура процессов", processes_total > 0),
        ("passports", "Паспорта процессов", passports_filled > 0),
        ("as_is", "Схемы AS-IS", diagrams_by_variant.get("as_is", 0) > 0),
        ("risks", "Риски и контроли", risks_without_controls == 0 and diagrams_by_variant.get("as_is", 0) > 0),
        ("to_be", "Схемы TO-BE", diagrams_by_variant.get("to_be", 0) > 0),
        ("publish", "Проверка и публикация", False),
    ]
    done_count = sum(1 for _, _, ok in stages if ok)
    progress_pct = round(done_count * 100 / len(stages)) if stages else 0

    next_step = None
    for code, label, ok in stages:
        if not ok:
            next_step = {"code": code, "label": label}
            break

    return {
        "scope": scope,
        "units": units,
        "metrics": {
            "functions_total": functions_total,
            "functions_confirmed": functions_confirmed,
            "processes_total": processes_total,
            "processes_by_level": by_level,
            "passports_filled": passports_filled,
            "diagrams_as_is": diagrams_by_variant.get("as_is", 0),
            "diagrams_to_be": diagrams_by_variant.get("to_be", 0),
            "risks_without_controls": risks_without_controls,
            "processes_without_owner": processes_without_owner,
            "docs_need_confirmation": docs_need_confirmation,
            "open_questions": open_questions,
        },
        "stages": [{"code": c, "label": l, "done": ok} for c, l, ok in stages],
        "progress_pct": progress_pct,
        "next_step": next_step,
    }


# ── Функции подразделений ────────────────────────────────────────────────────

def list_functions(cur, scope_id: int):
    cur.execute(f"""
        SELECT f.*, u.name AS org_unit_name, u.code AS org_unit_code,
               (SELECT COUNT(*) FROM {SCHEMA}.exec_function_process_link l WHERE l.function_id = f.id) AS process_links_count,
               d.title AS source_document_title
        FROM {SCHEMA}.exec_function f
        LEFT JOIN {SCHEMA}.org_units u ON u.id = f.org_unit_id
        LEFT JOIN {SCHEMA}.exec_source_document d ON d.id = f.source_document_id
        WHERE f.scope_id = %s AND f.is_test_data = false
        ORDER BY u.code NULLS LAST, f.code NULLS LAST, f.title
    """, (scope_id,))
    return rows(cur)


def function_checks(cur, scope_id: int):
    """Детерминированные проверки реестра функций (без ИИ):
    дубли, отсутствие подразделения/основания/связей с процессами, похожие
    формулировки, возможный разрыв ответственности (похожая функция в разных
    подразделениях без явной связи друг с другом)."""
    funcs = list_functions(cur, scope_id)
    issues = []

    seen_exact = {}
    for f in funcs:
        key = normalize_text(f["title"])
        if key in seen_exact:
            issues.append({
                "code": "duplicate", "level": "warning",
                "title": f'Дублирующиеся функции: «{f["title"]}»',
                "detail": f'Совпадает с функцией #{seen_exact[key]}',
                "function_ids": [seen_exact[key], f["id"]],
            })
        else:
            seen_exact[key] = f["id"]

    for f in funcs:
        if not f.get("org_unit_id"):
            issues.append({
                "code": "no_org_unit", "level": "warning",
                "title": f'Функция без подразделения: «{f["title"]}»',
                "detail": "Укажите подразделение, которое выполняет эту функцию",
                "function_ids": [f["id"]],
            })
        if not nz(f.get("normative_basis")):
            issues.append({
                "code": "no_basis", "level": "warning",
                "title": f'Функция без нормативного основания: «{f["title"]}»',
                "detail": "Укажите документ или пункт положения, откуда взята функция",
                "function_ids": [f["id"]],
            })
        if not f.get("process_links_count"):
            issues.append({
                "code": "no_process_link", "level": "warning",
                "title": f'Функция не связана ни с одним процессом: «{f["title"]}»',
                "detail": "Свяжите функцию с процессом в архитектуре процессов",
                "function_ids": [f["id"]],
            })

    for i in range(len(funcs)):
        for j in range(i + 1, len(funcs)):
            a, b = funcs[i], funcs[j]
            if a["id"] in seen_exact.values() and normalize_text(a["title"]) == normalize_text(b["title"]):
                continue
            ratio = similarity(a["title"], b["title"])
            if 0.72 <= ratio < 0.999:
                issues.append({
                    "code": "similar_wording", "level": "warning",
                    "title": "Похожие формулировки функций",
                    "detail": f'«{a["title"]}» ({a.get("org_unit_name") or "без подразделения"}) '
                              f'и «{b["title"]}» ({b.get("org_unit_name") or "без подразделения"}) — '
                              f'похожи на {round(ratio * 100)}%',
                    "function_ids": [a["id"], b["id"]],
                })
                if a.get("org_unit_id") and b.get("org_unit_id") and a["org_unit_id"] != b["org_unit_id"]:
                    issues.append({
                        "code": "responsibility_gap", "level": "warning",
                        "title": "Возможный разрыв ответственности",
                        "detail": f'Похожие функции числятся за разными подразделениями '
                                  f'({a.get("org_unit_name")} и {b.get("org_unit_name")}) — '
                                  f'уточните, кто на самом деле отвечает',
                        "function_ids": [a["id"], b["id"]],
                    })

    return issues


def save_function(cur, body: dict, actor: str):
    fid = as_int(body.get("id"))
    fields = ["code", "title", "org_unit_id", "responsible_role", "normative_basis",
              "source_document_id", "comment"]
    vals = {}
    for f in fields:
        if f in body:
            vals[f] = as_int(body[f]) if f in ("org_unit_id", "source_document_id") else nz(body.get(f))
    if not fid and not nz(vals.get("title")):
        return None, "Укажите формулировку функции"

    if fid:
        cur.execute(f"SELECT * FROM {SCHEMA}.exec_function WHERE id = %s", (fid,))
        before = rows(cur)
        if not before:
            return None, "Функция не найдена"
        if not vals:
            return fid, None
        sets = ", ".join(f"{k} = %s" for k in vals)
        cur.execute(
            f"UPDATE {SCHEMA}.exec_function SET {sets}, updated_by = %s, updated_at = now() WHERE id = %s",
            list(vals.values()) + [actor, fid],
        )
        log_change(cur, actor, "process_function", fid, "update", before=before[0], after=vals)
        return fid, None

    scope_id = as_int(body.get("scope_id"))
    if not scope_id:
        return None, "Не указан паспорт модели"
    vals["scope_id"] = scope_id
    vals["created_by"] = actor
    vals["updated_by"] = actor
    cols = ", ".join(vals.keys())
    ph = ", ".join(["%s"] * len(vals))
    cur.execute(
        f"INSERT INTO {SCHEMA}.exec_function ({cols}) VALUES ({ph}) RETURNING id",
        list(vals.values()),
    )
    new_id = cur.fetchone()[0]
    log_change(cur, actor, "process_function", new_id, "create", after=vals)
    return new_id, None


def confirm_function(cur, body: dict, actor: str, confirm: bool):
    fid = as_int(body.get("id"))
    if not fid:
        return None, "Не указана функция"
    status = "confirmed" if confirm else "user_draft"
    cur.execute(
        f"UPDATE {SCHEMA}.exec_function SET confirmation_status = %s, updated_by = %s, updated_at = now() WHERE id = %s",
        (status, actor, fid),
    )
    log_change(cur, actor, "process_function", fid, "confirm" if confirm else "unconfirm")
    return fid, None


# ── Архитектура процессов ────────────────────────────────────────────────────

def process_tree(cur, scope_id: int):
    cur.execute(f"""
        SELECT n.*, p.display_name AS owner_name, u.name AS org_unit_name,
               (SELECT COUNT(*) FROM {SCHEMA}.exec_process_node c WHERE c.parent_id = n.id AND c.is_test_data = false) AS children_count,
               (SELECT COUNT(*) FROM {SCHEMA}.exec_function_process_link l WHERE l.process_node_id = n.id) AS function_links_count,
               EXISTS(SELECT 1 FROM {SCHEMA}.exec_process_passport pp WHERE pp.process_node_id = n.id AND pp.goal IS NOT NULL AND pp.goal <> '') AS has_passport
        FROM {SCHEMA}.exec_process_node n
        LEFT JOIN {SCHEMA}.exec_person p ON p.id = n.owner_person_id
        LEFT JOIN {SCHEMA}.org_units u ON u.id = n.responsible_org_unit_id
        WHERE n.scope_id = %s AND n.is_test_data = false
        ORDER BY n.sort_order, n.code NULLS LAST, n.name
    """, (scope_id,))
    return rows(cur)


def save_process_node(cur, body: dict, actor: str):
    nid = as_int(body.get("id"))
    fields = ["code", "name", "level", "parent_id", "owner_person_id",
              "responsible_org_unit_id", "result_description", "sort_order"]
    vals = {}
    for f in fields:
        if f in body:
            if f in ("parent_id", "owner_person_id", "responsible_org_unit_id", "sort_order"):
                vals[f] = as_int(body[f])
            else:
                vals[f] = nz(body.get(f))

    if nid:
        cur.execute(f"SELECT * FROM {SCHEMA}.exec_process_node WHERE id = %s", (nid,))
        before = rows(cur)
        if not before:
            return None, "Узел не найден"
        if before[0]["model_status"] in ("confirmed", "published"):
            return None, "Узел подтверждён/опубликован — для изменений верните черновой статус"
        if not vals:
            return nid, None
        sets = ", ".join(f"{k} = %s" for k in vals)
        cur.execute(
            f"UPDATE {SCHEMA}.exec_process_node SET {sets}, updated_by = %s, updated_at = now() WHERE id = %s",
            list(vals.values()) + [actor, nid],
        )
        log_change(cur, actor, "process_node", nid, "update", before=before[0], after=vals)
        return nid, None

    scope_id = as_int(body.get("scope_id"))
    if not scope_id:
        return None, "Не указан паспорт модели"
    if not nz(vals.get("name")):
        return None, "Укажите название"
    if vals.get("level") not in PROCESS_LEVELS:
        return None, "Некорректный уровень иерархии"
    vals["scope_id"] = scope_id
    vals["created_by"] = actor
    vals["updated_by"] = actor
    cols = ", ".join(vals.keys())
    ph = ", ".join(["%s"] * len(vals))
    cur.execute(
        f"INSERT INTO {SCHEMA}.exec_process_node ({cols}) VALUES ({ph}) RETURNING id",
        list(vals.values()),
    )
    new_id = cur.fetchone()[0]
    cur.execute(f"INSERT INTO {SCHEMA}.exec_process_passport (process_node_id) VALUES (%s)", (new_id,))
    log_change(cur, actor, "process_node", new_id, "create", after=vals)
    return new_id, None


def set_process_status(cur, body: dict, actor: str, can_confirm_role: bool):
    nid = as_int(body.get("id"))
    new_status = body.get("status")
    if not nid or new_status not in MODEL_STATUSES:
        return None, "Некорректные параметры"
    if new_status in ("confirmed", "published") and not can_confirm_role:
        return None, "Недостаточно прав для подтверждения/публикации"

    cur.execute(f"SELECT * FROM {SCHEMA}.exec_process_node WHERE id = %s", (nid,))
    before = rows(cur)
    if not before:
        return None, "Узел не найден"
    if before[0]["model_status"] == "published" and new_status != "archived" and not can_confirm_role:
        return None, "Опубликованный узел нельзя изменить без прав подтверждения"

    extra = ""
    params = [new_status]
    if new_status == "published":
        extra = ", published_at = now(), published_by = %s, version = version + 1"
        params.append(actor)
    cur.execute(
        f"UPDATE {SCHEMA}.exec_process_node SET model_status = %s{extra}, updated_by = %s, updated_at = now() WHERE id = %s",
        params + [actor, nid],
    )
    cur.execute(
        f"INSERT INTO {SCHEMA}.exec_process_version_history (entity_type, entity_id, version, status, author, comment) "
        f"VALUES ('process_node', %s, %s, %s, %s, %s)",
        (nid, before[0]["version"], new_status, actor, nz(body.get("comment"))),
    )
    log_change(cur, actor, "process_node", nid, f"status_{new_status}", before=before[0])
    return nid, None


def get_process_detail(cur, node_id: int):
    cur.execute(f"""
        SELECT n.*, p.display_name AS owner_name, u.name AS org_unit_name
        FROM {SCHEMA}.exec_process_node n
        LEFT JOIN {SCHEMA}.exec_person p ON p.id = n.owner_person_id
        LEFT JOIN {SCHEMA}.org_units u ON u.id = n.responsible_org_unit_id
        WHERE n.id = %s
    """, (node_id,))
    node_rows = rows(cur)
    if not node_rows:
        return None
    node = node_rows[0]

    cur.execute(f"SELECT * FROM {SCHEMA}.exec_process_passport WHERE process_node_id = %s", (node_id,))
    passport_rows = rows(cur)
    passport = passport_rows[0] if passport_rows else None

    cur.execute(f"""
        SELECT pp.*, per.display_name AS person_name, u.name AS org_unit_name
        FROM {SCHEMA}.exec_process_participant pp
        LEFT JOIN {SCHEMA}.exec_person per ON per.id = pp.person_id
        LEFT JOIN {SCHEMA}.org_units u ON u.id = pp.org_unit_id
        WHERE pp.process_node_id = %s ORDER BY pp.id
    """, (node_id,))
    participants = rows(cur)

    cur.execute(f"""
        SELECT f.id, f.code, f.title FROM {SCHEMA}.exec_function_process_link l
        JOIN {SCHEMA}.exec_function f ON f.id = l.function_id
        WHERE l.process_node_id = %s ORDER BY f.title
    """, (node_id,))
    functions = rows(cur)

    cur.execute(f"""
        SELECT s.id, s.name, s.description FROM {SCHEMA}.exec_process_system_link l
        JOIN {SCHEMA}.exec_info_system s ON s.id = l.system_id
        WHERE l.process_node_id = %s ORDER BY s.name
    """, (node_id,))
    systems = rows(cur)

    cur.execute(f"""
        SELECT d.id, d.title, d.source_type, d.state, d.confidentiality_level
        FROM {SCHEMA}.exec_process_document_link l
        JOIN {SCHEMA}.exec_source_document d ON d.id = l.document_id
        WHERE l.process_node_id = %s ORDER BY d.title
    """, (node_id,))
    documents = rows(cur)

    cur.execute(f"SELECT id, variant, title, model_status, version, updated_at FROM {SCHEMA}.exec_process_diagram WHERE process_node_id = %s ORDER BY variant, id", (node_id,))
    diagrams = rows(cur)

    cur.execute(f"""
        SELECT r.*, (SELECT COUNT(*) FROM {SCHEMA}.exec_process_control c WHERE c.risk_id = r.id) AS controls_count
        FROM {SCHEMA}.exec_process_risk r WHERE r.process_node_id = %s AND r.is_test_data = false ORDER BY r.id
    """, (node_id,))
    risks = rows(cur)

    cur.execute(f"SELECT * FROM {SCHEMA}.exec_process_metric WHERE process_node_id = %s AND is_test_data = false ORDER BY metric_kind, id", (node_id,))
    metrics = rows(cur)

    cur.execute(f"SELECT * FROM {SCHEMA}.exec_process_issue WHERE process_node_id = %s AND is_test_data = false ORDER BY id", (node_id,))
    issues = rows(cur)

    return {
        "node": node, "passport": passport, "participants": participants,
        "functions": functions, "systems": systems, "documents": documents,
        "diagrams": diagrams, "risks": risks, "metrics": metrics, "issues": issues,
    }


def save_passport(cur, body: dict, actor: str):
    node_id = as_int(body.get("process_node_id"))
    if not node_id:
        return None, "Не указан процесс"
    fields = ["goal", "boundaries_note", "trigger_event", "inputs_note",
              "outputs_note", "suppliers_note", "consumers_note"]
    vals = {f: nz(body.get(f)) for f in fields if f in body}
    if not vals:
        return node_id, None
    sets = ", ".join(f"{k} = %s" for k in vals)
    cur.execute(
        f"UPDATE {SCHEMA}.exec_process_passport SET {sets}, updated_by = %s, updated_at = now() "
        f"WHERE process_node_id = %s",
        list(vals.values()) + [actor, node_id],
    )
    log_change(cur, actor, "process_passport", node_id, "update", after=vals)
    return node_id, None


def passport_completeness(cur, node_id: int):
    detail = get_process_detail(cur, node_id)
    if not detail:
        return None
    p = detail["passport"] or {}
    ready, needs_attention = [], []

    def item(code, label, ok, hint=None):
        (ready if ok else needs_attention).append({"code": code, "label": label, "ok": ok, "detail": hint})

    item("goal", "Цель процесса сформулирована", bool(nz(p.get("goal"))),
         "Цель должна отвечать, зачем существует процесс, и быть проверяемой")
    item("boundaries", "Границы процесса описаны", bool(nz(p.get("boundaries_note"))))
    item("trigger", "Запускающее событие указано", bool(nz(p.get("trigger_event"))))
    item("inputs", "Входы описаны", bool(nz(p.get("inputs_note"))))
    item("outputs", "Выходы описаны", bool(nz(p.get("outputs_note"))))
    item("owner", "Назначен владелец процесса", bool(detail["node"].get("owner_person_id")))
    item("participants", "Указаны участники и роли", len(detail["participants"]) > 0)
    item("functions", "Процесс связан хотя бы с одной функцией", len(detail["functions"]) > 0)
    item("as_is", "Есть схема AS-IS", any(d["variant"] == "as_is" for d in detail["diagrams"]))
    item("risks", "Есть хотя бы один риск с контролем",
         any(r.get("controls_count") for r in detail["risks"]) if detail["risks"] else False,
         "На этом шаге не обязательно, но рекомендуется" if not detail["risks"] else None)
    item("metrics", "Есть хотя бы один показатель", len(detail["metrics"]) > 0,
         "Рекомендуется, не обязательно для черновика")

    blocking = {"goal", "boundaries", "trigger", "inputs", "outputs", "owner"}
    can_confirm = all(i["ok"] for i in (ready + needs_attention) if i["code"] in blocking)
    return {"ready": ready, "needs_attention": needs_attention, "can_confirm": can_confirm}


# ── Участники, системы, документы, связи с функциями ────────────────────────

def save_participant(cur, body: dict, actor: str):
    node_id = as_int(body.get("process_node_id"))
    role_title = nz(body.get("role_title"))
    if not node_id or not role_title:
        return None, "Укажите роль участника"
    cur.execute(
        f"INSERT INTO {SCHEMA}.exec_process_participant "
        f"(process_node_id, role_title, person_id, org_unit_id, participation_kind) "
        f"VALUES (%s,%s,%s,%s,%s) RETURNING id",
        (node_id, role_title, as_int(body.get("person_id")), as_int(body.get("org_unit_id")),
         body.get("participation_kind") or "executor"),
    )
    new_id = cur.fetchone()[0]
    log_change(cur, actor, "process_participant", new_id, "create", after=body)
    return new_id, None


def remove_participant(cur, body: dict, actor: str):
    pid = as_int(body.get("id"))
    if not pid:
        return None, "Не указан участник"
    cur.execute(f"DELETE FROM {SCHEMA}.exec_process_participant WHERE id = %s", (pid,))
    log_change(cur, actor, "process_participant", pid, "delete")
    return pid, None


def list_systems(cur):
    cur.execute(f"SELECT * FROM {SCHEMA}.exec_info_system WHERE is_test_data = false ORDER BY name")
    return rows(cur)


def create_system(cur, body: dict, actor: str):
    name = nz(body.get("name"))
    if not name:
        return None, "Укажите название системы"
    cur.execute(
        f"INSERT INTO {SCHEMA}.exec_info_system (name, description, created_by) VALUES (%s,%s,%s) RETURNING id",
        (name, nz(body.get("description")), actor),
    )
    new_id = cur.fetchone()[0]
    log_change(cur, actor, "info_system", new_id, "create", after=body)
    return new_id, None


def link_system(cur, body: dict, actor: str, link: bool):
    node_id = as_int(body.get("process_node_id"))
    system_id = as_int(body.get("system_id"))
    if not node_id or not system_id:
        return None, "Не указаны параметры связи"
    if link:
        cur.execute(
            f"INSERT INTO {SCHEMA}.exec_process_system_link (process_node_id, system_id) "
            f"VALUES (%s,%s) ON CONFLICT DO NOTHING",
            (node_id, system_id),
        )
    else:
        cur.execute(
            f"DELETE FROM {SCHEMA}.exec_process_system_link WHERE process_node_id = %s AND system_id = %s",
            (node_id, system_id),
        )
    log_change(cur, actor, "process_node", node_id, "link_system" if link else "unlink_system",
               after={"system_id": system_id})
    return node_id, None


def link_document(cur, body: dict, actor: str, link: bool):
    node_id = as_int(body.get("process_node_id"))
    document_id = as_int(body.get("document_id"))
    if not node_id or not document_id:
        return None, "Не указаны параметры связи"
    if link:
        cur.execute(
            f"INSERT INTO {SCHEMA}.exec_process_document_link (process_node_id, document_id) "
            f"VALUES (%s,%s) ON CONFLICT DO NOTHING",
            (node_id, document_id),
        )
    else:
        cur.execute(
            f"DELETE FROM {SCHEMA}.exec_process_document_link WHERE process_node_id = %s AND document_id = %s",
            (node_id, document_id),
        )
    log_change(cur, actor, "process_node", node_id, "link_document" if link else "unlink_document",
               after={"document_id": document_id})
    return node_id, None


def link_function(cur, body: dict, actor: str, link: bool):
    function_id = as_int(body.get("function_id"))
    node_id = as_int(body.get("process_node_id"))
    if not function_id or not node_id:
        return None, "Не указаны параметры связи"
    if link:
        cur.execute(
            f"INSERT INTO {SCHEMA}.exec_function_process_link (function_id, process_node_id, created_by) "
            f"VALUES (%s,%s,%s) ON CONFLICT DO NOTHING",
            (function_id, node_id, actor),
        )
    else:
        cur.execute(
            f"DELETE FROM {SCHEMA}.exec_function_process_link WHERE function_id = %s AND process_node_id = %s",
            (function_id, node_id),
        )
    log_change(cur, actor, "function_process_link", function_id,
               "link" if link else "unlink", after={"process_node_id": node_id})
    return function_id, None


# ── Заметки «требует уточнения» ──────────────────────────────────────────────

def list_clarifications(cur, scope_id: int):
    cur.execute(
        f"SELECT * FROM {SCHEMA}.exec_process_clarification_note WHERE scope_id = %s ORDER BY status, created_at DESC",
        (scope_id,))
    return rows(cur)


def save_clarification(cur, body: dict, actor: str):
    scope_id = as_int(body.get("scope_id"))
    question = nz(body.get("question"))
    if not scope_id or not question:
        return None, "Укажите вопрос на уточнение"
    cur.execute(
        f"INSERT INTO {SCHEMA}.exec_process_clarification_note "
        f"(scope_id, entity_type, entity_id, question, created_by) VALUES (%s,%s,%s,%s,%s) RETURNING id",
        (scope_id, body.get("entity_type") or "general", as_int(body.get("entity_id")), question, actor),
    )
    new_id = cur.fetchone()[0]
    log_change(cur, actor, "clarification_note", new_id, "create", after=body)
    return new_id, None


def resolve_clarification(cur, body: dict, actor: str):
    note_id = as_int(body.get("id"))
    if not note_id:
        return None, "Не указана заметка"
    cur.execute(
        f"UPDATE {SCHEMA}.exec_process_clarification_note SET status = 'resolved', "
        f"resolution_note = %s, resolved_by = %s, resolved_at = now(), updated_at = now() WHERE id = %s",
        (nz(body.get("resolution_note")), actor, note_id),
    )
    log_change(cur, actor, "clarification_note", note_id, "resolve")
    return note_id, None


# ── HTTP handler ─────────────────────────────────────────────────────────────

def handler(event: dict, context) -> dict:
    if event.get("httpMethod") == "OPTIONS":
        return cors({})

    headers = event.get("headers") or {}
    qs = event.get("queryStringParameters") or {}
    action = qs.get("action") or ""
    body = {}
    if event.get("body"):
        try:
            body = json.loads(event["body"])
        except (ValueError, TypeError):
            body = {}
    if not action:
        action = body.get("action") or ""

    conn = psycopg2.connect(DB)
    try:
        user = authenticate(conn, headers)
        if not user:
            return cors({"ok": False, "error": {"message": "Требуется вход"}}, 401)

        cur = conn.cursor()
        actor = user["email"]
        can_confirm = bool(user.get("can_confirm")) or user.get("role") == "head"
        can_edit = user.get("role") in ("head", "curator", "contributor")

        if action == "refs":
            return cors({"ok": True, "data": {
                "levels": PROCESS_LEVELS,
                "statuses": MODEL_STATUSES,
                "participation_kinds": PARTICIPATION_KINDS,
                "confirmation_statuses": CONFIRMATION_STATUSES,
                "user_role": user.get("role"),
                "can_confirm": can_confirm,
                "can_edit": can_edit,
            }})

        if action == "default_scope":
            sid = default_scope_id(cur)
            return cors({"ok": True, "data": {"scope_id": sid}})

        if action == "overview":
            scope_id = as_int(qs.get("scope_id")) or default_scope_id(cur)
            if not scope_id:
                return cors({"ok": True, "data": None})
            return cors({"ok": True, "data": get_overview(cur, scope_id)})

        if action == "functions":
            scope_id = as_int(qs.get("scope_id")) or default_scope_id(cur)
            if not scope_id:
                return cors({"ok": True, "data": {"items": []}})
            return cors({"ok": True, "data": {"items": list_functions(cur, scope_id)}})

        if action == "function_checks":
            scope_id = as_int(qs.get("scope_id")) or default_scope_id(cur)
            if not scope_id:
                return cors({"ok": True, "data": {"items": []}})
            return cors({"ok": True, "data": {"items": function_checks(cur, scope_id)}})

        if action == "function_save":
            if not can_edit:
                return cors({"ok": False, "error": {"message": "Недостаточно прав"}}, 403)
            fid, err = save_function(cur, body, actor)
            if err:
                return cors({"ok": False, "error": {"message": err}}, 400)
            conn.commit()
            return cors({"ok": True, "data": {"id": fid}})

        if action in ("function_confirm", "function_unconfirm"):
            if not can_edit:
                return cors({"ok": False, "error": {"message": "Недостаточно прав"}}, 403)
            fid, err = confirm_function(cur, body, actor, action == "function_confirm")
            if err:
                return cors({"ok": False, "error": {"message": err}}, 400)
            conn.commit()
            return cors({"ok": True, "data": {"id": fid}})

        if action == "process_tree":
            scope_id = as_int(qs.get("scope_id")) or default_scope_id(cur)
            if not scope_id:
                return cors({"ok": True, "data": {"items": []}})
            return cors({"ok": True, "data": {"items": process_tree(cur, scope_id)}})

        if action == "process_node_save":
            if not can_edit:
                return cors({"ok": False, "error": {"message": "Недостаточно прав"}}, 403)
            nid, err = save_process_node(cur, body, actor)
            if err:
                return cors({"ok": False, "error": {"message": err}}, 400)
            conn.commit()
            return cors({"ok": True, "data": {"id": nid}})

        if action == "process_node_set_status":
            if not can_edit:
                return cors({"ok": False, "error": {"message": "Недостаточно прав"}}, 403)
            nid, err = set_process_status(cur, body, actor, can_confirm)
            if err:
                return cors({"ok": False, "error": {"message": err}}, 403 if "прав" in err else 400)
            conn.commit()
            return cors({"ok": True, "data": {"id": nid}})

        if action == "process_detail":
            node_id = as_int(qs.get("id"))
            if not node_id:
                return cors({"ok": False, "error": {"message": "Не указан процесс"}}, 400)
            detail = get_process_detail(cur, node_id)
            if not detail:
                return cors({"ok": False, "error": {"message": "Процесс не найден"}}, 404)
            return cors({"ok": True, "data": detail})

        if action == "passport_save":
            if not can_edit:
                return cors({"ok": False, "error": {"message": "Недостаточно прав"}}, 403)
            nid, err = save_passport(cur, body, actor)
            if err:
                return cors({"ok": False, "error": {"message": err}}, 400)
            conn.commit()
            return cors({"ok": True, "data": {"id": nid}})

        if action == "passport_completeness":
            node_id = as_int(qs.get("process_node_id"))
            if not node_id:
                return cors({"ok": False, "error": {"message": "Не указан процесс"}}, 400)
            res = passport_completeness(cur, node_id)
            if res is None:
                return cors({"ok": False, "error": {"message": "Процесс не найден"}}, 404)
            return cors({"ok": True, "data": res})

        if action == "participant_save":
            if not can_edit:
                return cors({"ok": False, "error": {"message": "Недостаточно прав"}}, 403)
            pid, err = save_participant(cur, body, actor)
            if err:
                return cors({"ok": False, "error": {"message": err}}, 400)
            conn.commit()
            return cors({"ok": True, "data": {"id": pid}})

        if action == "participant_remove":
            if not can_edit:
                return cors({"ok": False, "error": {"message": "Недостаточно прав"}}, 403)
            pid, err = remove_participant(cur, body, actor)
            if err:
                return cors({"ok": False, "error": {"message": err}}, 400)
            conn.commit()
            return cors({"ok": True, "data": {"id": pid}})

        if action == "systems":
            return cors({"ok": True, "data": {"items": list_systems(cur)}})

        if action == "system_create":
            if not can_edit:
                return cors({"ok": False, "error": {"message": "Недостаточно прав"}}, 403)
            sid, err = create_system(cur, body, actor)
            if err:
                return cors({"ok": False, "error": {"message": err}}, 400)
            conn.commit()
            return cors({"ok": True, "data": {"id": sid}})

        if action in ("process_system_link", "process_system_unlink"):
            if not can_edit:
                return cors({"ok": False, "error": {"message": "Недостаточно прав"}}, 403)
            nid, err = link_system(cur, body, actor, action == "process_system_link")
            if err:
                return cors({"ok": False, "error": {"message": err}}, 400)
            conn.commit()
            return cors({"ok": True, "data": {"id": nid}})

        if action in ("process_document_link", "process_document_unlink"):
            if not can_edit:
                return cors({"ok": False, "error": {"message": "Недостаточно прав"}}, 403)
            nid, err = link_document(cur, body, actor, action == "process_document_link")
            if err:
                return cors({"ok": False, "error": {"message": err}}, 400)
            conn.commit()
            return cors({"ok": True, "data": {"id": nid}})

        if action in ("function_process_link", "function_process_unlink"):
            if not can_edit:
                return cors({"ok": False, "error": {"message": "Недостаточно прав"}}, 403)
            fid, err = link_function(cur, body, actor, action == "function_process_link")
            if err:
                return cors({"ok": False, "error": {"message": err}}, 400)
            conn.commit()
            return cors({"ok": True, "data": {"id": fid}})

        if action == "clarification_notes":
            scope_id = as_int(qs.get("scope_id")) or default_scope_id(cur)
            if not scope_id:
                return cors({"ok": True, "data": {"items": []}})
            return cors({"ok": True, "data": {"items": list_clarifications(cur, scope_id)}})

        if action == "clarification_note_save":
            nid, err = save_clarification(cur, body, actor)
            if err:
                return cors({"ok": False, "error": {"message": err}}, 400)
            conn.commit()
            return cors({"ok": True, "data": {"id": nid}})

        if action == "clarification_note_resolve":
            if not can_edit:
                return cors({"ok": False, "error": {"message": "Недостаточно прав"}}, 403)
            nid, err = resolve_clarification(cur, body, actor)
            if err:
                return cors({"ok": False, "error": {"message": err}}, 400)
            conn.commit()
            return cors({"ok": True, "data": {"id": nid}})

        if action == "org_units":
            cur.execute(f"""
                SELECT id, code, name, short_name, type, parent_id
                FROM {SCHEMA}.org_units WHERE is_archived = false ORDER BY code
            """)
            return cors({"ok": True, "data": {"items": rows(cur)}})

        if action == "people":
            cur.execute(f"""
                SELECT id, display_name, position_title, org_name FROM {SCHEMA}.exec_person
                WHERE record_state = 'active' ORDER BY display_name
            """)
            return cors({"ok": True, "data": {"items": rows(cur)}})

        return cors({"ok": False, "error": {"message": f"Неизвестное действие: {action}"}}, 400)

    except Exception as e:
        conn.rollback()
        return cors({"ok": False, "error": {"message": str(e)}}, 500)
    finally:
        conn.close()