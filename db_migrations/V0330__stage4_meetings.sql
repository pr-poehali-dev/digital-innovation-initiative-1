-- ЭТАП 4, ШАГ 3: встречи и протоколы. Из протокола одним действием создаются
-- задача/веха/проблема/риск/решение — связь фиксируется в exec_meeting_outcome.

CREATE TABLE t_p61016064_digital_innovation_i.exec_meeting (
    id serial PRIMARY KEY,
    title varchar(400) NOT NULL,
    meeting_at timestamp NOT NULL,
    location varchar(255),
    agenda text,
    materials text,
    notes text,
    next_meeting_at timestamp,
    status varchar(20) NOT NULL DEFAULT 'planned',
    created_by varchar(255),
    created_at timestamp NOT NULL DEFAULT now(),
    updated_at timestamp NOT NULL DEFAULT now()
);

ALTER TABLE t_p61016064_digital_innovation_i.exec_meeting
    ADD CONSTRAINT chk_meeting_status
    CHECK (status IN ('planned', 'held', 'cancelled'));

CREATE TABLE t_p61016064_digital_innovation_i.exec_meeting_participant (
    meeting_id integer NOT NULL REFERENCES t_p61016064_digital_innovation_i.exec_meeting(id),
    person_id integer NOT NULL REFERENCES t_p61016064_digital_innovation_i.exec_person(id),
    PRIMARY KEY (meeting_id, person_id)
);

CREATE TABLE t_p61016064_digital_innovation_i.exec_meeting_initiative (
    meeting_id integer NOT NULL REFERENCES t_p61016064_digital_innovation_i.exec_meeting(id),
    initiative_id integer NOT NULL REFERENCES t_p61016064_digital_innovation_i.exec_initiative(id),
    PRIMARY KEY (meeting_id, initiative_id)
);

CREATE TABLE t_p61016064_digital_innovation_i.exec_meeting_function (
    meeting_id integer NOT NULL REFERENCES t_p61016064_digital_innovation_i.exec_meeting(id),
    center_function_id integer NOT NULL REFERENCES t_p61016064_digital_innovation_i.exec_center_function(id),
    PRIMARY KEY (meeting_id, center_function_id)
);

-- Что именно зафиксировано на встрече и во что превращено (для прослеживаемости)
CREATE TABLE t_p61016064_digital_innovation_i.exec_meeting_outcome (
    id serial PRIMARY KEY,
    meeting_id integer NOT NULL REFERENCES t_p61016064_digital_innovation_i.exec_meeting(id),
    outcome_type varchar(20) NOT NULL,
    text text NOT NULL,
    action_id integer REFERENCES t_p61016064_digital_innovation_i.exec_action(id),
    plan_step_id integer REFERENCES t_p61016064_digital_innovation_i.exec_plan_step(id),
    milestone_id integer REFERENCES t_p61016064_digital_innovation_i.exec_milestone(id),
    issue_id integer REFERENCES t_p61016064_digital_innovation_i.exec_issue(id),
    risk_id integer REFERENCES t_p61016064_digital_innovation_i.exec_risk(id),
    decision_id integer REFERENCES t_p61016064_digital_innovation_i.exec_decision_instance(id),
    created_at timestamp NOT NULL DEFAULT now()
);

ALTER TABLE t_p61016064_digital_innovation_i.exec_meeting_outcome
    ADD CONSTRAINT chk_meeting_outcome_type
    CHECK (outcome_type IN ('note', 'action', 'task', 'milestone', 'issue', 'risk', 'decision'));

-- Ссылка exec_action.meeting_id на встречу, из которой создано поручение
ALTER TABLE t_p61016064_digital_innovation_i.exec_action
    ADD CONSTRAINT fk_action_meeting
    FOREIGN KEY (meeting_id) REFERENCES t_p61016064_digital_innovation_i.exec_meeting(id);