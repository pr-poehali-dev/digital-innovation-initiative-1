-- Исправление по замечаниям пользователя:
-- 1) ДФМ показывался с пометкой «добавлено вручную», хотя фактически подставлен
--    системой при создании паспорта (как и остальные 3 подразделения) — просто
--    он не является дочерним оргюнитом Блока ВК в org_units. Разделяем два
--    разных понятия, которые технически были смешаны в одном поле is_manually_added:
--    - is_structural_child: был ли оргюнит дочерним в оргструктуре на момент подстановки
--    - is_manually_added: был ли оргюнит добавлен ПОЛЬЗОВАТЕЛЕМ через форму «Добавить
--      подразделение» (а не системой при первом открытии мастера)
-- 2) Явный признак тестовых/технических документов — чтобы скрывать их из
--    рабочего списка по умолчанию, не удаляя историю аудита.
-- 3) Признак, что уровень конфиденциальности понижался, и кем — для последующей
--    проверки прав (понижать может только уполномоченный пользователь).

ALTER TABLE exec_process_model_scope_unit
    ADD COLUMN IF NOT EXISTS is_structural_child BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN exec_process_model_scope_unit.is_structural_child IS
    'true — оргюнит является дочерним подразделением Блока ВК в org_units (СВА/ДВКиК/ДРКНОиПНП). false — подставлен как функционально относящийся, но структурно НЕ дочерний (например ДФМ). Это отдельно от is_manually_added: оба поля НЕ означают "пользователь добавил вручную", если подразделение подставлено системой при создании паспорта.';
COMMENT ON COLUMN exec_process_model_scope_unit.is_manually_added IS
    'true — ТОЛЬКО если оргюнит добавлен пользователем через форму «Добавить подразделение» после создания паспорта. Системные подсказки при первом открытии мастера (включая функциональные, не дочерние структурно) сюда не относятся — см. is_structural_child.';

-- Существующая запись ДФМ (org_unit_id=1) в паспорте Блока ВК: была ошибочно
-- помечена is_manually_added=true при создании — на самом деле её подставила
-- система, а не пользователь. Исправляем факт, не трогая остальные записи.
UPDATE exec_process_model_scope_unit
SET is_manually_added = false, is_structural_child = false
WHERE org_unit_id = 1 AND is_manually_added = true
  AND scope_id IN (SELECT id FROM exec_process_model_scope WHERE block_org_unit_id = 23);

ALTER TABLE exec_source_document
    ADD COLUMN IF NOT EXISTS is_test_data BOOLEAN NOT NULL DEFAULT false;
COMMENT ON COLUMN exec_source_document.is_test_data IS
    'true — техническая/тестовая запись (создана при проверке работоспособности), скрывается из рабочего списка документов по умолчанию. История аудита сохраняется.';

-- Помечаем ранее созданный тестовый документ явным флагом.
UPDATE exec_source_document
SET is_test_data = true
WHERE title LIKE '%Тестовая проверка мастера%';

ALTER TABLE exec_source_document
    ADD COLUMN IF NOT EXISTS confidentiality_lowered_by VARCHAR(255),
    ADD COLUMN IF NOT EXISTS confidentiality_lowered_at TIMESTAMP;
COMMENT ON COLUMN exec_source_document.confidentiality_lowered_by IS
    'Кто последний раз понизил уровень конфиденциальности документа (требует прав can_confirm) — для журнала и контроля.';
