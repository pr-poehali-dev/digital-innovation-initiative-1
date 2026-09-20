-- Финальная очистка после сквозного тестирования Этапа 1: возвращаем
-- паспорт границ в чистый черновик (шаг 1, все подразделения в статусе
-- "ожидает решения"), окончательно деактивируем тестовый аккаунт viewer
-- и обнуляем все использованные тестовые сессии.

UPDATE exec_process_model_scope
SET purpose = NULL, scope_in = NULL, scope_out = NULL, owner_person_id = NULL,
    model_status = 'draft', wizard_status = 'not_started', current_step = 1,
    progress_pct = 0, confirmed_at = NULL, confirmed_by = NULL
WHERE id = 1;

UPDATE exec_process_model_scope_unit
SET confirmation_status = 'pending', decision = 'included', exclusion_reason = NULL
WHERE scope_id = 1;

UPDATE exec_cabinet_access
SET is_active = false
WHERE email = 'viewer-security-test@internal.local';

UPDATE sessions
SET expires_at = now() - interval '1 day'
WHERE id IN ('sec-test-viewer-session-2026-09-20-0001', 'sec-test-viewer-expired-session-0001', 'sec-test-unconfirm-check-0001');
