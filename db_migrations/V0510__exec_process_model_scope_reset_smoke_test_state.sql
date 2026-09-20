-- Сбрасываем тестовые записи smoke-теста через UPDATE в пустое состояние,
-- чтобы пользователь увидел чистый мастер при первом реальном прохождении.

UPDATE exec_process_model_scope
SET purpose = NULL,
    scope_in = NULL,
    scope_out = NULL,
    owner_person_id = NULL,
    model_status = 'draft',
    wizard_status = 'not_started',
    current_step = 1,
    progress_pct = 0,
    confirmed_at = NULL,
    confirmed_by = NULL,
    block_regulation_declared_missing = false,
    block_regulation_missing_reason = NULL,
    block_regulation_missing_declared_by = NULL,
    block_regulation_missing_declared_at = NULL
WHERE id = 1;

UPDATE exec_process_model_scope_unit
SET confirmation_status = 'pending',
    decision = 'included',
    exclusion_reason = NULL,
    comment = CASE WHEN is_manually_added THEN comment ELSE NULL END
WHERE scope_id = 1;

UPDATE exec_source_document
SET title = '[Тестовая проверка мастера, можно архивировать] Положение о Блоке внутреннего контроля',
    state = 'repealed',
    is_current_version = false,
    confirmed_actual_by = NULL,
    confirmed_actual_at = NULL
WHERE scope_id = 1;
