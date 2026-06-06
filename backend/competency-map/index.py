"""
W12 Competency Map — агрегация и scoring компетенций пользователя.

Scoring model (детерминированная, объяснимая):
  learning_completion evidence : +3 pts, is_verified=True
  current_level > 0 (explicit)  : +2 pts
  (расширяется в будущем: project_evidence +2, test_result +2)

Confidence:
  high   — score >= 5 И есть verified evidence
  medium — score >= 3 ИЛИ 2+ независимых источника
  low    — score >= 1
  none   — нет сигналов (не показываем)

Session-auth actions:
  competency_map_get_me   — полная карта с доменами, scoring, sources
"""
import json
import os

DB = os.environ["DATABASE_URL"]
S  = os.environ.get("MAIN_DB_SCHEMA", "public")

SCORE_LEARNING   = 3   # learning_completion evidence
SCORE_EXPLICIT   = 2   # current_level > 0 (manual/assessment)
SCORE_PROJECT    = 1   # project evidence (future)


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


def fetch_all(conn, sql, params=None):
    with conn.cursor() as cur:
        cur.execute(sql, params)
        return cur.fetchall()


def get_user_id(conn, session_id: str):
    row = fetch_one(conn,
        f"SELECT user_id FROM {S}.sessions WHERE id=%s AND expires_at>NOW() LIMIT 1",
        (session_id,))
    return row[0] if row else None


def _calc_confidence(score: int, verified_count: int, source_count: int) -> str:
    if score >= 5 and verified_count > 0:
        return "high"
    if score >= 3 or source_count >= 2:
        return "medium"
    if score >= 1:
        return "low"
    return "none"


def build_competency_map(conn, user_id: int) -> dict:
    """Строит карту компетенций пользователя с scoring и источниками."""

    # ── 1. Загружаем все домены ──────────────────────────────────────
    domain_rows = fetch_all(conn, f"""
        SELECT id, code, name, description, sort_order
        FROM {S}.professional_competency_domains
        ORDER BY sort_order, id
    """)
    domains_by_id = {
        r[0]: {"id": r[0], "code": r[1], "name": r[2], "description": r[3]}
        for r in domain_rows
    }

    # ── 2. Загружаем все компетенции ─────────────────────────────────
    comp_rows = fetch_all(conn, f"""
        SELECT id, domain_id, code, name, description, level_descriptors_json
        FROM {S}.professional_competencies
        WHERE status='active'
        ORDER BY domain_id, sort_order, id
    """)
    competencies_by_id = {}
    for r in comp_rows:
        competencies_by_id[r[0]] = {
            "id": r[0],
            "domain_id": r[1],
            "code": r[2],
            "name": r[3],
            "description": r[4],
            "level_descriptors": r[5] or {},
            "score": 0,
            "confidence": "none",
            "current_level": 0,
            "is_verified": False,
            "evidence_count": 0,
            "sources": [],
        }

    # ── 3. Загружаем оценки пользователя ─────────────────────────────
    uc_rows = fetch_all(conn, f"""
        SELECT id, competency_id, current_level, confidence, last_assessed_at
        FROM {S}.professional_user_competencies
        WHERE user_id = {user_id} AND current_level > 0
    """)
    uc_by_comp: dict[int, dict] = {}
    for r in uc_rows:
        uc_by_comp[r[1]] = {
            "uc_id": r[0],
            "current_level": r[2],
            "stored_confidence": r[3],
            "last_assessed_at": str(r[4]) if r[4] else None,
        }

    # ── 4. Загружаем evidence ────────────────────────────────────────
    ev_rows = fetch_all(conn, f"""
        SELECT ev.id, ev.user_competency_id, ev.evidence_type,
               ev.title, ev.description, ev.source_ref, ev.created_at,
               uc.competency_id
        FROM {S}.professional_competency_evidence ev
        JOIN {S}.professional_user_competencies uc ON uc.id = ev.user_competency_id
        WHERE uc.user_id = {user_id}
        ORDER BY ev.created_at DESC
    """)
    evidence_by_comp: dict[int, list] = {}
    for r in ev_rows:
        comp_id = r[7]
        if comp_id not in evidence_by_comp:
            evidence_by_comp[comp_id] = []
        evidence_by_comp[comp_id].append({
            "id": r[0],
            "evidence_type": r[2],
            "title": r[3] or "",
            "description": (r[4] or "")[:200],
            "source_ref": r[5],
            "created_at": str(r[6]) if r[6] else None,
            "is_verified": r[2] == "learning_completion",
        })

    # ── 5. Scoring ───────────────────────────────────────────────────
    for comp_id, comp in competencies_by_id.items():
        score = 0
        sources = []
        verified_count = 0
        source_types: set[str] = set()

        # explicit assessment
        if comp_id in uc_by_comp:
            uc = uc_by_comp[comp_id]
            comp["current_level"] = uc["current_level"]
            score += SCORE_EXPLICIT
            sources.append({
                "kind": "assessment",
                "label": f"Уровень {uc['current_level']} / 5 — оценка профиля",
                "is_verified": False,
                "date": uc["last_assessed_at"],
            })
            source_types.add("assessment")

        # evidence
        evs = evidence_by_comp.get(comp_id, [])
        comp["evidence_count"] = len(evs)
        for ev in evs[:10]:  # не тащим бесконечно
            is_v = ev["is_verified"]
            if is_v:
                score += SCORE_LEARNING
                verified_count += 1
                source_types.add("learning")
            sources.append({
                "kind": "learning" if is_v else ev["evidence_type"],
                "label": ev["title"] or "Обучение завершено",
                "is_verified": is_v,
                "date": ev["created_at"],
                "evidence_id": ev["id"],
                "description": ev["description"] or None,
            })

        comp["score"] = score
        comp["is_verified"] = verified_count > 0
        comp["confidence"] = _calc_confidence(score, verified_count, len(source_types))
        comp["sources"] = sources

    # ── 6. Фильтрация: показываем только компетенции с сигналами ─────
    visible = {cid: c for cid, c in competencies_by_id.items() if c["confidence"] != "none"}

    # ── 7. Группировка по доменам ────────────────────────────────────
    domain_map: dict[int, dict] = {}
    for cid, comp in visible.items():
        did = comp["domain_id"]
        if did not in domain_map:
            domain = domains_by_id.get(did, {})
            domain_map[did] = {
                "id": did,
                "code": domain.get("code", ""),
                "name": domain.get("name", ""),
                "competencies": [],
            }
        entry = {k: v for k, v in comp.items() if k != "domain_id"}
        entry["level_descriptor"] = comp["level_descriptors"].get(
            str(comp["current_level"]), ""
        )
        domain_map[did]["competencies"].append(entry)

    # Сортируем компетенции внутри домена по score убыванию
    domains_out = []
    for did in sorted(domain_map.keys()):
        d = domain_map[did]
        d["competencies"].sort(key=lambda c: -c["score"])
        domains_out.append(d)

    # ── 8. Summary ───────────────────────────────────────────────────
    all_visible = list(visible.values())
    summary = {
        "total_competencies": len(all_visible),
        "domains_covered": len(domain_map),
        "verified_count": sum(1 for c in all_visible if c["is_verified"]),
        "high_confidence_count": sum(1 for c in all_visible if c["confidence"] == "high"),
        "has_data": len(all_visible) > 0,
    }

    # Топ-3 компетенции по score
    top = sorted(all_visible, key=lambda c: -c["score"])[:3]
    summary["top_competencies"] = [
        {"id": c["id"], "name": c["name"], "confidence": c["confidence"], "score": c["score"]}
        for c in top
    ]

    return {"domains": domains_out, "summary": summary}


def action_competency_map_get_me(conn, user_id: int):
    """W12 — полная карта компетенций пользователя с доменами, scoring и sources."""
    result = build_competency_map(conn, user_id)
    return resp(result)


def handler(event: dict, context) -> dict:
    """W12 Competency Map — агрегация сигналов в объяснимую карту компетенций."""
    headers = event.get("headers") or {}
    method  = event.get("httpMethod", "GET")

    if method == "OPTIONS":
        return resp({}, 200)

    qs     = event.get("queryStringParameters") or {}
    action = qs.get("action", "")

    session_id = headers.get("x-session-id") or headers.get("X-Session-Id") or ""
    if not session_id:
        return resp({"error": "unauthorized"}, 401)

    import psycopg2  # lazy — чтобы OPTIONS отдавал 200 без DB
    conn = psycopg2.connect(DB)
    try:
        user_id = get_user_id(conn, session_id)
        if not user_id:
            return resp({"error": "unauthorized"}, 401)

        if action == "competency_map_get_me":
            return action_competency_map_get_me(conn, user_id)

        return resp({"error": "unknown action"}, 400)
    finally:
        conn.close()