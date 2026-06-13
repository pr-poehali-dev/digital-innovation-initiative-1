-- Memory Layer v1: quiz attempts + topic memory
CREATE TABLE t_p61016064_digital_innovation_i.learning_quiz_attempts (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES t_p61016064_digital_innovation_i.users(id),
  goal_id         INTEGER NOT NULL REFERENCES t_p61016064_digital_innovation_i.learning_goals(id),
  topic_id        INTEGER NOT NULL REFERENCES t_p61016064_digital_innovation_i.learning_topics(id),
  score           NUMERIC(5,2) NOT NULL DEFAULT 0,
  correct_count   INTEGER NOT NULL DEFAULT 0,
  total_questions INTEGER NOT NULL DEFAULT 0,
  weak_concepts   JSONB NOT NULL DEFAULT '[]',
  quiz_payload    JSONB NOT NULL DEFAULT '[]',
  user_answers    JSONB NOT NULL DEFAULT '{}',
  duration_sec    INTEGER NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX learning_quiz_attempts_user_topic ON t_p61016064_digital_innovation_i.learning_quiz_attempts (user_id, topic_id);
CREATE INDEX learning_quiz_attempts_goal ON t_p61016064_digital_innovation_i.learning_quiz_attempts (goal_id);

CREATE TABLE t_p61016064_digital_innovation_i.learning_topic_memory (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES t_p61016064_digital_innovation_i.users(id),
  goal_id         INTEGER NOT NULL REFERENCES t_p61016064_digital_innovation_i.learning_goals(id),
  topic_id        INTEGER NOT NULL REFERENCES t_p61016064_digital_innovation_i.learning_topics(id),
  attempts_count  INTEGER NOT NULL DEFAULT 0,
  last_score      NUMERIC(5,2) NOT NULL DEFAULT 0,
  best_score      NUMERIC(5,2) NOT NULL DEFAULT 0,
  weak_concepts   JSONB NOT NULL DEFAULT '[]',
  needs_review    BOOLEAN NOT NULL DEFAULT FALSE,
  review_priority VARCHAR(8) NOT NULL DEFAULT 'none',
  last_quiz_at    TIMESTAMP NULL,
  updated_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, goal_id, topic_id)
);

CREATE INDEX learning_topic_memory_user_goal ON t_p61016064_digital_innovation_i.learning_topic_memory (user_id, goal_id);
CREATE INDEX learning_topic_memory_review ON t_p61016064_digital_innovation_i.learning_topic_memory (user_id, needs_review);
