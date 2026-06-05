-- W5.2: Ticket Automation Rules

CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.ticket_automation_rules (
    id           SERIAL PRIMARY KEY,
    name         VARCHAR(256)  NOT NULL DEFAULT '',
    description  TEXT          NOT NULL DEFAULT '',
    enabled      BOOLEAN       NOT NULL DEFAULT TRUE,
    -- trigger: new_ticket | status_changed | priority_changed | stale | unassigned_timeout
    trigger_type VARCHAR(64)   NOT NULL DEFAULT 'new_ticket',
    -- conditions (jsonb array of {field, op, value})
    conditions   JSONB         NOT NULL DEFAULT '[]',
    -- actions (jsonb array of {type, value})
    rule_actions JSONB         NOT NULL DEFAULT '[]',
    -- ordering / priority
    order_index  INTEGER       NOT NULL DEFAULT 0,
    -- run stats
    run_count    INTEGER       NOT NULL DEFAULT 0,
    last_run_at  TIMESTAMP,
    created_at   TIMESTAMP     NOT NULL DEFAULT NOW(),
    created_by   VARCHAR(128)  NOT NULL DEFAULT '',
    updated_at   TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_by   VARCHAR(128)  NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_tar_enabled ON t_p61016064_digital_innovation_i.ticket_automation_rules (enabled, trigger_type);

-- Execution log: одна запись на каждый запуск правила над тикетом
CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.ticket_automation_log (
    id          SERIAL PRIMARY KEY,
    rule_id     INTEGER       NOT NULL,
    ticket_id   INTEGER       NOT NULL,
    ticket_no   VARCHAR(20)   NOT NULL DEFAULT '',
    triggered_by VARCHAR(64)  NOT NULL DEFAULT '',  -- trigger_type value
    actions_taken JSONB       NOT NULL DEFAULT '[]',
    created_at  TIMESTAMP     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tal_rule    ON t_p61016064_digital_innovation_i.ticket_automation_log (rule_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tal_ticket  ON t_p61016064_digital_innovation_i.ticket_automation_log (ticket_id);
