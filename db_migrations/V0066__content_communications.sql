CREATE SEQUENCE IF NOT EXISTS t_p61016064_digital_innovation_i.content_no_seq  START 1001;
CREATE SEQUENCE IF NOT EXISTS t_p61016064_digital_innovation_i.comm_no_seq     START 1001;

-- ── Content items ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.admin_content_items (
    id              SERIAL PRIMARY KEY,
    content_no      VARCHAR(20)  NOT NULL UNIQUE,
    type            VARCHAR(32)  NOT NULL DEFAULT 'announcement',
    status          VARCHAR(16)  NOT NULL DEFAULT 'draft',
    title           VARCHAR(512) NOT NULL DEFAULT '',
    slug            VARCHAR(256) NOT NULL DEFAULT '',
    summary         TEXT         NOT NULL DEFAULT '',
    body_markdown   TEXT         NOT NULL DEFAULT '',
    module_slug     VARCHAR(64)  NOT NULL DEFAULT '',
    audience        VARCHAR(32)  NOT NULL DEFAULT 'all',
    tags_json       JSONB        NOT NULL DEFAULT '[]',
    published_at    TIMESTAMP,
    created_at      TIMESTAMP    NOT NULL DEFAULT NOW(),
    created_by      VARCHAR(128) NOT NULL DEFAULT '',
    updated_at      TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_by      VARCHAR(128) NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_content_status   ON t_p61016064_digital_innovation_i.admin_content_items (status);
CREATE INDEX IF NOT EXISTS idx_content_type     ON t_p61016064_digital_innovation_i.admin_content_items (type);
CREATE INDEX IF NOT EXISTS idx_content_module   ON t_p61016064_digital_innovation_i.admin_content_items (module_slug);
CREATE INDEX IF NOT EXISTS idx_content_audience ON t_p61016064_digital_innovation_i.admin_content_items (audience);

-- ── Communications ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.admin_communications (
    id                SERIAL PRIMARY KEY,
    comm_no           VARCHAR(20)  NOT NULL UNIQUE,
    content_item_id   INTEGER      REFERENCES t_p61016064_digital_innovation_i.admin_content_items(id),
    channel           VARCHAR(32)  NOT NULL DEFAULT 'in_app',
    status            VARCHAR(16)  NOT NULL DEFAULT 'draft',
    audience          VARCHAR(32)  NOT NULL DEFAULT 'all',
    subject           VARCHAR(512) NOT NULL DEFAULT '',
    body              TEXT         NOT NULL DEFAULT '',
    module_slug       VARCHAR(64)  NOT NULL DEFAULT '',
    scheduled_at      TIMESTAMP,
    sent_at           TIMESTAMP,
    created_at        TIMESTAMP    NOT NULL DEFAULT NOW(),
    created_by        VARCHAR(128) NOT NULL DEFAULT '',
    updated_at        TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_by        VARCHAR(128) NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_comm_status  ON t_p61016064_digital_innovation_i.admin_communications (status);
CREATE INDEX IF NOT EXISTS idx_comm_channel ON t_p61016064_digital_innovation_i.admin_communications (channel);
CREATE INDEX IF NOT EXISTS idx_comm_module  ON t_p61016064_digital_innovation_i.admin_communications (module_slug);

-- ── Communication events ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.admin_communication_events (
    id               SERIAL PRIMARY KEY,
    communication_id INTEGER      NOT NULL REFERENCES t_p61016064_digital_innovation_i.admin_communications(id),
    event_type       VARCHAR(32)  NOT NULL DEFAULT 'queued',
    event_value      VARCHAR(256),
    meta_json        JSONB        NOT NULL DEFAULT '{}',
    created_at       TIMESTAMP    NOT NULL DEFAULT NOW(),
    created_by       VARCHAR(128) NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_comm_events_comm ON t_p61016064_digital_innovation_i.admin_communication_events (communication_id, created_at);
