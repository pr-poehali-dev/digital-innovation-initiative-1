-- ЭТАП 1, ШАГ 3: новые таблицы модели Центра. Повторно запускаемая.

-- Компетенции сотрудника (каталог общий: professional_competencies)
CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.exec_person_competency (
    id                      serial PRIMARY KEY,
    person_id               integer NOT NULL,
    competency_id           integer NOT NULL,
    current_level           integer NOT NULL,
    target_level            integer,
    assessed_at             date NOT NULL DEFAULT CURRENT_DATE,
    valid_until             date,
    evidence_type           varchar(30) NOT NULL DEFAULT 'manager_review',
    evidence_ref            text,
    evidence_comment        text,
    confirmed_by_person_id  integer,
    confirmed_at            timestamp,
    created_at              timestamp NOT NULL DEFAULT now(),
    updated_at              timestamp NOT NULL DEFAULT now(),
    CONSTRAINT chk_pc_level CHECK (current_level BETWEEN 1 AND 5),
    CONSTRAINT chk_pc_target CHECK (target_level IS NULL OR target_level BETWEEN 1 AND 5),
    CONSTRAINT chk_pc_evidence CHECK (evidence_type IN
        ('experience','project','certificate','manager_review','training','self')),
    CONSTRAINT uq_person_competency UNIQUE (person_id, competency_id)
);

-- Рабочая ёмкость с историей
CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.exec_person_capacity (
    id              serial PRIMARY KEY,
    person_id       integer NOT NULL,
    valid_from      date NOT NULL,
    valid_to        date,
    hours_per_week  numeric(5,1) NOT NULL DEFAULT 40,
    fte             numeric(4,2) NOT NULL DEFAULT 1,
    work_schedule   varchar(40) NOT NULL DEFAULT '5/2',
    note            text,
    created_at      timestamp NOT NULL DEFAULT now(),
    CONSTRAINT chk_cap_period CHECK (valid_to IS NULL OR valid_to >= valid_from),
    CONSTRAINT chk_cap_hours CHECK (hours_per_week >= 0 AND hours_per_week <= 80)
);
CREATE INDEX IF NOT EXISTS idx_capacity_person ON t_p61016064_digital_innovation_i.exec_person_capacity(person_id, valid_from);
CREATE UNIQUE INDEX IF NOT EXISTS uq_capacity_open
    ON t_p61016064_digital_innovation_i.exec_person_capacity(person_id) WHERE valid_to IS NULL;

-- Отсутствия отдельно от ёмкости
CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.exec_person_absence (
    id              serial PRIMARY KEY,
    person_id       integer NOT NULL,
    absence_type    varchar(30) NOT NULL DEFAULT 'vacation',
    date_from       date NOT NULL,
    date_to         date NOT NULL,
    hours_per_day   numeric(4,1),
    approved_by     varchar(200),
    comment         text,
    created_at      timestamp NOT NULL DEFAULT now(),
    CONSTRAINT chk_abs_period CHECK (date_to >= date_from),
    CONSTRAINT chk_abs_type CHECK (absence_type IN
        ('vacation','sick','trip','training','other'))
);
CREATE INDEX IF NOT EXISTS idx_absence_person ON t_p61016064_digital_innovation_i.exec_person_absence(person_id, date_from, date_to);

-- Типизированный профиль: опыт, образование, сертификаты, инструменты
CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.exec_person_profile_record (
    id              serial PRIMARY KEY,
    person_id       integer NOT NULL,
    record_type     varchar(20) NOT NULL,
    title           varchar(400) NOT NULL,
    organization    varchar(300),
    description     text,
    date_from       date,
    date_to         date,
    competency_id   integer,
    document_ref    text,
    sort_order      integer NOT NULL DEFAULT 0,
    created_at      timestamp NOT NULL DEFAULT now(),
    CONSTRAINT chk_ppr_type CHECK (record_type IN
        ('experience','education','certificate','tool')),
    CONSTRAINT chk_ppr_tool CHECK (record_type <> 'tool' OR competency_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_profile_record_person ON t_p61016064_digital_innovation_i.exec_person_profile_record(person_id, record_type);

-- RACI по функциям: единственный источник владельца
CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.exec_function_raci (
    id              serial PRIMARY KEY,
    function_id     integer NOT NULL,
    person_id       integer NOT NULL,
    raci_role       varchar(1) NOT NULL DEFAULT 'R',
    is_backup       boolean NOT NULL DEFAULT false,
    valid_from      date NOT NULL DEFAULT CURRENT_DATE,
    valid_to        date,
    note            text,
    created_at      timestamp NOT NULL DEFAULT now(),
    CONSTRAINT chk_fraci_role CHECK (raci_role IN ('R','A','C','I')),
    CONSTRAINT chk_fraci_period CHECK (valid_to IS NULL OR valid_to >= valid_from)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_fraci_single_owner
    ON t_p61016064_digital_innovation_i.exec_function_raci(function_id)
    WHERE raci_role = 'A' AND valid_to IS NULL AND is_backup = false;
CREATE UNIQUE INDEX IF NOT EXISTS uq_fraci_unique
    ON t_p61016064_digital_innovation_i.exec_function_raci(function_id, person_id, raci_role, valid_from);

-- Функция Центра ↔ функция ДФМ (многие ко многим)
CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.exec_center_function_dept_function (
    center_function_id  integer NOT NULL,
    dept_function_id    integer NOT NULL,
    coverage_note       text,
    created_at          timestamp NOT NULL DEFAULT now(),
    PRIMARY KEY (center_function_id, dept_function_id)
);

-- Функция ↔ инициатива (многие ко многим)
CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.exec_function_initiative (
    id                  serial PRIMARY KEY,
    function_id         integer NOT NULL,
    initiative_id       integer NOT NULL,
    role_in_initiative  varchar(40) NOT NULL DEFAULT 'supports',
    valid_from          date,
    valid_to            date,
    note                text,
    created_at          timestamp NOT NULL DEFAULT now(),
    CONSTRAINT uq_func_initiative UNIQUE (function_id, initiative_id, role_in_initiative)
);

-- Требуемые компетенции функции
CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.exec_function_competency (
    id              serial PRIMARY KEY,
    function_id     integer NOT NULL,
    competency_id   integer NOT NULL,
    required_level  integer NOT NULL DEFAULT 3,
    is_critical     boolean NOT NULL DEFAULT false,
    note            text,
    CONSTRAINT chk_fc_level CHECK (required_level BETWEEN 1 AND 5),
    CONSTRAINT uq_function_competency UNIQUE (function_id, competency_id)
);

-- Шаг ↔ функция, не более одной первичной
CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.exec_plan_step_function (
    step_id     integer NOT NULL,
    function_id integer NOT NULL,
    is_primary  boolean NOT NULL DEFAULT false,
    created_at  timestamp NOT NULL DEFAULT now(),
    PRIMARY KEY (step_id, function_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_step_primary_function
    ON t_p61016064_digital_innovation_i.exec_plan_step_function(step_id) WHERE is_primary;

-- Шаг ↔ инициатива, не более одной первичной
CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.exec_plan_step_initiative (
    step_id         integer NOT NULL,
    initiative_id   integer NOT NULL,
    is_primary      boolean NOT NULL DEFAULT false,
    created_at      timestamp NOT NULL DEFAULT now(),
    PRIMARY KEY (step_id, initiative_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_step_primary_initiative
    ON t_p61016064_digital_innovation_i.exec_plan_step_initiative(step_id) WHERE is_primary;

-- Недельное распределение плановых часов исполнителя
CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.exec_assignee_week (
    id          serial PRIMARY KEY,
    assignee_id integer NOT NULL,
    week_start  date NOT NULL,
    hours       numeric(6,2) NOT NULL DEFAULT 0,
    is_manual   boolean NOT NULL DEFAULT false,
    CONSTRAINT chk_aw_hours CHECK (hours >= 0),
    CONSTRAINT uq_assignee_week UNIQUE (assignee_id, week_start)
);

-- Фактические трудозатраты по датам: источник истины для факта
CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.exec_time_entry (
    id                      serial PRIMARY KEY,
    person_id               integer NOT NULL,
    step_id                 integer NOT NULL,
    work_date               date NOT NULL,
    hours                   numeric(5,2) NOT NULL,
    comment                 text,
    source                  varchar(20) NOT NULL DEFAULT 'manual',
    status                  varchar(20) NOT NULL DEFAULT 'submitted',
    approved_by_person_id   integer,
    approved_at             timestamp,
    created_by              varchar(200),
    created_at              timestamp NOT NULL DEFAULT now(),
    CONSTRAINT chk_te_hours CHECK (hours > 0 AND hours <= 24),
    CONSTRAINT chk_te_status CHECK (status IN ('draft','submitted','approved','rejected'))
);
CREATE INDEX IF NOT EXISTS idx_time_entry_person ON t_p61016064_digital_innovation_i.exec_time_entry(person_id, work_date);
CREATE INDEX IF NOT EXISTS idx_time_entry_step ON t_p61016064_digital_innovation_i.exec_time_entry(step_id);

-- Производственный календарь
CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.exec_work_calendar (
    id              serial PRIMARY KEY,
    calendar_date   date NOT NULL UNIQUE,
    day_type        varchar(20) NOT NULL DEFAULT 'work',
    work_hours      numeric(4,1) NOT NULL DEFAULT 8,
    note            varchar(200),
    CONSTRAINT chk_wc_type CHECK (day_type IN ('work','weekend','holiday','short'))
);

-- Замеры показателей целей
CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.exec_center_kpi_value (
    id          serial PRIMARY KEY,
    goal_id     integer NOT NULL,
    period_date date NOT NULL,
    value       numeric(14,2),
    comment     text,
    created_by  varchar(200),
    created_at  timestamp NOT NULL DEFAULT now(),
    CONSTRAINT uq_kpi_goal_period UNIQUE (goal_id, period_date)
);

-- Настройки порогов загрузки для Центра
ALTER TABLE t_p61016064_digital_innovation_i.exec_center
    ADD COLUMN IF NOT EXISTS load_threshold_low integer NOT NULL DEFAULT 80,
    ADD COLUMN IF NOT EXISTS load_threshold_high integer NOT NULL DEFAULT 100;