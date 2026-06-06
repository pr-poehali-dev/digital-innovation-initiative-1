"""
W9.2 Verified Learning Evidence Sync — Learning Bridge.

Принимает сигналы завершения обучения из education_items и learning_topics,
создаёт evidence в competency map через professional_competency_evidence.

GUARDRAIL: завершение = evidence, но НЕ автоповышение уровня компетенции.

Actions (X-Service-Token auth):
  learning_completion_ingest      — однократный ingest одного завершения
  learning_completion_backfill    — перебрать все confirmed/applied и создать evidence
  learning_completion_replay      — повторить failed/skipped entries в ledger
  learning_completion_sync_status — статус ledger (счётчики)
  learning_evidence_list          — список evidence с provenance (session auth)
"""
import json
import os
import hashlib
import datetime
import psycopg2

DB  = os.environ["DATABASE_URL"]
S   = os.environ.get("MAIN_DB_SCHEMA", "public")
SVC = os.environ.get("BRIDGE_SERVICE_TOKEN", "")


def resp(body: dict, code: int = 200) -> dict:
    return {
        "statusCode": code,
        "headers": {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, X-Service-Token, X-Session-Id",
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


def get_user_id_by_session(conn, session_id: str):
    row = fetch_one(conn,
        f"SELECT user_id FROM {S}.sessions WHERE id=%s AND expires_at>NOW() LIMIT 1",
        (session_id,))
    return row[0] if row else None


# ── Core sync logic ───────────────────────────────────────────────────

def _make_completion_ref(content_source: str, content_id: int, extra: str = "") -> str:
    """Стабильный completion_ref для идемпотентности."""
    raw = f"{content_source}:{content_id}:{extra}"
    return hashlib.sha256(raw.encode()).hexdigest()[:32]


def _find_competency_links(conn, content_source: str, content_id: int) -> list:
    """Ищет competency_links для данного контента."""
    rows = fetch_all(conn, f"""
        SELECT cl.competency_id, c.name, cl.id, cl.recommendation_strength, cl.match_reason
        FROM {S}.professional_competency_content_links cl
        JOIN {S}.professional_competencies c ON c.id=cl.competency_id
        WHERE cl.content_type='{content_source}'
          AND cl.content_id={content_id}
          AND cl.content_title != '[DELETED]'
    """)
    return [{"competency_id": r[0], "name": r[1], "link_id": r[2],
             "strength": r[3], "reason": r[4]} for r in rows]


def _ensure_user_competency(conn, user_id: int, competency_id: int) -> int:
    """Находит или создаёт professional_user_competencies с current_level=0."""
    row = fetch_one(conn, f"""
        SELECT id FROM {S}.professional_user_competencies
        WHERE user_id={user_id} AND competency_id={competency_id} LIMIT 1
    """)
    if row:
        return row[0]
    with conn.cursor() as cur:
        cur.execute(f"""
            INSERT INTO {S}.professional_user_competencies
                (user_id, competency_id, current_level, confidence, updated_at)
            VALUES(%s,%s,0,'low',NOW()) RETURNING id
        """, (user_id, competency_id))
        return cur.fetchone()[0]


def _create_evidence_idempotent(conn, uc_id: int, title: str, description: str,
                                source_ref: str, content_title: str, completed_at) -> int | None:
    """Создаёт evidence. Возвращает id, или None если уже существует."""
    try:
        with conn.cursor() as cur:
            cur.execute(f"""
                INSERT INTO {S}.professional_competency_evidence
                    (user_competency_id, evidence_type, title, description, source_ref, created_at)
                VALUES(%s,'learning_completion',%s,%s,%s,%s) RETURNING id
            """, (uc_id, title, description, source_ref,
                  completed_at or datetime.datetime.utcnow()))
            return cur.fetchone()[0]
    except Exception:
        return None


def _update_assignment_completed(conn, user_id: int, content_source: str, content_id: int):
    """Если есть learning assignment для этого контента — ставим completed."""
    with conn.cursor() as cur:
        cur.execute(f"""
            UPDATE {S}.professional_learning_assignments
            SET status='completed', completed_at=NOW(), updated_at=NOW()
            WHERE user_id=%s
              AND content_type=%s
              AND content_id=%s
              AND status NOT IN ('completed','skipped')
        """, (user_id, content_source, content_id))


def process_completion(conn, user_id: int, content_source: str, content_id: int,
                       content_title: str, completed_at, payload: dict) -> dict:
    """
    Основная логика: найти linked competencies → создать evidence → обновить assignment.
    Возвращает summary результата.
    """
    comp_ref = _make_completion_ref(content_source, content_id, str(user_id))
    links    = _find_competency_links(conn, content_source, content_id)
    evidence_ids = []
    competencies_hit = []

    for lk in links:
        uc_id = _ensure_user_competency(conn, user_id, lk["competency_id"])
        ev_title = f"Завершено: {content_title}"
        ev_desc  = (
            f"Источник: {content_source} #{content_id}. "
            f"Компетенция: {lk['name']}. "
            + (f"Почему связано: {lk['reason']}." if lk["reason"] else "")
        )
        ev_id = _create_evidence_idempotent(
            conn, uc_id, ev_title, ev_desc,
            source_ref=f"{comp_ref}:{lk['competency_id']}",
            content_title=content_title,
            completed_at=completed_at,
        )
        if ev_id:
            evidence_ids.append(ev_id)
            competencies_hit.append({"competency_id": lk["competency_id"], "name": lk["name"], "evidence_id": ev_id})

        # Обновляем last_assessed_at если есть evidence
        if ev_id:
            with conn.cursor() as cur:
                cur.execute(f"""
                    UPDATE {S}.professional_user_competencies
                    SET last_assessed_at=NOW(), updated_at=NOW()
                    WHERE id=%s
                """, (uc_id,))

    _update_assignment_completed(conn, user_id, content_source, content_id)
    conn.commit()

    return {
        "competencies_hit": len(competencies_hit),
        "evidence_created": len(evidence_ids),
        "evidence_ids": evidence_ids,
        "competencies": competencies_hit,
        "already_had_links": len(links),
    }


def _write_ledger(conn, user_id, content_source, content_id, content_title,
                  completion_ref, completed_at, sync_status, error_text, payload, evidence_ids):
    try:
        with conn.cursor() as cur:
            cur.execute(f"""
                INSERT INTO {S}.professional_learning_completion_sync
                    (user_id,content_source,content_id,content_title,completion_ref,
                     completed_at,sync_status,error_text,payload_json,evidence_ids,processed_at)
                VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb,%s::jsonb,NOW())
                ON CONFLICT (user_id,content_source,content_id,completion_ref)
                DO UPDATE SET sync_status=%s, error_text=%s, evidence_ids=%s::jsonb, processed_at=NOW()
            """, (user_id, content_source, content_id, content_title, completion_ref,
                  completed_at, sync_status, error_text,
                  json.dumps(payload, ensure_ascii=False),
                  json.dumps(evidence_ids, ensure_ascii=False),
                  sync_status, error_text, json.dumps(evidence_ids, ensure_ascii=False)))
        conn.commit()
    except Exception:
        pass  # ledger write should not block main flow


# ── Actions ───────────────────────────────────────────────────────────

def action_ingest(conn, body):
    """
    Однократный ingest одного завершения.
    body: {user_id, content_source, content_id, content_title, completed_at?}
    """
    user_id        = body.get("user_id")
    content_source = body.get("content_source","education_items")
    content_id     = body.get("content_id")
    content_title  = (body.get("content_title") or "").strip()
    completed_at   = body.get("completed_at")

    if not user_id or not content_id:
        return resp({"error": "user_id and content_id required"}, 400)

    comp_ref = _make_completion_ref(content_source, int(content_id), str(user_id))

    # Check ledger — уже обработано?
    existing = fetch_one(conn, f"""
        SELECT sync_status, evidence_ids FROM {S}.professional_learning_completion_sync
        WHERE user_id={int(user_id)} AND content_source='{content_source}'
          AND content_id={int(content_id)} AND completion_ref='{comp_ref}'
        LIMIT 1
    """)
    if existing and existing[0] == "processed":
        return resp({
            "ok": True, "skipped": True,
            "reason": "already_processed",
            "existing_evidence": existing[1] or [],
        })

    result = {"competencies_hit": 0, "evidence_created": 0, "evidence_ids": [], "competencies": []}
    error_text = None
    sync_status = "processed"
    try:
        result = process_completion(conn, int(user_id), content_source, int(content_id),
                                    content_title, completed_at, body)
    except Exception as e:
        error_text  = str(e)[:512]
        sync_status = "failed"

    _write_ledger(conn, int(user_id), content_source, int(content_id), content_title,
                  comp_ref, completed_at, sync_status, error_text,
                  {"content_title": content_title, "triggered_by": body.get("triggered_by","api")},
                  result.get("evidence_ids", []))

    return resp({
        "ok": sync_status == "processed",
        "sync_status": sync_status,
        "error": error_text,
        **result,
    })


def action_backfill(conn):
    """
    Перебирает все confirmed education_items и создаёт evidence где нет.
    Безопасно: идемпотентно через ledger + evidence dedup index.
    """
    processed = skipped = failed = 0

    # education_items: status = confirmed
    rows = fetch_all(conn, f"""
        SELECT e.id, e.user_id, e.title, e.confirmed_at
        FROM {S}.education_items e
        WHERE e.status='confirmed' AND e.user_id IS NOT NULL
        ORDER BY e.confirmed_at DESC
        LIMIT 200
    """)
    for r in rows:
        cid, uid, title, conf_at = r
        comp_ref = _make_completion_ref("education_items", cid, str(uid))
        ex = fetch_one(conn, f"""
            SELECT sync_status FROM {S}.professional_learning_completion_sync
            WHERE user_id={uid} AND content_source='education_items'
              AND content_id={cid} AND completion_ref='{comp_ref}' LIMIT 1
        """)
        if ex and ex[0] == "processed":
            skipped += 1
            continue
        links = _find_competency_links(conn, "education_items", cid)
        if not links:
            # Попробуем admin_content_items тип тоже
            skipped += 1
            _write_ledger(conn, uid, "education_items", cid, title or "",
                          comp_ref, conf_at, "skipped", "no_links", {}, [])
            continue
        try:
            result = process_completion(conn, uid, "education_items", cid,
                                        title or "", conf_at, {})
            _write_ledger(conn, uid, "education_items", cid, title or "",
                          comp_ref, conf_at, "processed", None,
                          {"backfill": True}, result.get("evidence_ids", []))
            processed += 1
        except Exception as e:
            _write_ledger(conn, uid, "education_items", cid, title or "",
                          comp_ref, conf_at, "failed", str(e)[:256], {}, [])
            failed += 1

    # learning_topics: status = applied
    topic_rows = fetch_all(conn, f"""
        SELECT lt.id, lg.user_id, lt.title, lt.updated_at
        FROM {S}.learning_topics lt
        JOIN {S}.learning_goals lg ON lg.id=lt.goal_id
        WHERE lt.status='applied' AND lg.user_id IS NOT NULL
        ORDER BY lt.updated_at DESC LIMIT 200
    """)
    for r in topic_rows:
        tid, uid, title, applied_at = r
        comp_ref = _make_completion_ref("learning_topics", tid, str(uid))
        ex = fetch_one(conn, f"""
            SELECT sync_status FROM {S}.professional_learning_completion_sync
            WHERE user_id={uid} AND content_source='learning_topics'
              AND content_id={tid} AND completion_ref='{comp_ref}' LIMIT 1
        """)
        if ex and ex[0] == "processed":
            skipped += 1
            continue
        links = _find_competency_links(conn, "learning_topics", tid)
        if not links:
            skipped += 1
            _write_ledger(conn, uid, "learning_topics", tid, title or "",
                          comp_ref, applied_at, "skipped", "no_links", {}, [])
            continue
        try:
            result = process_completion(conn, uid, "learning_topics", tid,
                                        title or "", applied_at, {})
            _write_ledger(conn, uid, "learning_topics", tid, title or "",
                          comp_ref, applied_at, "processed", None,
                          {"backfill": True}, result.get("evidence_ids", []))
            processed += 1
        except Exception as e:
            _write_ledger(conn, uid, "learning_topics", tid, title or "",
                          comp_ref, applied_at, "failed", str(e)[:256], {}, [])
            failed += 1

    return resp({"ok": True, "processed": processed, "skipped": skipped, "failed": failed})


def action_replay(conn):
    """Повторяет failed entries из ledger."""
    rows = fetch_all(conn, f"""
        SELECT id,user_id,content_source,content_id,content_title,completed_at
        FROM {S}.professional_learning_completion_sync
        WHERE sync_status='failed' LIMIT 50
    """)
    replayed = ok = failed = 0
    for r in rows:
        lid, uid, src, cid, title, comp_at = r
        links = _find_competency_links(conn, src, cid)
        if not links: continue
        try:
            result = process_completion(conn, uid, src, cid, title or "", comp_at, {"replay": True})
            comp_ref = _make_completion_ref(src, cid, str(uid))
            _write_ledger(conn, uid, src, cid, title or "", comp_ref, comp_at,
                          "processed", None, {"replayed": True}, result.get("evidence_ids",[]))
            ok += 1
        except Exception as e:
            failed += 1
        replayed += 1
    return resp({"ok": True, "replayed": replayed, "ok_count": ok, "failed_count": failed})


def action_sync_status(conn):
    """Статистика ledger."""
    rows = fetch_all(conn, f"""
        SELECT sync_status, COUNT(*) FROM {S}.professional_learning_completion_sync
        GROUP BY sync_status
    """)
    counts = {r[0]: r[1] for r in rows}
    total_evidence = (fetch_one(conn, f"""
        SELECT COUNT(*) FROM {S}.professional_competency_evidence WHERE evidence_type='learning_completion'
    """) or [0])[0]
    return resp({"sync_status": counts, "total_learning_evidence": total_evidence})


def action_evidence_list(conn, user_id):
    """Список evidence с provenance для пользователя (session auth)."""
    rows = fetch_all(conn, f"""
        SELECT ev.id, ev.user_competency_id, c.name AS comp_name,
               ev.evidence_type, ev.title, ev.description, ev.source_ref,
               ev.created_at,
               uc.current_level, uc.confidence
        FROM {S}.professional_competency_evidence ev
        JOIN {S}.professional_user_competencies uc ON uc.id=ev.user_competency_id
        JOIN {S}.professional_competencies c ON c.id=uc.competency_id
        WHERE uc.user_id={user_id}
          AND ev.evidence_type='learning_completion'
        ORDER BY ev.created_at DESC LIMIT 50
    """)
    return resp({"evidence": [{
        "id": r[0], "user_competency_id": r[1], "competency_name": r[2],
        "evidence_type": r[3], "title": r[4], "description": r[5],
        "source_ref": r[6], "created_at": str(r[7]),
        "current_level": r[8], "confidence": r[9],
    } for r in rows]})


# ── Handler ───────────────────────────────────────────────────────────

def handler(event: dict, context) -> dict:
    """W9.2 Learning Bridge — Verified Learning Evidence Sync."""
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

    conn = psycopg2.connect(DB)
    try:
        # learning_evidence_list — сессионная auth (пользователь)
        if action == "learning_evidence_list":
            session_id = headers.get("x-session-id") or headers.get("X-Session-Id") or ""
            if not session_id:
                return resp({"error": "unauthorized"}, 401)
            uid = get_user_id_by_session(conn, session_id)
            if not uid:
                return resp({"error": "unauthorized"}, 401)
            return action_evidence_list(conn, uid)

        # Остальные actions — service token auth
        token = headers.get("x-service-token") or headers.get("X-Service-Token") or ""
        if SVC and token != SVC:
            return resp({"error": "unauthorized"}, 401)
        if not SVC:
            # fallback: принимаем X-Admin-Token из admin sessions
            admin_token = headers.get("X-Admin-Token") or headers.get("x-admin-token") or ""
            if admin_token:
                row = fetch_one(conn, f"SELECT email FROM {S}.admin_sessions WHERE token=%s AND expires_at>NOW() LIMIT 1", (admin_token,))
                if not row:
                    return resp({"error": "unauthorized"}, 401)
            else:
                return resp({"error": "unauthorized"}, 401)

        if action == "learning_completion_ingest":
            if method != "POST": return resp({"error": "POST required"}, 405)
            return action_ingest(conn, body)
        if action == "learning_completion_backfill":
            if method != "POST": return resp({"error": "POST required"}, 405)
            return action_backfill(conn)
        if action == "learning_completion_replay":
            if method != "POST": return resp({"error": "POST required"}, 405)
            return action_replay(conn)
        if action == "learning_completion_sync_status":
            return action_sync_status(conn)

        return resp({"error": "unknown action"}, 400)
    finally:
        conn.close()
