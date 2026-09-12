-- ============ ЧАСОВОЙ ПОЯС ВЛАДЕЛЬЦА ============
ALTER TABLE exec_cabinet_access ADD COLUMN IF NOT EXISTS timezone VARCHAR(64) NOT NULL DEFAULT 'Europe/Moscow';

-- ============ НАПОМИНАНИЯ ============
-- Привязаны к существующим объектам через (entity_type, entity_id), без дублирования их данных.
CREATE TABLE IF NOT EXISTS exec_reminder (
    id SERIAL PRIMARY KEY,
    title VARCHAR(500) NOT NULL,
    remind_at TIMESTAMP NOT NULL,
    entity_type VARCHAR(32),
    entity_id INTEGER,
    comment TEXT,
    priority VARCHAR(20) NOT NULL DEFAULT 'normal',
    status VARCHAR(20) NOT NULL DEFAULT 'planned',
    repeat_rule VARCHAR(20) NOT NULL DEFAULT 'none',
    done_at TIMESTAMP NULL,
    snoozed_at TIMESTAMP NULL,
    created_by VARCHAR(255),
    is_test_data BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now(),
    CONSTRAINT chk_reminder_priority CHECK (priority IN ('low','normal','high','urgent')),
    CONSTRAINT chk_reminder_status CHECK (status IN ('planned','done','snoozed','cancelled')),
    CONSTRAINT chk_reminder_repeat CHECK (repeat_rule IN ('none','daily','weekly','monthly'))
);
CREATE INDEX IF NOT EXISTS idx_reminder_remind_at ON exec_reminder(remind_at);
CREATE INDEX IF NOT EXISTS idx_reminder_entity ON exec_reminder(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_reminder_status ON exec_reminder(status);
COMMENT ON TABLE exec_reminder IS
    'Напоминания привязаны к существующим объектам через entity_type/entity_id (action/initiative/project/task/milestone/risk/issue/decision/requirement/document) — не копируют их данные. Наступление вычисляется при загрузке кабинета, без фонового scheduler.';
COMMENT ON COLUMN exec_reminder.entity_type IS 'action|initiative|project|task|milestone|risk|issue|decision|requirement|document|null(свободное)';

-- ============ НЕДЕЛЬНЫЙ ПЛАН ============
CREATE TABLE IF NOT EXISTS exec_weekly_plan (
    id SERIAL PRIMARY KEY,
    week_start DATE NOT NULL,
    week_end DATE NOT NULL,
    title VARCHAR(300),
    main_goal TEXT,
    comment TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'draft',
    author VARCHAR(255),
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    closed_at TIMESTAMP NULL,
    summary_text TEXT,
    is_test_data BOOLEAN NOT NULL DEFAULT false,
    updated_at TIMESTAMP NOT NULL DEFAULT now(),
    CONSTRAINT chk_weekly_plan_status CHECK (status IN ('draft','active','closed')),
    CONSTRAINT chk_weekly_plan_dates CHECK (week_end >= week_start)
);
CREATE INDEX IF NOT EXISTS idx_weekly_plan_week ON exec_weekly_plan(week_start);
COMMENT ON TABLE exec_weekly_plan IS
    'Недельный план руководителя. Не копирует содержимое рабочих объектов — только ссылается на них через exec_weekly_plan_item. Закрытие плана НЕ меняет статусы исходных объектов.';

-- ============ ЭЛЕМЕНТЫ НЕДЕЛЬНОГО ПЛАНА ============
CREATE TABLE IF NOT EXISTS exec_weekly_plan_item (
    id SERIAL PRIMARY KEY,
    weekly_plan_id INTEGER NOT NULL REFERENCES exec_weekly_plan(id),
    entity_type VARCHAR(32) NOT NULL,
    entity_id INTEGER NOT NULL,
    plan_date DATE,
    week_priority VARCHAR(20) NOT NULL DEFAULT 'normal',
    expected_result TEXT,
    is_done BOOLEAN NOT NULL DEFAULT false,
    comment TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    carried_over_from_item_id INTEGER REFERENCES exec_weekly_plan_item(id),
    carry_over_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now(),
    CONSTRAINT chk_weekly_item_priority CHECK (week_priority IN ('low','normal','high','urgent')),
    CONSTRAINT chk_weekly_item_entity_type CHECK (entity_type IN
        ('action','task','project','milestone','decision','risk','issue','requirement','document'))
);
CREATE INDEX IF NOT EXISTS idx_weekly_item_plan ON exec_weekly_plan_item(weekly_plan_id);
CREATE INDEX IF NOT EXISTS idx_weekly_item_entity ON exec_weekly_plan_item(entity_type, entity_id);
COMMENT ON TABLE exec_weekly_plan_item IS
    'Ссылка на существующий объект внутри недельного плана. entity_id указывает на exec_action/exec_task/exec_project/exec_milestone/exec_decision_instance/exec_risk/exec_issue/exec_resource_requirement/exec_source_document в зависимости от entity_type.';

-- ============ НЕИЗМЕНЯЕМЫЙ ИТОГ НЕДЕЛИ ============
CREATE TABLE IF NOT EXISTS exec_weekly_summary_snapshot (
    id SERIAL PRIMARY KEY,
    weekly_plan_id INTEGER NOT NULL REFERENCES exec_weekly_plan(id),
    payload_json TEXT NOT NULL,
    payload_sha256 VARCHAR(64) NOT NULL,
    version_group VARCHAR(150) NOT NULL,
    version_number INTEGER NOT NULL DEFAULT 1,
    is_test_data BOOLEAN NOT NULL DEFAULT false,
    created_by VARCHAR(255),
    created_at TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_weekly_summary_plan ON exec_weekly_summary_snapshot(weekly_plan_id);
COMMENT ON TABLE exec_weekly_summary_snapshot IS
    'Неизменяемо через backend: нет action на изменение, только новая версия при повторной публикации итога недели. SHA-256 проверяется при чтении.';
