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


def authenticate(conn, headers):
    token = headers.get("x-admin-token") or headers.get("X-Admin-Token", "")
    if token:
        th = hashlib.sha256(token.encode()).hexdigest()
        with conn.cursor() as c:
            c.execute(
                f"SELECT actor_email FROM {SCHEMA}.admin_sessions "
                f"WHERE session_token_hash = %s AND expires_at > NOW() AND revoked_at IS NULL LIMIT 1",
                (th,),
            )
            r = c.fetchone()
        if r:
            return r[0]
    sid = headers.get("x-session-id") or headers.get("X-Session-Id", "")
    if not sid:
        return None
    with conn.cursor() as c:
        c.execute(
            f"SELECT u.email FROM {SCHEMA}.sessions s "
            f"JOIN {SCHEMA}.users u ON u.id = s.user_id "
            f"JOIN {SCHEMA}.exec_cabinet_access a ON LOWER(a.email) = LOWER(u.email) "
            f"WHERE s.id = %s AND s.expires_at > NOW() AND a.is_active = true LIMIT 1",
            (sid,),
        )
        r = c.fetchone()
    return r[0] if r else None


def snapshot(cur):
    cur.execute(f"""
        SELECT (SELECT count(*) FROM {SCHEMA}.exec_plan_assignee),
               (SELECT count(*) FROM {SCHEMA}.exec_plan_assignee WHERE raci_role = 'A'),
               (SELECT count(*) FROM {SCHEMA}.exec_plan_step WHERE is_control_point),
               (SELECT count(*) FROM {SCHEMA}.exec_person_capacity),
               (SELECT count(*) FROM {SCHEMA}.exec_plan_step)
    """)
    r = cur.fetchone()
    return {
        "assignees": r[0], "role_a": r[1], "control_points": r[2],
        "capacity_rows": r[3], "steps": r[4],
    }


def handler(event: dict, context) -> dict:
    """Тестовый откат этапа 1 внутри транзакции с обязательным ROLLBACK."""
    if event.get("httpMethod") == "OPTIONS":
        return cors({})

    conn = psycopg2.connect(DB)
    conn.autocommit = False
    try:
        actor = authenticate(conn, event.get("headers") or {})
        if not actor:
            return cors({"ok": False, "error": {"message": "Требуется вход"}}, 401)

        cur = conn.cursor()
        before = snapshot(cur)

        # Сценарий отката из ROLLBACK_stage1.sql
        cur.execute(f"""UPDATE {SCHEMA}.exec_plan_step s
            SET step_type = b.step_type, is_milestone = b.is_milestone
            FROM {SCHEMA}.bk20260823_exec_plan_step b WHERE s.id = b.id""")
        cur.execute(f"""UPDATE {SCHEMA}.exec_plan_assignee a
            SET raci_role = 'R', plan_hours = NULL, valid_from = NULL, valid_to = NULL
            FROM {SCHEMA}.bk20260823_exec_plan_assignee b WHERE a.id = b.id""")
        cur.execute(f"""DELETE FROM {SCHEMA}.exec_plan_assignee a WHERE NOT EXISTS
            (SELECT 1 FROM {SCHEMA}.bk20260823_exec_plan_assignee b WHERE b.id = a.id)""")
        cur.execute(f"UPDATE {SCHEMA}.exec_plan_step SET is_control_point = false")
        cur.execute(f"DELETE FROM {SCHEMA}.exec_person_capacity "
                    f"WHERE note LIKE 'Значение по умолчанию%%'")
        cur.execute(f"DELETE FROM {SCHEMA}.exec_function_raci "
                    f"WHERE note = 'Перенесено из карточки функции'")
        cur.execute(f"DELETE FROM {SCHEMA}.exec_plan_step_initiative WHERE is_primary")

        after = snapshot(cur)

        cur.execute(f"""SELECT count(*) FROM {SCHEMA}.bk20260823_exec_plan_assignee b
            JOIN {SCHEMA}.exec_plan_assignee a ON a.id = b.id
             AND a.step_id = b.step_id AND a.person_id = b.person_id
             AND COALESCE(a.workload_pct, -1) = COALESCE(b.workload_pct, -1)
             AND a.raci_role = 'R'""")
        match_assignee = cur.fetchone()[0]

        cur.execute(f"""SELECT count(*) FROM {SCHEMA}.bk20260823_exec_plan_step b
            JOIN {SCHEMA}.exec_plan_step s ON s.id = b.id
             AND s.title = b.title AND s.step_type = b.step_type
             AND s.is_milestone = b.is_milestone AND s.plan_id = b.plan_id""")
        match_step = cur.fetchone()[0]

        conn.rollback()

        cur2 = conn.cursor()
        restored = snapshot(cur2)

        return cors({"ok": True, "data": {
            "before": before,
            "after_rollback_script": after,
            "matched_backup_assignees": match_assignee,
            "matched_backup_steps": match_step,
            "after_transaction_rollback": restored,
            "state_restored": restored == before,
        }})
    except Exception as e:
        conn.rollback()
        return cors({"ok": False, "error": {"message": str(e)}}, 500)
    finally:
        conn.close()
