-- Expand: добавляем project_id с правильной семантикой, данные копируем из case_id
-- (case_id фактически всегда хранил projects.id, а не wb_cases.id — wb_cases не используется)
ALTER TABLE t_p61016064_digital_innovation_i.wb_pain_points
    ADD COLUMN IF NOT EXISTS project_id INTEGER NULL;

UPDATE t_p61016064_digital_innovation_i.wb_pain_points
    SET project_id = case_id
    WHERE project_id IS NULL;

ALTER TABLE t_p61016064_digital_innovation_i.wb_pain_points
    ALTER COLUMN project_id SET NOT NULL;

ALTER TABLE t_p61016064_digital_innovation_i.wb_pain_points
    ADD CONSTRAINT fk_wb_pain_points_project
    FOREIGN KEY (project_id) REFERENCES t_p61016064_digital_innovation_i.projects(id);

CREATE INDEX IF NOT EXISTS idx_wb_pain_points_project_id
    ON t_p61016064_digital_innovation_i.wb_pain_points(project_id);

COMMENT ON COLUMN t_p61016064_digital_innovation_i.wb_pain_points.project_id IS
    'Корректное имя связи с projects.id. case_id сохраняется временно для обратной совместимости backend до отдельного релиза очистки (contract-фаза)';
COMMENT ON COLUMN t_p61016064_digital_innovation_i.wb_pain_points.case_id IS
    'УСТАРЕВШЕЕ ИМЯ: по факту всегда хранит projects.id (не wb_cases.id, wb_cases не используется). Используйте project_id. Будет удалено после переключения backend/frontend.';
