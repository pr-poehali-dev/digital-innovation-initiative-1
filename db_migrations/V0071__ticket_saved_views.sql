-- W5.3: Saved Views для тикетов
CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.ticket_saved_views (
    id           SERIAL PRIMARY KEY,
    name         VARCHAR(256)  NOT NULL DEFAULT '',
    description  TEXT          NOT NULL DEFAULT '',
    -- scope: personal (только создателю) | shared (всем admins)
    scope        VARCHAR(16)   NOT NULL DEFAULT 'personal',
    -- фильтры сохраняются как jsonb
    filters      JSONB         NOT NULL DEFAULT '{}',
    -- порядок в списке
    order_index  INTEGER       NOT NULL DEFAULT 0,
    -- статистика
    use_count    INTEGER       NOT NULL DEFAULT 0,
    last_used_at TIMESTAMP,
    created_at   TIMESTAMP     NOT NULL DEFAULT NOW(),
    created_by   VARCHAR(128)  NOT NULL DEFAULT '',
    updated_at   TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_by   VARCHAR(128)  NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_tsv_scope_owner ON t_p61016064_digital_innovation_i.ticket_saved_views (scope, created_by);
