ALTER TABLE projects ADD COLUMN IF NOT EXISTS workspace_mode VARCHAR(32) DEFAULT NULL;

CREATE TABLE IF NOT EXISTS wb_solutions (
  id             SERIAL PRIMARY KEY,
  project_id     INTEGER NOT NULL,
  title          TEXT NOT NULL,
  solution_type  TEXT,
  covers_text    TEXT,
  status         TEXT NOT NULL DEFAULT 'keep',
  limitations    TEXT,
  alternatives   TEXT,
  notes          TEXT,
  created_by     INTEGER,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wb_solutions_project ON wb_solutions(project_id);

ALTER TABLE wb_solutions ADD CONSTRAINT chk_wb_solutions_status
  CHECK (status IN ('keep','improve','replace','retire'));
