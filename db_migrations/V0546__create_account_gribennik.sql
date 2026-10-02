INSERT INTO t_p61016064_digital_innovation_i.users (email, password_hash, name)
SELECT 'gribenniky@bk.ru', '$argon2id$v=19$m=19456,t=2,p=1$a4OLrbK3DbYtut4axA3yUA$2pH3xa6Qr7cDRHsRMJ6f5BLJZt/znI4rouW0zprkHvM', 'Юлия Грибенник'
WHERE NOT EXISTS (SELECT 1 FROM t_p61016064_digital_innovation_i.users WHERE LOWER(email) = 'gribenniky@bk.ru');

INSERT INTO t_p61016064_digital_innovation_i.exec_cabinet_access (email, access_role, person_id, is_active, can_confirm, note, granted_by)
SELECT 'gribenniky@bk.ru', 'contributor', 13, true, false, 'Грибенник Ю.В., ведущий специалист ДРКНОиПНП — сотрудник, получает поручения от руководителя', 'kuzmenkoav1982@yandex.ru'
WHERE NOT EXISTS (SELECT 1 FROM t_p61016064_digital_innovation_i.exec_cabinet_access WHERE LOWER(email) = 'gribenniky@bk.ru');

UPDATE t_p61016064_digital_innovation_i.exec_person
SET user_id = (SELECT id FROM t_p61016064_digital_innovation_i.users WHERE LOWER(email) = 'gribenniky@bk.ru')
WHERE id = 13;

INSERT INTO t_p61016064_digital_innovation_i.exec_person_user_link (person_id, user_id, linked_by)
SELECT 13, (SELECT id FROM t_p61016064_digital_innovation_i.users WHERE LOWER(email) = 'gribenniky@bk.ru'), 'kuzmenkoav1982@yandex.ru'
WHERE NOT EXISTS (SELECT 1 FROM t_p61016064_digital_innovation_i.exec_person_user_link WHERE person_id = 13 AND unlinked_at IS NULL);