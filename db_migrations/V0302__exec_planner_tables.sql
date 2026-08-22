-- Планировщик руководителя: задача -> пошаговый план -> шаги/подшаги -> ресурсы

CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.exec_plan (
    id SERIAL PRIMARY KEY,
    title VARCHAR(500) NOT NULL,
    goal TEXT,
    initiative_id INTEGER,
    owner_person_id INTEGER,
    start_date DATE,
    due_date DATE,
    status VARCHAR(32) NOT NULL DEFAULT 'draft',
    priority VARCHAR(32) DEFAULT 'medium',
    note TEXT,
    created_by VARCHAR(255),
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.exec_plan_step (
    id SERIAL PRIMARY KEY,
    plan_id INTEGER NOT NULL,
    parent_step_id INTEGER,
    title VARCHAR(500) NOT NULL,
    description TEXT,
    step_type VARCHAR(32) NOT NULL DEFAULT 'step',
    status VARCHAR(32) NOT NULL DEFAULT 'not_started',
    start_date DATE,
    due_date DATE,
    fact_date DATE,
    responsible_person_id INTEGER,
    depends_on_step_id INTEGER,
    is_milestone BOOLEAN NOT NULL DEFAULT false,
    progress_pct INTEGER NOT NULL DEFAULT 0,
    workload_pct INTEGER,
    sort_order INTEGER NOT NULL DEFAULT 0,
    result_criteria TEXT,
    result_evidence TEXT,
    note TEXT,
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now(),
    CONSTRAINT exec_plan_step_progress_chk CHECK (progress_pct BETWEEN 0 AND 100),
    CONSTRAINT exec_plan_step_dates_chk CHECK (start_date IS NULL OR due_date IS NULL OR start_date <= due_date)
);

CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.exec_plan_assignee (
    id SERIAL PRIMARY KEY,
    step_id INTEGER NOT NULL,
    person_id INTEGER NOT NULL,
    role_in_step VARCHAR(64) DEFAULT 'executor',
    workload_pct INTEGER DEFAULT 100,
    created_at TIMESTAMP DEFAULT now(),
    CONSTRAINT exec_plan_assignee_uniq UNIQUE (step_id, person_id)
);

CREATE INDEX IF NOT EXISTS idx_exec_plan_step_plan ON t_p61016064_digital_innovation_i.exec_plan_step(plan_id);
CREATE INDEX IF NOT EXISTS idx_exec_plan_step_parent ON t_p61016064_digital_innovation_i.exec_plan_step(parent_step_id);
CREATE INDEX IF NOT EXISTS idx_exec_plan_step_due ON t_p61016064_digital_innovation_i.exec_plan_step(due_date);
CREATE INDEX IF NOT EXISTS idx_exec_plan_assignee_step ON t_p61016064_digital_innovation_i.exec_plan_assignee(step_id);
CREATE INDEX IF NOT EXISTS idx_exec_plan_assignee_person ON t_p61016064_digital_innovation_i.exec_plan_assignee(person_id);
