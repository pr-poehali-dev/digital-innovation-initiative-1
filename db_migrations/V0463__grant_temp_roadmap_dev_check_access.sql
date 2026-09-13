INSERT INTO exec_cabinet_access (email, access_role, is_active, note)
VALUES ('roadmap-dev-check-temp@internal.local', 'head', true, 'Временный тестовый пользователь для проверки режима отклонений на roadmap')
ON CONFLICT (email) DO UPDATE SET is_active = true, access_role = 'head';
