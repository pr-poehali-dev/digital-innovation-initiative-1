ALTER TABLE t_p61016064_digital_innovation_i.exec_plan_step
  ADD COLUMN IF NOT EXISTS estimate_hours numeric(8,1),
  ADD COLUMN IF NOT EXISTS fact_hours numeric(8,1);

COMMENT ON COLUMN t_p61016064_digital_innovation_i.exec_plan_step.estimate_hours IS 'Плановая трудоёмкость шага в часах';
COMMENT ON COLUMN t_p61016064_digital_innovation_i.exec_plan_step.fact_hours IS 'Фактически затраченные часы';