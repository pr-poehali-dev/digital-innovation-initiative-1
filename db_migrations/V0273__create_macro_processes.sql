-- Карта макропроцессов: верхний читаемый уровень над функциями
CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.macro_processes (
    id SERIAL PRIMARY KEY,
    project_id INTEGER REFERENCES t_p61016064_digital_innovation_i.projects(id),
    code VARCHAR(32) NOT NULL,
    name VARCHAR(255) NOT NULL,
    stage VARCHAR(32) NOT NULL DEFAULT 'core',
    purpose TEXT,
    trigger_event TEXT,
    result_output TEXT,
    owner_unit_code VARCHAR(32),
    current_state TEXT,
    pain_points TEXT,
    target_state TEXT,
    target_effect TEXT,
    ai_opportunity TEXT,
    maturity_current INTEGER NOT NULL DEFAULT 1,
    maturity_target INTEGER NOT NULL DEFAULT 3,
    ai_potential INTEGER NOT NULL DEFAULT 0,
    priority INTEGER NOT NULL DEFAULT 2,
    horizon VARCHAR(16) NOT NULL DEFAULT 'medium',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_macro_proc_code ON t_p61016064_digital_innovation_i.macro_processes (project_id, code);

-- Связь макропроцесс ↔ функции подразделения
CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.macro_process_functions (
    id SERIAL PRIMARY KEY,
    macro_process_id INTEGER NOT NULL REFERENCES t_p61016064_digital_innovation_i.macro_processes(id),
    function_id INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (macro_process_id, function_id)
);

CREATE INDEX IF NOT EXISTS idx_mpf_proc ON t_p61016064_digital_innovation_i.macro_process_functions (macro_process_id);

-- Связь макропроцесс ↔ оргединицы (кто участвует)
CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.macro_process_units (
    id SERIAL PRIMARY KEY,
    macro_process_id INTEGER NOT NULL REFERENCES t_p61016064_digital_innovation_i.macro_processes(id),
    org_unit_id INTEGER NOT NULL,
    role VARCHAR(32) NOT NULL DEFAULT 'participant',
    UNIQUE (macro_process_id, org_unit_id)
);

CREATE INDEX IF NOT EXISTS idx_mpu_proc ON t_p61016064_digital_innovation_i.macro_process_units (macro_process_id);
