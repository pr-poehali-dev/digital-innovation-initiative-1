CREATE TABLE t_p61016064_digital_innovation_i.audit_runs (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    slide_count INTEGER DEFAULT 0,
    doc_count INTEGER DEFAULT 0,
    result_json TEXT,
    status VARCHAR(32) DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_runs_project ON t_p61016064_digital_innovation_i.audit_runs(project_id);
CREATE INDEX idx_audit_runs_user ON t_p61016064_digital_innovation_i.audit_runs(user_id);
