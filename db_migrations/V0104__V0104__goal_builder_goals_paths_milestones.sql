CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.goals (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL,
    title       TEXT NOT NULL,
    target_role TEXT,
    goal_type   TEXT NOT NULL DEFAULT 'skill',
    description TEXT,
    priority    TEXT NOT NULL DEFAULT 'medium',
    deadline    DATE,
    status      TEXT NOT NULL DEFAULT 'draft',
    ai_target_profile_json  JSONB,
    ai_gap_analysis_json    JSONB,
    ai_analyzed_at          TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.learning_paths (
    id          SERIAL PRIMARY KEY,
    goal_id     INTEGER NOT NULL,
    user_id     INTEGER NOT NULL,
    title       TEXT NOT NULL,
    summary     TEXT,
    ai_plan_json JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.milestones (
    id               SERIAL PRIMARY KEY,
    learning_path_id INTEGER NOT NULL,
    goal_id          INTEGER NOT NULL,
    user_id          INTEGER NOT NULL,
    title            TEXT NOT NULL,
    description      TEXT,
    due_date         DATE,
    sort_order       INTEGER NOT NULL DEFAULT 0,
    status           TEXT NOT NULL DEFAULT 'planned',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_goals_user_id ON t_p61016064_digital_innovation_i.goals(user_id);
CREATE INDEX IF NOT EXISTS idx_learning_paths_goal_id ON t_p61016064_digital_innovation_i.learning_paths(goal_id);
CREATE INDEX IF NOT EXISTS idx_milestones_goal_id ON t_p61016064_digital_innovation_i.milestones(goal_id);
CREATE INDEX IF NOT EXISTS idx_milestones_path_id ON t_p61016064_digital_innovation_i.milestones(learning_path_id);
