UPDATE exec_cabinet_access SET is_active = false, note = 'Деактивировано — временная проверка roadmap, доступ отозван после проверки'
WHERE email = 'roadmap-dev-check-temp@internal.local';
UPDATE sessions SET expires_at = now() WHERE user_id = (SELECT id FROM users WHERE email = 'roadmap-dev-check-temp@internal.local');
