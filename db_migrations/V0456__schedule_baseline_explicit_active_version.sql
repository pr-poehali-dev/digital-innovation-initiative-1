-- Явный выбор действующей версии baseline (вместо неявного "последняя по
-- номеру"). Ровно одна активная версия на scope (project_id/portfolio) —
-- обеспечивается частичным уникальным индексом, а не проверкой в коде.
ALTER TABLE exec_schedule_baseline ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS uq_schedule_baseline_active_per_scope
    ON exec_schedule_baseline (scope_kind, scope_id)
    WHERE is_active = true;

COMMENT ON COLUMN exec_schedule_baseline.is_active IS
    'Явно выбранная действующая версия baseline для этого scope. Ровно одна активная запись на scope_kind+scope_id — обеспечено частичным уникальным индексом. Новая версия НЕ становится активной автоматически, требуется отдельное действие пользователя.';
