"""
Обучающий мастер процессного управления — Этап 1 «Границы Блока ВК».

Это НЕ AI-модуль. Ни один action в этом файле не вызывает YandexGPT/Yandex
Vision и не передаёт содержимое загруженных документов ни во внешний, ни
во внутренний AI-контур (включая exec_ai_assistant). Загруженный файл
только сохраняется в S3, метаданные заполняются пользователем вручную.
Group_code для ai_module_settings сознательно НЕ заведён — этому модулю
нечего в нём регистрировать, так как внешний ИИ здесь не вызывается.

Сущности:
  exec_process_model_scope       — паспорт границ модели (1 запись на блок)
  exec_process_model_scope_unit  — состав границ: ссылка на org_units + решение
  exec_source_document           — документы (расширен под метаданные/S3/confidentiality)

Все запросы — action в query string (GET) или body (POST). Формат ответа:
  {"ok": true, "data": {...}} / {"ok": false, "error": {"message": "..."}}
"""
import json
import os
import re
import uuid
import base64
import hashlib
import psycopg2
import boto3

DB = os.environ["DATABASE_URL"]
_s = os.environ.get("MAIN_DB_SCHEMA", "").strip()
SCHEMA = _s if _s else "t_p61016064_digital_innovation_i"

BLOCK_VK_ORG_UNIT_ID_DEFAULT = 23
# Подразделения, которые ВСЕ ОДИНАКОВО подставляются системой при первом
# открытии мастера (этап "перенос портфеля" уже подтвердил их состав) —
# ни одно из них не считается "добавленным вручную пользователем"
# (is_manually_added=False для всех четырёх). ДФМ отличается только тем,
# что структурно не является дочерним оргюнитом Блока ВК в org_units
# (is_structural_child=False) — это объективный факт оргструктуры, а не
# признак ручного добавления. Пользователь по-прежнему должен подтвердить
# каждое подразделение отдельно на шаге 2.
DEFAULT_SEED_UNITS = [
    {"org_unit_id": 25, "is_structural_child": True},   # СВА — дочерний
    {"org_unit_id": 26, "is_structural_child": True},   # ДВКиК — дочерний
    {"org_unit_id": 24, "is_structural_child": True},   # ДРКНОиПНП — дочерний
    {"org_unit_id": 1, "is_structural_child": False,
     "comment": "Функционально относится к контуру Блока ВК по портфелю инициатив, "
                "структурно не является дочерним подразделением в оргструктуре."},
]

SOURCE_TYPES = {
    "block_regulation": "Положение о Блоке ВК",
    "unit_regulation": "Положение о подразделении",
    "job_description": "Должностная инструкция",
    "order": "Приказ / распоряжение",
    "other": "Другое",
}
CONFIDENTIALITY_LEVELS = {
    "public": "Публичный",
    "internal": "Внутренний",
    "confidential": "Конфиденциальный",
    "restricted": "Особо ограниченный",
}
DOC_STATES = {
    "draft": "Черновик",
    "active": "Действует",
    "repealed": "Отменён",
    "expired": "Истёк срок действия",
}
# Доступ к скачиванию по уровню конфиденциальности — минимальная роль кабинета.
ROLE_RANK = {"viewer": 0, "contributor": 1, "curator": 2, "head": 3}
CONF_MIN_ROLE = {"public": 0, "internal": 1, "confidential": 2, "restricted": 3}
# Та же шкала используется для запрета САМОВОЛЬНОГО понижения уровня —
# понизить (уменьшить строгость) может только пользователь с can_confirm.
CONF_RANK = {"public": 0, "internal": 1, "confidential": 2, "restricted": 3}

ALLOWED_EXT = {"pdf", "docx", "doc", "rtf", "txt"}
MAX_FILE_SIZE = 20 * 1024 * 1024


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


def get_s3():
    return boto3.client(
        "s3",
        endpoint_url="https://bucket.poehali.dev",
        aws_access_key_id=os.environ["AWS_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["AWS_SECRET_ACCESS_KEY"],
    )


def safe_name(filename: str) -> str:
    table = str.maketrans({
        "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "e",
        "ж": "zh", "з": "z", "и": "i", "й": "y", "к": "k", "л": "l", "м": "m",
        "н": "n", "о": "o", "п": "p", "р": "r", "с": "s", "т": "t", "у": "u",
        "ф": "f", "х": "h", "ц": "ts", "ч": "ch", "ш": "sh", "щ": "sch",
        "ъ": "", "ы": "y", "ь": "", "э": "e", "ю": "yu", "я": "ya",
    })
    name = (filename or "file").lower().translate(table)
    name = re.sub(r"[^a-z0-9._-]+", "_", name)
    name = re.sub(r"_+", "_", name).strip("_")
    return name[:150] or "file"


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


# ── Паспорт границ ──────────────────────────────────────────────────────────

def get_or_create_scope(cur, block_org_unit_id: int, actor: str):
    cur.execute(
        f"SELECT * FROM {SCHEMA}.exec_process_model_scope WHERE block_org_unit_id = %s",
        (block_org_unit_id,),
    )
    r = rows(cur)
    if r:
        return r[0], False

    cur.execute(f"SELECT name FROM {SCHEMA}.org_units WHERE id = %s", (block_org_unit_id,))
    unit_row = cur.fetchone()
    if not unit_row:
        return None, None
    title = f"Границы {unit_row[0]}"

    cur.execute(
        f"INSERT INTO {SCHEMA}.exec_process_model_scope "
        f"(block_org_unit_id, title, created_by, updated_by) "
        f"VALUES (%s,%s,%s,%s) RETURNING id",
        (block_org_unit_id, title, actor, actor),
    )
    scope_id = cur.fetchone()[0]

    for seed in DEFAULT_SEED_UNITS:
        cur.execute(
            f"SELECT id FROM {SCHEMA}.org_units WHERE id = %s AND is_archived = false",
            (seed["org_unit_id"],),
        )
        if not cur.fetchone():
            continue
        cur.execute(
            f"INSERT INTO {SCHEMA}.exec_process_model_scope_unit "
            f"(scope_id, org_unit_id, decision, is_manually_added, is_structural_child, comment, updated_by) "
            f"VALUES (%s,%s,'included',false,%s,%s,%s)",
            (scope_id, seed["org_unit_id"], seed["is_structural_child"],
             seed.get("comment"), actor),
        )

    log_change(cur, actor, "process_model_scope", scope_id, "create",
               after={"block_org_unit_id": block_org_unit_id, "seeded_units": len(DEFAULT_SEED_UNITS)})

    cur.execute(f"SELECT * FROM {SCHEMA}.exec_process_model_scope WHERE id = %s", (scope_id,))
    return rows(cur)[0], True


def scope_units(cur, scope_id: int):
    cur.execute(f"""
        SELECT su.id, su.scope_id, su.org_unit_id, su.decision, su.is_manually_added,
               su.is_structural_child,
               su.exclusion_reason, su.confirmation_status, su.comment,
               su.updated_by, su.updated_at,
               u.code, u.name, u.short_name, u.type, u.parent_id
        FROM {SCHEMA}.exec_process_model_scope_unit su
        JOIN {SCHEMA}.org_units u ON u.id = su.org_unit_id
        WHERE su.scope_id = %s
        ORDER BY su.is_structural_child DESC, u.code
    """, (scope_id,))
    return rows(cur)


def scope_documents(cur, scope_id: int, include_test_data: bool = False):
    """По умолчанию технические/тестовые записи (is_test_data=true) скрыты —
    они не должны выглядеть как реальные нормативные документы. Показать их
    можно только явным include_test_data=true (например для администратора)."""
    cond = "" if include_test_data else "AND d.is_test_data = false"
    cur.execute(f"""
        SELECT d.id, d.scope_id, d.org_unit_id, d.source_type, d.title, d.doc_number,
               d.doc_date, d.issuer, d.valid_from, d.valid_to, d.version_label,
               d.state, d.confidentiality_level, d.is_current_version, d.is_test_data,
               d.confirmed_actual_by, d.confirmed_actual_at, d.comment,
               d.original_filename, d.mime_type, d.file_size, d.s3_key IS NOT NULL AS has_file,
               d.uploaded_by, d.fixed_at
               , u.code AS org_unit_code, u.name AS org_unit_name
        FROM {SCHEMA}.exec_source_document d
        LEFT JOIN {SCHEMA}.org_units u ON u.id = d.org_unit_id
        WHERE d.scope_id = %s {cond}
        ORDER BY d.fixed_at DESC
    """, (scope_id,))
    return rows(cur)


def scope_candidates(cur, block_org_unit_id: int, scope_id: int):
    """Подразделения, которые ещё НЕ добавлены в границы — для формы «Добавить»."""
    cur.execute(f"""
        SELECT u.id, u.code, u.name, u.short_name, u.type, u.parent_id
        FROM {SCHEMA}.org_units u
        WHERE u.is_archived = false
          AND u.id NOT IN (
              SELECT org_unit_id FROM {SCHEMA}.exec_process_model_scope_unit WHERE scope_id = %s
          )
        ORDER BY (u.parent_id = %s) DESC, u.code
    """, (scope_id, block_org_unit_id))
    return rows(cur)


def full_scope_payload(cur, scope: dict, include_test_data: bool = False):
    scope_id = scope["id"]
    return {
        "scope": scope,
        "units": scope_units(cur, scope_id),
        "documents": scope_documents(cur, scope_id, include_test_data=include_test_data),
        "candidates": scope_candidates(cur, scope["block_org_unit_id"], scope_id),
    }


def save_scope(cur, body: dict, actor: str):
    scope_id = as_int(body.get("scope_id") or body.get("id"))
    if not scope_id:
        return None, "Не указан паспорт модели"
    cur.execute(f"SELECT * FROM {SCHEMA}.exec_process_model_scope WHERE id = %s", (scope_id,))
    before = rows(cur)
    if not before:
        return None, "Паспорт модели не найден"
    if before[0]["model_status"] == "confirmed":
        return None, "Этап уже подтверждён — для изменений сначала снимите подтверждение"

    fields = ["title", "purpose", "scope_in", "scope_out", "owner_person_id"]
    vals = {}
    for f in fields:
        if f in body:
            vals[f] = as_int(body[f]) if f == "owner_person_id" else nz(body.get(f))
    if not vals:
        return scope_id, None
    sets = ", ".join(f"{k} = %s" for k in vals)
    cur.execute(
        f"UPDATE {SCHEMA}.exec_process_model_scope SET {sets}, updated_by = %s, updated_at = now() "
        f"WHERE id = %s",
        list(vals.values()) + [actor, scope_id],
    )
    log_change(cur, actor, "process_model_scope", scope_id, "update", before=before[0], after=vals)
    return scope_id, None


def declare_missing(cur, body: dict, actor: str, missing: bool):
    scope_id = as_int(body.get("scope_id"))
    if not scope_id:
        return None, "Не указан паспорт модели"
    if missing:
        cur.execute(
            f"UPDATE {SCHEMA}.exec_process_model_scope SET "
            f"block_regulation_declared_missing = true, "
            f"block_regulation_missing_reason = %s, "
            f"block_regulation_missing_declared_by = %s, "
            f"block_regulation_missing_declared_at = now(), "
            f"updated_by = %s, updated_at = now() WHERE id = %s",
            (nz(body.get("reason")), actor, actor, scope_id),
        )
        log_change(cur, actor, "process_model_scope", scope_id, "declare_regulation_missing",
                   after={"reason": body.get("reason")})
    else:
        cur.execute(
            f"UPDATE {SCHEMA}.exec_process_model_scope SET "
            f"block_regulation_declared_missing = false, "
            f"block_regulation_missing_reason = NULL, "
            f"updated_by = %s, updated_at = now() WHERE id = %s",
            (actor, scope_id),
        )
        log_change(cur, actor, "process_model_scope", scope_id, "undeclare_regulation_missing")
    return scope_id, None


def set_step(cur, body: dict, actor: str):
    scope_id = as_int(body.get("scope_id"))
    if not scope_id:
        return None, "Не указан паспорт модели"
    vals = {}
    if "current_step" in body:
        vals["current_step"] = as_int(body["current_step"]) or 1
    if "wizard_status" in body and body["wizard_status"] in ("not_started", "in_progress", "completed", "needs_review"):
        vals["wizard_status"] = body["wizard_status"]
    if "progress_pct" in body:
        pct = as_int(body["progress_pct"])
        vals["progress_pct"] = max(0, min(100, pct or 0))
    if not vals:
        return scope_id, None
    sets = ", ".join(f"{k} = %s" for k in vals)
    cur.execute(
        f"UPDATE {SCHEMA}.exec_process_model_scope SET {sets}, updated_by = %s, updated_at = now() "
        f"WHERE id = %s AND model_status <> 'confirmed'",
        list(vals.values()) + [actor, scope_id],
    )
    return scope_id, None


# ── Состав границ (подразделения) ───────────────────────────────────────────

def save_unit_decision(cur, body: dict, actor: str):
    scope_id = as_int(body.get("scope_id"))
    org_unit_id = as_int(body.get("org_unit_id"))
    if not scope_id or not org_unit_id:
        return None, "Не указаны паспорт модели или подразделение"

    cur.execute(
        f"SELECT model_status FROM {SCHEMA}.exec_process_model_scope WHERE id = %s", (scope_id,),
    )
    st = cur.fetchone()
    if not st:
        return None, "Паспорт модели не найден"
    if st[0] == "confirmed":
        return None, "Этап уже подтверждён — для изменений сначала снимите подтверждение"

    decision = body.get("decision")
    if decision not in ("included", "excluded"):
        return None, "Решение должно быть include/excluded"
    if decision == "excluded" and not nz(body.get("exclusion_reason")):
        return None, "Для исключения подразделения укажите причину"

    confirmation_status = body.get("confirmation_status") or "confirmed"
    if confirmation_status not in ("pending", "confirmed"):
        confirmation_status = "confirmed"

    cur.execute(
        f"SELECT id FROM {SCHEMA}.exec_process_model_scope_unit "
        f"WHERE scope_id = %s AND org_unit_id = %s",
        (scope_id, org_unit_id),
    )
    existing = cur.fetchone()

    if existing:
        cur.execute(
            f"UPDATE {SCHEMA}.exec_process_model_scope_unit SET "
            f"decision = %s, exclusion_reason = %s, confirmation_status = %s, "
            f"comment = %s, updated_by = %s, updated_at = now() WHERE id = %s",
            (decision, nz(body.get("exclusion_reason")), confirmation_status,
             nz(body.get("comment")), actor, existing[0]),
        )
        unit_id = existing[0]
    else:
        cur.execute(
            f"INSERT INTO {SCHEMA}.exec_process_model_scope_unit "
            f"(scope_id, org_unit_id, decision, is_manually_added, exclusion_reason, "
            f" confirmation_status, comment, updated_by) "
            f"VALUES (%s,%s,%s,true,%s,%s,%s,%s) RETURNING id",
            (scope_id, org_unit_id, decision, nz(body.get("exclusion_reason")),
             confirmation_status, nz(body.get("comment")), actor),
        )
        unit_id = cur.fetchone()[0]

    log_change(cur, actor, "process_model_scope_unit", unit_id, "save_decision",
               after={"org_unit_id": org_unit_id, "decision": decision,
                      "confirmation_status": confirmation_status})
    return unit_id, None


def add_manual_unit(cur, body: dict, actor: str):
    scope_id = as_int(body.get("scope_id"))
    org_unit_id = as_int(body.get("org_unit_id"))
    if not scope_id or not org_unit_id:
        return None, "Не указаны паспорт модели или подразделение"
    if _scope_confirmed(cur, scope_id):
        return None, "Этап уже подтверждён — для изменений сначала снимите подтверждение"
    cur.execute(
        f"SELECT id FROM {SCHEMA}.org_units WHERE id = %s AND is_archived = false", (org_unit_id,),
    )
    if not cur.fetchone():
        return None, "Подразделение не найдено"
    cur.execute(
        f"SELECT id FROM {SCHEMA}.exec_process_model_scope_unit "
        f"WHERE scope_id = %s AND org_unit_id = %s",
        (scope_id, org_unit_id),
    )
    if cur.fetchone():
        return None, "Подразделение уже добавлено в границы"
    cur.execute(
        f"INSERT INTO {SCHEMA}.exec_process_model_scope_unit "
        f"(scope_id, org_unit_id, decision, is_manually_added, confirmation_status, comment, updated_by) "
        f"VALUES (%s,%s,'included',true,'pending',%s,%s) RETURNING id",
        (scope_id, org_unit_id, nz(body.get("comment")), actor),
    )
    unit_id = cur.fetchone()[0]
    log_change(cur, actor, "process_model_scope_unit", unit_id, "add_manual",
               after={"org_unit_id": org_unit_id})
    return unit_id, None


def remove_manual_unit(cur, body: dict, actor: str):
    scope_id = as_int(body.get("scope_id"))
    org_unit_id = as_int(body.get("org_unit_id"))
    if not scope_id or not org_unit_id:
        return None, "Не указаны паспорт модели или подразделение"
    if _scope_confirmed(cur, scope_id):
        return None, "Этап уже подтверждён — для изменений сначала снимите подтверждение"
    cur.execute(
        f"SELECT id, is_manually_added FROM {SCHEMA}.exec_process_model_scope_unit "
        f"WHERE scope_id = %s AND org_unit_id = %s",
        (scope_id, org_unit_id),
    )
    row = cur.fetchone()
    if not row:
        return None, "Запись не найдена"
    if not row[1]:
        return None, "Можно удалить только вручную добавленное подразделение — остальные исключайте с указанием причины"
    cur.execute(f"DELETE FROM {SCHEMA}.exec_process_model_scope_unit WHERE id = %s", (row[0],))
    log_change(cur, actor, "process_model_scope_unit", row[0], "remove_manual",
               before={"org_unit_id": org_unit_id})
    return row[0], None


# ── Документы ────────────────────────────────────────────────────────────────

DOC_META_FIELDS = [
    "org_unit_id", "source_type", "title", "doc_number", "doc_date", "issuer",
    "valid_from", "valid_to", "version_label", "state", "confidentiality_level", "comment",
]


def _clean_doc_meta(body: dict) -> dict:
    vals = {}
    for f in DOC_META_FIELDS:
        if f not in body:
            continue
        v = body.get(f)
        if f == "org_unit_id":
            vals[f] = as_int(v)
        else:
            vals[f] = nz(v)
    if vals.get("source_type") and vals["source_type"] not in SOURCE_TYPES:
        vals["source_type"] = "other"
    if vals.get("state") and vals["state"] not in DOC_STATES:
        vals["state"] = "draft"
    if vals.get("confidentiality_level") and vals["confidentiality_level"] not in CONFIDENTIALITY_LEVELS:
        vals["confidentiality_level"] = "internal"
    if "confidentiality_level" in vals:
        vals["is_confidential"] = vals["confidentiality_level"] != "public"
    return vals


def upload_document(cur, body: dict, actor: str):
    """Загрузка файла: ТОЛЬКО сохранение в S3 + запись метаданных.
    OCR/GPT НЕ вызываются, текст не извлекается — по требованию безопасности
    первой итерации мастера."""
    scope_id = as_int(body.get("scope_id"))
    if not scope_id:
        return None, "Не указан паспорт модели"
    cur.execute(f"SELECT model_status FROM {SCHEMA}.exec_process_model_scope WHERE id = %s", (scope_id,))
    st = cur.fetchone()
    if not st:
        return None, "Паспорт модели не найден"
    if st[0] == "confirmed":
        return None, "Этап уже подтверждён — для изменений сначала снимите подтверждение"

    filename = (body.get("filename") or "").strip()
    file_b64 = body.get("file_data") or ""
    if not filename or not file_b64:
        return None, "Не хватает данных файла"
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in ALLOWED_EXT:
        return None, "Поддерживаются PDF, DOCX, DOC, RTF, TXT"
    try:
        data = base64.b64decode(file_b64)
    except Exception:
        return None, "Файл повреждён при передаче"
    if len(data) > MAX_FILE_SIZE:
        return None, "Файл больше 20 МБ — загрузите документ поменьше"

    meta = _clean_doc_meta(body)
    if not meta.get("title"):
        meta["title"] = filename.rsplit(".", 1)[0][:500]
    if not meta.get("source_type"):
        meta["source_type"] = "other"
    if not meta.get("state"):
        meta["state"] = "draft"
    if not meta.get("confidentiality_level"):
        meta["confidentiality_level"] = "internal"
        meta["is_confidential"] = True

    s3_key = f"exec-process-scope/{scope_id}/{uuid.uuid4().hex}_{safe_name(filename)}"
    get_s3().put_object(Bucket="files", Key=s3_key, Body=data)

    meta.update({
        "scope_id": scope_id,
        "s3_key": s3_key,
        "original_filename": filename[:255],
        "file_size": len(data),
        "uploaded_by": actor,
        "source_type": meta.get("source_type"),
        "title": meta.get("title"),
        "state": meta.get("state"),
        "confidentiality_level": meta.get("confidentiality_level"),
        "is_confidential": meta.get("is_confidential", True),
    })
    cols = ", ".join(meta)
    ph = ", ".join(["%s"] * len(meta))
    cur.execute(
        f"INSERT INTO {SCHEMA}.exec_source_document ({cols}) VALUES ({ph}) RETURNING id",
        list(meta.values()),
    )
    doc_id = cur.fetchone()[0]
    log_change(cur, actor, "source_document", doc_id, "upload",
               after={"scope_id": scope_id, "filename": filename, "size": len(data),
                      "confidentiality_level": meta.get("confidentiality_level")})
    return {"id": doc_id, "size": len(data)}, None


def _scope_confirmed(cur, scope_id) -> bool:
    if not scope_id:
        return False
    cur.execute(f"SELECT model_status FROM {SCHEMA}.exec_process_model_scope WHERE id = %s", (scope_id,))
    r = cur.fetchone()
    return bool(r and r[0] == "confirmed")


def save_document_meta(cur, body: dict, actor: str, can_confirm_role: bool):
    doc_id = as_int(body.get("id"))
    if not doc_id:
        return None, "Не указан документ"
    cur.execute(f"SELECT * FROM {SCHEMA}.exec_source_document WHERE id = %s", (doc_id,))
    before = rows(cur)
    if not before:
        return None, "Документ не найден"
    if _scope_confirmed(cur, before[0].get("scope_id")):
        return None, "Этап уже подтверждён — для изменений сначала снимите подтверждение"

    vals = _clean_doc_meta(body)
    if not vals:
        return doc_id, None

    # Понижение уровня конфиденциальности (менее строгий уровень, чем был) —
    # чувствительное действие, доступное только пользователю с can_confirm.
    # Повышение строгости разрешено всем, кто может редактировать документ.
    lower_confidentiality = False
    if "confidentiality_level" in vals:
        old_level = before[0].get("confidentiality_level") or "internal"
        new_level = vals["confidentiality_level"]
        if CONF_RANK.get(new_level, 1) < CONF_RANK.get(old_level, 1):
            if not can_confirm_role:
                return None, ("Понижать уровень конфиденциальности может только уполномоченный "
                              "пользователь (с правом подтверждения)")
            lower_confidentiality = True

    sets = ", ".join(f"{k} = %s" for k in vals)
    extra_sql = ""
    params = list(vals.values())
    if lower_confidentiality:
        extra_sql = ", confidentiality_lowered_by = %s, confidentiality_lowered_at = now()"
        params.append(actor)
    cur.execute(
        f"UPDATE {SCHEMA}.exec_source_document SET {sets}{extra_sql} WHERE id = %s",
        params + [doc_id],
    )
    log_change(cur, actor, "source_document", doc_id, "update_meta", before=before[0], after=vals)
    return doc_id, None


def mark_current_version(cur, body: dict, actor: str):
    doc_id = as_int(body.get("id"))
    flag = as_bool(body.get("is_current_version"), True)
    if not doc_id:
        return None, "Не указан документ"
    cur.execute(f"SELECT scope_id FROM {SCHEMA}.exec_source_document WHERE id = %s", (doc_id,))
    r = cur.fetchone()
    if not r:
        return None, "Документ не найден"
    if _scope_confirmed(cur, r[0]):
        return None, "Этап уже подтверждён — для изменений сначала снимите подтверждение"
    if flag:
        try:
            cur.execute(
                f"UPDATE {SCHEMA}.exec_source_document SET is_current_version = true WHERE id = %s",
                (doc_id,),
            )
        except psycopg2.errors.UniqueViolation:
            cur.connection.rollback()
            return None, ("Для этого вида документа и подразделения уже есть отмеченная действующая "
                          "версия. Сначала снимите отметку с прежней версии.")
    else:
        cur.execute(
            f"UPDATE {SCHEMA}.exec_source_document SET is_current_version = false WHERE id = %s",
            (doc_id,),
        )
    log_change(cur, actor, "source_document", doc_id, "mark_current_version", after={"value": flag})
    return doc_id, None


def confirm_document_actual(cur, body: dict, actor: str):
    doc_id = as_int(body.get("id"))
    if not doc_id:
        return None, "Не указан документ"
    cur.execute(f"SELECT scope_id FROM {SCHEMA}.exec_source_document WHERE id = %s", (doc_id,))
    r = cur.fetchone()
    if not r:
        return None, "Документ не найден"
    if _scope_confirmed(cur, r[0]):
        return None, "Этап уже подтверждён — для изменений сначала снимите подтверждение"
    cur.execute(
        f"UPDATE {SCHEMA}.exec_source_document SET "
        f"confirmed_actual_by = %s, confirmed_actual_at = now() WHERE id = %s",
        (actor, doc_id),
    )
    log_change(cur, actor, "source_document", doc_id, "confirm_actual")
    return doc_id, None


def archive_document(cur, body: dict, actor: str):
    """Мягкое архивирование — переводит документ в state=repealed.
    Файл и запись не удаляются (аудитируемость)."""
    doc_id = as_int(body.get("id"))
    if not doc_id:
        return None, "Не указан документ"
    cur.execute(f"SELECT scope_id FROM {SCHEMA}.exec_source_document WHERE id = %s", (doc_id,))
    r = cur.fetchone()
    if not r:
        return None, "Документ не найден"
    if _scope_confirmed(cur, r[0]):
        return None, "Этап уже подтверждён — для изменений сначала снимите подтверждение"
    cur.execute(
        f"UPDATE {SCHEMA}.exec_source_document SET state = 'repealed', "
        f"is_current_version = false, comment = COALESCE(%s, comment) WHERE id = %s",
        (nz(body.get("reason")), doc_id),
    )
    log_change(cur, actor, "source_document", doc_id, "archive", reason=body.get("reason"))
    return doc_id, None


def document_download(cur, doc_id: int, user: dict):
    cur.execute(
        f"SELECT s3_key, original_filename, mime_type, confidentiality_level, scope_id "
        f"FROM {SCHEMA}.exec_source_document WHERE id = %s",
        (doc_id,),
    )
    row = cur.fetchone()
    if not row:
        return None, "Документ не найден", 404
    s3_key, filename, mime, level, scope_id = row
    if not s3_key:
        return None, "У документа нет прикреплённого файла", 404

    level = level or "internal"
    user_role = user.get("role") or "viewer"
    if ROLE_RANK.get(user_role, 0) < CONF_MIN_ROLE.get(level, 1):
        log_change(cur, user.get("email"), "source_document", doc_id, "download_denied",
                   after={"level": level, "role": user_role})
        return None, "Недостаточно прав для скачивания документа этого уровня конфиденциальности", 403

    try:
        obj = get_s3().get_object(Bucket="files", Key=s3_key)
        file_bytes = obj["Body"].read()
    except Exception as e:
        return None, f"Не удалось получить файл: {e}", 500

    log_change(cur, user.get("email"), "source_document", doc_id, "download",
               after={"level": level})
    content_types = {
        "pdf": "application/pdf",
        "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "doc": "application/msword",
        "rtf": "application/rtf",
        "txt": "text/plain",
    }
    ext = (filename or "").rsplit(".", 1)[-1].lower() if filename and "." in filename else ""
    return {
        "file_data": base64.b64encode(file_bytes).decode("ascii"),
        "filename": filename,
        "mime": mime or content_types.get(ext, "application/octet-stream"),
        "size": len(file_bytes),
    }, None, 200


# ── Проверка полноты (детерминированная, без ИИ) ────────────────────────────

def completeness(cur, scope_id: int):
    cur.execute(f"SELECT * FROM {SCHEMA}.exec_process_model_scope WHERE id = %s", (scope_id,))
    sc = rows(cur)
    if not sc:
        return None
    sc = sc[0]

    units = scope_units(cur, scope_id)
    docs = scope_documents(cur, scope_id)

    confirmed_included = [u for u in units if u["decision"] == "included" and u["confirmation_status"] == "confirmed"]
    pending_units = [u for u in units if u["confirmation_status"] == "pending"]

    has_block_regulation = any(d["source_type"] == "block_regulation" and d["state"] != "repealed" for d in docs)
    regulation_ok = has_block_regulation or sc["block_regulation_declared_missing"]

    incomplete_docs = [
        d for d in docs
        if d["state"] != "repealed" and (not d["doc_date"] or not d["state"] or not d["source_type"])
    ]

    # Конфликт "две действующие версии" на случай org_unit_id IS NULL
    # (для NOT NULL это уже гарантировано уникальным индексом в БД).
    seen = {}
    conflicts = []
    for d in docs:
        if not d["is_current_version"] or d["state"] == "repealed":
            continue
        key = (d["org_unit_id"], d["source_type"])
        if key in seen:
            conflicts.append((seen[key], d["id"]))
        else:
            seen[key] = d["id"]

    ready = []
    needs_attention = []

    def item(code, label, ok, detail=None):
        (ready if ok else needs_attention).append({"code": code, "label": label, "ok": ok, "detail": detail})

    item("units_confirmed", "Подтверждён хотя бы один участник границ",
         len(confirmed_included) > 0,
         f"Подтверждено: {len(confirmed_included)}" if confirmed_included else "Нет ни одного подтверждённого подразделения")
    item("units_no_pending", "Нет подразделений без решения",
         len(pending_units) == 0,
         f"Ожидают решения: {', '.join(u['name'] for u in pending_units)}" if pending_units else None)
    item("purpose_filled", "Назначение Блока ВК описано", bool(nz(sc.get("purpose"))))
    item("scope_in_filled", "Указано, что входит в границы", bool(nz(sc.get("scope_in"))))
    item("scope_out_filled", "Указано, что не входит в границы", bool(nz(sc.get("scope_out"))))
    item("regulation_present", "Положение о Блоке ВК загружено или отмечено отсутствующим",
         regulation_ok,
         None if regulation_ok else "Загрузите положение о Блоке ВК или отметьте, что оно отсутствует")
    item("docs_metadata_complete", "У всех документов заполнены вид, дата и статус",
         len(incomplete_docs) == 0,
         f"Не хватает метаданных: {', '.join(d['title'] for d in incomplete_docs)}" if incomplete_docs else None)
    item("no_version_conflicts", "Нет двух документов с пометкой «действующая версия» одновременно",
         len(conflicts) == 0,
         f"Конфликтов: {len(conflicts)}" if conflicts else None)
    item("owner_assigned", "Назначен владелец модели", bool(sc.get("owner_person_id")),
         "Необязательно для подтверждения этапа, но рекомендуется")

    blocking_codes = {"units_confirmed", "purpose_filled", "scope_in_filled", "scope_out_filled",
                       "regulation_present", "no_version_conflicts"}
    can_confirm = all(
        i["ok"] for i in (ready + needs_attention) if i["code"] in blocking_codes
    )

    return {"ready": ready, "needs_attention": needs_attention, "can_confirm": can_confirm}


def confirm_stage(cur, body: dict, actor: str, can_confirm_role: bool):
    scope_id = as_int(body.get("scope_id"))
    if not scope_id:
        return None, "Не указан паспорт модели"
    if not can_confirm_role:
        return None, "Недостаточно прав для подтверждения этапа"
    check = completeness(cur, scope_id)
    if not check:
        return None, "Паспорт модели не найден"
    if not check["can_confirm"]:
        return None, "Не выполнены обязательные условия проверки полноты — см. раздел «Требует уточнения»"

    cur.execute(
        f"UPDATE {SCHEMA}.exec_process_model_scope SET "
        f"model_status = 'confirmed', wizard_status = 'completed', progress_pct = 100, "
        f"confirmed_at = now(), confirmed_by = %s, updated_by = %s, updated_at = now() "
        f"WHERE id = %s",
        (actor, actor, scope_id),
    )
    log_change(cur, actor, "process_model_scope", scope_id, "confirm_stage")
    return scope_id, None


def unconfirm_stage(cur, body: dict, actor: str, can_confirm_role: bool):
    scope_id = as_int(body.get("scope_id"))
    if not scope_id:
        return None, "Не указан паспорт модели"
    if not can_confirm_role:
        return None, "Недостаточно прав"
    cur.execute(
        f"UPDATE {SCHEMA}.exec_process_model_scope SET "
        f"model_status = 'draft', wizard_status = 'needs_review', "
        f"updated_by = %s, updated_at = now() WHERE id = %s",
        (actor, scope_id),
    )
    log_change(cur, actor, "process_model_scope", scope_id, "unconfirm_stage")
    return scope_id, None


def audit_log(cur, scope_id: int):
    cur.execute(f"""
        SELECT id, entity_type, entity_id, action, actor, reason, created_at
        FROM {SCHEMA}.exec_audit_log
        WHERE (entity_type = 'process_model_scope' AND entity_id = %s)
           OR (entity_type = 'process_model_scope_unit' AND entity_id IN (
                 SELECT id FROM {SCHEMA}.exec_process_model_scope_unit WHERE scope_id = %s
               ))
           OR (entity_type = 'source_document' AND entity_id IN (
                 SELECT id FROM {SCHEMA}.exec_source_document WHERE scope_id = %s
               ))
        ORDER BY created_at DESC LIMIT 200
    """, (scope_id, scope_id, scope_id))
    return rows(cur)


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

        if action == "refs":
            return cors({"ok": True, "data": {
                "source_types": SOURCE_TYPES,
                "confidentiality_levels": CONFIDENTIALITY_LEVELS,
                "states": DOC_STATES,
                "block_org_unit_id_default": BLOCK_VK_ORG_UNIT_ID_DEFAULT,
                "user_role": user.get("role"),
                "can_confirm": can_confirm,
            }})

        if action == "get_or_create":
            block_id = as_int(qs.get("block_org_unit_id") or body.get("block_org_unit_id")) \
                or BLOCK_VK_ORG_UNIT_ID_DEFAULT
            scope, created = get_or_create_scope(cur, block_id, actor)
            if scope is None:
                return cors({"ok": False, "error": {"message": "Подразделение Блока ВК не найдено"}}, 404)
            conn.commit()
            # Технические/тестовые документы скрыты из рабочего списка по
            # умолчанию — показать их можно только явным флагом (для админ-проверки).
            include_test = as_bool(qs.get("include_test_data") or body.get("include_test_data"))
            return cors({"ok": True, "data": full_scope_payload(cur, scope, include_test_data=include_test)})

        if action == "save_scope":
            sid, err = save_scope(cur, body, actor)
            if err:
                return cors({"ok": False, "error": {"message": err}}, 400)
            conn.commit()
            return cors({"ok": True, "data": {"id": sid}})

        if action == "declare_block_regulation_missing":
            sid, err = declare_missing(cur, body, actor, True)
            if err:
                return cors({"ok": False, "error": {"message": err}}, 400)
            conn.commit()
            return cors({"ok": True, "data": {"id": sid}})

        if action == "undeclare_block_regulation_missing":
            sid, err = declare_missing(cur, body, actor, False)
            if err:
                return cors({"ok": False, "error": {"message": err}}, 400)
            conn.commit()
            return cors({"ok": True, "data": {"id": sid}})

        if action == "set_step":
            sid, err = set_step(cur, body, actor)
            if err:
                return cors({"ok": False, "error": {"message": err}}, 400)
            conn.commit()
            return cors({"ok": True, "data": {"id": sid}})

        if action == "save_unit_decision":
            uid, err = save_unit_decision(cur, body, actor)
            if err:
                return cors({"ok": False, "error": {"message": err}}, 400)
            conn.commit()
            return cors({"ok": True, "data": {"id": uid}})

        if action == "add_manual_unit":
            uid, err = add_manual_unit(cur, body, actor)
            if err:
                return cors({"ok": False, "error": {"message": err}}, 400)
            conn.commit()
            return cors({"ok": True, "data": {"id": uid}})

        if action == "remove_manual_unit":
            uid, err = remove_manual_unit(cur, body, actor)
            if err:
                return cors({"ok": False, "error": {"message": err}}, 400)
            conn.commit()
            return cors({"ok": True, "data": {"id": uid}})

        if action == "upload_document":
            res, err = upload_document(cur, body, actor)
            if err:
                conn.rollback()
                return cors({"ok": False, "error": {"message": err}}, 400)
            conn.commit()
            return cors({"ok": True, "data": res})

        if action == "save_document_meta":
            did, err = save_document_meta(cur, body, actor, can_confirm)
            if err:
                return cors({"ok": False, "error": {"message": err}}, 403 if "уполномоченный" in err else 400)
            conn.commit()
            return cors({"ok": True, "data": {"id": did}})

        if action == "mark_current_version":
            did, err = mark_current_version(cur, body, actor)
            if err:
                return cors({"ok": False, "error": {"message": err}}, 409)
            conn.commit()
            return cors({"ok": True, "data": {"id": did}})

        if action == "confirm_document_actual":
            did, err = confirm_document_actual(cur, body, actor)
            if err:
                return cors({"ok": False, "error": {"message": err}}, 400)
            conn.commit()
            return cors({"ok": True, "data": {"id": did}})

        if action == "archive_document":
            did, err = archive_document(cur, body, actor)
            if err:
                return cors({"ok": False, "error": {"message": err}}, 400)
            conn.commit()
            return cors({"ok": True, "data": {"id": did}})

        if action == "document_download":
            doc_id = as_int(qs.get("id") or body.get("id"))
            if not doc_id:
                return cors({"ok": False, "error": {"message": "Не указан документ"}}, 400)
            data, err, status = document_download(cur, doc_id, user)
            conn.commit()
            if err:
                return cors({"ok": False, "error": {"message": err}}, status)
            return cors({"ok": True, "data": data})

        if action == "completeness":
            scope_id = as_int(qs.get("scope_id") or body.get("scope_id"))
            if not scope_id:
                return cors({"ok": False, "error": {"message": "Не указан паспорт модели"}}, 400)
            check = completeness(cur, scope_id)
            if not check:
                return cors({"ok": False, "error": {"message": "Паспорт модели не найден"}}, 404)
            return cors({"ok": True, "data": check})

        if action == "confirm_stage":
            sid, err = confirm_stage(cur, body, actor, can_confirm)
            if err:
                return cors({"ok": False, "error": {"message": err}}, 400)
            conn.commit()
            return cors({"ok": True, "data": {"id": sid}})

        if action == "unconfirm_stage":
            sid, err = unconfirm_stage(cur, body, actor, can_confirm)
            if err:
                return cors({"ok": False, "error": {"message": err}}, 400)
            conn.commit()
            return cors({"ok": True, "data": {"id": sid}})

        if action == "audit_log":
            scope_id = as_int(qs.get("scope_id") or body.get("scope_id"))
            if not scope_id:
                return cors({"ok": False, "error": {"message": "Не указан паспорт модели"}}, 400)
            return cors({"ok": True, "data": {"items": audit_log(cur, scope_id)}})

        return cors({"ok": False, "error": {"message": f"Неизвестное действие: {action}"}}, 400)

    except Exception as e:
        conn.rollback()
        return cors({"ok": False, "error": {"message": str(e)}}, 500)
    finally:
        conn.close()