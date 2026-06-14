ALTER TABLE t_p61016064_digital_innovation_i.projects
  ADD COLUMN IF NOT EXISTS ai_stage varchar(40),
  ADD COLUMN IF NOT EXISTS ai_run_started_at timestamp,
  ADD COLUMN IF NOT EXISTS ai_run_updated_at timestamp;