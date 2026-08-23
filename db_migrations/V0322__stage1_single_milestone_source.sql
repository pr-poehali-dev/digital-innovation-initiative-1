-- ЭТАП 1, ШАГ 7: устранение двойного источника вех.
-- Решение: exec_milestone — единственная управленческая контрольная точка.
-- step_type ограничивается значениями task и stage.
-- Визуальная отметка шага переносится в is_control_point.

ALTER TABLE t_p61016064_digital_innovation_i.exec_plan_step
    ADD COLUMN IF NOT EXISTS is_control_point boolean NOT NULL DEFAULT false;

-- Переносим отметку: и ранее помеченные, и получившие step_type в прошлой миграции
UPDATE t_p61016064_digital_innovation_i.exec_plan_step
SET is_control_point = true
WHERE (is_milestone = true OR step_type = 'milestone')
  AND is_control_point = false;

-- Возвращаем step_type в допустимый набор
UPDATE t_p61016064_digital_innovation_i.exec_plan_step
SET step_type = 'task'
WHERE step_type = 'milestone';

UPDATE t_p61016064_digital_innovation_i.exec_plan_step
SET step_type = 'task'
WHERE step_type NOT IN ('task', 'stage');

ALTER TABLE t_p61016064_digital_innovation_i.exec_plan_step
    ADD CONSTRAINT chk_step_type CHECK (step_type IN ('task', 'stage'));

-- Шаг может ссылаться на управленческую веху: она остаётся в exec_milestone
COMMENT ON COLUMN t_p61016064_digital_innovation_i.exec_plan_step.is_control_point
    IS 'Визуальная отметка контрольной точки в плане. Не является управленческой вехой: единственный источник вех — exec_milestone';
COMMENT ON COLUMN t_p61016064_digital_innovation_i.exec_plan_step.milestone_id
    IS 'Ссылка на управленческую веху инициативы (exec_milestone)';
COMMENT ON COLUMN t_p61016064_digital_innovation_i.exec_plan_step.is_milestone
    IS 'УСТАРЕЛО. Используйте is_control_point. Оставлено для совместимости';
COMMENT ON COLUMN t_p61016064_digital_innovation_i.exec_center_function.owner_person_id
    IS 'УСТАРЕЛО. Источник истины — exec_function_raci с ролью A';
COMMENT ON COLUMN t_p61016064_digital_innovation_i.exec_center_function.backup_person_id
    IS 'УСТАРЕЛО. Источник истины — exec_function_raci с is_backup = true';
COMMENT ON COLUMN t_p61016064_digital_innovation_i.exec_plan_step.responsible_person_id
    IS 'УСТАРЕЛО. Источник истины — exec_plan_assignee с raci_role = A';
COMMENT ON COLUMN t_p61016064_digital_innovation_i.exec_plan_step.fact_hours
    IS 'УСТАРЕЛО. Источник истины — сумма exec_time_entry по шагу';

-- Календарь: регион и тип дня уже есть, добавляем признак источника
ALTER TABLE t_p61016064_digital_innovation_i.exec_work_calendar
    ADD COLUMN IF NOT EXISTS region varchar(20) NOT NULL DEFAULT 'RU',
    ADD COLUMN IF NOT EXISTS is_generated boolean NOT NULL DEFAULT true;

-- Ёмкость: фиксируем единый алгоритм, чтобы ставка не учитывалась дважды
COMMENT ON COLUMN t_p61016064_digital_innovation_i.exec_person_capacity.hours_per_week
    IS 'Фактическая недельная ёмкость с учётом ставки. Единственный множитель в расчёте загрузки';
COMMENT ON COLUMN t_p61016064_digital_innovation_i.exec_person_capacity.fte
    IS 'Справочная доля ставки для отчётности. В расчёте загрузки НЕ используется';