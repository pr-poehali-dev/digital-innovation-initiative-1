CREATE SEQUENCE IF NOT EXISTS t_p61016064_digital_innovation_i.ticket_no_seq START 1001;

CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.admin_tickets (
    id                  SERIAL PRIMARY KEY,
    ticket_no           VARCHAR(20)  NOT NULL UNIQUE,
    status              VARCHAR(32)  NOT NULL DEFAULT 'new',
    priority            VARCHAR(16)  NOT NULL DEFAULT 'medium',
    source              VARCHAR(32)  NOT NULL DEFAULT 'manual',
    module_slug         VARCHAR(64)  NOT NULL DEFAULT '',
    requester_name      VARCHAR(256) NOT NULL DEFAULT '',
    requester_email     VARCHAR(256) NOT NULL DEFAULT '',
    requester_user_id   INTEGER,
    subject             VARCHAR(512) NOT NULL DEFAULT '',
    body                TEXT         NOT NULL DEFAULT '',
    assignee_email      VARCHAR(256) NOT NULL DEFAULT '',
    owner_email         VARCHAR(256) NOT NULL DEFAULT '',
    tags_json           JSONB        NOT NULL DEFAULT '[]',
    first_response_at   TIMESTAMP,
    last_message_at     TIMESTAMP,
    resolved_at         TIMESTAMP,
    closed_at           TIMESTAMP,
    created_at          TIMESTAMP    NOT NULL DEFAULT NOW(),
    created_by          VARCHAR(128) NOT NULL DEFAULT '',
    updated_at          TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_by          VARCHAR(128) NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_admin_tickets_status   ON t_p61016064_digital_innovation_i.admin_tickets (status);
CREATE INDEX IF NOT EXISTS idx_admin_tickets_priority ON t_p61016064_digital_innovation_i.admin_tickets (priority);
CREATE INDEX IF NOT EXISTS idx_admin_tickets_module   ON t_p61016064_digital_innovation_i.admin_tickets (module_slug);
CREATE INDEX IF NOT EXISTS idx_admin_tickets_assignee ON t_p61016064_digital_innovation_i.admin_tickets (assignee_email);

CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.admin_ticket_messages (
    id           SERIAL PRIMARY KEY,
    ticket_id    INTEGER      NOT NULL REFERENCES t_p61016064_digital_innovation_i.admin_tickets(id),
    message_type VARCHAR(32)  NOT NULL DEFAULT 'public_reply',
    author_name  VARCHAR(256) NOT NULL DEFAULT '',
    author_email VARCHAR(256) NOT NULL DEFAULT '',
    body         TEXT         NOT NULL DEFAULT '',
    created_at   TIMESTAMP    NOT NULL DEFAULT NOW(),
    created_by   VARCHAR(128) NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket ON t_p61016064_digital_innovation_i.admin_ticket_messages (ticket_id, created_at);
