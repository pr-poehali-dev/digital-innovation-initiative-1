CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.hq_blocks (
    id          SERIAL PRIMARY KEY,
    block_key   VARCHAR(64) NOT NULL UNIQUE,
    title       VARCHAR(256) NOT NULL,
    content     TEXT NOT NULL DEFAULT '',
    updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

INSERT INTO t_p61016064_digital_innovation_i.hq_blocks (block_key, title, content) VALUES
('vision',    'Видение',    ''),
('mission',   'Миссия',     ''),
('focus',     'Текущий фокус', ''),
('scratch',   'Место для размышлений', '');

CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.hq_goals (
    id          SERIAL PRIMARY KEY,
    title       VARCHAR(512) NOT NULL,
    horizon     VARCHAR(128) NOT NULL DEFAULT '',
    status      VARCHAR(32)  NOT NULL DEFAULT 'planned',
    criterion   TEXT NOT NULL DEFAULT '',
    order_index INTEGER NOT NULL DEFAULT 0,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.hq_decisions (
    id          SERIAL PRIMARY KEY,
    what        VARCHAR(512) NOT NULL,
    why         TEXT NOT NULL DEFAULT '',
    changed     TEXT NOT NULL DEFAULT '',
    decided_at  DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.hq_risks (
    id          SERIAL PRIMARY KEY,
    title       VARCHAR(512) NOT NULL,
    impact      VARCHAR(16)  NOT NULL DEFAULT 'medium',
    mitigation  TEXT NOT NULL DEFAULT '',
    status      VARCHAR(32)  NOT NULL DEFAULT 'open',
    created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.hq_rules (
    id          SERIAL PRIMARY KEY,
    category    VARCHAR(64)  NOT NULL DEFAULT 'general',
    rule_text   TEXT NOT NULL,
    order_index INTEGER NOT NULL DEFAULT 0,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.hq_ideas (
    id          SERIAL PRIMARY KEY,
    title       VARCHAR(512) NOT NULL,
    why         TEXT NOT NULL DEFAULT '',
    priority    VARCHAR(16)  NOT NULL DEFAULT 'medium',
    status      VARCHAR(32)  NOT NULL DEFAULT 'new',
    source      VARCHAR(128) NOT NULL DEFAULT '',
    created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
);
