-- Обновляем стратегический профиль: полный продуктовый тезис и пиллары
UPDATE t_p61016064_digital_innovation_i.admin_strategy_profiles
SET
  vision_text = 'Глобальная платформа раскрытия профессионального потенциала человека — система, которая помогает человеку понять свои сильные стороны, карту компетенций, потенциал и направление развития, подтверждать рост на практике и, при согласии, становиться видимым для рынка и работодателей.',

  mission_text = 'Помогать профессионалам понимать, развивать и подтверждать свой потенциал, а работодателям — находить подходящих специалистов по реальным компетенциям, динамике развития и доказанным профессиональным сигналам.',

  north_star_name = 'Professionals with Verified Growth',

  north_star_definition = 'Количество пользователей, которые: (1) получили подтверждённую карту компетенций, (2) улучшили хотя бы одну ключевую компетенцию через обучение и практику, (3) достигли карьерного или профессионального результата за 90 дней. Это не WAU и не зарегистрированные — это люди, у которых платформа реально изменила профессиональный профиль.',

  product_thesis = 'Мы строим Professional Operating System — профессиональную операционную систему человека.

Не просто LMS. Не просто job board. Не просто тестовую платформу.

Мы объединяем в единую opt-in экосистему:
• профиль и историю развития (Professional Passport)
• карту компетенций с gap-анализом (Competency Map)
• AI-guided обучение с проверкой понимания (Learning Engine)
• практическую работу и применение знаний (Work & Practice Layer)
• подтверждённые доказательства роста (Evidence & Verified Proof)
• видимость для рынка при согласии пользователя (Talent Discovery)

Главные петли платформы:
Loop 1. Learning Loop: Цель → AI-план → Тема → AI-объяснение → Сессия → Quiz → Прогресс
Loop 2. Growth Loop: Тема applied → Evidence → Компетенция растёт → Passport обновляется
Loop 3. Retention Loop: Check-in → Напоминание → Возврат → Следующий шаг → Привычка роста
Loop 4. Market Loop: Passport → Verified Growth → Digital CV / Talent Discovery → Карьерная ценность

Учебный кабинет — это не побочный раздел, а центральный двигатель платформы. Именно он производит главный актив: подтверждённый профессиональный рост.',

  quarter_goals_json = '[
    "Onboarding Flow v1: пользователь получает первый учебный результат за 10 минут",
    "AI Topic Learning Mode: Memory Layer — система запоминает пробелы и адаптирует следующий шаг",
    "Real URLs для источников: верифицированные ссылки вместо текстовых примечаний",
    "Applied → Evidence → Passport: замкнуть петлю Learning Loop в Growth Loop",
    "Competency Map v1 для профессии PM/Operations: домены, уровни, gap-анализ",
    "Email-напоминания и retention layer для ритма обучения"
  ]',

  priority_themes_json = '[
    "Activation: пользователь должен получить первую ценность за первые 10 минут",
    "Learning Quality: AI-обучение должно быть адаптивным, достоверным и контекстным",
    "Evidence Loop: обучение должно приводить к подтверждённому росту компетенций",
    "Professional Identity: цифровой профиль — образование, опыт, подтверждённые факты",
    "Competency Graph: карта компетенций с gap-анализом и рекомендациями роста",
    "Growth Navigator: персональный план, skill gaps, learning path, контроль прогресса"
  ]',

  strategic_pillars_json = '[
    {
      "id": "activation",
      "title": "Activation & Onboarding",
      "description": "Пользователь получает первый результат за 10 минут. Guided entry: цель → маршрут → первая тема → AI-обучение → ''ага, меня тут ведут''. Без пустого экрана.",
      "status": "now",
      "key_metric": "% пользователей, создавших первую цель за 24ч"
    },
    {
      "id": "learning",
      "title": "AI Guided Learning Engine",
      "description": "Учебный кабинет как AI Tutor: Planner (маршрут), Tutor (объяснение), Curator (материалы с provenance), Examiner (quiz), Coach (ритм и следующий шаг), Memory (адаптация под пробелы). Все 6 ролей должны работать.",
      "status": "active",
      "key_metric": "% тем, дошедших до статуса understood/applied за 14 дней"
    },
    {
      "id": "evidence",
      "title": "Evidence & Verified Growth",
      "description": "Applied topic → evidence → competency signal → passport. Это главный стратегический мост. Обучение должно превращаться в подтверждённый профессиональный рост, а не заканчиваться галочкой.",
      "status": "next",
      "key_metric": "Количество competency evidence, созданных из обучения"
    },
    {
      "id": "identity",
      "title": "Professional Identity & Passport",
      "description": "Цифровой профессиональный паспорт: образование, опыт, компетенции, evidence, карьерные цели. Публичная ссылка. Основа для всего market layer.",
      "status": "active",
      "key_metric": "Количество паспортов с полнотой >60%"
    },
    {
      "id": "competency",
      "title": "Competency Graph",
      "description": "Карта компетенций: домены → компетенции → уровни (novice/intermediate/advanced/expert). Gap-анализ vs целевая роль. Связь с обучением и evidence. Стартовая вертикаль: PM/Operations.",
      "status": "next",
      "key_metric": "Количество пользователей с картой компетенций (>5 компетенций)"
    },
    {
      "id": "discovery",
      "title": "Talent Discovery (opt-in)",
      "description": "При согласии пользователя: профиль виден работодателям по компетенциям, росту и потенциалу. Explainable fit score. Не рейтинг — контекстная релевантность. Только когда есть что показывать.",
      "status": "later",
      "key_metric": "Количество opt-in профилей"
    }
  ]',

  guardrails_json = '[
    {"title": "Consent-first", "description": "Публичность, показ работодателям, внешние данные — только по явному согласию пользователя."},
    {"title": "Explainability", "description": "Любая оценка объяснима: из каких сигналов она получена. Чёрного ящика нет."},
    {"title": "Evidence > Claims", "description": "Подтверждённые действия важнее самооценки. Рост должен быть доказан, а не задекларирован."},
    {"title": "Growth, not labeling", "description": "Платформа помогает расти, а не навешивает ярлык слабого специалиста."},
    {"title": "Human Dignity", "description": "Никаких дискриминационных или непрозрачных выводов об оценке человека."},
    {"title": "Closed Loop First", "description": "Не запускать market layer (Talent Discovery) до тех пор, пока learning → evidence → passport loop не замкнут и не стабилен."}
  ]',

  non_goals_json = '[
    "Не строим сразу для всех профессий — стартовая вертикаль: PM / Product / Operations",
    "Не делаем публичный рейтинг без явного согласия пользователя",
    "Не делаем чёрный ящик оценки — любой score должен быть explainable",
    "Не заменяем работодателю финальное решение о найме",
    "Не строим full-scale HRIS / ATS с первого этапа",
    "Не подключаем внешние чувствительные данные без строгого consent-flow",
    "Не запускаем Talent Discovery раньше, чем замкнута петля learning → evidence → passport",
    "Не добавляем heavy gamification без подтверждения данными"
  ]',

  updated_by = 'founder@trajectory',
  updated_at = now()

WHERE workspace_key = 'default';
