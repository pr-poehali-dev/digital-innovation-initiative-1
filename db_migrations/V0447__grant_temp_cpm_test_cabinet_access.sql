INSERT INTO exec_cabinet_access (email, access_role, is_active, note)
VALUES ('cpm-test-temp@internal.local', 'head', true, 'Временный тестовый пользователь для проверки карты зависимостей и критического пути — доступ будет отозван сразу после проверки')
ON CONFLICT (email) DO UPDATE SET is_active = true, access_role = 'head';
