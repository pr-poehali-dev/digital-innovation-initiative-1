-- Расширяем профиль: vision, product_thesis, strategic_pillars_json, guardrails_json

ALTER TABLE t_p61016064_digital_innovation_i.admin_strategy_profiles
  ADD COLUMN IF NOT EXISTS vision_text         TEXT    NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS product_thesis      TEXT    NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS strategic_pillars_json JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS guardrails_json     JSONB   NOT NULL DEFAULT '[]';

UPDATE t_p61016064_digital_innovation_i.admin_strategy_profiles
SET
  vision_text = 'Глобальная платформа раскрытия профессионального потенциала человека — система, которая помогает человеку понять свои сильные стороны, карту компетенций, потенциал и направление развития, подтверждать рост на практике и, при согласии, становиться видимым для рынка и работодателей.',

  product_thesis = 'Мы строим Professional Operating System — профессиональную операционную систему человека. Не просто LMS, не просто job board, не просто тестовую платформу. Объединяем: профиль и историю развития, карту компетенций, оценку потенциала, обучение, практическую работу и карьерную навигацию в единую opt-in экосистему.',

  strategic_pillars_json = '[
    {"id": "identity",     "title": "Professional Identity",        "description": "Цифровой профессиональный профиль: образование, опыт, направления деятельности, интересы, карьерные цели, подтверждённые факты."},
    {"id": "competency",   "title": "Competency Graph",             "description": "Карта компетенций: что есть, на каком уровне, чем подтверждено, как связано с профессиями и ролями, где gap-ы."},
    {"id": "navigator",    "title": "Growth Navigator",             "description": "Навигатор развития: персональный план роста, skill gaps, рекомендации, learning path, регулярные проверки знаний."},
    {"id": "practice",     "title": "Work & Practice Layer",        "description": "Практический слой: ведение проектов, задачи, гипотезы, инструменты по профессии, шаблоны, лайфхаки, benchmark-ы."},
    {"id": "proof",        "title": "Verified Professional Proof",  "description": "Подтверждение уровня: тесты, результаты в проектах, динамика развития, evidence-based оценка, digital CV / portfolio."},
    {"id": "discovery",    "title": "Talent Discovery (opt-in)",    "description": "При согласии пользователя: профиль виден работодателям по компетенциям, росту и потенциалу. Не рейтинг — explainable fit score."}
  ]'::jsonb,

  guardrails_json = '[
    {"title": "Consent-first",       "description": "Публичность, показ работодателям, внешние данные — только по явному согласию."},
    {"title": "Explainability",      "description": "Любая оценка должна быть объяснима: из чего она получена."},
    {"title": "Evidence > Claims",   "description": "Подтверждённые сигналы важнее самооценки."},
    {"title": "Growth, not labeling","description": "Платформа помогает расти, а не навешивает ярлык слабого специалиста."},
    {"title": "Human Dignity",       "description": "Недопустимы дискриминационные или непрозрачные выводы об оценке человека."}
  ]'::jsonb

WHERE workspace_key = 'default';
