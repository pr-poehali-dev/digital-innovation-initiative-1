"""
W8.1 Professional Competency Map — PM/Operations vertical.

Actions (framework):
  professional_domains_list
  professional_competencies_list
  professional_competency_upsert
  professional_competency_delete

Actions (role profiles):
  professional_role_profiles_list
  professional_role_profile_get
  professional_role_profile_upsert
  professional_role_profile_targets_upsert

Actions (user map):
  professional_user_competency_map_get
  professional_user_competency_upsert
  professional_competency_evidence_add
  professional_competency_evidence_delete
  professional_competency_gap_summary
"""
import json
import os
import psycopg2

DB     = os.environ["DATABASE_URL"]
SCHEMA = os.environ.get("MAIN_DB_SCHEMA", "public")
S      = SCHEMA


def resp(body: dict, code: int = 200, origin: str = "") -> dict:
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
    with conn.cursor() as cur:
        cur.execute(
            f"SELECT email FROM {S}.admin_sessions WHERE token=%s AND expires_at>NOW() LIMIT 1",
            (token,),
        )
        row = cur.fetchone()
    return {"email": row[0]} if row else None


def fetch_all(conn, sql, params=None):
    with conn.cursor() as cur:
        cur.execute(sql, params)
        return cur.fetchall()


def fetch_one(conn, sql, params=None):
    with conn.cursor() as cur:
        cur.execute(sql, params)
        return cur.fetchone()


# ── Framework ─────────────────────────────────────────────────────────

def action_domains_list(conn):
    rows = fetch_all(conn, f"""
        SELECT d.id, d.vertical_key, d.code, d.name, d.description, d.sort_order,
               COUNT(c.id) AS competency_count
        FROM {S}.professional_competency_domains d
        LEFT JOIN {S}.professional_competencies c ON c.domain_id = d.id AND c.status='active'
        GROUP BY d.id ORDER BY d.sort_order
    """)
    return resp({"domains": [{
        "id": r[0], "vertical_key": r[1], "code": r[2], "name": r[3],
        "description": r[4], "sort_order": r[5], "competency_count": r[6] or 0,
    } for r in rows]})


def action_competencies_list(conn, qs):
    domain_id = qs.get("domain_id")
    where = f"AND c.domain_id={int(domain_id)}" if domain_id else ""
    rows = fetch_all(conn, f"""
        SELECT c.id, c.domain_id, d.name AS domain_name, c.code, c.name,
               c.description, c.level_descriptors_json, c.status, c.sort_order
        FROM {S}.professional_competencies c
        JOIN {S}.professional_competency_domains d ON d.id = c.domain_id
        WHERE c.status='active' {where}
        ORDER BY d.sort_order, c.sort_order
    """)
    return resp({"competencies": [{
        "id": r[0], "domain_id": r[1], "domain_name": r[2], "code": r[3],
        "name": r[4], "description": r[5],
        "level_descriptors": r[6] if isinstance(r[6], dict) else {},
        "status": r[7], "sort_order": r[8],
    } for r in rows]})


def action_competency_upsert(conn, body):
    """Создать или обновить компетенцию."""
    cid = body.get("id")
    domain_id = body.get("domain_id")
    name = (body.get("name") or "").strip()
    if not name or not domain_id:
        return resp({"error": "name and domain_id required"}, 400)

    level_desc = json.dumps(body.get("level_descriptors", {}), ensure_ascii=False)
    if cid:
        with conn.cursor() as cur:
            cur.execute(f"""
                UPDATE {S}.professional_competencies
                SET name=%s, description=%s, level_descriptors_json=%s::jsonb, updated_at=NOW()
                WHERE id=%s
            """, (name, body.get("description", ""), level_desc, int(cid)))
        conn.commit()
        return resp({"ok": True, "id": cid})
    else:
        sort_order = (fetch_one(conn, f"SELECT COALESCE(MAX(sort_order),0)+1 FROM {S}.professional_competencies WHERE domain_id=%s", (int(domain_id),)) or [1])[0]
        with conn.cursor() as cur:
            cur.execute(f"""
                INSERT INTO {S}.professional_competencies
                  (domain_id, code, name, description, level_descriptors_json, sort_order)
                VALUES(%s,%s,%s,%s,%s::jsonb,%s) RETURNING id
            """, (int(domain_id), body.get("code", f"CUSTOM_{int(domain_id)}_{sort_order}"),
                  name, body.get("description", ""), level_desc, sort_order))
            new_id = cur.fetchone()[0]
        conn.commit()
        return resp({"ok": True, "id": new_id})


def action_competency_delete(conn, body):
    cid = body.get("id")
    if not cid:
        return resp({"error": "id required"}, 400)
    with conn.cursor() as cur:
        cur.execute(f"UPDATE {S}.professional_competencies SET status='archived' WHERE id=%s", (int(cid),))
    conn.commit()
    return resp({"ok": True})


# ── Role Profiles ─────────────────────────────────────────────────────

def action_role_profiles_list(conn):
    rows = fetch_all(conn, f"""
        SELECT r.id, r.vertical_key, r.code, r.name, r.description, r.created_at,
               COUNT(t.id) AS target_count
        FROM {S}.professional_role_profiles r
        LEFT JOIN {S}.professional_role_competency_targets t ON t.role_profile_id=r.id
        GROUP BY r.id ORDER BY r.id
    """)
    return resp({"role_profiles": [{
        "id": r[0], "vertical_key": r[1], "code": r[2], "name": r[3],
        "description": r[4], "created_at": str(r[5]), "target_count": r[6] or 0,
    } for r in rows]})


def action_role_profile_get(conn, rid):
    row = fetch_one(conn, f"SELECT id,vertical_key,code,name,description FROM {S}.professional_role_profiles WHERE id=%s LIMIT 1", (rid,))
    if not row:
        return resp({"error": "not_found"}, 404)
    targets = fetch_all(conn, f"""
        SELECT t.competency_id, c.code, c.name, d.name AS domain_name,
               t.target_level, t.importance, c.level_descriptors_json
        FROM {S}.professional_role_competency_targets t
        JOIN {S}.professional_competencies c ON c.id=t.competency_id
        JOIN {S}.professional_competency_domains d ON d.id=c.domain_id
        WHERE t.role_profile_id=%s
        ORDER BY d.sort_order, c.sort_order
    """, (rid,))
    return resp({"role_profile": {
        "id": row[0], "vertical_key": row[1], "code": row[2],
        "name": row[3], "description": row[4],
        "targets": [{
            "competency_id": t[0], "code": t[1], "name": t[2], "domain_name": t[3],
            "target_level": t[4], "importance": t[5],
            "level_descriptors": t[6] if isinstance(t[6], dict) else {},
        } for t in targets],
    }})


def action_role_profile_upsert(conn, body):
    rid = body.get("id")
    name = (body.get("name") or "").strip()
    if not name:
        return resp({"error": "name required"}, 400)
    if rid:
        with conn.cursor() as cur:
            cur.execute(f"UPDATE {S}.professional_role_profiles SET name=%s,description=%s,updated_at=NOW() WHERE id=%s",
                        (name, body.get("description",""), int(rid)))
        conn.commit()
        return resp({"ok": True, "id": rid})
    else:
        with conn.cursor() as cur:
            cur.execute(f"""
                INSERT INTO {S}.professional_role_profiles (vertical_key, code, name, description)
                VALUES(%s,%s,%s,%s) RETURNING id
            """, (body.get("vertical_key","pm_operations"),
                  body.get("code", name.lower().replace(" ","_")[:32]),
                  name, body.get("description","")))
            new_id = cur.fetchone()[0]
        conn.commit()
        return resp({"ok": True, "id": new_id})


def action_role_profile_targets_upsert(conn, body):
    """Upsert список targets для роли."""
    rid = body.get("role_profile_id")
    targets = body.get("targets", [])
    if not rid:
        return resp({"error": "role_profile_id required"}, 400)
    for t in targets:
        cid = t.get("competency_id")
        level = int(t.get("target_level", 3))
        imp = t.get("importance","important")
        with conn.cursor() as cur:
            cur.execute(f"""
                INSERT INTO {S}.professional_role_competency_targets
                    (role_profile_id, competency_id, target_level, importance)
                VALUES(%s,%s,%s,%s)
                ON CONFLICT (role_profile_id, competency_id)
                DO UPDATE SET target_level=%s, importance=%s, updated_at=NOW()
            """, (int(rid), int(cid), level, imp, level, imp))
    conn.commit()
    return resp({"ok": True, "updated": len(targets)})


# ── User Competency Map ───────────────────────────────────────────────

def action_user_competency_map_get(conn, qs):
    """Полная карта компетенций пользователя с target для роли."""
    user_id = qs.get("user_id")
    role_id = qs.get("role_id")
    if not user_id:
        return resp({"error": "user_id required"}, 400)
    uid = int(user_id)

    comp_rows = fetch_all(conn, f"""
        SELECT c.id, c.code, c.name, d.id AS domain_id, d.name AS domain_name,
               c.level_descriptors_json,
               uc.id AS uc_id, uc.current_level, uc.confidence, uc.last_assessed_at,
               COUNT(ev.id) AS evidence_count
        FROM {S}.professional_competencies c
        JOIN {S}.professional_competency_domains d ON d.id=c.domain_id
        LEFT JOIN {S}.professional_user_competencies uc ON uc.competency_id=c.id AND uc.user_id={uid}
        LEFT JOIN {S}.professional_competency_evidence ev ON ev.user_competency_id=uc.id
        WHERE c.status='active'
        GROUP BY c.id, d.id, uc.id
        ORDER BY d.sort_order, c.sort_order
    """)

    target_map = {}
    if role_id:
        t_rows = fetch_all(conn, f"""
            SELECT competency_id, target_level, importance
            FROM {S}.professional_role_competency_targets
            WHERE role_profile_id={int(role_id)}
        """)
        target_map = {r[0]: {"target_level": r[1], "importance": r[2]} for r in t_rows}

    items = []
    for r in comp_rows:
        t = target_map.get(r[0], {})
        current = r[7] or 0
        target  = t.get("target_level", 0)
        items.append({
            "competency_id": r[0], "code": r[1], "name": r[2],
            "domain_id": r[3], "domain_name": r[4],
            "level_descriptors": r[5] if isinstance(r[5], dict) else {},
            "uc_id": r[6],
            "current_level": current,
            "confidence": r[8] or "none",
            "last_assessed_at": str(r[9]) if r[9] else None,
            "evidence_count": r[10] or 0,
            "target_level": target,
            "importance": t.get("importance",""),
            "gap": max(0, target - current) if target else 0,
        })

    return resp({"map": items, "user_id": uid, "role_id": int(role_id) if role_id else None})


def action_user_competency_upsert(conn, body):
    """Установить / обновить уровень компетенции пользователя."""
    user_id      = body.get("user_id")
    competency_id= body.get("competency_id")
    level        = int(body.get("current_level", 0))
    confidence   = body.get("confidence","medium")
    if not user_id or not competency_id:
        return resp({"error": "user_id and competency_id required"}, 400)
    with conn.cursor() as cur:
        cur.execute(f"""
            INSERT INTO {S}.professional_user_competencies
                (user_id, competency_id, current_level, confidence, last_assessed_at, updated_at)
            VALUES(%s,%s,%s,%s,NOW(),NOW())
            ON CONFLICT (user_id, competency_id)
            DO UPDATE SET current_level=%s, confidence=%s, last_assessed_at=NOW(), updated_at=NOW()
            RETURNING id
        """, (int(user_id), int(competency_id), level, confidence, level, confidence))
        uc_id = cur.fetchone()[0]
    conn.commit()
    return resp({"ok": True, "uc_id": uc_id})


def action_competency_evidence_add(conn, body):
    uc_id = body.get("user_competency_id")
    title = (body.get("title") or "").strip()
    if not uc_id or not title:
        return resp({"error": "user_competency_id and title required"}, 400)
    etype = body.get("evidence_type","self_assessment")
    with conn.cursor() as cur:
        cur.execute(f"""
            INSERT INTO {S}.professional_competency_evidence
                (user_competency_id, evidence_type, title, description, score, weight, source_ref)
            VALUES(%s,%s,%s,%s,%s,%s,%s) RETURNING id
        """, (int(uc_id), etype, title,
              body.get("description",""),
              body.get("score"),
              body.get("weight"),
              body.get("source_ref")))
        ev_id = cur.fetchone()[0]
    conn.commit()
    return resp({"ok": True, "id": ev_id})


def action_competency_evidence_delete(conn, body):
    eid = body.get("id")
    if not eid:
        return resp({"error": "id required"}, 400)
    with conn.cursor() as cur:
        cur.execute(f"UPDATE {S}.professional_competency_evidence SET title=title WHERE id=%s RETURNING id", (int(eid),))
    # Soft: просто помечаем через отдельный подход — обнуляем score как сигнал
    with conn.cursor() as cur:
        cur.execute(f"UPDATE {S}.professional_competency_evidence SET score=NULL WHERE id=%s", (int(eid),))
    conn.commit()
    return resp({"ok": True})


def action_competency_gap_summary(conn, qs):
    """Детерминистичный gap-анализ: strengths, critical_gaps, quick_wins."""
    user_id = qs.get("user_id")
    role_id = qs.get("role_id")
    if not user_id or not role_id:
        return resp({"error": "user_id and role_id required"}, 400)
    uid = int(user_id)
    rid = int(role_id)

    rows = fetch_all(conn, f"""
        SELECT c.id, c.name, uc.current_level, t.target_level, t.importance,
               COUNT(ev.id) AS ev_count, uc.confidence
        FROM {S}.professional_role_competency_targets t
        JOIN {S}.professional_competencies c ON c.id=t.competency_id
        LEFT JOIN {S}.professional_user_competencies uc ON uc.competency_id=c.id AND uc.user_id={uid}
        LEFT JOIN {S}.professional_competency_evidence ev ON ev.user_competency_id=uc.id
        WHERE t.role_profile_id={rid}
        GROUP BY c.id, uc.current_level, t.target_level, t.importance, uc.confidence
        ORDER BY t.importance DESC, t.target_level DESC
    """)

    strengths, critical_gaps, quick_wins, next_comps = [], [], [], []
    for r in rows:
        cid, name, cur_lv, tgt_lv, imp, ev_cnt, conf = r
        cur_lv = cur_lv or 0
        gap    = max(0, tgt_lv - cur_lv)

        if cur_lv >= tgt_lv:
            strengths.append({"id": cid, "name": name, "level": cur_lv, "importance": imp})
        elif gap >= 2 and imp in ("core","important"):
            critical_gaps.append({"id": cid, "name": name, "gap": gap, "current": cur_lv, "target": tgt_lv, "importance": imp})
        elif gap == 1:
            quick_wins.append({"id": cid, "name": name, "current": cur_lv, "target": tgt_lv, "evidence_count": ev_cnt})

        if gap > 0 and imp == "core":
            next_comps.append({"id": cid, "name": name, "gap": gap, "importance": imp})

    total     = len(rows)
    assessed  = sum(1 for r in rows if r[2] is not None)
    on_target = len(strengths)

    return resp({"gap_summary": {
        "total_competencies": total,
        "assessed": assessed,
        "on_target": on_target,
        "coverage_pct": round(assessed / total * 100) if total else 0,
        "strengths":     strengths[:8],
        "critical_gaps": critical_gaps[:8],
        "quick_wins":    quick_wins[:5],
        "recommended_next": next_comps[:3],
    }})


# ── W8.2 Passport ────────────────────────────────────────────────────

PASSPORT_FIELDS = [
    "full_name","headline","short_bio","country","city","timezone",
    "primary_role","years_experience","career_stage","avatar_url",
]
PASSPORT_JSON_FIELDS = [
    "languages_json","secondary_roles_json","target_roles_json",
    "development_interests_json","industries_json","work_preferences_json",
    "career_goals_json","links_json",
]
PASSPORT_JSON_KEYS = [f.replace("_json","") for f in PASSPORT_JSON_FIELDS]


def _get_user_id(conn, session_id: str):
    row = fetch_one(conn,
        f"SELECT user_id FROM {S}.sessions WHERE id=%s AND expires_at>NOW() LIMIT 1",
        (session_id,))
    return row[0] if row else None


def action_passport_get_me(conn, user_id):
    row = fetch_one(conn, f"""
        SELECT id,full_name,headline,short_bio,country,city,timezone,
               languages_json,primary_role,secondary_roles_json,years_experience,career_stage,
               target_roles_json,development_interests_json,industries_json,
               work_preferences_json,career_goals_json,links_json,avatar_url,
               created_at,updated_at
        FROM {S}.professional_passports WHERE user_id=%s LIMIT 1
    """, (user_id,))
    if not row:
        return resp({"passport": None})
    return resp({"passport": {
        "id": row[0], "full_name": row[1], "headline": row[2], "short_bio": row[3],
        "country": row[4], "city": row[5], "timezone": row[6],
        "languages": row[7] or [], "primary_role": row[8],
        "secondary_roles": row[9] or [], "years_experience": row[10],
        "career_stage": row[11],
        "target_roles": row[12] or [], "development_interests": row[13] or [],
        "industries": row[14] or [], "work_preferences": row[15] or {},
        "career_goals": row[16] or [], "links": row[17] or {},
        "avatar_url": row[18],
        "created_at": str(row[19]), "updated_at": str(row[20]),
    }})


def action_passport_upsert_me(conn, user_id, body):
    # Check exists
    exists = fetch_one(conn, f"SELECT id FROM {S}.professional_passports WHERE user_id=%s LIMIT 1", (user_id,))
    if exists:
        fields, vals = [], []
        for f in PASSPORT_FIELDS:
            if f in body:
                fields.append(f"{f}=%s"); vals.append(body[f])
        for f, key in zip(PASSPORT_JSON_FIELDS, PASSPORT_JSON_KEYS):
            if key in body:
                fields.append(f"{f}=%s"); vals.append(json.dumps(body[key], ensure_ascii=False))
        if fields:
            fields.append("updated_at=NOW()"); vals.append(user_id)
            with conn.cursor() as cur:
                cur.execute(f"UPDATE {S}.professional_passports SET {','.join(fields)} WHERE user_id=%s", vals)
            conn.commit()
    else:
        # Insert
        cols, phs, vals = ["user_id"], ["%s"], [user_id]
        for f in PASSPORT_FIELDS:
            if f in body:
                cols.append(f); phs.append("%s"); vals.append(body[f])
        for f, key in zip(PASSPORT_JSON_FIELDS, PASSPORT_JSON_KEYS):
            if key in body:
                cols.append(f); phs.append("%s"); vals.append(json.dumps(body[key], ensure_ascii=False))
        with conn.cursor() as cur:
            cur.execute(f"INSERT INTO {S}.professional_passports ({','.join(cols)}) VALUES ({','.join(phs)})", vals)
        conn.commit()
    return resp({"ok": True})


def action_passport_completion_me(conn, user_id):
    """Детерминистичный расчёт % заполненности."""
    p = fetch_one(conn, f"""
        SELECT full_name,headline,short_bio,primary_role,
               languages_json,target_roles_json,development_interests_json,
               links_json,career_goals_json,years_experience,career_stage
        FROM {S}.professional_passports WHERE user_id=%s LIMIT 1
    """, (user_id,))
    edu_cnt  = (fetch_one(conn, f"SELECT COUNT(*) FROM {S}.professional_education WHERE user_id=%s", (user_id,)) or [0])[0]
    work_cnt = (fetch_one(conn, f"SELECT COUNT(*) FROM {S}.professional_work_experience WHERE user_id=%s", (user_id,)) or [0])[0]
    vis      = fetch_one(conn, f"SELECT profile_visibility FROM {S}.professional_visibility_settings WHERE user_id=%s LIMIT 1", (user_id,))

    blocks = []
    pct = 0

    # Basic profile (30%)
    basic_score = 0
    if p:
        if p[0]: basic_score += 8   # full_name
        if p[1]: basic_score += 7   # headline
        if p[2]: basic_score += 5   # short_bio
        if p[3]: basic_score += 5   # primary_role
        if p[10]: basic_score += 3  # career_stage
        if p[9]:  basic_score += 2  # years_experience
    blocks.append({"key":"basic","label":"Базовый профиль","score":basic_score,"max":30,"done": basic_score>=20})
    pct += basic_score

    # Career direction (20%)
    dir_score = 0
    if p:
        if p[5] and (p[5] if isinstance(p[5], list) else []):  dir_score += 7   # target_roles
        if p[6] and (p[6] if isinstance(p[6], list) else []):  dir_score += 7   # dev interests
        if p[8] and (p[8] if isinstance(p[8], list) else []):  dir_score += 6   # career_goals
    blocks.append({"key":"direction","label":"Направление развития","score":dir_score,"max":20,"done": dir_score>=14})
    pct += dir_score

    # Education (15%)
    edu_score = min(15, edu_cnt * 15)
    blocks.append({"key":"education","label":"Образование","score":edu_score,"max":15,"done": edu_cnt > 0})
    pct += edu_score

    # Work experience (20%)
    work_score = min(20, work_cnt * 10)
    blocks.append({"key":"experience","label":"Опыт работы","score":work_score,"max":20,"done": work_cnt > 0})
    pct += work_score

    # Visibility (10%)
    vis_score = 10 if vis else 0
    blocks.append({"key":"visibility","label":"Настройки видимости","score":vis_score,"max":10,"done": vis is not None})
    pct += vis_score

    # Links (5%)
    links_score = 0
    if p and p[7] and isinstance(p[7], dict) and p[7]:
        links_score = 5
    blocks.append({"key":"links","label":"Ссылки / портфолио","score":links_score,"max":5,"done": links_score > 0})
    pct += links_score

    missing = [b["label"] for b in blocks if not b["done"]]
    next_step = missing[0] if missing else None

    return resp({"completion": {"total_pct": min(pct, 100), "blocks": blocks, "missing": missing, "next_step": next_step}})


def action_passport_summary_me(conn, user_id):
    """Read-only срез: компетенции из W8.1 + passport meta."""
    passport = action_passport_get_me(conn, user_id)
    # Competency snapshot
    comp_rows = fetch_all(conn, f"""
        SELECT uc.competency_id, c.name, uc.current_level, COUNT(ev.id) as ev_count
        FROM {S}.professional_user_competencies uc
        JOIN {S}.professional_competencies c ON c.id=uc.competency_id
        LEFT JOIN {S}.professional_competency_evidence ev ON ev.user_competency_id=uc.id
        WHERE uc.user_id={user_id} AND uc.current_level>0
        GROUP BY uc.competency_id, c.name, uc.current_level
        ORDER BY uc.current_level DESC
    """)
    total_assessed = len(comp_rows)
    total_evidence = sum(r[3] or 0 for r in comp_rows)
    strengths = [{"name": r[1], "level": r[2]} for r in comp_rows if r[2] >= 3][:5]
    assessed_levels = [r[2] for r in comp_rows]
    avg_level = round(sum(assessed_levels)/len(assessed_levels), 1) if assessed_levels else 0
    last_update = fetch_one(conn, f"SELECT MAX(updated_at) FROM {S}.professional_user_competencies WHERE user_id={user_id}")
    return resp({
        "summary": {
            "passport": passport.get("body", "{}"),
            "competency_snapshot": {
                "total_assessed": total_assessed,
                "total_evidence": total_evidence,
                "average_level": avg_level,
                "strengths": strengths,
                "last_map_update": str(last_update[0]) if last_update and last_update[0] else None,
            }
        }
    })


# ── Education CRUD ────────────────────────────────────────────────────

def action_education_list_me(conn, user_id):
    rows = fetch_all(conn, f"""
        SELECT id,institution,degree,field_of_study,start_date,end_date,is_current,description,created_at
        FROM {S}.professional_education WHERE user_id={user_id} ORDER BY start_date DESC NULLS LAST, created_at DESC
    """)
    return resp({"education": [{
        "id": r[0], "institution": r[1], "degree": r[2], "field_of_study": r[3],
        "start_date": str(r[4]) if r[4] else None, "end_date": str(r[5]) if r[5] else None,
        "is_current": r[6], "description": r[7], "created_at": str(r[8]),
    } for r in rows]})


def action_education_upsert_me(conn, user_id, body):
    eid = body.get("id")
    inst = (body.get("institution") or "").strip()
    if not inst: return resp({"error": "institution required"}, 400)
    sd = body.get("start_date") or None
    ed = body.get("end_date") or None
    if eid:
        with conn.cursor() as cur:
            cur.execute(f"""
                UPDATE {S}.professional_education
                SET institution=%s,degree=%s,field_of_study=%s,start_date=%s,end_date=%s,
                    is_current=%s,description=%s,updated_at=NOW()
                WHERE id=%s AND user_id=%s
            """, (inst, body.get("degree",""), body.get("field_of_study",""),
                  sd, ed, bool(body.get("is_current")), body.get("description",""),
                  int(eid), user_id))
        conn.commit()
        return resp({"ok": True, "id": eid})
    else:
        with conn.cursor() as cur:
            cur.execute(f"""
                INSERT INTO {S}.professional_education
                    (user_id,institution,degree,field_of_study,start_date,end_date,is_current,description)
                VALUES(%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id
            """, (user_id, inst, body.get("degree",""), body.get("field_of_study",""),
                  sd, ed, bool(body.get("is_current")), body.get("description","")))
            new_id = cur.fetchone()[0]
        conn.commit()
        return resp({"ok": True, "id": new_id})


def action_education_delete_me(conn, user_id, body):
    eid = body.get("id")
    if not eid: return resp({"error": "id required"}, 400)
    with conn.cursor() as cur:
        cur.execute(f"UPDATE {S}.professional_education SET institution=institution WHERE id=%s AND user_id=%s RETURNING id",
                    (int(eid), user_id))
        if not cur.fetchone(): return resp({"error": "not found"}, 404)
    with conn.cursor() as cur:
        cur.execute(f"UPDATE {S}.professional_education SET updated_at=NOW() WHERE id=%s", (int(eid),))
    # soft delete via description mark — actually hard delete is ok here
    # We can't use DELETE per platform rules, so we mark with empty institution
    with conn.cursor() as cur:
        cur.execute(f"UPDATE {S}.professional_education SET institution='[DELETED]' WHERE id=%s AND user_id=%s", (int(eid), user_id))
    conn.commit()
    return resp({"ok": True})


# ── Work Experience CRUD ──────────────────────────────────────────────

def action_work_list_me(conn, user_id):
    rows = fetch_all(conn, f"""
        SELECT id,company_name,title,employment_type,start_date,end_date,
               is_current,description,achievements_json,skills_json,created_at
        FROM {S}.professional_work_experience WHERE user_id={user_id}
        ORDER BY is_current DESC, start_date DESC NULLS LAST
    """)
    return resp({"work_experience": [{
        "id": r[0], "company_name": r[1], "title": r[2], "employment_type": r[3],
        "start_date": str(r[4]) if r[4] else None, "end_date": str(r[5]) if r[5] else None,
        "is_current": r[6], "description": r[7],
        "achievements": r[8] or [], "skills": r[9] or [], "created_at": str(r[10]),
    } for r in rows]})


def action_work_upsert_me(conn, user_id, body):
    wid = body.get("id")
    comp = (body.get("company_name") or "").strip()
    title = (body.get("title") or "").strip()
    if not comp or not title: return resp({"error": "company_name and title required"}, 400)
    ach = json.dumps(body.get("achievements", []), ensure_ascii=False)
    skills = json.dumps(body.get("skills", []), ensure_ascii=False)
    sd = body.get("start_date") or None
    ed = body.get("end_date") or None
    if wid:
        with conn.cursor() as cur:
            cur.execute(f"""
                UPDATE {S}.professional_work_experience
                SET company_name=%s,title=%s,employment_type=%s,start_date=%s,end_date=%s,
                    is_current=%s,description=%s,achievements_json=%s::jsonb,skills_json=%s::jsonb,updated_at=NOW()
                WHERE id=%s AND user_id=%s
            """, (comp, title, body.get("employment_type","full_time"), sd, ed,
                  bool(body.get("is_current")), body.get("description",""),
                  ach, skills, int(wid), user_id))
        conn.commit()
        return resp({"ok": True, "id": wid})
    else:
        with conn.cursor() as cur:
            cur.execute(f"""
                INSERT INTO {S}.professional_work_experience
                    (user_id,company_name,title,employment_type,start_date,end_date,
                     is_current,description,achievements_json,skills_json)
                VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb,%s::jsonb) RETURNING id
            """, (user_id, comp, title, body.get("employment_type","full_time"),
                  sd, ed, bool(body.get("is_current")), body.get("description",""), ach, skills))
            new_id = cur.fetchone()[0]
        conn.commit()
        return resp({"ok": True, "id": new_id})


def action_work_delete_me(conn, user_id, body):
    wid = body.get("id")
    if not wid: return resp({"error": "id required"}, 400)
    with conn.cursor() as cur:
        cur.execute(f"UPDATE {S}.professional_work_experience SET company_name='[DELETED]' WHERE id=%s AND user_id=%s",
                    (int(wid), user_id))
    conn.commit()
    return resp({"ok": True})


# ── Visibility ────────────────────────────────────────────────────────

def action_visibility_get_me(conn, user_id):
    row = fetch_one(conn, f"""
        SELECT profile_visibility,talent_directory_opt_in,show_competency_map,
               show_contact,show_experience_details,available_for_roles,availability_note,updated_at
        FROM {S}.professional_visibility_settings WHERE user_id={user_id} LIMIT 1
    """)
    if not row:
        return resp({"visibility": {
            "profile_visibility": "private", "talent_directory_opt_in": False,
            "show_competency_map": False, "show_contact": False,
            "show_experience_details": True, "available_for_roles": False,
            "availability_note": None, "updated_at": None,
        }})
    return resp({"visibility": {
        "profile_visibility": row[0], "talent_directory_opt_in": row[1],
        "show_competency_map": row[2], "show_contact": row[3],
        "show_experience_details": row[4], "available_for_roles": row[5],
        "availability_note": row[6], "updated_at": str(row[7]) if row[7] else None,
    }})


def action_visibility_upsert_me(conn, user_id, body):
    exists = fetch_one(conn, f"SELECT id FROM {S}.professional_visibility_settings WHERE user_id={user_id} LIMIT 1")
    vis = body.get("profile_visibility","private")
    if vis not in ("private","limited","opt_in_public"): vis = "private"
    if exists:
        with conn.cursor() as cur:
            cur.execute(f"""
                UPDATE {S}.professional_visibility_settings
                SET profile_visibility=%s,talent_directory_opt_in=%s,show_competency_map=%s,
                    show_contact=%s,show_experience_details=%s,available_for_roles=%s,
                    availability_note=%s,updated_at=NOW()
                WHERE user_id=%s
            """, (vis, bool(body.get("talent_directory_opt_in")),
                  bool(body.get("show_competency_map")), bool(body.get("show_contact")),
                  bool(body.get("show_experience_details",True)),
                  bool(body.get("available_for_roles")),
                  body.get("availability_note"), user_id))
    else:
        with conn.cursor() as cur:
            cur.execute(f"""
                INSERT INTO {S}.professional_visibility_settings
                    (user_id,profile_visibility,talent_directory_opt_in,show_competency_map,
                     show_contact,show_experience_details,available_for_roles,availability_note)
                VALUES(%s,%s,%s,%s,%s,%s,%s,%s)
            """, (user_id, vis, bool(body.get("talent_directory_opt_in")),
                  bool(body.get("show_competency_map")), bool(body.get("show_contact")),
                  bool(body.get("show_experience_details",True)),
                  bool(body.get("available_for_roles")), body.get("availability_note")))
    conn.commit()
    return resp({"ok": True})


# ── Handler ───────────────────────────────────────────────────────────

def handler(event: dict, context) -> dict:
    """W8.1+W8.2 Professional Competency Map + Passport."""
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

    # W8.2 passport actions use session-based auth (user)
    PASSPORT_ACTIONS = {
        "professional_passport_get_me", "professional_passport_upsert_me",
        "professional_passport_completion_me", "professional_passport_summary_me",
        "professional_education_list_me", "professional_education_upsert_me", "professional_education_delete_me",
        "professional_work_experience_list_me", "professional_work_experience_upsert_me", "professional_work_experience_delete_me",
        "professional_visibility_get_me", "professional_visibility_upsert_me",
    }

    is_passport_action = action in PASSPORT_ACTIONS

    # Session auth for passport actions
    if is_passport_action:
        session_id = headers.get("x-session-id") or headers.get("X-Session-Id") or ""
        if not session_id:
            return resp({"error": "unauthorized"}, 401)
        conn = psycopg2.connect(DB)
        try:
            user_id = _get_user_id(conn, session_id)
            if not user_id:
                return resp({"error": "unauthorized"}, 401)
            # Passport
            if action == "professional_passport_get_me":
                return action_passport_get_me(conn, user_id)
            if action == "professional_passport_upsert_me":
                if method != "POST": return resp({"error": "POST required"}, 405)
                return action_passport_upsert_me(conn, user_id, body)
            if action == "professional_passport_completion_me":
                return action_passport_completion_me(conn, user_id)
            if action == "professional_passport_summary_me":
                return action_passport_summary_me(conn, user_id)
            # Education
            if action == "professional_education_list_me":
                return action_education_list_me(conn, user_id)
            if action == "professional_education_upsert_me":
                if method != "POST": return resp({"error": "POST required"}, 405)
                return action_education_upsert_me(conn, user_id, body)
            if action == "professional_education_delete_me":
                if method != "POST": return resp({"error": "POST required"}, 405)
                return action_education_delete_me(conn, user_id, body)
            # Work
            if action == "professional_work_experience_list_me":
                return action_work_list_me(conn, user_id)
            if action == "professional_work_experience_upsert_me":
                if method != "POST": return resp({"error": "POST required"}, 405)
                return action_work_upsert_me(conn, user_id, body)
            if action == "professional_work_experience_delete_me":
                if method != "POST": return resp({"error": "POST required"}, 405)
                return action_work_delete_me(conn, user_id, body)
            # Visibility
            if action == "professional_visibility_get_me":
                return action_visibility_get_me(conn, user_id)
            if action == "professional_visibility_upsert_me":
                if method != "POST": return resp({"error": "POST required"}, 405)
                return action_visibility_upsert_me(conn, user_id, body)
            return resp({"error": "unknown action"}, 400)
        finally:
            conn.close()

    # Admin token auth for framework/competency actions
    token = headers.get("X-Admin-Token") or headers.get("x-admin-token") or ""
    if not token:
        return resp({"error": "unauthorized"}, 401)

    conn = psycopg2.connect(DB)
    try:
        actor = get_admin(conn, token)
        if not actor:
            return resp({"error": "unauthorized"}, 401)

        # Framework
        if action == "professional_domains_list":
            return action_domains_list(conn)
        if action == "professional_competencies_list":
            return action_competencies_list(conn, qs)
        if action == "professional_competency_upsert":
            if method != "POST": return resp({"error": "POST required"}, 405)
            return action_competency_upsert(conn, body)
        if action == "professional_competency_delete":
            if method != "POST": return resp({"error": "POST required"}, 405)
            return action_competency_delete(conn, body)

        # Role Profiles
        if action == "professional_role_profiles_list":
            return action_role_profiles_list(conn)
        if action == "professional_role_profile_get":
            rid = qs.get("id") or body.get("id")
            if not rid: return resp({"error": "id required"}, 400)
            return action_role_profile_get(conn, int(rid))
        if action == "professional_role_profile_upsert":
            if method != "POST": return resp({"error": "POST required"}, 405)
            return action_role_profile_upsert(conn, body)
        if action == "professional_role_profile_targets_upsert":
            if method != "POST": return resp({"error": "POST required"}, 405)
            return action_role_profile_targets_upsert(conn, body)

        # User Map (admin)
        if action == "professional_user_competency_map_get":
            return action_user_competency_map_get(conn, qs)
        if action == "professional_user_competency_upsert":
            if method != "POST": return resp({"error": "POST required"}, 405)
            return action_user_competency_upsert(conn, body)
        if action == "professional_competency_evidence_add":
            if method != "POST": return resp({"error": "POST required"}, 405)
            return action_competency_evidence_add(conn, body)
        if action == "professional_competency_evidence_delete":
            if method != "POST": return resp({"error": "POST required"}, 405)
            return action_competency_evidence_delete(conn, body)
        if action == "professional_competency_gap_summary":
            return action_competency_gap_summary(conn, qs)

        return resp({"error": "unknown action"}, 400)

    finally:
        conn.close()