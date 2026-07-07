-- Smoke-test: изолированный тестовый пользователь + проект для проверки dept-functions extract/confirm
INSERT INTO t_p61016064_digital_innovation_i.users (email, password_hash, name)
VALUES ('smoketest_dept_functions@internal.test', 'no_login_test_user', 'Smoke Test User')
ON CONFLICT (email) DO NOTHING;

INSERT INTO t_p61016064_digital_innovation_i.sessions (id, user_id, expires_at)
SELECT 'smoketest_dept_functions_session_000000000000000000000000000001', id, NOW() + INTERVAL '1 day'
FROM t_p61016064_digital_innovation_i.users WHERE email = 'smoketest_dept_functions@internal.test'
ON CONFLICT (id) DO UPDATE SET expires_at = NOW() + INTERVAL '1 day';

INSERT INTO t_p61016064_digital_innovation_i.projects (title, description, owner_id, workspace_mode)
SELECT 'SMOKETEST dept-functions', 'Изолированный проект для smoke-теста импорта функций подразделения', id, 'polygon'
FROM t_p61016064_digital_innovation_i.users WHERE email = 'smoketest_dept_functions@internal.test';
