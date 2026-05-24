
-- P0 backward compat: миграция старых ролей в новую модель
UPDATE task_documents SET role = 'template' WHERE role = 'reference_presentation';
UPDATE task_documents SET role = 'content' WHERE role = 'content_source';
UPDATE task_documents SET role = 'content' WHERE role = 'draft';

-- Дефолты для существующих записей где новые поля не заполнены
UPDATE task_documents SET priority = 'medium' WHERE priority IS NULL;
UPDATE task_documents SET must_use = false WHERE must_use IS NULL;
UPDATE task_documents SET usage_mode = (
    CASE
        WHEN role = 'standard' THEN 'structure_source'
        WHEN role = 'content' THEN 'full_content'
        WHEN role = 'template' THEN 'format_only'
        WHEN role = 'methodology' THEN 'methodology_only'
        WHEN role = 'background' THEN 'context_only'
        ELSE NULL
    END
) WHERE usage_mode IS NULL;

-- NOT NULL дефолты на уровне колонок (для будущих INSERT)
ALTER TABLE task_documents ALTER COLUMN priority SET DEFAULT 'medium';
ALTER TABLE task_documents ALTER COLUMN must_use SET DEFAULT false;
