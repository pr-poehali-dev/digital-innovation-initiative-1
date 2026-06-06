-- W8.3 Growth Navigator: plans + items + checkins

CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.professional_growth_plans (
    id                      SERIAL PRIMARY KEY,
    user_id                 INTEGER      NOT NULL,
    target_role_profile_id  INTEGER      REFERENCES t_p61016064_digital_innovation_i.professional_role_profiles(id),
    status                  VARCHAR(16)  NOT NULL DEFAULT 'active',
    plan_version            SMALLINT     NOT NULL DEFAULT 1,
    source_snapshot_json    JSONB        NOT NULL DEFAULT '{}',
    summary_json            JSONB        NOT NULL DEFAULT '{}',
    created_at              TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMP    NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, status) DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX IF NOT EXISTS idx_pgp_user ON t_p61016064_digital_innovation_i.professional_growth_plans (user_id, status);

CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.professional_growth_plan_items (
    id                  SERIAL PRIMARY KEY,
    plan_id             INTEGER      NOT NULL REFERENCES t_p61016064_digital_innovation_i.professional_growth_plans(id),
    competency_id       INTEGER      REFERENCES t_p61016064_digital_innovation_i.professional_competencies(id),
    item_type           VARCHAR(16)  NOT NULL DEFAULT 'learn',
    title               VARCHAR(512) NOT NULL DEFAULT '',
    description         TEXT         NOT NULL DEFAULT '',
    priority            VARCHAR(8)   NOT NULL DEFAULT 'medium',
    current_level       SMALLINT,
    target_level        SMALLINT,
    gap_value           SMALLINT,
    importance          VARCHAR(16),
    linked_content_type VARCHAR(32),
    linked_content_id   INTEGER,
    status              VARCHAR(16)  NOT NULL DEFAULT 'not_started',
    sort_order          INTEGER      NOT NULL DEFAULT 0,
    due_date            DATE,
    created_at          TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMP    NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pgpi_plan ON t_p61016064_digital_innovation_i.professional_growth_plan_items (plan_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_pgpi_status ON t_p61016064_digital_innovation_i.professional_growth_plan_items (plan_id, status, priority);

CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.professional_growth_checkins (
    id             SERIAL PRIMARY KEY,
    plan_id        INTEGER   NOT NULL REFERENCES t_p61016064_digital_innovation_i.professional_growth_plans(id),
    user_id        INTEGER   NOT NULL,
    note           TEXT      NOT NULL DEFAULT '',
    progress_note  TEXT      NOT NULL DEFAULT '',
    blockers_note  TEXT      NOT NULL DEFAULT '',
    created_at     TIMESTAMP NOT NULL DEFAULT NOW()
);
