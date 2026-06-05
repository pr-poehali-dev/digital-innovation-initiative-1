CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.admin_ai_context_exports (
    id                  SERIAL PRIMARY KEY,
    scope               VARCHAR(32)  NOT NULL DEFAULT 'full',
    format              VARCHAR(16)  NOT NULL DEFAULT 'markdown',
    source_hash         VARCHAR(64)  NOT NULL DEFAULT '',
    hq_hash             VARCHAR(64)  NOT NULL DEFAULT '',
    project_hash        VARCHAR(64)  NOT NULL DEFAULT '',
    passport_hash       VARCHAR(64)  NOT NULL DEFAULT '',
    section_hashes_json JSONB        NOT NULL DEFAULT '{}',
    item_counts_json    JSONB        NOT NULL DEFAULT '{}',
    generated_at        TIMESTAMP    NOT NULL DEFAULT NOW(),
    generated_by        VARCHAR(256) NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_ai_ctx_exports_scope_generated
    ON t_p61016064_digital_innovation_i.admin_ai_context_exports (scope, generated_at DESC);
