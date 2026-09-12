UPDATE admin_sessions SET revoked_at = now() WHERE actor_email = 'docs-templates-test@internal' AND revoked_at IS NULL;
