ALTER TABLE exec_weekly_plan_item DROP CONSTRAINT IF EXISTS chk_weekly_item_entity_type;
ALTER TABLE exec_weekly_plan_item ADD CONSTRAINT chk_weekly_item_entity_type CHECK (entity_type IN
    ('action','task','project','initiative','milestone','decision','risk','issue','requirement','document'));
