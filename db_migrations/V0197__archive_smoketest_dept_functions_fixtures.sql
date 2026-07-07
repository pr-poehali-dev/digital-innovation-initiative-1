UPDATE t_p61016064_digital_innovation_i.projects
SET archived_at = NOW(), title = '[ARCHIVED SMOKETEST] dept-functions'
WHERE title = 'SMOKETEST dept-functions';

UPDATE t_p61016064_digital_innovation_i.sessions
SET expires_at = NOW() - INTERVAL '1 day'
WHERE id = 'smoketest_dept_functions_session_000000000000000000000000000001';
