-- W7.3: Watchlists + Alerts

CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.admin_strategy_watchlists (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(256)  NOT NULL DEFAULT '',
    description TEXT          NOT NULL DEFAULT '',
    scope_type  VARCHAR(32)   NOT NULL DEFAULT 'global',   -- global|segment|initiative|roadmap|custom
    scope_ref   VARCHAR(128)  NOT NULL DEFAULT '',
    filters_json JSONB        NOT NULL DEFAULT '{}',
    rules_json  JSONB         NOT NULL DEFAULT '[]',
    status      VARCHAR(16)   NOT NULL DEFAULT 'active',   -- active|paused
    is_system   BOOLEAN       NOT NULL DEFAULT FALSE,
    created_by  VARCHAR(128)  NOT NULL DEFAULT '',
    created_at  TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP     NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.admin_strategy_alerts (
    id                 SERIAL PRIMARY KEY,
    watchlist_id       INTEGER,
    alert_type         VARCHAR(64)   NOT NULL DEFAULT '',
    severity           VARCHAR(16)   NOT NULL DEFAULT 'info',      -- info|warning|critical
    status             VARCHAR(16)   NOT NULL DEFAULT 'open',      -- open|acknowledged|resolved|dismissed
    title              VARCHAR(512)  NOT NULL DEFAULT '',
    message            TEXT          NOT NULL DEFAULT '',
    metric_key         VARCHAR(128),
    entity_type        VARCHAR(32),   -- initiative|decision|roadmap|segment|global
    entity_id          INTEGER,
    baseline_value     NUMERIC,
    current_value      NUMERIC,
    delta_value        NUMERIC,
    threshold_json     JSONB         NOT NULL DEFAULT '{}',
    evidence_json      JSONB         NOT NULL DEFAULT '{}',
    first_triggered_at TIMESTAMP     NOT NULL DEFAULT NOW(),
    last_triggered_at  TIMESTAMP     NOT NULL DEFAULT NOW(),
    resolved_at        TIMESTAMP,
    assigned_to        VARCHAR(128),
    created_at         TIMESTAMP     NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_asal_dedup ON t_p61016064_digital_innovation_i.admin_strategy_alerts
    (watchlist_id, alert_type, COALESCE(entity_type,''), COALESCE(entity_id::text,''), COALESCE(metric_key,''))
    WHERE status IN ('open','acknowledged');

CREATE INDEX IF NOT EXISTS idx_asal_status   ON t_p61016064_digital_innovation_i.admin_strategy_alerts (status, severity, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_asal_wl       ON t_p61016064_digital_innovation_i.admin_strategy_alerts (watchlist_id, status);

-- Seed: system watchlists
INSERT INTO t_p61016064_digital_innovation_i.admin_strategy_watchlists
    (name, description, scope_type, is_system, rules_json, created_by)
VALUES
(
    'Global Product Health',
    'Ключевые метрики продукта: activation rate, stalled goals, повторные тикеты',
    'global', TRUE,
    '[
        {"id":"act_drop",  "alert_type":"metric_drop",          "metric":"activation_rate",      "operator":"below",         "threshold":25, "severity":"warning",  "compare_mode":"absolute"},
        {"id":"stall_high","alert_type":"stalled_rate_high",    "metric":"stalled_goals_rate",   "operator":"above",         "threshold":40, "severity":"warning",  "compare_mode":"absolute"},
        {"id":"tkt_spike", "alert_type":"repeat_ticket_rate_high","metric":"repeat_ticket_rate", "operator":"pct_change_gt", "threshold":15, "severity":"critical", "compare_window":"previous_period"}
    ]'::jsonb,
    'system'
),
(
    'Execution Risks',
    'Инициативы: просроченные, без обновлений, красные по health',
    'initiative', TRUE,
    '[
        {"id":"init_over", "alert_type":"initiative_overdue",      "entity":"initiative","condition":"overdue_days_gt",    "threshold":0,  "severity":"critical"},
        {"id":"init_stale","alert_type":"initiative_stale_update", "entity":"initiative","condition":"no_updates_days_gt", "threshold":7,  "severity":"warning"},
        {"id":"init_red",  "alert_type":"metric_drop",             "entity":"initiative","condition":"health_eq",          "value":"red",  "severity":"warning"}
    ]'::jsonb,
    'system'
),
(
    'Decision Follow-up',
    'Открытые решения с просроченным дедлайном',
    'custom', TRUE,
    '[
        {"id":"dec_over",  "alert_type":"decision_overdue", "entity":"decision","condition":"overdue_days_gt","threshold":0,"severity":"warning"}
    ]'::jsonb,
    'system'
),
(
    'Roadmap Flow',
    'Задачи в статусе Now, застрявшие слишком долго',
    'roadmap', TRUE,
    '[
        {"id":"rm_stuck",  "alert_type":"roadmap_now_stuck","entity":"roadmap","condition":"now_days_gt","threshold":21,"severity":"info"}
    ]'::jsonb,
    'system'
);
