-- Временный тестовый аккаунт для smoke-теста прав доступа редактора схем
-- (Итерация 2). Роль viewer не должна иметь прав на изменение диаграмм.
-- Деактивируется сразу после проверки.

INSERT INTO users (email, password_hash, name)
SELECT 'viewer-diagram-smoke@internal.local', '568f62906cf124e36658b1519d5bbbaf4151c47035103b6ee03153de957e5f2c', 'Тестовый наблюдатель (smoke-тест редактора схем)'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'viewer-diagram-smoke@internal.local');

INSERT INTO exec_cabinet_access (email, access_role, can_confirm, is_active, note, granted_by)
SELECT 'viewer-diagram-smoke@internal.local', 'viewer', false, true,
       'Временный аккаунт для проверки прав редактора схем. Деактивировать после проверки.',
       'system_smoke_test'
WHERE NOT EXISTS (SELECT 1 FROM exec_cabinet_access WHERE email = 'viewer-diagram-smoke@internal.local');

INSERT INTO sessions (id, user_id, expires_at)
SELECT 'pm-diagram-smoke-session-0001', u.id, now() + interval '20 minutes'
FROM users u WHERE u.email = 'viewer-diagram-smoke@internal.local'
ON CONFLICT (id) DO UPDATE SET expires_at = now() + interval '20 minutes';
