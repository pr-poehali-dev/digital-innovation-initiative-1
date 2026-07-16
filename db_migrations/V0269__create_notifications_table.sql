-- Таблица уведомлений пользователей (колокольчик)
CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.notifications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES t_p61016064_digital_innovation_i.users(id),
    type VARCHAR(50) NOT NULL,
    title TEXT NOT NULL,
    message TEXT,
    project_id INTEGER REFERENCES t_p61016064_digital_innovation_i.projects(id),
    link TEXT,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
    ON t_p61016064_digital_innovation_i.notifications (user_id, is_read, created_at DESC);
