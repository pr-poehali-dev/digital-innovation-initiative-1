CREATE TABLE IF NOT EXISTS exec_source_document (
    id SERIAL PRIMARY KEY,
    source_type VARCHAR(64) NOT NULL,
    title VARCHAR(500) NOT NULL,
    doc_number VARCHAR(128),
    doc_date DATE,
    issuer VARCHAR(255),
    valid_from DATE,
    valid_to DATE,
    link_url TEXT,
    check_status VARCHAR(32) DEFAULT 'unchecked',
    is_confidential BOOLEAN DEFAULT false,
    state VARCHAR(32) DEFAULT 'active',
    fixed_by VARCHAR(255),
    fixed_at TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS exec_source_usage (
    id SERIAL PRIMARY KEY,
    source_document_id INTEGER NOT NULL REFERENCES exec_source_document(id),
    usage_type VARCHAR(64) NOT NULL,
    fragment VARCHAR(500),
    applies_from DATE,
    applies_to DATE,
    comment TEXT,
    role_assignment_id INTEGER REFERENCES exec_role_assignment(id),
    decision_participation_id INTEGER REFERENCES exec_decision_participation(id),
    decision_instance_id INTEGER REFERENCES exec_decision_instance(id),
    decision_dependency_id INTEGER REFERENCES exec_decision_dependency(id),
    stakeholder_id INTEGER REFERENCES exec_stakeholder(id),
    initiative_id INTEGER REFERENCES exec_initiative(id),
    collegial_body_id INTEGER REFERENCES exec_collegial_body(id),
    collegial_body_member_id INTEGER REFERENCES exec_collegial_body_member(id),
    fixed_by VARCHAR(255),
    fixed_at TIMESTAMP DEFAULT now(),
    CONSTRAINT exec_source_usage_one_target CHECK (
        (CASE WHEN role_assignment_id IS NOT NULL THEN 1 ELSE 0 END) +
        (CASE WHEN decision_participation_id IS NOT NULL THEN 1 ELSE 0 END) +
        (CASE WHEN decision_instance_id IS NOT NULL THEN 1 ELSE 0 END) +
        (CASE WHEN decision_dependency_id IS NOT NULL THEN 1 ELSE 0 END) +
        (CASE WHEN stakeholder_id IS NOT NULL THEN 1 ELSE 0 END) +
        (CASE WHEN initiative_id IS NOT NULL THEN 1 ELSE 0 END) +
        (CASE WHEN collegial_body_id IS NOT NULL THEN 1 ELSE 0 END) +
        (CASE WHEN collegial_body_member_id IS NOT NULL THEN 1 ELSE 0 END) = 1
    )
);

CREATE TABLE IF NOT EXISTS exec_audit_log (
    id SERIAL PRIMARY KEY,
    entity_type VARCHAR(64) NOT NULL,
    entity_id INTEGER,
    action VARCHAR(64) NOT NULL,
    actor VARCHAR(255),
    before_json JSONB,
    after_json JSONB,
    reason TEXT,
    created_at TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_exec_stakeholder_init ON exec_stakeholder(initiative_id);
CREATE INDEX IF NOT EXISTS idx_exec_decision_init ON exec_decision_instance(initiative_id);
CREATE INDEX IF NOT EXISTS idx_exec_role_assign_init ON exec_role_assignment(initiative_id);
CREATE INDEX IF NOT EXISTS idx_exec_part_decision ON exec_decision_participation(decision_id);
CREATE INDEX IF NOT EXISTS idx_exec_audit_entity ON exec_audit_log(entity_type, entity_id);
