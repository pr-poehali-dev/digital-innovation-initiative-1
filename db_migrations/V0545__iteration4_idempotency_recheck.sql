-- Проверка идемпотентности миграций итерации 4 (раздел 11 ТЗ): повторный
-- запуск тех же ADD COLUMN IF NOT EXISTS / CREATE TABLE IF NOT EXISTS не
-- должен падать и не должен ничего менять. Полный чистый passing-deploy на
-- отдельной схеме с нуля этим набором никак технически недостижим (нет
-- инструмента воссоздать всю историю 540+ миграций и 260+ таблиц с нуля) —
-- это явное ограничение, вынесено в итоговый отчёт для отдельной проверки.
ALTER TABLE exec_process_diagram_lane ADD COLUMN IF NOT EXISTS updated_by VARCHAR(255);
ALTER TABLE exec_process_participant ADD COLUMN IF NOT EXISTS confirmation_status VARCHAR(20) NOT NULL DEFAULT 'user_draft';
ALTER TABLE exec_process_risk ADD COLUMN IF NOT EXISTS accepted_by VARCHAR(255);
CREATE TABLE IF NOT EXISTS exec_process_remark (id SERIAL PRIMARY KEY, process_node_id INTEGER);
CREATE TABLE IF NOT EXISTS exec_process_edit_conflict_log (id SERIAL PRIMARY KEY, entity_type VARCHAR(40));
CREATE INDEX IF NOT EXISTS idx_process_remark_node ON exec_process_remark(process_node_id);
