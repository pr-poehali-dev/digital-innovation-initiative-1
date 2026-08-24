-- ЭТАП 4, ШАГ 5а: exec_action становится полноценным поручением — может существовать
-- самостоятельно (не привязано к проблеме/риску), расширенный статусный цикл.

ALTER TABLE t_p61016064_digital_innovation_i.exec_action
    DROP CONSTRAINT exec_action_one_target;

ALTER TABLE t_p61016064_digital_innovation_i.exec_action
    ADD CONSTRAINT exec_action_one_target CHECK (
        (CASE WHEN issue_id IS NOT NULL THEN 1 ELSE 0 END +
         CASE WHEN risk_id IS NOT NULL THEN 1 ELSE 0 END) <= 1
    );

ALTER TABLE t_p61016064_digital_innovation_i.exec_action
    DROP CONSTRAINT exec_action_status_chk;

ALTER TABLE t_p61016064_digital_innovation_i.exec_action
    ADD CONSTRAINT exec_action_status_chk CHECK (
        status IN ('not_started', 'in_progress', 'done', 'cancelled', 'needs_review',
                   'new', 'accepted', 'done_by_executor', 'accepted_by_head')
    );