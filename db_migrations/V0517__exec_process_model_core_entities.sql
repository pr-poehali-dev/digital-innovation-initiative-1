-- Контур «Процессное управление» — единая модель данных для всего маршрута
-- (функции -> архитектура процессов -> паспорт -> схемы AS-IS/TO-BE -> риски и
-- контроли -> показатели -> проблемы -> версии/публикация).
--
-- Сознательно НЕ используем существующие dept_functions/macro_processes —
-- это отдельный AI-driven контур "Черновая карта ДФМ" с внешней обработкой
-- документов, которую по ТЗ трогать нельзя. Функции и процессы Блока ВК
-- здесь — новый, ручной, детерминированный контур без вызовов внешнего AI.
--
-- Существующий этап 1 «Границы Блока ВК» (exec_process_model_scope,
-- exec_process_model_scope_unit, exec_source_document) НЕ переделывается —
-- новые таблицы ссылаются на exec_process_model_scope(id) как на корень модели.

-- ── 1. Функции подразделений (реестр, ручной ввод/подтверждение) ───────────
CREATE TABLE exec_function (
    id SERIAL PRIMARY KEY,
    scope_id INTEGER REFERENCES exec_process_model_scope(id),
    code VARCHAR(32),
    title TEXT NOT NULL,
    org_unit_id INTEGER REFERENCES org_units(id),
    responsible_role VARCHAR(255),
    normative_basis TEXT,
    source_document_id INTEGER,
    source_kind VARCHAR(20) NOT NULL DEFAULT 'manual'
        CHECK (source_kind IN ('manual', 'ai_suggested')),
    confirmation_status VARCHAR(20) NOT NULL DEFAULT 'user_draft'
        CHECK (confirmation_status IN ('user_draft', 'confirmed')),
    comment TEXT,
    is_test_data BOOLEAN NOT NULL DEFAULT false,
    created_by VARCHAR(255),
    updated_by VARCHAR(255),
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now()
);
COMMENT ON COLUMN exec_function.source_kind IS
    'manual - введено/подтверждено человеком (единственный поддерживаемый режим сейчас). '
    'ai_suggested зарезервировано архитектурно для будущего безопасного контура извлечения '
    'из регламентов - сейчас не используется и не заполняется автоматически.';
CREATE INDEX idx_exec_function_scope ON exec_function(scope_id);
CREATE INDEX idx_exec_function_org ON exec_function(org_unit_id);

-- ── 2. Архитектура процессов: иерархия направление -> процесс -> подпроцесс -> операция
CREATE TABLE exec_process_node (
    id SERIAL PRIMARY KEY,
    scope_id INTEGER REFERENCES exec_process_model_scope(id),
    code VARCHAR(32),
    name TEXT NOT NULL,
    level VARCHAR(20) NOT NULL
        CHECK (level IN ('direction', 'process', 'subprocess', 'operation')),
    parent_id INTEGER REFERENCES exec_process_node(id),
    owner_person_id INTEGER REFERENCES exec_person(id),
    responsible_org_unit_id INTEGER REFERENCES org_units(id),
    result_description TEXT,
    model_status VARCHAR(20) NOT NULL DEFAULT 'draft'
        CHECK (model_status IN ('draft', 'in_review', 'confirmed', 'published', 'archived')),
    version INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0,
    published_at TIMESTAMP,
    published_by VARCHAR(255),
    is_test_data BOOLEAN NOT NULL DEFAULT false,
    created_by VARCHAR(255),
    updated_by VARCHAR(255),
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX idx_exec_process_node_parent ON exec_process_node(parent_id);
CREATE INDEX idx_exec_process_node_scope ON exec_process_node(scope_id);

CREATE TABLE exec_function_process_link (
    id SERIAL PRIMARY KEY,
    function_id INTEGER NOT NULL REFERENCES exec_function(id),
    process_node_id INTEGER NOT NULL REFERENCES exec_process_node(id),
    created_by VARCHAR(255),
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    UNIQUE(function_id, process_node_id)
);
CREATE INDEX idx_efpl_function ON exec_function_process_link(function_id);
CREATE INDEX idx_efpl_process ON exec_function_process_link(process_node_id);

-- ── 3. Паспорт процесса ─────────────────────────────────────────────────────
CREATE TABLE exec_process_passport (
    id SERIAL PRIMARY KEY,
    process_node_id INTEGER NOT NULL UNIQUE REFERENCES exec_process_node(id),
    goal TEXT,
    boundaries_note TEXT,
    trigger_event TEXT,
    inputs_note TEXT,
    outputs_note TEXT,
    suppliers_note TEXT,
    consumers_note TEXT,
    updated_by VARCHAR(255),
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE exec_info_system (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    is_test_data BOOLEAN NOT NULL DEFAULT false,
    created_by VARCHAR(255),
    created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE exec_process_system_link (
    id SERIAL PRIMARY KEY,
    process_node_id INTEGER NOT NULL REFERENCES exec_process_node(id),
    system_id INTEGER NOT NULL REFERENCES exec_info_system(id),
    UNIQUE(process_node_id, system_id)
);

CREATE TABLE exec_process_document_link (
    id SERIAL PRIMARY KEY,
    process_node_id INTEGER NOT NULL REFERENCES exec_process_node(id),
    document_id INTEGER NOT NULL,
    UNIQUE(process_node_id, document_id)
);

CREATE TABLE exec_process_participant (
    id SERIAL PRIMARY KEY,
    process_node_id INTEGER NOT NULL REFERENCES exec_process_node(id),
    role_title VARCHAR(255) NOT NULL,
    person_id INTEGER REFERENCES exec_person(id),
    org_unit_id INTEGER REFERENCES org_units(id),
    participation_kind VARCHAR(20) NOT NULL DEFAULT 'executor'
        CHECK (participation_kind IN ('owner', 'executor', 'reviewer', 'consumer', 'supplier')),
    created_at TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX idx_epp_process ON exec_process_participant(process_node_id);

-- ── 4. Схемы процессов (AS-IS / TO-BE), совместимые с BPMN-подобной логикой:
-- типизированные узлы, рёбра, дорожки, координаты - НЕ произвольный SVG.
CREATE TABLE exec_process_diagram (
    id SERIAL PRIMARY KEY,
    process_node_id INTEGER NOT NULL REFERENCES exec_process_node(id),
    variant VARCHAR(10) NOT NULL DEFAULT 'as_is' CHECK (variant IN ('as_is', 'to_be')),
    base_diagram_id INTEGER REFERENCES exec_process_diagram(id),
    title VARCHAR(255),
    model_status VARCHAR(20) NOT NULL DEFAULT 'draft'
        CHECK (model_status IN ('draft', 'in_review', 'confirmed', 'published', 'archived')),
    version INTEGER NOT NULL DEFAULT 1,
    canvas_scale NUMERIC(5,2) NOT NULL DEFAULT 1,
    canvas_x NUMERIC(10,2) NOT NULL DEFAULT 0,
    canvas_y NUMERIC(10,2) NOT NULL DEFAULT 0,
    published_at TIMESTAMP,
    published_by VARCHAR(255),
    updated_by VARCHAR(255),
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX idx_epd_process ON exec_process_diagram(process_node_id);

CREATE TABLE exec_process_diagram_lane (
    id SERIAL PRIMARY KEY,
    diagram_id INTEGER NOT NULL REFERENCES exec_process_diagram(id),
    title VARCHAR(255) NOT NULL,
    org_unit_id INTEGER REFERENCES org_units(id),
    role_title VARCHAR(255),
    sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_epdl_diagram ON exec_process_diagram_lane(diagram_id);

CREATE TABLE exec_process_diagram_node (
    id SERIAL PRIMARY KEY,
    diagram_id INTEGER NOT NULL REFERENCES exec_process_diagram(id),
    lane_id INTEGER REFERENCES exec_process_diagram_lane(id),
    node_type VARCHAR(20) NOT NULL
        CHECK (node_type IN ('start', 'end', 'task', 'gateway', 'subprocess', 'document', 'system', 'control', 'note')),
    label VARCHAR(500),
    pos_x NUMERIC(10,2) NOT NULL DEFAULT 0,
    pos_y NUMERIC(10,2) NOT NULL DEFAULT 0,
    width NUMERIC(10,2) NOT NULL DEFAULT 160,
    height NUMERIC(10,2) NOT NULL DEFAULT 64,
    ref_role_title VARCHAR(255),
    ref_person_id INTEGER REFERENCES exec_person(id),
    ref_document_id INTEGER,
    ref_system_id INTEGER REFERENCES exec_info_system(id),
    ref_risk_id INTEGER,
    note TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX idx_epdn_diagram ON exec_process_diagram_node(diagram_id);

CREATE TABLE exec_process_diagram_edge (
    id SERIAL PRIMARY KEY,
    diagram_id INTEGER NOT NULL REFERENCES exec_process_diagram(id),
    source_node_id INTEGER NOT NULL REFERENCES exec_process_diagram_node(id),
    target_node_id INTEGER NOT NULL REFERENCES exec_process_diagram_node(id),
    label VARCHAR(255),
    edge_type VARCHAR(20) NOT NULL DEFAULT 'flow' CHECK (edge_type IN ('flow', 'conditional')),
    created_at TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX idx_epde_diagram ON exec_process_diagram_edge(diagram_id);

-- ── 5. Риски и контроли (связаны с процессом/операцией схемы) ──────────────
-- Числовые вероятность/влияние НЕ придумываем - только качественный уровень,
-- как уже сделано в exec_risk.
CREATE TABLE exec_process_risk (
    id SERIAL PRIMARY KEY,
    process_node_id INTEGER NOT NULL REFERENCES exec_process_node(id),
    diagram_node_id INTEGER REFERENCES exec_process_diagram_node(id),
    title TEXT NOT NULL,
    consequence TEXT,
    qualitative_level VARCHAR(16) CHECK (qualitative_level IN ('low', 'medium', 'high', 'critical')),
    severity_rank SMALLINT,
    verification_status VARCHAR(20) NOT NULL DEFAULT 'user_draft'
        CHECK (verification_status IN ('user_draft', 'confirmed')),
    is_test_data BOOLEAN NOT NULL DEFAULT false,
    created_by VARCHAR(255),
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now()
);
COMMENT ON COLUMN exec_process_risk.severity_rank IS
    'Технический ранг только для сортировки в UI (low=1..critical=4). Не вероятность, не влияние, не risk_score.';
CREATE INDEX idx_epr_process ON exec_process_risk(process_node_id);

CREATE TABLE exec_process_control (
    id SERIAL PRIMARY KEY,
    risk_id INTEGER NOT NULL REFERENCES exec_process_risk(id),
    title TEXT NOT NULL,
    responsible_role VARCHAR(255),
    responsible_person_id INTEGER REFERENCES exec_person(id),
    periodicity VARCHAR(20)
        CHECK (periodicity IS NULL OR periodicity IN ('continuous', 'daily', 'weekly', 'monthly', 'quarterly', 'yearly', 'event_based')),
    evidence_note TEXT,
    last_evidence_confirmed_by VARCHAR(255),
    last_evidence_confirmed_at TIMESTAMP,
    verification_status VARCHAR(20) NOT NULL DEFAULT 'user_draft'
        CHECK (verification_status IN ('user_draft', 'confirmed')),
    is_test_data BOOLEAN NOT NULL DEFAULT false,
    created_by VARCHAR(255),
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX idx_epc_risk ON exec_process_control(risk_id);

ALTER TABLE exec_process_diagram_node
    ADD CONSTRAINT fk_epdn_risk FOREIGN KEY (ref_risk_id) REFERENCES exec_process_risk(id);

-- ── 6. Показатели процесса ──────────────────────────────────────────────────
CREATE TABLE exec_process_metric (
    id SERIAL PRIMARY KEY,
    process_node_id INTEGER NOT NULL REFERENCES exec_process_node(id),
    title TEXT NOT NULL,
    metric_kind VARCHAR(20) NOT NULL DEFAULT 'result'
        CHECK (metric_kind IN ('result', 'quality', 'deadline', 'cost', 'risk')),
    measures_note TEXT,
    formula TEXT,
    unit VARCHAR(64),
    data_source TEXT,
    periodicity VARCHAR(20)
        CHECK (periodicity IS NULL OR periodicity IN ('daily', 'weekly', 'monthly', 'quarterly', 'yearly', 'event_based')),
    plan_value VARCHAR(128),
    fact_value VARCHAR(128),
    threshold_note VARCHAR(255),
    owner_person_id INTEGER REFERENCES exec_person(id),
    goal_link_note TEXT,
    verification_status VARCHAR(20) NOT NULL DEFAULT 'user_draft'
        CHECK (verification_status IN ('user_draft', 'confirmed')),
    is_test_data BOOLEAN NOT NULL DEFAULT false,
    created_by VARCHAR(255),
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX idx_epm_process ON exec_process_metric(process_node_id);

-- ── 7. Проблемы AS-IS и связь с портфелем инициатив (существующим) ─────────
CREATE TABLE exec_process_issue (
    id SERIAL PRIMARY KEY,
    process_node_id INTEGER NOT NULL REFERENCES exec_process_node(id),
    diagram_node_id INTEGER REFERENCES exec_process_diagram_node(id),
    title TEXT NOT NULL,
    description TEXT,
    impact_note TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'addressed', 'closed')),
    verification_status VARCHAR(20) NOT NULL DEFAULT 'user_draft'
        CHECK (verification_status IN ('user_draft', 'confirmed')),
    is_test_data BOOLEAN NOT NULL DEFAULT false,
    created_by VARCHAR(255),
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX idx_epi_process ON exec_process_issue(process_node_id);

-- Проблема процесса -> инициатива из уже существующего портфеля (exec_initiative).
-- Второй реестр инициатив НЕ создаётся.
CREATE TABLE exec_process_issue_initiative_link (
    id SERIAL PRIMARY KEY,
    issue_id INTEGER NOT NULL REFERENCES exec_process_issue(id),
    initiative_id INTEGER NOT NULL REFERENCES exec_initiative(id),
    expected_effect_note TEXT,
    created_by VARCHAR(255),
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    UNIQUE(issue_id, initiative_id)
);

CREATE TABLE exec_process_diagram_initiative_link (
    id SERIAL PRIMARY KEY,
    diagram_id INTEGER NOT NULL REFERENCES exec_process_diagram(id),
    initiative_id INTEGER NOT NULL REFERENCES exec_initiative(id),
    expected_effect_note TEXT,
    created_by VARCHAR(255),
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    UNIQUE(diagram_id, initiative_id)
);

-- ── 8. История версий/публикаций (для процессов и схем) ────────────────────
CREATE TABLE exec_process_version_history (
    id SERIAL PRIMARY KEY,
    entity_type VARCHAR(32) NOT NULL CHECK (entity_type IN ('process_node', 'diagram')),
    entity_id INTEGER NOT NULL,
    version INTEGER NOT NULL,
    status VARCHAR(20) NOT NULL,
    author VARCHAR(255),
    comment TEXT,
    snapshot_json JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX idx_epvh_entity ON exec_process_version_history(entity_type, entity_id);

-- ── 9. Обобщённая привязка документов к функциям/процессам ─────────────────
-- Переиспользуем существующий exec_source_document (с его ролевой защитой,
-- confidentiality_level, версионностью, S3) вместо второго реестра документов.
ALTER TABLE exec_source_document
    ADD COLUMN IF NOT EXISTS process_node_id INTEGER REFERENCES exec_process_node(id),
    ADD COLUMN IF NOT EXISTS function_id INTEGER REFERENCES exec_function(id);

ALTER TABLE exec_function
    ADD CONSTRAINT fk_exec_function_source_doc FOREIGN KEY (source_document_id) REFERENCES exec_source_document(id);
ALTER TABLE exec_process_document_link
    ADD CONSTRAINT fk_epdl_document FOREIGN KEY (document_id) REFERENCES exec_source_document(id);
ALTER TABLE exec_process_diagram_node
    ADD CONSTRAINT fk_epdn_document FOREIGN KEY (ref_document_id) REFERENCES exec_source_document(id);