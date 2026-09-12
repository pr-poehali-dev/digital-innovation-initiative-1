INSERT INTO admin_sessions (session_token_hash, actor_email, actor_role, expires_at)
VALUES ('c718a152e0098b5e237b0d0677d866d464499e94a7d58cdcc3844be897fb8a74', 'orgmodel-report-check@internal', 'super_admin', now() + interval '1 hour');
