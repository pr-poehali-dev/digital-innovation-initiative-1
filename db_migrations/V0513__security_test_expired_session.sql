-- Создаём заведомо истёкшую тестовую сессию для проверки, что backend
-- корректно отклоняет доступ по просроченной сессии (не только по
-- несуществующей).

INSERT INTO sessions (id, user_id, expires_at)
SELECT 'sec-test-viewer-expired-session-0001', u.id, now() - interval '1 hour'
FROM users u WHERE u.email = 'viewer-security-test@internal.local'
ON CONFLICT (id) DO UPDATE SET expires_at = now() - interval '1 hour';
