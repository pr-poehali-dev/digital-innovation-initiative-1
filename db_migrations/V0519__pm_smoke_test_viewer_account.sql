-- Временный тестовый аккаунт для smoke-теста прав доступа контура
-- «Процессное управление» (Итерация 1). Роль viewer — не должна иметь
-- прав на создание/изменение функций, узлов процессов и паспортов.
-- Деактивируется сразу после проверки в этой же миграционной сессии работы.

INSERT INTO users (email, password_hash, name)
SELECT 'viewer-pm-smoke-test@internal.local', '568f62906cf124e36658b1519d5bbbaf4151c47035103b6ee03153de957e5f2c', 'Тестовый наблюдатель (smoke-тест Процессного управления)'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'viewer-pm-smoke-test@internal.local');

INSERT INTO exec_cabinet_access (email, access_role, can_confirm, is_active, note, granted_by)
SELECT 'viewer-pm-smoke-test@internal.local', 'viewer', false, true,
       'Временный аккаунт для проверки запрета прав в разделе Процессное управление. Деактивировать после проверки.',
       'system_smoke_test'
WHERE NOT EXISTS (SELECT 1 FROM exec_cabinet_access WHERE email = 'viewer-pm-smoke-test@internal.local');

INSERT INTO sessions (id, user_id, expires_at)
SELECT 'pm-smoke-viewer-session-0001', u.id, now() + interval '30 minutes'
FROM users u WHERE u.email = 'viewer-pm-smoke-test@internal.local'
ON CONFLICT (id) DO UPDATE SET expires_at = now() + interval '30 minutes';
