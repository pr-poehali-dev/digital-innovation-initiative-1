-- Learning Foundation v1: закрываем как milestone, фиксируем в стратегии
-- Workspace MVP: следующий стратегический приоритет

-- Сценарий: Learning Foundation v1 — closed
INSERT INTO t_p61016064_digital_innovation_i.admin_strategy_scenarios
  (name, scenario_type, period_start, period_end, assumptions_json, baseline_metrics, projected_metrics, delta_metrics, ai_commentary, confidence, created_by)
VALUES (
  'Learning Foundation v1 — Closed',
  'milestone',
  '2026-05-01', '2026-06-13',
  '[{"note": "Milestone закрыт 13.06.2026 — Learning Foundation v1 завершён как первый продуктовый пакет"}]',
  '{}',
  '{}',
  '{}',
  '{
    "summary": "Learning Foundation v1 закрыт. Не закончен навсегда — закрыт как текущий milestone. Дальше по Learning: stabilization, bagfixes, наблюдение за метриками. Без открытия нового крупного scope до стабилизации Workspace MVP.",
    "what_is_done": [
      "Onboarding Flow v1: пустой экран → wizard → шаблоны → автогенерация плана → автооткрытие первой темы → CTA на первую сессию",
      "Real URLs v1: link resolver через DuckDuckGo, domain whitelist (15 источников), verified badges на карточках материалов, guardrail: никаких выдуманных ссылок",
      "Memory Layer v1: quiz result save (server-side score), concept_tag в вопросах, weak_concepts, needs_review, review_priority, memory в промптах topic_learn, review badge в дереве тем, remediation CTA",
      "Analytics-воронка: 62 события, полная воронка от onboarding_viewed до review_quiz_retaken"
    ],
    "stabilization_checklist": [
      "Ручной сценарий: новый пользователь → onboarding → план → первая тема → сессия",
      "Ручной сценарий: quiz → save_result → review_topic → retake",
      "Проверить % materials with verified links на 3 темах",
      "Проверить review_topics появляются после слабого quiz",
      "Посмотреть analytics воронку: goal_started → first_session_started"
    ],
    "next_for_learning": "Только stabilize: bagfixes + UX-правки по данным метрик. Без нового крупного scope."
  }',
  'high',
  'founder'
);

-- Сценарий: Applied Workspace MVP — следующий стратегический приоритет
INSERT INTO t_p61016064_digital_innovation_i.admin_strategy_scenarios
  (name, scenario_type, period_start, period_end, assumptions_json, baseline_metrics, projected_metrics, delta_metrics, ai_commentary, confidence, created_by)
VALUES (
  'Applied Workspace MVP — Next Strategic Priority',
  'product_loop',
  '2026-06-13', '2026-09-30',
  '[
    {"assumption": "Мои проекты берём как базу — не создаём новый параллельный раздел"},
    {"assumption": "AI работает через persistent context + retrieval, не через ручные промпты"},
    {"assumption": "Сначала: анализ + артефакты. Потом: изменения требуют approval"},
    {"assumption": "workspace_notes убираем из MVP v1 — не критично для первого запуска"}
  ]',
  '{"workspace_sessions_per_user": 0, "artifacts_created": 0, "hypotheses_tested": 0}',
  '{"workspace_sessions_per_user": 8, "artifacts_created": 3, "hypotheses_tested": 2, "evidence_from_workspace": 1}',
  '{}',
  '{
    "summary": "Applied Workspace MVP — это следующий стратегический мост после Learning. Превращает Мои проекты из контейнера хранения в AI-native рабочее пространство. Именно здесь появляется Applied Layer: пользователь не просто учится, а решает реальные задачи и создаёт артефакты. Это середина Growth Loop.",
    "product_thesis": "Рабочее пространство — AI-native среда на базе Моих проектов, где пользователь и AI вместе анализируют материалы, проверяют гипотезы, создают артефакты и фиксируют результаты как evidence профессионального роста.",
    "growth_loop_role": "Learning → APPLY IN WORKSPACE → Evidence → Passport. Workspace — это оперативная середина Growth Loop.",
    "reuse_from_projects": [
      "projects + project_members + activity_log — контейнер готов",
      "documents + chunked upload + text extraction — готово",
      "search_knowledge — поиск по файлам — готово",
      "chat_with_document — AI чат с документом — готово",
      "team / invite / roles — готово"
    ],
    "what_to_add": [
      "workspace_context — расширенный контекст пространства (цели, ограничения, ключевые факты)",
      "workspace_hypotheses — гипотезы: формулировка, предпосылки, критерии, статус, вывод",
      "workspace_artifacts — артефакты AI: summary, ТЗ, roadmap, recommendations, analysis",
      "workspace_ai_runs — история AI-сессий: вопрос, mode, sources_used, context_summary, artifact_id",
      "workspace_copilot backend action — context builder + AI + save artifact",
      "Рефакторинг ProjectPage: новые вкладки Обзор / Задачи / Гипотезы / Файлы / Copilot / Артефакты / Команда"
    ],
    "not_in_mvp": [
      "workspace_notes — в v1.1",
      "tasks deep rewrite — только добавим general task type",
      "embeddings / knowledge graph",
      "автономные изменения в продакшене без approval",
      "multi-agent orchestration",
      "enterprise-права"
    ],
    "implementation_order": [
      "1. Миграция БД: workspace_context, workspace_hypotheses, workspace_artifacts, workspace_ai_runs",
      "2. Backend CRUD + workspace_copilot + context builder (search_knowledge top-N + workspace_context + last artifacts + open hypotheses)",
      "3. Рефакторинг ProjectPage: новые вкладки",
      "4. Frontend: AI Copilot вкладка + сохранение артефактов",
      "5. Frontend: Hypotheses CRUD",
      "6. Frontend: Artifacts список + открытие"
    ],
    "context_builder_principle": "workspace_context (always) + search_knowledge(query) top-5 + last 3 artifacts summary + open hypotheses = ~3000 tokens. Без embeddings на MVP."
  }',
  'medium',
  'founder'
);
