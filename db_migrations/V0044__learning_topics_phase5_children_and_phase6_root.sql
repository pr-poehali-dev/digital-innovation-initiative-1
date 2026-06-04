-- Этап 5 — дочерние (parent_id=17)
INSERT INTO t_p61016064_digital_innovation_i.learning_topics (goal_id, parent_id, title, description, order_index, status) VALUES
(1, 17, 'Матрица инициатив: Авто / AI-assist / Пока нет', 'Корзина A — обычная автоматизация. Корзина B — AI-assist. Корзина C — пока рискованно', 41, 'not_started'),
(1, 17, 'Pilot charters: бизнес-кейсы пилотов', 'AI-поиск по документам, Remediation tracker, Черновики summary, Data-driven monitoring', 42, 'not_started'),
(1, 17, 'Дорожная карта 6–12 месяцев', 'Quick wins → базовая автоматизация → AI-assist слой → масштабирование', 43, 'not_started');

-- Этап 6
INSERT INTO t_p61016064_digital_innovation_i.learning_topics (goal_id, parent_id, title, description, order_index, status) VALUES
(1, NULL, 'Этап 6: Выйти в роль руководителя', '3 недели', 50, 'not_started');
