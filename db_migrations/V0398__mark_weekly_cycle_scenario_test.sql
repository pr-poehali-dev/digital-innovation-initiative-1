-- Помечаем весь синтетический набор проверки рабочего цикла как тестовый
UPDATE exec_task SET is_test_data = true WHERE title LIKE 'ТЕСТ-WEEKLY:%';
UPDATE exec_decision_instance SET is_test_data = true WHERE question LIKE 'ТЕСТ-WEEKLY:%';
UPDATE exec_reminder SET is_test_data = true WHERE title LIKE 'ТЕСТ-WEEKLY:%';
UPDATE exec_weekly_plan SET is_test_data = true WHERE author = 'weekly-cycle-test@internal';
UPDATE exec_weekly_summary_snapshot SET is_test_data = true
    WHERE weekly_plan_id IN (SELECT id FROM exec_weekly_plan WHERE author = 'weekly-cycle-test@internal');
