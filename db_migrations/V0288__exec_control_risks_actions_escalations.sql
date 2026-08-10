CREATE TABLE IF NOT EXISTS exec_risk (
    id SERIAL PRIMARY KEY,
    initiative_id INTEGER NOT NULL REFERENCES exec_initiative(id),
    description TEXT NOT NULL,
    cause TEXT,
    consequence TEXT,
    probability INTEGER DEFAULT 3,
    impact INTEGER DEFAULT 3,
    risk_score INTEGER GENERATED ALWAYS AS (probability * impact) STORED,
    trigger_indicator TEXT,
    owner_person_id INTEGER REFERENCES exec_person(id),
    preventive_measures TEXT,
    response_plan TEXT,
    detected_at DATE,
    last_assessed_at DATE,
    assessed_by_person_id INTEGER REFERENCES exec_person(id),
    next_review_at DATE,
    status VARCHAR(32) DEFAULT 'active',
    materialized_issue_id INTEGER REFERENCES exec_issue(id),
    is_blocking BOOLEAN DEFAULT false,
    block_what TEXT,
    block_since DATE,
    block_who_can_lift TEXT,
    block_requirements TEXT,
    block_escalation_level VARCHAR(64),
    block_deadline DATE,
    block_status VARCHAR(32),
    block_lifted_at DATE,
    block_lifted_by VARCHAR(255),
    block_lift_result TEXT,
    verification_status VARCHAR(32) DEFAULT 'user_draft',
    source_note TEXT,
    created_by VARCHAR(255),
    confirmed_verification_by VARCHAR(255),
    confirmed_verification_at TIMESTAMP,
    is_test_data BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now(),
    CONSTRAINT exec_risk_prob_chk CHECK (probability BETWEEN 1 AND 5),
    CONSTRAINT exec_risk_impact_chk CHECK (impact BETWEEN 1 AND 5),
    CONSTRAINT exec_risk_status_chk CHECK (
        status IN ('active','mitigated','accepted','materialized','closed','irrelevant')
    ),
    CONSTRAINT exec_risk_materialized_chk CHECK (
        status <> 'materialized' OR materialized_issue_id IS NOT NULL
    ),
    CONSTRAINT exec_risk_block_chk CHECK (
        is_blocking = false
        OR (block_what IS NOT NULL AND block_since IS NOT NULL
            AND block_who_can_lift IS NOT NULL AND block_requirements IS NOT NULL
            AND block_escalation_level IS NOT NULL AND block_deadline IS NOT NULL)
    ),
    CONSTRAINT exec_risk_block_status_chk CHECK (
        block_status IS NULL OR block_status IN ('active','lifted')
    )
);

CREATE TABLE IF NOT EXISTS exec_action (
    id SERIAL PRIMARY KEY,
    issue_id INTEGER REFERENCES exec_issue(id),
    risk_id INTEGER REFERENCES exec_risk(id),
    description TEXT NOT NULL,
    responsible_person_id INTEGER REFERENCES exec_person(id),
    start_date DATE,
    due_at DATE,
    fact_date DATE,
    status VARCHAR(32) DEFAULT 'not_started',
    completion_criteria TEXT,
    result TEXT,
    result_confirmed_by_person_id INTEGER REFERENCES exec_person(id),
    delay_reason TEXT,
    decision_id INTEGER REFERENCES exec_decision_instance(id),
    verification_status VARCHAR(32) DEFAULT 'user_draft',
    source_note TEXT,
    created_by VARCHAR(255),
    is_test_data BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now(),
    CONSTRAINT exec_action_status_chk CHECK (
        status IN ('not_started','in_progress','done','cancelled','needs_review')
    ),
    CONSTRAINT exec_action_one_target CHECK (
        (CASE WHEN issue_id IS NOT NULL THEN 1 ELSE 0 END) +
        (CASE WHEN risk_id IS NOT NULL THEN 1 ELSE 0 END) = 1
    ),
    CONSTRAINT exec_action_done_chk CHECK (
        status <> 'done' OR (result IS NOT NULL AND fact_date IS NOT NULL)
    )
);

CREATE TABLE IF NOT EXISTS exec_escalation (
    id SERIAL PRIMARY KEY,
    issue_id INTEGER REFERENCES exec_issue(id),
    risk_id INTEGER REFERENCES exec_risk(id),
    level_code VARCHAR(64) NOT NULL,
    passed_at DATE NOT NULL,
    reason TEXT,
    prepared_by_person_id INTEGER REFERENCES exec_person(id),
    passed_to_person_id INTEGER REFERENCES exec_person(id),
    passed_to_body_id INTEGER REFERENCES exec_collegial_body(id),
    review_due_at DATE,
    decision_text TEXT,
    decided_at DATE,
    result TEXT,
    decision_id INTEGER REFERENCES exec_decision_instance(id),
    status VARCHAR(32) DEFAULT 'sent',
    verification_status VARCHAR(32) DEFAULT 'user_draft',
    source_note TEXT,
    created_by VARCHAR(255),
    is_test_data BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT now(),
    CONSTRAINT exec_escalation_one_target CHECK (
        (CASE WHEN issue_id IS NOT NULL THEN 1 ELSE 0 END) +
        (CASE WHEN risk_id IS NOT NULL THEN 1 ELSE 0 END) = 1
    ),
    CONSTRAINT exec_escalation_status_chk CHECK (
        status IN ('sent','in_review','decided','returned','closed')
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_exec_risk_materialized_unique
    ON exec_risk(materialized_issue_id) WHERE materialized_issue_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_exec_risk_init ON exec_risk(initiative_id);
CREATE INDEX IF NOT EXISTS idx_exec_action_issue ON exec_action(issue_id);
CREATE INDEX IF NOT EXISTS idx_exec_action_risk ON exec_action(risk_id);
CREATE INDEX IF NOT EXISTS idx_exec_escalation_issue ON exec_escalation(issue_id);
CREATE INDEX IF NOT EXISTS idx_exec_escalation_risk ON exec_escalation(risk_id);
