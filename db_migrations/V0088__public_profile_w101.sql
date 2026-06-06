-- W10.1 Public Professional Profile (opt-in, consent-first)

CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.professional_public_profiles (
    id                              SERIAL PRIMARY KEY,
    user_id                         INTEGER      NOT NULL UNIQUE,
    is_published                    BOOLEAN      NOT NULL DEFAULT FALSE,
    public_slug                     VARCHAR(64)  NOT NULL UNIQUE,
    public_title                    VARCHAR(256),
    public_summary                  TEXT,
    show_headline                   BOOLEAN      NOT NULL DEFAULT TRUE,
    show_bio                        BOOLEAN      NOT NULL DEFAULT TRUE,
    show_location                   BOOLEAN      NOT NULL DEFAULT FALSE,
    show_roles                      BOOLEAN      NOT NULL DEFAULT TRUE,
    show_experience                 BOOLEAN      NOT NULL DEFAULT TRUE,
    show_education                  BOOLEAN      NOT NULL DEFAULT TRUE,
    show_links                      BOOLEAN      NOT NULL DEFAULT TRUE,
    show_competency_strengths       BOOLEAN      NOT NULL DEFAULT FALSE,
    show_verified_evidence_summary  BOOLEAN      NOT NULL DEFAULT FALSE,
    show_availability               BOOLEAN      NOT NULL DEFAULT FALSE,
    show_contact                    BOOLEAN      NOT NULL DEFAULT FALSE,
    allow_indexing                  BOOLEAN      NOT NULL DEFAULT FALSE,
    published_at                    TIMESTAMP,
    updated_at                      TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ppp_slug ON t_p61016064_digital_innovation_i.professional_public_profiles (public_slug) WHERE is_published = TRUE;
CREATE INDEX IF NOT EXISTS idx_ppp_user ON t_p61016064_digital_innovation_i.professional_public_profiles (user_id);
