-- Отзыв временной сессии, созданной для проверки базы знаний
UPDATE t_p61016064_digital_innovation_i.admin_sessions
SET revoked_at = now()
WHERE session_token_hash = '09aa6699b4d426f8d12d764088a8bc76923718923c796783fa0aa91f837c1960';
