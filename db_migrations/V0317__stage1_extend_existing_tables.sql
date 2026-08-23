-- ЭТАП 1, ШАГ 2: расширение существующих таблиц. Повторно запускаемая.

ALTER TABLE t_p61016064_digital_innovation_i.exec_person
    ADD COLUMN IF NOT EXISTS user_id integer,
    ADD COLUMN IF NOT EXISTS email varchar(200),
    ADD COLUMN IF NOT EXISTS phone varchar(50),
    ADD COLUMN IF NOT EXISTS employment_type varchar(30),
    ADD COLUMN IF NOT EXISTS employment_status varchar(30) NOT NULL DEFAULT 'active',
    ADD COLUMN IF NOT EXISTS normalized_name varchar(300);

UPDATE t_p61016064_digital_innovation_i.exec_person
SET normalized_name = regexp_replace(lower(replace(display_name, 'ё', 'е')), '\s+', ' ', 'g')
WHERE normalized_name IS DISTINCT FROM
      regexp_replace(lower(replace(display_name, 'ё', 'е')), '\s+', ' ', 'g');

CREATE INDEX IF NOT EXISTS idx_person_normalized_name
    ON t_p61016064_digital_innovation_i.exec_person(normalized_name);

CREATE UNIQUE INDEX IF NOT EXISTS uq_person_user_id
    ON t_p61016064_digital_innovation_i.exec_person(user_id) WHERE user_id IS NOT NULL;

ALTER TABLE t_p61016064_digital_innovation_i.exec_plan_assignee
    ADD COLUMN IF NOT EXISTS plan_hours numeric(8,1),
    ADD COLUMN IF NOT EXISTS raci_role varchar(1) NOT NULL DEFAULT 'R',
    ADD COLUMN IF NOT EXISTS valid_from date,
    ADD COLUMN IF NOT EXISTS valid_to date;

ALTER TABLE t_p61016064_digital_innovation_i.exec_plan_assignee
    ADD CONSTRAINT chk_assignee_raci CHECK (raci_role IN ('R','A','C','I')) NOT VALID;

CREATE UNIQUE INDEX IF NOT EXISTS uq_assignee_step_person_role
    ON t_p61016064_digital_innovation_i.exec_plan_assignee(step_id, person_id, raci_role);

CREATE UNIQUE INDEX IF NOT EXISTS uq_assignee_single_a
    ON t_p61016064_digital_innovation_i.exec_plan_assignee(step_id) WHERE raci_role = 'A';

ALTER TABLE t_p61016064_digital_innovation_i.exec_plan_step
    ADD COLUMN IF NOT EXISTS priority varchar(20) NOT NULL DEFAULT 'normal',
    ADD COLUMN IF NOT EXISTS result_text text,
    ADD COLUMN IF NOT EXISTS milestone_id integer;

CREATE INDEX IF NOT EXISTS idx_step_milestone
    ON t_p61016064_digital_innovation_i.exec_plan_step(milestone_id);

ALTER TABLE t_p61016064_digital_innovation_i.exec_risk
    ADD COLUMN IF NOT EXISTS center_id integer,
    ADD COLUMN IF NOT EXISTS center_function_id integer;

CREATE INDEX IF NOT EXISTS idx_risk_center
    ON t_p61016064_digital_innovation_i.exec_risk(center_id);

ALTER TABLE t_p61016064_digital_innovation_i.exec_role_assignment
    ADD COLUMN IF NOT EXISTS center_role_id integer,
    ADD COLUMN IF NOT EXISTS fte_share numeric(4,2) NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS assignment_kind varchar(20) NOT NULL DEFAULT 'permanent';

CREATE INDEX IF NOT EXISTS idx_role_assignment_center_role
    ON t_p61016064_digital_innovation_i.exec_role_assignment(center_role_id);