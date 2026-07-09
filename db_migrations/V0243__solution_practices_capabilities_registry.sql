CREATE TABLE IF NOT EXISTS solution_practices (
    id          SERIAL PRIMARY KEY,
    slug        TEXT NOT NULL UNIQUE,
    name        TEXT NOT NULL,
    category    TEXT NOT NULL DEFAULT '',
    summary     TEXT,
    is_digital  BOOLEAN NOT NULL DEFAULT false,
    status      TEXT NOT NULL DEFAULT 'active',  -- draft|active|archived
    sort_order  INTEGER NOT NULL DEFAULT 0,
    source_note TEXT,
    source_url  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS solution_capabilities (
    id          SERIAL PRIMARY KEY,
    slug        TEXT NOT NULL UNIQUE,
    name        TEXT NOT NULL,
    category    TEXT NOT NULL DEFAULT '',
    description TEXT,
    status      TEXT NOT NULL DEFAULT 'active',  -- draft|active|archived
    sort_order  INTEGER NOT NULL DEFAULT 0,
    source_note TEXT,
    source_url  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS solution_practice_capability_map (
    id            SERIAL PRIMARY KEY,
    practice_id   INTEGER NOT NULL REFERENCES solution_practices(id),
    capability_id INTEGER NOT NULL REFERENCES solution_capabilities(id),
    relation_type TEXT NOT NULL DEFAULT 'supporting',  -- required|supporting|optional
    note          TEXT,
    source_note   TEXT,
    source_url    TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_practice_capability_rel UNIQUE (practice_id, capability_id, relation_type)
);

CREATE INDEX IF NOT EXISTS idx_spcm_practice ON solution_practice_capability_map(practice_id);
CREATE INDEX IF NOT EXISTS idx_spcm_capability ON solution_practice_capability_map(capability_id);