UPDATE admin_sessions SET revoked_at = now() WHERE actor_email = 'gantt-test@internal' AND revoked_at IS NULL;
