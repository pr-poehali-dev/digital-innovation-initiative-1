INSERT INTO admin_sessions (session_token_hash, actor_email, actor_role, expires_at)
VALUES ('dce160c1ad0e493522da73971cef6048f4290a649b59602de51c3172eff50db0', 'dashboard-test@internal', 'super_admin', now() + interval '20 minutes');
