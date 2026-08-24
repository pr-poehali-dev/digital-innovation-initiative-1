-- ЭТАП 4, ШАГ 1: бюджетное планирование инициатив + связь с функциями Центра.

ALTER TABLE t_p61016064_digital_innovation_i.exec_initiative
    ADD COLUMN IF NOT EXISTS budget_year integer,
    ADD COLUMN IF NOT EXISTS budget_kind varchar(20),
    ADD COLUMN IF NOT EXISTS budget_source_prev varchar(255),
    ADD COLUMN IF NOT EXISTS budget_source_new varchar(255),
    ADD COLUMN IF NOT EXISTS budget_amount numeric(14,2),
    ADD COLUMN IF NOT EXISTS budget_status varchar(30) NOT NULL DEFAULT 'not_started',
    ADD COLUMN IF NOT EXISTS budget_owner_person_id integer
        REFERENCES t_p61016064_digital_innovation_i.exec_person(id),
    ADD COLUMN IF NOT EXISTS budget_materials_note text,
    ADD COLUMN IF NOT EXISTS budget_due_date date,
    ADD COLUMN IF NOT EXISTS budget_finance_comment text;

ALTER TABLE t_p61016064_digital_innovation_i.exec_initiative
    ADD CONSTRAINT chk_initiative_budget_kind
    CHECK (budget_kind IS NULL OR budget_kind IN ('capex', 'opex'));

ALTER TABLE t_p61016064_digital_innovation_i.exec_initiative
    ADD CONSTRAINT chk_initiative_budget_status
    CHECK (budget_status IN ('not_started', 'in_progress', 'submitted', 'approved', 'rejected', 'not_required'));

COMMENT ON COLUMN t_p61016064_digital_innovation_i.exec_initiative.budget_kind IS
    'capex — инвестиционный бюджет, opex — текущие расходы';
COMMENT ON COLUMN t_p61016064_digital_innovation_i.exec_initiative.budget_status IS
    'not_started, in_progress, submitted, approved, rejected, not_required';

-- Связь инициативы с функциями Центра напрямую (не только через exec_function_initiative,
-- которая уже есть на стороне функции). Даёт быстрый обратный список у инициативы.
CREATE INDEX IF NOT EXISTS idx_function_initiative_initiative
    ON t_p61016064_digital_innovation_i.exec_function_initiative(initiative_id);