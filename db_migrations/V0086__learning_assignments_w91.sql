-- W9.1 Linked Learning Path

CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.professional_competency_content_links (
    id                      SERIAL PRIMARY KEY,
    competency_id           INTEGER      NOT NULL REFERENCES t_p61016064_digital_innovation_i.professional_competencies(id),
    content_type            VARCHAR(32)  NOT NULL DEFAULT 'education_item',
    content_id              INTEGER,
    content_title           VARCHAR(512) NOT NULL DEFAULT '',
    content_url             VARCHAR(512) NOT NULL DEFAULT '',
    level_min               SMALLINT,
    level_max               SMALLINT,
    gap_min                 SMALLINT,
    gap_max                 SMALLINT,
    recommendation_strength VARCHAR(8)   NOT NULL DEFAULT 'medium',
    is_required             BOOLEAN      NOT NULL DEFAULT FALSE,
    match_reason            TEXT         NOT NULL DEFAULT '',
    sort_order              INTEGER      NOT NULL DEFAULT 0,
    created_by              VARCHAR(128) NOT NULL DEFAULT '',
    created_at              TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMP    NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pccl_comp ON t_p61016064_digital_innovation_i.professional_competency_content_links (competency_id, recommendation_strength DESC, sort_order);

CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.professional_learning_assignments (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER      NOT NULL,
    plan_id         INTEGER      REFERENCES t_p61016064_digital_innovation_i.professional_growth_plans(id),
    plan_item_id    INTEGER      REFERENCES t_p61016064_digital_innovation_i.professional_growth_plan_items(id),
    competency_id   INTEGER      REFERENCES t_p61016064_digital_innovation_i.professional_competencies(id),
    link_id         INTEGER      REFERENCES t_p61016064_digital_innovation_i.professional_competency_content_links(id),
    content_type    VARCHAR(32)  NOT NULL DEFAULT 'education_item',
    content_id      INTEGER,
    content_title   VARCHAR(512) NOT NULL DEFAULT '',
    content_url     VARCHAR(512) NOT NULL DEFAULT '',
    source          VARCHAR(16)  NOT NULL DEFAULT 'recommended',
    status          VARCHAR(16)  NOT NULL DEFAULT 'recommended',
    reason_text     TEXT         NOT NULL DEFAULT '',
    progress_pct    SMALLINT,
    assigned_at     TIMESTAMP    NOT NULL DEFAULT NOW(),
    started_at      TIMESTAMP,
    completed_at    TIMESTAMP,
    created_at      TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP    NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pla_user   ON t_p61016064_digital_innovation_i.professional_learning_assignments (user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pla_plan   ON t_p61016064_digital_innovation_i.professional_learning_assignments (plan_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pla_dedup ON t_p61016064_digital_innovation_i.professional_learning_assignments
    (user_id, COALESCE(link_id, -1), COALESCE(content_id, -1), content_type)
    WHERE status != 'skipped';
