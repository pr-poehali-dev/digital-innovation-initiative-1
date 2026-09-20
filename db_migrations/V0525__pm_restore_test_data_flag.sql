-- Возвращаем флаг is_test_data обратно после визуальной проверки скриншотом.
UPDATE exec_process_node SET is_test_data = true WHERE id IN (1, 2);
