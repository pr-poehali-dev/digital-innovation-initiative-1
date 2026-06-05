CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.learning_checkins (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL,
    goal_id     INTEGER NOT NULL,
    week_start  DATE NOT NULL DEFAULT CURRENT_DATE,
    learned     TEXT NOT NULL DEFAULT '',
    clearer_now TEXT NOT NULL DEFAULT '',
    gaps        TEXT NOT NULL DEFAULT '',
    next_focus  TEXT NOT NULL DEFAULT '',
    ai_summary  TEXT NOT NULL DEFAULT '',
    created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);
