UPDATE exec_project SET is_test_data = true WHERE title LIKE 'ТЕСТ-STAGELOG:%';
UPDATE exec_schedule_baseline SET is_test_data = true WHERE title = 'Baseline project — версия 1' AND scope_id = 21;
