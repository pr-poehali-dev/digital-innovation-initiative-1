-- Иерархия и роль-ответственный для задач плана исполнения инициативы,
-- по аналогии с уже существующими полями exec_milestone (parent_milestone_id,
-- outline_code, responsible_role из V0484/V0486).
ALTER TABLE exec_task
    ADD COLUMN IF NOT EXISTS parent_task_id INTEGER REFERENCES exec_task(id),
    ADD COLUMN IF NOT EXISTS outline_code VARCHAR(32),
    ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 100,
    ADD COLUMN IF NOT EXISTS responsible_role VARCHAR(120),
    ADD COLUMN IF NOT EXISTS plan_start DATE,
    ADD COLUMN IF NOT EXISTS source_ref VARCHAR(255),
    ADD COLUMN IF NOT EXISTS data_as_of DATE;

ALTER TABLE exec_task
    ADD CONSTRAINT chk_task_no_self_parent CHECK (parent_task_id IS NULL OR parent_task_id <> id);

COMMENT ON COLUMN exec_task.parent_task_id IS
    'Декомпозиция задачи (задача 1.1 — часть задачи 1) — НЕ календарная зависимость. Для очерёдности используется exec_schedule_dependency.';
COMMENT ON COLUMN exec_task.plan_start IS
    'Плановое начало задачи. due_at используется как плановое окончание (существующее поле) — задача имеет продолжительность, в отличие от вехи.';
COMMENT ON COLUMN exec_task.responsible_role IS
    'Ответственная роль текстом (РП, ОМ и т.п.), когда конкретный человек не указан в источнике.';
