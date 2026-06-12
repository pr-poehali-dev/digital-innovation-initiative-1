-- Сценарии: продуктовые петли, метрики, риски
INSERT INTO t_p61016064_digital_innovation_i.admin_strategy_scenarios
  (name, scenario_type, period_start, period_end, assumptions_json, baseline_metrics, projected_metrics, delta_metrics, ai_commentary, confidence, created_by)
VALUES

(
  'Loop 1. Learning Loop — активация и обучение',
  'product_loop',
  '2026-06-01', '2026-09-30',
  '[
    {"assumption": "Onboarding Flow v1 запущен: пользователь создаёт цель за первый сеанс"},
    {"assumption": "AI-план генерируется за <15 сек, качество достаточное"},
    {"assumption": "Topic Learning Mode доступен для каждой темы"},
    {"assumption": "Quiz и Session работают стабильно"}
  ]',
  '{"activation_rate": 15, "goals_created_d1": 10, "topics_opened": 20, "topics_understood": 5, "session_completion": 30}',
  '{"activation_rate": 45, "goals_created_d1": 35, "topics_opened": 60, "topics_understood": 25, "session_completion": 65}',
  '{"activation_rate_delta": "+30pp", "goals_created_d1_delta": "+25pp", "topics_understood_delta": "+20pp"}',
  '{
    "summary": "Learning Loop — это фундамент платформы. Без него ни одна другая петля не работает. Главный риск: пользователь не понимает что делать первым. Onboarding Flow закрывает этот риск напрямую.",
    "key_actions": [
      "Запустить Onboarding Flow v1 с шаблонами целей",
      "Добавить guided entry для пустого состояния кабинета",
      "Замерить time-to-first-learning-value после запуска"
    ],
    "risks": [
      "AI-план может быть слишком общим — нужны seed-curricula по профессиям",
      "Первая сессия должна давать WOW-момент, иначе retention не случится"
    ]
  }',
  'medium', 'founder'
),

(
  'Loop 2. Growth Loop — обучение → evidence → компетенции',
  'product_loop',
  '2026-07-01', '2026-10-31',
  '[
    {"assumption": "Applied topic автоматически создаёт evidence entry в passport"},
    {"assumption": "Competency Map v1 запущена для PM/Operations"},
    {"assumption": "Пользователь видит, как обучение влияет на его профиль"},
    {"assumption": "Evidence flow занимает <2 минут"}
  ]',
  '{"topics_applied": 3, "evidence_created": 0, "competency_signals": 0, "passport_completeness": 30}',
  '{"topics_applied": 15, "evidence_created": 8, "competency_signals": 5, "passport_completeness": 60}',
  '{"evidence_per_user_delta": "+8", "competency_signals_delta": "+5", "passport_completeness_delta": "+30pp"}',
  '{
    "summary": "Growth Loop — это главный стратегический мост платформы. Именно он превращает обучение в подтверждённый профессиональный рост и двигает North Star метрику. Без него платформа остаётся полезной, но не превращается в инфраструктуру роста.",
    "key_actions": [
      "Реализовать связку: topic applied → evidence entry → competency update",
      "Запустить Competency Map v1 для PM/Operations",
      "Показывать пользователю как каждая тема влияет на его профиль"
    ],
    "risks": [
      "Evidence flow не должен быть обязательным (friction) — нужен auto-suggest",
      "Competency mapping требует качественного фреймворка компетенций"
    ]
  }',
  'medium', 'founder'
),

(
  'Loop 3. Retention Loop — ритм и возврат',
  'product_loop',
  '2026-06-15', '2026-09-30',
  '[
    {"assumption": "Email-напоминания для weekly check-in настроены"},
    {"assumption": "Streak-механика добавлена в UI"},
    {"assumption": "Check-in занимает <5 минут"},
    {"assumption": "AI-summary check-in реально полезен и ощущается как ценность"}
  ]',
  '{"weekly_checkin_rate": 5, "d7_retention": 20, "d30_retention": 8, "avg_sessions_per_week": 1.2}',
  '{"weekly_checkin_rate": 30, "d7_retention": 45, "d30_retention": 22, "avg_sessions_per_week": 2.8}',
  '{"checkin_rate_delta": "+25pp", "d7_retention_delta": "+25pp", "d30_retention_delta": "+14pp"}',
  '{
    "summary": "Retention Loop формирует привычку профессионального развития. Без регулярного возврата Learning Loop не накапливается. Ключевой инсайт: check-in — это не просто фича, а ритуал, который связывает пользователя с платформой.",
    "key_actions": [
      "Запустить email-напоминания: воскресенье вечером + при пропуске 3+ дней",
      "Добавить streak-счётчик и milestone визуализацию",
      "Усилить AI-summary check-in: выводить паттерны за несколько недель"
    ],
    "risks": [
      "Напоминания могут раздражать — нужен контроль частоты и easy unsubscribe",
      "Streak-механика не должна превращаться в anxiety-trigger"
    ]
  }',
  'low', 'founder'
),

(
  'Loop 4. Market Loop — видимость и карьерная ценность',
  'product_loop',
  '2026-10-01', '2027-03-31',
  '[
    {"assumption": "Growth Loop стабильно работает: есть evidence и competency signals"},
    {"assumption": "Passport completeness у целевой аудитории >70%"},
    {"assumption": "Пользователи понимают ценность opt-in видимости"},
    {"assumption": "Работодатели находят ценность в competency-based поиске"}
  ]',
  '{"optin_profiles": 0, "employer_searches": 0, "career_outcomes": 0}',
  '{"optin_profiles": 500, "employer_searches": 200, "career_outcomes": 50}',
  '{"optin_profiles_delta": "+500", "employer_value_created": "появляется"}',
  '{
    "summary": "Market Loop — это монетизация доверия, накопленного в первых трёх петлях. Он не должен запускаться раньше, чем платформа накопила достаточно evidence и verified growth. Guardrail: не запускать Talent Discovery до стабильного Growth Loop.",
    "key_actions": [
      "НЕ запускать до стабилизации Growth Loop",
      "Проектировать consent flow задолго до запуска",
      "Первые работодатели должны приходить как партнёры, не как клиенты"
    ],
    "risks": [
      "Преждевременный запуск подорвёт доверие пользователей",
      "Нужна чёткая explainability для любого fit score"
    ]
  }',
  'low', 'founder'
),

(
  'Риск: пустой экран и слабая активация',
  'risk_scenario',
  '2026-06-01', '2026-07-31',
  '[
    {"assumption": "Onboarding Flow НЕ запущен"},
    {"assumption": "Пользователь попадает на пустой Dashboard"},
    {"assumption": "Ценность продукта не раскрывается за первый сеанс"}
  ]',
  '{"activation_rate": 15, "goals_created_d1": 10, "churn_d3": 65}',
  '{"activation_rate": 8, "goals_created_d1": 5, "churn_d3": 80}',
  '{"activation_drop": "-7pp", "churn_increase": "+15pp"}',
  '{
    "summary": "Главный текущий риск платформы. Система уже умеет многое, но пользователь не всегда быстро понимает что делать первым. Каждые 10 секунд без понятного следующего шага увеличивают вероятность ухода.",
    "mitigation": "Onboarding Flow v1 — приоритет #1 текущего цикла. Guided entry + шаблоны целей + первая тема за первый сеанс.",
    "trigger": "Если activation rate не вырастет до 35%+ после запуска онбординга — пересмотреть guided entry flow"
  }',
  'high', 'founder'
),

(
  'Риск: галлюцинированные источники в материалах',
  'risk_scenario',
  '2026-06-01', '2026-08-31',
  '[
    {"assumption": "AI генерирует названия источников без верификации URL"},
    {"assumption": "Пользователь пытается найти источник и не находит"},
    {"assumption": "Доверие к AI-рекомендациям падает"}
  ]',
  '{"source_trust_score": 60, "material_click_rate": 15}',
  '{"source_trust_score": 30, "material_click_rate": 5}',
  '{"trust_drop": "-30 points", "click_rate_drop": "-10pp"}',
  '{
    "summary": "Provenance уже добавлен (trust_level, source_name, source_type). Это снизило риск. Но пока access_note — текстовая заметка, а не верифицированный URL. Следующий шаг: web_search для валидации источников.",
    "mitigation": "Подключить web_search к pipeline генерации материалов. Для каждого источника искать реальный URL. Не показывать ссылку без верифицированного домена.",
    "trigger": "Если пользователи начинают репортить невалидные ссылки — ускорить внедрение web_search validation"
  }',
  'medium', 'founder'
),

(
  'Метрики NOW: активация и качество обучения',
  'metrics_snapshot',
  '2026-06-01', '2026-07-31',
  '[{"context": "Текущий цикл: Onboarding + Memory Layer + Real URLs"}]',
  '{
    "activation_rate_target": "35% пользователей создают первую цель за 24ч",
    "time_to_first_value_target": "< 10 минут от регистрации до первой AI-сессии",
    "topics_understood_rate_target": "25% открытых тем доходят до статуса understood за 14 дней",
    "quiz_completion_target": "60% пользователей, открывших тему, проходят quiz",
    "checkin_rate_target": "20% активных пользователей делают check-in раз в неделю",
    "source_verified_url_target": "80% источников имеют верифицированный URL"
  }',
  '{}', '{}',
  '{
    "summary": "Метрики первого цикла сфокусированы на одном вопросе: пользователь быстро входит в ценность и остаётся в ритме обучения? Если да — можно двигаться к Growth Loop. Если нет — фиксировать где теряется.",
    "measurement_plan": [
      "Замерять activation rate еженедельно после запуска онбординга",
      "Логировать time-to-first-session для каждого нового пользователя",
      "Отслеживать воронку: цель создана → план получен → тема открыта → сессия завершена → quiz пройден"
    ]
  }',
  'high', 'founder'
);
