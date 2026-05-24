
CREATE TABLE rate_limits (
    id SERIAL PRIMARY KEY,
    key VARCHAR(255) NOT NULL,
    bucket VARCHAR(64) NOT NULL,
    hit_count INTEGER NOT NULL DEFAULT 1,
    first_hit_at TIMESTAMP NOT NULL DEFAULT NOW(),
    last_hit_at TIMESTAMP NOT NULL DEFAULT NOW(),
    blocked_until TIMESTAMP NULL,
    UNIQUE(key, bucket)
);

CREATE INDEX idx_rate_limits_key_bucket ON rate_limits(key, bucket);
CREATE INDEX idx_rate_limits_first_hit ON rate_limits(first_hit_at);
