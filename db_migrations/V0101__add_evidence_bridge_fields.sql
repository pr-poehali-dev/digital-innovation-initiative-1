-- Evidence Bridge v1: расширяем professional_competency_evidence
-- для поддержки artifact → evidence draft потока

-- 1. Добавляем поля для трассировки источника и статуса черновика
ALTER TABLE t_p61016064_digital_innovation_i.professional_competency_evidence
  ADD COLUMN status VARCHAR(16) NOT NULL DEFAULT 'confirmed',
  ADD COLUMN artifact_id INTEGER NULL REFERENCES t_p61016064_digital_innovation_i.workspace_artifacts(id),
  ADD COLUMN project_id INTEGER NULL REFERENCES t_p61016064_digital_innovation_i.projects(id),
  ADD COLUMN what_was_done TEXT NULL,
  ADD COLUMN outcome TEXT NULL,
  ADD COLUMN role_in_work VARCHAR(256) NULL,
  ADD COLUMN skills_demonstrated_json JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN ai_draft_json JSONB NULL,
  ADD COLUMN reviewed_at TIMESTAMP NULL;

-- Индекс для быстрого поиска черновиков и привязки к артефактам
CREATE INDEX evidence_bridge_artifact ON t_p61016064_digital_innovation_i.professional_competency_evidence (artifact_id) WHERE artifact_id IS NOT NULL;
CREATE INDEX evidence_bridge_status ON t_p61016064_digital_innovation_i.professional_competency_evidence (status);
CREATE INDEX evidence_bridge_project ON t_p61016064_digital_innovation_i.professional_competency_evidence (project_id) WHERE project_id IS NOT NULL;
