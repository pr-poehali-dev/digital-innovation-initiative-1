
-- Этап 1: Educational Passport MVP
CREATE TABLE education_items (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    kind VARCHAR(32) NOT NULL,
    -- kind: degree / certificate / course / program / book / lecture / presentation / methodology / notes / article / material / other

    title VARCHAR(500) NOT NULL,
    issuer_name VARCHAR(500),
    institution_name VARCHAR(500),
    description TEXT,
    field_of_study VARCHAR(255),
    level VARCHAR(64),
    -- level: bachelor / master / phd / professional / online / school / other

    start_date DATE,
    end_date DATE,
    issued_at DATE,
    hours INTEGER,
    grade VARCHAR(64),
    language VARCHAR(32) DEFAULT 'ru',

    status VARCHAR(32) DEFAULT 'draft',
    -- status: draft / processing / needs_review / confirmed / archived

    study_status VARCHAR(32),
    -- study_status: uploaded_only / started / partial / studied / applied

    confidence VARCHAR(16) DEFAULT 'medium',
    -- confidence: high / medium / low

    source_type VARCHAR(32) DEFAULT 'manual',
    -- source_type: manual / uploaded_file / ai_extracted

    is_confirmed BOOLEAN DEFAULT false,
    confirmed_at TIMESTAMP,

    extracted_json TEXT,
    topics_json TEXT,
    competencies_json TEXT,

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    archived_at TIMESTAMP
);

CREATE INDEX idx_edu_user_active ON education_items(user_id) WHERE archived_at IS NULL;
CREATE INDEX idx_edu_kind ON education_items(user_id, kind) WHERE archived_at IS NULL;
CREATE INDEX idx_edu_status ON education_items(user_id, status) WHERE archived_at IS NULL;


CREATE TABLE education_item_files (
    id SERIAL PRIMARY KEY,
    education_item_id INTEGER NOT NULL REFERENCES education_items(id),
    s3_key VARCHAR(512),
    original_name VARCHAR(500),
    mime_type VARCHAR(128),
    size_bytes INTEGER,
    parsed_text TEXT,
    parse_status VARCHAR(32) DEFAULT 'pending',
    -- parse_status: pending / processing / done / failed
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_edu_files_item ON education_item_files(education_item_id);
