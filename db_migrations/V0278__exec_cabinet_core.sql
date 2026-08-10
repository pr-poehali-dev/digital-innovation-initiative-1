CREATE TABLE IF NOT EXISTS ref_dictionary_type (
    id SERIAL PRIMARY KEY,
    code VARCHAR(64) UNIQUE NOT NULL,
    title VARCHAR(255) NOT NULL,
    is_system BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ref_dictionary_value (
    id SERIAL PRIMARY KEY,
    type_code VARCHAR(64) NOT NULL REFERENCES ref_dictionary_type(code),
    code VARCHAR(64) NOT NULL,
    title VARCHAR(255) NOT NULL,
    sort_order INTEGER DEFAULT 100,
    color VARCHAR(32),
    is_system BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT now(),
    UNIQUE (type_code, code)
);

CREATE TABLE IF NOT EXISTS exec_person (
    id SERIAL PRIMARY KEY,
    display_name VARCHAR(255) NOT NULL,
    position_title VARCHAR(255),
    org_unit_id INTEGER,
    org_name VARCHAR(255),
    is_external BOOLEAN DEFAULT false,
    record_state VARCHAR(32) DEFAULT 'active',
    confidentiality VARCHAR(32) DEFAULT 'internal',
    is_anonymized BOOLEAN DEFAULT true,
    note TEXT,
    verification_status VARCHAR(32) DEFAULT 'user_draft',
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS exec_person_user_link (
    id SERIAL PRIMARY KEY,
    person_id INTEGER NOT NULL REFERENCES exec_person(id),
    user_id INTEGER,
    linked_at TIMESTAMP DEFAULT now(),
    unlinked_at TIMESTAMP,
    linked_by VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS exec_initiative (
    id SERIAL PRIMARY KEY,
    code VARCHAR(64),
    title VARCHAR(500) NOT NULL,
    summary TEXT,
    problem TEXT,
    goal TEXT,
    expected_result TEXT,
    customer_unit_id INTEGER,
    owner_person_id INTEGER REFERENCES exec_person(id),
    manager_person_id INTEGER REFERENCES exec_person(id),
    curator_person_id INTEGER REFERENCES exec_person(id),
    realization_form VARCHAR(64),
    scale VARCHAR(64),
    priority VARCHAR(64),
    status VARCHAR(64) DEFAULT 'idea',
    stage VARCHAR(64),
    plan_start DATE,
    plan_end DATE,
    fact_start DATE,
    fact_end DATE,
    solution_title VARCHAR(500),
    solution_type VARCHAR(64),
    effect_description TEXT,
    effect_owner_person_id INTEGER REFERENCES exec_person(id),
    effect_metric VARCHAR(255),
    effect_baseline VARCHAR(128),
    effect_target VARCHAR(128),
    effect_actual VARCHAR(128),
    budget_need VARCHAR(128),
    budget_source VARCHAR(255),
    escalation_level VARCHAR(64),
    verification_status VARCHAR(32) DEFAULT 'user_draft',
    is_test_data BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS exec_role_template (
    id SERIAL PRIMARY KEY,
    code VARCHAR(64) UNIQUE NOT NULL,
    title VARCHAR(255) NOT NULL,
    purpose TEXT,
    role_kind VARCHAR(64),
    duties TEXT,
    authorities TEXT,
    limitations TEXT,
    appointed_by VARCHAR(255),
    escalates_to VARCHAR(255),
    is_mandatory BOOLEAN DEFAULT false,
    sort_order INTEGER DEFAULT 100,
    created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS exec_role_assignment (
    id SERIAL PRIMARY KEY,
    initiative_id INTEGER NOT NULL REFERENCES exec_initiative(id),
    role_code VARCHAR(64) NOT NULL REFERENCES exec_role_template(code),
    person_id INTEGER REFERENCES exec_person(id),
    org_unit_id INTEGER,
    collegial_body_id INTEGER,
    date_from DATE,
    date_to DATE,
    authority_limits TEXT,
    deputy_person_id INTEGER REFERENCES exec_person(id),
    status VARCHAR(32) DEFAULT 'active',
    verification_status VARCHAR(32) DEFAULT 'user_draft',
    confirmed_by VARCHAR(255),
    confirmed_at TIMESTAMP,
    created_by VARCHAR(255),
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now()
);
