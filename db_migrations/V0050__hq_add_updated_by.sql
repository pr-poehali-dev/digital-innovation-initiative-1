ALTER TABLE t_p61016064_digital_innovation_i.hq_blocks
    ADD COLUMN IF NOT EXISTS updated_by VARCHAR(128) NOT NULL DEFAULT '';

ALTER TABLE t_p61016064_digital_innovation_i.hq_goals
    ADD COLUMN IF NOT EXISTS updated_by VARCHAR(128) NOT NULL DEFAULT '';

ALTER TABLE t_p61016064_digital_innovation_i.hq_decisions
    ADD COLUMN IF NOT EXISTS created_by VARCHAR(128) NOT NULL DEFAULT '';

ALTER TABLE t_p61016064_digital_innovation_i.hq_risks
    ADD COLUMN IF NOT EXISTS updated_by VARCHAR(128) NOT NULL DEFAULT '';

ALTER TABLE t_p61016064_digital_innovation_i.hq_rules
    ADD COLUMN IF NOT EXISTS created_by VARCHAR(128) NOT NULL DEFAULT '';

ALTER TABLE t_p61016064_digital_innovation_i.hq_ideas
    ADD COLUMN IF NOT EXISTS updated_by VARCHAR(128) NOT NULL DEFAULT '';
