-- ЭТАП 4, ШАГ 2: exec_action становится полноценным поручением, не только
-- действием по риску/проблеме. Добавляем самостоятельную привязку, статусный цикл
-- с подтверждением руководителем, приоритет и признак "на контроле".

ALTER TABLE t_p61016064_digital_innovation_i.exec_action
    ADD COLUMN IF NOT EXISTS title varchar(400),
    ADD COLUMN IF NOT EXISTS initiative_id integer
        REFERENCES t_p61016064_digital_innovation_i.exec_initiative(id),
    ADD COLUMN IF NOT EXISTS center_function_id integer
        REFERENCES t_p61016064_digital_innovation_i.exec_center_function(id),
    ADD COLUMN IF NOT EXISTS author_person_id integer
        REFERENCES t_p61016064_digital_innovation_i.exec_person(id),
    ADD COLUMN IF NOT EXISTS priority varchar(20) NOT NULL DEFAULT 'normal',
    ADD COLUMN IF NOT EXISTS expected_result text,
    ADD COLUMN IF NOT EXISTS is_on_control boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS accepted_by_executor_at timestamp,
    ADD COLUMN IF NOT EXISTS accepted_by_head_at timestamp,
    ADD COLUMN IF NOT EXISTS meeting_id integer;

ALTER TABLE t_p61016064_digital_innovation_i.exec_action
    ADD CONSTRAINT chk_action_priority
    CHECK (priority IN ('low', 'normal', 'high', 'urgent'));

COMMENT ON COLUMN t_p61016064_digital_innovation_i.exec_action.status IS
    'new, accepted, in_progress, done_by_executor, accepted_by_head, cancelled '
    '(исторические not_started/in_progress/done тоже допустимы для действий по рискам/проблемам)';
COMMENT ON COLUMN t_p61016064_digital_innovation_i.exec_action.title IS
    'Короткая формулировка поручения. description остаётся развёрнутым описанием';
COMMENT ON COLUMN t_p61016064_digital_innovation_i.exec_action.is_on_control IS
    'Поручение на личном контроле руководителя — не должно теряться из виду';

-- Соисполнители поручения (m2m), исполнитель по-прежнему один (responsible_person_id)
CREATE TABLE t_p61016064_digital_innovation_i.exec_action_coexecutor (
    action_id integer NOT NULL REFERENCES t_p61016064_digital_innovation_i.exec_action(id),
    person_id integer NOT NULL REFERENCES t_p61016064_digital_innovation_i.exec_person(id),
    PRIMARY KEY (action_id, person_id)
);

-- История статусов поручения — отдельно от audit_log, т.к. нужен именно
-- пользовательский комментарий при каждой смене статуса (перенос срока и т.п.)
CREATE TABLE t_p61016064_digital_innovation_i.exec_action_status_log (
    id serial PRIMARY KEY,
    action_id integer NOT NULL REFERENCES t_p61016064_digital_innovation_i.exec_action(id),
    from_status varchar(32),
    to_status varchar(32) NOT NULL,
    comment text,
    changed_by varchar(255),
    changed_at timestamp NOT NULL DEFAULT now()
);