-- Идемпотентность повторяемых напоминаний: у одного напоминания может быть
-- не более одного порождённого "следующего" — защита от дублей при повторном
-- вызове update_reminder_status(status=done).
ALTER TABLE exec_reminder ADD COLUMN IF NOT EXISTS parent_reminder_id INTEGER REFERENCES exec_reminder(id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_reminder_single_child
    ON exec_reminder(parent_reminder_id) WHERE parent_reminder_id IS NOT NULL;
COMMENT ON COLUMN exec_reminder.parent_reminder_id IS
    'Ссылка на напоминание, из которого создан этот повтор. Уникальный индекс гарантирует, что у одного напоминания не может появиться два "следующих" — защита от дублей при повторном/параллельном вызове завершения.';

-- Единственность недельного плана владельца на одну неделю (одна запись
-- на пару автор+неделя вместо гонки SELECT-затем-INSERT).
CREATE UNIQUE INDEX IF NOT EXISTS uq_weekly_plan_owner_week
    ON exec_weekly_plan(author, week_start);
