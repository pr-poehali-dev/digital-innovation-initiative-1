-- Глоссарий руководителя: термины, аббревиатуры, сленг
CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.glossary_terms (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES t_p61016064_digital_innovation_i.users(id),
    project_id INTEGER REFERENCES t_p61016064_digital_innovation_i.projects(id),
    term VARCHAR(255) NOT NULL,
    aliases TEXT,
    short_definition TEXT NOT NULL,
    plain_explanation TEXT,
    why_matters TEXT,
    example TEXT,
    category VARCHAR(64) NOT NULL DEFAULT 'general',
    scope VARCHAR(16) NOT NULL DEFAULT 'personal',
    source VARCHAR(32) NOT NULL DEFAULT 'manual',
    is_ai_generated BOOLEAN NOT NULL DEFAULT FALSE,
    is_verified BOOLEAN NOT NULL DEFAULT FALSE,
    view_count INTEGER NOT NULL DEFAULT 0,
    created_by INTEGER REFERENCES t_p61016064_digital_innovation_i.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_glossary_user ON t_p61016064_digital_innovation_i.glossary_terms (user_id, category);
CREATE INDEX IF NOT EXISTS idx_glossary_term ON t_p61016064_digital_innovation_i.glossary_terms (lower(term));
CREATE INDEX IF NOT EXISTS idx_glossary_scope ON t_p61016064_digital_innovation_i.glossary_terms (scope);

-- Избранное / персональные пометки по терминам
CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.glossary_user_marks (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES t_p61016064_digital_innovation_i.users(id),
    term_id INTEGER NOT NULL REFERENCES t_p61016064_digital_innovation_i.glossary_terms(id),
    is_favorite BOOLEAN NOT NULL DEFAULT FALSE,
    is_learned BOOLEAN NOT NULL DEFAULT FALSE,
    personal_note TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, term_id)
);

CREATE INDEX IF NOT EXISTS idx_glossary_marks_user ON t_p61016064_digital_innovation_i.glossary_user_marks (user_id);
