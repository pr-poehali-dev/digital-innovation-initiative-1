-- ═══════════════════════════════════════════════════════════════════
-- Стадии и шлюзы лабораторного кейса — общий механизм для всех
-- project_kind='lab_development' кейсов (не только «6И»).
-- ═══════════════════════════════════════════════════════════════════

-- 1) Шаблон стадий — задаётся один раз на тип кейса, переиспользуется
--    при создании стадий для конкретного проекта (аналог workplan lazy-init).
CREATE TABLE t_p61016064_digital_innovation_i.wb_stage_template (
    id SERIAL PRIMARY KEY,
    project_kind TEXT NOT NULL,
    order_no INTEGER NOT NULL,
    code TEXT NOT NULL,
    title TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (project_kind, code)
);

INSERT INTO t_p61016064_digital_innovation_i.wb_stage_template (project_kind, order_no, code, title) VALUES
    ('lab_development', 1, 'S1', 'Постановка задачи'),
    ('lab_development', 2, 'S2', 'Диагностика'),
    ('lab_development', 3, 'S3', 'Формирование гипотез'),
    ('lab_development', 4, 'S4', 'Проверка гипотез'),
    ('lab_development', 5, 'S5', 'Проектирование концепции'),
    ('lab_development', 6, 'S6', 'Планирование реализации'),
    ('lab_development', 7, 'S7', 'Подготовка комплекта материалов'),
    ('lab_development', 8, 'S8', 'Принятие решения и передача в реализацию');

-- 2) Стадии, привязанные к конкретному проекту (инстанс шаблона).
CREATE TABLE t_p61016064_digital_innovation_i.wb_case_stage (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES t_p61016064_digital_innovation_i.projects(id),
    order_no INTEGER NOT NULL,
    code TEXT NOT NULL,
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'locked',
    gate_confirmed_at TIMESTAMPTZ NULL,
    gate_confirmed_by_user_id INTEGER NULL REFERENCES t_p61016064_digital_innovation_i.users(id),
    gate_confirmed_by_name TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (project_id, code)
);

ALTER TABLE t_p61016064_digital_innovation_i.wb_case_stage
    ADD CONSTRAINT chk_wb_case_stage_status
    CHECK (status IN ('locked', 'active', 'completed'));

CREATE INDEX idx_wb_case_stage_project ON t_p61016064_digital_innovation_i.wb_case_stage(project_id, order_no);

-- 3) Критерии шлюза — настраиваемые, для каждой стадии свой набор.
--    criterion_type определяет способ автопроверки:
--      'stage_tasks_done'   — все задачи стадии в wb_case_workplan_task имеют status='done'
--      'passport_confirmed' — wb_case_analysis.status='confirmed' для проекта
--      'manual'             — проверяется только вручную владельцем
CREATE TABLE t_p61016064_digital_innovation_i.wb_case_stage_criterion (
    id SERIAL PRIMARY KEY,
    stage_id INTEGER NOT NULL REFERENCES t_p61016064_digital_innovation_i.wb_case_stage(id),
    order_no INTEGER NOT NULL,
    code TEXT NOT NULL,
    title TEXT NOT NULL,
    criterion_type TEXT NOT NULL DEFAULT 'manual',
    result TEXT NOT NULL DEFAULT 'pending',
    waived_reason TEXT NULL,
    waived_by_name TEXT NULL,
    waived_at TIMESTAMPTZ NULL,
    checked_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE t_p61016064_digital_innovation_i.wb_case_stage_criterion
    ADD CONSTRAINT chk_wb_stage_criterion_result
    CHECK (result IN ('pending', 'passed', 'failed', 'waived'));

CREATE INDEX idx_wb_stage_criterion_stage ON t_p61016064_digital_innovation_i.wb_case_stage_criterion(stage_id, order_no);

-- 4) Журнал переходов между стадиями — обязателен для каждого перехода,
--    включая переходы с исключением (waived-критериями).
CREATE TABLE t_p61016064_digital_innovation_i.wb_case_stage_transition_log (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES t_p61016064_digital_innovation_i.projects(id),
    from_stage_id INTEGER NULL REFERENCES t_p61016064_digital_innovation_i.wb_case_stage(id),
    to_stage_id INTEGER NOT NULL REFERENCES t_p61016064_digital_innovation_i.wb_case_stage(id),
    transition_type TEXT NOT NULL DEFAULT 'confirmed',
    comment TEXT NULL,
    waived_criteria_json JSONB NOT NULL DEFAULT '[]',
    actor_user_id INTEGER NULL REFERENCES t_p61016064_digital_innovation_i.users(id),
    actor_name TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE t_p61016064_digital_innovation_i.wb_case_stage_transition_log
    ADD CONSTRAINT chk_wb_stage_transition_type
    CHECK (transition_type IN ('confirmed', 'waived'));

CREATE INDEX idx_wb_stage_transition_project ON t_p61016064_digital_innovation_i.wb_case_stage_transition_log(project_id, created_at);

-- 5) Привязка задач рабочего плана к стадиям.
ALTER TABLE t_p61016064_digital_innovation_i.wb_case_workplan_task
    ADD COLUMN stage_code TEXT NULL;

COMMENT ON TABLE t_p61016064_digital_innovation_i.wb_stage_template IS
    'Шаблон стадий по project_kind — единая конфигурация, используется для всех кейсов данного типа (не только «6И»)';
COMMENT ON TABLE t_p61016064_digital_innovation_i.wb_case_stage IS
    'Инстанс стадии для конкретного проекта, создаётся из wb_stage_template при первом обращении';
COMMENT ON TABLE t_p61016064_digital_innovation_i.wb_case_stage_criterion IS
    'Настраиваемые критерии шлюза стадии: passed/failed/waived, для waived обязательны причина и согласующий';
COMMENT ON TABLE t_p61016064_digital_innovation_i.wb_case_stage_transition_log IS
    'Журнал подтверждённых переходов между стадиями, включая переходы с исключением';
