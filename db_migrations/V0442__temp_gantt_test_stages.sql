UPDATE exec_project SET is_test_data = true WHERE id = 15;

INSERT INTO exec_project_stage (project_id, title, sort_order, status, plan_start, plan_end, fact_start, fact_end)
VALUES
  (15, 'Этап 1: Анализ требований', 10, 'done', '2026-09-01', '2026-09-20', '2026-09-01', '2026-09-22'),
  (15, 'Этап 2: Разработка', 20, 'in_progress', '2026-09-21', '2026-11-10', '2026-09-23', NULL),
  (15, 'Этап 3: Внедрение', 30, 'not_started', '2026-11-11', '2026-12-15', NULL, NULL);
