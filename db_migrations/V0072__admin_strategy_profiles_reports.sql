-- W6.1: Strategy Intelligence

CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.admin_strategy_profiles (
    id                    SERIAL PRIMARY KEY,
    workspace_key         VARCHAR(64)   NOT NULL DEFAULT 'default' UNIQUE,
    mission_text          TEXT          NOT NULL DEFAULT '',
    north_star_name       VARCHAR(256)  NOT NULL DEFAULT '',
    north_star_definition TEXT          NOT NULL DEFAULT '',
    target_segments_json  JSONB         NOT NULL DEFAULT '[]',
    quarter_goals_json    JSONB         NOT NULL DEFAULT '[]',
    priority_themes_json  JSONB         NOT NULL DEFAULT '[]',
    non_goals_json        JSONB         NOT NULL DEFAULT '[]',
    created_by            VARCHAR(128)  NOT NULL DEFAULT '',
    updated_by            VARCHAR(128)  NOT NULL DEFAULT '',
    created_at            TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMP     NOT NULL DEFAULT NOW()
);

INSERT INTO t_p61016064_digital_innovation_i.admin_strategy_profiles
  (workspace_key, created_by, updated_by)
VALUES ('default', 'system', 'system')
ON CONFLICT (workspace_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.admin_strategy_reports (
    id            SERIAL PRIMARY KEY,
    report_type   VARCHAR(64)   NOT NULL DEFAULT 'ai_summary',
    period_start  DATE,
    period_end    DATE,
    filters_json  JSONB         NOT NULL DEFAULT '{}',
    metrics_json  JSONB         NOT NULL DEFAULT '{}',
    insights_json JSONB         NOT NULL DEFAULT '{}',
    created_by    VARCHAR(128)  NOT NULL DEFAULT '',
    created_at    TIMESTAMP     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_asr_type ON t_p61016064_digital_innovation_i.admin_strategy_reports (report_type, created_at DESC);
