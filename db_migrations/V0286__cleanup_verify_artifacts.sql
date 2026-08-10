UPDATE admin_sessions SET revoked_at = now()
WHERE user_agent = 'integration-check';

UPDATE exec_initiative
SET verification_status = 'archived', status = 'closed', is_test_data = true,
    title = '[проверочная запись] ' || title
WHERE title = 'ПРОВЕРКА записи кабинета';

UPDATE exec_person
SET record_state = 'archived', display_name = '[проверочная запись] ' || display_name
WHERE display_name = 'ПРОВЕРКА Участник Я';
