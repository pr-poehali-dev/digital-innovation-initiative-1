-- Итерация 1 лаборатории решений: тип проекта и связь с исходным лабораторным кейсом
ALTER TABLE t_p61016064_digital_innovation_i.projects
    ADD COLUMN IF NOT EXISTS project_kind VARCHAR(32) NOT NULL DEFAULT 'standard';

ALTER TABLE t_p61016064_digital_innovation_i.projects
    ADD COLUMN IF NOT EXISTS source_lab_project_id INTEGER NULL
    REFERENCES t_p61016064_digital_innovation_i.projects(id);

ALTER TABLE t_p61016064_digital_innovation_i.projects
    ADD CONSTRAINT chk_projects_project_kind
    CHECK (project_kind IN ('standard', 'lab_development', 'implementation', 'process_description'));

CREATE INDEX IF NOT EXISTS idx_projects_project_kind
    ON t_p61016064_digital_innovation_i.projects(project_kind);

COMMENT ON COLUMN t_p61016064_digital_innovation_i.projects.project_kind IS
    'Тип проекта: standard — обычный, lab_development — лабораторный кейс разработки решения, implementation — проект реализации утверждённого решения, process_description — описание процессов (задел на будущее)';
COMMENT ON COLUMN t_p61016064_digital_innovation_i.projects.source_lab_project_id IS
    'Для project_kind=implementation — ссылка на исходный лабораторный кейс (projects.id), из которого утверждена концепция';
