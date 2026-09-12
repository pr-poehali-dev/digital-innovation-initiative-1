UPDATE exec_cabinet_access SET is_active = false, note = 'Деактивировано — временный тестовый пользователь, доступ отозван после проверки навигации' WHERE email = 'nav-test-temp@internal.local';
UPDATE sessions SET expires_at = now() WHERE user_id = 6;
