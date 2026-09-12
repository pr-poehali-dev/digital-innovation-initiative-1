-- ============================================================
-- ЦЕЛИ, KPI И ЭФФЕКТЫ: расширение существующих сущностей.
-- exec_center_goal — расширяем до полной иерархии уровней (не создаём
-- параллельный справочник целей). exec_result/exec_effect переиспользуются
-- без изменений структуры (кроме необязательных ссылок на цель).
-- Связи целей с функциями/инициативами/проектами/результатами/эффектами —
-- через уже существующий exec_link (src_kind/tgt_kind = 'goal').
-- ============================================================

-- ---------- 1. ИЕРАРХИЯ УРОВНЕЙ ЦЕЛИ ----------
ALTER TABLE exec_center_goal ADD COLUMN IF NOT EXISTS goal_level VARCHAR(24) NOT NULL DEFAULT 'center';
ALTER TABLE exec_center_goal ADD COLUMN IF NOT EXISTS code VARCHAR(64);
ALTER TABLE exec_center_goal ADD COLUMN IF NOT EXISTS org_unit_id INTEGER REFERENCES org_units(id);
ALTER TABLE exec_center_goal ADD COLUMN IF NOT EXISTS priority VARCHAR(20) NOT NULL DEFAULT 'medium';
ALTER TABLE exec_center_goal ADD COLUMN IF NOT EXISTS valid_from DATE;
ALTER TABLE exec_center_goal ADD COLUMN IF NOT EXISTS valid_to DATE;
ALTER TABLE exec_center_goal ADD COLUMN IF NOT EXISTS achievement_criteria TEXT;
ALTER TABLE exec_center_goal ADD COLUMN IF NOT EXISTS actual_date DATE;
ALTER TABLE exec_center_goal ADD COLUMN IF NOT EXISTS progress_mode VARCHAR(20) NOT NULL DEFAULT 'manual';
ALTER TABLE exec_center_goal ADD COLUMN IF NOT EXISTS manual_status_confirmed BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE exec_center_goal ADD COLUMN IF NOT EXISTS is_test_data BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE exec_center_goal ADD COLUMN IF NOT EXISTS created_by VARCHAR(255);

CREATE UNIQUE INDEX IF NOT EXISTS uq_center_goal_code ON exec_center_goal(code) WHERE code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_center_goal_level ON exec_center_goal(goal_level);
CREATE INDEX IF NOT EXISTS idx_center_goal_parent ON exec_center_goal(parent_goal_id);

COMMENT ON COLUMN exec_center_goal.goal_level IS
    'strategic|organization|center|org_unit|initiative|project — уровень иерархии цели. kind (goal/kpi) сохранён для обратной совместимости с существующими 6 записями.';
COMMENT ON COLUMN exec_center_goal.progress_mode IS
    'manual — прогресс вводится вручную; by_indicators — расчёт по показателям (exec_goal_indicator); by_children — расчёт по подцелям; weighted — взвешенный расчёт по подцелям/показателям с весами.';
COMMENT ON COLUMN exec_center_goal.status IS
    'draft|agreed|active|achieved|paused|cancelled|archived — статус согласования цели. Просрочка вычисляется по due_date, не хранится отдельным статусом.';

-- Существующие 6 целей явно остаются на уровне 'center' (goal_level уже
-- default 'center' — ничего дополнительно мигрировать не требуется).

-- ---------- 2. ЕДИНЫЙ РЕЕСТР ПОКАЗАТЕЛЕЙ ----------
CREATE TABLE IF NOT EXISTS exec_indicator (
    id                  SERIAL PRIMARY KEY,
    code                VARCHAR(64),
    title               VARCHAR(400) NOT NULL,
    purpose             TEXT,
    indicator_type      VARCHAR(32) NOT NULL DEFAULT 'kpi',
    unit                VARCHAR(64),
    improvement_direction VARCHAR(24) NOT NULL DEFAULT 'higher_is_better',
    periodicity         VARCHAR(20) NOT NULL DEFAULT 'monthly',
    owner_person_id     INTEGER REFERENCES exec_person(id),
    data_entry_person_id INTEGER REFERENCES exec_person(id),
    data_source         TEXT,
    baseline_value      NUMERIC(18,4),
    target_value        NUMERIC(18,4),
    threshold_yellow    NUMERIC(18,4),
    threshold_red       NUMERIC(18,4),
    range_min           NUMERIC(18,4),
    range_max           NUMERIC(18,4),
    is_calculated       BOOLEAN NOT NULL DEFAULT false,
    active_methodology_id INTEGER,
    applicability       VARCHAR(20) NOT NULL DEFAULT 'active',
    status              VARCHAR(20) NOT NULL DEFAULT 'draft',
    is_test_data        BOOLEAN NOT NULL DEFAULT false,
    created_by          VARCHAR(255),
    created_at          TIMESTAMP NOT NULL DEFAULT now(),
    updated_at          TIMESTAMP NOT NULL DEFAULT now(),
    CONSTRAINT chk_indicator_type CHECK (indicator_type IN
        ('kpi','performance','effect','process','quality','deadline','financial','resource','risk','informational')),
    CONSTRAINT chk_indicator_direction CHECK (improvement_direction IN
        ('higher_is_better','lower_is_better','in_range','target_exact','observe_only')),
    CONSTRAINT chk_indicator_periodicity CHECK (periodicity IN
        ('date','monthly','quarterly','yearly','custom')),
    CONSTRAINT chk_indicator_applicability CHECK (applicability IN ('active','deprecated')),
    CONSTRAINT chk_indicator_status CHECK (status IN ('draft','active','archived'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_indicator_code ON exec_indicator(code) WHERE code IS NOT NULL;
COMMENT ON TABLE exec_indicator IS
    'Единый реестр показателей (KPI, эффект, процессный и т.д.). is_calculated=true требует активной методики (exec_indicator_methodology) — иначе показатель нельзя помечать автоматически рассчитываемым.';
COMMENT ON COLUMN exec_indicator.threshold_yellow IS
    'Порог перехода в жёлтую зону относительно target_value (интерпретация зависит от improvement_direction).';

-- ---------- 3. МЕТОДИКА РАСЧЁТА (версионируемая) ----------
CREATE TABLE IF NOT EXISTS exec_indicator_methodology (
    id                  SERIAL PRIMARY KEY,
    indicator_id        INTEGER NOT NULL REFERENCES exec_indicator(id),
    version_number      INTEGER NOT NULL DEFAULT 1,
    description_text    TEXT,
    formula_kind        VARCHAR(20) NOT NULL DEFAULT 'manual',
    numerator_desc      TEXT,
    denominator_desc    TEXT,
    rounding_rule       VARCHAR(40),
    period_kind         VARCHAR(20) NOT NULL DEFAULT 'monthly',
    exceptions_text      TEXT,
    component_sources   TEXT,
    document_source_id  INTEGER,
    approved_at         DATE,
    approved_by         VARCHAR(255),
    status              VARCHAR(20) NOT NULL DEFAULT 'draft',
    is_test_data        BOOLEAN NOT NULL DEFAULT false,
    created_by          VARCHAR(255),
    created_at          TIMESTAMP NOT NULL DEFAULT now(),
    CONSTRAINT chk_methodology_formula_kind CHECK (formula_kind IN
        ('manual','sum','average','percentage','ratio','difference','running_total')),
    CONSTRAINT chk_methodology_status CHECK (status IN ('draft','active','superseded')),
    CONSTRAINT uq_indicator_methodology_version UNIQUE (indicator_id, version_number)
);
CREATE INDEX IF NOT EXISTS idx_methodology_indicator ON exec_indicator_methodology(indicator_id);
COMMENT ON TABLE exec_indicator_methodology IS
    'Версионируемая методика расчёта показателя. formula_kind ограничен безопасным набором операций (без eval/произвольного кода). Новая редакция создаёт новую версию — старые значения (exec_indicator_value) хранят ссылку на версию, по которой были рассчитаны, и не пересчитываются задним числом.';

ALTER TABLE exec_indicator ADD CONSTRAINT fk_indicator_active_methodology
    FOREIGN KEY (active_methodology_id) REFERENCES exec_indicator_methodology(id);

-- ---------- 4. ЗНАЧЕНИЯ ПОКАЗАТЕЛЯ ПО ПЕРИОДАМ ----------
CREATE TABLE IF NOT EXISTS exec_indicator_value (
    id                  SERIAL PRIMARY KEY,
    indicator_id        INTEGER NOT NULL REFERENCES exec_indicator(id),
    methodology_id      INTEGER REFERENCES exec_indicator_methodology(id),
    period_kind         VARCHAR(20) NOT NULL DEFAULT 'monthly',
    period_start        DATE NOT NULL,
    period_end          DATE,
    plan_value          NUMERIC(18,4),
    actual_value        NUMERIC(18,4),
    forecast_value      NUMERIC(18,4),
    threshold_value     NUMERIC(18,4),
    unit                VARCHAR(64),
    data_source         TEXT,
    received_at         TIMESTAMP,
    entered_by          VARCHAR(255),
    confirmed_by        VARCHAR(255),
    verification_status VARCHAR(20) NOT NULL DEFAULT 'unconfirmed',
    comment             TEXT,
    superseded_by_id    INTEGER REFERENCES exec_indicator_value(id),
    is_test_data        BOOLEAN NOT NULL DEFAULT false,
    created_at          TIMESTAMP NOT NULL DEFAULT now(),
    CONSTRAINT chk_value_period_kind CHECK (period_kind IN ('date','monthly','quarterly','yearly','custom')),
    CONSTRAINT chk_value_verification CHECK (verification_status IN ('unconfirmed','confirmed','disputed'))
);
CREATE INDEX IF NOT EXISTS idx_indicator_value_indicator ON exec_indicator_value(indicator_id, period_start);
COMMENT ON TABLE exec_indicator_value IS
    'Плановые/фактические/прогнозные значения показателя по периодам. Исправление факта не перезаписывает старую строку — создаёт новую и проставляет superseded_by_id у предыдущей (история не теряется).';

-- ---------- 5. СВЯЗЬ ЦЕЛИ С ПОКАЗАТЕЛЕМ (со взвешенным прогрессом) ----------
CREATE TABLE IF NOT EXISTS exec_goal_indicator (
    id              SERIAL PRIMARY KEY,
    goal_id         INTEGER NOT NULL REFERENCES exec_center_goal(id),
    indicator_id    INTEGER NOT NULL REFERENCES exec_indicator(id),
    weight_pct      NUMERIC(5,2),
    note            TEXT,
    created_at      TIMESTAMP NOT NULL DEFAULT now(),
    CONSTRAINT uq_goal_indicator UNIQUE (goal_id, indicator_id)
);
COMMENT ON TABLE exec_goal_indicator IS
    'Показатели, которыми измеряется цель, с необязательным весом для взвешенного расчёта прогресса (progress_mode=weighted). Сумма активных весов по цели должна быть 100% — проверяется в backend при сохранении, не в БД (позволяет временно черновое состояние).';

-- ---------- 6. РЕЗУЛЬТАТ/ЭФФЕКТ ↔ ЦЕЛЬ (без дублирования exec_result/exec_effect) ----------
ALTER TABLE exec_result ADD COLUMN IF NOT EXISTS is_test_data BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE exec_effect ADD COLUMN IF NOT EXISTS indicator_id INTEGER REFERENCES exec_indicator(id);
COMMENT ON COLUMN exec_effect.indicator_id IS
    'Необязательная ссылка на показатель реестра exec_indicator, которым измеряется эффект (эффект может использовать свои metric/baseline/actual без общего показателя).';

-- ---------- 7. ДОПУСТИМЫЕ ТИПЫ ДЛЯ exec_link: добавляем 'goal' и 'indicator' ----------
-- (exec_link.src_kind/tgt_kind — VARCHAR без CHECK, справочник допустимых
-- значений живёт в backend LINKABLE — миграция схемы не требуется).

-- ---------- 8. ГОДОВОЙ/РЕГУЛЯРНЫЙ СНИМОК ДОСТИЖЕНИЯ ЦЕЛЕЙ ----------
CREATE TABLE IF NOT EXISTS exec_goals_report_snapshot (
    id              SERIAL PRIMARY KEY,
    title           VARCHAR(300) NOT NULL,
    report_kind     VARCHAR(48) NOT NULL DEFAULT 'goals_achievement',
    period_from     DATE,
    period_to       DATE,
    payload_json    TEXT NOT NULL,
    payload_sha256  VARCHAR(64) NOT NULL,
    version_group   VARCHAR(150) NOT NULL,
    version_number  INTEGER NOT NULL DEFAULT 1,
    is_test_data    BOOLEAN NOT NULL DEFAULT false,
    created_by      VARCHAR(255),
    created_at      TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_goals_snapshot_group ON exec_goals_report_snapshot(version_group);
COMMENT ON TABLE exec_goals_report_snapshot IS
    'Неизменяемый снимок отчёта по целям/KPI/эффектам. Отдельная таблица от exec_report_snapshot, т.к. exec-reports уже содержит kpi-раздел с другой структурой payload — не смешиваем схемы.';
