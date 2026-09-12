UPDATE admin_sessions SET revoked_at = now() WHERE actor_email = 'goals-kpi-test@internal' AND revoked_at IS NULL;
