UPDATE exec_project SET is_test_data = true WHERE title LIKE 'ТЕСТ-CROSS:%';
UPDATE exec_task SET is_test_data = true WHERE title LIKE 'ТЕСТ-CROSS:%';
UPDATE exec_schedule_dependency SET is_test_data = true WHERE
  src_kind = 'task' AND src_id IN (SELECT id FROM exec_task WHERE title LIKE 'ТЕСТ-CROSS:%');
