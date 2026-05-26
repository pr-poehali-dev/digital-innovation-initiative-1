CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.audit_uploads (
    id          TEXT PRIMARY KEY DEFAULT 'upl_' || gen_random_uuid()::text,
    project_id  INT NOT NULL,
    user_id     TEXT NOT NULL,
    filename    TEXT NOT NULL,
    content_type TEXT NOT NULL DEFAULT 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    size_bytes_expected BIGINT NOT NULL,
    size_bytes_actual   BIGINT,
    s3_key      TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'pending',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at  TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '1 hour',
    consumed_at TIMESTAMPTZ,
    error_message TEXT
);