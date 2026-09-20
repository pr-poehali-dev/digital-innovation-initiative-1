-- Помечаем второй тестовый документ (создан для проверки ролевого доступа)
-- как технический, чтобы он тоже не отображался в рабочем списке.
UPDATE exec_source_document
SET is_test_data = true, state = 'repealed', is_current_version = false,
    title = '[ТЕСТ безопасности, можно архивировать] Публичный документ'
WHERE id = 2;

-- Деактивируем тестовый аккаунт viewer после завершения проверки —
-- сама учётная запись и история аудита сохраняются для прослеживаемости,
-- но доступ к кабинету закрыт.
UPDATE exec_cabinet_access
SET is_active = false, note = note || ' — деактивирован после завершения проверки безопасности 2026-09-20.'
WHERE email = 'viewer-security-test@internal.local';

-- Обнуляем срок действия обеих тестовых сессий (обычной и истёкшей), чтобы
-- ни одна не могла быть использована повторно.
UPDATE sessions
SET expires_at = now() - interval '1 day'
WHERE id IN ('sec-test-viewer-session-2026-09-20-0001', 'sec-test-viewer-expired-session-0001');

-- Возвращаем паспорт границ в чистое состояние после проверок (шаг 1,
-- черновик) — пользователь должен увидеть нетронутый мастер.
UPDATE exec_process_model_scope
SET current_step = 1, wizard_status = 'not_started', progress_pct = 0
WHERE id = 1;
