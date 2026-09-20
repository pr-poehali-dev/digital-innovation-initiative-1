-- Дополнение к V0507: явный признак "текущая действующая версия" документа.
-- Система НЕ считает самый новый файл действующим автоматически — пользователь
-- ставит этот признак вручную (шаг «Проверка полноты» проверяет отсутствие
-- конфликта: не может быть двух документов одного вида для одного
-- подразделения одновременно помеченных как текущая действующая версия).

ALTER TABLE exec_source_document
    ADD COLUMN IF NOT EXISTS is_current_version BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN exec_source_document.is_current_version IS
    'Ручная отметка "это действующая версия документа". НЕ выставляется автоматически по дате загрузки. Уникальность (один действующий документ на вид+подразделение) обеспечена частичным уникальным индексом.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_source_doc_current_version
    ON exec_source_document (org_unit_id, source_type)
    WHERE is_current_version = true AND org_unit_id IS NOT NULL AND state = 'active';

ALTER TABLE exec_source_document
    ADD CONSTRAINT chk_source_doc_state CHECK (state IN ('draft', 'active', 'repealed', 'expired'));
