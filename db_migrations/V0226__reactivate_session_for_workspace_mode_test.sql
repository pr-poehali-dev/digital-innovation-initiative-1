UPDATE t_p61016064_digital_innovation_i.sessions
SET expires_at = NOW() + INTERVAL '15 minutes'
WHERE id = 'smoketest_dept_functions_session_000000000000000000000000000001';
