UPDATE t_p61016064_digital_innovation_i.sessions
SET expires_at = NOW() + INTERVAL '20 minutes'
WHERE id = 'smoketest_dept_functions_session_000000000000000000000000000001';

UPDATE t_p61016064_digital_innovation_i.projects
SET archived_at = NULL
WHERE title = '[ARCHIVED SMOKETEST] dept-functions';

UPDATE t_p61016064_digital_innovation_i.wb_processes
SET is_archived = FALSE, title = 'Smoke-test процесс'
WHERE id = 5 AND title = '[SMOKETEST ARTIFACT - IGNORE]';
