-- Этап 3 — дочерние (parent_id=9)
INSERT INTO t_p61016064_digital_innovation_i.learning_topics (goal_id, parent_id, title, description, order_index, status) VALUES
(1, 9, 'Карта данных для аудита', 'Источники, владельцы, качество, доступность, чувствительность. Continuous controls/monitoring', 21, 'not_started'),
(1, 9, 'Rule-based автоматизация', 'Workflow, чеклисты, шаблоны, BPM, RPA, remediation tracker, дашборды', 22, 'not_started'),
(1, 9, 'Приоритизация процессов для автоматизации', 'Критерии отбора: рутина/аналитика/экспертиза. Priority matrix. Shortlist quick wins', 23, 'not_started');

-- Этап 4
INSERT INTO t_p61016064_digital_innovation_i.learning_topics (goal_id, parent_id, title, description, order_index, status) VALUES
(1, NULL, 'Этап 4: AI use cases и governance', '3 недели', 30, 'not_started');
