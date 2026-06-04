CREATE TABLE t_p61016064_digital_innovation_i.learning_goals (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES t_p61016064_digital_innovation_i.users(id),
    title VARCHAR(500) NOT NULL,
    description TEXT,
    status VARCHAR(32) NOT NULL DEFAULT 'active',
    ai_plan JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE t_p61016064_digital_innovation_i.learning_topics (
    id SERIAL PRIMARY KEY,
    goal_id INTEGER NOT NULL REFERENCES t_p61016064_digital_innovation_i.learning_goals(id),
    parent_id INTEGER REFERENCES t_p61016064_digital_innovation_i.learning_topics(id),
    title VARCHAR(500) NOT NULL,
    description TEXT,
    order_index INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(32) NOT NULL DEFAULT 'not_started',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE t_p61016064_digital_innovation_i.learning_notes (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES t_p61016064_digital_innovation_i.users(id),
    goal_id INTEGER REFERENCES t_p61016064_digital_innovation_i.learning_goals(id),
    topic_id INTEGER REFERENCES t_p61016064_digital_innovation_i.learning_topics(id),
    kind VARCHAR(32) NOT NULL DEFAULT 'note',
    title VARCHAR(500),
    content TEXT NOT NULL,
    url VARCHAR(1000),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX learning_goals_user_idx ON t_p61016064_digital_innovation_i.learning_goals(user_id);
CREATE INDEX learning_topics_goal_idx ON t_p61016064_digital_innovation_i.learning_topics(goal_id);
CREATE INDEX learning_notes_user_idx ON t_p61016064_digital_innovation_i.learning_notes(user_id);
CREATE INDEX learning_notes_goal_idx ON t_p61016064_digital_innovation_i.learning_notes(goal_id);
