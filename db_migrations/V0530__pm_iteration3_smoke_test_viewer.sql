-- Временный тестовый аккаунт для smoke-теста прав доступа итерации 3
-- (риски, контроли, показатели, проблемы, улучшения, TO-BE). Роль viewer
-- не должна иметь прав на запись. Деактивируется сразу после проверки.

INSERT INTO exec_cabinet_access (email, access_role, can_confirm, is_active, note, granted_by)
SELECT 'viewer-diagram-smoke@internal.local', 'viewer', false, true,
       'Повторная активация для smoke-теста прав итерации 3. Деактивировать после проверки.',
       'system_smoke_test'
ON CONFLICT (email) DO UPDATE SET is_active = true;

UPDATE sessions SET expires_at = now() + interval '20 minutes' WHERE id = 'pm-diagram-smoke-session-0001';
