"""
W6.1 — Strategy Intelligence Backend.
Deterministic analytics + YandexGPT interpretation layer.

Actions:
  Profile:     strategy_profile_get | strategy_profile_update
  Analytics:   strategy_overview | strategy_product_health | strategy_trajectory
               strategy_segments | strategy_learning | strategy_support_pain_map
  AI:          strategy_ai_summary | strategy_ai_hypotheses | strategy_ai_segment_plan
  Reports:     strategy_reports_list | strategy_report_save | strategy_report_get
"""
import json, os, hashlib, psycopg2, requests
from datetime import datetime, timedelta, timezone

DB = os.environ["DATABASE_URL"]
_s = os.environ.get("MAIN_DB_SCHEMA", "").strip()
S  = _s if _s else "t_p61016064_digital_innovation_i"

YANDEX_GPT_KEY   = os.environ.get("YANDEX_GPT_API_KEY", "")
YANDEX_FOLDER_ID = os.environ.get("YANDEX_FOLDER_ID", "")


# ── CORS / response ────────────────────────────────────────────────

def _ok_origin(o):
    if not o: return False
    try:
        from urllib.parse import urlparse
        h = (urlparse(o).hostname or "").lower()
        return h in ("raven.moscow","www.raven.moscow","localhost") or h.endswith(".poehali.dev")
    except Exception: return False

def cors(origin=""):
    a = origin if _ok_origin(origin) else "*"
    return {"Access-Control-Allow-Origin": a,
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, X-Admin-Token",
            "Vary": "Origin"}

def resp(data, code=200, origin=""):
    return {"statusCode": code,
            "headers": {**cors(origin), "Content-Type": "application/json"},
            "body": json.dumps(data, ensure_ascii=False, default=str)}


# ── Auth ────────────────────────────────────────────────────────────

def get_actor(conn, token):
    if not token: return None
    h = hashlib.sha256(token.encode()).hexdigest()
    with conn.cursor() as cur:
        cur.execute(
            f"SELECT actor_email, actor_role FROM {S}.admin_sessions "
            f"WHERE session_token_hash=%s AND expires_at>NOW() AND revoked_at IS NULL LIMIT 1",
            (h,))
        row = cur.fetchone()
    return {"email": row[0], "role": row[1]} if row else None


# ── Audit ───────────────────────────────────────────────────────────

def _audit(conn, actor, action, details=""):
    with conn.cursor() as cur:
        cur.execute(
            f"INSERT INTO {S}.admin_audit_log "
            f"(actor_email,actor_role,action,entity_type,entity_id,before_json,after_json,reason) "
            f"VALUES(%s,%s,%s,'strategy',0,'{{}}','{{}}', %s)",
            (actor["email"], actor["role"], action, details[:200]))
    conn.commit()


# ── Period helpers ──────────────────────────────────────────────────

def parse_period(qs):
    """Возвращает (date_from, date_to, prev_from, prev_to) как строки YYYY-MM-DD."""
    days = int(qs.get("days", 30))
    now  = datetime.now(timezone.utc).date()
    d_to   = now
    d_from = now - timedelta(days=days)
    p_to   = d_from - timedelta(days=1)
    p_from = p_to  - timedelta(days=days)
    return str(d_from), str(d_to), str(p_from), str(p_to)

def group_filter(qs):
    """Возвращает SQL-условие для фильтра group_key если задан."""
    gk = qs.get("group_key", "")
    if not gk: return ""
    gk_safe = gk.replace("'","''")
    return f"AND u.id IN (SELECT user_id FROM {S}.admin_user_groups WHERE group_key='{gk_safe}')"


# ── YandexGPT ───────────────────────────────────────────────────────

def call_gpt(messages, max_tokens=4000, temperature=0.4):
    if not YANDEX_GPT_KEY or not YANDEX_FOLDER_ID:
        return "[AI недоступен: добавьте YANDEX_GPT_API_KEY и YANDEX_FOLDER_ID]"
    try:
        r = requests.post(
            "https://llm.api.cloud.yandex.net/foundationModels/v1/completion",
            headers={"Authorization": f"Api-Key {YANDEX_GPT_KEY}", "Content-Type": "application/json"},
            json={"modelUri": f"gpt://{YANDEX_FOLDER_ID}/yandexgpt/latest",
                  "completionOptions": {"stream": False, "temperature": temperature,
                                        "maxTokens": max_tokens},
                  "messages": [{"role": m["role"], "text": m["content"]} for m in messages]},
            timeout=90)
        return r.json()["result"]["alternatives"][0]["message"]["text"]
    except Exception as e:
        return f"[AI error: {e}]"


# ── Profile ─────────────────────────────────────────────────────────

def action_profile_get(conn, origin):
    with conn.cursor() as cur:
        cur.execute(f"""
            SELECT mission_text, north_star_name, north_star_definition,
                   target_segments_json, quarter_goals_json,
                   priority_themes_json, non_goals_json,
                   updated_by, updated_at
            FROM {S}.admin_strategy_profiles WHERE workspace_key='default' LIMIT 1
        """)
        row = cur.fetchone()
    if not row:
        return resp({"profile": {}}, origin=origin)
    return resp({"profile": {
        "mission_text":           row[0], "north_star_name":       row[1],
        "north_star_definition":  row[2], "target_segments":       row[3] or [],
        "quarter_goals":          row[4] or [], "priority_themes": row[5] or [],
        "non_goals":              row[6] or [], "updated_by":       row[7],
        "updated_at":             str(row[8]) if row[8] else None,
    }}, origin=origin)


def action_profile_update(conn, actor, body, origin):
    fields, vals = [], []
    for f, col in [
        ("mission_text",          "mission_text"),
        ("north_star_name",       "north_star_name"),
        ("north_star_definition", "north_star_definition"),
    ]:
        if f in body:
            fields.append(f"{col} = %s"); vals.append(body[f])
    for f, col in [
        ("target_segments",  "target_segments_json"),
        ("quarter_goals",    "quarter_goals_json"),
        ("priority_themes",  "priority_themes_json"),
        ("non_goals",        "non_goals_json"),
    ]:
        if f in body:
            fields.append(f"{col} = %s")
            vals.append(json.dumps(body[f], ensure_ascii=False))
    if not fields:
        return resp({"ok": True}, origin=origin)
    fields += ["updated_by = %s", "updated_at = NOW()"]
    vals.append(actor["email"])
    with conn.cursor() as cur:
        cur.execute(
            f"UPDATE {S}.admin_strategy_profiles SET {', '.join(fields)} WHERE workspace_key='default'",
            vals)
    conn.commit()
    _audit(conn, actor, "strategy.profile_updated")
    return resp({"ok": True}, origin=origin)


# ── Analytics helpers ───────────────────────────────────────────────

def _fetch_one(conn, sql, params=None):
    with conn.cursor() as cur:
        cur.execute(sql, params or ())
        return cur.fetchone()

def _fetch_all(conn, sql, params=None):
    with conn.cursor() as cur:
        cur.execute(sql, params or ())
        return cur.fetchall()

def _delta(curr, prev):
    """Возвращает % изменения или None."""
    if prev is None or prev == 0:
        return None
    return round((curr - prev) / prev * 100, 1)


# ── Overview ────────────────────────────────────────────────────────

def action_overview(conn, qs, origin):
    d_from, d_to, p_from, p_to = parse_period(qs)
    gf = group_filter(qs)

    def kpi(sql_curr, sql_prev):
        c = (_fetch_one(conn, sql_curr) or [0])[0] or 0
        p = (_fetch_one(conn, sql_prev) or [0])[0] or 0
        return int(c), int(p), _delta(c, p)

    new_c, new_p, new_d = kpi(
        f"SELECT COUNT(*) FROM {S}.users u WHERE u.created_at::date BETWEEN '{d_from}' AND '{d_to}' {gf}",
        f"SELECT COUNT(*) FROM {S}.users u WHERE u.created_at::date BETWEEN '{p_from}' AND '{p_to}' {gf}")

    active_c, active_p, active_d = kpi(
        f"SELECT COUNT(DISTINCT user_id) FROM {S}.activity_log WHERE created_at::date BETWEEN '{d_from}' AND '{d_to}'",
        f"SELECT COUNT(DISTINCT user_id) FROM {S}.activity_log WHERE created_at::date BETWEEN '{p_from}' AND '{p_to}'")

    goals_c, goals_p, goals_d = kpi(
        f"SELECT COUNT(*) FROM {S}.learning_goals WHERE created_at::date BETWEEN '{d_from}' AND '{d_to}'",
        f"SELECT COUNT(*) FROM {S}.learning_goals WHERE created_at::date BETWEEN '{p_from}' AND '{p_to}'")

    completed_c, completed_p, completed_d = kpi(
        f"SELECT COUNT(*) FROM {S}.learning_goals WHERE status='done' AND updated_at::date BETWEEN '{d_from}' AND '{d_to}'",
        f"SELECT COUNT(*) FROM {S}.learning_goals WHERE status='done' AND updated_at::date BETWEEN '{p_from}' AND '{p_to}'")

    tickets_c, tickets_p, tickets_d = kpi(
        f"SELECT COUNT(*) FROM {S}.admin_tickets WHERE created_at::date BETWEEN '{d_from}' AND '{d_to}'",
        f"SELECT COUNT(*) FROM {S}.admin_tickets WHERE created_at::date BETWEEN '{p_from}' AND '{p_to}'")

    checkins_c, checkins_p, checkins_d = kpi(
        f"SELECT COUNT(*) FROM {S}.learning_checkins WHERE created_at::date BETWEEN '{d_from}' AND '{d_to}'",
        f"SELECT COUNT(*) FROM {S}.learning_checkins WHERE created_at::date BETWEEN '{p_from}' AND '{p_to}'")

    return resp({"overview": {
        "period": {"from": d_from, "to": d_to, "days": qs.get("days", "30")},
        "kpis": [
            {"key": "new_users",       "label": "Новых пользователей", "value": new_c,       "prev": new_p,       "delta": new_d,       "icon": "Users"},
            {"key": "active_users",    "label": "Активных",            "value": active_c,    "prev": active_p,    "delta": active_d,    "icon": "Activity"},
            {"key": "goals_created",   "label": "Новых целей",         "value": goals_c,     "prev": goals_p,     "delta": goals_d,     "icon": "Target"},
            {"key": "goals_completed", "label": "Завершённых целей",   "value": completed_c, "prev": completed_p, "delta": completed_d, "icon": "CheckCircle"},
            {"key": "checkins",        "label": "Чекинов",             "value": checkins_c,  "prev": checkins_p,  "delta": checkins_d,  "icon": "CalendarCheck"},
            {"key": "tickets",         "label": "Тикетов создано",     "value": tickets_c,   "prev": tickets_p,   "delta": tickets_d,   "icon": "Ticket"},
        ],
    }}, origin=origin)


# ── Product Health ──────────────────────────────────────────────────

def action_product_health(conn, qs, origin):
    d_from, d_to, p_from, p_to = parse_period(qs)

    # Activation: registered → has first learning_goal
    total_new = (_fetch_one(conn,
        f"SELECT COUNT(*) FROM {S}.users WHERE created_at::date BETWEEN '{d_from}' AND '{d_to}'"
    ) or [0])[0] or 0
    activated = (_fetch_one(conn, f"""
        SELECT COUNT(DISTINCT g.user_id) FROM {S}.learning_goals g
        JOIN {S}.users u ON u.id=g.user_id
        WHERE u.created_at::date BETWEEN '{d_from}' AND '{d_to}'
    """) or [0])[0] or 0
    activation_rate = round(activated / total_new * 100, 1) if total_new > 0 else 0

    # Median days to first goal
    med_goal = (_fetch_one(conn, f"""
        SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (g.created_at - u.created_at))/86400)
        FROM (SELECT user_id, MIN(created_at) AS created_at FROM {S}.learning_goals GROUP BY user_id) g
        JOIN {S}.users u ON u.id=g.user_id
        WHERE u.created_at::date BETWEEN '{d_from}' AND '{d_to}'
    """) or [None])[0]

    # Median days to first check-in
    med_checkin = (_fetch_one(conn, f"""
        SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (c.created_at - u.created_at))/86400)
        FROM (SELECT user_id, MIN(created_at) AS created_at FROM {S}.learning_checkins GROUP BY user_id) c
        JOIN {S}.users u ON u.id=c.user_id
        WHERE u.created_at::date BETWEEN '{d_from}' AND '{d_to}'
    """) or [None])[0]

    # Goal completion rate (всего active goals)
    total_goals = (_fetch_one(conn,
        f"SELECT COUNT(*) FROM {S}.learning_goals WHERE created_at::date <= '{d_to}'"
    ) or [0])[0] or 0
    done_goals = (_fetch_one(conn,
        f"SELECT COUNT(*) FROM {S}.learning_goals WHERE status='done'"
    ) or [0])[0] or 0
    archived_goals = (_fetch_one(conn,
        f"SELECT COUNT(*) FROM {S}.learning_goals WHERE status='archived'"
    ) or [0])[0] or 0
    completion_rate = round(done_goals / total_goals * 100, 1) if total_goals > 0 else 0
    archive_rate    = round(archived_goals / total_goals * 100, 1) if total_goals > 0 else 0

    # Stalled: active goal, 0 checkins last 14 days
    stalled = (_fetch_one(conn, f"""
        SELECT COUNT(*) FROM {S}.learning_goals g
        WHERE g.status='active'
        AND NOT EXISTS (
            SELECT 1 FROM {S}.learning_checkins c
            WHERE c.goal_id=g.id AND c.created_at >= NOW()-INTERVAL '14 days'
        )
    """) or [0])[0] or 0
    active_goals_now = (_fetch_one(conn,
        f"SELECT COUNT(*) FROM {S}.learning_goals WHERE status='active'"
    ) or [0])[0] or 0
    stalled_rate = round(stalled / active_goals_now * 100, 1) if active_goals_now > 0 else 0

    # Tickets per 100 active users
    active_users = (_fetch_one(conn, f"""
        SELECT COUNT(DISTINCT user_id) FROM {S}.activity_log
        WHERE created_at::date BETWEEN '{d_from}' AND '{d_to}'
    """) or [0])[0] or 0
    tickets_period = (_fetch_one(conn,
        f"SELECT COUNT(*) FROM {S}.admin_tickets WHERE created_at::date BETWEEN '{d_from}' AND '{d_to}'"
    ) or [0])[0] or 0
    ticket_rate = round(tickets_period / active_users * 100, 1) if active_users > 0 else 0

    # Repeat ticket rate
    repeat = (_fetch_one(conn, f"""
        SELECT COUNT(*) FROM (
            SELECT requester_email FROM {S}.admin_tickets
            WHERE created_at::date BETWEEN '{d_from}' AND '{d_to}'
            GROUP BY requester_email HAVING COUNT(*) >= 2
        ) x
    """) or [0])[0] or 0
    unique_requesters = (_fetch_one(conn, f"""
        SELECT COUNT(DISTINCT requester_email) FROM {S}.admin_tickets
        WHERE created_at::date BETWEEN '{d_from}' AND '{d_to}'
    """) or [0])[0] or 0
    repeat_rate = round(repeat / unique_requesters * 100, 1) if unique_requesters > 0 else 0

    return resp({"health": {
        "period": {"from": d_from, "to": d_to},
        "metrics": [
            {"key": "new_users",          "label": "Новых пользователей", "value": total_new,     "unit": ""},
            {"key": "active_users",       "label": "Активных пользователей", "value": active_users,   "unit": ""},
            {"key": "activated_users",    "label": "Активированных",      "value": activated,     "unit": ""},
            {"key": "activation_rate",    "label": "Activation rate",     "value": activation_rate, "unit": "%"},
            {"key": "med_days_to_goal",   "label": "Медиана дней до цели","value": round(float(med_goal),1) if med_goal else None, "unit": "д."},
            {"key": "med_days_to_checkin","label": "Медиана дней до чекина","value": round(float(med_checkin),1) if med_checkin else None, "unit": "д."},
            {"key": "completion_rate",    "label": "Goal completion rate","value": completion_rate, "unit": "%"},
            {"key": "archive_rate",       "label": "Goal archive rate",   "value": archive_rate,   "unit": "%"},
            {"key": "stalled_rate",       "label": "Stalled goals",       "value": stalled_rate,   "unit": "%"},
            {"key": "ticket_rate",        "label": "Тикетов на 100 active","value": ticket_rate,  "unit": ""},
            {"key": "repeat_ticket_rate", "label": "Repeat ticket rate",  "value": repeat_rate,    "unit": "%"},
        ],
    }}, origin=origin)


# ── User Trajectory ─────────────────────────────────────────────────

def action_trajectory(conn, qs, origin):
    d_from, d_to, _, _ = parse_period(qs)

    # Funnel: registered → first goal → first checkin → 2nd checkin → completed
    registered = (_fetch_one(conn,
        f"SELECT COUNT(*) FROM {S}.users WHERE created_at::date BETWEEN '{d_from}' AND '{d_to}'"
    ) or [0])[0] or 0

    first_goal = (_fetch_one(conn, f"""
        SELECT COUNT(DISTINCT g.user_id) FROM {S}.learning_goals g
        JOIN {S}.users u ON u.id=g.user_id
        WHERE u.created_at::date BETWEEN '{d_from}' AND '{d_to}'
    """) or [0])[0] or 0

    first_checkin = (_fetch_one(conn, f"""
        SELECT COUNT(DISTINCT c.user_id) FROM {S}.learning_checkins c
        JOIN {S}.users u ON u.id=c.user_id
        WHERE u.created_at::date BETWEEN '{d_from}' AND '{d_to}'
    """) or [0])[0] or 0

    second_checkin = (_fetch_one(conn, f"""
        SELECT COUNT(DISTINCT user_id) FROM (
            SELECT user_id FROM {S}.learning_checkins c
            JOIN {S}.users u ON u.id=c.user_id
            WHERE u.created_at::date BETWEEN '{d_from}' AND '{d_to}'
            GROUP BY c.user_id HAVING COUNT(*) >= 2
        ) x
    """) or [0])[0] or 0

    completed = (_fetch_one(conn, f"""
        SELECT COUNT(DISTINCT g.user_id) FROM {S}.learning_goals g
        JOIN {S}.users u ON u.id=g.user_id
        WHERE g.status='done' AND u.created_at::date BETWEEN '{d_from}' AND '{d_to}'
    """) or [0])[0] or 0

    def conv(a, b):
        return round(a / b * 100, 1) if b > 0 else 0

    funnel = [
        {"stage": "registered",      "label": "Зарегистрированы",  "users": registered,    "conv_from_prev": 100,                             "conv_total": 100},
        {"stage": "first_goal",      "label": "Первая цель",        "users": first_goal,    "conv_from_prev": conv(first_goal, registered),    "conv_total": conv(first_goal, registered)},
        {"stage": "first_checkin",   "label": "Первый чекин",       "users": first_checkin, "conv_from_prev": conv(first_checkin, first_goal), "conv_total": conv(first_checkin, registered)},
        {"stage": "second_checkin",  "label": "Второй чекин",       "users": second_checkin,"conv_from_prev": conv(second_checkin, first_checkin),"conv_total": conv(second_checkin, registered)},
        {"stage": "completed_goal",  "label": "Завершённая цель",   "users": completed,     "conv_from_prev": conv(completed, second_checkin), "conv_total": conv(completed, registered)},
    ]

    # Drop-off: biggest absolute drop
    drops = []
    for i in range(1, len(funnel)):
        prev = funnel[i-1]["users"]
        curr = funnel[i]["users"]
        drops.append({"from": funnel[i-1]["stage"], "to": funnel[i]["stage"],
                       "lost": prev - curr, "loss_pct": round((prev-curr)/prev*100,1) if prev>0 else 0})
    biggest_drop = max(drops, key=lambda x: x["lost"]) if drops else None

    return resp({"trajectory": {
        "period": {"from": d_from, "to": d_to},
        "funnel": funnel,
        "biggest_dropoff": biggest_drop,
    }}, origin=origin)


# ── Segments ────────────────────────────────────────────────────────

def action_segments(conn, qs, origin):
    d_from, d_to, _, _ = parse_period(qs)

    def seg_stats(user_ids_subq, label, segment_key):
        rows = _fetch_all(conn, f"""
            SELECT
                COUNT(DISTINCT u.id)                          AS size,
                COUNT(DISTINCT CASE WHEN g.id IS NOT NULL THEN u.id END) AS has_goal,
                COUNT(DISTINCT CASE WHEN g.status='done' THEN g.id END)  AS completed_goals,
                COUNT(DISTINCT t.id)                          AS tickets,
                COUNT(DISTINCT CASE WHEN cf.id IS NOT NULL THEN u.id END) AS flagged
            FROM {S}.users u
            LEFT JOIN {S}.learning_goals g ON g.user_id=u.id
            LEFT JOIN {S}.admin_tickets t  ON t.requester_email=u.email
              AND t.created_at::date BETWEEN '{d_from}' AND '{d_to}'
            LEFT JOIN {S}.admin_user_case_flags cf ON cf.user_id=u.id AND cf.status='open'
            WHERE u.id IN ({user_ids_subq})
        """)
        r = rows[0] if rows else [0,0,0,0,0]
        sz = int(r[0]) or 1
        return {
            "key": segment_key, "label": label,
            "size": int(r[0]),
            "activation_rate": round(int(r[1]) / sz * 100, 1),
            "completion_rate": round(int(r[2]) / max(int(r[1]),1) * 100, 1),
            "ticket_rate":     round(int(r[3]) / sz * 100, 1),
            "flagged_share":   round(int(r[4]) / sz * 100, 1),
        }

    new_users_sq     = f"SELECT id FROM {S}.users WHERE created_at::date BETWEEN '{d_from}' AND '{d_to}'"
    active_users_sq  = f"SELECT DISTINCT user_id FROM {S}.activity_log WHERE created_at::date BETWEEN '{d_from}' AND '{d_to}'"
    stalled_sq       = f"""
        SELECT DISTINCT g.user_id FROM {S}.learning_goals g WHERE g.status='active'
        AND NOT EXISTS (SELECT 1 FROM {S}.learning_checkins c WHERE c.goal_id=g.id AND c.created_at>=NOW()-INTERVAL '14 days')
    """
    support_heavy_sq = f"""
        SELECT DISTINCT requester_email FROM {S}.admin_tickets
        WHERE created_at::date BETWEEN '{d_from}' AND '{d_to}'
        GROUP BY requester_email HAVING COUNT(*)>=2
    """
    support_as_users = f"""
        SELECT u.id FROM {S}.users u WHERE u.email IN ({support_heavy_sq})
    """
    grouped_sq = f"SELECT DISTINCT user_id FROM {S}.admin_user_groups"
    flagged_sq = f"SELECT DISTINCT user_id FROM {S}.admin_user_case_flags WHERE status='open'"

    segments = [
        seg_stats(new_users_sq,     "Новые",              "new"),
        seg_stats(active_users_sq,  "Активные",           "active"),
        seg_stats(stalled_sq,       "Застрявшие",         "stalled"),
        seg_stats(support_as_users, "Support-heavy",      "support_heavy"),
        seg_stats(grouped_sq,       "В группах",          "grouped"),
        seg_stats(flagged_sq,       "Flagged (open)",     "flagged"),
    ]

    return resp({"segments": segments, "period": {"from": d_from, "to": d_to}}, origin=origin)


# ── Learning Intelligence ───────────────────────────────────────────

def action_learning(conn, qs, origin):
    d_from, d_to, _, _ = parse_period(qs)

    # Goals by status
    rows = _fetch_all(conn, f"""
        SELECT status, COUNT(*) FROM {S}.learning_goals
        WHERE created_at::date <= '{d_to}'
        GROUP BY status
    """)
    goals_by_status = {r[0]: int(r[1]) for r in rows}

    # Reopen rate
    reopen_events = (_fetch_one(conn, f"""
        SELECT COUNT(*) FROM {S}.admin_audit_log
        WHERE action='user.learning_reopened' AND created_at::date BETWEEN '{d_from}' AND '{d_to}'
    """) or [0])[0] or 0

    # Goals with 0 check-ins (active)
    zero_checkin = (_fetch_one(conn, f"""
        SELECT COUNT(*) FROM {S}.learning_goals g
        WHERE g.status='active'
        AND NOT EXISTS (SELECT 1 FROM {S}.learning_checkins c WHERE c.goal_id=g.id)
    """) or [0])[0] or 0
    active_total = goals_by_status.get("active", 0) or 1

    # Check-in distribution
    rows_ci = _fetch_all(conn, f"""
        SELECT bucket, COUNT(*) FROM (
            SELECT g.id,
                CASE WHEN cnt=0 THEN '0' WHEN cnt=1 THEN '1' WHEN cnt<=3 THEN '2-3'
                     WHEN cnt<=7 THEN '4-7' ELSE '8+' END AS bucket
            FROM {S}.learning_goals g
            LEFT JOIN (SELECT goal_id, COUNT(*) cnt FROM {S}.learning_checkins GROUP BY goal_id) c
              ON c.goal_id=g.id
            WHERE g.status IN ('active','done')
        ) x GROUP BY bucket ORDER BY bucket
    """)
    checkin_dist = [{"bucket": r[0], "goals": int(r[1])} for r in rows_ci]

    # Average check-ins per active goal
    avg_ci = (_fetch_one(conn, f"""
        SELECT AVG(cnt) FROM (
            SELECT g.id, COALESCE(c.cnt, 0) cnt
            FROM {S}.learning_goals g
            LEFT JOIN (SELECT goal_id, COUNT(*) cnt FROM {S}.learning_checkins GROUP BY goal_id) c
              ON c.goal_id=g.id
            WHERE g.status='active'
        ) x
    """) or [None])[0]

    # Education items count
    edu_users = (_fetch_one(conn,
        f"SELECT COUNT(DISTINCT user_id) FROM {S}.education_items WHERE archived_at IS NULL"
    ) or [0])[0] or 0

    # Recent check-ins in period
    checkins_period = (_fetch_one(conn,
        f"SELECT COUNT(*) FROM {S}.learning_checkins WHERE created_at::date BETWEEN '{d_from}' AND '{d_to}'"
    ) or [0])[0] or 0

    return resp({"learning": {
        "period": {"from": d_from, "to": d_to},
        "goals_by_status": goals_by_status,
        "zero_checkin_active_pct": round(zero_checkin / active_total * 100, 1),
        "reopen_events_period": reopen_events,
        "avg_checkins_per_active_goal": round(float(avg_ci), 2) if avg_ci else 0,
        "checkins_in_period": checkins_period,
        "checkin_distribution": checkin_dist,
        "users_with_education_items": edu_users,
    }}, origin=origin)


# ── Support Pain Map ────────────────────────────────────────────────

def action_support_pain_map(conn, qs, origin):
    d_from, d_to, _, _ = parse_period(qs)

    # Priority breakdown
    rows_p = _fetch_all(conn, f"""
        SELECT priority, COUNT(*) FROM {S}.admin_tickets
        WHERE created_at::date BETWEEN '{d_from}' AND '{d_to}'
        GROUP BY priority ORDER BY COUNT(*) DESC
    """)
    by_priority = [{"priority": r[0], "count": int(r[1])} for r in rows_p]

    # Status breakdown
    rows_s = _fetch_all(conn, f"""
        SELECT status, COUNT(*) FROM {S}.admin_tickets
        WHERE created_at::date BETWEEN '{d_from}' AND '{d_to}'
        GROUP BY status ORDER BY COUNT(*) DESC
    """)
    by_status = [{"status": r[0], "count": int(r[1])} for r in rows_s]

    # Top modules (proxy for pain area)
    rows_m = _fetch_all(conn, f"""
        SELECT COALESCE(NULLIF(module_slug,''),'(без модуля)'), COUNT(*)
        FROM {S}.admin_tickets WHERE created_at::date BETWEEN '{d_from}' AND '{d_to}'
        GROUP BY 1 ORDER BY 2 DESC LIMIT 8
    """)
    by_module = [{"module": r[0], "count": int(r[1])} for r in rows_m]

    # Repeat requesters
    rows_r = _fetch_all(conn, f"""
        SELECT requester_email, COUNT(*) AS cnt
        FROM {S}.admin_tickets WHERE created_at::date BETWEEN '{d_from}' AND '{d_to}'
        GROUP BY 1 HAVING COUNT(*)>=2 ORDER BY 2 DESC LIMIT 10
    """)
    repeat_requesters = [{"email": r[0], "tickets": int(r[1])} for r in rows_r]

    # Stalled users with tickets (learning stall + support)
    stalled_with_tickets = (_fetch_one(conn, f"""
        SELECT COUNT(DISTINCT t.requester_email)
        FROM {S}.admin_tickets t
        WHERE t.created_at::date BETWEEN '{d_from}' AND '{d_to}'
        AND t.requester_email IN (
            SELECT DISTINCT u.email FROM {S}.users u
            JOIN {S}.learning_goals g ON g.user_id=u.id
            WHERE g.status='active'
            AND NOT EXISTS (SELECT 1 FROM {S}.learning_checkins c WHERE c.goal_id=g.id AND c.created_at>=NOW()-INTERVAL '14 days')
        )
    """) or [0])[0] or 0

    # Overdue/urgent share
    critical = (_fetch_one(conn, f"""
        SELECT COUNT(*) FROM {S}.admin_tickets
        WHERE created_at::date BETWEEN '{d_from}' AND '{d_to}'
        AND priority IN ('urgent','high') AND status NOT IN ('resolved','closed')
    """) or [0])[0] or 0

    total_tickets = sum(r["count"] for r in by_priority)

    return resp({"support": {
        "period": {"from": d_from, "to": d_to},
        "total_tickets": total_tickets,
        "by_priority": by_priority,
        "by_status": by_status,
        "by_module": by_module,
        "repeat_requesters": repeat_requesters,
        "stalled_users_with_tickets": stalled_with_tickets,
        "critical_open": critical,
    }}, origin=origin)


# ── AI: Executive Summary ───────────────────────────────────────────

def action_ai_summary(conn, actor, qs, origin):
    d_from, d_to, _, _ = parse_period(qs)

    # Собираем все метрики
    health_resp  = json.loads(action_product_health(conn, qs, "").get("body","{}"))
    traj_resp    = json.loads(action_trajectory(conn, qs, "").get("body","{}"))
    learn_resp   = json.loads(action_learning(conn, qs, "").get("body","{}"))
    support_resp = json.loads(action_support_pain_map(conn, qs, "").get("body","{}"))

    # Strategy profile
    profile_resp = json.loads(action_profile_get(conn, "").get("body","{}"))
    profile = profile_resp.get("profile", {})

    context = f"""
Данные продукта за период {d_from} — {d_to}:

PRODUCT HEALTH:
{json.dumps(health_resp.get("health",{}).get("metrics",[]), ensure_ascii=False, indent=2)}

USER TRAJECTORY FUNNEL:
{json.dumps(traj_resp.get("trajectory",{}).get("funnel",[]), ensure_ascii=False, indent=2)}
Biggest drop-off: {traj_resp.get("trajectory",{}).get("biggest_dropoff",{})}

LEARNING:
{json.dumps(learn_resp.get("learning",{}), ensure_ascii=False, indent=2)}

SUPPORT:
Total tickets: {support_resp.get("support",{}).get("total_tickets",0)}
By priority: {json.dumps(support_resp.get("support",{}).get("by_priority",[]), ensure_ascii=False)}
Critical open: {support_resp.get("support",{}).get("critical_open",0)}
Stalled users with tickets: {support_resp.get("support",{}).get("stalled_users_with_tickets",0)}

STRATEGY PROFILE:
Mission: {profile.get("mission_text","не задана")}
North Star: {profile.get("north_star_name","не задан")}
Quarter goals: {json.dumps(profile.get("quarter_goals",[]), ensure_ascii=False)}
"""

    # Добавляем контекст квартальных целей и приоритетов из профиля
    strategy_context = ""
    if profile.get("quarter_goals"):
        strategy_context += f"\nКвартальные цели: {json.dumps(profile.get('quarter_goals',[]), ensure_ascii=False)}"
    if profile.get("priority_themes"):
        strategy_context += f"\nПриоритетные направления: {json.dumps(profile.get('priority_themes',[]), ensure_ascii=False)}"
    if profile.get("target_segments"):
        strategy_context += f"\nЦелевые сегменты: {json.dumps(profile.get('target_segments',[]), ensure_ascii=False)}"
    if profile.get("non_goals"):
        strategy_context += f"\nВне скоупа: {json.dumps(profile.get('non_goals',[]), ensure_ascii=False)}"

    # Подсчитываем общий объём данных для оценки confidence
    total_users = (health_resp.get("health",{}).get("metrics") or [{}])
    total_users_val = next((m.get("value",0) for m in total_users if m.get("key")=="new_users"), 0) or 0
    data_volume_note = ""
    if total_users_val < 10:
        data_volume_note = f"\n\nВАЖНО: В системе всего {total_users_val} пользователей за период. Это ранняя стадия продукта. Confidence всех выводов должен быть 'low' если данных < 20 пользователей. Давай конкретные выводы о том, ЧТО НУЖНО СДЕЛАТЬ ПРЯМО СЕЙЧАС для построения product-market fit, а не описывай отсутствие данных."

    messages = [
        {"role": "system", "content": (
            "Ты старший продуктовый аналитик и growth стратег. "
            "Работаешь с реальными данными продукта на русском языке. "
            "Если данных мало — говоришь честно, но всё равно даёшь конкретные actionable выводы. "
            "Отвечай строго в JSON формате без markdown."
        )},
        {"role": "user", "content": f"""
Сформируй стратегическую сводку продукта на основе данных.

{context}
{strategy_context}
{data_volume_note}

Правила:
- health_score: 1-10, где 10 = отлично работающий продукт с growth
- confidence: "high" если данных ≥50 событий, "medium" если 10-50, "low" если <10
- key_insights: минимум 3, максимум 6
- recommended_focus: конкретное действие, не абстракция
- Если данных мало — давай выводы о том что нужно СТРОИТЬ/ИЗМЕРЯТЬ прямо сейчас

Верни JSON строго в формате:
{{
  "headline": "одно предложение — главное что происходит с продуктом прямо сейчас",
  "period": "{d_from} — {d_to}",
  "data_maturity": "early|growing|mature",
  "health_score": число от 1 до 10,
  "health_reasoning": "2-3 конкретных предложения с цифрами",
  "key_insights": [
    {{"title": "...", "claim": "конкретное утверждение с цифрой или фактом", "confidence": "high|medium|low", "impact": "high|medium|low"}}
  ],
  "top_risks": ["конкретный риск с последствием", "...", "..."],
  "top_opportunities": ["конкретная возможность с метрикой", "...", "..."],
  "recommended_focus": "1-2 предложения — самое важное действие прямо сейчас с метрикой успеха",
  "next_actions": ["действие 1", "действие 2", "действие 3"]
}}
Только JSON.
"""}
    ]

    text = call_gpt(messages, max_tokens=3500)
    try:
        import re
        # Убираем markdown-обёртки
        clean = re.sub(r'^```(?:json)?\s*', '', text.strip())
        clean = re.sub(r'\s*```$', '', clean).strip()
        # Ищем JSON-блок если есть лишний текст вокруг
        m = re.search(r'\{[\s\S]*\}', clean)
        if m:
            clean = m.group(0)
        ai_data = json.loads(clean)
    except Exception:
        ai_data = {"raw": text, "error": "parse_failed", "headline": "Не удалось разобрать ответ ИИ"}

    # Сохраняем отчёт
    _save_report(conn, "ai_summary", d_from, d_to, {}, {}, ai_data, actor["email"])
    _audit(conn, actor, "strategy.ai_summary_generated", f"period {d_from}:{d_to}")

    return resp({"ai_summary": ai_data, "period": {"from": d_from, "to": d_to}}, origin=origin)


# ── AI: Hypotheses ──────────────────────────────────────────────────

def action_ai_hypotheses(conn, actor, qs, origin):
    d_from, d_to, _, _ = parse_period(qs)
    focus = qs.get("focus", "growth")  # growth | completion | churn | support | onboarding

    health_resp  = json.loads(action_product_health(conn, qs, "").get("body","{}"))
    traj_resp    = json.loads(action_trajectory(conn, qs, "").get("body","{}"))
    learn_resp   = json.loads(action_learning(conn, qs, "").get("body","{}"))
    support_resp = json.loads(action_support_pain_map(conn, qs, "").get("body","{}"))

    context = f"""
Period: {d_from} — {d_to}
Focus area: {focus}

Metrics:
{json.dumps(health_resp.get("health",{}).get("metrics",[]), ensure_ascii=False)}

Funnel biggest drop-off: {traj_resp.get("trajectory",{}).get("biggest_dropoff",{})}

Learning stalled rate: {learn_resp.get("learning",{}).get("goals_by_status",{})}
Zero checkin active goals pct: {learn_resp.get("learning",{}).get("zero_checkin_active_pct",0)}%
Avg checkins per active goal: {learn_resp.get("learning",{}).get("avg_checkins_per_active_goal",0)}

Support total: {support_resp.get("support",{}).get("total_tickets",0)}
Critical open: {support_resp.get("support",{}).get("critical_open",0)}
"""

    messages = [
        {"role": "system", "content": "Ты эксперт по продуктовому росту. Генерируй конкретные гипотезы, основанные на данных. Отвечай на русском в JSON."},
        {"role": "user", "content": f"""
На основе данных продукта сгенерируй 10 гипотез роста с фокусом: {focus}.

{context}

Верни JSON:
{{
  "focus": "{focus}",
  "hypotheses": [
    {{
      "id": 1,
      "title": "...",
      "problem": "что не работает",
      "hypothesis": "если мы сделаем X, то Y вырастет на Z",
      "expected_impact": "high|medium|low",
      "effort": "high|medium|low",
      "target_metric": "название метрики",
      "target_segment": "кто выиграет",
      "evidence": "на каких данных основана гипотеза",
      "how_to_measure": "как измерить успех"
    }}
  ]
}}
Только JSON.
"""}
    ]

    text = call_gpt(messages, max_tokens=4000)
    try:
        import re
        clean = re.sub(r'^```(?:json)?\s*', '', text.strip())
        clean = re.sub(r'\s*```$', '', clean).strip()
        m = re.search(r'\{[\s\S]*\}', clean)
        if m: clean = m.group(0)
        ai_data = json.loads(clean)
    except Exception:
        ai_data = {"raw": text, "error": "parse_failed"}

    _save_report(conn, "ai_hypotheses", d_from, d_to, {"focus": focus}, {}, ai_data, actor["email"])
    _audit(conn, actor, "strategy.hypotheses_generated", f"focus={focus}")

    return resp({"hypotheses": ai_data, "period": {"from": d_from, "to": d_to}}, origin=origin)


# ── AI: Segment Plan ────────────────────────────────────────────────

def action_ai_segment_plan(conn, actor, qs, body, origin):
    d_from, d_to, _, _ = parse_period(qs)
    segment_key = body.get("segment", "stalled")

    seg_resp = json.loads(action_segments(conn, qs, "").get("body","{}"))
    segments = seg_resp.get("segments", [])
    target = next((s for s in segments if s["key"] == segment_key), None)

    health_resp = json.loads(action_product_health(conn, qs, "").get("body","{}"))

    messages = [
        {"role": "system", "content": "Ты продуктовый стратег. Составляй конкретные планы работы с сегментами. Отвечай на русском в JSON."},
        {"role": "user", "content": f"""
Разработай план работы с сегментом: {segment_key}
Period: {d_from} — {d_to}

Данные сегмента:
{json.dumps(target, ensure_ascii=False, indent=2) if target else "нет данных"}

Общие метрики продукта:
{json.dumps(health_resp.get("health",{}).get("metrics",[]), ensure_ascii=False)}

Верни JSON:
{{
  "segment": "{segment_key}",
  "diagnosis": "что происходит с этим сегментом",
  "key_problem": "главная проблема",
  "plan": [
    {{
      "step": 1,
      "action": "что конкретно сделать",
      "expected_result": "что изменится",
      "timeline": "когда ожидать эффект",
      "metric_to_watch": "за какой метрикой следить"
    }}
  ],
  "success_criteria": "как понять что план сработал",
  "risks": ["риск 1", "риск 2"]
}}
Только JSON.
"""}
    ]

    text = call_gpt(messages, max_tokens=3000)
    try:
        import re
        clean = re.sub(r'^```(?:json)?\s*', '', text.strip())
        clean = re.sub(r'\s*```$', '', clean).strip()
        m = re.search(r'\{[\s\S]*\}', clean)
        if m: clean = m.group(0)
        ai_data = json.loads(clean)
    except Exception:
        ai_data = {"raw": text, "error": "parse_failed"}

    _save_report(conn, "ai_segment_plan", d_from, d_to, {"segment": segment_key}, {}, ai_data, actor["email"])
    _audit(conn, actor, "strategy.segment_plan_generated", f"segment={segment_key}")

    return resp({"segment_plan": ai_data, "period": {"from": d_from, "to": d_to}}, origin=origin)


# ── Reports ─────────────────────────────────────────────────────────

def _save_report(conn, rtype, d_from, d_to, filters, metrics, insights, actor_email):
    with conn.cursor() as cur:
        cur.execute(f"""
            INSERT INTO {S}.admin_strategy_reports
              (report_type, period_start, period_end, filters_json, metrics_json, insights_json, created_by)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
        """, (rtype, d_from, d_to,
              json.dumps(filters, ensure_ascii=False),
              json.dumps(metrics, ensure_ascii=False),
              json.dumps(insights, ensure_ascii=False, default=str),
              actor_email))
    conn.commit()


def action_reports_list(conn, origin):
    rows = _fetch_all(conn, f"""
        SELECT id, report_type, period_start, period_end, created_by, created_at
        FROM {S}.admin_strategy_reports ORDER BY created_at DESC LIMIT 30
    """)
    reports = [{"id": r[0], "report_type": r[1],
                "period_start": str(r[2]) if r[2] else None,
                "period_end": str(r[3]) if r[3] else None,
                "created_by": r[4], "created_at": str(r[5])} for r in rows]
    return resp({"reports": reports}, origin=origin)


def action_report_get(conn, report_id, origin):
    rows = _fetch_all(conn, f"""
        SELECT id, report_type, period_start, period_end,
               filters_json, metrics_json, insights_json, created_by, created_at
        FROM {S}.admin_strategy_reports WHERE id = {report_id} LIMIT 1
    """)
    if not rows:
        return resp({"error": "not_found"}, 404, origin)
    r = rows[0]
    return resp({"report": {
        "id": r[0], "report_type": r[1],
        "period_start": str(r[2]) if r[2] else None,
        "period_end": str(r[3]) if r[3] else None,
        "filters": r[4], "metrics": r[5], "insights": r[6],
        "created_by": r[7], "created_at": str(r[8]),
    }}, origin=origin)


# ── Roadmap stubs (W6.2 actions — добавлены в handler routing) ──────

def action_report_delete(conn, actor, body, origin):
    rid = body.get("id")
    if not rid: return resp({"error": "id required"}, 400, origin)
    with conn.cursor() as cur:
        cur.execute(f"DELETE FROM {S}.admin_strategy_reports WHERE id = %s", (int(rid),))
    conn.commit()
    return resp({"ok": True}, origin=origin)


def _roadmap_row(r) -> dict:
    return {"id": r[0], "title": r[1], "description": r[2], "lane": r[3], "status": r[4],
            "source_type": r[5], "source_report_id": r[6],
            "source_payload": r[7] if isinstance(r[7], dict) else {},
            "target_segment": r[8], "target_metric": r[9],
            "impact": r[10], "effort": r[11], "confidence": r[12],
            "owner": r[13], "sort_order": r[14],
            "created_by": r[15], "updated_by": r[16],
            "created_at": str(r[17]), "updated_at": str(r[18])}


def action_roadmap_list(conn, origin):
    rows = _fetch_all(conn, f"""
        SELECT id,title,description,lane,status,source_type,source_report_id,source_payload,
               target_segment,target_metric,impact,effort,confidence,owner,sort_order,
               created_by,updated_by,created_at,updated_at
        FROM {S}.admin_strategy_roadmap_items WHERE status!='archived'
        ORDER BY lane,sort_order,created_at DESC
    """)
    items = [_roadmap_row(r) for r in rows]
    grouped = {"now": [], "next": [], "later": []}
    for item in items:
        lane = item["lane"] if item["lane"] in grouped else "next"
        grouped[lane].append(item)
    return resp({"roadmap": grouped, "total": len(items)}, origin=origin)


def action_roadmap_create(conn, actor, body, origin):
    LANES_R = ["now","next","later"]; STATUSES_R = ["idea","planned","in_progress","done","archived"]
    title = (body.get("title") or "").strip()
    if not title: return resp({"error": "title required"}, 400, origin)
    lane   = body.get("lane","next"); lane = lane if lane in LANES_R else "next"
    status = body.get("status","idea"); status = status if status in STATUSES_R else "idea"
    ae = actor["email"]
    with conn.cursor() as cur:
        cur.execute(f"""
            INSERT INTO {S}.admin_strategy_roadmap_items
              (title,description,lane,status,source_type,source_report_id,source_payload,
               target_segment,target_metric,impact,effort,confidence,owner,sort_order,created_by,updated_by)
            VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id
        """, (title, body.get("description",""), lane, status,
              body.get("source_type","manual"), body.get("source_report_id"),
              json.dumps(body.get("source_payload") or {}, ensure_ascii=False),
              body.get("target_segment",""), body.get("target_metric",""),
              body.get("impact","medium"), body.get("effort","medium"),
              body.get("confidence","medium"), body.get("owner",""),
              int(body.get("sort_order",0)), ae, ae))
        new_id = cur.fetchone()[0]
    conn.commit()
    _audit(conn, actor, "strategy.roadmap_item_created", f"[{lane.upper()}] {title[:60]}")
    return resp({"ok": True, "id": new_id}, origin=origin)


def action_roadmap_update(conn, actor, body, origin):
    rid = body.get("id")
    if not rid: return resp({"error": "id required"}, 400, origin)
    LANES_R = ["now","next","later"]; STATUSES_R = ["idea","planned","in_progress","done","archived"]
    fields, vals = [], []
    for key in ["title","description","target_segment","target_metric","impact","effort","confidence","owner"]:
        if key in body: fields.append(f"{key}=%s"); vals.append(str(body[key]))
    if "lane" in body and body["lane"] in LANES_R:
        fields.append("lane=%s"); vals.append(body["lane"])
    if "status" in body and body["status"] in STATUSES_R:
        fields.append("status=%s"); vals.append(body["status"])
    if "sort_order" in body:
        fields.append("sort_order=%s"); vals.append(int(body["sort_order"]))
    if not fields: return resp({"ok": True}, origin=origin)
    fields += ["updated_at=NOW()","updated_by=%s"]; vals += [actor["email"], int(rid)]
    with conn.cursor() as cur:
        cur.execute(f"UPDATE {S}.admin_strategy_roadmap_items SET {','.join(fields)} WHERE id=%s", vals)
    conn.commit()
    _audit(conn, actor, "strategy.roadmap_item_updated", f"id={rid}")
    return resp({"ok": True}, origin=origin)


def action_roadmap_delete(conn, actor, body, origin):
    rid = body.get("id")
    if not rid: return resp({"error": "id required"}, 400, origin)
    with conn.cursor() as cur:
        cur.execute(f"UPDATE {S}.admin_strategy_roadmap_items SET status='archived',updated_at=NOW() WHERE id=%s", (int(rid),))
    conn.commit()
    _audit(conn, actor, "strategy.roadmap_item_deleted", f"id={rid}")
    return resp({"ok": True}, origin=origin)


def action_roadmap_from_insight(conn, actor, body, origin):
    source_type = body.get("source_type","hypothesis")
    payload     = body.get("insight_payload") or {}
    source_rid  = body.get("source_report_id")
    ae = actor["email"]
    # Smart mapping
    if source_type == "hypothesis":
        title = payload.get("title",""); desc = payload.get("hypothesis","") or payload.get("problem","")
        t_met = payload.get("target_metric",""); t_seg = payload.get("target_segment","")
        imp = payload.get("expected_impact","medium"); eff = payload.get("effort","medium")
    elif source_type == "next_action":
        title = str(payload.get("text", payload.get("title",""))); desc = ""
        t_met = ""; t_seg = ""; imp = "high"; eff = "low"
    elif source_type == "segment_plan":
        title = str(payload.get("action", payload.get("title",""))); desc = str(payload.get("expected_result",""))
        t_met = str(payload.get("metric_to_watch","")); t_seg = str(payload.get("segment",""))
        imp = "medium"; eff = "medium"
    else:
        title = str(payload.get("title", payload.get("claim",""))); desc = str(payload.get("claim",""))
        t_met = ""; t_seg = ""; imp = str(payload.get("impact","medium")); eff = "medium"
    title      = str(body.get("title", title)).strip() or "Без названия"
    lane       = body.get("lane","next")
    if lane not in ["now","next","later"]: lane = "next"
    t_met      = str(body.get("target_metric", t_met)).strip()
    t_seg      = str(body.get("target_segment", t_seg)).strip()
    imp        = body.get("impact", imp)
    eff        = body.get("effort", eff)
    with conn.cursor() as cur:
        cur.execute(f"""
            INSERT INTO {S}.admin_strategy_roadmap_items
              (title,description,lane,status,source_type,source_report_id,source_payload,
               target_segment,target_metric,impact,effort,confidence,owner,sort_order,created_by,updated_by)
            VALUES(%s,%s,%s,'idea',%s,%s,%s,%s,%s,%s,%s,'medium','',0,%s,%s) RETURNING id
        """, (title,str(desc),lane,source_type,source_rid,
              json.dumps(payload,ensure_ascii=False,default=str),
              t_seg,t_met,imp,eff,ae,ae))
        new_id = cur.fetchone()[0]
    conn.commit()
    _audit(conn, actor, "strategy.roadmap_item_created_from_insight", f"[{lane.upper()}] {title[:60]}")
    return resp({"ok": True, "id": new_id}, origin=origin)


# ── Scenarios ────────────────────────────────────────────────────────

SCENARIO_TYPES = {
    "activation_uplift":        "Activation Rate Uplift",
    "goal_to_checkin_uplift":   "Goal → First Check-in Uplift",
    "second_checkin_uplift":    "Second Check-in Uplift",
    "stalled_goals_reduction":  "Stalled Goals Reduction",
    "repeat_ticket_reduction":  "Repeat Ticket Rate Reduction",
}


def _confidence_level(sample: int) -> str:
    if sample >= 100: return "high"
    if sample >= 20:  return "medium"
    return "low"


def _compute_scenario(conn, stype: str, target_delta: float, d_from: str, d_to: str) -> dict:
    """
    Детерминированный расчёт сценария.
    target_delta — желаемое изменение в процентных пунктах (положительное = улучшение).
    Возвращает: baseline, projected, delta, downstream, sample_size.
    """
    s = S

    if stype == "activation_uplift":
        # Baseline: users → has_goal / users total
        total = (_fetch_one(conn,
            f"SELECT COUNT(*) FROM {s}.users WHERE created_at::date BETWEEN '{d_from}' AND '{d_to}'"
        ) or [0])[0] or 0
        activated = (_fetch_one(conn, f"""
            SELECT COUNT(DISTINCT g.user_id) FROM {s}.learning_goals g
            JOIN {s}.users u ON u.id=g.user_id
            WHERE u.created_at::date BETWEEN '{d_from}' AND '{d_to}'
        """) or [0])[0] or 0

        base_rate = round(activated / total * 100, 1) if total > 0 else 0
        proj_rate = min(100.0, base_rate + target_delta)
        delta_rate = proj_rate - base_rate

        # Downstream: projected activated → first_checkin (current conv)
        first_ci = (_fetch_one(conn, f"""
            SELECT COUNT(DISTINCT c.user_id) FROM {s}.learning_checkins c
            JOIN {s}.users u ON u.id=c.user_id
            WHERE u.created_at::date BETWEEN '{d_from}' AND '{d_to}'
        """) or [0])[0] or 0
        ci_conv = first_ci / activated if activated > 0 else 0

        proj_activated = round(total * proj_rate / 100)
        proj_ci = round(proj_activated * ci_conv)
        delta_ci = proj_ci - first_ci

        return {
            "sample_size": total,
            "confidence":  _confidence_level(total),
            "baseline": {
                "total_users":    total,
                "activated":      activated,
                "activation_rate": base_rate,
                "first_checkin":  first_ci,
            },
            "projected": {
                "activation_rate": proj_rate,
                "activated":       proj_activated,
                "first_checkin":   proj_ci,
            },
            "delta": {
                "activation_rate": round(delta_rate, 1),
                "activated":       proj_activated - activated,
                "first_checkin":   delta_ci,
            },
            "assumptions": [
                f"Activation rate улучшается на {target_delta} п.п.: {base_rate}% → {proj_rate}%",
                f"Downstream conversion first_checkin остаётся {round(ci_conv*100,1)}%",
                "Без изменений в downstream stages",
            ],
        }

    elif stype == "goal_to_checkin_uplift":
        # Baseline: goals → first checkin conv
        active_users = (_fetch_one(conn, f"""
            SELECT COUNT(DISTINCT g.user_id) FROM {s}.learning_goals g
            WHERE g.created_at::date BETWEEN '{d_from}' AND '{d_to}'
        """) or [0])[0] or 0
        with_checkin = (_fetch_one(conn, f"""
            SELECT COUNT(DISTINCT c.user_id) FROM {s}.learning_checkins c
            JOIN {s}.learning_goals g ON g.user_id=c.user_id
            WHERE g.created_at::date BETWEEN '{d_from}' AND '{d_to}'
        """) or [0])[0] or 0

        base_rate = round(with_checkin / active_users * 100, 1) if active_users > 0 else 0
        proj_rate = min(100.0, base_rate + target_delta)

        # Downstream: with_checkin → second_checkin (current conv)
        with_2nd = (_fetch_one(conn, f"""
            SELECT COUNT(DISTINCT user_id) FROM (
                SELECT user_id FROM {s}.learning_checkins GROUP BY user_id HAVING COUNT(*)>=2
            ) x
        """) or [0])[0] or 0
        ci2_conv = with_2nd / with_checkin if with_checkin > 0 else 0

        proj_checkin = round(active_users * proj_rate / 100)
        proj_2nd     = round(proj_checkin * ci2_conv)

        # Downstream: second_checkin → completion
        completed = (_fetch_one(conn,
            f"SELECT COUNT(DISTINCT user_id) FROM {s}.learning_goals WHERE status='done'"
        ) or [0])[0] or 0
        comp_conv = completed / with_2nd if with_2nd > 0 else 0
        proj_comp = round(proj_2nd * comp_conv)

        return {
            "sample_size": active_users,
            "confidence":  _confidence_level(active_users),
            "baseline": {
                "users_with_goal":   active_users,
                "with_first_checkin": with_checkin,
                "checkin_rate":       base_rate,
                "with_2nd_checkin":   with_2nd,
                "completed":          completed,
            },
            "projected": {
                "checkin_rate":       proj_rate,
                "with_first_checkin": proj_checkin,
                "with_2nd_checkin":   proj_2nd,
                "completed":          proj_comp,
            },
            "delta": {
                "checkin_rate":       round(proj_rate - base_rate, 1),
                "with_first_checkin": proj_checkin - with_checkin,
                "with_2nd_checkin":   proj_2nd - with_2nd,
                "completed":          proj_comp - completed,
            },
            "assumptions": [
                f"Goal→First Check-in rate: {base_rate}% → {proj_rate}%",
                f"Downstream 2nd check-in conv {round(ci2_conv*100,1)}% не изменяется",
                f"Completion conv {round(comp_conv*100,1)}% не изменяется",
            ],
        }

    elif stype == "second_checkin_uplift":
        with_1st = (_fetch_one(conn, f"""
            SELECT COUNT(DISTINCT user_id) FROM {s}.learning_checkins
        """) or [0])[0] or 0
        with_2nd = (_fetch_one(conn, f"""
            SELECT COUNT(DISTINCT user_id) FROM (
                SELECT user_id FROM {s}.learning_checkins GROUP BY user_id HAVING COUNT(*)>=2
            ) x
        """) or [0])[0] or 0
        base_rate = round(with_2nd / with_1st * 100, 1) if with_1st > 0 else 0
        proj_rate = min(100.0, base_rate + target_delta)

        completed = (_fetch_one(conn,
            f"SELECT COUNT(*) FROM {s}.learning_goals WHERE status='done'"
        ) or [0])[0] or 0
        comp_conv = completed / with_2nd if with_2nd > 0 else 0

        proj_2nd  = round(with_1st * proj_rate / 100)
        proj_comp = round(proj_2nd * comp_conv)

        return {
            "sample_size": with_1st,
            "confidence":  _confidence_level(with_1st),
            "baseline": {"with_1st_checkin": with_1st, "with_2nd_checkin": with_2nd, "rate_2nd": base_rate, "completed": completed},
            "projected": {"rate_2nd": proj_rate, "with_2nd_checkin": proj_2nd, "completed": proj_comp},
            "delta":     {"rate_2nd": round(proj_rate-base_rate,1), "with_2nd_checkin": proj_2nd-with_2nd, "completed": proj_comp-completed},
            "assumptions": [
                f"2nd check-in rate: {base_rate}% → {proj_rate}%",
                f"Completion conv {round(comp_conv*100,1)}% не изменяется",
            ],
        }

    elif stype == "stalled_goals_reduction":
        active_total = (_fetch_one(conn,
            f"SELECT COUNT(*) FROM {s}.learning_goals WHERE status='active'"
        ) or [0])[0] or 0
        stalled = (_fetch_one(conn, f"""
            SELECT COUNT(*) FROM {s}.learning_goals g WHERE g.status='active'
            AND NOT EXISTS (SELECT 1 FROM {s}.learning_checkins c WHERE c.goal_id=g.id AND c.created_at>=NOW()-INTERVAL '14 days')
        """) or [0])[0] or 0
        base_rate = round(stalled / active_total * 100, 1) if active_total > 0 else 0
        proj_rate = max(0.0, base_rate - target_delta)

        # If stalled goals get unblocked, estimate additional completion
        non_stalled_comp = (_fetch_one(conn, f"""
            SELECT COUNT(*) FROM {s}.learning_goals g WHERE g.status='done'
            AND EXISTS (SELECT 1 FROM {s}.learning_checkins c WHERE c.goal_id=g.id)
        """) or [0])[0] or 0
        non_stalled_total = active_total - stalled
        comp_rate_non_stalled = non_stalled_comp / non_stalled_total if non_stalled_total > 0 else 0

        delta_stalled = round(stalled - active_total * proj_rate / 100)
        est_additional_completions = round(delta_stalled * comp_rate_non_stalled)

        return {
            "sample_size": active_total,
            "confidence":  _confidence_level(active_total),
            "baseline": {"active_goals": active_total, "stalled": stalled, "stalled_rate": base_rate},
            "projected": {"stalled_rate": proj_rate, "stalled": round(active_total*proj_rate/100), "est_additional_completions": est_additional_completions},
            "delta":     {"stalled_rate": round(proj_rate-base_rate,1), "stalled": -delta_stalled, "est_additional_completions": est_additional_completions},
            "assumptions": [
                f"Stalled rate: {base_rate}% → {proj_rate}%",
                f"Разблокированные goals имеют completion rate non-stalled = {round(comp_rate_non_stalled*100,1)}%",
            ],
        }

    elif stype == "repeat_ticket_reduction":
        total_tickets = (_fetch_one(conn, f"""
            SELECT COUNT(*) FROM {s}.admin_tickets
            WHERE created_at::date BETWEEN '{d_from}' AND '{d_to}'
        """) or [0])[0] or 0
        unique_req = (_fetch_one(conn, f"""
            SELECT COUNT(DISTINCT requester_email) FROM {s}.admin_tickets
            WHERE created_at::date BETWEEN '{d_from}' AND '{d_to}'
        """) or [0])[0] or 0
        repeat = (_fetch_one(conn, f"""
            SELECT COUNT(*) FROM (
                SELECT requester_email FROM {s}.admin_tickets
                WHERE created_at::date BETWEEN '{d_from}' AND '{d_to}'
                GROUP BY requester_email HAVING COUNT(*)>=2
            ) x
        """) or [0])[0] or 0

        base_rate = round(repeat / unique_req * 100, 1) if unique_req > 0 else 0
        proj_rate = max(0.0, base_rate - target_delta)

        # Estimate projected total tickets
        avg_tickets_per_repeat = total_tickets / max(unique_req, 1)
        saved = round((base_rate - proj_rate) / 100 * unique_req * (avg_tickets_per_repeat - 1))
        proj_total = max(0, total_tickets - saved)

        return {
            "sample_size": unique_req,
            "confidence":  _confidence_level(unique_req),
            "baseline": {"total_tickets": total_tickets, "unique_requesters": unique_req, "repeat_requesters": repeat, "repeat_rate": base_rate},
            "projected": {"repeat_rate": proj_rate, "repeat_requesters": round(unique_req*proj_rate/100), "total_tickets": proj_total},
            "delta":     {"repeat_rate": round(proj_rate-base_rate,1), "repeat_requesters": -round((base_rate-proj_rate)/100*unique_req), "total_tickets": -(total_tickets-proj_total)},
            "assumptions": [
                f"Repeat ticket rate: {base_rate}% → {proj_rate}%",
                f"Avg tickets per requester остаётся {round(avg_tickets_per_repeat,1)}",
            ],
        }

    return {"error": f"unknown scenario type: {stype}", "sample_size": 0, "confidence": "low", "baseline": {}, "projected": {}, "delta": {}, "assumptions": []}


def action_scenario_run(conn, actor, qs, body, origin):
    """Запустить сценарий: считаем deterministic, затем AI commentary."""
    d_from, d_to, _, _ = parse_period(qs)
    stype        = body.get("scenario_type", "activation_uplift")
    target_delta = float(body.get("target_delta", 10))  # % points
    name         = (body.get("name") or "").strip() or f"{SCENARIO_TYPES.get(stype, stype)} +{target_delta}п.п."

    if stype not in SCENARIO_TYPES:
        return resp({"error": f"unknown scenario_type. Valid: {list(SCENARIO_TYPES)}"}, 400, origin)

    # Deterministic calculation
    result = _compute_scenario(conn, stype, target_delta, d_from, d_to)
    if "error" in result:
        return resp({"error": result["error"]}, 400, origin)

    # AI commentary (поверх уже посчитанных чисел)
    ai_commentary = {}
    try:
        stype_label = SCENARIO_TYPES.get(stype, stype)
        context = f"""
Тип сценария: {stype_label}
Период: {d_from} — {d_to}
Целевое улучшение: {target_delta} п.п.
Confidence: {result["confidence"]} (sample_size={result["sample_size"]})

Baseline метрики:
{json.dumps(result["baseline"], ensure_ascii=False, indent=2)}

Projected метрики:
{json.dumps(result["projected"], ensure_ascii=False, indent=2)}

Delta:
{json.dumps(result["delta"], ensure_ascii=False, indent=2)}

Assumptions:
{json.dumps(result.get("assumptions",[]), ensure_ascii=False)}
"""
        messages = [
            {"role": "system", "content": "Ты продуктовый аналитик. Интерпретируй результаты what-if сценария кратко и конкретно. JSON только. Русский язык."},
            {"role": "user", "content": f"""
Проанализируй результат сценария и дай структурированный комментарий.

{context}

{"ВАЖНО: sample_size мал, confidence=low — сценарий иллюстративный." if result["sample_size"] < 20 else ""}

Верни JSON:
{{
  "interpretation": "что означают эти изменения для продукта (2-3 предложения)",
  "key_impact": "главный ожидаемый эффект одной фразой",
  "required_initiatives": ["что нужно сделать чтобы достичь этого", "..."],
  "risks": ["риск 1", "риск 2"],
  "confidence_note": "пояснение уровня достоверности",
  "illustrative": {str(result["sample_size"] < 20).lower()}
}}
Только JSON.
"""}
        ]
        text = call_gpt(messages, max_tokens=1500, temperature=0.3)
        import re
        clean = re.sub(r'^```(?:json)?\s*', '', text.strip())
        clean = re.sub(r'\s*```$', '', clean).strip()
        m = re.search(r'\{[\s\S]*\}', clean)
        if m: clean = m.group(0)
        ai_commentary = json.loads(clean)
    except Exception as e:
        ai_commentary = {"error": str(e)}

    # Сохраняем сценарий
    with conn.cursor() as cur:
        cur.execute(f"""
            INSERT INTO {S}.admin_strategy_scenarios
              (name,scenario_type,period_start,period_end,filters_json,assumptions_json,
               baseline_metrics,projected_metrics,delta_metrics,ai_commentary,
               sample_size,confidence,created_by)
            VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            RETURNING id
        """, (name, stype, d_from, d_to, "{}",
              json.dumps(result.get("assumptions",[]), ensure_ascii=False),
              json.dumps(result["baseline"], ensure_ascii=False),
              json.dumps(result["projected"], ensure_ascii=False),
              json.dumps(result["delta"], ensure_ascii=False),
              json.dumps(ai_commentary, ensure_ascii=False, default=str),
              result["sample_size"], result["confidence"],
              actor["email"]))
        scenario_id = cur.fetchone()[0]
    conn.commit()
    _audit(conn, actor, "strategy.scenario_run", f"{stype} delta={target_delta} id={scenario_id}")

    return resp({
        "scenario_id":    scenario_id,
        "name":           name,
        "scenario_type":  stype,
        "period":         {"from": d_from, "to": d_to},
        "sample_size":    result["sample_size"],
        "confidence":     result["confidence"],
        "baseline":       result["baseline"],
        "projected":      result["projected"],
        "delta":          result["delta"],
        "assumptions":    result.get("assumptions", []),
        "ai_commentary":  ai_commentary,
    }, origin=origin)


def action_scenarios_list(conn, origin):
    rows = _fetch_all(conn, f"""
        SELECT id, name, scenario_type, period_start, period_end,
               sample_size, confidence, created_by, created_at
        FROM {S}.admin_strategy_scenarios ORDER BY created_at DESC LIMIT 30
    """)
    return resp({"scenarios": [{
        "id": r[0], "name": r[1], "scenario_type": r[2],
        "period_start": str(r[3]) if r[3] else None,
        "period_end":   str(r[4]) if r[4] else None,
        "sample_size":  r[5], "confidence": r[6],
        "created_by": r[7], "created_at": str(r[8]),
    } for r in rows]}, origin=origin)


def action_scenario_get(conn, sid, origin):
    rows = _fetch_all(conn, f"""
        SELECT id,name,scenario_type,period_start,period_end,assumptions_json,
               baseline_metrics,projected_metrics,delta_metrics,ai_commentary,
               sample_size,confidence,created_by,created_at
        FROM {S}.admin_strategy_scenarios WHERE id={sid} LIMIT 1
    """)
    if not rows: return resp({"error": "not_found"}, 404, origin)
    r = rows[0]
    return resp({"scenario": {
        "id": r[0], "name": r[1], "scenario_type": r[2],
        "period_start": str(r[3]) if r[3] else None,
        "period_end":   str(r[4]) if r[4] else None,
        "assumptions":  r[5], "baseline": r[6], "projected": r[7],
        "delta": r[8], "ai_commentary": r[9],
        "sample_size": r[10], "confidence": r[11],
        "created_by": r[12], "created_at": str(r[13]),
    }}, origin=origin)


def action_scenario_delete(conn, actor, body, origin):
    sid = body.get("id")
    if not sid: return resp({"error": "id required"}, 400, origin)
    with conn.cursor() as cur:
        cur.execute(f"DELETE FROM {S}.admin_strategy_scenarios WHERE id=%s", (int(sid),))
    conn.commit()
    return resp({"ok": True}, origin=origin)


# ── Handler ─────────────────────────────────────────────────────────

def handler(event: dict, context) -> dict:
    """W6.1-W6.3 Strategy Intelligence."""
    headers = event.get("headers") or {}
    origin  = headers.get("origin") or headers.get("Origin") or ""
    method  = event.get("httpMethod", "GET")

    if method == "OPTIONS":
        return resp({}, 200, origin)

    token = headers.get("X-Admin-Token") or headers.get("x-admin-token") or ""
    conn  = psycopg2.connect(DB)
    try:
        actor = get_actor(conn, token)
        if not actor:
            return resp({"error": "unauthorized"}, 401, origin)

        qs     = event.get("queryStringParameters") or {}
        action = qs.get("action", "")
        body   = {}
        if event.get("body"):
            try: body = json.loads(event["body"])
            except Exception: pass

        # Profile
        if action == "strategy_profile_get":
            return action_profile_get(conn, origin)
        if action == "strategy_profile_update":
            if method != "POST": return resp({"error": "POST required"}, 405, origin)
            return action_profile_update(conn, actor, body, origin)

        # Analytics
        if action == "strategy_overview":
            return action_overview(conn, qs, origin)
        if action == "strategy_product_health":
            return action_product_health(conn, qs, origin)
        if action == "strategy_trajectory":
            return action_trajectory(conn, qs, origin)
        if action == "strategy_segments":
            return action_segments(conn, qs, origin)
        if action == "strategy_learning":
            return action_learning(conn, qs, origin)
        if action == "strategy_support_pain_map":
            return action_support_pain_map(conn, qs, origin)

        # AI
        if action == "strategy_ai_summary":
            return action_ai_summary(conn, actor, qs, origin)
        if action == "strategy_ai_hypotheses":
            return action_ai_hypotheses(conn, actor, qs, origin)
        if action == "strategy_ai_segment_plan":
            if method != "POST": return resp({"error": "POST required"}, 405, origin)
            return action_ai_segment_plan(conn, actor, qs, body, origin)

        # Reports
        if action == "strategy_reports_list":
            return action_reports_list(conn, origin)
        if action == "strategy_report_get":
            rid = qs.get("id") or body.get("id")
            if not rid: return resp({"error": "id required"}, 400, origin)
            return action_report_get(conn, int(rid), origin)
        if action == "strategy_report_delete":
            if method != "POST": return resp({"error": "POST required"}, 405, origin)
            return action_report_delete(conn, actor, body, origin)

        # Roadmap
        if action == "strategy_roadmap_list":
            return action_roadmap_list(conn, origin)
        if action == "strategy_roadmap_create":
            if method != "POST": return resp({"error": "POST required"}, 405, origin)
            return action_roadmap_create(conn, actor, body, origin)
        if action == "strategy_roadmap_update":
            if method != "POST": return resp({"error": "POST required"}, 405, origin)
            return action_roadmap_update(conn, actor, body, origin)
        if action == "strategy_roadmap_delete":
            if method != "POST": return resp({"error": "POST required"}, 405, origin)
            return action_roadmap_delete(conn, actor, body, origin)
        if action == "strategy_roadmap_from_insight":
            if method != "POST": return resp({"error": "POST required"}, 405, origin)
            return action_roadmap_from_insight(conn, actor, body, origin)

        # Scenarios
        if action == "strategy_scenario_run":
            if method != "POST": return resp({"error": "POST required"}, 405, origin)
            return action_scenario_run(conn, actor, qs, body, origin)
        if action == "strategy_scenarios_list":
            return action_scenarios_list(conn, origin)
        if action == "strategy_scenario_get":
            sid = qs.get("id") or body.get("id")
            if not sid: return resp({"error": "id required"}, 400, origin)
            return action_scenario_get(conn, int(sid), origin)
        if action == "strategy_scenario_delete":
            if method != "POST": return resp({"error": "POST required"}, 405, origin)
            return action_scenario_delete(conn, actor, body, origin)

        return resp({"error": "unknown action"}, 400, origin)

    finally:
        conn.close()