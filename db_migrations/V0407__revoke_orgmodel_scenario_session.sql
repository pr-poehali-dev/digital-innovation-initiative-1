-- Отзываем временную сессию проверки сценария организационной модели.
UPDATE admin_sessions SET revoked_at = now() WHERE actor_email = 'orgmodel-verify-test-2@internal';
