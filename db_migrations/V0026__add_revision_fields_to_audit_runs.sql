ALTER TABLE t_p61016064_digital_innovation_i.audit_runs
  ADD COLUMN IF NOT EXISTS revision_plan_json TEXT,
  ADD COLUMN IF NOT EXISTS revision_run_id    INTEGER,
  ADD COLUMN IF NOT EXISTS revision_status    VARCHAR(32) DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS reaudit_result_json TEXT;
