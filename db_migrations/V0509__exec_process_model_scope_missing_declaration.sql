-- Явная декларация «документ отсутствует, требуется» для положения о самом
-- Блоке ВК (не про отдельные подразделения) — нужна условию перехода шага 4:
-- «после загрузки минимум положения о блоке ИЛИ явной отметки об отсутствии».

ALTER TABLE exec_process_model_scope
    ADD COLUMN IF NOT EXISTS block_regulation_declared_missing BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS block_regulation_missing_reason TEXT,
    ADD COLUMN IF NOT EXISTS block_regulation_missing_declared_by VARCHAR(255),
    ADD COLUMN IF NOT EXISTS block_regulation_missing_declared_at TIMESTAMP;

COMMENT ON COLUMN exec_process_model_scope.block_regulation_declared_missing IS
    'Явная ручная отметка «положения о Блоке ВК не существует / не найдено, требуется» — альтернатива загрузке файла на шаге 4. Не выставляется системой автоматически.';
