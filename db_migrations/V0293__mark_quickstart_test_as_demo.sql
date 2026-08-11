UPDATE exec_initiative SET is_test_data = true WHERE id = 3 AND title = 'Проверка быстрого старта';
UPDATE exec_milestone SET is_test_data = true WHERE initiative_id = 3;
