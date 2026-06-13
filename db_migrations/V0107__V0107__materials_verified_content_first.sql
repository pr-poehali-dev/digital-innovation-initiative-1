-- V0107: Learning Pack — verified content-first (ADR-002)
-- Расширяем materials + добавляем snapshots + learning_assets

ALTER TABLE t_p61016064_digital_innovation_i.materials
  ADD COLUMN IF NOT EXISTS resolved_url         TEXT,
  ADD COLUMN IF NOT EXISTS http_status          INTEGER,
  ADD COLUMN IF NOT EXISTS content_type         TEXT,
  ADD COLUMN IF NOT EXISTS availability_mode    TEXT NOT NULL DEFAULT 'unknown',
  -- unknown | in_app | source_only | unavailable
  ADD COLUMN IF NOT EXISTS verification_status  TEXT NOT NULL DEFAULT 'pending',
  -- pending | verified | failed
  ADD COLUMN IF NOT EXISTS topic_match_score    NUMERIC(3,2),
  ADD COLUMN IF NOT EXISTS summary_basis        TEXT NOT NULL DEFAULT 'none',
  -- none | metadata | content
  ADD COLUMN IF NOT EXISTS last_verified_at     TIMESTAMPTZ;

-- Снапшоты контента страниц (основа для in-app reader и summary)
CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.material_snapshots (
    id               SERIAL PRIMARY KEY,
    material_id      INTEGER NOT NULL UNIQUE,
    reader_markdown  TEXT,
    plain_text       TEXT,
    raw_html_size    INTEGER,
    word_count       INTEGER,
    content_hash     TEXT,
    fetched_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    extractor_version TEXT NOT NULL DEFAULT '1'
);

-- Learning assets: выжимка + тезисы, построенные по snapshot_text
CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.material_learning_assets (
    id                  SERIAL PRIMARY KEY,
    material_id         INTEGER NOT NULL,
    milestone_id        INTEGER,
    content_summary     TEXT,
    key_points          TEXT[],
    study_notes         TEXT,
    generated_from_hash TEXT,
    generated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(material_id, milestone_id)
);

CREATE INDEX IF NOT EXISTS idx_material_snapshots_material ON t_p61016064_digital_innovation_i.material_snapshots(material_id);
CREATE INDEX IF NOT EXISTS idx_learning_assets_material ON t_p61016064_digital_innovation_i.material_learning_assets(material_id);
CREATE INDEX IF NOT EXISTS idx_learning_assets_milestone ON t_p61016064_digital_innovation_i.material_learning_assets(milestone_id);
CREATE INDEX IF NOT EXISTS idx_materials_verification ON t_p61016064_digital_innovation_i.materials(verification_status);
