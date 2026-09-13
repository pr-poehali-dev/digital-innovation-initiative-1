-- Пользователь явно просил: десять тестовых зависимостей (is_test_data=true)
-- должны быть не только помечены, но и архивированы/неактивны, чтобы
-- по умолчанию не участвовать в Ганте, CPM, карте зависимостей и агрегатах.
-- Физически не удаляются — история сохраняется, доступны через
-- include_test_data при явном запросе. Это точечная очистка данных
-- (не миграция схемы), выполняется как обычный UPDATE.
UPDATE exec_schedule_dependency
SET archived_at = now(), archived_by = 'cleanup_after_scenario_verification'
WHERE is_test_data = true AND archived_at IS NULL;
