INSERT INTO admin_sessions (session_token_hash, actor_email, actor_role, expires_at)
VALUES ('9c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d', 'orgmodel-verify-test-2@internal', 'super_admin', now() + interval '2 hours');
