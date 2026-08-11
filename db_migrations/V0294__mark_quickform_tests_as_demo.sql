UPDATE exec_issue SET is_test_data = true WHERE id IN (5,6) AND title LIKE 'Проверка%';
UPDATE exec_risk SET is_test_data = true WHERE id = 3 AND description LIKE 'Проверка%';
