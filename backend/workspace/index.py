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
SEARCH_URL = os.environ.get("SEARCH_FUNCTION_URL", "https://functions.poehali.dev/54999e08-24f7-478d-92d8-8d66785f0a00")


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
    """Поиск по файлам проекта через search_knowledge."""
    if not SEARCH_URL:
        return []
    try:
        payload = json.dumps({"action": "search_knowledge", "project_id": project_id, "query": query}).encode()
        req = urllib.request.Request(SEARCH_URL, data=payload, headers={
            "Content-Type": "application/json",
            "X-Session-Id": session_id,
        })
        with urllib.request.urlopen(req, timeout=8) as resp:
            data = json.loads(resp.read())
        body = data.get("body") or data
        if isinstance(body, str):
            body = json.loads(body)
        results = body.get("results") or body.get("data", {}).get("results", [])
        return results[:limit]
    except Exception:
        return []


def build_context(conn, project_id: int, message: str, session_id: str) -> dict:
    """
    Собирает workspace-контекст для AI:
    1. workspace_context — постоянный контекст пространства
    2. project.description — описание проекта
    3. search_knowledge(message) top-5 — релевантные фрагменты файлов
    4. последние 3 артефакта (summary)
    5. открытые гипотезы (title + statement)
    """
    # 1. workspace_context
    wctx = {"goals_text": "", "constraints_text": "", "key_facts_text": "", "stakeholders_text": ""}
    with conn.cursor() as cur:
        cur.execute(
            f"SELECT goals_text, constraints_text, key_facts_text, stakeholders_text FROM {SCHEMA}.workspace_context WHERE project_id = %s",
            (project_id,),
        )
        row = cur.fetchone()
    if row:
        wctx = {"goals_text": row[0], "constraints_text": row[1], "key_facts_text": row[2], "stakeholders_text": row[3]}

    # 2. project description
    with conn.cursor() as cur:
        cur.execute(f"SELECT title, description FROM {SCHEMA}.projects WHERE id = %s", (project_id,))
        proj = cur.fetchone()
    project_title = proj[0] if proj else ""
    project_desc  = proj[1] if proj else ""

    # 3. search
    search_results = search_in_project(project_id, message, session_id, limit=5)

    # 4. последние 3 артефакта
    with conn.cursor() as cur:
        cur.execute(
            f"SELECT title, artifact_type, summary FROM {SCHEMA}.workspace_artifacts WHERE project_id = %s ORDER BY created_at DESC LIMIT 3",
            (project_id,),
        )
        artifacts = cur.fetchall()

    # 5. открытые гипотезы
    with conn.cursor() as cur:
        cur.execute(
            f"SELECT title, statement FROM {SCHEMA}.workspace_hypotheses WHERE project_id = %s AND status IN ('open','testing') ORDER BY created_at DESC LIMIT 5",
            (project_id,),
        )
        hypotheses = cur.fetchall()

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

        return cors({"ok": False, "error": {"message": "Неизвестное действие"}}, 400)

    finally:
        conn.close()