-- Помечаем API-сценарные объекты как тестовые (архивированы, но пусть будут явно помечены)
UPDATE exec_project SET is_test_data = true WHERE title = 'ТЕСТ-API: проект через штатный API';
UPDATE exec_task SET is_test_data = true WHERE title = 'ТЕСТ-API: задача';
UPDATE exec_result SET is_test_data = true WHERE title = 'ТЕСТ-API: результат';
UPDATE exec_effect SET is_test_data = true WHERE title = 'ТЕСТ-API: эффект';
UPDATE exec_link SET is_test_data = true WHERE src_kind='project' AND tgt_kind='result' AND note IS NULL AND archived_at IS NOT NULL;

-- Возвращаем подменённый payload_json к исходному состоянию (это был тест обнаружения подмены)
-- и явно помечаем снимок тестовым инцидентом в названии для прозрачности истории.
UPDATE exec_report_snapshot SET title = 'ТЕСТ-API: снимок (payload намеренно испорчен для проверки integrity_ok)'
WHERE id = 3;

-- Отзываем временную сессию сценарного теста
UPDATE admin_sessions SET revoked_at = now()
WHERE actor_email = 'scenario-test@internal' AND revoked_at IS NULL;
