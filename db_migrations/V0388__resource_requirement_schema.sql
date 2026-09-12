CREATE TABLE IF NOT EXISTS exec_resource_requirement (
    id SERIAL PRIMARY KEY,
    project_id INTEGER REFERENCES exec_project(id),
    initiative_id INTEGER REFERENCES exec_initiative(id),
    task_id INTEGER REFERENCES exec_task(id),
    milestone_id INTEGER REFERENCES exec_milestone(id),
    stage_id INTEGER REFERENCES exec_project_stage(id),

    role_id INTEGER REFERENCES exec_center_role(id),
    role_title VARCHAR(300),
    headcount NUMERIC(5,2) NOT NULL DEFAULT 1,
    required_load_pct NUMERIC(5,2) NOT NULL DEFAULT 100,

    period_start DATE,
    period_end DATE,
    need_by_date DATE,
    search_start_date DATE,

    reason TEXT,
    criticality VARCHAR(16) NOT NULL DEFAULT 'medium',
    required_competencies TEXT,

    closing_method VARCHAR(32),
    status VARCHAR(32) NOT NULL DEFAULT 'draft',

    estimated_monthly_cost NUMERIC(14,2),
    estimated_total_cost NUMERIC(14,2),
    funding_confirmed BOOLEAN NOT NULL DEFAULT false,
    budget_line_id INTEGER REFERENCES exec_budget_line(id),
    cost_category_id INTEGER REFERENCES exec_cost_category(id),

    resolved_assignment_id INTEGER REFERENCES exec_resource_assignment(id),
    closed_at TIMESTAMP NULL,
    closed_by VARCHAR(255),

    comment TEXT,
    is_test_data BOOLEAN NOT NULL DEFAULT false,
    archived_at TIMESTAMP NULL,
    archived_by VARCHAR(255),
    created_by VARCHAR(255),
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now(),

    CONSTRAINT chk_requirement_parent CHECK (
        (CASE WHEN project_id IS NOT NULL THEN 1 ELSE 0 END) +
        (CASE WHEN initiative_id IS NOT NULL THEN 1 ELSE 0 END) = 1
    ),
    CONSTRAINT chk_requirement_who CHECK (role_id IS NOT NULL OR role_title IS NOT NULL),
    CONSTRAINT chk_requirement_criticality CHECK (criticality IN ('low','medium','high','critical')),
    CONSTRAINT chk_requirement_closing_method CHECK (closing_method IS NULL OR closing_method IN
        ('internal_employee','load_reallocation','new_hire','contractor','temporary_expert','cancelled')),
    CONSTRAINT chk_requirement_status CHECK (status IN
        ('draft','confirmed','searching','candidate_identified','assigned','closed','paused','cancelled'))
);
CREATE INDEX IF NOT EXISTS idx_requirement_project ON exec_resource_requirement(project_id);
CREATE INDEX IF NOT EXISTS idx_requirement_initiative ON exec_resource_requirement(initiative_id);
CREATE INDEX IF NOT EXISTS idx_requirement_task ON exec_resource_requirement(task_id);
CREATE INDEX IF NOT EXISTS idx_requirement_milestone ON exec_resource_requirement(milestone_id);
CREATE INDEX IF NOT EXISTS idx_requirement_status ON exec_resource_requirement(status);

COMMENT ON TABLE exec_resource_requirement IS
    'Ресурсная потребность - шире вакансии: может закрываться внутренним сотрудником, перераспределением, наймом, подрядчиком или временным экспертом. Не путать с exec_resource_assignment (уже назначенный ресурс).';
COMMENT ON COLUMN exec_resource_requirement.need_by_date IS 'Дата, к которой ресурс должен быть найден и готов приступить';
COMMENT ON COLUMN exec_resource_requirement.search_start_date IS 'Расчётная дата начала поиска = period_start - нормативный срок привлечения по closing_method';
COMMENT ON COLUMN exec_resource_requirement.estimated_total_cost IS 'Расчётная оценка (роль_за_месяц x загрузка x длительность) - НЕ утверждённый бюджет, только ориентир';
COMMENT ON COLUMN exec_resource_requirement.resolved_assignment_id IS 'Заполняется при переводе потребности в назначение - история сохраняется, потребность не удаляется';

-- Нормативные сроки привлечения по способу закрытия (дни) - редактируемый справочник
CREATE TABLE IF NOT EXISTS exec_hiring_lead_time (
    closing_method VARCHAR(32) PRIMARY KEY,
    lead_time_days INTEGER NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT now()
);
INSERT INTO exec_hiring_lead_time (closing_method, lead_time_days) VALUES
    ('internal_employee', 14),
    ('load_reallocation', 7),
    ('new_hire', 75),
    ('contractor', 30),
    ('temporary_expert', 21)
ON CONFLICT (closing_method) DO NOTHING;
