-- Помечаем smoke-тестовые записи контура «Процессное управление» как
-- технические (is_test_data=true) — они скрыты из рабочих счётчиков
-- overview/functions/process_tree (backend уже фильтрует is_test_data=false),
-- но остаются в БД для истории аудита. Деактивируем тестового viewer-пользователя.

UPDATE exec_function SET is_test_data = true WHERE title LIKE '%[ТЕСТ smoke]%';
UPDATE exec_process_node SET is_test_data = true WHERE name LIKE '%[ТЕСТ smoke]%';

UPDATE exec_cabinet_access SET is_active = false WHERE email = 'viewer-pm-smoke-test@internal.local';
UPDATE sessions SET expires_at = now() - interval '1 day' WHERE id = 'pm-smoke-viewer-session-0001';
