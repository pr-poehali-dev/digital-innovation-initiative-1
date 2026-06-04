-- Этап 1 — дочерние темы (parent_id=1)
INSERT INTO t_p61016064_digital_innovation_i.learning_topics (goal_id, parent_id, title, description, order_index, status) VALUES
(1, 1, 'Модель 3 линий защиты', 'Внутренний контроль vs аудит vs комплаенс vs риск-менеджмент', 1, 'not_started'),
(1, 1, 'Цикл аудита и контрольные процедуры', 'Планирование, выборка, тестирование, отчёт, remediation', 2, 'not_started'),
(1, 1, 'Регуляторика и стандарты (IIA, COSO, COBIT)', 'Международные стандарты и требования ЦБ для банков', 3, 'not_started');

-- Этап 2
INSERT INTO t_p61016064_digital_innovation_i.learning_topics (goal_id, parent_id, title, description, order_index, status) VALUES
(1, NULL, 'Этап 2: Понять процессы подразделения', '2 недели', 10, 'not_started');
