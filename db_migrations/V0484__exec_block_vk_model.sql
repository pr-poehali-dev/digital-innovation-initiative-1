-- ============================================================
-- Модель для переноса управленческого контура "Инициативы Блока
-- внутреннего контроля" в кабинет руководителя.
-- Не создаёт параллельного модуля — расширяет существующие
-- exec_initiative / exec_milestone / exec_risk / org_units.
-- ============================================================

-- ---------- 1. ПОРТФЕЛЬ ----------
CREATE TABLE IF NOT EXISTS exec_portfolio (
    id SERIAL PRIMARY KEY,
    code VARCHAR(64) UNIQUE,
    title VARCHAR(500) NOT NULL,
    description TEXT,
    owner_org_unit_id INTEGER REFERENCES org_units(id),
    status VARCHAR(32) NOT NULL DEFAULT 'active',
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now(),
    CONSTRAINT chk_portfolio_status CHECK (status IN ('active', 'archived'))
);
COMMENT ON TABLE exec_portfolio IS
    'Портфель инициатив (например "Инициативы Блока внутреннего контроля") — контур верхнего уровня, объединяющий инициативы разных функциональных заказчиков.';

-- ---------- 2. ИНИЦИАТИВА ----------
ALTER TABLE exec_initiative
    ADD COLUMN IF NOT EXISTS portfolio_id INTEGER REFERENCES exec_portfolio(id),
    ADD COLUMN IF NOT EXISTS customer_org_unit_id INTEGER REFERENCES org_units(id),
    ADD COLUMN IF NOT EXISTS executor_org_unit_id INTEGER REFERENCES org_units(id),
    ADD COLUMN IF NOT EXISTS external_code VARCHAR(64),
    ADD COLUMN IF NOT EXISTS cancel_reason TEXT,
    ADD COLUMN IF NOT EXISTS cancel_basis TEXT,
    ADD COLUMN IF NOT EXISTS cancelled_at DATE,
    ADD COLUMN IF NOT EXISTS cancelled_by_person_id INTEGER REFERENCES exec_person(id),
    ADD COLUMN IF NOT EXISTS source_note TEXT,
    ADD COLUMN IF NOT EXISTS source_ref VARCHAR(255),
    ADD COLUMN IF NOT EXISTS data_as_of DATE;

COMMENT ON COLUMN exec_initiative.customer_unit_id IS
    'Технический столбец старой модели, без FK — не используется в новой модели, оставлен для обратной совместимости. Функциональный заказчик теперь в customer_org_unit_id.';
COMMENT ON COLUMN exec_initiative.customer_org_unit_id IS
    'Функциональный заказчик — конкретное подразделение (например Служба внутреннего аудита), а не верхний Блок.';
COMMENT ON COLUMN exec_initiative.executor_org_unit_id IS
    'Подразделение-исполнитель/владелец решения, если отличается от заказчика.';
COMMENT ON COLUMN exec_initiative.external_code IS
    'Внешний код инициативы из исходного документа/презентации (например 100401), отдельно от внутреннего code.';
COMMENT ON COLUMN exec_initiative.source_note IS
    'Ссылка на исходный документ/слайд, из которого загружены данные (для импортированных записей).';
COMMENT ON COLUMN exec_initiative.data_as_of IS
    'Дата, на которую актуальны импортированные данные (например дата презентации) — не путать с датой создания записи в системе.';

-- ---------- 3. ИЕРАРХИЯ ВЕХ ----------
ALTER TABLE exec_milestone
    ADD COLUMN IF NOT EXISTS parent_milestone_id INTEGER REFERENCES exec_milestone(id),
    ADD COLUMN IF NOT EXISTS outline_code VARCHAR(32),
    ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 100,
    ADD COLUMN IF NOT EXISTS responsible_role VARCHAR(120),
    ADD COLUMN IF NOT EXISTS cancel_reason TEXT,
    ADD COLUMN IF NOT EXISTS source_ref VARCHAR(255),
    ADD COLUMN IF NOT EXISTS data_as_of DATE;

ALTER TABLE exec_milestone
    ADD CONSTRAINT chk_milestone_no_self_parent CHECK (parent_milestone_id IS NULL OR parent_milestone_id <> id);

COMMENT ON COLUMN exec_milestone.parent_milestone_id IS
    'Иерархия/декомпозиция (веха 1.1 — часть вехи 1) — НЕ календарная зависимость. Для "нельзя выполнить Б, пока не готово А" используется depends_on_milestone_id.';
COMMENT ON COLUMN exec_milestone.outline_code IS
    'Номер по структуре документа-источника, например "1", "1.1", "1.2" — для отображения в дорожной карте как в исходной презентации.';
COMMENT ON COLUMN exec_milestone.responsible_role IS
    'Ответственная роль текстом (РП, ОМ, ТРП и т.п.), когда конкретный человек не указан в источнике — НЕ создаётся как персона в exec_person.';

-- ---------- 4. РИСКИ ----------
ALTER TABLE exec_risk
    ADD COLUMN IF NOT EXISTS category VARCHAR(32),
    ADD COLUMN IF NOT EXISTS related_milestone_id INTEGER REFERENCES exec_milestone(id),
    ADD COLUMN IF NOT EXISTS mitigation_due_at DATE,
    ADD COLUMN IF NOT EXISTS mitigation_status VARCHAR(32) DEFAULT 'not_started',
    ADD COLUMN IF NOT EXISTS residual_level VARCHAR(16),
    ADD COLUMN IF NOT EXISTS source_ref VARCHAR(255),
    ADD COLUMN IF NOT EXISTS data_as_of DATE;

ALTER TABLE exec_risk
    ADD CONSTRAINT chk_risk_category CHECK (category IS NULL OR category IN
        ('schedule', 'budget', 'resources', 'integration', 'regulatory', 'other')),
    ADD CONSTRAINT chk_risk_mitigation_status CHECK (mitigation_status IN
        ('not_started', 'in_progress', 'done', 'overdue')),
    ADD CONSTRAINT chk_risk_residual_level CHECK (residual_level IS NULL OR residual_level IN
        ('low', 'medium', 'high', 'critical'));

COMMENT ON COLUMN exec_risk.category IS
    'Категория риска: сроки/бюджет/ресурсы/интеграция/регуляторный/другое.';
COMMENT ON COLUMN exec_risk.related_milestone_id IS
    'Веха, с которой связан риск (для риска срыва конкретной контрольной точки).';

-- ---------- 5. "Требует решения руководителя" ----------
CREATE TABLE IF NOT EXISTS exec_initiative_decision_request (
    id SERIAL PRIMARY KEY,
    initiative_id INTEGER NOT NULL REFERENCES exec_initiative(id),
    question TEXT NOT NULL,
    options TEXT,
    recommended_option TEXT,
    due_at DATE,
    consequence_if_not_decided TEXT,
    prepared_by_person_id INTEGER REFERENCES exec_person(id),
    status VARCHAR(32) NOT NULL DEFAULT 'open',
    decided_option TEXT,
    decided_at DATE,
    decided_by_person_id INTEGER REFERENCES exec_person(id),
    source_note TEXT,
    verification_status VARCHAR(32) NOT NULL DEFAULT 'user_draft',
    is_test_data BOOLEAN NOT NULL DEFAULT false,
    created_by VARCHAR(255),
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now(),
    CONSTRAINT chk_idr_status CHECK (status IN ('open', 'decided', 'withdrawn'))
);
COMMENT ON TABLE exec_initiative_decision_request IS
    'Вопросы, требующие управленческого решения по инициативе — отдельно от exec_decision_instance (формальных решений коллегиальных органов), это более лёгкий рабочий список для дашборда руководителя.';

-- ---------- 6. Бюджетный снимок ----------
ALTER TABLE exec_budget_version
    ADD COLUMN IF NOT EXISTS is_snapshot BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS snapshot_as_of DATE,
    ADD COLUMN IF NOT EXISTS source_note TEXT;
COMMENT ON COLUMN exec_budget_version.is_snapshot IS
    'true — версия загружена как срез бюджета на дату документа-источника (snapshot_as_of), а не как текущий план/факт.';

ALTER TABLE exec_budget_line
    ADD COLUMN IF NOT EXISTS budget_type VARCHAR(16),
    ADD COLUMN IF NOT EXISTS amount_fact NUMERIC(14,2),
    ADD COLUMN IF NOT EXISTS amount_forecast NUMERIC(14,2);

ALTER TABLE exec_budget_line
    ADD CONSTRAINT chk_budget_line_type CHECK (budget_type IS NULL OR budget_type IN ('capex', 'opex', 'fot'));

COMMENT ON COLUMN exec_budget_line.budget_type IS
    'CAPEX/OPEX/ФОТ на уровне строки бюджета (разбивка из презентации), отдельно от справочника категорий расходов exec_cost_category.';
