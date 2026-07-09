CREATE TABLE IF NOT EXISTS function_solution_shortlists (
    id                      SERIAL PRIMARY KEY,
    function_id             INTEGER NOT NULL REFERENCES dept_functions(id),
    bundle_key              TEXT NOT NULL,
    title                   TEXT,
    decision_status         TEXT NOT NULL DEFAULT 'shortlisted',  -- shortlisted|preferred|rejected
    decision_note           TEXT,
    saved_required_total    INTEGER NOT NULL DEFAULT 0,
    saved_required_covered  INTEGER NOT NULL DEFAULT 0,
    saved_required_uncovered INTEGER NOT NULL DEFAULT 0,
    saved_supporting_total  INTEGER NOT NULL DEFAULT 0,
    saved_supporting_covered INTEGER NOT NULL DEFAULT 0,
    saved_supporting_uncovered INTEGER NOT NULL DEFAULT 0,
    saved_optional_total    INTEGER NOT NULL DEFAULT 0,
    saved_optional_covered  INTEGER NOT NULL DEFAULT 0,
    saved_optional_uncovered INTEGER NOT NULL DEFAULT 0,
    is_archived             BOOLEAN NOT NULL DEFAULT false,
    updated_by              INTEGER,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS function_solution_shortlist_modules (
    id            SERIAL PRIMARY KEY,
    shortlist_id  INTEGER NOT NULL REFERENCES function_solution_shortlists(id),
    module_id     INTEGER NOT NULL REFERENCES solution_product_modules(id),
    CONSTRAINT uq_shortlist_module UNIQUE (shortlist_id, module_id)
);

-- Один активный набор (bundle_key) на функцию
CREATE UNIQUE INDEX IF NOT EXISTS uq_fss_active_bundle
    ON function_solution_shortlists(function_id, bundle_key)
    WHERE is_archived = false;

-- Не более одного активного preferred на функцию
CREATE UNIQUE INDEX IF NOT EXISTS uq_fss_one_preferred
    ON function_solution_shortlists(function_id)
    WHERE is_archived = false AND decision_status = 'preferred';

CREATE INDEX IF NOT EXISTS idx_fss_function ON function_solution_shortlists(function_id);
CREATE INDEX IF NOT EXISTS idx_fssm_shortlist ON function_solution_shortlist_modules(shortlist_id);