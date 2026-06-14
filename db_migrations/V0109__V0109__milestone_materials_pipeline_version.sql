-- V0109: Пометить legacy milestone_materials как requires_refresh
-- Добавляем поле pipeline_version для отслеживания поколения подборки

ALTER TABLE t_p61016064_digital_innovation_i.milestone_materials
  ADD COLUMN IF NOT EXISTS pipeline_version TEXT NOT NULL DEFAULT 'legacy';

-- Milestone 21 уже использует corpus-first
UPDATE t_p61016064_digital_innovation_i.milestone_materials
  SET pipeline_version = 'corpus_v1'
  WHERE milestone_id = 21;
