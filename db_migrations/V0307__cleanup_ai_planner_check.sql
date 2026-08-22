UPDATE t_p61016064_digital_innovation_i.exec_plan
SET status = 'archived', updated_at = now()
WHERE id = 2 AND title = 'Внедрить контроль сроков по инициативам';

UPDATE t_p61016064_digital_innovation_i.admin_sessions
SET revoked_at = now()
WHERE session_token_hash = '71af6cad50656d3091e948f0daba72090c407a319322207d31960196094df53d';
