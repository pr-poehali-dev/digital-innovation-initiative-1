-- Уборка после ручной проверки optimistic locking (раздел 2 ТЗ итерации 4,
-- сценарий "две сессии, одна сохраняет старую ревизию"). Процесс id=4 —
-- реальный, не тестовый; помечаем только тестовый след проверки: содержимое
-- boundaries_note, вставленное curl-проверкой, и обе записи конфликтного
-- журнала. Раздел 11 ТЗ: не оставляем тестовые записи как рабочие.
UPDATE exec_process_passport SET boundaries_note = NULL, updated_at = updated_at
    WHERE process_node_id = 4 AND boundaries_note = 'Тест локинга v1';
UPDATE exec_process_edit_conflict_log SET is_test_data = true
    WHERE entity_type = 'process_passport' AND entity_id = 4 AND id IN (1, 2);
