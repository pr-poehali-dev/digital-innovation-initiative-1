ALTER TABLE professional_public_profiles
  ADD COLUMN IF NOT EXISTS show_projects BOOLEAN NOT NULL DEFAULT FALSE;
