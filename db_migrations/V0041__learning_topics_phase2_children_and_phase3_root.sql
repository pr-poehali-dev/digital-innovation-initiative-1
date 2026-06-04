-- Этап 2 — дочерние (parent_id=5)
INSERT INTO t_p61016064_digital_innovation_i.learning_topics (goal_id, parent_id, title, description, order_index, status) VALUES
(1, 5, 'Карта процессов as-is', 'Описание всех процессов блока: планирование → сбор данных → анализ → отчёт → remediation', 11, 'not_started'),
(1, 5, 'Реестр pain points', 'Ручной труд, узкие места, задержки, потери качества — оценка частоты и стоимости', 12, 'not_started'),
(1, 5, 'Stakeholder map', 'ИТ, ИБ, риск, бизнес, руководство — интересы, влияние, ожидания, риски по AI', 13, 'not_started');

-- Этап 3
INSERT INTO t_p61016064_digital_innovation_i.learning_topics (goal_id, parent_id, title, description, order_index, status) VALUES
(1, NULL, 'Этап 3: Данные и автоматизация без AI', '3 недели', 20, 'not_started');
