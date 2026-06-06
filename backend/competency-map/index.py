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

    # ── 4b. Project signals — слабый вклад (SCORE_PROJECT = +1) ─────
    # Логика v1: если у пользователя есть активные проекты,
    # применяем project signal к компетенциям тех доменов,
    # где у пользователя уже есть хотя бы один assessment/evidence.
    # Это предотвращает "магическое" появление компетенций из воздуха.
    project_rows = fetch_all(conn, f"""
        SELECT p.id, p.title, p.updated_at
        FROM {S}.projects p
        JOIN {S}.project_members pm ON pm.project_id = p.id
        WHERE pm.user_id = {user_id} AND p.archived_at IS NULL
        ORDER BY p.updated_at DESC LIMIT 5
    """)
    project_signals: list[dict] = []
    for r in project_rows:
        project_signals.append({
            "id": r[0],
            "title": r[1] or "Проект",
            "updated_at": str(r[2]) if r[2] else None,
        })

    # Домены в которых у пользователя уже есть сигналы (assessment или evidence)
    domains_with_signals: set[int] = set()
    for comp_id, comp_data in competencies_by_id.items():
        if comp_id in uc_by_comp or comp_id in evidence_by_comp:
            domains_with_signals.add(comp_data["domain_id"])

    # project_boost_by_comp: competency_id → список проектных source-записей
    project_boost_by_comp: dict[int, list] = {}
    if project_signals and domains_with_signals:
        for comp_id, comp_data in competencies_by_id.items():
            if comp_data["domain_id"] in domains_with_signals:
                project_boost_by_comp[comp_id] = project_signals

    # ── 4c. Education confirmed signals ──────────────────────────────
    # Логика v1: подтверждённые education_items дают +1 pt к компетенциям
    # доменов где уже есть сигнал. Если есть competencies_json — маппим точно,
    # иначе используем как общий domain-boost (так же как project).
    edu_rows = fetch_all(conn, f"""
        SELECT id, kind, title, competencies_json, confirmed_at
        FROM {S}.education_items
        WHERE user_id = {user_id} AND is_confirmed = true
        ORDER BY confirmed_at DESC LIMIT 10
    """)
    edu_signals: list[dict] = []
    edu_by_competency: dict[int, list] = {}  # competency_id → edu items (из competencies_json)
    for r in edu_rows:
        item = {
            "id": r[0],
            "kind": r[1] or "course",
            "title": r[2] or "Подтверждённое обучение",
            "confirmed_at": str(r[4]) if r[4] else None,
        }
        comp_json_raw = r[3]  # TEXT или None
        parsed_ids = []
        if comp_json_raw:
            try:
                import json as _json
                comp_json = _json.loads(comp_json_raw) if isinstance(comp_json_raw, str) else comp_json_raw
                if isinstance(comp_json, list):
                    for c in comp_json:
                        cid = c if isinstance(c, int) else (c.get("id") if isinstance(c, dict) else None)
                        if cid:
                            parsed_ids.append(int(cid))
            except Exception:
                pass
        if parsed_ids:
            for cid in parsed_ids:
                if cid not in edu_by_competency:
                    edu_by_competency[cid] = []
                edu_by_competency[cid].append(item)
        else:
            edu_signals.append(item)

    # edu_boost_by_comp: competency_id → edu items (domain-level)
    edu_boost_by_comp: dict[int, list] = {}
    if edu_signals and domains_with_signals:
        for comp_id, comp_data in competencies_by_id.items():
            if comp_data["domain_id"] in domains_with_signals:
                edu_boost_by_comp[comp_id] = edu_signals

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

        # project boost — слабый сигнал, только для доменов с existing signals
        proj_boosts = project_boost_by_comp.get(comp_id, [])
        if proj_boosts and source_types:  # не даём проектам "создавать" компетенции с нуля
            score += SCORE_PROJECT
            source_types.add("project")
            p = proj_boosts[0]
            sources.append({
                "kind": "project",
                "label": f"Проект: {p['title']}",
                "is_verified": False,
                "date": p["updated_at"],
            })

        # education confirmed — точный маппинг (из competencies_json)
        exact_edu = edu_by_competency.get(comp_id, [])
        for edu in exact_edu[:3]:
            score += SCORE_PROJECT  # +1 pt, не verified
            source_types.add("education_confirmed")
            sources.append({
                "kind": "education_confirmed",
                "label": f"Образование: {edu['title']}",
                "is_verified": False,
                "date": edu["confirmed_at"],
            })

        # education confirmed — domain-level boost (без точного маппинга)
        edu_boosts = edu_boost_by_comp.get(comp_id, [])
        if edu_boosts and source_types and not exact_edu:
            score += SCORE_PROJECT  # +1 pt
            source_types.add("education_confirmed")
            e = edu_boosts[0]
            sources.append({
                "kind": "education_confirmed",
                "label": f"Образование: {e['title']}",
                "is_verified": False,
                "date": e["confirmed_at"],
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

    # ── 9. All domains — для self-assessment из empty state ──────────
    # Возвращаем полный список доменов и компетенций независимо от scoring.
    # Frontend использует это чтобы показать компетенции даже при empty state.
    all_domains_out = []
    for did in sorted(domains_by_id.keys()):
        domain = domains_by_id[did]
        comps_in_domain = [
            {
                "id": comp_id,
                "code": comp_data.get("code", ""),
                "name": comp_data.get("name", ""),
                "description": comp_data.get("description", ""),
                "current_level": comp_data.get("current_level", 0),
                "confidence": comp_data.get("confidence", "none"),
                "score": comp_data.get("score", 0),
                "is_verified": comp_data.get("is_verified", False),
                "evidence_count": comp_data.get("evidence_count", 0),
                "level_descriptor": comp_data["level_descriptors"].get(
                    str(comp_data.get("current_level", 0)), ""
                ),
                "level_descriptors": comp_data.get("level_descriptors", {}),
                "sources": comp_data.get("sources", []),
            }
            for comp_id, comp_data in competencies_by_id.items()
            if comp_data["domain_id"] == did
        ]
        comps_in_domain.sort(key=lambda c: c.get("sort_order", 0) if "sort_order" in c else 0)
        all_domains_out.append({
            "id": did,
            "code": domain.get("code", ""),
            "name": domain.get("name", ""),
            "competencies": comps_in_domain,
        })

    return {"domains": domains_out, "all_domains": all_domains_out, "summary": summary}


def action_competency_map_get_me(conn, user_id: int):
    """W12 — полная карта компетенций пользователя с доменами, scoring и sources."""
    result = build_competency_map(conn, user_id)
    return resp(result)


def action_self_assess(conn, user_id: int, body: dict):
    """W14.1 — Self-assessment: пользователь выставляет уровень компетенции сам.

    Принимает: competency_id (int), level (0-5).
    Создаёт или обновляет professional_user_competencies.current_level.
    Confidence при self-assess = 'low' (пересчитывается scoring'ом при следующем get_me).
    """
    competency_id = body.get("competency_id")
    level = body.get("level")
    if competency_id is None or level is None:
        return resp({"error": "competency_id and level required"}, 400)
    try:
        competency_id = int(competency_id)
        level = int(level)
    except (TypeError, ValueError):
        return resp({"error": "invalid competency_id or level"}, 400)
    if level < 0 or level > 5:
        return resp({"error": "level must be 0-5"}, 400)

    # Проверяем что компетенция существует
    row = fetch_one(conn, f"""
        SELECT id FROM {S}.professional_competencies
        WHERE id = %s AND status = 'active'
    """, (competency_id,))
    if not row:
        return resp({"error": "competency not found"}, 404)

    with conn.cursor() as cur:
        if level == 0:
            # level=0 означает "убрать оценку" — удаляем запись если нет evidence
            cur.execute(f"""
                DELETE FROM {S}.professional_user_competencies
                WHERE user_id = %s AND competency_id = %s
                  AND NOT EXISTS (
                      SELECT 1 FROM {S}.professional_competency_evidence ev
                      WHERE ev.user_competency_id = professional_user_competencies.id
                  )
            """, (user_id, competency_id))
        else:
            cur.execute(f"""
                INSERT INTO {S}.professional_user_competencies
                    (user_id, competency_id, current_level, confidence, last_assessed_at, updated_at)
                VALUES (%s, %s, %s, 'low', NOW(), NOW())
                ON CONFLICT (user_id, competency_id)
                DO UPDATE SET
                    current_level = EXCLUDED.current_level,
                    last_assessed_at = NOW(),
                    updated_at = NOW()
                RETURNING id
            """, (user_id, competency_id, level))
    conn.commit()
    return resp({"ok": True, "competency_id": competency_id, "level": level})


def action_track_event(conn, user_id: int, body: dict):
    """W15.1 — Запись события карты в DB для adoption-аналитики.

    Принимает: event (str), map_status (str|None), props (dict|None).
    Разрешённые события: competency_map_loaded, competency_map_self_assessed,
    competency_map_recommendation_clicked, competency_map_domain_expanded,
    competency_map_competency_clicked.
    Пишет в competency_map_events. Возвращает ok сразу.
    """
    ALLOWED = {
        "competency_map_loaded",
        "competency_map_self_assessed",
        "competency_map_recommendation_clicked",
        "competency_map_domain_expanded",
        "competency_map_competency_clicked",
    }
    event_name = body.get("event", "")
    if event_name not in ALLOWED:
        return resp({"error": "unknown event"}, 400)

    map_status = body.get("map_status") or body.get("status") or None
    props = body.get("props") or {}
    # Собираем props из тела если переданы плоско
    for k in ("level", "competency_id", "competency_name", "domain_id", "rec_kind", "rec_href"):
        if k in body and k not in props:
            props[k] = body[k]

    import json as _json
    with conn.cursor() as cur:
        cur.execute(f"""
            INSERT INTO {S}.competency_map_events (user_id, event, map_status, props_json)
            VALUES (%s, %s, %s, %s)
        """, (user_id, event_name, map_status, _json.dumps(props)))
    conn.commit()
    return resp({"ok": True})


def action_adoption_stats(conn):
    """W15.2 — Adoption funnel: агрегация по competency_map_events для дашборда.

    Возвращает воронку: loaded → domain_expanded → competency_clicked → self_assessed.
    Плюс: распределение по статусам, CTR рекомендаций, retention (повторные визиты).
    """
    # Воронка по уникальным пользователям
    funnel = fetch_all(conn, f"""
        SELECT event, COUNT(DISTINCT user_id) as unique_users, COUNT(*) as total_events
        FROM {S}.competency_map_events
        GROUP BY event
        ORDER BY unique_users DESC
    """)

    # Распределение статусов при первом открытии карты
    status_dist = fetch_all(conn, f"""
        SELECT map_status, COUNT(DISTINCT user_id) as users
        FROM {S}.competency_map_events
        WHERE event = 'competency_map_loaded'
          AND map_status IS NOT NULL
          AND id IN (
              SELECT MIN(id) FROM {S}.competency_map_events
              WHERE event = 'competency_map_loaded'
              GROUP BY user_id
          )
        GROUP BY map_status
        ORDER BY users DESC
    """)

    # Self-assessment conversion: кто loaded → кто self_assessed
    conversion = fetch_one(conn, f"""
        SELECT
            COUNT(DISTINCT l.user_id) as loaded_users,
            COUNT(DISTINCT s.user_id) as assessed_users,
            CASE WHEN COUNT(DISTINCT l.user_id) > 0
                 THEN ROUND(100.0 * COUNT(DISTINCT s.user_id) / COUNT(DISTINCT l.user_id), 1)
                 ELSE 0 END as conversion_pct
        FROM (SELECT DISTINCT user_id FROM {S}.competency_map_events WHERE event = 'competency_map_loaded') l
        LEFT JOIN (SELECT DISTINCT user_id FROM {S}.competency_map_events WHERE event = 'competency_map_self_assessed') s
          ON s.user_id = l.user_id
    """)

    # Recommendation CTR
    rec_stats = fetch_one(conn, f"""
        SELECT
            (SELECT COUNT(DISTINCT user_id) FROM {S}.competency_map_events WHERE event = 'competency_map_loaded') as shown_to_users,
            COUNT(DISTINCT user_id) as clicked_users,
            COUNT(*) as total_clicks
        FROM {S}.competency_map_events WHERE event = 'competency_map_recommendation_clicked'
    """)

    # Динамика по дням (последние 14 дней)
    daily = fetch_all(conn, f"""
        SELECT DATE(created_at) as day,
               COUNT(DISTINCT user_id) as dau,
               COUNT(*) as events
        FROM {S}.competency_map_events
        WHERE created_at >= NOW() - INTERVAL '14 days'
        GROUP BY DATE(created_at)
        ORDER BY day DESC
    """)

    return resp({
        "funnel": [{"event": r[0], "unique_users": r[1], "total_events": r[2]} for r in funnel],
        "status_distribution": [{"status": r[0], "users": r[1]} for r in status_dist],
        "self_assess_conversion": {
            "loaded_users": conversion[0] if conversion else 0,
            "assessed_users": conversion[1] if conversion else 0,
            "conversion_pct": float(conversion[2]) if conversion else 0.0,
        },
        "recommendation_ctr": {
            "shown_to_users": rec_stats[0] if rec_stats else 0,
            "clicked_users": rec_stats[1] if rec_stats else 0,
            "total_clicks": rec_stats[2] if rec_stats else 0,
        },
        "daily_activity": [{"day": str(r[0]), "dau": r[1], "events": r[2]} for r in daily],
    })


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

        if action == "competency_map_self_assess":
            body = json.loads(event.get("body") or "{}")
            return action_self_assess(conn, user_id, body)

        if action == "competency_map_track":
            body = json.loads(event.get("body") or "{}")
            return action_track_event(conn, user_id, body)

        if action == "competency_map_adoption_stats":
            return action_adoption_stats(conn)

        return resp({"error": "unknown action"}, 400)
    finally:
        conn.close()