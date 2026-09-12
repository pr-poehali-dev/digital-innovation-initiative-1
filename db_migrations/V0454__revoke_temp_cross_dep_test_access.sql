UPDATE exec_cabinet_access SET is_active = false, note = 'Деактивировано — временный тестовый пользователь для проверки межпроектных зависимостей, доступ отозван после проверки'
WHERE email = 'cross-dep-test-temp@internal.local';
UPDATE sessions SET expires_at = now() WHERE user_id = (SELECT id FROM users WHERE email = 'cross-dep-test-temp@internal.local');
