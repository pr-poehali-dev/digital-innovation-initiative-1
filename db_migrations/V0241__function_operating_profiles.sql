CREATE TABLE IF NOT EXISTS function_operating_profiles (
    id                        SERIAL PRIMARY KEY,
    function_id               INTEGER NOT NULL UNIQUE REFERENCES dept_functions(id),
    project_id                INTEGER NOT NULL,

    frequency_band            TEXT,
    volume_band               TEXT,

    manual_share_band         TEXT,
    rule_based_share_band     TEXT,
    expert_judgment_share_band TEXT,
    exception_rate_band       TEXT,

    sla_criticality           TEXT,
    audit_required            BOOLEAN,

    input_types               TEXT[],
    output_types              TEXT[],

    participants_band         TEXT,
    systems_involved          TEXT,
    sensitive_data_level      TEXT,

    ai_policy                 TEXT,
    deployment_constraint     TEXT,

    pain_points               TEXT[],

    source_kind               TEXT,
    source_note               TEXT,
    updated_by                INTEGER,
    created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fop_project ON function_operating_profiles(project_id);
CREATE INDEX IF NOT EXISTS idx_fop_function ON function_operating_profiles(function_id);