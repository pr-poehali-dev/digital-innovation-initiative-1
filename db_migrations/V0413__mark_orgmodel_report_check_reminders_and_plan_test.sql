UPDATE exec_reminder SET is_test_data = true WHERE title LIKE 'ТЕСТ-ORGMODEL:%';
UPDATE exec_weekly_plan SET is_test_data = true WHERE author = 'orgmodel-report-check@internal';
