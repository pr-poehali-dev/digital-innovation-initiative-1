import json
import os
import re
import hashlib
import datetime
import urllib.request
import psycopg2

DB = os.environ["DATABASE_URL"]
_s = os.environ.get("MAIN_DB_SCHEMA", "").strip()
SCHEMA = _s if _s else "t_p61016064_digital_innovation_i"

YANDEX_GPT_KEY = os.environ.get("YANDEX_GPT_API_KEY", "")
YANDEX_FOLDER_ID = os.environ.get("YANDEX_FOLDER_ID", "")
GPT_URL = "https://llm.api.cloud.yandex.net/foundationModels/v1/completion"
MODEL_URI = f"gpt://{YANDEX_FOLDER_ID}/yandexgpt/latest"


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


def get_admin(conn, token: str):
    if not token:
        return None
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    with conn.cursor() as cur:
        cur.execute(
            f"SELECT actor_email FROM {SCHEMA}.admin_sessions "
            f"WHERE session_token_hash = %s AND expires_at > NOW() AND revoked_at IS NULL LIMIT 1",
            (token_hash,),
        )
        row = cur.fetchone()
    return row[0] if row else None


def get_cabinet_user(conn, session_id: str):
    if not session_id:
        return None
    with conn.cursor() as cur:
        cur.execute(
            f"SELECT u.email, a.access_role, a.can_confirm "
            f"FROM {SCHEMA}.sessions s "
            f"JOIN {SCHEMA}.users u ON u.id = s.user_id "
            f"JOIN {SCHEMA}.exec_cabinet_access a ON LOWER(a.email) = LOWER(u.email) "
            f"LEFT JOIN {SCHEMA}.admin_user_flags fl ON fl.user_id = u.id "
            f"WHERE s.id = %s AND s.expires_at > NOW() "
            f"AND a.is_active = true AND COALESCE(fl.is_blocked, false) = false LIMIT 1",
            (session_id,),
        )
        row = cur.fetchone()
    if not row:
        return None
    return {"email": row[0], "role": row[1], "can_confirm": row[2]}


def authenticate(conn, headers: dict):
    token = headers.get("x-admin-token") or headers.get("X-Admin-Token", "")
    email = get_admin(conn, token)
    if email:
        return {"email": email, "role": "head", "can_confirm": True}
    sid = headers.get("x-session-id") or headers.get("X-Session-Id", "")
    return get_cabinet_user(conn, sid)


def nz(v):
    if v is None:
        return None
    if isinstance(v, str) and not v.strip():
        return None
    return v


AI_SYSTEM = (
    "Ты — опытный руководитель проектного офиса в крупной российской организации. "
    "Ты раскладываешь управленческую задачу на понятный пошаговый план. "
    "Пишешь строго по-деловому, на русском языке, без воды и англицизмов."
)

AI_PROMPT = """Задача руководителя: {title}
{goal}{period}{people}{knowledge}
Составь пошаговый план выполнения этой задачи.

Требования:
0. Если выше приведены внутренние регламенты организации — план обязан им следовать:
   соблюдай указанные там этапы, роли, порядок согласования и утверждения.
   Там, где регламент требует согласования или утверждения, добавляй отдельный шаг.
1. От 4 до 7 крупных шагов в логической последовательности.
2. У 2-4 шагов добавь вложенные действия (substeps) — по 2-4 штуки, это конкретные операции.
3. Отметь 1-3 ключевых шага как веху (is_milestone: true) — это проверяемый результат:
   «согласовано», «утверждено», «запущено», «принято в эксплуатацию».
4. Для каждого шага и действия укажи offset_start и offset_end — смещение в днях
   от начала задачи (целые числа, offset_start <= offset_end).
   Все сроки должны укладываться в {days} дней. Шаги идут последовательно, без больших разрывов.
5. Для вехи offset_start = offset_end (это точка, а не отрезок).
6. Для каждого шага напиши result — краткий критерий выполнения (одно предложение).
7. Если в списке есть участники, предложи для шага роль исполнителя в поле role
   (например «аналитик», «руководитель направления»), иначе оставь role пустым.

Верни ТОЛЬКО JSON без пояснений и markdown-обёртки, строго в таком виде:
{{"steps":[{{"title":"...","description":"...","result":"...","role":"","is_milestone":false,"offset_start":0,"offset_end":10,"substeps":[{{"title":"...","offset_start":0,"offset_end":4}}]}}]}}"""


STOP_WORDS = {
    "и", "в", "на", "с", "по", "о", "об", "от", "для", "что", "как", "где",
    "это", "так", "же", "из", "к", "у", "за", "не", "ли", "то", "при", "все",
    "чтобы", "быть", "есть", "или", "его", "их", "был", "было", "нужно",
}

KNOWLEDGE_BUDGET = 7000  # символов контекста из регламентов


def pick_knowledge(cur, query: str) -> str:
    """Подбирает фрагменты регламентов, релевантные задаче руководителя."""
    try:
        cur.execute(f"""
            SELECT k.id, k.title, k.doc_type, k.summary, k.priority,
                   c.content, c.page_number
            FROM {SCHEMA}.exec_knowledge k
            JOIN {SCHEMA}.exec_knowledge_chunk c ON c.knowledge_id = k.id
            WHERE k.use_in_ai = true AND k.status = 'active'
            LIMIT 1500
        """)
        found = cur.fetchall()
    except Exception:
        return "", []

    if not found:
        return "", []

    words = [w for w in re.findall(r"[\w\-]{3,}", (query or "").lower())
             if w not in STOP_WORDS]

    scored = []
    for kid, title, dtype, summary, priority, content, page in found:
        low = (content or "").lower()
        score = 0.0
        for w in words:
            hits = low.count(w)
            if hits:
                score += hits * (1.0 + len(w) / 20.0)
        # заголовок документа тоже подсказывает релевантность
        tl = (title or "").lower()
        for w in words:
            if w in tl:
                score += 3.0
        score += (priority or 50) / 100.0
        if score > 0:
            scored.append((score, title, dtype, content, page))

    if not scored:
        # ничего не совпало — берём самые приоритетные документы целиком
        cur.execute(f"""
            SELECT k.title, k.doc_type, c.content, c.page_number
            FROM {SCHEMA}.exec_knowledge k
            JOIN {SCHEMA}.exec_knowledge_chunk c ON c.knowledge_id = k.id
            WHERE k.use_in_ai = true AND k.status = 'active'
            ORDER BY k.priority DESC, c.chunk_index
            LIMIT 6
        """)
        scored = [(1.0, r[0], r[1], r[2], r[3]) for r in cur.fetchall()]

    scored.sort(key=lambda x: -x[0])

    parts, used = [], 0
    seen_titles = set()
    for _, title, dtype, content, page in scored:
        if used + len(content) > KNOWLEDGE_BUDGET:
            continue
        label = DOC_TYPE_LABEL.get(dtype, "Документ")
        head = f"[{label}: {title}" + (f", стр. {page}]" if page else "]")
        parts.append(f"{head}\n{content.strip()}")
        used += len(content)
        seen_titles.add(title)
        if used >= KNOWLEDGE_BUDGET or len(parts) >= 8:
            break

    if not parts:
        return "", []
    text = (
        "\nВнутренние регламенты и правила организации (обязательны к учёту):\n"
        + "\n\n---\n\n".join(parts)
        + "\n"
    )
    return text, sorted(seen_titles)


DOC_TYPE_LABEL = {
    "rule": "Регламент",
    "matrix": "Матрица ответственности",
    "policy": "Политика",
    "method": "Методика",
    "template": "Шаблон",
    "note": "Вводная",
    "other": "Документ",
}


class AIDisabledError(Exception):
    pass


def _ai_enabled(module_code: str = "exec_knowledge") -> bool:
    """Единое управление AI («Настройки AI»): глобальный + модульный переключатель.
    Дополняет (не заменяет) существующий фильтр exec_knowledge.use_in_ai."""
    conn = psycopg2.connect(DB)
    try:
        cur = conn.cursor()
        cur.execute(f"SELECT is_enabled FROM {SCHEMA}.ai_global_settings ORDER BY id DESC LIMIT 1")
        g = cur.fetchone()
        if not g or not g[0]:
            return False
        cur.execute(f"SELECT is_enabled FROM {SCHEMA}.ai_module_settings WHERE module_code = %s", (module_code,))
        m = cur.fetchone()
        return bool(m and m[0])
    finally:
        conn.close()


def _log_ai_op(action, result, data_kind=None, approx_volume=None, module_code="exec_knowledge", initiated_by=None):
    try:
        conn = psycopg2.connect(DB)
        try:
            cur = conn.cursor()
            cur.execute(
                f"""INSERT INTO {SCHEMA}.ai_operation_log
                    (module_code, service, action, data_kind, approx_volume, result, initiated_by)
                    VALUES (%s, 'YandexGPT', %s, %s, %s, %s, %s)""",
                (module_code, action, data_kind, approx_volume, result, initiated_by),
            )
            conn.commit()
        finally:
            conn.close()
    except Exception:
        pass


def call_gpt(system: str, prompt: str, module_code: str = "exec_knowledge",
             disabled_action: str = "planner_suggest", module_label: str = "«База знаний и RAG»",
             max_tokens: int = 3000, temperature: float = 0.3) -> str:
    if not _ai_enabled(module_code):
        _log_ai_op(disabled_action, "disabled", data_kind=module_code, module_code=module_code)
        raise AIDisabledError(f"AI-обработка временно отключена владельцем платформы. Включите модуль {module_label} в разделе «Настройки AI».")
    if not YANDEX_GPT_KEY or not YANDEX_FOLDER_ID:
        raise RuntimeError("AI недоступен: не настроен ключ YandexGPT")
    payload = json.dumps({
        "modelUri": MODEL_URI,
        "completionOptions": {"stream": False, "temperature": temperature, "maxTokens": max_tokens},
        "messages": [
            {"role": "system", "text": system},
            {"role": "user", "text": prompt},
        ],
    }).encode()
    req = urllib.request.Request(
        GPT_URL,
        data=payload,
        headers={
            "Authorization": f"Api-Key {YANDEX_GPT_KEY}",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=90) as resp:
        result = json.loads(resp.read())
    return result["result"]["alternatives"][0]["message"]["text"]


def parse_json_block(text: str) -> dict:
    """Убирает markdown-обёртку и достаёт JSON-объект из ответа модели."""
    cleaned = (text or "").strip()
    if cleaned.startswith("```"):
        parts = cleaned.split("```")
        if len(parts) > 1:
            cleaned = parts[1]
        if cleaned.lstrip().startswith("json"):
            cleaned = cleaned.lstrip()[4:]
    m = re.search(r"\{.*\}", cleaned, re.DOTALL)
    if not m:
        raise ValueError("AI вернул ответ не в формате JSON")
    return json.loads(m.group(0))


def shift(base, days):
    try:
        return (base + datetime.timedelta(days=int(days))).isoformat()
    except Exception:
        return None


def ai_suggest(cur, body: dict):
    """Просит модель разложить задачу на шаги. Ничего не сохраняет."""
    title = (body.get("title") or "").strip()
    if not title:
        return None, "Опишите задачу — по ней будет построен план"

    goal = (body.get("goal") or "").strip()
    start_raw = nz(body.get("start_date"))
    due_raw = nz(body.get("due_date"))

    try:
        start = datetime.date.fromisoformat(str(start_raw)[:10]) if start_raw else datetime.date.today()
    except Exception:
        start = datetime.date.today()
    try:
        due = datetime.date.fromisoformat(str(due_raw)[:10]) if due_raw else None
    except Exception:
        due = None

    days = (due - start).days if due and due > start else 60
    if days < 3:
        days = 3

    cur.execute(f"""
        SELECT display_name, position_title FROM {SCHEMA}.exec_person
        WHERE COALESCE(record_state,'active') = 'active'
        ORDER BY display_name LIMIT 15
    """)
    people = [f"{r[0]}{f' — {r[1]}' if r[1] else ''}" for r in cur.fetchall()]

    knowledge, used_docs = pick_knowledge(cur, f"{title} {goal}")

    prompt = AI_PROMPT.format(
        title=title,
        goal=f"Цель и ожидаемый результат: {goal}\n" if goal else "",
        period=f"Срок выполнения: с {start.isoformat()} по {due.isoformat()}\n" if due else "",
        people=("Доступные участники:\n" + "\n".join(people) + "\n") if people else "",
        knowledge=knowledge,
        days=days,
    )

    raw = call_gpt(AI_SYSTEM, prompt)
    data = parse_json_block(raw)

    steps_in = data.get("steps") or []
    if not isinstance(steps_in, list) or not steps_in:
        return None, "AI не смог разложить задачу — уточните формулировку"

    def clamp(v, lo=0):
        try:
            n = int(v)
        except Exception:
            n = lo
        return max(0, min(n, days))

    steps_out = []
    for s in steps_in[:10]:
        if not isinstance(s, dict):
            continue
        st = clamp(s.get("offset_start", 0))
        en = clamp(s.get("offset_end", st))
        if en < st:
            en = st
        is_ms = bool(s.get("is_milestone"))
        subs = []
        for sub in (s.get("substeps") or [])[:6]:
            if not isinstance(sub, dict) or not (sub.get("title") or "").strip():
                continue
            ss = clamp(sub.get("offset_start", st))
            se = clamp(sub.get("offset_end", ss))
            if se < ss:
                se = ss
            subs.append({
                "title": str(sub.get("title")).strip()[:500],
                "start_date": shift(start, ss),
                "due_date": shift(start, se),
            })
        steps_out.append({
            "title": str(s.get("title") or "").strip()[:500],
            "description": str(s.get("description") or "").strip(),
            "result_criteria": str(s.get("result") or "").strip(),
            "role_hint": str(s.get("role") or "").strip(),
            "is_milestone": is_ms,
            "start_date": None if is_ms else shift(start, st),
            "due_date": shift(start, en),
            "substeps": [] if is_ms else subs,
        })

    steps_out = [s for s in steps_out if s["title"]]
    if not steps_out:
        return None, "AI не смог разложить задачу — уточните формулировку"
    return {"steps": steps_out, "days": days, "start_date": start.isoformat(),
            "used_knowledge": used_docs}, None


# ============ УПРАВЛЕНЧЕСКИЙ AI-ПОМОЩНИК (сводки, отклонения, риски) ============
#
# Отдельный модуль AI ('exec_ai_assistant' в ai_module_settings) — ТОЛЬКО
# рекомендательный режим: собирает уже существующие данные проекта одним
# набором SQL-запросов (без записи) и просит YandexGPT сформулировать
# ответ человеческим языком. Никогда не пишет в БД, не переносит сроки,
# не меняет бюджет/KPI/назначения/роли/факт — эти данные текстом
# передаются модели только для чтения. Каждый вызов логируется в
# ai_operation_log с усечённым объёмом данных, без секретов и без полного
# чувствительного текста.

SUMMARY_SYSTEM = (
    "Ты — аналитик проектного офиса. Отвечаешь ТОЛЬКО на основе присланных данных — "
    "ничего не придумываешь и не оцениваешь сотрудников персонально. "
    "Пишешь по-деловому, по-русски, структурированно, без воды. "
    "Ты не принимаешь решений и не даёшь распоряжений — только объясняешь текущее состояние "
    "и, если прямо попросили, называешь варианты для рассмотрения руководителем."
)

SUMMARY_MODES = {
    "overview": "Кратко сведи текущее состояние проекта: статус, готовность, ближайшие риски внимания.",
    "schedule_deviation": "Объясни отклонения сроков: что сдвинулось относительно baseline/плана, на сколько и почему (если причина указана в данных).",
    "overdue": "Перечисли просроченные задачи и вехи, по каждой — на сколько дней просрочена и кто ответственный (если указан).",
    "critical_path": "Объясни критический путь проекта: какие задачи/вехи на нём и почему сдвиг любой из них сдвигает срок всего проекта.",
    "risks": "Сведи риски и проблемы проекта: что активно, что критично, что требует внимания в первую очередь.",
    "resource_conflicts": "Объясни ресурсные конфликты: кто перегружен, какие роли не закрыты, что требует решения — ничего не назначай сам.",
    "management_note": "Сформируй ЧЕРНОВИК короткой управленческой справки по проекту (статус/риски/что нужно решить) — это черновик для правки руководителем, не финальный документ.",
    "goals_kpi": "Сведи цели и показатели (KPI) проекта кратко: план/факт, отклонение, что просрочено.",
}


def _project_ai_context(cur, project_id: int) -> tuple[str, dict]:
    """Собирает СУЩЕСТВУЮЩИЕ данные проекта одним проходом — только чтение,
    ничего не пересчитывает и не хранит отдельно. Возвращает готовый текст
    для промпта и структуру data_used (что именно попало в контекст, чтобы
    показать пользователю источники ответа)."""
    cur.execute(f"""
        SELECT title, status, priority, progress_pct, plan_start, plan_end,
               forecast_end, fact_start, fact_end, is_test_data, archived_at
        FROM {SCHEMA}.exec_project WHERE id = %s
    """, (project_id,))
    row = cur.fetchone()
    if not row:
        return "", {}
    cols = ["title", "status", "priority", "progress_pct", "plan_start", "plan_end",
            "forecast_end", "fact_start", "fact_end", "is_test_data", "archived_at"]
    proj = dict(zip(cols, row))

    parts = [f"ПРОЕКT: {proj['title']}",
             f"Статус: {proj['status']}, приоритет: {proj['priority']}, готовность: {proj['progress_pct']}%",
             f"План: {proj['plan_start']} — {proj['plan_end']}"]
    if proj["forecast_end"]:
        parts.append(f"Прогноз окончания: {proj['forecast_end']}")
    if proj["fact_start"] or proj["fact_end"]:
        parts.append(f"Факт: {proj['fact_start'] or '—'} — {proj['fact_end'] or '—'}")

    used = {"project": True}

    cur.execute(f"""
        SELECT title, status, due_at, progress_pct, responsible_person_id,
               (due_at IS NOT NULL AND due_at < CURRENT_DATE AND status NOT IN ('done','cancelled')) AS overdue
        FROM {SCHEMA}.exec_task
        WHERE project_id = %s AND archived_at IS NULL AND is_test_data = false
        ORDER BY (due_at IS NULL), due_at LIMIT 60
    """, (project_id,))
    tasks = rows(cur)
    overdue_tasks = [t for t in tasks if t.get("overdue")]
    if tasks:
        parts.append(f"\nЗАДАЧИ (всего {len(tasks)}, просрочено {len(overdue_tasks)}):")
        for t in overdue_tasks[:20]:
            parts.append(f"- ПРОСРОЧЕНА: «{t['title']}», срок {t['due_at']}, статус {t['status']}")
        used["tasks_count"] = len(tasks)
        used["overdue_tasks_count"] = len(overdue_tasks)

    cur.execute(f"""
        SELECT title, status, plan_date, fact_date,
               (plan_date < CURRENT_DATE AND status NOT IN ('achieved','cancelled')) AS overdue
        FROM {SCHEMA}.exec_milestone
        WHERE project_id = %s AND is_test_data = false
        ORDER BY plan_date LIMIT 40
    """, (project_id,))
    milestones = rows(cur)
    if milestones:
        parts.append(f"\nВЕХИ (всего {len(milestones)}):")
        for m in milestones:
            flag = " — ПРОСРОЧЕНА" if m.get("overdue") else ""
            parts.append(f"- «{m['title']}»: план {m['plan_date']}, статус {m['status']}{flag}")
        used["milestones_count"] = len(milestones)

    cur.execute(f"""
        SELECT description, probability, impact, probability*impact AS score, status
        FROM {SCHEMA}.exec_risk WHERE project_id = %s AND status = 'active'
        ORDER BY probability*impact DESC LIMIT 15
    """, (project_id,))
    risks = rows(cur)
    if risks:
        parts.append(f"\nРИСКИ (активных {len(risks)}):")
        for r in risks:
            parts.append(f"- {r['description'][:200]} (score {r['score']})")
        used["risks_count"] = len(risks)

    cur.execute(f"""
        SELECT title, status, criticality FROM {SCHEMA}.exec_issue
        WHERE project_id = %s AND status IN ('open','in_progress','awaiting_decision')
        ORDER BY criticality DESC LIMIT 15
    """, (project_id,))
    issues = rows(cur)
    if issues:
        parts.append(f"\nПРОБЛЕМЫ (открытых {len(issues)}):")
        for i in issues:
            parts.append(f"- «{i['title']}», критичность {i['criticality']}, статус {i['status']}")
        used["issues_count"] = len(issues)

    # Ресурсные конфликты считаем тем же SQL, что и resource_conflicts,
    # без импорта из другого backend-файла — переиспользуем напрямую нельзя
    # (разные cloud functions), поэтому короткая сводка по тем же таблицам.
    cur.execute(f"""
        SELECT p.display_name, SUM(a.plan_load_pct) AS total_pct
        FROM {SCHEMA}.exec_resource_assignment a
        JOIN {SCHEMA}.exec_person p ON p.id = a.person_id
        WHERE a.project_id = %s AND a.archived_at IS NULL AND a.is_test_data = false
        GROUP BY p.display_name
    """, (project_id,))
    project_people_load = rows(cur)
    cur.execute(f"""
        SELECT role_title, status FROM {SCHEMA}.exec_resource_requirement
        WHERE project_id = %s AND archived_at IS NULL AND is_test_data = false
          AND status IN ('draft','confirmed','searching','candidate_identified')
        LIMIT 15
    """, (project_id,))
    open_reqs = rows(cur)
    if project_people_load or open_reqs:
        parts.append("\nРЕСУРСЫ:")
        for pl in project_people_load:
            parts.append(f"- {pl['display_name']}: занятость {pl['total_pct']}% (в этом проекте)")
        for r in open_reqs:
            parts.append(f"- Незакрытая роль: {r['role_title']} (статус {r['status']})")
        used["resource_people_count"] = len(project_people_load)
        used["open_requirements_count"] = len(open_reqs)

    return "\n".join(parts), used


def management_summary(cur, body: dict, actor: str):
    """Формирует управленческую сводку по проекту — читает данные, просит
    модель сформулировать ответ, ничего не сохраняет и не изменяет."""
    project_id = body.get("project_id")
    if not project_id:
        return None, "Не указан проект"
    mode = body.get("mode") or "overview"
    if mode not in SUMMARY_MODES:
        return None, "Неизвестный режим сводки"

    context_text, used = _project_ai_context(cur, int(project_id))
    if not context_text:
        return None, "Проект не найден"

    prompt = (
        f"{context_text}\n\n"
        f"ЗАДАНИЕ: {SUMMARY_MODES[mode]}\n"
        "Отвечай только по приведённым выше данным. Если данных недостаточно — прямо скажи об этом."
    )
    answer = call_gpt(
        SUMMARY_SYSTEM, prompt, module_code="exec_ai_assistant",
        disabled_action=f"summary_{mode}", module_label="«AI-помощник руководителя»",
        max_tokens=1200, temperature=0.2,
    )
    _log_ai_op(f"summary_{mode}", "success", data_kind="project_context",
               approx_volume=len(context_text), module_code="exec_ai_assistant", initiated_by=actor)
    return {"answer": answer, "mode": mode, "data_used": used, "generated_by": "YandexGPT"}, None


def handler(event: dict, context) -> dict:
    """AI-помощник планировщика и управленческий AI-помощник (сводки/отклонения/
    риски/ресурсные конфликты) — только рекомендательный режим, ничего не
    сохраняет в БД."""
    if event.get("httpMethod") == "OPTIONS":
        return cors({})

    headers = event.get("headers") or {}
    qs = event.get("queryStringParameters") or {}
    action = qs.get("action", "ai_suggest")
    conn = psycopg2.connect(DB)
    try:
        user = authenticate(conn, headers)
        if not user:
            return cors({"ok": False, "error": {"message": "Не авторизован"}}, 401)

        body = json.loads(event["body"]) if event.get("body") else {}
        cur = conn.cursor()

        if action == "management_summary":
            if user.get("role") != "head":
                return cors({"ok": False, "error": {"message": "Доступ только для владельца кабинета"}}, 403)
            try:
                data, err = management_summary(cur, body, user["email"])
            except AIDisabledError as e:
                return cors({"ok": False, "error": {"message": str(e)}}, 423)
            except Exception as e:
                return cors({"ok": False, "error": {"message": f"Не удалось сформировать сводку: {e}"}}, 502)
            if err:
                return cors({"ok": False, "error": {"message": err}}, 400)
            return cors({"ok": True, "data": data})

        try:
            data, err = ai_suggest(cur, body)
        except AIDisabledError as e:
            return cors({"ok": False, "error": {"message": str(e)}}, 423)
        except Exception as e:
            return cors({"ok": False, "error": {
                "message": f"Не удалось построить план: {e}"}}, 502)
        if err:
            return cors({"ok": False, "error": {"message": err}}, 400)
        return cors({"ok": True, "data": data})
    finally:
        conn.close()