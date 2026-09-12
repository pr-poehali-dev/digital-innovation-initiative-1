UPDATE admin_sessions SET revoked_at = now()
WHERE actor_email = 'pilot-owner@internal' AND revoked_at IS NULL;
