-- Помечаем весь синтетический набор дашборд-сценария
UPDATE exec_project SET is_test_data = true WHERE title = 'ТЕСТ-DASH: проект дашборда';
UPDATE exec_task SET is_test_data = true WHERE title LIKE 'ТЕСТ-DASH:%';

-- Снимки уже созданы с is_test_data=true через API (проверено),
-- но подтверждаем явно на случай расхождения
UPDATE exec_report_snapshot SET is_test_data = true WHERE version_group = 'ТЕСТ-DASH_weekly';

-- Архивируем тестовый проект и задачи, чтобы не засорять активный портфель
UPDATE exec_task SET archived_at = now(), archived_by = 'dashboard-test@internal'
WHERE title LIKE 'ТЕСТ-DASH:%' AND archived_at IS NULL;
UPDATE exec_project SET archived_at = now(), archived_by = 'dashboard-test@internal'
WHERE title = 'ТЕСТ-DASH: проект дашборда' AND archived_at IS NULL;

-- Отзываем временную сессию сценарного теста
UPDATE admin_sessions SET revoked_at = now()
WHERE actor_email = 'dashboard-test@internal' AND revoked_at IS NULL;
