-- Помечаем синтетические записи проверки идемпотентности/уникальности как тестовые
-- (используем стандартный флаг is_test_data, как и в остальных сценариях
-- проверки рабочего цикла).
UPDATE exec_reminder SET is_test_data = true WHERE title LIKE 'ТЕСТ-ORGMODEL:%';
UPDATE exec_weekly_plan SET is_test_data = true WHERE author = 'orgmodel-verify-test@internal';

-- Отзываем временную сессию проверки.
UPDATE admin_sessions SET revoked_at = now() WHERE actor_email = 'orgmodel-verify-test@internal';
