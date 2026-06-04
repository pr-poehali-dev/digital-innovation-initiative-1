ALTER TABLE t_p61016064_digital_innovation_i.learning_goals
  ADD COLUMN IF NOT EXISTS start_date DATE;

-- Ставим дату старта для уже созданной цели
UPDATE t_p61016064_digital_innovation_i.learning_goals
  SET start_date = CURRENT_DATE
  WHERE id = 1;
