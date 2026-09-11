-- Резервные копии существующих таблиц перед расширением портфеля
CREATE TABLE IF NOT EXISTS exec_action_backup_v0357 AS SELECT *, now() AS backup_created_at FROM exec_action;
CREATE TABLE IF NOT EXISTS exec_initiative_backup_v0357 AS SELECT *, now() AS backup_created_at FROM exec_initiative;
CREATE TABLE IF NOT EXISTS exec_risk_backup_v0357 AS SELECT *, now() AS backup_created_at FROM exec_risk;
CREATE TABLE IF NOT EXISTS exec_issue_backup_v0357 AS SELECT *, now() AS backup_created_at FROM exec_issue;
CREATE TABLE IF NOT EXISTS exec_milestone_backup_v0357 AS SELECT *, now() AS backup_created_at FROM exec_milestone;
CREATE TABLE IF NOT EXISTS exec_decision_instance_backup_v0357 AS SELECT *, now() AS backup_created_at FROM exec_decision_instance;

-- ============ ПРОЕКТ / МЕРОПРИЯТИЕ ============
-- Новый уровень между инициативой и задачами. initiative_id — основная (не единственная)
-- связь; для доп. связей используется exec_link ниже (M2M).
CREATE TABLE IF NOT EXISTS exec_project (
    id SERIAL PRIMARY KEY,
    title VARCHAR(500) NOT NULL,
    project_kind VARCHAR(32) NOT NULL DEFAULT 'project',
    description TEXT,
    goal TEXT,
    customer_person_id INTEGER REFERENCES exec_person(id),
    result_owner_person_id INTEGER REFERENCES exec_person(id),
    manager_person_id INTEGER REFERENCES exec_person(id),
    coordinator_person_id INTEGER REFERENCES exec_person(id),
    initiative_id INTEGER REFERENCES exec_initiative(id),
    status VARCHAR(32) NOT NULL DEFAULT 'idea',
    priority VARCHAR(20) NOT NULL DEFAULT 'normal',
    progress_pct INTEGER NOT NULL DEFAULT 0,
    plan_start DATE,
    plan_end DATE,
    fact_start DATE,
    fact_end DATE,
    verification_status VARCHAR(32) DEFAULT 'user_draft',
    created_by VARCHAR(255),
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now(),
    CONSTRAINT chk_project_kind CHECK (project_kind IN
        ('project','event','analysis','org_change','regular_activity')),
    CONSTRAINT chk_project_priority CHECK (priority IN ('low','normal','high','urgent')),
    CONSTRAINT chk_project_progress CHECK (progress_pct BETWEEN 0 AND 100)
);
COMMENT ON COLUMN exec_project.status IS 'idea, planned, in_progress, on_hold, completed, cancelled';

-- ============ ЭТАП ПРОЕКТА ============
CREATE TABLE IF NOT EXISTS exec_project_stage (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES exec_project(id),
    title VARCHAR(500) NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 100,
    status VARCHAR(32) NOT NULL DEFAULT 'not_started',
    plan_start DATE,
    plan_end DATE,
    fact_start DATE,
    fact_end DATE,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now(),
    CONSTRAINT chk_stage_status CHECK (status IN
        ('not_started','in_progress','done','blocked','cancelled'))
);

-- ============ ЗАДАЧА ============
-- Может относиться к проекту, этапу, контрольной точке или поручению напрямую (nullable FK),
-- а также к произвольному набору объектов через exec_link.
CREATE TABLE IF NOT EXISTS exec_task (
    id SERIAL PRIMARY KEY,
    title VARCHAR(500) NOT NULL,
    description TEXT,
    project_id INTEGER REFERENCES exec_project(id),
    stage_id INTEGER REFERENCES exec_project_stage(id),
    milestone_id INTEGER REFERENCES exec_milestone(id),
    action_id INTEGER REFERENCES exec_action(id),
    responsible_person_id INTEGER REFERENCES exec_person(id),
    due_at DATE,
    priority VARCHAR(20) NOT NULL DEFAULT 'normal',
    status VARCHAR(32) NOT NULL DEFAULT 'not_started',
    progress_pct INTEGER NOT NULL DEFAULT 0,
    expected_result TEXT,
    actual_result TEXT,
    delay_reason TEXT,
    blocker TEXT,
    fact_date DATE,
    result_confirmed_by_person_id INTEGER REFERENCES exec_person(id),
    created_by VARCHAR(255),
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now(),
    CONSTRAINT chk_task_priority CHECK (priority IN ('low','normal','high','urgent')),
    CONSTRAINT chk_task_status CHECK (status IN
        ('not_started','in_progress','blocked','review','done','cancelled')),
    CONSTRAINT chk_task_progress CHECK (progress_pct BETWEEN 0 AND 100)
);
CREATE INDEX IF NOT EXISTS idx_exec_task_project ON exec_task(project_id);
CREATE INDEX IF NOT EXISTS idx_exec_task_due ON exec_task(due_at);

-- ============ РЕЗУЛЬТАТ ============
CREATE TABLE IF NOT EXISTS exec_result (
    id SERIAL PRIMARY KEY,
    title VARCHAR(500) NOT NULL,
    result_kind VARCHAR(48) NOT NULL DEFAULT 'other',
    description TEXT,
    project_id INTEGER REFERENCES exec_project(id),
    initiative_id INTEGER REFERENCES exec_initiative(id),
    owner_person_id INTEGER REFERENCES exec_person(id),
    achieved_at DATE,
    document_source_id INTEGER,
    verification_status VARCHAR(32) DEFAULT 'user_draft',
    created_by VARCHAR(255),
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now(),
    CONSTRAINT chk_result_kind CHECK (result_kind IN
        ('regulation','report','model','service','methodology','implemented_solution','org_change','other'))
);
COMMENT ON COLUMN exec_result.document_source_id IS 'Необязательная ссылка на doc_source.id из документного контура';

-- ============ ЭФФЕКТ ============
-- Центр координирует расчёт, но не становится автоматически владельцем.
CREATE TABLE IF NOT EXISTS exec_effect (
    id SERIAL PRIMARY KEY,
    title VARCHAR(500) NOT NULL,
    result_id INTEGER REFERENCES exec_result(id),
    project_id INTEGER REFERENCES exec_project(id),
    initiative_id INTEGER REFERENCES exec_initiative(id),
    metric VARCHAR(255),
    unit VARCHAR(64),
    baseline_value VARCHAR(128),
    plan_value VARCHAR(128),
    actual_value VARCHAR(128),
    measured_at DATE,
    calculation_method TEXT,
    data_source TEXT,
    owner_person_id INTEGER REFERENCES exec_person(id),
    confirmed_by_person_id INTEGER REFERENCES exec_person(id),
    confirmation_status VARCHAR(32) NOT NULL DEFAULT 'not_confirmed',
    created_by VARCHAR(255),
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now(),
    CONSTRAINT chk_effect_confirmation CHECK (confirmation_status IN
        ('not_confirmed','pending_review','confirmed','disputed'))
);

-- ============ УПРАВЛЕНЧЕСКОЕ РЕШЕНИЕ (лёгкая версия для портфеля) ============
-- exec_decision_instance уже существует и остаётся основной сущностью решений
-- внутри инициатив. Добавляем nullable project_id/task_id для гибкой привязки.
ALTER TABLE exec_decision_instance
    ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES exec_project(id);

ALTER TABLE exec_risk
    ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES exec_project(id);
ALTER TABLE exec_issue
    ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES exec_project(id);
ALTER TABLE exec_milestone
    ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES exec_project(id);

-- exec_action уже подходит под "поручение" (title, status-цикл new->accepted->...,
-- is_on_control, priority). Добавляем project_id для прямой привязки в дополнение
-- к initiative_id (который уже есть).
ALTER TABLE exec_action
    ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES exec_project(id);

-- ============ УНИВЕРСАЛЬНАЯ M2M-СВЯЗЬ ============
-- Заменяет необходимость плодить junction-таблицу под каждую пару сущностей.
-- Используется для "многие-ко-многим": поручение<->инициатива, поручение<->проект,
-- инициатива<->проект, задача<->результат, проект<->документ, функция<->инициатива и т.д.
CREATE TABLE IF NOT EXISTS exec_link (
    id SERIAL PRIMARY KEY,
    link_type VARCHAR(64) NOT NULL,
    src_kind VARCHAR(32) NOT NULL,
    src_id INTEGER NOT NULL,
    tgt_kind VARCHAR(32) NOT NULL,
    tgt_id INTEGER NOT NULL,
    note TEXT,
    created_by VARCHAR(255),
    created_at TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_exec_link_src ON exec_link(src_kind, src_id);
CREATE INDEX IF NOT EXISTS idx_exec_link_tgt ON exec_link(tgt_kind, tgt_id);
COMMENT ON TABLE exec_link IS
    'Универсальная M2M: src_kind/tgt_kind = action|initiative|project|task|result|effect|risk|issue|decision|doc_source|center_function';

-- ============ НЕИЗМЕНЯЕМЫЙ СНИМОК ОТЧЁТА ============
CREATE TABLE IF NOT EXISTS exec_report_snapshot (
    id SERIAL PRIMARY KEY,
    title VARCHAR(300) NOT NULL,
    report_kind VARCHAR(48) NOT NULL DEFAULT 'portfolio_summary',
    period_from DATE,
    period_to DATE,
    payload_json TEXT NOT NULL,
    created_by VARCHAR(255),
    created_at TIMESTAMP NOT NULL DEFAULT now()
);
COMMENT ON TABLE exec_report_snapshot IS
    'Неизменяемый снимок: после создания payload_json не редактируется';
