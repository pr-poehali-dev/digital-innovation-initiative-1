-- ============ ОБЯЗАТЕЛЬСТВА: РАЗДЕЛЕНИЕ ОПЛАЧЕННОЙ И ОТКРЫТОЙ ЧАСТИ ============
ALTER TABLE exec_financial_commitment ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE exec_financial_commitment ADD CONSTRAINT chk_commitment_paid_le_amount CHECK (paid_amount <= amount);
COMMENT ON COLUMN exec_financial_commitment.amount IS 'Общая сумма обязательства по договору';
COMMENT ON COLUMN exec_financial_commitment.paid_amount IS 'Уже оплаченная часть (эта сумма обычно уже отражена в exec_financial_actual - не суммировать повторно)';

-- ============ ОЖИДАЕМЫЕ РАСХОДЫ БЕЗ ОФОРМЛЕННОГО ОБЯЗАТЕЛЬСТВА ============
CREATE TABLE IF NOT EXISTS exec_financial_expected (
    id SERIAL PRIMARY KEY,
    project_id INTEGER REFERENCES exec_project(id),
    initiative_id INTEGER REFERENCES exec_initiative(id),
    category_id INTEGER NOT NULL REFERENCES exec_cost_category(id),
    month DATE NOT NULL,
    amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    comment TEXT,
    is_test_data BOOLEAN NOT NULL DEFAULT false,
    created_by VARCHAR(255),
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now(),
    CONSTRAINT chk_expected_parent CHECK (
        (CASE WHEN project_id IS NOT NULL THEN 1 ELSE 0 END) +
        (CASE WHEN initiative_id IS NOT NULL THEN 1 ELSE 0 END) = 1
    )
);
CREATE INDEX IF NOT EXISTS idx_expected_project ON exec_financial_expected(project_id);
COMMENT ON TABLE exec_financial_expected IS
    'Ожидаемые будущие расходы без оформленного договора - отдельно от commitment, чтобы не путать план намерений с юридическим обязательством';

-- ============ БЮДЖЕТНАЯ ВЕРСИЯ: ЕДИНСТВЕННАЯ ДЕЙСТВУЮЩАЯ ============
ALTER TABLE exec_budget_version ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE exec_budget_version ADD COLUMN IF NOT EXISTS effective_date DATE;
ALTER TABLE exec_budget_version ADD COLUMN IF NOT EXISTS scenario VARCHAR(24) NOT NULL DEFAULT 'base';
COMMENT ON COLUMN exec_budget_version.is_active IS
    'Только одна версия может быть is_active=true для (project_id/initiative_id, year, scenario) - обеспечивается backend при активации';
COMMENT ON COLUMN exec_budget_version.scenario IS 'base / optimistic / pessimistic - на будущее, сейчас всегда base';

-- Частичный уникальный индекс: не более одной активной версии на (проект, год, сценарий)
CREATE UNIQUE INDEX IF NOT EXISTS uq_budget_version_active_project
    ON exec_budget_version(project_id, year, scenario) WHERE is_active = true AND project_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_budget_version_active_initiative
    ON exec_budget_version(initiative_id, year, scenario) WHERE is_active = true AND initiative_id IS NOT NULL;
