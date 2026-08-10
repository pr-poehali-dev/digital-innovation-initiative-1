INSERT INTO admin_sessions (session_token_hash, actor_email, actor_role, expires_at, ip_address, user_agent)
VALUES ('cde7c8f1aaea255086be1dddd8f5fc3875f8e2925b9715dcc0bc52fc0b9a840c',
        'kuzmenkoav1982@yandex.ru', 'super_admin', now() + interval '30 minutes',
        '127.0.0.1', 'e2e-scenario');
