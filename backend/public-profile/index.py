"""
W10.1 Public Professional Profile — opt-in, consent-first.

GUARDRAILS:
  - private by default
  - no directory / search
  - no gaps / weak areas publicly
  - no auto-publish
  - show_* fields fully user-controlled

Session-auth actions (X-Session-Id):
  public_profile_get_me
  public_profile_upsert_me
  public_profile_generate_slug_me
  public_profile_publish_me
  public_profile_unpublish_me
  public_profile_preview_me

Anonymous (no auth):
  public_profile_get_by_slug
"""
import json
import os
import re
import uuid
import datetime
import psycopg2

DB = os.environ["DATABASE_URL"]
S  = os.environ.get("MAIN_DB_SCHEMA", "public")
BASE_URL = os.environ.get("APP_BASE_URL", "https://raven.moscow")


def resp(body: dict, code: int = 200) -> dict:
    return {
        "statusCode": code,
        "headers": {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, X-Session-Id",
            "Content-Type": "application/json",
        },
        "body": json.dumps(body, ensure_ascii=False, default=str),
    }


def fetch_one(conn, sql, params=None):
    with conn.cursor() as cur:
        cur.execute(sql, params)
        return cur.fetchone()


def fetch_all(conn, sql):
    with conn.cursor() as cur:
        cur.execute(sql)
        return cur.fetchall()


def get_user_id(conn, session_id: str):
    row = fetch_one(conn,
        f"SELECT user_id FROM {S}.sessions WHERE id=%s AND expires_at>NOW() LIMIT 1",
        (session_id,))
    return row[0] if row else None


def _slugify(text: str) -> str:
    """Транслит + slug."""
    tr = {
        'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'yo','ж':'zh',
        'з':'z','и':'i','й':'y','к':'k','л':'l','м':'m','н':'n','о':'o',
        'п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f','х':'kh','ц':'ts',
        'ч':'ch','ш':'sh','щ':'sch','ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya',
    }
    text = text.lower()
    result = ""
    for c in text:
        result += tr.get(c, c)
    result = re.sub(r'[^a-z0-9]+', '-', result).strip('-')
    return result[:40] or "pro"


def _generate_unique_slug(conn, base: str) -> str:
    slug = base
    attempt = 0
    while True:
        existing = fetch_one(conn, f"SELECT id FROM {S}.professional_public_profiles WHERE public_slug=%s LIMIT 1", (slug,))
        if not existing:
            return slug
        attempt += 1
        slug = f"{base}-{attempt}"
        if attempt > 99:
            slug = f"{base}-{uuid.uuid4().hex[:6]}"
            return slug


# ── Profile row → dict ────────────────────────────────────────────────

def _row_to_settings(r) -> dict:
    return {
        "id": r[0], "user_id": r[1], "is_published": r[2],
        "public_slug": r[3], "public_url": f"{BASE_URL}/p/{r[3]}",
        "public_title": r[4], "public_summary": r[5],
        "show_headline": r[6], "show_bio": r[7], "show_location": r[8],
        "show_roles": r[9], "show_experience": r[10], "show_education": r[11],
        "show_links": r[12], "show_competency_strengths": r[13],
        "show_verified_evidence_summary": r[14], "show_availability": r[15],
        "show_contact": r[16], "allow_indexing": r[17],
        "published_at": str(r[18]) if r[18] else None,
        "updated_at": str(r[19]),
    }


def _load_settings(conn, user_id: int) -> dict | None:
    row = fetch_one(conn, f"""
        SELECT id,user_id,is_published,public_slug,public_title,public_summary,
               show_headline,show_bio,show_location,show_roles,show_experience,
               show_education,show_links,show_competency_strengths,
               show_verified_evidence_summary,show_availability,show_contact,
               allow_indexing,published_at,updated_at
        FROM {S}.professional_public_profiles WHERE user_id={user_id} LIMIT 1
    """)
    return _row_to_settings(row) if row else None


# ── Public profile builder ────────────────────────────────────────────

def build_public_view(conn, user_id: int, settings: dict) -> dict:
    """Детерминистично собирает публичный профиль из паспорта + competencies."""
    pp = fetch_one(conn, f"""
        SELECT full_name, headline, short_bio, country, city,
               primary_role, secondary_roles_json, years_experience, career_stage,
               target_roles_json, links_json, avatar_url
        FROM {S}.professional_passports WHERE user_id={user_id} LIMIT 1
    """)
    if not pp:
        return {}

    view: dict = {}

    # Header — всегда
    view["full_name"]       = pp[0] or ""
    view["primary_role"]    = pp[5] or ""
    view["years_experience"]= pp[7]

    if settings.get("show_headline") and pp[1]:
        view["headline"] = pp[1]

    if settings.get("show_bio") and pp[2]:
        view["bio"] = settings.get("public_summary") or pp[2]

    if settings.get("show_location"):
        loc = " · ".join(filter(None, [pp[3], pp[4]]))
        if loc:
            view["location"] = loc

    if settings.get("show_roles"):
        view["secondary_roles"] = pp[6] or []

    if settings.get("show_links"):
        view["links"] = pp[10] or {}

    if settings.get("show_availability"):
        vis = fetch_one(conn, f"""
            SELECT available_for_roles, availability_note
            FROM {S}.professional_visibility_settings WHERE user_id={user_id} LIMIT 1
        """)
        if vis and vis[0]:
            view["available_for_roles"] = True
            view["availability_note"]   = vis[1] or ""

    # Experience
    if settings.get("show_experience"):
        rows = fetch_all(conn, f"""
            SELECT company_name, title, employment_type, start_date, end_date, is_current, description
            FROM {S}.professional_work_experience
            WHERE user_id={user_id} AND company_name!='[DELETED]'
            ORDER BY is_current DESC, start_date DESC NULLS LAST LIMIT 5
        """)
        view["experience"] = [{
            "company_name": r[0], "title": r[1], "employment_type": r[2],
            "start_date": str(r[3]) if r[3] else None,
            "end_date":   str(r[4]) if r[4] else None,
            "is_current": r[5],
            "description": (r[6] or "")[:200],
        } for r in rows]

    # Education
    if settings.get("show_education"):
        rows = fetch_all(conn, f"""
            SELECT institution, degree, field_of_study, start_date, end_date, is_current
            FROM {S}.professional_education
            WHERE user_id={user_id} AND institution!='[DELETED]'
            ORDER BY is_current DESC, start_date DESC NULLS LAST LIMIT 5
        """)
        view["education"] = [{
            "institution": r[0], "degree": r[1], "field_of_study": r[2],
            "start_date": str(r[3]) if r[3] else None,
            "end_date":   str(r[4]) if r[4] else None,
            "is_current": r[5],
        } for r in rows]

    # Competency strengths — только если включено, ТОЛЬКО сильные стороны
    if settings.get("show_competency_strengths"):
        rows = fetch_all(conn, f"""
            SELECT c.name, uc.current_level
            FROM {S}.professional_user_competencies uc
            JOIN {S}.professional_competencies c ON c.id=uc.competency_id
            WHERE uc.user_id={user_id} AND uc.current_level >= 3
            ORDER BY uc.current_level DESC LIMIT 6
        """)
        if rows:
            view["strengths"] = [{"name": r[0], "level": r[1]} for r in rows]

    # Verified evidence summary — только count, без деталей gaps
    if settings.get("show_verified_evidence_summary"):
        ev_count = (fetch_one(conn, f"""
            SELECT COUNT(*) FROM {S}.professional_competency_evidence ev
            JOIN {S}.professional_user_competencies uc ON uc.id=ev.user_competency_id
            WHERE uc.user_id={user_id} AND ev.evidence_type='learning_completion'
        """) or [0])[0]
        assessed_count = (fetch_one(conn, f"""
            SELECT COUNT(*) FROM {S}.professional_user_competencies
            WHERE user_id={user_id} AND current_level>0
        """) or [0])[0]
        view["verified_signals"] = {
            "learning_evidence_count": ev_count,
            "competencies_assessed": assessed_count,
        }

    return view


# ── Actions ───────────────────────────────────────────────────────────

def action_get_me(conn, user_id: int):
    settings = _load_settings(conn, user_id)
    return resp({"settings": settings})


def action_upsert_me(conn, user_id: int, body: dict):
    settings = _load_settings(conn, user_id)
    BOOL_FIELDS = [
        "show_headline","show_bio","show_location","show_roles","show_experience",
        "show_education","show_links","show_competency_strengths",
        "show_verified_evidence_summary","show_availability","show_contact",
        "allow_indexing",
    ]
    STR_FIELDS = ["public_title","public_summary"]

    if settings:
        # UPDATE
        fields, vals = [], []
        for f in BOOL_FIELDS:
            if f in body:
                fields.append(f"{f}=%s"); vals.append(bool(body[f]))
        for f in STR_FIELDS:
            if f in body:
                fields.append(f"{f}=%s"); vals.append(body[f] or None)
        if fields:
            fields.append("updated_at=NOW()"); vals.append(user_id)
            with conn.cursor() as cur:
                cur.execute(f"UPDATE {S}.professional_public_profiles SET {','.join(fields)} WHERE user_id=%s", vals)
            conn.commit()
    else:
        # INSERT с автослагом
        pp = fetch_one(conn, f"SELECT full_name FROM {S}.professional_passports WHERE user_id={user_id} LIMIT 1")
        base = _slugify((pp[0] if pp else "") or f"user{user_id}")
        slug = _generate_unique_slug(conn, base)
        with conn.cursor() as cur:
            cur.execute(f"""
                INSERT INTO {S}.professional_public_profiles
                    (user_id, public_slug)
                VALUES(%s,%s)
            """, (user_id, slug))
        conn.commit()

        # Применяем поля из body
        settings_after = _load_settings(conn, user_id)
        if settings_after and body:
            return action_upsert_me(conn, user_id, body)

    return resp({"ok": True, "settings": _load_settings(conn, user_id)})


def action_generate_slug_me(conn, user_id: int, body: dict):
    hint = (body.get("hint") or "").strip()
    if not hint:
        pp = fetch_one(conn, f"SELECT full_name FROM {S}.professional_passports WHERE user_id={user_id} LIMIT 1")
        hint = (pp[0] if pp else "") or f"user{user_id}"
    base = _slugify(hint)
    slug = _generate_unique_slug(conn, base)
    # Обновляем
    existing = fetch_one(conn, f"SELECT id FROM {S}.professional_public_profiles WHERE user_id={user_id} LIMIT 1")
    if existing:
        with conn.cursor() as cur:
            cur.execute(f"UPDATE {S}.professional_public_profiles SET public_slug=%s,updated_at=NOW() WHERE user_id=%s", (slug, user_id))
        conn.commit()
    return resp({"ok": True, "public_slug": slug, "public_url": f"{BASE_URL}/p/{slug}"})


def action_publish_me(conn, user_id: int):
    existing = fetch_one(conn, f"SELECT id FROM {S}.professional_public_profiles WHERE user_id={user_id} LIMIT 1")
    if not existing:
        # Создаём запись с дефолтами
        action_upsert_me(conn, user_id, {})
    with conn.cursor() as cur:
        cur.execute(f"""
            UPDATE {S}.professional_public_profiles
            SET is_published=TRUE, published_at=COALESCE(published_at,NOW()), updated_at=NOW()
            WHERE user_id=%s
        """, (user_id,))
    conn.commit()
    settings = _load_settings(conn, user_id)
    return resp({"ok": True, "settings": settings})


def action_unpublish_me(conn, user_id: int):
    with conn.cursor() as cur:
        cur.execute(f"UPDATE {S}.professional_public_profiles SET is_published=FALSE,updated_at=NOW() WHERE user_id=%s", (user_id,))
    conn.commit()
    return resp({"ok": True})


def action_preview_me(conn, user_id: int):
    """Preview без проверки is_published."""
    settings = _load_settings(conn, user_id)
    if not settings:
        action_upsert_me(conn, user_id, {})
        settings = _load_settings(conn, user_id)
    view = build_public_view(conn, user_id, settings or {})
    return resp({"preview": view, "settings": settings})


def action_get_by_slug(conn, slug: str):
    """Анонимное чтение публичного профиля."""
    row = fetch_one(conn, f"""
        SELECT id,user_id,is_published,public_slug,public_title,public_summary,
               show_headline,show_bio,show_location,show_roles,show_experience,
               show_education,show_links,show_competency_strengths,
               show_verified_evidence_summary,show_availability,show_contact,
               allow_indexing,published_at,updated_at
        FROM {S}.professional_public_profiles WHERE public_slug=%s LIMIT 1
    """, (slug,))
    if not row:
        return resp({"error": "not_found"}, 404)
    settings = _row_to_settings(row)
    if not settings["is_published"]:
        return resp({"error": "not_published"}, 404)
    user_id = settings["user_id"]
    view = build_public_view(conn, user_id, settings)
    return resp({
        "profile": view,
        "meta": {
            "slug": slug,
            "public_url": settings["public_url"],
            "allow_indexing": settings["allow_indexing"],
            "published_at": settings["published_at"],
        },
    })


# ── Handler ───────────────────────────────────────────────────────────

def handler(event: dict, context) -> dict:
    """W10.1 Public Professional Profile — opt-in, consent-first."""
    headers = event.get("headers") or {}
    method  = event.get("httpMethod", "GET")

    if method == "OPTIONS":
        return resp({}, 200)

    qs     = event.get("queryStringParameters") or {}
    action = qs.get("action", "")
    body   = {}
    if event.get("body"):
        try:
            body = json.loads(event["body"])
        except Exception:
            pass

    # Анонимный public read
    if action == "public_profile_get_by_slug":
        slug = qs.get("slug") or body.get("slug", "")
        if not slug:
            return resp({"error": "slug required"}, 400)
        conn = psycopg2.connect(DB)
        try:
            return action_get_by_slug(conn, slug.lower().strip())
        finally:
            conn.close()

    # Session-based actions
    session_id = headers.get("x-session-id") or headers.get("X-Session-Id") or ""
    if not session_id:
        return resp({"error": "unauthorized"}, 401)

    conn = psycopg2.connect(DB)
    try:
        user_id = get_user_id(conn, session_id)
        if not user_id:
            return resp({"error": "unauthorized"}, 401)

        if action == "public_profile_get_me":
            return action_get_me(conn, user_id)
        if action == "public_profile_upsert_me":
            if method != "POST": return resp({"error": "POST required"}, 405)
            return action_upsert_me(conn, user_id, body)
        if action == "public_profile_generate_slug_me":
            if method != "POST": return resp({"error": "POST required"}, 405)
            return action_generate_slug_me(conn, user_id, body)
        if action == "public_profile_publish_me":
            if method != "POST": return resp({"error": "POST required"}, 405)
            return action_publish_me(conn, user_id)
        if action == "public_profile_unpublish_me":
            if method != "POST": return resp({"error": "POST required"}, 405)
            return action_unpublish_me(conn, user_id)
        if action == "public_profile_preview_me":
            return action_preview_me(conn, user_id)

        return resp({"error": "unknown action"}, 400)
    finally:
        conn.close()
