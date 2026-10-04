INSERT INTO t_p61016064_digital_innovation_i.exec_cabinet_access (email, access_role, person_id, is_active, can_confirm, note, granted_by)
SELECT 't.mogilevskaya@mail.ru', 'contributor', 10, true, false, 'Могилевская Т.Н., управляющий эксперт ДРКНОиПНП — сотрудник, получает поручения от руководителя', 'kuzmenkoav1982@yandex.ru'
WHERE NOT EXISTS (SELECT 1 FROM t_p61016064_digital_innovation_i.exec_cabinet_access WHERE LOWER(email) = 't.mogilevskaya@mail.ru');

UPDATE t_p61016064_digital_innovation_i.exec_person
SET user_id = (SELECT id FROM t_p61016064_digital_innovation_i.users WHERE LOWER(email) = 't.mogilevskaya@mail.ru'),
    email = 't.mogilevskaya@mail.ru'
WHERE id = 10;

INSERT INTO t_p61016064_digital_innovation_i.exec_person_user_link (person_id, user_id, linked_by)
SELECT 10, (SELECT id FROM t_p61016064_digital_innovation_i.users WHERE LOWER(email) = 't.mogilevskaya@mail.ru'), 'kuzmenkoav1982@yandex.ru'
WHERE NOT EXISTS (SELECT 1 FROM t_p61016064_digital_innovation_i.exec_person_user_link WHERE person_id = 10 AND unlinked_at IS NULL);