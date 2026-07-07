UPDATE t_p61016064_digital_innovation_i.dept_functions
SET dept_name = '[SMOKETEST ARTIFACT - IGNORE]'
WHERE dept_name = 'DragDr' || 'op smoketest';

UPDATE t_p61016064_digital_innovation_i.projects
SET archived_at = NOW()
WHERE title = '[ARCHIVED SMOKETEST] dept-functions';

UPDATE t_p61016064_digital_innovation_i.sessions
SET expires_at = NOW() - INTERVAL '1 day'
WHERE id = 'smoketest_dept_functions_session_000000000000000000000000000001';
