INSERT INTO admin_sessions (session_token_hash, actor_email, actor_role, expires_at)
VALUES ('5136661c87106eff694f12e47d62d868d3fe58f41af5ac2f4f14a3fd8541657d', 'docs-scenario-test@internal', 'super_admin', now() + interval '2 hours');
