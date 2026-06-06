-- W9.2 Verified Learning Evidence Sync

-- Ledger для идемпотентной синхронизации завершений
CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.professional_learning_completion_sync (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER      NOT NULL,
    content_source  VARCHAR(32)  NOT NULL DEFAULT 'education_items',
    content_id      INTEGER      NOT NULL,
    content_title   VARCHAR(512) NOT NULL DEFAULT '',
    completion_ref  VARCHAR(128) NOT NULL DEFAULT '',
    completed_at    TIMESTAMP,
    sync_status     VARCHAR(16)  NOT NULL DEFAULT 'processed',
    error_text      TEXT,
    payload_json    JSONB        NOT NULL DEFAULT '{}',
    evidence_ids    JSONB        NOT NULL DEFAULT '[]',
    processed_at    TIMESTAMP    NOT NULL DEFAULT NOW(),
    created_at      TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_plcs_dedup ON
    t_p61016064_digital_innovation_i.professional_learning_completion_sync
    (user_id, content_source, content_id, completion_ref);

CREATE INDEX IF NOT EXISTS idx_plcs_user ON
    t_p61016064_digital_innovation_i.professional_learning_completion_sync
    (user_id, sync_status, created_at DESC);

-- Уникальный индекс для дедупликации evidence по source_ref
CREATE UNIQUE INDEX IF NOT EXISTS idx_pce_dedup ON
    t_p61016064_digital_innovation_i.professional_competency_evidence
    (user_competency_id, evidence_type, source_ref)
    WHERE source_ref IS NOT NULL;
