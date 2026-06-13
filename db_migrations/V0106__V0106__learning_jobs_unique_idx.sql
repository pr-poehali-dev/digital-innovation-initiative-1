-- V0106: Learning Pack — исправление индексов для корректного ON CONFLICT
CREATE UNIQUE INDEX IF NOT EXISTS idx_learning_jobs_user_milestone
  ON t_p61016064_digital_innovation_i.learning_jobs(user_id, milestone_id);
