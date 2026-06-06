-- W7.1: Strategy Initiatives

CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.admin_strategy_initiatives (
    id              SERIAL PRIMARY KEY,
    title           VARCHAR(512)  NOT NULL DEFAULT '',
    description     TEXT          NOT NULL DEFAULT '',
    status          VARCHAR(16)   NOT NULL DEFAULT 'draft',
    priority        VARCHAR(12)   NOT NULL DEFAULT 'medium',
    owner           VARCHAR(128)  NOT NULL DEFAULT '',
    source_type     VARCHAR(32)   NOT NULL DEFAULT 'manual',
    source_id       INTEGER,
    target_metric   VARCHAR(256)  NOT NULL DEFAULT '',
    target_segment  VARCHAR(256)  NOT NULL DEFAULT '',
    baseline_value  NUMERIC(12,2),
    target_value    NUMERIC(12,2),
    current_value   NUMERIC(12,2),
    unit            VARCHAR(32)   NOT NULL DEFAULT '',
    start_date      DATE,
    due_date        DATE,
    health          VARCHAR(8)    NOT NULL DEFAULT 'green',
    progress_pct    INTEGER       NOT NULL DEFAULT 0,
    notes_json      JSONB         NOT NULL DEFAULT '[]',
    created_by      VARCHAR(128)  NOT NULL DEFAULT '',
    updated_by      VARCHAR(128)  NOT NULL DEFAULT '',
    created_at      TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_asi_status   ON t_p61016064_digital_innovation_i.admin_strategy_initiatives (status, health);
CREATE INDEX IF NOT EXISTS idx_asi_source   ON t_p61016064_digital_innovation_i.admin_strategy_initiatives (source_type, source_id);

CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.admin_strategy_initiative_updates (
    id             SERIAL PRIMARY KEY,
    initiative_id  INTEGER       NOT NULL REFERENCES t_p61016064_digital_innovation_i.admin_strategy_initiatives(id) ON UPDATE CASCADE,
    update_text    TEXT          NOT NULL DEFAULT '',
    status_after   VARCHAR(16)   NOT NULL DEFAULT '',
    progress_pct   INTEGER,
    metric_value   NUMERIC(12,2),
    risks_json     JSONB         NOT NULL DEFAULT '[]',
    next_steps_json JSONB        NOT NULL DEFAULT '[]',
    created_by     VARCHAR(128)  NOT NULL DEFAULT '',
    created_at     TIMESTAMP     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_asiu_initiative ON t_p61016064_digital_innovation_i.admin_strategy_initiative_updates (initiative_id, created_at DESC);
