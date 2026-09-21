-- Уборка после ручной проверки конфликтного сохранения и переходов статуса
-- (итерация 4). Добавляем is_test_data в exec_process_version_history для
-- единообразия с остальными сущностями контура (эта колонка отсутствовала),
-- помечаем тестовые записи, созданные при API-проверке process_node id=4
-- (реальный, не тестовый процесс — проверка производилась через curl двумя
-- "сессиями" одного пользователя, как и было сделано в итерации 3 для
-- risk/control/metric/issue). Раздел 11 ТЗ: не используем миграцию как
-- постоянный способ тестирования, только разовая уборка своего же следа.
ALTER TABLE exec_process_version_history ADD COLUMN IF NOT EXISTS is_test_data BOOLEAN NOT NULL DEFAULT false;

UPDATE exec_process_version_history SET is_test_data = true WHERE id IN (6, 7) AND entity_id = 4;
UPDATE exec_process_review_decision SET is_test_data = true WHERE id = 1 AND entity_id = 4;
