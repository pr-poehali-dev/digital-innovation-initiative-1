CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.admin_user_groups (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER      NOT NULL,
    group_key   VARCHAR(128) NOT NULL,
    group_label VARCHAR(256),
    created_at  TIMESTAMP    NOT NULL DEFAULT NOW(),
    created_by  VARCHAR(128) NOT NULL DEFAULT '',
    UNIQUE (user_id, group_key)
);

CREATE INDEX IF NOT EXISTS idx_admin_user_groups_user ON t_p61016064_digital_innovation_i.admin_user_groups (user_id);
CREATE INDEX IF NOT EXISTS idx_admin_user_groups_key  ON t_p61016064_digital_innovation_i.admin_user_groups (group_key);
