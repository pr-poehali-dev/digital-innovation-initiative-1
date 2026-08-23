-- ЭТАП 1, ШАГ 8: снятие обязательности инициативы у риска и назначения роли.
-- Требуется, чтобы риски и штатные назначения Центра существовали без инициативы.

ALTER TABLE t_p61016064_digital_innovation_i.exec_risk
    ALTER COLUMN initiative_id SET DEFAULT NULL;

ALTER TABLE t_p61016064_digital_innovation_i.exec_role_assignment
    ALTER COLUMN initiative_id SET DEFAULT NULL;