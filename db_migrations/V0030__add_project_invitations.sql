CREATE TABLE t_p61016064_digital_innovation_i.project_invitations (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES t_p61016064_digital_innovation_i.projects(id),
    invited_by INTEGER NOT NULL REFERENCES t_p61016064_digital_innovation_i.users(id),
    email TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    accepted_at TIMESTAMPTZ,
    UNIQUE(project_id, email)
);