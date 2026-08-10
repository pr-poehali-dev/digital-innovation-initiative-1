INSERT INTO admin_sessions (session_token_hash, actor_email, actor_role, expires_at, ip_address, user_agent)
VALUES ('9458f301ba838529937b96bfa3469a93839013cbe877099a13714b7caae589d2',
        'kuzmenkoav1982@yandex.ru', 'super_admin', now() + interval '30 minutes',
        '127.0.0.1', 'integration-check');
