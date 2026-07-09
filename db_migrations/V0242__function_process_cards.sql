CREATE TABLE IF NOT EXISTS function_process_cards (
    id                  SERIAL PRIMARY KEY,
    function_id         INTEGER NOT NULL REFERENCES dept_functions(id),
    project_id          INTEGER NOT NULL,

    name                TEXT NOT NULL,
    summary             TEXT,
    sort_order          INTEGER NOT NULL DEFAULT 0,

    trigger_type        TEXT,   -- incoming_request|document_received|scheduled|system_event|manager_assignment|customer_action|external_signal|manual_start|other|unknown
    trigger_note        TEXT,

    input_types         TEXT[], -- structured_data|semi_structured|documents|email|scans|external_sources
    input_note          TEXT,
    output_types        TEXT[], -- decision|document|approval|report|notification|data_update
    output_note         TEXT,

    systems_used        TEXT[], -- free tags в V1
    participants        TEXT[], -- free tags в V1

    sla_criticality     TEXT,   -- none|soft|hard|regulatory|unknown
    sla_note            TEXT,

    pain_points         TEXT[], -- manual_reentry|long_cycle_time|many_approvals|low_visibility|high_error_rate|knowledge_dependency|document_heaviness|bottlenecks|compliance_risk
    automation_notes    TEXT,

    is_archived         BOOLEAN NOT NULL DEFAULT false,
    updated_by          INTEGER,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fpc_function ON function_process_cards(function_id);
CREATE INDEX IF NOT EXISTS idx_fpc_project ON function_process_cards(project_id);