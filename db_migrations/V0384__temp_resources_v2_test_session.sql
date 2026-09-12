INSERT INTO admin_sessions (session_token_hash, actor_email, actor_role, expires_at)
VALUES ('f41af75c1f43819c3f6b8a115cce1d30278c33872bb555a24b110f85719f9a80', 'resources-v2-test@internal', 'super_admin', now() + interval '25 minutes');
