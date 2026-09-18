-- Реанимация wb_case_analysis как паспорта лабораторного кейса, привязанного к projects.id
ALTER TABLE t_p61016064_digital_innovation_i.wb_case_analysis
    ADD COLUMN IF NOT EXISTS project_id INTEGER NULL;

-- Таблица пуста (0 строк) на момент миграции, поэтому переноса данных не требуется,
-- но колонка добавляется через ту же expand-схему для единообразия с wb_pain_points
UPDATE t_p61016064_digital_innovation_i.wb_case_analysis
    SET project_id = case_id
    WHERE project_id IS NULL;

ALTER TABLE t_p61016064_digital_innovation_i.wb_case_analysis
    ADD CONSTRAINT fk_wb_case_analysis_project
    FOREIGN KEY (project_id) REFERENCES t_p61016064_digital_innovation_i.projects(id);

ALTER TABLE t_p61016064_digital_innovation_i.wb_case_analysis
    ADD CONSTRAINT uq_wb_case_analysis_project UNIQUE (project_id);

-- Недостающие поля паспорта (блок «Постановка» и «Ожидаемый результат»)
ALTER TABLE t_p61016064_digital_innovation_i.wb_case_analysis
    ADD COLUMN IF NOT EXISTS initiator TEXT NULL,
    ADD COLUMN IF NOT EXISTS customer TEXT NULL,
    ADD COLUMN IF NOT EXISTS owner_name TEXT NULL,
    ADD COLUMN IF NOT EXISTS basis TEXT NULL,
    ADD COLUMN IF NOT EXISTS why_now TEXT NULL,
    ADD COLUMN IF NOT EXISTS decision_due_at DATE NULL,
    ADD COLUMN IF NOT EXISTS expected_result TEXT NULL,
    ADD COLUMN IF NOT EXISTS success_criteria TEXT NULL,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

COMMENT ON TABLE t_p61016064_digital_innovation_i.wb_case_analysis IS
    'Паспорт лабораторного кейса (projects.project_kind=lab_development). Четыре смысловых блока: постановка (title проекта + initiator/customer/owner_name/basis/why_now), текущее состояние (current_state/problem_statement/stakeholders/constraints_text/...), ожидаемый результат (expected_result/success_criteria/decision_due_at), рабочая конструкция (previous_attempts/data_availability).';
COMMENT ON COLUMN t_p61016064_digital_innovation_i.wb_case_analysis.case_id IS
    'УСТАРЕВШЕЕ ИМЯ, используйте project_id.';
