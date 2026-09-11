-- ============ СПРАВОЧНИК СТАТЕЙ РАСХОДОВ ============
CREATE TABLE IF NOT EXISTS exec_cost_category (
    id SERIAL PRIMARY KEY,
    code VARCHAR(48) NOT NULL UNIQUE,
    title VARCHAR(200) NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 100,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP NOT NULL DEFAULT now()
);

INSERT INTO exec_cost_category (code, title, sort_order) VALUES
    ('fot', 'ФОТ', 10),
    ('contractors', 'Подрядчики', 20),
    ('software', 'Программное обеспечение и лицензии', 30),
    ('equipment', 'Оборудование', 40),
    ('infrastructure', 'Инфраструктура и облачные сервисы', 50),
    ('training', 'Обучение', 60),
    ('travel', 'Командировки', 70),
    ('consulting', 'Консультации', 80),
    ('operations', 'Эксплуатационные расходы', 90),
    ('reserve', 'Резерв', 100),
    ('other', 'Прочие расходы', 110)
ON CONFLICT (code) DO NOTHING;

-- ============ КОМАНДА И РЕСУРСЫ ============
CREATE TABLE IF NOT EXISTS exec_resource_assignment (
    id SERIAL PRIMARY KEY,
    project_id INTEGER REFERENCES exec_project(id),
    initiative_id INTEGER REFERENCES exec_initiative(id),
    person_id INTEGER REFERENCES exec_person(id),
    role_id INTEGER REFERENCES exec_center_role(id),
    role_title VARCHAR(300),
    org_unit_id INTEGER REFERENCES org_units(id),
    project_role VARCHAR(64) NOT NULL DEFAULT 'member',
    is_external BOOLEAN NOT NULL DEFAULT false,
    is_vacant BOOLEAN NOT NULL DEFAULT false,
    period_start DATE,
    period_end DATE,
    plan_load_pct NUMERIC(5,2) NOT NULL DEFAULT 100,
    fact_load_pct NUMERIC(5,2),
    comment TEXT,
    is_test_data BOOLEAN NOT NULL DEFAULT false,
    archived_at TIMESTAMP NULL,
    archived_by VARCHAR(255),
    created_by VARCHAR(255),
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now(),
    CONSTRAINT chk_assignment_parent CHECK (
        (CASE WHEN project_id IS NOT NULL THEN 1 ELSE 0 END) +
        (CASE WHEN initiative_id IS NOT NULL THEN 1 ELSE 0 END) = 1
    ),
    CONSTRAINT chk_assignment_who CHECK (
        person_id IS NOT NULL OR role_title IS NOT NULL OR role_id IS NOT NULL
    ),
    CONSTRAINT chk_assignment_project_role CHECK (project_role IN
        ('leader','result_owner','coordinator','member','expert','vacancy'))
);
CREATE INDEX IF NOT EXISTS idx_assignment_project ON exec_resource_assignment(project_id);
CREATE INDEX IF NOT EXISTS idx_assignment_initiative ON exec_resource_assignment(initiative_id);
CREATE INDEX IF NOT EXISTS idx_assignment_person ON exec_resource_assignment(person_id);
COMMENT ON COLUMN exec_resource_assignment.is_vacant IS 'Вакантная потребность в роли, person_id пуст';

-- ============ ПЛАН/ФАКТ ЗАГРУЗКИ ПО МЕСЯЦАМ ============
CREATE TABLE IF NOT EXISTS exec_capacity_plan (
    id SERIAL PRIMARY KEY,
    assignment_id INTEGER NOT NULL REFERENCES exec_resource_assignment(id),
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    plan_load_pct NUMERIC(5,2),
    fact_load_pct NUMERIC(5,2),
    plan_days NUMERIC(6,2),
    fact_days NUMERIC(6,2),
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now(),
    CONSTRAINT chk_capacity_month CHECK (month BETWEEN 1 AND 12),
    CONSTRAINT uq_capacity_period UNIQUE (assignment_id, year, month)
);

-- ============ ВЕРСИИ БЮДЖЕТА ============
CREATE TABLE IF NOT EXISTS exec_budget_version (
    id SERIAL PRIMARY KEY,
    project_id INTEGER REFERENCES exec_project(id),
    initiative_id INTEGER REFERENCES exec_initiative(id),
    year INTEGER NOT NULL,
    version_label VARCHAR(200) NOT NULL,
    version_status VARCHAR(24) NOT NULL DEFAULT 'draft',
    is_locked BOOLEAN NOT NULL DEFAULT false,
    locked_at TIMESTAMP NULL,
    locked_by VARCHAR(255),
    supersedes_version_id INTEGER REFERENCES exec_budget_version(id),
    note TEXT,
    is_test_data BOOLEAN NOT NULL DEFAULT false,
    created_by VARCHAR(255),
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now(),
    CONSTRAINT chk_budget_version_parent CHECK (
        (CASE WHEN project_id IS NOT NULL THEN 1 ELSE 0 END) +
        (CASE WHEN initiative_id IS NOT NULL THEN 1 ELSE 0 END) = 1
    ),
    CONSTRAINT chk_budget_version_status CHECK (version_status IN
        ('draft','review','approved','revised','forecast'))
);
CREATE INDEX IF NOT EXISTS idx_budget_version_project ON exec_budget_version(project_id);
CREATE INDEX IF NOT EXISTS idx_budget_version_initiative ON exec_budget_version(initiative_id);
COMMENT ON COLUMN exec_budget_version.is_locked IS
    'true после утверждения - строки версии больше не редактируются через API, только новая версия';

-- ============ СТРОКИ БЮДЖЕТА (статья x месяц) ============
CREATE TABLE IF NOT EXISTS exec_budget_line (
    id SERIAL PRIMARY KEY,
    version_id INTEGER NOT NULL REFERENCES exec_budget_version(id),
    category_id INTEGER NOT NULL REFERENCES exec_cost_category(id),
    funding_source VARCHAR(200),
    month DATE NOT NULL,
    amount_plan NUMERIC(14,2) NOT NULL DEFAULT 0,
    comment TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_budget_line_version ON exec_budget_line(version_id);
COMMENT ON COLUMN exec_budget_line.month IS 'Первое число месяца, для группировки по кварталам и году';

-- ============ ФАКТИЧЕСКИЕ РАСХОДЫ ============
CREATE TABLE IF NOT EXISTS exec_financial_actual (
    id SERIAL PRIMARY KEY,
    project_id INTEGER REFERENCES exec_project(id),
    initiative_id INTEGER REFERENCES exec_initiative(id),
    category_id INTEGER NOT NULL REFERENCES exec_cost_category(id),
    month DATE NOT NULL,
    amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    paid_amount NUMERIC(14,2),
    source_ref VARCHAR(300),
    comment TEXT,
    is_test_data BOOLEAN NOT NULL DEFAULT false,
    created_by VARCHAR(255),
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now(),
    CONSTRAINT chk_actual_parent CHECK (
        (CASE WHEN project_id IS NOT NULL THEN 1 ELSE 0 END) +
        (CASE WHEN initiative_id IS NOT NULL THEN 1 ELSE 0 END) = 1
    )
);
CREATE INDEX IF NOT EXISTS idx_actual_project ON exec_financial_actual(project_id);

-- ============ ОБЯЗАТЕЛЬСТВА (ДОГОВОРЫ) ============
CREATE TABLE IF NOT EXISTS exec_financial_commitment (
    id SERIAL PRIMARY KEY,
    project_id INTEGER REFERENCES exec_project(id),
    initiative_id INTEGER REFERENCES exec_initiative(id),
    category_id INTEGER NOT NULL REFERENCES exec_cost_category(id),
    contract_ref VARCHAR(300),
    amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    start_date DATE,
    end_date DATE,
    status VARCHAR(24) NOT NULL DEFAULT 'active',
    comment TEXT,
    is_test_data BOOLEAN NOT NULL DEFAULT false,
    created_by VARCHAR(255),
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now(),
    CONSTRAINT chk_commitment_parent CHECK (
        (CASE WHEN project_id IS NOT NULL THEN 1 ELSE 0 END) +
        (CASE WHEN initiative_id IS NOT NULL THEN 1 ELSE 0 END) = 1
    ),
    CONSTRAINT chk_commitment_status CHECK (status IN ('active','closed','cancelled'))
);
CREATE INDEX IF NOT EXISTS idx_commitment_project ON exec_financial_commitment(project_id);

-- ============ ФОТ (обезличенная стоимость роли по умолчанию) ============
CREATE TABLE IF NOT EXISTS exec_fot_plan (
    id SERIAL PRIMARY KEY,
    assignment_id INTEGER REFERENCES exec_resource_assignment(id),
    project_id INTEGER REFERENCES exec_project(id),
    initiative_id INTEGER REFERENCES exec_initiative(id),
    month DATE NOT NULL,
    cost_basis VARCHAR(24) NOT NULL DEFAULT 'role_average',
    base_cost NUMERIC(14,2) NOT NULL DEFAULT 0,
    bonus NUMERIC(14,2) NOT NULL DEFAULT 0,
    accruals NUMERIC(14,2) NOT NULL DEFAULT 0,
    other_payments NUMERIC(14,2) NOT NULL DEFAULT 0,
    plan_total NUMERIC(14,2) NOT NULL DEFAULT 0,
    fact_total NUMERIC(14,2),
    is_test_data BOOLEAN NOT NULL DEFAULT false,
    created_by VARCHAR(255),
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now(),
    CONSTRAINT chk_fot_basis CHECK (cost_basis IN ('role_average','person_actual','human_month_rate')),
    CONSTRAINT chk_fot_parent CHECK (
        assignment_id IS NOT NULL OR project_id IS NOT NULL OR initiative_id IS NOT NULL
    )
);
CREATE INDEX IF NOT EXISTS idx_fot_project ON exec_fot_plan(project_id);
CREATE INDEX IF NOT EXISTS idx_fot_assignment ON exec_fot_plan(assignment_id);
COMMENT ON COLUMN exec_fot_plan.cost_basis IS
    'role_average = обезличенная стоимость роли (по умолчанию); person_actual = индивидуальный оклад, хранить только при необходимости; human_month_rate = расчётная ставка человеко-месяца';

-- ============ НЕИЗМЕНЯЕМЫЕ ФИНАНСОВЫЕ СНИМКИ (утверждение версии) ============
CREATE TABLE IF NOT EXISTS exec_financial_snapshot (
    id SERIAL PRIMARY KEY,
    budget_version_id INTEGER NOT NULL REFERENCES exec_budget_version(id),
    project_id INTEGER REFERENCES exec_project(id),
    initiative_id INTEGER REFERENCES exec_initiative(id),
    year INTEGER NOT NULL,
    payload_json TEXT NOT NULL,
    payload_sha256 VARCHAR(64) NOT NULL,
    version_group VARCHAR(150) NOT NULL,
    version_number INTEGER NOT NULL DEFAULT 1,
    is_test_data BOOLEAN NOT NULL DEFAULT false,
    created_by VARCHAR(255),
    created_at TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fin_snapshot_version ON exec_financial_snapshot(budget_version_id);
COMMENT ON TABLE exec_financial_snapshot IS
    'Неизменяемо через backend: нет action на изменение или отмену записи, только новая версия при повторном утверждении';
