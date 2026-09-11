ALTER TABLE exec_report_snapshot ADD COLUMN IF NOT EXISTS is_test_data BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE exec_report_snapshot ADD COLUMN IF NOT EXISTS payload_sha256 VARCHAR(64) NULL;

-- Также добавляем is_test_data для новых сущностей портфеля, чтобы фильтровать
-- синтетические/проверочные записи единым образом (как уже принято в exec_initiative).
ALTER TABLE exec_project ADD COLUMN IF NOT EXISTS is_test_data BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE exec_task ADD COLUMN IF NOT EXISTS is_test_data BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE exec_result ADD COLUMN IF NOT EXISTS is_test_data BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE exec_effect ADD COLUMN IF NOT EXISTS is_test_data BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE exec_link ADD COLUMN IF NOT EXISTS is_test_data BOOLEAN NOT NULL DEFAULT false;

-- Помечаем уже существующие тестовые/проверочные записи
UPDATE exec_report_snapshot SET is_test_data = true WHERE title LIKE 'ТЕСТ%';
UPDATE exec_project SET is_test_data = true WHERE title LIKE 'ТЕСТ%';
UPDATE exec_task SET is_test_data = true WHERE title LIKE 'ТЕСТ%';
UPDATE exec_result SET is_test_data = true WHERE title LIKE 'ТЕСТ%';
UPDATE exec_effect SET is_test_data = true WHERE title LIKE 'ТЕСТ%';
UPDATE exec_link SET is_test_data = true WHERE note LIKE '%сценарн%';
