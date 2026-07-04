ALTER TABLE t_p61016064_digital_innovation_i.workspace_hypotheses
  ADD COLUMN IF NOT EXISTS process_id INTEGER NULL,
  ADD COLUMN IF NOT EXISTS pain_point_id INTEGER NULL,
  ADD COLUMN IF NOT EXISTS solution_id INTEGER NULL;

CREATE INDEX IF NOT EXISTS idx_workspace_hyp_process ON t_p61016064_digital_innovation_i.workspace_hypotheses(process_id);
CREATE INDEX IF NOT EXISTS idx_workspace_hyp_pain ON t_p61016064_digital_innovation_i.workspace_hypotheses(pain_point_id);
CREATE INDEX IF NOT EXISTS idx_workspace_hyp_solution ON t_p61016064_digital_innovation_i.workspace_hypotheses(solution_id);
