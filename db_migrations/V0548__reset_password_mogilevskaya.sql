UPDATE t_p61016064_digital_innovation_i.users
SET password_hash = '$argon2id$v=19$m=19456,t=2,p=1$b7vxiKDAcCgY2yzr0NsfrA$hJHoMvqm71TLiuU4qkxKbj4UK19ugv8T3R/LEjpiuFo',
    name = 'Татьяна Могилевская'
WHERE LOWER(email) = 't.mogilevskaya@mail.ru';

UPDATE t_p61016064_digital_innovation_i.sessions
SET expires_at = NOW()
WHERE user_id = (SELECT id FROM t_p61016064_digital_innovation_i.users WHERE LOWER(email) = 't.mogilevskaya@mail.ru')
  AND expires_at > NOW();

UPDATE t_p61016064_digital_innovation_i.rate_limits
SET hit_count = 0, blocked_until = NULL
WHERE bucket = 'login_attempts' AND key LIKE '%:t.mogilevskaya@mail.ru';