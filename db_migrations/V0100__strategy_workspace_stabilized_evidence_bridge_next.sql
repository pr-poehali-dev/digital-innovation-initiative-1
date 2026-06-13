-- Product status snapshot: Workspace MVP v1 stabilized + Evidence Bridge declared as next
INSERT INTO t_p61016064_digital_innovation_i.admin_strategy_scenarios
  (name, scenario_type, period_start, period_end, assumptions_json, baseline_metrics, projected_metrics, delta_metrics, ai_commentary, confidence, created_by)
VALUES (
  'Workspace MVP v1 — Stabilized',
  'milestone',
  '2026-06-01', '2026-06-13',
  '[]',
  '{}', '{}', '{}',
  '{
    "summary": "Workspace MVP v1 стабилизирован 13.06.2026. Статус: launched / stabilization complete.",
    "stabilization_done": [
      "SEARCH_FUNCTION_URL переведён из hardcode в env-переменную (секрет добавлен)",
      "build_context: graceful fallback на каждый источник (workspace_context / project / search / artifacts / hypotheses)",
      "search_in_project: надёжный парсинг Cloud Functions envelope + защита от некорректного ответа",
      "permissions: check_project_access сквозная на всех actions (context, hypotheses, artifacts, ai_runs, copilot)",
      "analytics: 7 новых событий — workspace_opened / context_updated / copilot_used / artifact_created / artifact_opened / hypothesis_created / hypothesis_updated",
      "analytics подключены в ProjectPage на все workspace-действия"
    ],
    "what_is_shipped": [
      "workspace_context — редактируемый постоянный контекст пространства (цели, ограничения, факты, стейкхолдеры)",
      "workspace_hypotheses — CRUD, статусы: open/testing/confirmed/rejected, приоритеты",
      "workspace_artifacts — создание через AI Copilot, просмотр в модале",
      "workspace_ai_runs — полная история AI-сессий с sources_used и artifact_id",
      "AI Copilot — context builder: workspace_context + search top-5 + artifacts + hypotheses, 4 режима (analyst/strategist/pm/researcher)",
      "ProjectPage расширен с 3 до 7 вкладок: Обзор / AI Copilot / Гипотезы / Артефакты / Задания / Файлы / Команда"
    ]
  }',
  'high',
  'founder'
),
(
  'Evidence Bridge v1 — Next Strategic Priority',
  'product_loop',
  '2026-06-13', '2026-10-01',
  '[
    {"assumption": "AI предлагает evidence draft, но не публикует автоматически — подтверждение за пользователем"},
    {"assumption": "Начинаем только с артефактов — не тянем сразу гипотезы и все типы"},
    {"assumption": "Мост двусторонний: артефакт → Passport и обратная ссылка в workspace"}
  ]',
  '{"evidence_from_workspace": 0, "passport_drafts_from_artifacts": 0}',
  '{"evidence_from_workspace": 5, "passport_drafts_from_artifacts": 3, "confirmed_evidence": 2}',
  '{}',
  '{
    "summary": "Evidence Bridge v1 — следующий стратегический приоритет после Workspace stabilization. Замыкает Growth Loop: Learning → Workspace → Passport. Без него артефакты остаются просто документами в проекте, а не доказательством профессионального роста.",
    "product_thesis": "Пользователь делает реальную работу в Workspace → AI помогает оформить это как evidence → пользователь подтверждает → Passport получает доказательство роста.",
    "growth_loop": "Learning (learn) → Workspace (apply) → Passport (prove) — все три слоя замкнуты.",
    "scope_v1": [
      "action create_evidence_from_artifact: принимает artifact_id, project_id, опционально competency_ids",
      "AI-assisted mapping: summary, what_was_done, outcome, role, skills_demonstrated",
      "Кнопка Добавить в Passport на карточке артефакта в ProjectPage",
      "Draft evidence в Passport с возможностью редактировать и подтвердить / отклонить",
      "Обратная ссылка: у артефакта видно есть ли по нему evidence draft"
    ],
    "not_in_v1": [
      "автозачёт evidence без подтверждения пользователя",
      "автоматическая оценка уровня компетенции",
      "full skill graph",
      "peer validation",
      "публичная сертификация",
      "гипотезы как источник evidence (v1.1)"
    ],
    "implementation_order": [
      "1. Изучить Passport: текущая модель evidence, таблицы, API",
      "2. Миграция: добавить artifact_id + project_id в evidence",
      "3. Backend: create_evidence_from_artifact + AI-assisted draft",
      "4. Frontend: кнопка на артефакте + модал черновика",
      "5. Frontend: Passport — блок черновиков из Workspace"
    ]
  }',
  'medium',
  'founder'
);
