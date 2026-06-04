-- Создаём учебную цель
INSERT INTO t_p61016064_digital_innovation_i.learning_goals
  (user_id, title, description, status, ai_plan)
VALUES (
  1,
  'Внутренний контроль и аудит: автоматизация и AI',
  'Возглавляю подразделение внутреннего контроля и аудита в банке. Задача — вести проекты автоматизации процессов контроля и аудита, а также внедрение AI-инструментов в контрольные процедуры. Нужно войти в методологию, понять регуляторику, выявить процессы для автоматизации, освоить AI use cases, собрать roadmap и подготовиться к роли руководителя.',
  'active',
  '{
    "summary": "Программа входа в роль руководителя блока автоматизации внутреннего контроля и аудита. 6 этапов от предметной базы до запуска пилотов и управленческой упаковки. Результат — рабочий roadmap на 6–12 месяцев и первые пилоты в запуске.",
    "duration_weeks": 16,
    "phases": [
      {
        "phase": 1,
        "title": "Войти в предметную область",
        "duration_weeks": 2,
        "topics": [
          {"title": "Модель 3 линий защиты", "description": "Роль внутреннего контроля, аудита, комплаенса и риск-менеджмента", "subtopics": ["Внутренний контроль vs аудит vs комплаенс", "Риск-менеджмент и его роль", "Зона ответственности подразделения"]},
          {"title": "Цикл аудита и контрольные процедуры", "description": "Планирование, тестирование, отчёт, remediation", "subtopics": ["Планирование и выборка", "Тестирование контролей", "Наблюдения и рекомендации", "Контроль исполнения remediation"]},
          {"title": "Регуляторика и стандарты", "description": "IIA, COSO, COBIT, требования ЦБ для банков", "subtopics": ["IIA Standards", "COSO Framework", "COBIT", "Требования регулятора для банков"]}
        ]
      },
      {
        "phase": 2,
        "title": "Понять процессы подразделения",
        "duration_weeks": 2,
        "topics": [
          {"title": "Карта процессов as-is", "description": "Описание текущего состояния всех процессов блока", "subtopics": ["Планирование проверок", "Сбор данных и документов", "Анализ и тестирование", "Формирование отчёта", "Контроль remediation"]},
          {"title": "Выявление pain points", "description": "Ручной труд, узкие места, задержки, потери качества", "subtopics": ["Реестр болей по категориям", "Оценка частоты и критичности", "Стоимость ручных операций"]},
          {"title": "Stakeholder map", "description": "Карта стейкхолдеров: ИТ, ИБ, риск, бизнес, руководство", "subtopics": ["Интересы и влияние", "Ожидания от трансформации", "Риски и опасения по AI"]}
        ]
      },
      {
        "phase": 3,
        "title": "Данные и автоматизация без AI",
        "duration_weeks": 3,
        "topics": [
          {"title": "Карта данных для аудита", "description": "Источники, качество, доступность, чувствительность", "subtopics": ["Какие данные нужны аудитору", "Источники и владельцы", "Continuous controls / monitoring"]},
          {"title": "Rule-based автоматизация", "description": "Workflow, чеклисты, шаблоны, маршрутизация, дашборды", "subtopics": ["BPM и low-code инструменты", "RPA сценарии", "Remediation tracker", "Управленческие дашборды"]},
          {"title": "Приоритизация процессов", "description": "Критерии отбора кандидатов на автоматизацию", "subtopics": ["Классификация задач (рутина / аналитика / экспертиза)", "Priority matrix", "Shortlist quick wins"]}
        ]
      },
      {
        "phase": 4,
        "title": "AI use cases и governance",
        "duration_weeks": 3,
        "topics": [
          {"title": "AI use cases в контроле и аудите", "description": "Где AI уместен, где рискован", "subtopics": ["Поиск по документам и нормативке", "Черновики summary и наблюдений", "Классификация замечаний", "Выявление аномалий", "Анализ доказательств"]},
          {"title": "Где AI рискован", "description": "Ограничения LLM в контрольной функции", "subtopics": ["Финальные выводы без человека", "Sensitive data и банковская тайна", "Hallucinations и валидация", "Explainability требования"]},
          {"title": "AI governance framework", "description": "Рамка безопасного внедрения AI в банковском контуре", "subtopics": ["Модельные риски", "Human-in-the-loop", "Журналирование и аудитируемость", "Политика использования AI", "Разграничение доступа"]}
        ]
      },
      {
        "phase": 5,
        "title": "Roadmap и портфель инициатив",
        "duration_weeks": 3,
        "topics": [
          {"title": "Матрица инициатив", "description": "Автоматизация / AI-assist / Пока нет", "subtopics": ["Корзина A: обычная автоматизация", "Корзина B: AI-assist", "Корзина C: пока рано"]},
          {"title": "Pilot charters", "description": "Бизнес-кейсы для 2–3 пилотов", "subtopics": ["AI-поиск по документам", "Remediation tracker", "Черновики summary", "Data-driven monitoring"]},
          {"title": "Дорожная карта 6–12 месяцев", "description": "Этапы: quick wins → базовая автоматизация → AI-assist → масштабирование", "subtopics": ["Quick wins (1–2 мес)", "Базовая автоматизация (3–4 мес)", "AI-assist слой (5–8 мес)", "Масштабирование (9–12 мес)"]}
        ]
      },
      {
        "phase": 6,
        "title": "Выйти в роль руководителя",
        "duration_weeks": 3,
        "topics": [
          {"title": "Модель команды", "description": "Роли, структура, недостающие компетенции", "subtopics": ["Product / transformation lead", "Process analyst", "Data analyst", "AI specialist", "Audit/control SME"]},
          {"title": "Управленческий ритм", "description": "Еженедельный и ежемесячный контур управления", "subtopics": ["Еженедельный статус инициатив", "Ежемесячный steering", "KPI dashboard", "Operating cadence"]},
          {"title": "Первые 90 дней: план", "description": "30 / 60 / 90 дней руководителя", "subtopics": ["0–30: понять среду, людей, процессы", "31–60: приоритизировать и выбрать пилоты", "61–90: запустить пилоты и управленческую упаковку"]}
        ]
      }
    ],
    "key_skills": ["Методология внутреннего аудита", "Process mapping", "Data-driven audit", "AI governance", "Портфельное управление", "Stakeholder management", "Change management", "Rule-based автоматизация"],
    "resources_hint": "IIA Standards (iia.org.ru), COSO Framework, книга Internal Auditing (Sawyer), курсы по process mining, практические кейсы AI in audit от Big4"
  }'::jsonb
)
RETURNING id;
