-- ЭТАП 1, ШАГ 5: проверка возможности внешних ключей.
-- Поведение по умолчанию NO ACTION: запись нельзя убрать, пока есть ссылки.

ALTER TABLE t_p61016064_digital_innovation_i.exec_person_capacity
    ADD CONSTRAINT fk_capacity_person
    FOREIGN KEY (person_id) REFERENCES t_p61016064_digital_innovation_i.exec_person(id);