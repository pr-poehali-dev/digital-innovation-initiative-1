UPDATE exec_project SET is_test_data = true WHERE title LIKE 'ТЕСТ-SCHED:%';
UPDATE exec_task SET is_test_data = true WHERE title LIKE 'ТЕСТ-SCHED:%';
UPDATE exec_milestone SET is_test_data = true WHERE title LIKE 'ТЕСТ-SCHED:%';
UPDATE exec_initiative SET is_test_data = true, status = 'closed' WHERE title LIKE 'ТЕСТ-SCHED:%';
UPDATE exec_schedule_baseline SET is_test_data = true WHERE title IN ('Baseline project — версия 1', 'Baseline после пересмотра')
  AND scope_id = 20;
