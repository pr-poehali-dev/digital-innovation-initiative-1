-- Strategy V0103: Product Status Snapshot 13.06.2026

INSERT INTO t_p61016064_digital_innovation_i.admin_strategy_scenarios
  (name, scenario_type, period_start, period_end, assumptions_json, baseline_metrics, projected_metrics, delta_metrics, ai_commentary, confidence, created_by)
VALUES (
  'Strategy V0103 — Product Status Snapshot 13.06.2026',
  'milestone',
  '2026-06-13', '2026-06-13',
  '[]',
  '{}', '{}', '{}',
  '{
    "version": "V0103",
    "date": "2026-06-13",
    "product_status": {
      "learning_foundation_v1": "CLOSED",
      "workspace_mvp_v1": "LAUNCHED / stabilized",
      "evidence_bridge_v1": "LAUNCHED (manual happy-path confirmation pending)"
    },
    "notes": [
      "Learning Foundation v1 завершён: onboarding, plan generation, first topic activation, verified materials, memory layer, review loop.",
      "Workspace MVP v1 собран и стабилизирован: workspace_context, hypotheses, artifacts, AI Copilot (4 режима, context builder), ai_runs, 7 вкладок в ProjectPage. SEARCH_FUNCTION_URL в env, graceful fallback, permissions, 7 analytics-событий.",
      "Evidence Bridge v1 реализован end-to-end: artifact → AI draft → user review/edit → confirm/reject → Passport (SummaryTab). Отдельная таблица workspace_evidence_drafts, UNIQUE(user_id, artifact_id) на уровне БД.",
      "Программный smoke-test пройден: idempotency (UNIQUE constraint), permissions (user_id isolation), reject flow, YandexGPT fallback, [:2000] truncation, 4 analytics-события, UX-статус и ссылка в Passport.",
      "Финальный live check: AI Copilot → artifact → Добавить в Passport → draft → confirm. После успеха: Evidence Bridge v1 → LAUNCHED."
    ],
    "what_is_built": {
      "db_migrations": ["V0099 workspace_tables", "V0101 evidence_bridge_fields", "V0102 workspace_evidence_drafts"],
      "backend": ["workspace: 8 actions", "professional: +5 Evidence Bridge actions"],
      "frontend": ["ProjectPage 7 вкладок", "Модал артефакта с Evidence Bridge CTA", "Passport SummaryTab: черновики + confirm/reject модал"],
      "analytics": "73 события: +7 workspace + 4 evidence bridge"
    },
    "growth_loop": "Learning (learn) → Workspace (apply) → Passport (prove) — все три слоя собраны"
  }',
  'high',
  'founder'
);
