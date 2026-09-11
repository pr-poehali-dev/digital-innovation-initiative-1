INSERT INTO admin_sessions (session_token_hash, actor_email, actor_role, expires_at)
VALUES ('0641782a15bf0e2bcc25fce74e1e8bc51a059277b30c8865bc9bae19540eb5b5', 'resources-test@internal', 'super_admin', now() + interval '20 minutes');
