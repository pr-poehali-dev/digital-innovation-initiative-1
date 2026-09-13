UPDATE exec_cabinet_access SET is_active = false, note = 'Деактивировано — временная проверка save_stage/журнала, доступ отозван после проверки'
WHERE email = 'stage-log-test-temp@internal.local';
UPDATE sessions SET expires_at = now() WHERE user_id = (SELECT id FROM users WHERE email = 'stage-log-test-temp@internal.local');
