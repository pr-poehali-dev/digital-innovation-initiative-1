ALTER TABLE t_p61016064_digital_innovation_i.wb_initiatives
  ADD COLUMN IF NOT EXISTS hypothesis_id INTEGER NULL,
  ADD COLUMN IF NOT EXISTS pain_point_id INTEGER NULL,
  ADD COLUMN IF NOT EXISTS process_id INTEGER NULL,
  ADD COLUMN IF NOT EXISTS solution_id INTEGER NULL;

CREATE INDEX IF NOT EXISTS idx_wb_init_hypothesis ON t_p61016064_digital_innovation_i.wb_initiatives(hypothesis_id);
CREATE INDEX IF NOT EXISTS idx_wb_init_pain ON t_p61016064_digital_innovation_i.wb_initiatives(pain_point_id);
CREATE INDEX IF NOT EXISTS idx_wb_init_process ON t_p61016064_digital_innovation_i.wb_initiatives(process_id);
CREATE INDEX IF NOT EXISTS idx_wb_init_solution ON t_p61016064_digital_innovation_i.wb_initiatives(solution_id);
