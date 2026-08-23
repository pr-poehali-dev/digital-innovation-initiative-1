-- Паспорт центра: обоснование, цели, задачи, функции, штат

CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.exec_center (
    id                  serial PRIMARY KEY,
    title               varchar(300) NOT NULL,
    short_name          varchar(80),
    status              varchar(30) NOT NULL DEFAULT 'draft',
    parent_org          varchar(300),
    head_person_id      integer,
    mission             text,
    rationale           text,
    problem_statement   text,
    scope_included      text,
    scope_excluded      text,
    success_criteria    text,
    planned_headcount   integer,
    start_date          date,
    review_date         date,
    initiative_id       integer,
    plan_id             integer,
    note                text,
    created_at          timestamp NOT NULL DEFAULT now(),
    updated_at          timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.exec_center_goal (
    id              serial PRIMARY KEY,
    center_id       integer NOT NULL,
    parent_goal_id  integer,
    kind            varchar(20) NOT NULL DEFAULT 'goal',
    title           varchar(400) NOT NULL,
    description     text,
    metric          varchar(300),
    baseline_value  varchar(80),
    target_value    varchar(80),
    horizon         varchar(40),
    due_date        date,
    owner_person_id integer,
    status          varchar(30) NOT NULL DEFAULT 'planned',
    progress_pct    integer,
    sort_order      integer NOT NULL DEFAULT 0,
    created_at      timestamp NOT NULL DEFAULT now(),
    updated_at      timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.exec_center_function (
    id                  serial PRIMARY KEY,
    center_id           integer NOT NULL,
    code                varchar(40),
    title               varchar(400) NOT NULL,
    description         text,
    purpose             text,
    result_description  text,
    goal_id             integer,
    owner_person_id     integer,
    backup_person_id    integer,
    criticality         varchar(20) NOT NULL DEFAULT 'medium',
    regularity          varchar(30),
    hours_per_month     numeric(8,1),
    fte_estimate        numeric(5,2),
    status              varchar(30) NOT NULL DEFAULT 'planned',
    sort_order          integer NOT NULL DEFAULT 0,
    note                text,
    created_at          timestamp NOT NULL DEFAULT now(),
    updated_at          timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.exec_center_role (
    id                  serial PRIMARY KEY,
    center_id           integer NOT NULL,
    title               varchar(300) NOT NULL,
    purpose             text,
    duties              text,
    requirements        text,
    headcount           numeric(5,2) NOT NULL DEFAULT 1,
    hours_per_week      numeric(5,1),
    grade               varchar(80),
    person_id           integer,
    status              varchar(30) NOT NULL DEFAULT 'needed',
    justification       text,
    sort_order          integer NOT NULL DEFAULT 0,
    created_at          timestamp NOT NULL DEFAULT now(),
    updated_at          timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.exec_center_role_function (
    role_id     integer NOT NULL,
    function_id integer NOT NULL,
    share_pct   integer,
    PRIMARY KEY (role_id, function_id)
);

ALTER TABLE t_p61016064_digital_innovation_i.exec_plan_step
    ADD COLUMN IF NOT EXISTS center_function_id integer;

CREATE INDEX IF NOT EXISTS idx_center_goal_center ON t_p61016064_digital_innovation_i.exec_center_goal(center_id);
CREATE INDEX IF NOT EXISTS idx_center_func_center ON t_p61016064_digital_innovation_i.exec_center_function(center_id);
CREATE INDEX IF NOT EXISTS idx_center_role_center ON t_p61016064_digital_innovation_i.exec_center_role(center_id);
CREATE INDEX IF NOT EXISTS idx_step_center_func ON t_p61016064_digital_innovation_i.exec_plan_step(center_function_id);