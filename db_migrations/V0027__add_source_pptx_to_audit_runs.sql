ALTER TABLE t_p61016064_digital_innovation_i.audit_runs
  ADD COLUMN IF NOT EXISTS source_pptx_s3_key VARCHAR(512) NULL,
  ADD COLUMN IF NOT EXISTS source_filename VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS source_size_bytes INTEGER NULL;