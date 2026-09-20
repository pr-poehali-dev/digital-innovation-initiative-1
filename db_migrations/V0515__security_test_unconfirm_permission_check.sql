-- Кратковременная реактивация тестового аккаунта и валидной сессии —
-- ТОЛЬКО для проверки "unconfirm_stage доступен лишь уполномоченному
-- пользователю". Будет снова деактивирован сразу после теста.
UPDATE exec_cabinet_access SET is_active = true WHERE email = 'viewer-security-test@internal.local';

INSERT INTO sessions (id, user_id, expires_at)
SELECT 'sec-test-unconfirm-check-0001', u.id, now() + interval '10 minutes'
FROM users u WHERE u.email = 'viewer-security-test@internal.local'
ON CONFLICT (id) DO UPDATE SET expires_at = now() + interval '10 minutes';
