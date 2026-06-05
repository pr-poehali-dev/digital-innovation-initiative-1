-- User internal notes
CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.admin_user_notes (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER      NOT NULL,
    note_text   TEXT         NOT NULL DEFAULT '',
    visibility  VARCHAR(16)  NOT NULL DEFAULT 'internal',
    created_at  TIMESTAMP    NOT NULL DEFAULT NOW(),
    created_by  VARCHAR(128) NOT NULL DEFAULT '',
    updated_at  TIMESTAMP,
    updated_by  VARCHAR(128)
);

CREATE INDEX IF NOT EXISTS idx_user_notes_user ON t_p61016064_digital_innovation_i.admin_user_notes (user_id, created_at DESC);

-- User casework flags (наблюдения, маркеры — не блокировка)
CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.admin_user_case_flags (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER      NOT NULL,
    flag_type   VARCHAR(64)  NOT NULL DEFAULT 'observation',
    title       VARCHAR(256) NOT NULL DEFAULT '',
    description TEXT         NOT NULL DEFAULT '',
    status      VARCHAR(16)  NOT NULL DEFAULT 'open',
    created_at  TIMESTAMP    NOT NULL DEFAULT NOW(),
    created_by  VARCHAR(128) NOT NULL DEFAULT '',
    resolved_at TIMESTAMP,
    resolved_by VARCHAR(128)
);

CREATE INDEX IF NOT EXISTS idx_user_case_flags_user ON t_p61016064_digital_innovation_i.admin_user_case_flags (user_id, status);
