CREATE TABLE IF NOT EXISTS exec_stakeholder (
    id SERIAL PRIMARY KEY,
    initiative_id INTEGER NOT NULL REFERENCES exec_initiative(id),
    person_id INTEGER REFERENCES exec_person(id),
    org_unit_id INTEGER,
    role_in_initiative VARCHAR(255),
    is_external BOOLEAN DEFAULT false,
    formal_participation INTEGER DEFAULT 0,
    can_decide BOOLEAN DEFAULT false,
    must_approve BOOLEAN DEFAULT false,
    can_block BOOLEAN DEFAULT false,
    controls_resource BOOLEAN DEFAULT false,
    participation_state VARCHAR(64) DEFAULT 'no_data',
    participation_state_at TIMESTAMP,
    position_on_topic TEXT,
    confirmed_requirements TEXT,
    stated_remarks TEXT,
    support_conditions TEXT,
    open_questions TEXT,
    noninvolvement_risk VARCHAR(64) DEFAULT 'no_data',
    engagement_goal TEXT,
    key_messages TEXT,
    contact_format VARCHAR(128),
    contact_frequency VARCHAR(128),
    responsible_person_id INTEGER REFERENCES exec_person(id),
    next_action TEXT,
    next_action_due DATE,
    engagement_status VARCHAR(64) DEFAULT 'planned',
    verification_status VARCHAR(32) DEFAULT 'user_draft',
    is_test_data BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS exec_collegial_body (
    id SERIAL PRIMARY KEY,
    code VARCHAR(64) UNIQUE,
    title VARCHAR(255) NOT NULL,
    purpose TEXT,
    authority TEXT,
    quorum_rule VARCHAR(255),
    voting_rule VARCHAR(255),
    chair_person_id INTEGER REFERENCES exec_person(id),
    secretary_person_id INTEGER REFERENCES exec_person(id),
    status VARCHAR(32) DEFAULT 'active',
    verification_status VARCHAR(32) DEFAULT 'user_draft',
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS exec_collegial_body_member (
    id SERIAL PRIMARY KEY,
    body_id INTEGER NOT NULL REFERENCES exec_collegial_body(id),
    person_id INTEGER REFERENCES exec_person(id),
    org_position VARCHAR(255),
    member_role VARCHAR(64) DEFAULT 'member',
    has_vote BOOLEAN DEFAULT true,
    date_from DATE,
    date_to DATE,
    status VARCHAR(32) DEFAULT 'active',
    verification_status VARCHAR(32) DEFAULT 'user_draft',
    created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS exec_decision_type (
    id SERIAL PRIMARY KEY,
    code VARCHAR(64) UNIQUE NOT NULL,
    title VARCHAR(255) NOT NULL,
    category VARCHAR(64),
    description TEXT,
    stage VARCHAR(64),
    trigger_condition TEXT,
    is_mandatory BOOLEAN DEFAULT true,
    required_materials TEXT,
    acceptance_criteria TEXT,
    typical_term_days INTEGER,
    escalation_level VARCHAR(64),
    result_document VARCHAR(255),
    sort_order INTEGER DEFAULT 100,
    created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS exec_decision_instance (
    id SERIAL PRIMARY KEY,
    initiative_id INTEGER NOT NULL REFERENCES exec_initiative(id),
    decision_type_code VARCHAR(64) NOT NULL REFERENCES exec_decision_type(code),
    question TEXT NOT NULL,
    basis TEXT,
    raised_at DATE,
    due_at DATE,
    status VARCHAR(64) DEFAULT 'raised',
    proposed_option TEXT,
    materials TEXT,
    final_decision TEXT,
    decided_by_person_id INTEGER REFERENCES exec_person(id),
    decided_by_body_id INTEGER REFERENCES exec_collegial_body(id),
    decided_at DATE,
    result_document VARCHAR(255),
    execution_status VARCHAR(64) DEFAULT 'not_started',
    control_result TEXT,
    escalation_level VARCHAR(64),
    verification_status VARCHAR(32) DEFAULT 'user_draft',
    is_test_data BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS exec_decision_participation (
    id SERIAL PRIMARY KEY,
    decision_id INTEGER NOT NULL REFERENCES exec_decision_instance(id),
    decision_type_code VARCHAR(64) REFERENCES exec_decision_type(code),
    role_code VARCHAR(64) REFERENCES exec_role_template(code),
    person_id INTEGER REFERENCES exec_person(id),
    body_id INTEGER REFERENCES exec_collegial_body(id),
    participation_kind VARCHAR(32) NOT NULL,
    is_mandatory BOOLEAN DEFAULT true,
    sequence_order INTEGER DEFAULT 1,
    term_days INTEGER,
    can_delegate BOOLEAN DEFAULT false,
    escalation_condition TEXT,
    verification_status VARCHAR(32) DEFAULT 'user_draft',
    created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS exec_decision_dependency (
    id SERIAL PRIMARY KEY,
    predecessor_id INTEGER NOT NULL REFERENCES exec_decision_instance(id),
    dependent_id INTEGER NOT NULL REFERENCES exec_decision_instance(id),
    dependency_type VARCHAR(64) NOT NULL,
    condition_text TEXT,
    is_mandatory BOOLEAN DEFAULT true,
    condition_met BOOLEAN DEFAULT false,
    exception_basis TEXT,
    exception_granted_by VARCHAR(255),
    created_at TIMESTAMP DEFAULT now()
);
