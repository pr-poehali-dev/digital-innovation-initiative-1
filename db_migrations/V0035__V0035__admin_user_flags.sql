CREATE TABLE t_p61016064_digital_innovation_i.admin_user_flags (
    id           SERIAL PRIMARY KEY,
    user_id      INTEGER NOT NULL UNIQUE
                     REFERENCES t_p61016064_digital_innovation_i.users(id),
    is_blocked   BOOLEAN NOT NULL DEFAULT FALSE,
    reason       TEXT,
    blocked_at   TIMESTAMP,
    unblocked_at TIMESTAMP,
    updated_at   TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_admin_user_flags_user_id    ON t_p61016064_digital_innovation_i.admin_user_flags(user_id);
CREATE INDEX idx_admin_user_flags_is_blocked ON t_p61016064_digital_innovation_i.admin_user_flags(is_blocked);
