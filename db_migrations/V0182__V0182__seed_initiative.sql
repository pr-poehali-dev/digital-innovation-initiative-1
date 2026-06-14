-- Инициатива для проекта 5
INSERT INTO t_p61016064_digital_innovation_i.wb_initiatives
  (case_id, user_id, title, description, owner_name, priority, impact_score, effort_score, data_readiness, tech_readiness, regulatory_risk, ai_readiness, status, next_step)
VALUES (
  5, 1,
  'Цифровой реестр замечаний и AI-assisted triage',
  'Создать единое пространство для регистрации, классификации, маршрутизации и контроля замечаний/отклонений с AI-помощником для первичного анализа. Первая фаза: реестр + единая карточка + workflow. Вторая фаза: AI-суммаризация и классификация.',
  'Алексей',
  'high', 4, 3,
  'medium', 'medium', 'medium', 'medium',
  'preparation',
  'Описать целевой процесс to-be и определить минимальный набор полей единой карточки замечания. Согласовать с ИБ подход к AI-обработке данных.'
);
