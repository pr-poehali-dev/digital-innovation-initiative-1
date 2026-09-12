-- Архивируем тестовую задачу сценария рабочего цикла
UPDATE exec_task SET archived_at = now(), archived_by = 'weekly-cycle-test@internal'
WHERE title LIKE 'ТЕСТ-WEEKLY:%' AND archived_at IS NULL;

-- Отзываем временную сессию
UPDATE admin_sessions SET revoked_at = now()
WHERE actor_email = 'weekly-cycle-test@internal' AND revoked_at IS NULL;
