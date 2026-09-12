UPDATE admin_sessions SET revoked_at = now() WHERE actor_email = 'roadmap-test@internal' AND revoked_at IS NULL;
