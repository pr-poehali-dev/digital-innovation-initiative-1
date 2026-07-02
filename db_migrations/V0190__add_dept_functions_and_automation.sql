CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.dept_functions (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL,
    dept_name TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    goals TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT 'operational',
    priority INTEGER NOT NULL DEFAULT 0,
    source_image_url TEXT DEFAULT NULL,
    created_by INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.dept_automation (
    id SERIAL PRIMARY KEY,
    function_id INTEGER NOT NULL,
    project_id INTEGER NOT NULL,
    current_tools TEXT NOT NULL DEFAULT '',
    current_status TEXT NOT NULL DEFAULT 'manual',
    planned_tools TEXT NOT NULL DEFAULT '',
    ai_potential_score INTEGER NOT NULL DEFAULT 0,
    ai_recommendation TEXT NOT NULL DEFAULT '',
    ai_recommendation_generated BOOLEAN NOT NULL DEFAULT FALSE,
    implementation_horizon TEXT NOT NULL DEFAULT 'medium',
    notes TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dept_functions_project ON t_p61016064_digital_innovation_i.dept_functions(project_id);
CREATE INDEX IF NOT EXISTS idx_dept_automation_function ON t_p61016064_digital_innovation_i.dept_automation(function_id);
CREATE INDEX IF NOT EXISTS idx_dept_automation_project ON t_p61016064_digital_innovation_i.dept_automation(project_id);
