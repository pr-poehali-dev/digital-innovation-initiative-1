INSERT INTO admin_sessions (session_token_hash, actor_email, actor_role, expires_at)
VALUES ('8655a90f41fa1d42331472e02047e9bb16e5eb7a56f5d6345b746bf04b5874b5', 'scenario-test@internal', 'super_admin', now() + interval '20 minutes');
