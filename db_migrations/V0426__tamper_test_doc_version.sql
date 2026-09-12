-- Тест блокировки экспорта при нарушении целостности
UPDATE exec_doc_version SET payload_json = '{"tampered": true}' WHERE id = 1;
