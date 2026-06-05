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


# ── Handler ─────────────────────────────────────────────────────────

def handler(event: dict, context) -> dict:
    """W6.1 Strategy Intelligence: profile + analytics + AI + reports."""
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

        return resp({"error": "unknown action"}, 400, origin)

    finally:
        conn.close()