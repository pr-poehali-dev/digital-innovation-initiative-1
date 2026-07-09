CREATE TABLE IF NOT EXISTS function_practice_mappings (
    id             SERIAL PRIMARY KEY,
    function_id    INTEGER NOT NULL REFERENCES dept_functions(id),
    practice_id    INTEGER NOT NULL REFERENCES solution_practices(id),
    relevance_level TEXT NOT NULL DEFAULT 'supporting',  -- primary|supporting|explore
    reason_tags    TEXT[] NOT NULL DEFAULT '{}',
    rationale_note TEXT,
    source_kind    TEXT NOT NULL DEFAULT 'manual',       -- manual|interview|workshop|analysis
    is_archived    BOOLEAN NOT NULL DEFAULT false,
    updated_by     INTEGER,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Только одна активная связь function_id + practice_id
CREATE UNIQUE INDEX IF NOT EXISTS uq_fpm_active_pair
    ON function_practice_mappings(function_id, practice_id)
    WHERE is_archived = false;

CREATE INDEX IF NOT EXISTS idx_fpm_function ON function_practice_mappings(function_id);
CREATE INDEX IF NOT EXISTS idx_fpm_practice ON function_practice_mappings(practice_id);