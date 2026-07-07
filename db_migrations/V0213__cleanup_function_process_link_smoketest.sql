UPDATE t_p61016064_digital_innovation_i.wb_processes
SET title = '[SMOKETEST ARTIFACT - IGNORE]', is_archived = TRUE
WHERE id = 5 AND title = 'Smoke-test процесс';

UPDATE t_p61016064_digital_innovation_i.projects
SET archived_at = NOW()
WHERE title = '[ARCHIVED SMOKETEST] dept-functions';

UPDATE t_p61016064_digital_innovation_i.sessions
SET expires_at = NOW() - INTERVAL '1 day'
WHERE id = 'smoketest_dept_functions_session_000000000000000000000000000001';
