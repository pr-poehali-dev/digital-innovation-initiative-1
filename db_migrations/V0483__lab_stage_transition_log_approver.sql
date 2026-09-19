-- Разделяем в журнале переходов роль "автор перехода" (actor) и
-- "согласующий исключение" (approver) — даже если технически это может
-- быть один и тот же владелец кейса, поля должны фиксироваться раздельно
-- для аудита и на случай будущего разделения ролей.
ALTER TABLE t_p61016064_digital_innovation_i.wb_case_stage_transition_log
    ADD COLUMN IF NOT EXISTS approver_user_id INTEGER NULL REFERENCES t_p61016064_digital_innovation_i.users(id),
    ADD COLUMN IF NOT EXISTS approver_name TEXT NULL;

COMMENT ON COLUMN t_p61016064_digital_innovation_i.wb_case_stage_transition_log.actor_user_id IS
    'Кто выполнил переход (нажал кнопку подтверждения)';
COMMENT ON COLUMN t_p61016064_digital_innovation_i.wb_case_stage_transition_log.approver_user_id IS
    'Кто согласовал исключение по невыполненным критериям (заполняется только при transition_type=waived)';
