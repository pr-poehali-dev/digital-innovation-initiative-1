-- Тестовый пользователь для сквозной проверки ролевой защиты скачивания
-- документов (роль viewer, can_confirm=false). Используется одноразово для
-- проверки безопасности перед загрузкой реальных конфиденциальных документов.
-- Помечен явно как временный тестовый аккаунт в поле note.

INSERT INTO users (email, password_hash, name)
SELECT 'viewer-security-test@internal.local', '568f62906cf124e36658b1519d5bbbaf4151c47035103b6ee03153de957e5f2c', 'Тестовый наблюдатель (проверка безопасности)'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'viewer-security-test@internal.local');

INSERT INTO exec_cabinet_access (email, access_role, can_confirm, is_active, note, granted_by)
SELECT 'viewer-security-test@internal.local', 'viewer', false, true,
       'Временный аккаунт для сквозной проверки ролевой защиты скачивания документов (Этап 1 мастера процессной модели). Деактивировать после проверки.',
       'system_security_test'
WHERE NOT EXISTS (SELECT 1 FROM exec_cabinet_access WHERE email = 'viewer-security-test@internal.local');

-- Создаём валидную сессию сроком на 1 час для теста.
INSERT INTO sessions (id, user_id, expires_at)
SELECT 'sec-test-viewer-session-2026-09-20-0001', u.id, now() + interval '1 hour'
FROM users u WHERE u.email = 'viewer-security-test@internal.local'
ON CONFLICT (id) DO UPDATE SET expires_at = now() + interval '1 hour';
