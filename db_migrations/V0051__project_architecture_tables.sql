CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.project_sections (
    id          SERIAL PRIMARY KEY,
    section_key VARCHAR(64) NOT NULL UNIQUE,
    title       VARCHAR(256) NOT NULL,
    content     TEXT NOT NULL DEFAULT '',
    updated_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_by  VARCHAR(128) NOT NULL DEFAULT ''
);

INSERT INTO t_p61016064_digital_innovation_i.project_sections (section_key, title) VALUES
('as_is',    'Как есть сейчас'),
('to_be',    'Целевое состояние'),
('notes',    'Заметки и размышления');

CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.project_gaps (
    id          SERIAL PRIMARY KEY,
    title       VARCHAR(512) NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    gap_type    VARCHAR(32)  NOT NULL DEFAULT 'gap',
    status      VARCHAR(32)  NOT NULL DEFAULT 'open',
    created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    created_by  VARCHAR(128) NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.project_decisions (
    id          SERIAL PRIMARY KEY,
    what        VARCHAR(512) NOT NULL,
    why         TEXT NOT NULL DEFAULT '',
    changed     TEXT NOT NULL DEFAULT '',
    decided_at  DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    created_by  VARCHAR(128) NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.project_waves (
    id          SERIAL PRIMARY KEY,
    wave_num    INTEGER NOT NULL DEFAULT 1,
    title       VARCHAR(256) NOT NULL,
    goal        TEXT NOT NULL DEFAULT '',
    status      VARCHAR(32)  NOT NULL DEFAULT 'planned',
    order_index INTEGER NOT NULL DEFAULT 0,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_by  VARCHAR(128) NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.project_wave_items (
    id          SERIAL PRIMARY KEY,
    wave_id     INTEGER NOT NULL REFERENCES t_p61016064_digital_innovation_i.project_waves(id),
    title       VARCHAR(512) NOT NULL,
    status      VARCHAR(32)  NOT NULL DEFAULT 'todo',
    order_index INTEGER NOT NULL DEFAULT 0
);
