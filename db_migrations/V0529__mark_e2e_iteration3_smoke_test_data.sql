-- Пометка данных, созданных сквозным E2E-тестом итерации 3 (раздел 13 ТЗ:
-- AS-IS -> проблема -> риск -> контроль -> показатель -> TO-BE -> сравнение
-- -> улучшение -> связь с инициативой), выполненным на выделенном smoke-
-- процессе (exec_process_node.id = 2, уже помечен is_test_data). Помечаем
-- аналогично, чтобы данные не отображались в обычных списках, но остались
-- как доказательство прохождения сценария.
UPDATE exec_process_issue SET is_test_data = true WHERE id = 3;
UPDATE exec_process_risk SET is_test_data = true WHERE id = 2;
UPDATE exec_process_control SET is_test_data = true WHERE id = 2;
UPDATE exec_process_metric SET is_test_data = true WHERE id = 2;
UPDATE exec_process_improvement SET is_test_data = true WHERE id = 2;
UPDATE exec_process_diagram SET is_test_data = true, model_status = 'archived',
    title = '[ТЕСТ E2E итерация 3] ' || COALESCE(title, '')
    WHERE id = 5;
UPDATE exec_process_diagram_node SET is_test_data = true WHERE diagram_id = 5;
UPDATE exec_process_diagram_edge SET is_test_data = true WHERE diagram_id = 5;
UPDATE exec_process_diagram_lane SET is_test_data = true WHERE diagram_id = 5;
