ALTER TABLE exec_risk
    ADD COLUMN IF NOT EXISTS owner_role VARCHAR(120);
COMMENT ON COLUMN exec_risk.owner_role IS
    'Ответственная роль текстом (ОМ, РП и т.п.), когда конкретный человек не указан в источнике — НЕ создаётся как персона в exec_person.';

ALTER TABLE exec_action
    ADD COLUMN IF NOT EXISTS responsible_role VARCHAR(120);
COMMENT ON COLUMN exec_action.responsible_role IS
    'Ответственная роль текстом, когда конкретный человек не указан в источнике.';
