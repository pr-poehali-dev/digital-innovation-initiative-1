CREATE TABLE IF NOT EXISTS admin_sessions (
    id SERIAL PRIMARY KEY,
    session_token_hash VARCHAR(64) NOT NULL UNIQUE,
    actor_email VARCHAR(255) NOT NULL,
    actor_role VARCHAR(32) NOT NULL DEFAULT 'super_admin',
    ip_address VARCHAR(64) NULL,
    user_agent TEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    expires_at TIMESTAMP NOT NULL,
    last_seen_at TIMESTAMP NOT NULL DEFAULT now(),
    revoked_at TIMESTAMP NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_sessions_token ON admin_sessions(session_token_hash);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires ON admin_sessions(expires_at);

CREATE TABLE IF NOT EXISTS admin_login_attempts (
    id SERIAL PRIMARY KEY,
    ip_address VARCHAR(64) NOT NULL,
    email VARCHAR(255) NOT NULL,
    success BOOLEAN NOT NULL DEFAULT false,
    attempted_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_login_attempts_ip_email ON admin_login_attempts(ip_address, email, attempted_at);

CREATE TABLE IF NOT EXISTS admin_audit_log (
    id SERIAL PRIMARY KEY,
    actor_email VARCHAR(255) NOT NULL,
    actor_role VARCHAR(32) NOT NULL DEFAULT 'super_admin',
    action VARCHAR(128) NOT NULL,
    entity_type VARCHAR(64) NULL,
    entity_id INTEGER NULL,
    before_json JSONB NULL,
    after_json JSONB NULL,
    reason TEXT NULL,
    ip_address VARCHAR(64) NULL,
    user_agent TEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created ON admin_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_entity ON admin_audit_log(entity_type, entity_id);
