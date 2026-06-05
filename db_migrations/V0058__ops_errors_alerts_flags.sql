CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.admin_errors (
    id                SERIAL PRIMARY KEY,
    title             VARCHAR(512) NOT NULL,
    fingerprint       VARCHAR(256) NOT NULL DEFAULT '',
    module_slug       VARCHAR(64)  NOT NULL DEFAULT '',
    source            VARCHAR(256) NOT NULL DEFAULT '',
    environment       VARCHAR(32)  NOT NULL DEFAULT 'production',
    severity          VARCHAR(16)  NOT NULL DEFAULT 'medium',
    status            VARCHAR(32)  NOT NULL DEFAULT 'open',
    occurrences_count INTEGER      NOT NULL DEFAULT 1,
    first_seen_at     TIMESTAMP    NOT NULL DEFAULT NOW(),
    last_seen_at      TIMESTAMP    NOT NULL DEFAULT NOW(),
    owner_email       VARCHAR(256) NOT NULL DEFAULT '',
    details           TEXT         NOT NULL DEFAULT '',
    resolution_notes  TEXT         NOT NULL DEFAULT '',
    created_at        TIMESTAMP    NOT NULL DEFAULT NOW(),
    created_by        VARCHAR(128) NOT NULL DEFAULT '',
    updated_at        TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_by        VARCHAR(128) NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.admin_alerts (
    id               SERIAL PRIMARY KEY,
    name             VARCHAR(256) NOT NULL,
    module_slug      VARCHAR(64)  NOT NULL DEFAULT '',
    condition_text   TEXT         NOT NULL DEFAULT '',
    threshold_value  VARCHAR(128) NOT NULL DEFAULT '',
    window_minutes   INTEGER      NOT NULL DEFAULT 60,
    severity         VARCHAR(16)  NOT NULL DEFAULT 'medium',
    status           VARCHAR(32)  NOT NULL DEFAULT 'active',
    channel          VARCHAR(128) NOT NULL DEFAULT '',
    owner_email      VARCHAR(256) NOT NULL DEFAULT '',
    last_triggered_at TIMESTAMP,
    notes            TEXT         NOT NULL DEFAULT '',
    created_at       TIMESTAMP    NOT NULL DEFAULT NOW(),
    created_by       VARCHAR(128) NOT NULL DEFAULT '',
    updated_at       TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_by       VARCHAR(128) NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.admin_feature_flags (
    id              SERIAL PRIMARY KEY,
    key             VARCHAR(128) NOT NULL UNIQUE,
    name            VARCHAR(256) NOT NULL,
    description     TEXT         NOT NULL DEFAULT '',
    environment     VARCHAR(32)  NOT NULL DEFAULT 'production',
    enabled         BOOLEAN      NOT NULL DEFAULT FALSE,
    rollout_percent INTEGER      NOT NULL DEFAULT 100,
    owner_email     VARCHAR(256) NOT NULL DEFAULT '',
    status          VARCHAR(32)  NOT NULL DEFAULT 'active',
    notes           TEXT         NOT NULL DEFAULT '',
    created_at      TIMESTAMP    NOT NULL DEFAULT NOW(),
    created_by      VARCHAR(128) NOT NULL DEFAULT '',
    updated_at      TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_by      VARCHAR(128) NOT NULL DEFAULT ''
);
