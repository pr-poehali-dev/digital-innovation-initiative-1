-- ЭТАП 1, ШАГ 1: резервные копии затрагиваемых таблиц.
-- Повторно запускаемая: CREATE TABLE IF NOT EXISTS + вставка только при пустой копии.

CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.bk20260823_exec_person
    AS SELECT * FROM t_p61016064_digital_innovation_i.exec_person WHERE false;
INSERT INTO t_p61016064_digital_innovation_i.bk20260823_exec_person
    SELECT * FROM t_p61016064_digital_innovation_i.exec_person
    WHERE NOT EXISTS (SELECT 1 FROM t_p61016064_digital_innovation_i.bk20260823_exec_person);

CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.bk20260823_exec_plan_step
    AS SELECT * FROM t_p61016064_digital_innovation_i.exec_plan_step WHERE false;
INSERT INTO t_p61016064_digital_innovation_i.bk20260823_exec_plan_step
    SELECT * FROM t_p61016064_digital_innovation_i.exec_plan_step
    WHERE NOT EXISTS (SELECT 1 FROM t_p61016064_digital_innovation_i.bk20260823_exec_plan_step);

CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.bk20260823_exec_plan_assignee
    AS SELECT * FROM t_p61016064_digital_innovation_i.exec_plan_assignee WHERE false;
INSERT INTO t_p61016064_digital_innovation_i.bk20260823_exec_plan_assignee
    SELECT * FROM t_p61016064_digital_innovation_i.exec_plan_assignee
    WHERE NOT EXISTS (SELECT 1 FROM t_p61016064_digital_innovation_i.bk20260823_exec_plan_assignee);

CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.bk20260823_exec_role_assignment
    AS SELECT * FROM t_p61016064_digital_innovation_i.exec_role_assignment WHERE false;
INSERT INTO t_p61016064_digital_innovation_i.bk20260823_exec_role_assignment
    SELECT * FROM t_p61016064_digital_innovation_i.exec_role_assignment
    WHERE NOT EXISTS (SELECT 1 FROM t_p61016064_digital_innovation_i.bk20260823_exec_role_assignment);

CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.bk20260823_exec_risk
    AS SELECT * FROM t_p61016064_digital_innovation_i.exec_risk WHERE false;
INSERT INTO t_p61016064_digital_innovation_i.bk20260823_exec_risk
    SELECT * FROM t_p61016064_digital_innovation_i.exec_risk
    WHERE NOT EXISTS (SELECT 1 FROM t_p61016064_digital_innovation_i.bk20260823_exec_risk);

CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.bk20260823_exec_milestone
    AS SELECT * FROM t_p61016064_digital_innovation_i.exec_milestone WHERE false;
INSERT INTO t_p61016064_digital_innovation_i.bk20260823_exec_milestone
    SELECT * FROM t_p61016064_digital_innovation_i.exec_milestone
    WHERE NOT EXISTS (SELECT 1 FROM t_p61016064_digital_innovation_i.bk20260823_exec_milestone);

CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.bk20260823_exec_center_function
    AS SELECT * FROM t_p61016064_digital_innovation_i.exec_center_function WHERE false;
INSERT INTO t_p61016064_digital_innovation_i.bk20260823_exec_center_function
    SELECT * FROM t_p61016064_digital_innovation_i.exec_center_function
    WHERE NOT EXISTS (SELECT 1 FROM t_p61016064_digital_innovation_i.bk20260823_exec_center_function);

-- Журнал резервных копий
CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.exec_migration_backup (
    id            serial PRIMARY KEY,
    backup_tag    varchar(40) NOT NULL,
    source_table  varchar(100) NOT NULL,
    backup_table  varchar(100) NOT NULL,
    rows_copied   integer NOT NULL,
    created_at    timestamp NOT NULL DEFAULT now(),
    UNIQUE (backup_tag, source_table)
);

INSERT INTO t_p61016064_digital_innovation_i.exec_migration_backup
    (backup_tag, source_table, backup_table, rows_copied)
SELECT 'bk20260823', s, 'bk20260823_' || s,
       (SELECT count(*) FROM t_p61016064_digital_innovation_i.exec_person WHERE s = 'exec_person')
     + (SELECT count(*) FROM t_p61016064_digital_innovation_i.exec_plan_step WHERE s = 'exec_plan_step')
     + (SELECT count(*) FROM t_p61016064_digital_innovation_i.exec_plan_assignee WHERE s = 'exec_plan_assignee')
     + (SELECT count(*) FROM t_p61016064_digital_innovation_i.exec_role_assignment WHERE s = 'exec_role_assignment')
     + (SELECT count(*) FROM t_p61016064_digital_innovation_i.exec_risk WHERE s = 'exec_risk')
     + (SELECT count(*) FROM t_p61016064_digital_innovation_i.exec_milestone WHERE s = 'exec_milestone')
     + (SELECT count(*) FROM t_p61016064_digital_innovation_i.exec_center_function WHERE s = 'exec_center_function')
FROM unnest(ARRAY['exec_person','exec_plan_step','exec_plan_assignee',
                  'exec_role_assignment','exec_risk','exec_milestone',
                  'exec_center_function']) AS s
ON CONFLICT (backup_tag, source_table) DO NOTHING;