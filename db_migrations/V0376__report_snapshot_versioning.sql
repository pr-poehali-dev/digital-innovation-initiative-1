ALTER TABLE exec_report_snapshot ADD COLUMN IF NOT EXISTS version_group VARCHAR(120) NULL;
ALTER TABLE exec_report_snapshot ADD COLUMN IF NOT EXISTS version_number INTEGER NOT NULL DEFAULT 1;
ALTER TABLE exec_report_snapshot ADD COLUMN IF NOT EXISTS params_json TEXT NULL;
COMMENT ON COLUMN exec_report_snapshot.version_group IS 'Например: weekly_2026-W37 — группа версий одного отчётного периода';
COMMENT ON COLUMN exec_report_snapshot.version_number IS 'Инкрементируется при повторной публикации того же version_group';
COMMENT ON COLUMN exec_report_snapshot.params_json IS 'Параметры формирования: период, включённые проекты, состав разделов';
