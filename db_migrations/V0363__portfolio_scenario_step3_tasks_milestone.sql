INSERT INTO exec_task (title, project_id, status, priority, due_at, created_by)
VALUES
  ('ТЕСТ: синтетическая задача 1', 1, 'not_started', 'normal', CURRENT_DATE - 2, 'scenario_test'),
  ('ТЕСТ: синтетическая задача 2', 1, 'in_progress', 'high', CURRENT_DATE + 5, 'scenario_test');

INSERT INTO exec_milestone (title, initiative_id, project_id, milestone_type, plan_date, status, created_by)
VALUES ('ТЕСТ: контрольная точка', 5, 1, 'result', CURRENT_DATE + 10, 'not_started', 'scenario_test');
