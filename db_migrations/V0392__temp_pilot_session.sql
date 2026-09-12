INSERT INTO admin_sessions (session_token_hash, actor_email, actor_role, expires_at)
VALUES ('afe58869f082ca62c1695e54b23844c62758bf43a2a1daa1c0f5a3f97618ca3d', 'pilot-owner@internal', 'super_admin', now() + interval '2 hours');
