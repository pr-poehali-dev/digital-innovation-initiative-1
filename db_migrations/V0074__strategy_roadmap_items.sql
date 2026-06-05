-- W6.2: Strategy Roadmap Items

CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.admin_strategy_roadmap_items (
    id                 SERIAL PRIMARY KEY,
    title              VARCHAR(512)  NOT NULL DEFAULT '',
    description        TEXT          NOT NULL DEFAULT '',
    lane               VARCHAR(16)   NOT NULL DEFAULT 'next',  -- now | next | later
    status             VARCHAR(16)   NOT NULL DEFAULT 'idea',  -- idea | planned | in_progress | done | archived
    -- source linking
    source_type        VARCHAR(32)   NOT NULL DEFAULT 'manual', -- summary | hypothesis | segment_plan | next_action | manual
    source_report_id   INTEGER,
    source_payload     JSONB         NOT NULL DEFAULT '{}',
    -- strategic metadata
    target_segment     VARCHAR(256)  NOT NULL DEFAULT '',
    target_metric      VARCHAR(256)  NOT NULL DEFAULT '',
    impact             VARCHAR(16)   NOT NULL DEFAULT 'medium', -- high | medium | low
    effort             VARCHAR(16)   NOT NULL DEFAULT 'medium',
    confidence         VARCHAR(16)   NOT NULL DEFAULT 'medium',
    -- ownership
    owner              VARCHAR(128)  NOT NULL DEFAULT '',
    sort_order         INTEGER       NOT NULL DEFAULT 0,
    -- audit
    created_by         VARCHAR(128)  NOT NULL DEFAULT '',
    updated_by         VARCHAR(128)  NOT NULL DEFAULT '',
    created_at         TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMP     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_asri_lane   ON t_p61016064_digital_innovation_i.admin_strategy_roadmap_items (lane, status, sort_order);
CREATE INDEX IF NOT EXISTS idx_asri_source ON t_p61016064_digital_innovation_i.admin_strategy_roadmap_items (source_report_id);

-- Add meta_json to reports table for data_maturity tracking
ALTER TABLE t_p61016064_digital_innovation_i.admin_strategy_reports
  ADD COLUMN IF NOT EXISTS meta_json JSONB NOT NULL DEFAULT '{}';
