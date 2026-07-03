ALTER TABLE t_p61016064_digital_innovation_i.wb_pain_points
  ADD COLUMN IF NOT EXISTS linked_process_id INTEGER NULL,
  ADD COLUMN IF NOT EXISTS linked_solution_id INTEGER NULL;

CREATE INDEX IF NOT EXISTS idx_wb_pain_points_linked_process ON t_p61016064_digital_innovation_i.wb_pain_points(linked_process_id);
CREATE INDEX IF NOT EXISTS idx_wb_pain_points_linked_solution ON t_p61016064_digital_innovation_i.wb_pain_points(linked_solution_id);
