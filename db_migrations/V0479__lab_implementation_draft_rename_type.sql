-- Фиксируем единое системное значение artifact_type для черновика
-- предварительного плана реализации лабораторной концепции, чтобы не
-- плодить произвольные варианты (было 'implementation_draft').
UPDATE t_p61016064_digital_innovation_i.workspace_artifacts
SET artifact_type = 'lab_implementation_plan_draft',
    updated_at = NOW()
WHERE project_id = 16 AND artifact_type = 'implementation_draft';

COMMENT ON COLUMN t_p61016064_digital_innovation_i.workspace_artifacts.artifact_type IS
    'Тип артефакта. Свободные AI-генерируемые типы: analysis, summary, roadmap, recommendations и т.п. '
    'Зарезервированное системное значение для лабораторного контура: lab_implementation_plan_draft — '
    'черновик предварительного плана реализации (шесть потоков «6И»), НЕ входит в wb_case_workplan_task '
    'и не должен создаваться под другим именем.';
