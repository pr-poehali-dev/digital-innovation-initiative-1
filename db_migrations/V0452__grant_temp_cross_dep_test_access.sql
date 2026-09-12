INSERT INTO exec_cabinet_access (email, access_role, is_active, note)
VALUES ('cross-dep-test-temp@internal.local', 'head', true, 'Временный тестовый пользователь для проверки индикатора межпроектной зависимости на дорожной карте')
ON CONFLICT (email) DO UPDATE SET is_active = true, access_role = 'head';
