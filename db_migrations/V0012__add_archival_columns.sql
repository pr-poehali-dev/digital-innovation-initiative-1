
ALTER TABLE documents ADD COLUMN archived_at TIMESTAMP NULL;
ALTER TABLE tasks ADD COLUMN archived_at TIMESTAMP NULL;
ALTER TABLE projects ADD COLUMN archived_at TIMESTAMP NULL;

CREATE INDEX idx_docs_active ON documents(project_id) WHERE archived_at IS NULL;
CREATE INDEX idx_tasks_active ON tasks(project_id) WHERE archived_at IS NULL;
