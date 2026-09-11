-- Помечаем весь синтетический ресурсно-бюджетный набор
UPDATE exec_project SET is_test_data = true WHERE title = 'ТЕСТ-RES: проект с бюджетом';
UPDATE exec_initiative SET is_test_data = true WHERE id = 5;
UPDATE exec_resource_assignment SET is_test_data = true WHERE project_id = 4;
UPDATE exec_budget_version SET is_test_data = true WHERE project_id = 4;
UPDATE exec_financial_actual SET is_test_data = true WHERE project_id = 4;
UPDATE exec_financial_commitment SET is_test_data = true WHERE project_id = 4;
UPDATE exec_financial_snapshot SET is_test_data = true WHERE project_id = 4;

-- Архивируем тестовые назначения и проект
UPDATE exec_resource_assignment SET archived_at = now(), archived_by = 'resources-test@internal'
WHERE project_id = 4 AND archived_at IS NULL;
UPDATE exec_project SET archived_at = now(), archived_by = 'resources-test@internal'
WHERE title = 'ТЕСТ-RES: проект с бюджетом' AND archived_at IS NULL;

-- Отзываем временную сессию
UPDATE admin_sessions SET revoked_at = now()
WHERE actor_email = 'resources-test@internal' AND revoked_at IS NULL;
