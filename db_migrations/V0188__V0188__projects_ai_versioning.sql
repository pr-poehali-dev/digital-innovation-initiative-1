ALTER TABLE t_p61016064_digital_innovation_i.projects
  ADD COLUMN IF NOT EXISTS content_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS ai_analyzed_version integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ai_status varchar(20) NOT NULL DEFAULT 'idle',
  ADD COLUMN IF NOT EXISTS ai_last_analysis_at timestamp,
  ADD COLUMN IF NOT EXISTS ai_last_result_json text,
  ADD COLUMN IF NOT EXISTS ai_last_error text;

-- Проект 5 уже наполнен — ставим content_version выше нуля чтобы автозапуск сработал
UPDATE t_p61016064_digital_innovation_i.projects SET content_version = 10 WHERE id = 5;