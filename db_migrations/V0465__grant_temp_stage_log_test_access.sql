INSERT INTO exec_cabinet_access (email, access_role, is_active, note)
VALUES ('stage-log-test-temp@internal.local', 'head', true, 'Временный тестовый пользователь для проверки save_stage и журнала изменений расписания')
ON CONFLICT (email) DO UPDATE SET is_active = true, access_role = 'head';
