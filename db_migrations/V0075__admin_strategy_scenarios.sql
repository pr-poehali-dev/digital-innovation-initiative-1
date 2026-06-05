-- W6.3: Strategy Scenarios

CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.admin_strategy_scenarios (
    id                   SERIAL PRIMARY KEY,
    name                 VARCHAR(256)  NOT NULL DEFAULT '',
    scenario_type        VARCHAR(64)   NOT NULL DEFAULT 'activation_uplift',
    period_start         DATE,
    period_end           DATE,
    filters_json         JSONB         NOT NULL DEFAULT '{}',
    assumptions_json     JSONB         NOT NULL DEFAULT '{}',
    baseline_metrics     JSONB         NOT NULL DEFAULT '{}',
    projected_metrics    JSONB         NOT NULL DEFAULT '{}',
    delta_metrics        JSONB         NOT NULL DEFAULT '{}',
    ai_commentary        JSONB         NOT NULL DEFAULT '{}',
    sample_size          INTEGER       NOT NULL DEFAULT 0,
    confidence           VARCHAR(16)   NOT NULL DEFAULT 'low',
    created_by           VARCHAR(128)  NOT NULL DEFAULT '',
    created_at           TIMESTAMP     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ass_type ON t_p61016064_digital_innovation_i.admin_strategy_scenarios (scenario_type, created_at DESC);
