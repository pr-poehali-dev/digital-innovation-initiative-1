-- Applied Workspace MVP: новые таблицы поверх существующих projects

-- 1. workspace_context: расширенный постоянный контекст пространства
CREATE TABLE t_p61016064_digital_innovation_i.workspace_context (
  id              SERIAL PRIMARY KEY,
  project_id      INTEGER NOT NULL UNIQUE REFERENCES t_p61016064_digital_innovation_i.projects(id),
  goals_text      TEXT NOT NULL DEFAULT '',
  constraints_text TEXT NOT NULL DEFAULT '',
  key_facts_text  TEXT NOT NULL DEFAULT '',
  stakeholders_text TEXT NOT NULL DEFAULT '',
  updated_by      INTEGER NOT NULL REFERENCES t_p61016064_digital_innovation_i.users(id),
  updated_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 2. workspace_hypotheses: слой гипотез и экспериментов
CREATE TABLE t_p61016064_digital_innovation_i.workspace_hypotheses (
  id              SERIAL PRIMARY KEY,
  project_id      INTEGER NOT NULL REFERENCES t_p61016064_digital_innovation_i.projects(id),
  title           VARCHAR(500) NOT NULL,
  statement       TEXT NOT NULL DEFAULT '',
  assumptions     TEXT NOT NULL DEFAULT '',
  success_criteria TEXT NOT NULL DEFAULT '',
  status          VARCHAR(32) NOT NULL DEFAULT 'open',
  conclusion      TEXT NULL,
  priority        VARCHAR(16) NOT NULL DEFAULT 'medium',
  created_by      INTEGER NOT NULL REFERENCES t_p61016064_digital_innovation_i.users(id),
  created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX workspace_hypotheses_project ON t_p61016064_digital_innovation_i.workspace_hypotheses (project_id);
CREATE INDEX workspace_hypotheses_status ON t_p61016064_digital_innovation_i.workspace_hypotheses (project_id, status);

-- 3. workspace_artifacts: артефакты созданные AI внутри пространства
CREATE TABLE t_p61016064_digital_innovation_i.workspace_artifacts (
  id              SERIAL PRIMARY KEY,
  project_id      INTEGER NOT NULL REFERENCES t_p61016064_digital_innovation_i.projects(id),
  title           VARCHAR(500) NOT NULL,
  artifact_type   VARCHAR(64) NOT NULL DEFAULT 'analysis',
  content         TEXT NOT NULL DEFAULT '',
  summary         TEXT NOT NULL DEFAULT '',
  mode            VARCHAR(32) NOT NULL DEFAULT 'analyst',
  ai_run_id       INTEGER NULL,
  created_by      INTEGER NOT NULL REFERENCES t_p61016064_digital_innovation_i.users(id),
  created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX workspace_artifacts_project ON t_p61016064_digital_innovation_i.workspace_artifacts (project_id);
CREATE INDEX workspace_artifacts_type ON t_p61016064_digital_innovation_i.workspace_artifacts (project_id, artifact_type);

-- 4. workspace_ai_runs: история AI-сессий с полным контекстом
CREATE TABLE t_p61016064_digital_innovation_i.workspace_ai_runs (
  id              SERIAL PRIMARY KEY,
  project_id      INTEGER NOT NULL REFERENCES t_p61016064_digital_innovation_i.projects(id),
  message         TEXT NOT NULL,
  mode            VARCHAR(32) NOT NULL DEFAULT 'analyst',
  answer          TEXT NOT NULL DEFAULT '',
  context_summary TEXT NOT NULL DEFAULT '',
  sources_used    JSONB NOT NULL DEFAULT '[]',
  artifact_id     INTEGER NULL REFERENCES t_p61016064_digital_innovation_i.workspace_artifacts(id),
  created_by      INTEGER NOT NULL REFERENCES t_p61016064_digital_innovation_i.users(id),
  created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX workspace_ai_runs_project ON t_p61016064_digital_innovation_i.workspace_ai_runs (project_id);
CREATE INDEX workspace_ai_runs_recent ON t_p61016064_digital_innovation_i.workspace_ai_runs (project_id, created_at DESC);
