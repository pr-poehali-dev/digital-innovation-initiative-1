-- Рабочий план лаборатории: план ПОДГОТОВКИ И ПРОВЕРКИ решения (диагностика,
-- гипотезы, концепция), а НЕ план внедрения решения в масштабе Банка —
-- это принципиальное разграничение с будущим project_kind=implementation.
CREATE TABLE t_p61016064_digital_innovation_i.wb_case_workplan_task (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES t_p61016064_digital_innovation_i.projects(id),
    order_no INTEGER NOT NULL,
    code TEXT NOT NULL,
    title TEXT NOT NULL,
    expected_result TEXT NULL,
    responsible_name TEXT NULL,
    status TEXT NOT NULL DEFAULT 'not_started',
    week_reference TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE t_p61016064_digital_innovation_i.wb_case_workplan_task
    ADD CONSTRAINT chk_wb_workplan_status
    CHECK (status IN ('not_started', 'in_progress', 'done'));

CREATE INDEX idx_wb_workplan_project ON t_p61016064_digital_innovation_i.wb_case_workplan_task(project_id, order_no);

COMMENT ON TABLE t_p61016064_digital_innovation_i.wb_case_workplan_task IS
    'Рабочий план лаборатории — задачи подготовки и проверки решения (постановка → диагностика → гипотезы → варианты → концепция → образ будущего → план реализации → документы → представление). НЕ план внедрения решения — тот появляется отдельным exec_project(kind=implementation) на стадии 8.';
