
-- P0: расширяем task_documents для управляемого использования документов
ALTER TABLE task_documents ALTER COLUMN role TYPE VARCHAR(32);
ALTER TABLE task_documents ADD COLUMN usage_mode VARCHAR(64);
ALTER TABLE task_documents ADD COLUMN priority VARCHAR(16) DEFAULT 'medium';
ALTER TABLE task_documents ADD COLUMN must_use BOOLEAN DEFAULT false;
ALTER TABLE task_documents ADD COLUMN instruction TEXT;

-- Комментарии (через COMMENT ON):
COMMENT ON COLUMN task_documents.role IS 'standard / methodology / template / content / background / excluded';
COMMENT ON COLUMN task_documents.usage_mode IS 'structure_source / format_only / facts_only / methodology_only / context_only';
COMMENT ON COLUMN task_documents.priority IS 'high / medium / low';
COMMENT ON COLUMN task_documents.must_use IS 'если true — AI обязан использовать этот документ';
COMMENT ON COLUMN task_documents.instruction IS 'кастомная инструкция пользователя: что брать, что не брать';
