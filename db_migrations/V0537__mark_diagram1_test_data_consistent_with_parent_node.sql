-- Диаграмма id=1 принадлежит process_node id=2, который помечен
-- is_test_data=true ("[ТЕСТ smoke]"), но сама диаграмма не была помечена —
-- из-за этого overview.diagrams_by_variant считал её как "рабочую" (backend
-- фильтрует диаграммы по собственному is_test_data, не заглядывая в
-- родительский process_node). Приводим в соответствие с владельцем.
UPDATE exec_process_diagram SET is_test_data = true WHERE id = 1;