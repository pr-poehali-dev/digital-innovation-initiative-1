"""
Applied Workspace MVP — AI-native рабочее пространство поверх Моих проектов.

Actions:
  GET  context          — получить/инициализировать контекст пространства
  PUT  context          — обновить контекст
  GET  hypotheses       — список гипотез проекта
  POST create_hypothesis— создать гипотезу
  PUT  update_hypothesis— обновить гипотезу / статус
  GET  artifacts        — список артефактов
  GET  artifact         — конкретный артефакт
  GET  ai_runs          — история AI-сессий
  POST copilot          — AI-ассистент с workspace-контекстом
"""
import json
import os
import urllib.request
import psycopg2

DB     = os.environ["DATABASE_URL"]
SCHEMA = os.environ.get("MAIN_DB_SCHEMA", "t_p61016064_digital_innovation_i")
YANDEX_GPT_API_KEY = os.environ.get("YANDEX_GPT_API_KEY", "")
YANDEX_FOLDER_ID   = os.environ.get("YANDEX_FOLDER_ID", "")
SEARCH_URL = os.environ.get("SEARCH_FUNCTION_URL", "")


def cors(body: dict, code: int = 200) -> dict:
    return {
        "statusCode": code,
        "headers": {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, X-Session-Id",
            "Content-Type": "application/json",
        },
        "body": json.dumps(body, ensure_ascii=False, default=str),
    }


def get_user(conn, session_id: str):
    if not session_id:
        return None
    with conn.cursor() as cur:
        cur.execute(
            f"SELECT user_id FROM {SCHEMA}.sessions WHERE id = %s AND expires_at > NOW()",
            (session_id,),
        )
        row = cur.fetchone()
    return row[0] if row else None


def bump_content_version(conn, project_id: int):
    """Увеличивает content_version проекта — вызывается при любом изменении кейса."""
    with conn.cursor() as cur:
        cur.execute(
            f"UPDATE {SCHEMA}.projects SET content_version = content_version + 1, ai_status = 'idle' WHERE id = %s",
            (project_id,),
        )


def check_project_access(conn, project_id: int, user_id: int) -> bool:
    """Проверяем что пользователь является владельцем или участником проекта."""
    with conn.cursor() as cur:
        cur.execute(
            f"""SELECT 1 FROM {SCHEMA}.projects p
                LEFT JOIN {SCHEMA}.project_members m ON m.project_id = p.id AND m.user_id = %s
                WHERE p.id = %s AND (p.owner_id = %s OR m.user_id = %s) AND p.archived_at IS NULL""",
            (user_id, project_id, user_id, user_id),
        )
        return cur.fetchone() is not None


def yandex_gpt(prompt: str, system: str = "", max_tokens: int = 3000) -> str:
    """Вызов YandexGPT."""
    url = "https://llm.api.cloud.yandex.net/foundationModels/v1/completion"
    messages = []
    if system:
        messages.append({"role": "system", "text": system})
    messages.append({"role": "user", "text": prompt})
    payload = json.dumps({
        "modelUri": f"gpt://{YANDEX_FOLDER_ID}/yandexgpt/latest",
        "completionOptions": {"stream": False, "temperature": 0.4, "maxTokens": max_tokens},
        "messages": messages,
    }).encode()
    req = urllib.request.Request(url, data=payload, headers={
        "Authorization": f"Api-Key {YANDEX_GPT_API_KEY}",
        "Content-Type": "application/json",
    })
    with urllib.request.urlopen(req, timeout=28) as resp:
        data = json.loads(resp.read())
    return data["result"]["alternatives"][0]["message"]["text"]


def search_in_project(project_id: int, query: str, session_id: str, limit: int = 5) -> list:
    """Поиск по файлам проекта через search_knowledge. Graceful fallback на пустой список."""
    url = SEARCH_URL
    if not url:
        return []
    try:
        payload = json.dumps({"action": "search_knowledge", "project_id": project_id, "query": query}).encode()
        req = urllib.request.Request(url, data=payload, headers={
            "Content-Type": "application/json",
            "X-Session-Id": session_id,
        })
        with urllib.request.urlopen(req, timeout=8) as resp:
            raw = resp.read()
        outer = json.loads(raw)
        # Функция может вернуть body как строку (Cloud Functions envelope)
        body = outer.get("body") or outer
        if isinstance(body, str):
            try:
                body = json.loads(body)
            except Exception:
                return []
        # Несколько возможных ключей
        results = (
            body.get("results")
            or body.get("data", {}).get("results", [])
            or []
        )
        if not isinstance(results, list):
            return []
        return results[:limit]
    except Exception:
        return []


def build_context(conn, project_id: int, message: str, session_id: str) -> dict:
    """
    Собирает workspace-контекст для AI. Каждый источник — graceful fallback.
    Порядок: workspace_context → project description → search → artifacts → hypotheses.
    """
    wctx = {"goals_text": "", "constraints_text": "", "key_facts_text": "", "stakeholders_text": ""}
    project_title = ""
    project_desc  = ""
    search_results: list = []
    artifacts: list = []
    hypotheses: list = []

    try:
        with conn.cursor() as cur:
            cur.execute(
                f"SELECT goals_text, constraints_text, key_facts_text, stakeholders_text FROM {SCHEMA}.workspace_context WHERE project_id = %s",
                (project_id,),
            )
            row = cur.fetchone()
        if row:
            wctx = {"goals_text": row[0] or "", "constraints_text": row[1] or "", "key_facts_text": row[2] or "", "stakeholders_text": row[3] or ""}
    except Exception:
        pass

    try:
        with conn.cursor() as cur:
            cur.execute(f"SELECT title, description FROM {SCHEMA}.projects WHERE id = %s", (project_id,))
            proj = cur.fetchone()
        project_title = (proj[0] or "") if proj else ""
        project_desc  = (proj[1] or "") if proj else ""
    except Exception:
        pass

    # Поиск — внешний вызов, может не ответить
    search_results = search_in_project(project_id, message, session_id, limit=5)

    try:
        with conn.cursor() as cur:
            cur.execute(
                f"SELECT title, artifact_type, summary FROM {SCHEMA}.workspace_artifacts WHERE project_id = %s ORDER BY created_at DESC LIMIT 3",
                (project_id,),
            )
            artifacts = cur.fetchall() or []
    except Exception:
        pass

    try:
        with conn.cursor() as cur:
            cur.execute(
                f"SELECT title, statement FROM {SCHEMA}.workspace_hypotheses WHERE project_id = %s AND status IN ('open','testing') ORDER BY created_at DESC LIMIT 5",
                (project_id,),
            )
            hypotheses = cur.fetchall() or []
    except Exception:
        pass

    return {
        "project_title": project_title,
        "project_desc": project_desc,
        "wctx": wctx,
        "search_results": search_results,
        "artifacts": artifacts,
        "hypotheses": hypotheses,
    }


def build_context_prompt(ctx: dict, message: str, mode: str) -> str:
    """Формирует промпт с workspace-контекстом."""
    lines = []
    lines.append(f"ПРОЕКТ: «{ctx['project_title']}»")
    if ctx["project_desc"]:
        lines.append(f"Описание: {ctx['project_desc']}")

    wctx = ctx["wctx"]
    if wctx["goals_text"]:
        lines.append(f"\nЦЕЛИ ПРОСТРАНСТВА:\n{wctx['goals_text']}")
    if wctx["constraints_text"]:
        lines.append(f"\nОГРАНИЧЕНИЯ:\n{wctx['constraints_text']}")
    if wctx["key_facts_text"]:
        lines.append(f"\nКЛЮЧЕВЫЕ ФАКТЫ:\n{wctx['key_facts_text']}")
    if wctx["stakeholders_text"]:
        lines.append(f"\nСТЕЙКХОЛДЕРЫ:\n{wctx['stakeholders_text']}")

    if ctx["hypotheses"]:
        lines.append("\nАКТИВНЫЕ ГИПОТЕЗЫ:")
        for h in ctx["hypotheses"]:
            lines.append(f"  • {h[0]}: {h[1][:200]}")

    if ctx["artifacts"]:
        lines.append("\nПОСЛЕДНИЕ АРТЕФАКТЫ:")
        for a in ctx["artifacts"]:
            lines.append(f"  • [{a[1]}] {a[0]}: {a[2][:200]}")

    if ctx["search_results"]:
        lines.append("\nРЕЛЕВАНТНЫЕ ФРАГМЕНТЫ ИЗ ФАЙЛОВ ПРОЕКТА:")
        for r in ctx["search_results"][:5]:
            snippet = r.get("snippet") or r.get("text", "")[:300]
            doc = r.get("document_name") or r.get("filename", "")
            lines.append(f"  [{doc}] {snippet}")

    lines.append(f"\n---\nЗАПРОС ПОЛЬЗОВАТЕЛЯ: {message}")

    return "\n".join(lines)


SYSTEM_PROMPTS = {
    "analyst": (
        "Ты AI-аналитик в рабочем пространстве профессионала. "
        "Анализируй материалы, ищи противоречия, делай структурированные выводы, "
        "формируй summary и gap-analysis. Отвечай чётко, по делу, без воды. "
        "Если в контексте есть фрагменты документов — опирайся на них."
    ),
    "strategist": (
        "Ты AI-стратег. Помогаешь формировать гипотезы, строить roadmap, "
        "приоритизировать инициативы, оценивать риски и предлагать следующие шаги. "
        "Опирайся на контекст пространства и активные гипотезы."
    ),
    "pm": (
        "Ты AI product manager / операционный помощник. "
        "Декомпозируй задачи, расставляй приоритеты, предлагай план работ, "
        "формулируй acceptance criteria, выявляй зависимости."
    ),
    "researcher": (
        "Ты AI-исследователь. Систематизируй информацию, делай сравнения, "
        "формируй обзоры, находи паттерны в материалах, предлагай дополнительные источники."
    ),
}


def handler(event: dict, context) -> dict:
    """Applied Workspace MVP — AI-native рабочее пространство."""
    if event.get("httpMethod") == "OPTIONS":
        return cors({})

    headers    = event.get("headers") or {}
    session_id = headers.get("x-session-id") or headers.get("X-Session-Id", "")
    method     = event.get("httpMethod", "GET")
    qs         = event.get("queryStringParameters") or {}
    action     = qs.get("action", "")
    body       = {}
    if event.get("body"):
        body = json.loads(event["body"])

    conn = psycopg2.connect(DB)
    try:
        user_id = get_user(conn, session_id)
        if not user_id:
            return cors({"ok": False, "error": {"message": "Не авторизован"}}, 401)

        # ── Контекст пространства ──────────────────────────────────────
        if action == "context":
            project_id = int(qs.get("project_id") or body.get("project_id") or 0)
            if not project_id:
                return cors({"ok": False, "error": {"message": "Нужен project_id"}}, 400)
            if not check_project_access(conn, project_id, user_id):
                return cors({"ok": False, "error": {"message": "Нет доступа"}}, 403)

            if method == "GET":
                with conn.cursor() as cur:
                    cur.execute(
                        f"SELECT goals_text, constraints_text, key_facts_text, stakeholders_text, updated_at FROM {SCHEMA}.workspace_context WHERE project_id = %s",
                        (project_id,),
                    )
                    row = cur.fetchone()
                if row:
                    return cors({"ok": True, "context": {
                        "goals_text": row[0], "constraints_text": row[1],
                        "key_facts_text": row[2], "stakeholders_text": row[3],
                        "updated_at": str(row[4]),
                    }})
                return cors({"ok": True, "context": None})

            if method == "PUT":
                goals        = (body.get("goals_text") or "").strip()
                constraints  = (body.get("constraints_text") or "").strip()
                key_facts    = (body.get("key_facts_text") or "").strip()
                stakeholders = (body.get("stakeholders_text") or "").strip()
                with conn.cursor() as cur:
                    cur.execute(
                        f"""INSERT INTO {SCHEMA}.workspace_context
                            (project_id, goals_text, constraints_text, key_facts_text, stakeholders_text, updated_by)
                            VALUES (%s, %s, %s, %s, %s, %s)
                            ON CONFLICT (project_id) DO UPDATE SET
                              goals_text = EXCLUDED.goals_text,
                              constraints_text = EXCLUDED.constraints_text,
                              key_facts_text = EXCLUDED.key_facts_text,
                              stakeholders_text = EXCLUDED.stakeholders_text,
                              updated_by = EXCLUDED.updated_by,
                              updated_at = NOW()""",
                        (project_id, goals, constraints, key_facts, stakeholders, user_id),
                    )
                bump_content_version(conn, project_id)
                conn.commit()
                return cors({"ok": True})

        # ── Гипотезы ──────────────────────────────────────────────────
        if action == "hypotheses":
            project_id = int(qs.get("project_id") or body.get("project_id") or 0)
            if not project_id:
                return cors({"ok": False, "error": {"message": "Нужен project_id"}}, 400)
            if not check_project_access(conn, project_id, user_id):
                return cors({"ok": False, "error": {"message": "Нет доступа"}}, 403)

            with conn.cursor() as cur:
                cur.execute(
                    f"""SELECT id, title, statement, assumptions, success_criteria,
                               status, conclusion, priority, created_at, updated_at
                        FROM {SCHEMA}.workspace_hypotheses
                        WHERE project_id = %s
                        ORDER BY CASE status WHEN 'open' THEN 0 WHEN 'testing' THEN 1 ELSE 2 END, created_at DESC""",
                    (project_id,),
                )
                rows = cur.fetchall()
            return cors({"ok": True, "hypotheses": [
                {"id": r[0], "title": r[1], "statement": r[2], "assumptions": r[3],
                 "success_criteria": r[4], "status": r[5], "conclusion": r[6],
                 "priority": r[7], "created_at": str(r[8]), "updated_at": str(r[9])}
                for r in rows
            ]})

        if method == "POST" and action == "create_hypothesis":
            project_id = int(body.get("project_id") or 0)
            title      = (body.get("title") or "").strip()
            if not project_id or not title:
                return cors({"ok": False, "error": {"message": "Нужны project_id и title"}}, 400)
            if not check_project_access(conn, project_id, user_id):
                return cors({"ok": False, "error": {"message": "Нет доступа"}}, 403)
            with conn.cursor() as cur:
                cur.execute(
                    f"""INSERT INTO {SCHEMA}.workspace_hypotheses
                        (project_id, title, statement, assumptions, success_criteria, priority, created_by)
                        VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id, created_at""",
                    (project_id, title,
                     body.get("statement", ""), body.get("assumptions", ""),
                     body.get("success_criteria", ""), body.get("priority", "medium"), user_id),
                )
                h_id, created_at = cur.fetchone()
            bump_content_version(conn, project_id)
            conn.commit()
            return cors({"ok": True, "hypothesis": {"id": h_id, "title": title, "created_at": str(created_at)}})

        if method == "PUT" and action == "update_hypothesis":
            h_id = int(body.get("id") or 0)
            if not h_id:
                return cors({"ok": False, "error": {"message": "Нужен id"}}, 400)
            # Проверяем доступ через project_id гипотезы
            with conn.cursor() as cur:
                cur.execute(f"SELECT project_id FROM {SCHEMA}.workspace_hypotheses WHERE id = %s", (h_id,))
                row = cur.fetchone()
            if not row or not check_project_access(conn, row[0], user_id):
                return cors({"ok": False, "error": {"message": "Нет доступа"}}, 403)
            fields = ["updated_at = NOW()"]
            vals   = []
            for f in ("title", "statement", "assumptions", "success_criteria", "status", "conclusion", "priority"):
                if f in body:
                    fields.append(f"{f} = %s")
                    vals.append(body[f])
            vals.append(h_id)
            with conn.cursor() as cur:
                cur.execute(f"UPDATE {SCHEMA}.workspace_hypotheses SET {', '.join(fields)} WHERE id = %s", vals)
            bump_content_version(conn, row[0])
            conn.commit()
            return cors({"ok": True})

        # ── Артефакты ─────────────────────────────────────────────────
        if action == "artifacts":
            project_id = int(qs.get("project_id") or body.get("project_id") or 0)
            if not project_id:
                return cors({"ok": False, "error": {"message": "Нужен project_id"}}, 400)
            if not check_project_access(conn, project_id, user_id):
                return cors({"ok": False, "error": {"message": "Нет доступа"}}, 403)
            with conn.cursor() as cur:
                cur.execute(
                    f"""SELECT id, title, artifact_type, summary, mode, created_at
                        FROM {SCHEMA}.workspace_artifacts
                        WHERE project_id = %s ORDER BY created_at DESC LIMIT 50""",
                    (project_id,),
                )
                rows = cur.fetchall()
            return cors({"ok": True, "artifacts": [
                {"id": r[0], "title": r[1], "artifact_type": r[2],
                 "summary": r[3], "mode": r[4], "created_at": str(r[5])}
                for r in rows
            ]})

        if action == "artifact":
            artifact_id = int(qs.get("id") or 0)
            if not artifact_id:
                return cors({"ok": False, "error": {"message": "Нужен id"}}, 400)
            with conn.cursor() as cur:
                cur.execute(
                    f"SELECT id, project_id, title, artifact_type, content, summary, mode, created_at FROM {SCHEMA}.workspace_artifacts WHERE id = %s",
                    (artifact_id,),
                )
                row = cur.fetchone()
            if not row:
                return cors({"ok": False, "error": {"message": "Не найден"}}, 404)
            if not check_project_access(conn, row[1], user_id):
                return cors({"ok": False, "error": {"message": "Нет доступа"}}, 403)
            return cors({"ok": True, "artifact": {
                "id": row[0], "project_id": row[1], "title": row[2],
                "artifact_type": row[3], "content": row[4], "summary": row[5],
                "mode": row[6], "created_at": str(row[7]),
            }})

        # ── История AI-сессий ─────────────────────────────────────────
        if action == "ai_runs":
            project_id = int(qs.get("project_id") or 0)
            if not project_id:
                return cors({"ok": False, "error": {"message": "Нужен project_id"}}, 400)
            if not check_project_access(conn, project_id, user_id):
                return cors({"ok": False, "error": {"message": "Нет доступа"}}, 403)
            with conn.cursor() as cur:
                cur.execute(
                    f"""SELECT r.id, r.message, r.mode, r.answer, r.artifact_id,
                               a.title as artifact_title, r.created_at
                        FROM {SCHEMA}.workspace_ai_runs r
                        LEFT JOIN {SCHEMA}.workspace_artifacts a ON a.id = r.artifact_id
                        WHERE r.project_id = %s ORDER BY r.created_at DESC LIMIT 30""",
                    (project_id,),
                )
                rows = cur.fetchall()
            return cors({"ok": True, "runs": [
                {"id": r[0], "message": r[1], "mode": r[2],
                 "answer": r[3][:500], "artifact_id": r[4],
                 "artifact_title": r[5], "created_at": str(r[6])}
                for r in rows
            ]})

        # ── AI Copilot ────────────────────────────────────────────────
        if method == "POST" and action == "copilot":
            project_id    = int(body.get("project_id") or 0)
            message       = (body.get("message") or "").strip()
            mode          = body.get("mode", "analyst")
            save_artifact = body.get("save_as_artifact", False)
            artifact_title = (body.get("artifact_title") or "").strip()
            artifact_type  = body.get("artifact_type", "analysis")

            if not project_id or not message:
                return cors({"ok": False, "error": {"message": "Нужны project_id и message"}}, 400)
            if not check_project_access(conn, project_id, user_id):
                return cors({"ok": False, "error": {"message": "Нет доступа"}}, 403)

            # Собираем контекст
            ctx = build_context(conn, project_id, message, session_id)
            context_prompt = build_context_prompt(ctx, message, mode)
            context_summary = f"project={ctx['project_title']}, search={len(ctx['search_results'])} фрагментов, artifacts={len(ctx['artifacts'])}, hypotheses={len(ctx['hypotheses'])}"

            system = SYSTEM_PROMPTS.get(mode, SYSTEM_PROMPTS["analyst"])
            answer = yandex_gpt(context_prompt, system, max_tokens=2500)

            # Сохраняем AI run
            with conn.cursor() as cur:
                cur.execute(
                    f"""INSERT INTO {SCHEMA}.workspace_ai_runs
                        (project_id, message, mode, answer, context_summary, sources_used, created_by)
                        VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id""",
                    (project_id, message, mode, answer, context_summary,
                     json.dumps([r.get("document_name", "") for r in ctx["search_results"]], ensure_ascii=False),
                     user_id),
                )
                run_id = cur.fetchone()[0]

            artifact_id = None
            if save_artifact and answer:
                title = artifact_title or f"{mode.capitalize()}: {message[:60]}"
                summary = answer[:300]
                with conn.cursor() as cur:
                    cur.execute(
                        f"""INSERT INTO {SCHEMA}.workspace_artifacts
                            (project_id, title, artifact_type, content, summary, mode, ai_run_id, created_by)
                            VALUES (%s, %s, %s, %s, %s, %s, %s, %s) RETURNING id""",
                        (project_id, title, artifact_type, answer, summary, mode, run_id, user_id),
                    )
                    artifact_id = cur.fetchone()[0]
                # Обновляем run с artifact_id
                with conn.cursor() as cur:
                    cur.execute(
                        f"UPDATE {SCHEMA}.workspace_ai_runs SET artifact_id = %s WHERE id = %s",
                        (artifact_id, run_id),
                    )

            conn.commit()
            return cors({
                "ok": True,
                "answer": answer,
                "run_id": run_id,
                "artifact_id": artifact_id,
                "sources_used": [r.get("document_name", "") for r in ctx["search_results"]],
                "context_summary": context_summary,
            })

        # ── Шаги процесса ─────────────────────────────────────────────
        if action == "process_steps":
            project_id = int(qs.get("project_id") or body.get("project_id") or 0)
            if not project_id or not check_project_access(conn, project_id, user_id):
                return cors({"ok": False, "error": {"message": "Нет доступа"}}, 403)

            if method == "GET":
                with conn.cursor() as cur:
                    cur.execute(
                        f"""SELECT id, step_order, title, role_name, description, system_name,
                                   is_manual, pain_point, control_point, automation_potential, ai_potential, duration_minutes
                            FROM {SCHEMA}.wb_process_steps
                            WHERE process_id IN (
                                SELECT id FROM {SCHEMA}.wb_processes WHERE user_id = %s AND is_archived = FALSE
                            ) AND is_archived = FALSE
                            ORDER BY step_order""",
                        (user_id,),
                    )
                    rows = cur.fetchall()
                return cors({"ok": True, "steps": [
                    {"id": r[0], "step_order": r[1], "title": r[2], "role_name": r[3],
                     "description": r[4], "system_name": r[5], "is_manual": r[6],
                     "pain_point": r[7], "control_point": r[8],
                     "automation_potential": r[9], "ai_potential": r[10], "duration_minutes": r[11]}
                    for r in rows
                ]})

            if method == "POST":
                proc_id = int(body.get("process_id") or 0)
                title   = (body.get("title") or "").strip()
                if not proc_id or not title:
                    return cors({"ok": False, "error": {"message": "Нужны process_id и title"}}, 400)
                with conn.cursor() as cur:
                    cur.execute(
                        f"SELECT COUNT(*) FROM {SCHEMA}.wb_process_steps WHERE process_id = %s AND is_archived = FALSE",
                        (proc_id,)
                    )
                    order = cur.fetchone()[0]
                    cur.execute(
                        f"""INSERT INTO {SCHEMA}.wb_process_steps
                            (process_id, step_order, title, role_name, description, system_name,
                             is_manual, pain_point, control_point, automation_potential, ai_potential, duration_minutes)
                            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id""",
                        (proc_id, order, title,
                         body.get("role_name", ""), body.get("description", ""),
                         body.get("system_name", ""), body.get("is_manual", True),
                         body.get("pain_point", ""), body.get("control_point", ""),
                         body.get("automation_potential", "none"),
                         body.get("ai_potential", "none"),
                         body.get("duration_minutes")),
                    )
                    step_id = cur.fetchone()[0]
                bump_content_version(conn, project_id)
                conn.commit()
                return cors({"ok": True, "id": step_id})

            if method == "PUT":
                step_id = int(body.get("id") or 0)
                if not step_id:
                    return cors({"ok": False, "error": {"message": "Нужен id"}}, 400)
                fields = ["updated_at = NOW()"]
                vals   = []
                for f in ("title", "role_name", "description", "system_name", "is_manual",
                          "pain_point", "control_point", "automation_potential", "ai_potential",
                          "duration_minutes", "step_order"):
                    if f in body:
                        fields.append(f"{f} = %s")
                        vals.append(body[f])
                vals.append(step_id)
                with conn.cursor() as cur:
                    cur.execute(f"UPDATE {SCHEMA}.wb_process_steps SET {', '.join(fields)} WHERE id = %s", vals)
                bump_content_version(conn, project_id)
                conn.commit()
                return cors({"ok": True})

        # ── Процессы ──────────────────────────────────────────────────
        if action == "processes":
            project_id = int(qs.get("project_id") or body.get("project_id") or 0)
            if not project_id or not check_project_access(conn, project_id, user_id):
                return cors({"ok": False, "error": {"message": "Нет доступа"}}, 403)

            if method == "GET":
                with conn.cursor() as cur:
                    cur.execute(
                        f"""SELECT p.id, p.title, p.description, p.owner_name, p.department,
                                   p.maturity_level, p.digital_maturity, p.ai_potential,
                                   COUNT(s.id) as step_count
                            FROM {SCHEMA}.wb_processes p
                            JOIN {SCHEMA}.wb_case_process_links lnk ON lnk.process_id = p.id AND lnk.case_id = %s
                            LEFT JOIN {SCHEMA}.wb_process_steps s ON s.process_id = p.id AND s.is_archived = FALSE
                            WHERE p.is_archived = FALSE
                            GROUP BY p.id ORDER BY p.created_at DESC""",
                        (project_id,),
                    )
                    rows = cur.fetchall()

                processes = []
                for r in rows:
                    with conn.cursor() as cur:
                        cur.execute(
                            f"""SELECT id, step_order, title, role_name, system_name, is_manual,
                                       pain_point, automation_potential, ai_potential, duration_minutes, description, control_point
                                FROM {SCHEMA}.wb_process_steps
                                WHERE process_id = %s AND is_archived = FALSE
                                ORDER BY step_order""",
                            (r[0],),
                        )
                        steps = [{"id": s[0], "step_order": s[1], "title": s[2], "role_name": s[3],
                                  "system_name": s[4], "is_manual": s[5], "pain_point": s[6],
                                  "automation_potential": s[7], "ai_potential": s[8],
                                  "duration_minutes": s[9], "description": s[10], "control_point": s[11]}
                                 for s in cur.fetchall()]
                    processes.append({
                        "id": r[0], "title": r[1], "description": r[2],
                        "owner_name": r[3], "department": r[4],
                        "maturity_level": r[5], "digital_maturity": r[6],
                        "ai_potential": r[7], "step_count": r[8], "steps": steps,
                    })
                return cors({"ok": True, "processes": processes})

            if method == "POST":
                title = (body.get("title") or "").strip()
                if not title:
                    return cors({"ok": False, "error": {"message": "Нужен title"}}, 400)
                with conn.cursor() as cur:
                    cur.execute(
                        f"""INSERT INTO {SCHEMA}.wb_processes
                            (user_id, title, description, owner_name, department, objective,
                             input_desc, output_desc, systems, maturity_level, digital_maturity, ai_potential)
                            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id""",
                        (user_id, title,
                         body.get("description", ""), body.get("owner_name", ""),
                         body.get("department", ""), body.get("objective", ""),
                         body.get("input_desc", ""), body.get("output_desc", ""),
                         body.get("systems", ""),
                         body.get("maturity_level", "initial"),
                         body.get("digital_maturity", "paper"),
                         body.get("ai_potential", "unknown")),
                    )
                    proc_id = cur.fetchone()[0]
                    # Добавляем линк к проекту
                    cur.execute(
                        f"""INSERT INTO {SCHEMA}.wb_case_process_links (case_id, process_id)
                            VALUES (%s, %s) ON CONFLICT DO NOTHING""",
                        (project_id, proc_id),
                    )
                bump_content_version(conn, project_id)
                conn.commit()
                return cors({"ok": True, "id": proc_id})

            if method == "PUT":
                proc_id = int(body.get("id") or 0)
                if not proc_id:
                    return cors({"ok": False, "error": {"message": "Нужен id"}}, 400)
                fields = ["updated_at = NOW()"]
                vals   = []
                for f in ("title", "description", "owner_name", "department", "objective",
                          "input_desc", "output_desc", "systems", "maturity_level",
                          "digital_maturity", "ai_potential"):
                    if f in body:
                        fields.append(f"{f} = %s")
                        vals.append(body[f])
                vals.append(proc_id)
                with conn.cursor() as cur:
                    cur.execute(f"UPDATE {SCHEMA}.wb_processes SET {', '.join(fields)} WHERE id = %s", vals)
                bump_content_version(conn, project_id)
                conn.commit()
                return cors({"ok": True})

        # ── Боли / узкие места ────────────────────────────────────────
        if action == "pain_points":
            project_id = int(qs.get("project_id") or body.get("project_id") or 0)
            if not project_id or not check_project_access(conn, project_id, user_id):
                return cors({"ok": False, "error": {"message": "Нет доступа"}}, 403)

            if method == "GET":
                with conn.cursor() as cur:
                    cur.execute(
                        f"""SELECT id, pain_type, description, impact_level, frequency, root_cause
                            FROM {SCHEMA}.wb_pain_points
                            WHERE case_id = %s AND is_archived = FALSE
                            ORDER BY CASE impact_level WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
                                     created_at DESC""",
                        (project_id,),
                    )
                    rows = cur.fetchall()
                return cors({"ok": True, "pain_points": [
                    {"id": r[0], "pain_type": r[1], "description": r[2],
                     "impact_level": r[3], "frequency": r[4], "root_cause": r[5]}
                    for r in rows
                ]})

            if method == "POST":
                desc = (body.get("description") or "").strip()
                if not desc:
                    return cors({"ok": False, "error": {"message": "Нужно description"}}, 400)
                with conn.cursor() as cur:
                    cur.execute(
                        f"""INSERT INTO {SCHEMA}.wb_pain_points
                            (case_id, pain_type, description, impact_level, frequency, root_cause)
                            VALUES (%s, %s, %s, %s, %s, %s) RETURNING id""",
                        (project_id, body.get("pain_type", "manual_work"), desc,
                         body.get("impact_level", "medium"),
                         body.get("frequency", ""), body.get("root_cause", "")),
                    )
                    pp_id = cur.fetchone()[0]
                bump_content_version(conn, project_id)
                conn.commit()
                return cors({"ok": True, "id": pp_id})

            if method == "PUT":
                pp_id = int(body.get("id") or 0)
                if not pp_id:
                    return cors({"ok": False, "error": {"message": "Нужен id"}}, 400)
                fields = ["updated_at = NOW()"]
                vals   = []
                for f in ("pain_type", "description", "impact_level", "frequency", "root_cause"):
                    if f in body:
                        fields.append(f"{f} = %s")
                        vals.append(body[f])
                if body.get("archive"):
                    fields.append("is_archived = TRUE")
                vals.append(pp_id)
                with conn.cursor() as cur:
                    cur.execute(f"UPDATE {SCHEMA}.wb_pain_points SET {', '.join(fields)} WHERE id = %s", vals)
                bump_content_version(conn, project_id)
                conn.commit()
                return cors({"ok": True})

        # ── Бенчмарки ─────────────────────────────────────────────────
        if action == "benchmarks":
            project_id = int(qs.get("project_id") or body.get("project_id") or 0)
            if not project_id or not check_project_access(conn, project_id, user_id):
                return cors({"ok": False, "error": {"message": "Нет доступа"}}, 403)

            if method == "GET":
                with conn.cursor() as cur:
                    cur.execute(
                        f"""SELECT b.id, b.title, b.source_name, b.source_url, b.industry,
                                   b.organization_name, b.benchmark_type, b.summary,
                                   b.observed_effect, b.applicability, b.confidence_level,
                                   b.notes, cb.relevance_note
                            FROM {SCHEMA}.wb_benchmarks b
                            JOIN {SCHEMA}.wb_case_benchmarks cb ON cb.benchmark_id = b.id
                            WHERE cb.case_id = %s AND b.is_archived = FALSE
                            ORDER BY b.created_at DESC""",
                        (project_id,),
                    )
                    rows = cur.fetchall()
                return cors({"ok": True, "benchmarks": [
                    {"id": r[0], "title": r[1], "source_name": r[2], "source_url": r[3],
                     "industry": r[4], "organization_name": r[5], "benchmark_type": r[6],
                     "summary": r[7], "observed_effect": r[8], "applicability": r[9],
                     "confidence_level": r[10], "notes": r[11], "relevance_note": r[12]}
                    for r in rows
                ]})

            if method == "POST":
                title = (body.get("title") or "").strip()
                if not title:
                    return cors({"ok": False, "error": {"message": "Нужен title"}}, 400)
                with conn.cursor() as cur:
                    cur.execute(
                        f"""INSERT INTO {SCHEMA}.wb_benchmarks
                            (user_id, title, source_name, source_url, industry, organization_name,
                             benchmark_type, summary, what_was_done, observed_effect,
                             applicability, confidence_level, limitations, notes)
                            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id""",
                        (user_id, title,
                         body.get("source_name", ""), body.get("source_url", ""),
                         body.get("industry", ""), body.get("organization_name", ""),
                         body.get("benchmark_type", "digitalization"),
                         body.get("summary", ""), body.get("what_was_done", ""),
                         body.get("observed_effect", ""), body.get("applicability", ""),
                         body.get("confidence_level", "medium"),
                         body.get("limitations", ""), body.get("notes", "")),
                    )
                    bm_id = cur.fetchone()[0]
                    cur.execute(
                        f"""INSERT INTO {SCHEMA}.wb_case_benchmarks (case_id, benchmark_id, relevance_note)
                            VALUES (%s, %s, %s) ON CONFLICT (case_id, benchmark_id) DO NOTHING""",
                        (project_id, bm_id, body.get("relevance_note", "")),
                    )
                bump_content_version(conn, project_id)
                conn.commit()
                return cors({"ok": True, "id": bm_id})

            if method == "PUT":
                bm_id = int(body.get("id") or 0)
                if not bm_id:
                    return cors({"ok": False, "error": {"message": "Нужен id"}}, 400)
                fields = ["updated_at = NOW()"]
                vals   = []
                for f in ("title", "source_name", "source_url", "industry", "organization_name",
                          "benchmark_type", "summary", "what_was_done", "observed_effect",
                          "applicability", "confidence_level", "notes"):
                    if f in body:
                        fields.append(f"{f} = %s")
                        vals.append(body[f])
                vals.append(bm_id)
                with conn.cursor() as cur:
                    cur.execute(f"UPDATE {SCHEMA}.wb_benchmarks SET {', '.join(fields)} WHERE id = %s", vals)
                bump_content_version(conn, project_id)
                conn.commit()
                return cors({"ok": True})

        # ── AI Opportunities ──────────────────────────────────────────
        if action == "ai_opportunities":
            project_id = int(qs.get("project_id") or body.get("project_id") or 0)
            if not project_id or not check_project_access(conn, project_id, user_id):
                return cors({"ok": False, "error": {"message": "Нет доступа"}}, 403)

            if method == "GET":
                with conn.cursor() as cur:
                    cur.execute(
                        f"""SELECT id, title, current_manual_operation, data_type,
                                   proposed_solution_type, use_case_type, expected_effect,
                                   risks, security_notes, human_in_loop, recommendation
                            FROM {SCHEMA}.wb_ai_opportunities
                            WHERE case_id = %s AND is_archived = FALSE
                            ORDER BY created_at DESC""",
                        (project_id,),
                    )
                    rows = cur.fetchall()
                return cors({"ok": True, "opportunities": [
                    {"id": r[0], "title": r[1], "current_manual_operation": r[2],
                     "data_type": r[3], "proposed_solution_type": r[4], "use_case_type": r[5],
                     "expected_effect": r[6], "risks": r[7], "security_notes": r[8],
                     "human_in_loop": r[9], "recommendation": r[10]}
                    for r in rows
                ]})

            if method == "POST":
                title = (body.get("title") or "").strip()
                if not title:
                    return cors({"ok": False, "error": {"message": "Нужен title"}}, 400)
                with conn.cursor() as cur:
                    cur.execute(
                        f"""INSERT INTO {SCHEMA}.wb_ai_opportunities
                            (case_id, user_id, title, current_manual_operation, data_type,
                             proposed_solution_type, use_case_type, expected_effect,
                             required_data, quality_requirements, risks, security_notes,
                             human_in_loop, recommendation)
                            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id""",
                        (project_id, user_id, title,
                         body.get("current_manual_operation", ""),
                         body.get("data_type", "mixed"),
                         body.get("proposed_solution_type", "none"),
                         body.get("use_case_type", ""),
                         body.get("expected_effect", ""),
                         body.get("required_data", ""),
                         body.get("quality_requirements", ""),
                         body.get("risks", ""),
                         body.get("security_notes", ""),
                         body.get("human_in_loop", True),
                         body.get("recommendation", "assess")),
                    )
                    opp_id = cur.fetchone()[0]
                bump_content_version(conn, project_id)
                conn.commit()
                return cors({"ok": True, "id": opp_id})

            if method == "PUT":
                opp_id = int(body.get("id") or 0)
                if not opp_id:
                    return cors({"ok": False, "error": {"message": "Нужен id"}}, 400)
                fields = ["updated_at = NOW()"]
                vals   = []
                for f in ("title", "current_manual_operation", "data_type", "proposed_solution_type",
                          "use_case_type", "expected_effect", "required_data", "quality_requirements",
                          "risks", "security_notes", "human_in_loop", "recommendation"):
                    if f in body:
                        fields.append(f"{f} = %s")
                        vals.append(body[f])
                if body.get("archive"):
                    fields.append("is_archived = TRUE")
                vals.append(opp_id)
                with conn.cursor() as cur:
                    cur.execute(f"UPDATE {SCHEMA}.wb_ai_opportunities SET {', '.join(fields)} WHERE id = %s", vals)
                bump_content_version(conn, project_id)
                conn.commit()
                return cors({"ok": True})

        # ── AI-ассессмент (быстрая оценка применимости AI) ───────────
        if method == "POST" and action == "ai_assess":
            project_id  = int(body.get("project_id") or 0)
            process_desc = (body.get("process_description") or "").strip()
            if not project_id or not process_desc:
                return cors({"ok": False, "error": {"message": "Нужны project_id и process_description"}}, 400)
            if not check_project_access(conn, project_id, user_id):
                return cors({"ok": False, "error": {"message": "Нет доступа"}}, 403)

            prompt = f"""Ты эксперт по цифровизации и ИИ в корпоративных процессах.

Проанализируй описание процесса и дай структурированную оценку применимости ИИ.

ОПИСАНИЕ ПРОЦЕССА:
{process_desc}

Верни СТРОГО валидный JSON:
{{
  "ai_recommended": true/false,
  "recommendation_label": "AI рекомендован" / "AI возможен" / "Сначала автоматизация" / "AI пока рано" / "AI не нужен",
  "solution_type": "genai" / "ml" / "rpa" / "rule_engine" / "workflow" / "bi" / "none",
  "solution_label": "читаемое название типа решения",
  "key_operations": ["список ручных операций которые можно автоматизировать"],
  "data_requirements": "какие данные нужны",
  "risks": ["главные риски"],
  "human_in_loop": true/false,
  "human_in_loop_reason": "почему нужен / не нужен контроль человека",
  "quick_wins": ["что можно сделать прямо сейчас без ИИ"],
  "next_step": "конкретный следующий шаг"
}}

ТОЛЬКО JSON без пояснений."""

            result_text = yandex_gpt(prompt, max_tokens=1500)
            try:
                start, end = result_text.find("{"), result_text.rfind("}")
                result = json.loads(result_text[start:end+1])
            except Exception:
                result = {"ai_recommended": False, "recommendation_label": "Не удалось проанализировать", "solution_type": "none"}

            return cors({"ok": True, "assessment": result})

        # ── AI: выделить боли из описания ────────────────────────────
        if method == "POST" and action == "ai_extract_pains":
            project_id = int(body.get("project_id") or 0)
            text       = (body.get("text") or "").strip()
            if not project_id or not text:
                return cors({"ok": False, "error": {"message": "Нужны project_id и text"}}, 400)
            if not check_project_access(conn, project_id, user_id):
                return cors({"ok": False, "error": {"message": "Нет доступа"}}, 403)

            prompt = f"""Из описания процесса или ситуации выдели боли, узкие места и проблемы.

ТЕКСТ:
{text[:3000]}

Верни СТРОГО валидный JSON — массив болей:
[
  {{
    "description": "конкретное описание боли",
    "pain_type": "manual_work" / "duplication" / "delay" / "lack_of_visibility" / "control_gap" / "data_quality" / "error_rate" / "compliance_burden",
    "impact_level": "critical" / "high" / "medium" / "low",
    "frequency": "ежедневно" / "еженедельно" / "ежемесячно" / "разово",
    "root_cause": "предполагаемая корневая причина"
  }}
]

ТОЛЬКО JSON массив без пояснений."""

            result_text = yandex_gpt(prompt, max_tokens=2000)
            try:
                start, end = result_text.find("["), result_text.rfind("]")
                pains = json.loads(result_text[start:end+1])
            except Exception:
                pains = []

            return cors({"ok": True, "pains": pains})

        # ── Инициативы ────────────────────────────────────────────────
        if action == "initiatives":
            project_id = int(qs.get("project_id") or body.get("project_id") or 0)
            if not project_id or not check_project_access(conn, project_id, user_id):
                return cors({"ok": False, "error": {"message": "Нет доступа"}}, 403)

            if method == "GET":
                with conn.cursor() as cur:
                    cur.execute(
                        f"""SELECT id, title, description, owner_name, priority,
                                   impact_score, effort_score, status, next_step,
                                   target_start_date, target_end_date
                            FROM {SCHEMA}.wb_initiatives
                            WHERE case_id = %s AND is_archived = FALSE
                            ORDER BY impact_score DESC, created_at DESC""",
                        (project_id,),
                    )
                    rows = cur.fetchall()
                return cors({"ok": True, "initiatives": [
                    {"id": r[0], "title": r[1], "description": r[2], "owner_name": r[3],
                     "priority": r[4], "impact_score": r[5], "effort_score": r[6],
                     "status": r[7], "next_step": r[8],
                     "target_start_date": str(r[9]) if r[9] else None,
                     "target_end_date": str(r[10]) if r[10] else None}
                    for r in rows
                ]})

            if method == "POST":
                title = (body.get("title") or "").strip()
                if not title:
                    return cors({"ok": False, "error": {"message": "Нужен title"}}, 400)
                with conn.cursor() as cur:
                    cur.execute(
                        f"""INSERT INTO {SCHEMA}.wb_initiatives
                            (case_id, user_id, title, description, owner_name, priority,
                             impact_score, effort_score, status, next_step)
                            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id""",
                        (project_id, user_id, title,
                         body.get("description", ""), body.get("owner_name", ""),
                         body.get("priority", "medium"),
                         body.get("impact_score", 3), body.get("effort_score", 3),
                         body.get("status", "idea"), body.get("next_step", "")),
                    )
                    init_id = cur.fetchone()[0]
                bump_content_version(conn, project_id)
                conn.commit()
                return cors({"ok": True, "id": init_id})

            if method == "PUT":
                init_id = int(body.get("id") or 0)
                if not init_id:
                    return cors({"ok": False, "error": {"message": "Нужен id"}}, 400)
                fields = ["updated_at = NOW()"]
                vals   = []
                for f in ("title", "description", "owner_name", "priority",
                          "impact_score", "effort_score", "status", "next_step"):
                    if f in body:
                        fields.append(f"{f} = %s")
                        vals.append(body[f])
                vals.append(init_id)
                with conn.cursor() as cur:
                    cur.execute(f"UPDATE {SCHEMA}.wb_initiatives SET {', '.join(fields)} WHERE id = %s", vals)
                bump_content_version(conn, project_id)
                conn.commit()
                return cors({"ok": True})

        # ── AI Operator: GET статус ───────────────────────────────────
        if method == "GET" and action == "ai_status":
            project_id = int(qs.get("project_id") or 0)
            if not project_id or not check_project_access(conn, project_id, user_id):
                return cors({"ok": False, "error": {"message": "Нет доступа"}}, 403)
            with conn.cursor() as cur:
                cur.execute(
                    f"""SELECT ai_status, ai_stage, content_version, ai_analyzed_version,
                               ai_last_analysis_at, ai_last_result_json, ai_last_error,
                               ai_run_started_at, ai_run_updated_at
                        FROM {SCHEMA}.projects WHERE id = %s""",
                    (project_id,)
                )
                r = cur.fetchone()
            if not r:
                return cors({"ok": False, "error": {"message": "Проект не найден"}}, 404)
            result_json = None
            if r[5]:
                try: result_json = json.loads(r[5])
                except Exception: pass
            cv, av = (r[2] or 1), (r[3] or 0)
            return cors({
                "ok": True,
                "ai_status":            r[0] or "idle",
                "ai_stage":             r[1],
                "content_version":      cv,
                "ai_analyzed_version":  av,
                "ai_is_stale":          cv > av,
                "ai_last_analysis_at":  str(r[4]) if r[4] else None,
                "ai_last_result_json":  result_json,
                "ai_last_error":        r[6],
                "run_started_at":       str(r[7]) if r[7] else None,
                "run_updated_at":       str(r[8]) if r[8] else None,
            })

        # ── AI Operator: POST запуск анализа (отдаёт 202, LLM в фоне) ─
        if method == "POST" and action == "ai_analyze":
            project_id = int(body.get("project_id") or 0)
            if not project_id:
                return cors({"ok": False, "error": {"message": "Нужен project_id"}}, 400)
            if not check_project_access(conn, project_id, user_id):
                return cors({"ok": False, "error": {"message": "Нет доступа"}}, 403)

            with conn.cursor() as cur:
                cur.execute(
                    f"""SELECT ai_status, content_version, ai_analyzed_version, ai_last_analysis_at,
                               ai_last_result_json, ai_last_error
                        FROM {SCHEMA}.projects WHERE id = %s""",
                    (project_id,)
                )
                proj = cur.fetchone()

            curr_status = proj[0] if proj else "idle"
            content_v   = proj[1] if proj else 1
            analyzed_v  = proj[2] if proj else 0
            last_at     = proj[3] if proj else None

            # Защита от дублей — если уже запущен, отдаём текущий статус
            if curr_status in ("running", "queued"):
                return cors({"ok": True, "ai_status": curr_status, "ai_stage": None,
                             "content_version": content_v, "ai_analyzed_version": analyzed_v,
                             "ai_is_stale": content_v > analyzed_v, "ai_last_result_json": None})

            # Cooldown 5 минут если кейс не менялся
            import datetime
            if last_at and content_v <= analyzed_v:
                delta = datetime.datetime.utcnow() - last_at
                if delta.total_seconds() < 300:
                    cached = None
                    if proj[4]:
                        try: cached = json.loads(proj[4])
                        except Exception: pass
                    return cors({"ok": True, "ai_status": "ready", "ai_stage": None,
                                 "content_version": content_v, "ai_analyzed_version": analyzed_v,
                                 "ai_is_stale": False, "ai_last_result_json": cached})

            # Ставим в queued и сразу коммитим — polling увидит статус мгновенно
            input_version = content_v
            with conn.cursor() as cur:
                cur.execute(
                    f"""UPDATE {SCHEMA}.projects
                        SET ai_status = 'queued', ai_stage = 'queued',
                            ai_last_error = NULL,
                            ai_run_started_at = NOW(), ai_run_updated_at = NOW()
                        WHERE id = %s""",
                    (project_id,)
                )
            conn.commit()

            # ── Фоновая функция (выполняется в том же запросе, но после ответа клиенту) ──
            # Cloud Functions не поддерживают BackgroundTasks,
            # поэтому мы выполняем анализ синхронно, но уже отправили queued-статус.
            # Polling на фронте подхватит промежуточные статусы через GET /ai_status.

            def _set_stage(stage: str):
                c = psycopg2.connect(DB)
                try:
                    with c.cursor() as cu:
                        cu.execute(
                            f"UPDATE {SCHEMA}.projects SET ai_stage = %s, ai_run_updated_at = NOW() WHERE id = %s",
                            (stage, project_id)
                        )
                    c.commit()
                finally:
                    c.close()

            try:
                # collecting_context
                _set_stage("collecting_context")
                pd = {}
                conn2 = psycopg2.connect(DB)
                try:
                    with conn2.cursor() as cur:
                        cur.execute(f"SELECT title, description FROM {SCHEMA}.projects WHERE id = %s", (project_id,))
                        r = cur.fetchone(); pd["title"] = r[0] if r else ""; pd["desc"] = r[1] if r else ""
                    with conn2.cursor() as cur:
                        cur.execute(f"SELECT goals_text, constraints_text, key_facts_text, stakeholders_text FROM {SCHEMA}.workspace_context WHERE project_id = %s", (project_id,))
                        r = cur.fetchone()
                        pd["goals"] = (r[0] or "") if r else ""; pd["constraints"] = (r[1] or "") if r else ""
                        pd["key_facts"] = (r[2] or "") if r else ""; pd["stakeholders"] = (r[3] or "") if r else ""
                    with conn2.cursor() as cur:
                        cur.execute(f"""SELECT p.title, COUNT(s.id), SUM(CASE WHEN s.is_manual THEN 1 ELSE 0 END), SUM(CASE WHEN s.ai_potential IN ('high','medium') THEN 1 ELSE 0 END)
                            FROM {SCHEMA}.wb_processes p JOIN {SCHEMA}.wb_case_process_links lnk ON lnk.process_id = p.id AND lnk.case_id = %s
                            LEFT JOIN {SCHEMA}.wb_process_steps s ON s.process_id = p.id AND s.is_archived = FALSE
                            WHERE p.is_archived = FALSE GROUP BY p.id""", (project_id,))
                        pd["processes"] = [{"title": r[0], "steps": r[1], "manual": r[2], "ai_steps": r[3]} for r in cur.fetchall()]
                    with conn2.cursor() as cur:
                        cur.execute(f"SELECT pain_type, description, impact_level FROM {SCHEMA}.wb_pain_points WHERE case_id = %s AND is_archived = FALSE ORDER BY CASE impact_level WHEN 'critical' THEN 0 WHEN 'high' THEN 1 ELSE 2 END", (project_id,))
                        pd["pains"] = [{"type": r[0], "desc": r[1], "impact": r[2]} for r in cur.fetchall()]
                    with conn2.cursor() as cur:
                        cur.execute(f"SELECT title, statement, status FROM {SCHEMA}.workspace_hypotheses WHERE project_id = %s ORDER BY created_at", (project_id,))
                        pd["hypotheses"] = [{"title": r[0], "statement": r[1], "status": r[2]} for r in cur.fetchall()]
                    with conn2.cursor() as cur:
                        cur.execute(f"SELECT b.title, b.applicability, b.observed_effect FROM {SCHEMA}.wb_benchmarks b JOIN {SCHEMA}.wb_case_benchmarks cb ON cb.benchmark_id = b.id AND cb.case_id = %s WHERE b.is_archived = FALSE", (project_id,))
                        pd["benchmarks"] = [{"title": r[0], "app": r[1], "effect": r[2]} for r in cur.fetchall()]
                    with conn2.cursor() as cur:
                        cur.execute(f"SELECT title, recommendation, proposed_solution_type FROM {SCHEMA}.wb_ai_opportunities WHERE case_id = %s AND is_archived = FALSE", (project_id,))
                        pd["ai_opps"] = [{"title": r[0], "rec": r[1], "solution": r[2]} for r in cur.fetchall()]
                    with conn2.cursor() as cur:
                        cur.execute(f"SELECT title, status, impact_score, effort_score, next_step FROM {SCHEMA}.wb_initiatives WHERE case_id = %s AND is_archived = FALSE ORDER BY impact_score DESC", (project_id,))
                        pd["initiatives"] = [{"title": r[0], "status": r[1], "impact": r[2], "effort": r[3], "next": r[4]} for r in cur.fetchall()]
                    with conn2.cursor() as cur:
                        cur.execute(f"SELECT COUNT(*) FROM {SCHEMA}.tasks WHERE project_id = %s AND status != 'completed'", (project_id,))
                        pd["open_tasks"] = cur.fetchone()[0]
                    with conn2.cursor() as cur:
                        cur.execute(f"SELECT COUNT(*) FROM {SCHEMA}.documents WHERE project_id = %s", (project_id,))
                        pd["docs_count"] = cur.fetchone()[0]
                finally:
                    conn2.close()

                has_content = bool(
                    pd.get("desc") or pd.get("goals") or pd.get("key_facts") or
                    pd.get("processes") or pd.get("pains") or pd.get("hypotheses") or
                    pd.get("ai_opps") or pd.get("initiatives") or pd.get("benchmarks")
                )
                if not has_content:
                    with conn.cursor() as cur:
                        cur.execute(f"UPDATE {SCHEMA}.projects SET ai_status = 'idle', ai_stage = NULL, ai_run_updated_at = NOW() WHERE id = %s", (project_id,))
                    conn.commit()
                    return cors({"ok": True, "ai_status": "idle", "ai_stage": None, "empty": True,
                                 "content_version": input_version, "ai_analyzed_version": analyzed_v,
                                 "ai_is_stale": False, "ai_last_result_json": None})

                # analyzing_processes
                _set_stage("analyzing_processes")

                lines = [f"ПРОЕКТ: «{pd['title']}»"]
                if pd.get("desc"): lines.append(f"Описание: {pd['desc']}")
                if pd.get("goals"): lines.append(f"\nЦЕЛИ:\n{pd['goals']}")
                if pd.get("key_facts"): lines.append(f"\nКЛЮЧЕВЫЕ ФАКТЫ:\n{pd['key_facts']}")
                if pd.get("constraints"): lines.append(f"\nОГРАНИЧЕНИЯ:\n{pd['constraints']}")
                if pd.get("stakeholders"): lines.append(f"\nСТЕЙКХОЛДЕРЫ:\n{pd['stakeholders']}")
                if pd.get("processes"):
                    lines.append("\nПРОЦЕССЫ:")
                    for p in pd["processes"]: lines.append(f"  • {p['title']}: {p['steps']} шагов, {p['manual']} ручных, {p['ai_steps']} с AI-потенциалом")
                if pd.get("pains"):
                    lines.append("\nБОЛИ:")
                    for p in pd["pains"][:8]: lines.append(f"  • [{p['impact']}] {p['desc']}")
                if pd.get("hypotheses"):
                    lines.append("\nГИПОТЕЗЫ:")
                    for h in pd["hypotheses"]: lines.append(f"  • [{h['status']}] {h['title']}: {(h['statement'] or '')[:150]}")
                if pd.get("benchmarks"):
                    lines.append("\nБЕНЧМАРКИ:")
                    for b in pd["benchmarks"]: lines.append(f"  • {b['title']}: {(b['app'] or '')[:100]}")
                if pd.get("ai_opps"):
                    lines.append("\nAI-ВОЗМОЖНОСТИ:")
                    for o in pd["ai_opps"]: lines.append(f"  • {o['title']} → {o['rec']} ({o['solution']})")
                if pd.get("initiatives"):
                    lines.append("\nИНИЦИАТИВЫ:")
                    for i in pd["initiatives"]:
                        lines.append(f"  • {i['title']} [{i['status']}] эффект:{i['impact']}/5 усилие:{i['effort']}/5")
                        if i["next"]: lines.append(f"    Следующий шаг: {i['next']}")
                lines.append(f"\nФАЙЛОВ: {pd.get('docs_count', 0)}, ОТКРЫТЫХ ЗАДАЧ: {pd.get('open_tasks', 0)}")

                context_text = "\n".join(lines)

                # building_summary
                _set_stage("building_summary")

                system = "Ты AI-аналитик трансформационного проекта. Читаешь содержимое рабочего кейса и делаешь структурированный анализ. Не ждёшь вопросов — сам инициативно анализируешь. Пиши конкретно, без воды, для русскоязычного профессионала."
                prompt = f"""{context_text}

---
Проанализируй этот кейс. Верни СТРОГО валидный JSON:
{{"summary":"3-4 предложения — суть кейса и главная проблема","readiness_score":число 1-10,"key_insight":"самый важный инсайт — 1-2 предложения","top_pains":["боль 1","боль 2","боль 3"],"ai_verdict":"AI рекомендован"/"AI возможен"/"Сначала процессы — AI потом","ai_verdict_reason":"1-2 предложения","quick_wins":["что сделать сейчас без AI"],"gaps":["чего не хватает в кейсе"],"next_action":"одно конкретное следующее действие","risks":["риск 1","риск 2"]}}
ТОЛЬКО JSON."""

                result_text = yandex_gpt(prompt, system, max_tokens=2000)
                s, e2 = result_text.find("{"), result_text.rfind("}") + 1
                analysis = json.loads(result_text[s:e2])

                # finalizing
                _set_stage("finalizing")

                result_json = json.dumps(analysis, ensure_ascii=False)
                with conn.cursor() as cur:
                    cur.execute(
                        f"""UPDATE {SCHEMA}.projects
                            SET ai_status = 'ready', ai_stage = NULL,
                                ai_analyzed_version = %s,
                                ai_last_analysis_at = NOW(),
                                ai_last_result_json = %s,
                                ai_last_error = NULL,
                                ai_run_updated_at = NOW()
                            WHERE id = %s""",
                        (input_version, result_json, project_id)
                    )
                conn.commit()
                return cors({"ok": True, "ai_status": "ready", "ai_stage": None,
                             "content_version": input_version, "ai_analyzed_version": input_version,
                             "ai_is_stale": False, "ai_last_result_json": analysis})

            except Exception as exc:
                with conn.cursor() as cur:
                    cur.execute(
                        f"""UPDATE {SCHEMA}.projects
                            SET ai_status = 'failed', ai_stage = NULL,
                                ai_last_error = %s, ai_run_updated_at = NOW()
                            WHERE id = %s""",
                        (str(exc)[:500], project_id)
                    )
                conn.commit()
                return cors({"ok": False, "error": {"message": "Ошибка AI-анализа"}}, 500)

        return cors({"ok": False, "error": {"message": "Неизвестное действие"}}, 400)

    finally:
        conn.close()