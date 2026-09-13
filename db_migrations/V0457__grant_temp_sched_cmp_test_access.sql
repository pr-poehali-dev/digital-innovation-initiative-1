INSERT INTO exec_cabinet_access (email, access_role, is_active, note)
VALUES ('sched-cmp-test-temp@internal.local', 'head', true, 'Временный тестовый пользователь для проверки сравнения расписаний (baseline/план/прогноз/факт)')
ON CONFLICT (email) DO UPDATE SET is_active = true, access_role = 'head';
