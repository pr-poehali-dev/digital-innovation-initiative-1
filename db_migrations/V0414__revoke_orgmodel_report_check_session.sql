UPDATE admin_sessions SET revoked_at = now() WHERE actor_email = 'orgmodel-report-check@internal';
