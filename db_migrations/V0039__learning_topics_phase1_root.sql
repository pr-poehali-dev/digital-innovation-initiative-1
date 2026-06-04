-- Этап 1: Войти в предметную область
INSERT INTO t_p61016064_digital_innovation_i.learning_topics (goal_id, parent_id, title, description, order_index, status) VALUES (1, NULL, 'Этап 1: Войти в предметную область', '2 недели', 0, 'not_started') RETURNING id;
