-- Evidence Bridge: новая таблица для черновиков evidence из Workspace
-- (вместо nullable user_competency_id в существующей таблице)
CREATE TABLE t_p61016064_digital_innovation_i.workspace_evidence_drafts (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES t_p61016064_digital_innovation_i.users(id),
  artifact_id     INTEGER NOT NULL REFERENCES t_p61016064_digital_innovation_i.workspace_artifacts(id),
  project_id      INTEGER NOT NULL REFERENCES t_p61016064_digital_innovation_i.projects(id),
  status          VARCHAR(16) NOT NULL DEFAULT 'draft',
  evidence_type   VARCHAR(32) NOT NULL DEFAULT 'project',
  title           VARCHAR(512) NOT NULL DEFAULT '',
  description     TEXT NOT NULL DEFAULT '',
  what_was_done   TEXT NOT NULL DEFAULT '',
  outcome         TEXT NOT NULL DEFAULT '',
  role_in_work    VARCHAR(256) NOT NULL DEFAULT '',
  skills_demonstrated_json JSONB NOT NULL DEFAULT '[]',
  ai_draft_json   JSONB NULL,
  reviewed_at     TIMESTAMP NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, artifact_id)
);

CREATE INDEX workspace_evidence_drafts_user ON t_p61016064_digital_innovation_i.workspace_evidence_drafts (user_id, status);
CREATE INDEX workspace_evidence_drafts_artifact ON t_p61016064_digital_innovation_i.workspace_evidence_drafts (artifact_id);
