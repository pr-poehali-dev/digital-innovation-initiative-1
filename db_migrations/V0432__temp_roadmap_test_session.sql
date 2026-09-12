INSERT INTO admin_sessions (session_token_hash, actor_email, actor_role, expires_at)
VALUES ('718ab0a0b850a471a57875ae9afff7d8e095fa06d127c41acdf35f3618826b69', 'roadmap-test@internal', 'super_admin', now() + interval '2 hours');
