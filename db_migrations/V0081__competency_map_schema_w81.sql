-- W8.1 Competency Map Foundations: PM/Operations vertical

CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.professional_competency_domains (
    id           SERIAL PRIMARY KEY,
    vertical_key VARCHAR(64)  NOT NULL DEFAULT 'pm_operations',
    code         VARCHAR(32)  NOT NULL UNIQUE,
    name         VARCHAR(256) NOT NULL,
    description  TEXT         NOT NULL DEFAULT '',
    sort_order   INTEGER      NOT NULL DEFAULT 0,
    created_at   TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.professional_competencies (
    id                    SERIAL PRIMARY KEY,
    domain_id             INTEGER      NOT NULL REFERENCES t_p61016064_digital_innovation_i.professional_competency_domains(id),
    code                  VARCHAR(64)  NOT NULL UNIQUE,
    name                  VARCHAR(256) NOT NULL,
    description           TEXT         NOT NULL DEFAULT '',
    level_descriptors_json JSONB        NOT NULL DEFAULT '{}',
    status                VARCHAR(16)  NOT NULL DEFAULT 'active',
    sort_order            INTEGER      NOT NULL DEFAULT 0,
    created_at            TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prof_comp_domain ON t_p61016064_digital_innovation_i.professional_competencies (domain_id, sort_order);

CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.professional_role_profiles (
    id           SERIAL PRIMARY KEY,
    vertical_key VARCHAR(64)  NOT NULL DEFAULT 'pm_operations',
    code         VARCHAR(64)  NOT NULL UNIQUE,
    name         VARCHAR(256) NOT NULL,
    description  TEXT         NOT NULL DEFAULT '',
    created_at   TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.professional_role_competency_targets (
    id              SERIAL PRIMARY KEY,
    role_profile_id INTEGER     NOT NULL REFERENCES t_p61016064_digital_innovation_i.professional_role_profiles(id),
    competency_id   INTEGER     NOT NULL REFERENCES t_p61016064_digital_innovation_i.professional_competencies(id),
    target_level    SMALLINT    NOT NULL DEFAULT 3,
    importance      VARCHAR(16) NOT NULL DEFAULT 'important',
    created_at      TIMESTAMP   NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP   NOT NULL DEFAULT NOW(),
    UNIQUE(role_profile_id, competency_id)
);

CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.professional_user_competencies (
    id               SERIAL PRIMARY KEY,
    user_id          INTEGER     NOT NULL,
    competency_id    INTEGER     NOT NULL REFERENCES t_p61016064_digital_innovation_i.professional_competencies(id),
    current_level    SMALLINT    NOT NULL DEFAULT 0,
    confidence       VARCHAR(16) NOT NULL DEFAULT 'low',
    source_summary_json JSONB    NOT NULL DEFAULT '[]',
    last_assessed_at TIMESTAMP,
    updated_at       TIMESTAMP   NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, competency_id)
);

CREATE INDEX IF NOT EXISTS idx_prof_uc_user ON t_p61016064_digital_innovation_i.professional_user_competencies (user_id);

CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.professional_competency_evidence (
    id               SERIAL PRIMARY KEY,
    user_competency_id INTEGER    NOT NULL REFERENCES t_p61016064_digital_innovation_i.professional_user_competencies(id),
    evidence_type    VARCHAR(32)  NOT NULL DEFAULT 'self_assessment',
    title            VARCHAR(512) NOT NULL DEFAULT '',
    description      TEXT         NOT NULL DEFAULT '',
    score            NUMERIC,
    weight           NUMERIC,
    source_ref       VARCHAR(512),
    created_at       TIMESTAMP    NOT NULL DEFAULT NOW()
);
