-- Итерация 4, раздел 8: история действий и отмена (autosave-first, поэтому
-- не "отмена несохранённых изменений", а обратимость последних сохранённых
-- действий текущего сеанса). exec_audit_log уже фиксирует before/after на
-- каждое действие (см. log_change в backend) — добавляем context_id, чтобы
-- фильтровать журнал по конкретной диаграмме, и undone_at/undone_by, чтобы
-- не откатывать одно и то же действие дважды и явно показывать в UI, что
-- оно уже отменено.
ALTER TABLE exec_audit_log ADD COLUMN IF NOT EXISTS context_id INTEGER;
ALTER TABLE exec_audit_log ADD COLUMN IF NOT EXISTS undone_at TIMESTAMP;
ALTER TABLE exec_audit_log ADD COLUMN IF NOT EXISTS undone_by VARCHAR(255);
CREATE INDEX IF NOT EXISTS idx_audit_log_context ON exec_audit_log(entity_type, context_id, created_at DESC);
COMMENT ON COLUMN exec_audit_log.context_id IS
    'Для process_diagram_lane/process_diagram_node/process_diagram_edge — id диаграммы-владельца, чтобы строить журнал последних действий по конкретной схеме (раздел 8 ТЗ итерации 4).';
COMMENT ON COLUMN exec_audit_log.undone_at IS
    'Когда это действие было отменено через "Отменить последнее действие" — NULL, если не отменялось.';
