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
    th = hashlib.sha256(token.encode()).hexdigest()
    with conn.cursor() as cur:
        cur.execute(
            f"SELECT actor_email FROM {SCHEMA}.admin_sessions "
            f"WHERE session_token_hash = %s AND expires_at > NOW() AND revoked_at IS NULL LIMIT 1",
            (th,),
        )
        row = cur.fetchone()
    return row[0] if row else None


def get_cabinet_user(conn, session_id: str):
    if not session_id:
        return None
    with conn.cursor() as cur:
        cur.execute(
            f"SELECT u.email FROM {SCHEMA}.sessions s "
            f"JOIN {SCHEMA}.users u ON u.id = s.user_id "
            f"JOIN {SCHEMA}.exec_cabinet_access a ON LOWER(a.email) = LOWER(u.email) "
            f"WHERE s.id = %s AND s.expires_at > NOW() AND a.is_active = true LIMIT 1",
            (session_id,),
        )
        row = cur.fetchone()
    return row[0] if row else None


def authenticate(conn, headers: dict):
    token = headers.get("x-admin-token") or headers.get("X-Admin-Token", "")
    email = get_admin(conn, token)
    if email:
        return email
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


# Каталог слайдов: фиксированный порядок по умолчанию, группа и объекты,
# по которым определяется готовность данных. Сами цифры слайд берёт
# из centerApi.model()/dashboard() на фронте — здесь не дублируются.
SLIDE_CATALOG = [
    {"key": "cover", "title": "Титульный слайд", "group": "intro",
     "data_kind": "fact", "checks": ["center.title"]},
    {"key": "premises", "title": "Предпосылки создания", "group": "intro",
     "data_kind": "fact", "checks": ["center.problem_statement", "center.rationale"]},
    {"key": "current_activity", "title": "Текущая деятельность", "group": "current",
     "data_kind": "fact", "checks": ["initiatives", "checkpoints", "results"]},
    {"key": "current_problems", "title": "Проблемы существующей модели", "group": "current",
     "data_kind": "calc", "checks": ["status_quo_risks"]},
    {"key": "goals", "title": "Цель и задачи Центра", "group": "target",
     "data_kind": "fact", "checks": ["goals"]},
    {"key": "functions", "title": "Функциональная модель", "group": "target",
     "data_kind": "fact", "checks": ["functions"]},
    {"key": "team", "title": "Текущая распределённая команда", "group": "current",
     "data_kind": "fact", "checks": ["participation"]},
    {"key": "workload", "title": "Объём работ", "group": "current",
     "data_kind": "fact", "checks": ["labor"]},
    {"key": "target_structure", "title": "Целевая организационная структура", "group": "target",
     "data_kind": "target", "checks": ["roles"]},
    {"key": "staffing", "title": "Обоснование численности", "group": "target",
     "data_kind": "calc", "checks": ["staffing"]},
    {"key": "competencies", "title": "Компетенции команды", "group": "target",
     "data_kind": "fact", "checks": ["coverage"]},
    {"key": "comparison", "title": "Сравнение текущей и целевой модели", "group": "target",
     "data_kind": "calc", "checks": ["target_functions"]},
    {"key": "effects", "title": "Ожидаемые эффекты", "group": "conclusion",
     "data_kind": "expert", "checks": ["center.expected_effects"]},
    {"key": "risks", "title": "Риски отказа от создания Центра", "group": "conclusion",
     "data_kind": "calc", "checks": ["status_quo_risks"]},
    {"key": "roadmap", "title": "Дорожная карта создания", "group": "conclusion",
     "data_kind": "expert", "checks": ["center.roadmap_text"]},
    {"key": "decisions", "title": "Необходимые решения", "group": "conclusion",
     "data_kind": "expert", "checks": ["narrative_text"]},
]
SLIDE_KEYS = {s["key"] for s in SLIDE_CATALOG}


def check_readiness(cur, center_id: int):
    """Готовность данных по объектам, на которые ссылаются слайды.
    Возвращает dict: имя_проверки -> bool (есть значимые данные)."""
    cur.execute(f"SELECT * FROM {SCHEMA}.exec_center WHERE id = %s", (center_id,))
    center = rows(cur)
    center = center[0] if center else {}

    def has_text(field):
        return bool(center.get(field))

    cur.execute(
        f"SELECT COUNT(*) AS n FROM {SCHEMA}.exec_center_goal "
        f"WHERE center_id = %s AND kind = 'goal'", (center_id,))
    goals_n = rows(cur)[0]["n"]

    cur.execute(
        f"SELECT COUNT(*) AS n FROM {SCHEMA}.exec_center_function WHERE center_id = %s",
        (center_id,))
    functions_n = rows(cur)[0]["n"]

    cur.execute(
        f"SELECT COUNT(*) AS n FROM {SCHEMA}.exec_center_role WHERE center_id = %s",
        (center_id,))
    roles_n = rows(cur)[0]["n"]

    cur.execute(
        f"SELECT COUNT(*) AS n FROM {SCHEMA}.exec_person_center_participation "
        f"WHERE center_id = %s", (center_id,))
    participation_n = rows(cur)[0]["n"]

    cur.execute(f"""
        SELECT COALESCE(SUM(a.plan_hours), 0) AS plan_hours
        FROM {SCHEMA}.exec_plan_assignee a
        JOIN {SCHEMA}.exec_plan_step s ON s.id = a.step_id
        WHERE s.status <> 'cancelled'
    """)
    plan_hours = float(rows(cur)[0]["plan_hours"] or 0)
    cur.execute(f"SELECT COALESCE(SUM(hours), 0) AS h FROM {SCHEMA}.exec_time_entry")
    fact_hours = float(rows(cur)[0]["h"] or 0)

    cur.execute(f"""
        SELECT COUNT(*) AS n FROM {SCHEMA}.exec_function_competency fc
        JOIN {SCHEMA}.exec_center_function f ON f.id = fc.function_id
        WHERE f.center_id = %s
    """, (center_id,))
    coverage_n = rows(cur)[0]["n"]

    cur.execute(f"""
        SELECT DISTINCT i.id FROM {SCHEMA}.exec_initiative i
        WHERE i.id = %s
           OR i.id IN (SELECT fi.initiative_id FROM {SCHEMA}.exec_function_initiative fi
                        JOIN {SCHEMA}.exec_center_function f ON f.id = fi.function_id
                       WHERE f.center_id = %s)
    """, (center["initiative_id"], center_id))
    initiatives_n = len(rows(cur))

    cur.execute(f"""
        SELECT COUNT(*) AS n FROM (
            SELECT id FROM {SCHEMA}.exec_milestone
            UNION ALL
            SELECT id FROM {SCHEMA}.exec_plan_step WHERE is_control_point = true
        ) x
    """)
    checkpoints_n = rows(cur)[0]["n"]

    cur.execute(f"SELECT COUNT(*) AS n FROM {SCHEMA}.exec_plan_step WHERE status = 'done'")
    results_n = rows(cur)[0]["n"]

    return {
        "center.title": bool(center.get("title")),
        "center.problem_statement": has_text("problem_statement"),
        "center.rationale": has_text("rationale"),
        "center.expected_effects": has_text("expected_effects"),
        "center.roadmap_text": has_text("roadmap_text"),
        "goals": goals_n > 0,
        "functions": functions_n > 0,
        "roles": roles_n > 0,
        "participation": participation_n > 0,
        "labor": plan_hours > 0 or fact_hours > 0,
        "coverage": coverage_n > 0,
        "initiatives": initiatives_n > 0,
        "checkpoints": checkpoints_n > 0,
        "results": results_n > 0,
        "status_quo_risks": functions_n > 0 or participation_n > 0,
        "target_functions": functions_n > 0,
        "staffing": functions_n > 0,
        "narrative_text": False,  # решает автор презентации вручную
    }


def slide_ready(checks, readiness):
    """Слайд готов, если хотя бы одна из проверяемых сущностей заполнена."""
    return any(readiness.get(c, False) for c in checks)


def deck_payload(cur, center_id: int):
    cur.execute(
        f"SELECT id, title, status FROM {SCHEMA}.exec_center WHERE id = %s", (center_id,))
    got = rows(cur)
    if not got:
        return None
    center = got[0]

    readiness = check_readiness(cur, center_id)

    cur.execute(
        f"SELECT * FROM {SCHEMA}.exec_center_deck_slide WHERE center_id = %s "
        f"ORDER BY order_index, id", (center_id,))
    overrides = {r["slide_key"]: r for r in rows(cur)}

    cur.execute(
        f"SELECT * FROM {SCHEMA}.exec_center_expert_value WHERE center_id = %s",
        (center_id,))
    expert_values = rows(cur)

    slides = []
    for idx, s in enumerate(SLIDE_CATALOG):
        ov = overrides.get(s["key"])
        ready = slide_ready(s["checks"], readiness)
        slides.append({
            "key": s["key"],
            "catalog_title": s["title"],
            "group": s["group"],
            "data_kind": s["data_kind"],
            "checks": s["checks"],
            "is_ready": ready,
            "missing_checks": [c for c in s["checks"] if not readiness.get(c, False)],
            "order_index": ov["order_index"] if ov else idx,
            "is_included": ov["is_included"] if ov else True,
            "title_override": ov["title_override"] if ov else None,
            "thesis_text": ov["thesis_text"] if ov else None,
            "narrative_text": ov["narrative_text"] if ov else None,
            "speaker_notes": ov["speaker_notes"] if ov else None,
            "has_override": ov is not None,
        })
    slides.sort(key=lambda x: x["order_index"])

    return {
        "center": center,
        "slides": slides,
        "expert_values": expert_values,
        "readiness": readiness,
    }


def handler(event: dict, context) -> dict:
    """Конструктор презентации обоснования Центра: слайды-надстройки над
    фактическими данными кабинета, экспертные оценки, порядок и видимость."""
    if event.get("httpMethod") == "OPTIONS":
        return cors({})

    qs = event.get("queryStringParameters") or {}
    headers = event.get("headers") or {}
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
        actor = authenticate(conn, headers)
        if not actor:
            return cors({"ok": False, "error": {"message": "Требуется вход"}}, 401)

        cur = conn.cursor()
        cid = as_int(qs.get("center_id")) or as_int(body.get("center_id"))

        if action == "deck":
            if not cid:
                cur.execute(f"""
                    SELECT id FROM {SCHEMA}.exec_center
                    ORDER BY (status <> 'archived') DESC, id DESC LIMIT 1
                """)
                got = rows(cur)
                if not got:
                    return cors({"ok": True, "data": {"center": None}})
                cid = got[0]["id"]
            data = deck_payload(cur, cid)
            if data is None:
                return cors({"ok": False, "error": {"message": "Центр не найден"}}, 404)
            return cors({"ok": True, "data": data})

        if action == "save_slide":
            key = nz(body.get("slide_key"))
            if not cid or key not in SLIDE_KEYS:
                return cors({"ok": False, "error": {"message": "Некорректный слайд"}}, 400)
            cur.execute(f"""
                INSERT INTO {SCHEMA}.exec_center_deck_slide
                    (center_id, slide_key, order_index, is_included,
                     title_override, thesis_text, narrative_text, speaker_notes)
                VALUES (%s, %s,
                    COALESCE(%s, (SELECT COALESCE(MAX(order_index), -1) + 1
                                    FROM {SCHEMA}.exec_center_deck_slide WHERE center_id = %s)),
                    COALESCE(%s, true), %s, %s, %s, %s)
                ON CONFLICT (center_id, slide_key) DO UPDATE SET
                    order_index = COALESCE(%s, {SCHEMA}.exec_center_deck_slide.order_index),
                    is_included = COALESCE(%s, {SCHEMA}.exec_center_deck_slide.is_included),
                    title_override = %s, thesis_text = %s,
                    narrative_text = %s, speaker_notes = %s, updated_at = now()
                RETURNING id
            """, (
                cid, key, as_int(body.get("order_index")), cid,
                body.get("is_included"), nz(body.get("title_override")),
                nz(body.get("thesis_text")), nz(body.get("narrative_text")),
                nz(body.get("speaker_notes")),
                as_int(body.get("order_index")), body.get("is_included"),
                nz(body.get("title_override")), nz(body.get("thesis_text")),
                nz(body.get("narrative_text")), nz(body.get("speaker_notes")),
            ))
            rid = cur.fetchone()[0]
            conn.commit()
            return cors({"ok": True, "data": {"id": rid}})

        if action == "reorder_slides":
            order = body.get("order") or []
            if not cid or not isinstance(order, list):
                return cors({"ok": False, "error": {"message": "Некорректный порядок"}}, 400)
            for idx, key in enumerate(order):
                if key not in SLIDE_KEYS:
                    continue
                cur.execute(f"""
                    INSERT INTO {SCHEMA}.exec_center_deck_slide
                        (center_id, slide_key, order_index)
                    VALUES (%s, %s, %s)
                    ON CONFLICT (center_id, slide_key) DO UPDATE
                    SET order_index = %s, updated_at = now()
                """, (cid, key, idx, idx))
            conn.commit()
            return cors({"ok": True, "data": {"updated": len(order)}})

        if action == "save_expert_value":
            key = nz(body.get("metric_key"))
            val = nz(body.get("value_text"))
            if not cid or not key or not val:
                return cors({"ok": False, "error": {
                    "message": "Укажите показатель и значение"}}, 400)
            cur.execute(f"""
                INSERT INTO {SCHEMA}.exec_center_expert_value
                    (center_id, metric_key, value_text, unit, comment, created_by)
                VALUES (%s, %s, %s, %s, %s, %s)
                ON CONFLICT (center_id, metric_key) DO UPDATE SET
                    value_text = EXCLUDED.value_text, unit = EXCLUDED.unit,
                    comment = EXCLUDED.comment, updated_at = now()
                RETURNING id
            """, (cid, key, val, nz(body.get("unit")), nz(body.get("comment")), actor))
            rid = cur.fetchone()[0]
            conn.commit()
            return cors({"ok": True, "data": {"id": rid}})

        if action == "delete_expert_value":
            rid = as_int(body.get("id"))
            if not rid:
                return cors({"ok": False, "error": {"message": "Не указана запись"}}, 400)
            cur.execute(
                f"DELETE FROM {SCHEMA}.exec_center_expert_value WHERE id = %s", (rid,))
            conn.commit()
            return cors({"ok": True, "data": {"id": rid}})

        return cors({"ok": False, "error": {"message": f"Неизвестное действие: {action}"}}, 400)
    finally:
        conn.close()