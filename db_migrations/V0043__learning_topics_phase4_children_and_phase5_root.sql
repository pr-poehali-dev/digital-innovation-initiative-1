-- Этап 4 — дочерние (parent_id=13)
INSERT INTO t_p61016064_digital_innovation_i.learning_topics (goal_id, parent_id, title, description, order_index, status) VALUES
(1, 13, 'AI use cases: где уместен', 'Поиск по документам, черновики summary, классификация замечаний, выявление аномалий, анализ доказательств', 31, 'not_started'),
(1, 13, 'AI use cases: где рискован', 'Финальные выводы без человека, sensitive data, hallucinations, отсутствие explainability', 32, 'not_started'),
(1, 13, 'AI governance framework', 'Human-in-the-loop, журналирование, политика AI, разграничение доступа, аудитируемость', 33, 'not_started');

-- Этап 5
INSERT INTO t_p61016064_digital_innovation_i.learning_topics (goal_id, parent_id, title, description, order_index, status) VALUES
(1, NULL, 'Этап 5: Roadmap и портфель инициатив', '3 недели', 40, 'not_started');
