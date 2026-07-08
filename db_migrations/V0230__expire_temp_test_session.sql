UPDATE t_p61016064_digital_innovation_i.sessions
SET expires_at = NOW() - INTERVAL '1 hour'
WHERE id = '9e80f93a7c296ed81f949dd2329c116a68cebe496d8fc41cc73157a8e6909e13';