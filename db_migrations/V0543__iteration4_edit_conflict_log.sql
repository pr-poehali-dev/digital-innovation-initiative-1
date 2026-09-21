-- Раздел 3 ТЗ итерации 4, публикационный чек-лист: «есть незавершённый
-- конфликт редактирования» — блокирующая ошибка. Конфликт optimistic-lock
-- раньше был только мгновенным HTTP 409 и нигде не сохранялся, поэтому
-- чек-лист не мог знать, был ли он «разрешён» (пользователь перечитал и
-- сохранил заново) или брошен на середине. Пишем каждый обнаруженный
-- конфликт сюда; при следующем УСПЕШНОМ сохранении той же записи помечаем
-- открытые конфликты этой записи как resolved_at.
CREATE TABLE IF NOT EXISTS exec_process_edit_conflict_log (
    id SERIAL PRIMARY KEY,
    entity_type VARCHAR(40) NOT NULL,
    entity_id INTEGER NOT NULL,
    actor VARCHAR(255) NOT NULL,
    expected_updated_at VARCHAR(60),
    current_updated_at VARCHAR(60),
    changed_by VARCHAR(255),
    detected_at TIMESTAMP NOT NULL DEFAULT now(),
    resolved_at TIMESTAMP,
    is_test_data BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_edit_conflict_open ON exec_process_edit_conflict_log(entity_type, entity_id) WHERE resolved_at IS NULL;
COMMENT ON TABLE exec_process_edit_conflict_log IS
    'Журнал обнаруженных конфликтов optimistic locking — публикационный чек-лист блокирует публикацию, пока по записи есть неразрешённый (resolved_at IS NULL) конфликт (раздел 1 и 3 ТЗ итерации 4).';
