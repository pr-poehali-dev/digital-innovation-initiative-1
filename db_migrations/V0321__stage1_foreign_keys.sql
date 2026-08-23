-- ЭТАП 1, ШАГ 6: внешние ключи на всю модель Центра.
-- Поведение по умолчанию NO ACTION: базовую запись нельзя убрать, пока на неё ссылаются.
-- Повторно запускаемая: каждое ограничение ставится под своим именем, при повторе будет ошибка дубля,
-- поэтому используем проверку через NOT EXISTS в information_schema невозможно в DDL —
-- вместо этого имена уникальны и миграция применяется один раз.

ALTER TABLE t_p61016064_digital_innovation_i.exec_person_competency
    ADD CONSTRAINT fk_pc_person FOREIGN KEY (person_id)
        REFERENCES t_p61016064_digital_innovation_i.exec_person(id),
    ADD CONSTRAINT fk_pc_competency FOREIGN KEY (competency_id)
        REFERENCES t_p61016064_digital_innovation_i.professional_competencies(id),
    ADD CONSTRAINT fk_pc_confirmer FOREIGN KEY (confirmed_by_person_id)
        REFERENCES t_p61016064_digital_innovation_i.exec_person(id);

ALTER TABLE t_p61016064_digital_innovation_i.exec_person_absence
    ADD CONSTRAINT fk_absence_person FOREIGN KEY (person_id)
        REFERENCES t_p61016064_digital_innovation_i.exec_person(id);

ALTER TABLE t_p61016064_digital_innovation_i.exec_person_profile_record
    ADD CONSTRAINT fk_ppr_person FOREIGN KEY (person_id)
        REFERENCES t_p61016064_digital_innovation_i.exec_person(id),
    ADD CONSTRAINT fk_ppr_competency FOREIGN KEY (competency_id)
        REFERENCES t_p61016064_digital_innovation_i.professional_competencies(id);

ALTER TABLE t_p61016064_digital_innovation_i.exec_function_raci
    ADD CONSTRAINT fk_fraci_function FOREIGN KEY (function_id)
        REFERENCES t_p61016064_digital_innovation_i.exec_center_function(id),
    ADD CONSTRAINT fk_fraci_person FOREIGN KEY (person_id)
        REFERENCES t_p61016064_digital_innovation_i.exec_person(id);

ALTER TABLE t_p61016064_digital_innovation_i.exec_center_function_dept_function
    ADD CONSTRAINT fk_cfdf_center_function FOREIGN KEY (center_function_id)
        REFERENCES t_p61016064_digital_innovation_i.exec_center_function(id),
    ADD CONSTRAINT fk_cfdf_dept_function FOREIGN KEY (dept_function_id)
        REFERENCES t_p61016064_digital_innovation_i.dept_functions(id);

ALTER TABLE t_p61016064_digital_innovation_i.exec_function_initiative
    ADD CONSTRAINT fk_fi_function FOREIGN KEY (function_id)
        REFERENCES t_p61016064_digital_innovation_i.exec_center_function(id),
    ADD CONSTRAINT fk_fi_initiative FOREIGN KEY (initiative_id)
        REFERENCES t_p61016064_digital_innovation_i.exec_initiative(id);

ALTER TABLE t_p61016064_digital_innovation_i.exec_function_competency
    ADD CONSTRAINT fk_fc_function FOREIGN KEY (function_id)
        REFERENCES t_p61016064_digital_innovation_i.exec_center_function(id),
    ADD CONSTRAINT fk_fc_competency FOREIGN KEY (competency_id)
        REFERENCES t_p61016064_digital_innovation_i.professional_competencies(id);

ALTER TABLE t_p61016064_digital_innovation_i.exec_plan_step_function
    ADD CONSTRAINT fk_psf_step FOREIGN KEY (step_id)
        REFERENCES t_p61016064_digital_innovation_i.exec_plan_step(id),
    ADD CONSTRAINT fk_psf_function FOREIGN KEY (function_id)
        REFERENCES t_p61016064_digital_innovation_i.exec_center_function(id);

ALTER TABLE t_p61016064_digital_innovation_i.exec_plan_step_initiative
    ADD CONSTRAINT fk_psi_step FOREIGN KEY (step_id)
        REFERENCES t_p61016064_digital_innovation_i.exec_plan_step(id),
    ADD CONSTRAINT fk_psi_initiative FOREIGN KEY (initiative_id)
        REFERENCES t_p61016064_digital_innovation_i.exec_initiative(id);

ALTER TABLE t_p61016064_digital_innovation_i.exec_assignee_week
    ADD CONSTRAINT fk_aw_assignee FOREIGN KEY (assignee_id)
        REFERENCES t_p61016064_digital_innovation_i.exec_plan_assignee(id);

ALTER TABLE t_p61016064_digital_innovation_i.exec_time_entry
    ADD CONSTRAINT fk_te_person FOREIGN KEY (person_id)
        REFERENCES t_p61016064_digital_innovation_i.exec_person(id),
    ADD CONSTRAINT fk_te_step FOREIGN KEY (step_id)
        REFERENCES t_p61016064_digital_innovation_i.exec_plan_step(id),
    ADD CONSTRAINT fk_te_approver FOREIGN KEY (approved_by_person_id)
        REFERENCES t_p61016064_digital_innovation_i.exec_person(id);

ALTER TABLE t_p61016064_digital_innovation_i.exec_center_kpi_value
    ADD CONSTRAINT fk_kpi_goal FOREIGN KEY (goal_id)
        REFERENCES t_p61016064_digital_innovation_i.exec_center_goal(id);

ALTER TABLE t_p61016064_digital_innovation_i.exec_center_goal
    ADD CONSTRAINT fk_goal_center FOREIGN KEY (center_id)
        REFERENCES t_p61016064_digital_innovation_i.exec_center(id),
    ADD CONSTRAINT fk_goal_parent FOREIGN KEY (parent_goal_id)
        REFERENCES t_p61016064_digital_innovation_i.exec_center_goal(id),
    ADD CONSTRAINT fk_goal_owner FOREIGN KEY (owner_person_id)
        REFERENCES t_p61016064_digital_innovation_i.exec_person(id);

ALTER TABLE t_p61016064_digital_innovation_i.exec_center_function
    ADD CONSTRAINT fk_cf_center FOREIGN KEY (center_id)
        REFERENCES t_p61016064_digital_innovation_i.exec_center(id),
    ADD CONSTRAINT fk_cf_goal FOREIGN KEY (goal_id)
        REFERENCES t_p61016064_digital_innovation_i.exec_center_goal(id);

ALTER TABLE t_p61016064_digital_innovation_i.exec_center_role
    ADD CONSTRAINT fk_cr_center FOREIGN KEY (center_id)
        REFERENCES t_p61016064_digital_innovation_i.exec_center(id),
    ADD CONSTRAINT fk_cr_person FOREIGN KEY (person_id)
        REFERENCES t_p61016064_digital_innovation_i.exec_person(id);

ALTER TABLE t_p61016064_digital_innovation_i.exec_center_role_function
    ADD CONSTRAINT fk_crf_role FOREIGN KEY (role_id)
        REFERENCES t_p61016064_digital_innovation_i.exec_center_role(id),
    ADD CONSTRAINT fk_crf_function FOREIGN KEY (function_id)
        REFERENCES t_p61016064_digital_innovation_i.exec_center_function(id);

ALTER TABLE t_p61016064_digital_innovation_i.exec_center
    ADD CONSTRAINT fk_center_head FOREIGN KEY (head_person_id)
        REFERENCES t_p61016064_digital_innovation_i.exec_person(id),
    ADD CONSTRAINT fk_center_initiative FOREIGN KEY (initiative_id)
        REFERENCES t_p61016064_digital_innovation_i.exec_initiative(id),
    ADD CONSTRAINT fk_center_plan FOREIGN KEY (plan_id)
        REFERENCES t_p61016064_digital_innovation_i.exec_plan(id);

ALTER TABLE t_p61016064_digital_innovation_i.exec_plan_step
    ADD CONSTRAINT fk_step_milestone FOREIGN KEY (milestone_id)
        REFERENCES t_p61016064_digital_innovation_i.exec_milestone(id),
    ADD CONSTRAINT fk_step_center_function FOREIGN KEY (center_function_id)
        REFERENCES t_p61016064_digital_innovation_i.exec_center_function(id);

ALTER TABLE t_p61016064_digital_innovation_i.exec_risk
    ADD CONSTRAINT fk_risk_center FOREIGN KEY (center_id)
        REFERENCES t_p61016064_digital_innovation_i.exec_center(id),
    ADD CONSTRAINT fk_risk_center_function FOREIGN KEY (center_function_id)
        REFERENCES t_p61016064_digital_innovation_i.exec_center_function(id);

ALTER TABLE t_p61016064_digital_innovation_i.exec_role_assignment
    ADD CONSTRAINT fk_ra_center_role FOREIGN KEY (center_role_id)
        REFERENCES t_p61016064_digital_innovation_i.exec_center_role(id);