-- W7.2: Weekly Reviews + Decision Log

CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.admin_strategy_weekly_reviews (
    id                       SERIAL PRIMARY KEY,
    week_start               DATE          NOT NULL,
    week_end                 DATE          NOT NULL,
    status                   VARCHAR(16)   NOT NULL DEFAULT 'draft',   -- draft | published
    title                    VARCHAR(256)  NOT NULL DEFAULT '',
    summary_json             JSONB         NOT NULL DEFAULT '{}',
    metrics_snapshot_json    JSONB         NOT NULL DEFAULT '{}',
    initiatives_snapshot_json JSONB        NOT NULL DEFAULT '{}',
    roadmap_snapshot_json    JSONB         NOT NULL DEFAULT '{}',
    scenarios_snapshot_json  JSONB         NOT NULL DEFAULT '{}',
    ai_digest_json           JSONB         NOT NULL DEFAULT '{}',
    confidence               VARCHAR(16)   NOT NULL DEFAULT 'low',
    created_by               VARCHAR(128)  NOT NULL DEFAULT '',
    published_by             VARCHAR(128)  NOT NULL DEFAULT '',
    created_at               TIMESTAMP     NOT NULL DEFAULT NOW(),
    published_at             TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_aswr_week ON t_p61016064_digital_innovation_i.admin_strategy_weekly_reviews (week_start DESC, status);

CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.admin_strategy_decisions (
    id                    SERIAL PRIMARY KEY,
    review_id             INTEGER,
    title                 VARCHAR(512)  NOT NULL DEFAULT '',
    description           TEXT          NOT NULL DEFAULT '',
    decision_type         VARCHAR(32)   NOT NULL DEFAULT 'other',   -- priority|scope|owner|metric|process|risk|other
    status                VARCHAR(16)   NOT NULL DEFAULT 'open',    -- open|decided|in_progress|done|archived
    owner                 VARCHAR(128)  NOT NULL DEFAULT '',
    linked_initiative_id  INTEGER,
    linked_roadmap_item_id INTEGER,
    due_date              DATE,
    notes_json            JSONB         NOT NULL DEFAULT '[]',
    created_by            VARCHAR(128)  NOT NULL DEFAULT '',
    updated_by            VARCHAR(128)  NOT NULL DEFAULT '',
    created_at            TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMP     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_asd_status  ON t_p61016064_digital_innovation_i.admin_strategy_decisions (status, due_date);
CREATE INDEX IF NOT EXISTS idx_asd_review  ON t_p61016064_digital_innovation_i.admin_strategy_decisions (review_id);
