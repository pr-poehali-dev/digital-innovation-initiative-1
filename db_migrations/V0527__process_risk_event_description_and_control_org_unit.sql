-- Добавляем недостающие поля по ТЗ итерации 3:
-- - риск: отдельное "описание события" (что может произойти) отдельно от причин/последствий;
-- - контроль: подразделение-исполнитель (наравне с ролью/сотрудником).
ALTER TABLE exec_process_risk
    ADD COLUMN IF NOT EXISTS event_description TEXT;
COMMENT ON COLUMN exec_process_risk.event_description IS 'Описание самого события риска (что может произойти) — отдельно от cause (причина) и consequence (последствие).';

ALTER TABLE exec_process_control
    ADD COLUMN IF NOT EXISTS responsible_org_unit_id INTEGER REFERENCES org_units(id);
