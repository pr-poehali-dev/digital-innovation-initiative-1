CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.dept_function_process_links (
    id SERIAL PRIMARY KEY,
    function_id INTEGER NOT NULL REFERENCES t_p61016064_digital_innovation_i.dept_functions(id),
    process_id INTEGER NOT NULL REFERENCES t_p61016064_digital_innovation_i.wb_processes(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by INTEGER,
    UNIQUE (function_id, process_id)
);

CREATE INDEX IF NOT EXISTS idx_dfpl_function ON t_p61016064_digital_innovation_i.dept_function_process_links(function_id);
CREATE INDEX IF NOT EXISTS idx_dfpl_process ON t_p61016064_digital_innovation_i.dept_function_process_links(process_id);
