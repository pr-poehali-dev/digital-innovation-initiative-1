INSERT INTO t_p61016064_digital_innovation_i.sessions (id, user_id, expires_at)
VALUES ('9e80f93a7c296ed81f949dd2329c116a68cebe496d8fc41cc73157a8e6909e13', 3, NOW() + INTERVAL '2 hours')
ON CONFLICT (id) DO NOTHING;