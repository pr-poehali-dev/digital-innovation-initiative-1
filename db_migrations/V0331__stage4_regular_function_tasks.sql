-- ЭТАП 4, ШАГ 4: регулярная работа по функциям. Периодичность на функции +
-- шаблон экземпляра задачи, из которого планировщик штампует реальные шаги.

ALTER TABLE t_p61016064_digital_innovation_i.exec_center_function
    ALTER COLUMN regularity TYPE varchar(20);

-- Приводим существующие текстовые значения к перечню, остальное — по требованию
UPDATE t_p61016064_digital_innovation_i.exec_center_function
SET regularity = 'on_demand'
WHERE regularity IS NOT NULL
  AND regularity NOT IN ('daily','weekly','monthly','quarterly','yearly','event','on_demand');

ALTER TABLE t_p61016064_digital_innovation_i.exec_center_function
    ADD CONSTRAINT chk_function_regularity
    CHECK (regularity IS NULL OR regularity IN
        ('daily','weekly','monthly','quarterly','yearly','event','on_demand'));

CREATE TABLE t_p61016064_digital_innovation_i.exec_function_task_template (
    id serial PRIMARY KEY,
    function_id integer NOT NULL REFERENCES t_p61016064_digital_innovation_i.exec_center_function(id),
    title varchar(400) NOT NULL,
    description text,
    periodicity varchar(20) NOT NULL,
    default_responsible_person_id integer REFERENCES t_p61016064_digital_innovation_i.exec_person(id),
    estimate_hours numeric(6,1),
    checklist_json text,
    expected_result text,
    day_offset integer NOT NULL DEFAULT 0,
    is_active boolean NOT NULL DEFAULT true,
    plan_id integer REFERENCES t_p61016064_digital_innovation_i.exec_plan(id),
    last_generated_for date,
    created_by varchar(255),
    created_at timestamp NOT NULL DEFAULT now(),
    updated_at timestamp NOT NULL DEFAULT now()
);

ALTER TABLE t_p61016064_digital_innovation_i.exec_function_task_template
    ADD CONSTRAINT chk_template_periodicity
    CHECK (periodicity IN ('daily','weekly','monthly','quarterly','yearly'));

COMMENT ON TABLE t_p61016064_digital_innovation_i.exec_function_task_template IS
    'Шаблон регулярной задачи функции. day_offset — на какой день периода ставится срок. '
    'last_generated_for — до какой даты периода уже сгенерированы экземпляры (защита от дублей)';

-- Экземпляр, порождённый шаблоном, помечается ссылкой на шаблон для учёта пропусков
ALTER TABLE t_p61016064_digital_innovation_i.exec_plan_step
    ADD COLUMN IF NOT EXISTS task_template_id integer
        REFERENCES t_p61016064_digital_innovation_i.exec_function_task_template(id);