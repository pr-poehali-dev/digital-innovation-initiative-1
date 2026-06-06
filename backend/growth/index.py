"""
W8.3 Growth Navigator — детерминированный планировщик развития.

Actions (session-auth):
  professional_growth_gap_summary_me
  professional_growth_plan_get_me
  professional_growth_plan_generate_me
  professional_growth_plan_update_me
  professional_growth_plan_archive_me
  professional_growth_plan_item_add_me
  professional_growth_plan_item_update_me
  professional_growth_plan_item_delete_me
  professional_growth_progress_me
  professional_growth_recommendations_me
  professional_growth_checkin_add_me
"""
import json
import os
import datetime
import psycopg2

DB = os.environ["DATABASE_URL"]
S  = os.environ.get("MAIN_DB_SCHEMA", "public")


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


def fetch_all(conn, sql):
    with conn.cursor() as cur:
        cur.execute(sql)
        return cur.fetchall()


def fetch_one(conn, sql, params=None):
    with conn.cursor() as cur:
        cur.execute(sql, params)
        return cur.fetchone()


def get_user_id(conn, session_id: str):
    row = fetch_one(conn,
        f"SELECT user_id FROM {S}.sessions WHERE id=%s AND expires_at>NOW() LIMIT 1",
        (session_id,))
    return row[0] if row else None


# ── Gap Analysis ──────────────────────────────────────────────────────

def build_gap_rows(conn, user_id, role_id):
    rows = fetch_all(conn, f"""
        SELECT c.id, c.name, c.code, c.level_descriptors_json,
               d.name, d.code,
               uc.current_level, uc.confidence,
               t.target_level, t.importance,
               COUNT(ev.id) AS ev_count
        FROM {S}.professional_role_competency_targets t
        JOIN {S}.professional_competencies c ON c.id=t.competency_id
        JOIN {S}.professional_competency_domains d ON d.id=c.domain_id
        LEFT JOIN {S}.professional_user_competencies uc
               ON uc.competency_id=c.id AND uc.user_id={user_id}
        LEFT JOIN {S}.professional_competency_evidence ev
               ON ev.user_competency_id=uc.id
        WHERE t.role_profile_id={role_id}
        GROUP BY c.id,d.id,uc.current_level,uc.confidence,t.target_level,t.importance
        ORDER BY t.importance DESC,
                 (COALESCE(t.target_level,0)-COALESCE(uc.current_level,0)) DESC
    """)
    result = []
    for r in rows:
        cur = r[6] or 0
        tgt = r[8] or 0
        gap = max(0, tgt - cur)
        result.append({
            "competency_id": r[0], "name": r[1], "code": r[2],
            "level_descriptors": r[3] if isinstance(r[3], dict) else {},
            "domain_name": r[4], "domain_code": r[5],
            "current_level": cur, "confidence": r[7] or "none",
            "target_level": tgt, "importance": r[9],
            "gap": gap, "evidence_count": r[10] or 0,
        })
    return result


def action_gap_summary(conn, user_id, qs):
    role_id = qs.get("role_id")
    if not role_id:
        return resp({"error": "role_id required"}, 400)
    rid = int(role_id)
    gaps = build_gap_rows(conn, user_id, rid)
    total     = len(gaps)
    assessed  = sum(1 for g in gaps if g["current_level"] > 0)
    on_target = sum(1 for g in gaps if g["gap"] == 0 and g["current_level"] > 0)
    critical  = [g for g in gaps if g["gap"] >= 2 and g["importance"] in ("core","important")]
    quick_wins= [g for g in gaps if g["gap"] == 1]
    strengths = [g for g in gaps if g["gap"] == 0 and g["current_level"] >= 3]
    row = fetch_one(conn, f"SELECT name FROM {S}.professional_role_profiles WHERE id={rid} LIMIT 1")
    role_name = row[0] if row else ""
    fit_pct = round(on_target / total * 100) if total else 0
    return resp({"gap_summary": {
        "role_id": rid, "role_name": role_name,
        "total": total, "assessed": assessed, "on_target": on_target,
        "fit_pct": fit_pct,
        "coverage_pct": round(assessed / total * 100) if total else 0,
        "critical_gaps": critical[:8],
        "quick_wins": quick_wins[:6],
        "strengths": strengths[:6],
        "all_gaps": gaps,
    }})


# ── Plan ──────────────────────────────────────────────────────────────

def action_plan_get(conn, user_id):
    plan = fetch_one(conn, f"""
        SELECT p.id,p.target_role_profile_id,p.status,p.plan_version,
               p.summary_json,p.created_at,p.updated_at,r.name
        FROM {S}.professional_growth_plans p
        LEFT JOIN {S}.professional_role_profiles r ON r.id=p.target_role_profile_id
        WHERE p.user_id={user_id} AND p.status='active' LIMIT 1
    """)
    if not plan:
        return resp({"plan": None})
    pid = plan[0]
    items = fetch_all(conn, f"""
        SELECT i.id,i.competency_id,c.name,i.item_type,i.title,i.description,
               i.priority,i.current_level,i.target_level,i.gap_value,i.importance,
               i.status,i.sort_order,i.due_date,i.updated_at
        FROM {S}.professional_growth_plan_items i
        LEFT JOIN {S}.professional_competencies c ON c.id=i.competency_id
        WHERE i.plan_id={pid} AND i.title!='[DELETED]'
        ORDER BY CASE i.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
                 i.sort_order
    """)
    return resp({"plan": {
        "id": pid,
        "target_role_profile_id": plan[1], "role_name": plan[7] or "",
        "status": plan[2], "plan_version": plan[3],
        "summary": plan[4] or {},
        "created_at": str(plan[5]), "updated_at": str(plan[6]),
        "items": [{
            "id": r[0], "competency_id": r[1], "competency_name": r[2] or "",
            "item_type": r[3], "title": r[4], "description": r[5],
            "priority": r[6], "current_level": r[7], "target_level": r[8],
            "gap_value": r[9], "importance": r[10], "status": r[11],
            "sort_order": r[12],
            "due_date": str(r[13]) if r[13] else None,
            "updated_at": str(r[14]),
        } for r in items],
    }})


def make_items_for_gap(gap_row, sort_base):
    items = []
    cid  = gap_row["competency_id"]
    name = gap_row["name"]
    cur  = gap_row["current_level"]
    tgt  = gap_row["target_level"]
    g    = gap_row["gap"]
    imp  = gap_row["importance"]
    ld   = gap_row.get("level_descriptors", {})
    prio = "high" if imp == "core" else ("medium" if imp == "important" else "low")
    next_desc = ld.get(str(cur + 1), "")

    items.append({
        "competency_id": cid, "item_type": "learn", "priority": prio,
        "current_level": cur, "target_level": tgt, "gap_value": g, "importance": imp,
        "title": f"Изучить: {name}",
        "description": (
            f"Цель: перейти с уровня {cur} → {cur+1}. "
            + (f"Следующий уровень: {next_desc}. " if next_desc else "")
            + f"Важность для роли: {imp}."
        ),
        "sort_order": sort_base,
    })
    items.append({
        "competency_id": cid, "item_type": "practice", "priority": prio,
        "current_level": cur, "target_level": tgt, "gap_value": g, "importance": imp,
        "title": f"Практика: {name}",
        "description": (
            f"Применить на практике: рабочая задача или ритуал по «{name}». "
            f"Текущий уровень: {cur}, целевой: {tgt}."
        ),
        "sort_order": sort_base + 1,
    })
    if g >= 1:
        items.append({
            "competency_id": cid, "item_type": "evidence", "priority": "medium",
            "current_level": cur, "target_level": tgt, "gap_value": g, "importance": imp,
            "title": f"Подтвердить: {name}",
            "description": (
                f"Добавить evidence к компетенции «{name}»: project_evidence, "
                f"learning_completion или test_result."
            ),
            "sort_order": sort_base + 2,
        })
    return items


def action_plan_generate(conn, user_id, body):
    role_id = body.get("target_role_profile_id")
    if not role_id:
        return resp({"error": "target_role_profile_id required"}, 400)
    rid  = int(role_id)
    gaps = build_gap_rows(conn, user_id, rid)

    # Archive old
    old = fetch_one(conn, f"SELECT id FROM {S}.professional_growth_plans WHERE user_id={user_id} AND status='active' LIMIT 1")
    if old:
        with conn.cursor() as cur:
            cur.execute(f"UPDATE {S}.professional_growth_plans SET status='archived',updated_at=NOW() WHERE id=%s", (old[0],))
        conn.commit()

    # Priority: core critical → important critical → quick wins
    priority_order = (
        [g for g in gaps if g["gap"] >= 2 and g["importance"] == "core"][:3] +
        [g for g in gaps if g["gap"] >= 2 and g["importance"] == "important"][:2] +
        [g for g in gaps if g["gap"] == 1 and g["importance"] in ("core","important")][:2]
    )
    seen, ordered = set(), []
    for g in priority_order:
        if g["competency_id"] not in seen:
            seen.add(g["competency_id"]); ordered.append(g)
    ordered = ordered[:5]

    total_gaps  = sum(1 for g in gaps if g["gap"] > 0)
    critical_n  = sum(1 for g in gaps if g["gap"] >= 2 and g["importance"] == "core")
    qw_n        = sum(1 for g in gaps if g["gap"] == 1)
    on_target_n = sum(1 for g in gaps if g["gap"] == 0 and g["current_level"] > 0)
    role_row    = fetch_one(conn, f"SELECT name FROM {S}.professional_role_profiles WHERE id={rid} LIMIT 1")
    summary = {
        "role_name": role_row[0] if role_row else "",
        "total_gaps": total_gaps, "critical_gaps": critical_n,
        "quick_wins": qw_n, "on_target": on_target_n,
        "focus_competencies": [g["name"] for g in ordered],
    }

    with conn.cursor() as cur:
        cur.execute(f"""
            INSERT INTO {S}.professional_growth_plans
                (user_id,target_role_profile_id,status,plan_version,source_snapshot_json,summary_json)
            VALUES(%s,%s,'active',1,%s::jsonb,%s::jsonb) RETURNING id
        """, (user_id, rid,
              json.dumps({"generated_at": str(datetime.datetime.utcnow()), "gaps_count": len(gaps)}, ensure_ascii=False),
              json.dumps(summary, ensure_ascii=False)))
        plan_id = cur.fetchone()[0]
    conn.commit()

    all_items = []
    for i, gap in enumerate(ordered):
        all_items += make_items_for_gap(gap, i * 10)

    for it in all_items:
        with conn.cursor() as cur:
            cur.execute(f"""
                INSERT INTO {S}.professional_growth_plan_items
                    (plan_id,competency_id,item_type,title,description,priority,
                     current_level,target_level,gap_value,importance,sort_order)
                VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            """, (plan_id, it["competency_id"], it["item_type"],
                  it["title"], it["description"], it["priority"],
                  it["current_level"], it["target_level"], it["gap_value"],
                  it["importance"], it["sort_order"]))
    conn.commit()
    return resp({"ok": True, "plan_id": plan_id, "items_generated": len(all_items)})


def action_plan_item_add(conn, user_id, body):
    plan = fetch_one(conn, f"SELECT id FROM {S}.professional_growth_plans WHERE user_id={user_id} AND status='active' LIMIT 1")
    if not plan:
        return resp({"error": "no active plan"}, 400)
    pid  = plan[0]
    title = (body.get("title") or "").strip()
    if not title:
        return resp({"error": "title required"}, 400)
    max_ord = (fetch_one(conn, f"SELECT COALESCE(MAX(sort_order),0)+10 FROM {S}.professional_growth_plan_items WHERE plan_id={pid}") or [10])[0]
    with conn.cursor() as cur:
        cur.execute(f"""
            INSERT INTO {S}.professional_growth_plan_items
                (plan_id,competency_id,item_type,title,description,priority,status,sort_order)
            VALUES(%s,%s,%s,%s,%s,%s,'not_started',%s) RETURNING id
        """, (pid, body.get("competency_id"), body.get("item_type","learn"),
              title, body.get("description",""), body.get("priority","medium"), max_ord))
        new_id = cur.fetchone()[0]
    conn.commit()
    return resp({"ok": True, "id": new_id})


def action_plan_item_update(conn, user_id, body):
    iid = body.get("id")
    if not iid:
        return resp({"error": "id required"}, 400)
    row = fetch_one(conn, f"""
        SELECT pi.id FROM {S}.professional_growth_plan_items pi
        JOIN {S}.professional_growth_plans p ON p.id=pi.plan_id
        WHERE pi.id={int(iid)} AND p.user_id={user_id} LIMIT 1
    """)
    if not row:
        return resp({"error": "not found"}, 404)
    fields, vals = [], []
    for f in ["title","description","item_type","priority","status"]:
        if f in body:
            fields.append(f"{f}=%s"); vals.append(body[f])
    if "due_date" in body:
        fields.append("due_date=%s"); vals.append(body["due_date"] or None)
    if not fields:
        return resp({"ok": True})
    fields.append("updated_at=NOW()"); vals.append(int(iid))
    with conn.cursor() as cur:
        cur.execute(f"UPDATE {S}.professional_growth_plan_items SET {','.join(fields)} WHERE id=%s", vals)
    conn.commit()
    return resp({"ok": True})


def action_plan_item_delete(conn, user_id, body):
    iid = body.get("id")
    if not iid:
        return resp({"error": "id required"}, 400)
    row = fetch_one(conn, f"""
        SELECT pi.id FROM {S}.professional_growth_plan_items pi
        JOIN {S}.professional_growth_plans p ON p.id=pi.plan_id
        WHERE pi.id={int(iid)} AND p.user_id={user_id} LIMIT 1
    """)
    if not row:
        return resp({"error": "not found"}, 404)
    with conn.cursor() as cur:
        cur.execute(f"UPDATE {S}.professional_growth_plan_items SET title='[DELETED]' WHERE id=%s", (int(iid),))
    conn.commit()
    return resp({"ok": True})


def action_plan_archive(conn, user_id, body):
    pid = body.get("plan_id")
    if not pid:
        return resp({"error": "plan_id required"}, 400)
    with conn.cursor() as cur:
        cur.execute(f"UPDATE {S}.professional_growth_plans SET status='archived',updated_at=NOW() WHERE id=%s AND user_id=%s", (int(pid), user_id))
    conn.commit()
    return resp({"ok": True})


# ── Progress + Recommendations ────────────────────────────────────────

def action_progress(conn, user_id):
    plan = fetch_one(conn, f"""
        SELECT p.id,p.target_role_profile_id,r.name
        FROM {S}.professional_growth_plans p
        LEFT JOIN {S}.professional_role_profiles r ON r.id=p.target_role_profile_id
        WHERE p.user_id={user_id} AND p.status='active' LIMIT 1
    """)
    if not plan:
        return resp({"progress": None})
    pid, role_id, role_name = plan
    rows = fetch_all(conn, f"""
        SELECT status,COUNT(*) FROM {S}.professional_growth_plan_items
        WHERE plan_id={pid} AND title!='[DELETED]'
        GROUP BY status
    """)
    counts   = {r[0]: r[1] for r in rows}
    total    = sum(counts.values())
    done     = counts.get("done", 0)
    in_prog  = counts.get("in_progress", 0)
    not_st   = counts.get("not_started", 0)
    skipped  = counts.get("skipped", 0)
    done_pct = round(done / total * 100) if total else 0
    ev_week = (fetch_one(conn, f"""
        SELECT COUNT(*) FROM {S}.professional_competency_evidence ev
        JOIN {S}.professional_user_competencies uc ON uc.id=ev.user_competency_id
        WHERE uc.user_id={user_id} AND ev.created_at>=NOW()-INTERVAL '7 days'
    """) or [0])[0]
    comp_assessed = (fetch_one(conn, f"SELECT COUNT(*) FROM {S}.professional_user_competencies WHERE user_id={user_id} AND current_level>0") or [0])[0]
    critical_remaining = 0
    if role_id:
        critical_remaining = (fetch_one(conn, f"""
            SELECT COUNT(*) FROM {S}.professional_role_competency_targets t
            LEFT JOIN {S}.professional_user_competencies uc ON uc.competency_id=t.competency_id AND uc.user_id={user_id}
            WHERE t.role_profile_id={role_id} AND t.importance='core'
              AND COALESCE(uc.current_level,0) < t.target_level
        """) or [0])[0]
    return resp({"progress": {
        "plan_id": pid, "role_name": role_name or "",
        "total_items": total, "done": done, "in_progress": in_prog,
        "skipped": skipped, "not_started": not_st,
        "done_pct": done_pct,
        "evidence_added_week": ev_week,
        "competencies_assessed": comp_assessed,
        "critical_gaps_remaining": critical_remaining,
    }})


def action_recommendations(conn, user_id):
    plan = fetch_one(conn, f"SELECT id FROM {S}.professional_growth_plans WHERE user_id={user_id} AND status='active' LIMIT 1")
    if not plan:
        return resp({"recommendations": []})
    pid  = plan[0]
    rows = fetch_all(conn, f"""
        SELECT i.id,i.title,i.item_type,i.priority,i.description,
               c.name,i.current_level,i.target_level,i.gap_value,i.importance
        FROM {S}.professional_growth_plan_items i
        LEFT JOIN {S}.professional_competencies c ON c.id=i.competency_id
        WHERE i.plan_id={pid} AND i.status='not_started' AND i.title!='[DELETED]'
        ORDER BY CASE i.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
                 i.sort_order
        LIMIT 5
    """)
    return resp({"recommendations": [{
        "id": r[0], "title": r[1], "item_type": r[2], "priority": r[3],
        "description": r[4], "competency_name": r[5] or "",
        "current_level": r[6], "target_level": r[7], "gap_value": r[8],
        "importance": r[9],
        "why": (
            f"Компетенция «{r[5]}»: уровень {r[6]} → цель {r[7]}, gap {r[8]}, важность: {r[9]}."
        ) if r[5] else r[4],
    } for r in rows]})


def action_checkin_add(conn, user_id, body):
    plan = fetch_one(conn, f"SELECT id FROM {S}.professional_growth_plans WHERE user_id={user_id} AND status='active' LIMIT 1")
    if not plan:
        return resp({"error": "no active plan"}, 400)
    pid = plan[0]
    with conn.cursor() as cur:
        cur.execute(f"""
            INSERT INTO {S}.professional_growth_checkins
                (plan_id,user_id,note,progress_note,blockers_note)
            VALUES(%s,%s,%s,%s,%s) RETURNING id
        """, (pid, user_id,
              body.get("note",""), body.get("progress_note",""), body.get("blockers_note","")))
        cid = cur.fetchone()[0]
    conn.commit()
    return resp({"ok": True, "id": cid})


# ── W9.1 Learning Path (user) ────────────────────────────────────────

def _resolve_content_for_gap(conn, competency_id, current_level, gap):
    """Детерминированно подбирает content links для компетенции/gap."""
    rows = fetch_all(conn, f"""
        SELECT id, content_type, content_id, content_title, content_url,
               level_min, level_max, gap_min, gap_max,
               recommendation_strength, is_required, match_reason
        FROM {S}.professional_competency_content_links
        WHERE competency_id={competency_id}
          AND content_title != '[DELETED]'
          AND (level_min IS NULL OR level_min <= {current_level + 1})
          AND (level_max IS NULL OR level_max >= {current_level})
          AND (gap_min IS NULL OR gap_min <= {gap})
          AND (gap_max IS NULL OR gap_max >= {gap})
        ORDER BY is_required DESC,
                 CASE recommendation_strength WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
                 sort_order
        LIMIT 3
    """)
    return [{
        "link_id": r[0], "content_type": r[1], "content_id": r[2],
        "content_title": r[3], "content_url": r[4],
        "level_min": r[5], "level_max": r[6], "gap_min": r[7], "gap_max": r[8],
        "recommendation_strength": r[9], "is_required": r[10], "match_reason": r[11],
    } for r in rows]


def action_learning_path_me(conn, user_id):
    """Полный learning path: assignments по текущему плану."""
    plan = fetch_one(conn, f"SELECT id,target_role_profile_id FROM {S}.professional_growth_plans WHERE user_id={user_id} AND status='active' LIMIT 1")
    assignments = []
    if plan:
        pid = plan[0]
        rows = fetch_all(conn, f"""
            SELECT a.id,a.plan_item_id,a.competency_id,c.name,
                   a.content_type,a.content_id,a.content_title,a.content_url,
                   a.recommendation_strength,a.is_required,
                   a.source,a.status,a.reason_text,a.progress_pct,
                   a.assigned_at,a.started_at,a.completed_at,a.link_id
            FROM {S}.professional_learning_assignments a
            LEFT JOIN {S}.professional_competencies c ON c.id=a.competency_id
            WHERE a.plan_id={pid}
            ORDER BY a.is_required DESC,
                     CASE a.recommendation_strength WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
                     a.created_at
        """)
        assignments = [{
            "id": r[0], "plan_item_id": r[1], "competency_id": r[2],
            "competency_name": r[3] or "",
            "content_type": r[4], "content_id": r[5],
            "content_title": r[6], "content_url": r[7],
            "recommendation_strength": r[8], "is_required": r[9],
            "source": r[10], "status": r[11], "reason_text": r[12],
            "progress_pct": r[13],
            "assigned_at": str(r[14]), "started_at": str(r[15]) if r[15] else None,
            "completed_at": str(r[16]) if r[16] else None,
            "link_id": r[17],
        } for r in rows]
    return resp({"learning_path": assignments, "plan_id": plan[0] if plan else None})


def action_learning_recommendations_me(conn, user_id):
    """Рекомендации на основе gap-а активного плана."""
    plan = fetch_one(conn, f"SELECT id,target_role_profile_id FROM {S}.professional_growth_plans WHERE user_id={user_id} AND status='active' LIMIT 1")
    if not plan:
        return resp({"recommendations": []})
    pid, role_id = plan
    # Берём top-5 not_started items с competency_id
    items = fetch_all(conn, f"""
        SELECT i.id, i.competency_id, c.name, i.current_level, i.gap_value, i.importance
        FROM {S}.professional_growth_plan_items i
        JOIN {S}.professional_competencies c ON c.id=i.competency_id
        WHERE i.plan_id={pid} AND i.status='not_started'
          AND i.competency_id IS NOT NULL AND i.title!='[DELETED]'
        ORDER BY CASE i.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
                 i.sort_order
        LIMIT 5
    """)
    result = []
    seen_links = set()
    for item in items:
        iid, comp_id, comp_name, cur_lv, gap, imp = item
        links = _resolve_content_for_gap(conn, comp_id, cur_lv or 0, gap or 0)
        for lk in links:
            if lk["link_id"] in seen_links:
                continue
            seen_links.add(lk["link_id"])
            why = (
                f"Помогает развить компетенцию «{comp_name}»: "
                f"текущий уровень {cur_lv or 0}, цель +{gap or 0}, "
                f"важность: {imp}. {lk['match_reason']}"
            ).strip(". ")
            result.append({
                "plan_item_id": iid,
                "competency_id": comp_id, "competency_name": comp_name,
                "current_level": cur_lv or 0, "gap_value": gap or 0,
                "importance": imp,
                **lk,
                "why": why,
            })
    return resp({"recommendations": result[:8]})


def _upsert_assignment(conn, user_id, pid, body):
    """Создать или найти assignment без дубля."""
    link_id    = body.get("link_id")
    content_id = body.get("content_id")
    ctype      = body.get("content_type","education_item")
    with conn.cursor() as cur:
        cur.execute(f"""
            INSERT INTO {S}.professional_learning_assignments
                (user_id,plan_id,plan_item_id,competency_id,link_id,
                 content_type,content_id,content_title,content_url,
                 recommendation_strength,is_required,source,status,reason_text)
            VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'recommended',%s)
            ON CONFLICT (user_id, COALESCE(link_id,-1), COALESCE(content_id,-1), content_type)
            WHERE status != 'skipped'
            DO UPDATE SET updated_at=NOW()
            RETURNING id
        """, (user_id, pid,
              body.get("plan_item_id"), body.get("competency_id"),
              link_id, ctype, content_id,
              body.get("content_title",""), body.get("content_url",""),
              body.get("recommendation_strength","medium"),
              bool(body.get("is_required")),
              body.get("source","recommended"),
              body.get("reason_text",""))
        )
        aid = cur.fetchone()[0]
    conn.commit()
    return aid


def action_learning_assignment_start_me(conn, user_id, body):
    plan = fetch_one(conn, f"SELECT id FROM {S}.professional_growth_plans WHERE user_id={user_id} AND status='active' LIMIT 1")
    if not plan: return resp({"error": "no active plan"}, 400)
    pid = plan[0]
    aid = body.get("id") or _upsert_assignment(conn, user_id, pid, body)
    with conn.cursor() as cur:
        cur.execute(f"UPDATE {S}.professional_learning_assignments SET status='started',started_at=NOW(),updated_at=NOW() WHERE id=%s AND user_id=%s", (int(aid), user_id))
    conn.commit()
    return resp({"ok": True, "id": aid})


def action_learning_assignment_complete_me(conn, user_id, body):
    aid = body.get("id")
    if not aid: return resp({"error": "id required"}, 400)
    with conn.cursor() as cur:
        cur.execute(f"UPDATE {S}.professional_learning_assignments SET status='completed',completed_at=NOW(),progress_pct=100,updated_at=NOW() WHERE id=%s AND user_id=%s", (int(aid), user_id))
    conn.commit()
    return resp({"ok": True})


def action_learning_assignment_skip_me(conn, user_id, body):
    aid = body.get("id")
    if not aid: return resp({"error": "id required"}, 400)
    with conn.cursor() as cur:
        cur.execute(f"UPDATE {S}.professional_learning_assignments SET status='skipped',updated_at=NOW() WHERE id=%s AND user_id=%s", (int(aid), user_id))
    conn.commit()
    return resp({"ok": True})


def action_learning_assignment_add_manual_me(conn, user_id, body):
    plan = fetch_one(conn, f"SELECT id FROM {S}.professional_growth_plans WHERE user_id={user_id} AND status='active' LIMIT 1")
    pid = plan[0] if plan else None
    title = (body.get("content_title") or "").strip()
    if not title: return resp({"error": "content_title required"}, 400)
    with conn.cursor() as cur:
        cur.execute(f"""
            INSERT INTO {S}.professional_learning_assignments
                (user_id,plan_id,competency_id,content_type,content_title,content_url,
                 recommendation_strength,source,status,reason_text)
            VALUES(%s,%s,%s,%s,%s,%s,'medium','manual','recommended',%s) RETURNING id
        """, (user_id, pid, body.get("competency_id"),
              body.get("content_type","other"), title,
              body.get("content_url",""), body.get("reason_text","")))
        new_id = cur.fetchone()[0]
    conn.commit()
    return resp({"ok": True, "id": new_id})


def action_learning_progress_me(conn, user_id):
    plan = fetch_one(conn, f"SELECT id FROM {S}.professional_growth_plans WHERE user_id={user_id} AND status='active' LIMIT 1")
    if not plan: return resp({"progress": None})
    pid = plan[0]
    rows = fetch_all(conn, f"""
        SELECT status, COUNT(*) FROM {S}.professional_learning_assignments
        WHERE plan_id={pid}
        GROUP BY status
    """)
    counts = {r[0]: r[1] for r in rows}
    total     = sum(counts.values())
    completed = counts.get("completed", 0)
    started   = counts.get("started", 0)
    skipped   = counts.get("skipped", 0)
    done_pct  = round(completed / total * 100) if total else 0
    # Competencies covered by completed assignments
    covered = (fetch_one(conn, f"""
        SELECT COUNT(DISTINCT competency_id) FROM {S}.professional_learning_assignments
        WHERE plan_id={pid} AND status='completed' AND competency_id IS NOT NULL
    """) or [0])[0]
    return resp({"progress": {
        "total": total, "completed": completed, "started": started,
        "skipped": skipped, "done_pct": done_pct,
        "competencies_covered": covered,
    }})


# ── Handler ───────────────────────────────────────────────────────────

def handler(event: dict, context) -> dict:
    """W8.3 Growth Navigator — детерминированный планировщик развития."""
    headers = event.get("headers") or {}
    method  = event.get("httpMethod", "GET")

    if method == "OPTIONS":
        return resp({}, 200)

    session_id = headers.get("x-session-id") or headers.get("X-Session-Id") or ""
    if not session_id:
        return resp({"error": "unauthorized"}, 401)

    qs     = event.get("queryStringParameters") or {}
    action = qs.get("action", "")
    body   = {}
    if event.get("body"):
        try:
            body = json.loads(event["body"])
        except Exception:
            pass

    conn = psycopg2.connect(DB)
    try:
        user_id = get_user_id(conn, session_id)
        if not user_id:
            return resp({"error": "unauthorized"}, 401)

        if action == "professional_growth_gap_summary_me":
            return action_gap_summary(conn, user_id, qs)
        if action == "professional_growth_plan_get_me":
            return action_plan_get(conn, user_id)
        if action == "professional_growth_plan_generate_me":
            if method != "POST": return resp({"error": "POST required"}, 405)
            return action_plan_generate(conn, user_id, body)
        if action == "professional_growth_plan_archive_me":
            if method != "POST": return resp({"error": "POST required"}, 405)
            return action_plan_archive(conn, user_id, body)
        if action == "professional_growth_plan_item_add_me":
            if method != "POST": return resp({"error": "POST required"}, 405)
            return action_plan_item_add(conn, user_id, body)
        if action == "professional_growth_plan_item_update_me":
            if method != "POST": return resp({"error": "POST required"}, 405)
            return action_plan_item_update(conn, user_id, body)
        if action == "professional_growth_plan_item_delete_me":
            if method != "POST": return resp({"error": "POST required"}, 405)
            return action_plan_item_delete(conn, user_id, body)
        if action == "professional_growth_progress_me":
            return action_progress(conn, user_id)
        if action == "professional_growth_recommendations_me":
            return action_recommendations(conn, user_id)
        if action == "professional_growth_checkin_add_me":
            if method != "POST": return resp({"error": "POST required"}, 405)
            return action_checkin_add(conn, user_id, body)

        # W9.1 Learning Path
        if action == "growth_learning_path_me":
            return action_learning_path_me(conn, user_id)
        if action == "growth_learning_recommendations_me":
            return action_learning_recommendations_me(conn, user_id)
        if action == "growth_learning_assignment_start_me":
            if method != "POST": return resp({"error": "POST required"}, 405)
            return action_learning_assignment_start_me(conn, user_id, body)
        if action == "growth_learning_assignment_complete_me":
            if method != "POST": return resp({"error": "POST required"}, 405)
            return action_learning_assignment_complete_me(conn, user_id, body)
        if action == "growth_learning_assignment_skip_me":
            if method != "POST": return resp({"error": "POST required"}, 405)
            return action_learning_assignment_skip_me(conn, user_id, body)
        if action == "growth_learning_assignment_add_manual_me":
            if method != "POST": return resp({"error": "POST required"}, 405)
            return action_learning_assignment_add_manual_me(conn, user_id, body)
        if action == "growth_learning_progress_me":
            return action_learning_progress_me(conn, user_id)

        return resp({"error": "unknown action"}, 400)
    finally:
        conn.close()