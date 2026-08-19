UPDATE t_p61016064_digital_innovation_i.admin_sessions
SET revoked_at = now()
WHERE session_token_hash = '6fb38ecbdaff111f9c9661b6e1c9e2dd1eafaae450585b40518c07b61336222b';
