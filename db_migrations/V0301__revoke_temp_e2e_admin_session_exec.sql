UPDATE t_p61016064_digital_innovation_i.admin_sessions
SET revoked_at = now()
WHERE session_token_hash = '78047fa7dacaa14eeede2ea9973b20ed266ca384a9064b98370acdb91f46f7f9';
