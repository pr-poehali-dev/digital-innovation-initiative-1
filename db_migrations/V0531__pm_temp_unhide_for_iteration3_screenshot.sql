-- Временно снимаем флаг is_test_data с пилотного процесса для визуальной
-- проверки редактора схем итерации 3. Будет возвращено сразу после проверки.
UPDATE exec_process_node SET is_test_data = false WHERE id = 2;
