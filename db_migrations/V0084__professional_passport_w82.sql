-- W8.2 Professional Passport: identity + education + work + visibility

CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.professional_passports (
    id                    SERIAL PRIMARY KEY,
    user_id               INTEGER      NOT NULL UNIQUE,
    full_name             VARCHAR(256) NOT NULL DEFAULT '',
    headline              VARCHAR(256) NOT NULL DEFAULT '',
    short_bio             TEXT         NOT NULL DEFAULT '',
    country               VARCHAR(128) NOT NULL DEFAULT '',
    city                  VARCHAR(128) NOT NULL DEFAULT '',
    timezone              VARCHAR(64)  NOT NULL DEFAULT '',
    languages_json        JSONB        NOT NULL DEFAULT '[]',
    primary_role          VARCHAR(128) NOT NULL DEFAULT '',
    secondary_roles_json  JSONB        NOT NULL DEFAULT '[]',
    years_experience      SMALLINT,
    career_stage          VARCHAR(32)  NOT NULL DEFAULT '',
    target_roles_json     JSONB        NOT NULL DEFAULT '[]',
    development_interests_json JSONB   NOT NULL DEFAULT '[]',
    industries_json       JSONB        NOT NULL DEFAULT '[]',
    work_preferences_json JSONB        NOT NULL DEFAULT '{}',
    career_goals_json     JSONB        NOT NULL DEFAULT '[]',
    links_json            JSONB        NOT NULL DEFAULT '{}',
    avatar_url            VARCHAR(512),
    created_at            TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.professional_education (
    id               SERIAL PRIMARY KEY,
    user_id          INTEGER      NOT NULL,
    institution      VARCHAR(256) NOT NULL DEFAULT '',
    degree           VARCHAR(128) NOT NULL DEFAULT '',
    field_of_study   VARCHAR(256) NOT NULL DEFAULT '',
    start_date       DATE,
    end_date         DATE,
    is_current       BOOLEAN      NOT NULL DEFAULT FALSE,
    description      TEXT         NOT NULL DEFAULT '',
    created_at       TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMP    NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_prof_edu_user ON t_p61016064_digital_innovation_i.professional_education (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.professional_work_experience (
    id                SERIAL PRIMARY KEY,
    user_id           INTEGER      NOT NULL,
    company_name      VARCHAR(256) NOT NULL DEFAULT '',
    title             VARCHAR(256) NOT NULL DEFAULT '',
    employment_type   VARCHAR(32)  NOT NULL DEFAULT 'full_time',
    start_date        DATE,
    end_date          DATE,
    is_current        BOOLEAN      NOT NULL DEFAULT FALSE,
    description       TEXT         NOT NULL DEFAULT '',
    achievements_json JSONB        NOT NULL DEFAULT '[]',
    skills_json       JSONB        NOT NULL DEFAULT '[]',
    created_at        TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMP    NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_prof_work_user ON t_p61016064_digital_innovation_i.professional_work_experience (user_id, start_date DESC NULLS LAST);

CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.professional_visibility_settings (
    id                      SERIAL PRIMARY KEY,
    user_id                 INTEGER      NOT NULL UNIQUE,
    profile_visibility      VARCHAR(16)  NOT NULL DEFAULT 'private',
    talent_directory_opt_in BOOLEAN      NOT NULL DEFAULT FALSE,
    show_competency_map     BOOLEAN      NOT NULL DEFAULT FALSE,
    show_contact            BOOLEAN      NOT NULL DEFAULT FALSE,
    show_experience_details BOOLEAN      NOT NULL DEFAULT TRUE,
    available_for_roles     BOOLEAN      NOT NULL DEFAULT FALSE,
    availability_note       VARCHAR(512),
    updated_at              TIMESTAMP    NOT NULL DEFAULT NOW()
);
