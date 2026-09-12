-- ============================================================
-- ОРГАНИЗАЦИОННАЯ МОДЕЛЬ ЦЕНТРА: расширение существующих сущностей.
-- Не создаёт параллельных справочников подразделений/людей/ролей/
-- функций/компетенций — только новые атрибуты и связи поверх org_units,
-- exec_person, exec_center_role, exec_center_function,
-- professional_competencies, exec_resource_*.
-- dept_functions (145 записей ДФМ) и bank_function_catalog (67 кодов)
-- НЕ изменяются и не удаляются.
-- ============================================================

-- ---------- 1. ПОДРАЗДЕЛЕНИЯ: org_units переиспользуется для узлов
-- структуры Центра. org_units.project_id остаётся NOT NULL — для узлов
-- Центра используется отдельный технический проект-контейнер в уже
-- существующей таблице projects (тот же приём, что и у dept-functions),
-- на который ссылается exec_center.org_project_id. ----------
INSERT INTO projects (title, description)
SELECT 'Центр: организационная модель (служебный)',
       'Технический проект-контейнер для org_units структуры формирующегося Центра. Не бизнес-проект и не ДФМ (project_id=12) — используется только как обязательный владелец записи в org_units.project_id.'
WHERE NOT EXISTS (SELECT 1 FROM projects WHERE title = 'Центр: организационная модель (служебный)');

ALTER TABLE exec_center ADD COLUMN IF NOT EXISTS org_project_id INTEGER REFERENCES projects(id);
UPDATE exec_center SET org_project_id = (SELECT id FROM projects WHERE title = 'Центр: организационная модель (служебный)')
WHERE org_project_id IS NULL;
COMMENT ON COLUMN exec_center.org_project_id IS
    'Служебный projects.id, под которым в org_units.project_id заводятся узлы структуры Центра (project_id там NOT NULL и не менялся).';

ALTER TABLE org_units ADD COLUMN IF NOT EXISTS center_id INTEGER REFERENCES exec_center(id);
ALTER TABLE org_units ADD COLUMN IF NOT EXISTS short_name VARCHAR(120);
ALTER TABLE org_units ADD COLUMN IF NOT EXISTS head_person_id INTEGER REFERENCES exec_person(id);
ALTER TABLE org_units ADD COLUMN IF NOT EXISTS valid_from DATE;
ALTER TABLE org_units ADD COLUMN IF NOT EXISTS valid_to DATE;
ALTER TABLE org_units ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active';
ALTER TABLE org_units ADD COLUMN IF NOT EXISTS description TEXT;

CREATE INDEX IF NOT EXISTS idx_org_units_center ON org_units(center_id);
COMMENT ON COLUMN org_units.center_id IS
    'Узел принадлежит структуре формирующегося Центра (project_id при этом = exec_center.org_project_id — служебный контейнер, не бизнес-проект dept-functions).';
COMMENT ON COLUMN org_units.status IS
    'active|planned — архивация делается через существующий is_archived (soft, без удаления истории).';

-- ---------- 2. ФУНКЦИИ ЦЕНТРА: ответственное и участвующие подразделения.
-- bank_code/bank_code_extra уже существуют в exec_center_function —
-- переиспользуется справочник bank_function_catalog (67 кодов) без
-- изменения самой таблицы каталога. ----------
ALTER TABLE exec_center_function ADD COLUMN IF NOT EXISTS owner_org_unit_id INTEGER REFERENCES org_units(id);
COMMENT ON COLUMN exec_center_function.owner_org_unit_id IS
    'Ответственное подразделение функции Центра (одно, по аналогии с единственным RACI-A).';

CREATE TABLE IF NOT EXISTS exec_center_function_org_unit (
    id                  SERIAL PRIMARY KEY,
    center_function_id  INTEGER NOT NULL REFERENCES exec_center_function(id),
    org_unit_id         INTEGER NOT NULL REFERENCES org_units(id),
    role                VARCHAR(20) NOT NULL DEFAULT 'participant',
    created_at          TIMESTAMP NOT NULL DEFAULT now(),
    CONSTRAINT chk_cfou_role CHECK (role IN ('owner','participant')),
    CONSTRAINT uq_cfou UNIQUE (center_function_id, org_unit_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_cfou_single_owner
    ON exec_center_function_org_unit(center_function_id) WHERE role = 'owner';
COMMENT ON TABLE exec_center_function_org_unit IS
    'Участвующие подразделения функции Центра (многие-ко-многим). Единственное владеющее подразделение — через role=owner c partial unique index.';

-- ---------- 3. РОЛИ И ШТАТНАЯ МОДЕЛЬ ----------
ALTER TABLE exec_center_role ADD COLUMN IF NOT EXISTS code VARCHAR(64);
ALTER TABLE exec_center_role ADD COLUMN IF NOT EXISTS org_unit_id INTEGER REFERENCES org_units(id);
ALTER TABLE exec_center_role ADD COLUMN IF NOT EXISTS level VARCHAR(40);
ALTER TABLE exec_center_role ADD COLUMN IF NOT EXISTS cost_per_month NUMERIC(14,2);
ALTER TABLE exec_center_role ADD COLUMN IF NOT EXISTS valid_from DATE;
ALTER TABLE exec_center_role ADD COLUMN IF NOT EXISTS valid_to DATE;
CREATE UNIQUE INDEX IF NOT EXISTS uq_center_role_code ON exec_center_role(code) WHERE code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_center_role_org_unit ON exec_center_role(org_unit_id);
COMMENT ON COLUMN exec_center_role.org_unit_id IS
    'Подразделение/группа внутри структуры Центра, к которой относится роль.';
COMMENT ON COLUMN exec_center_role.headcount IS
    'Плановая суммарная численность роли, FTE. Занятость по факту — через exec_role_position.';

CREATE TABLE IF NOT EXISTS exec_role_position (
    id              SERIAL PRIMARY KEY,
    role_id         INTEGER NOT NULL REFERENCES exec_center_role(id),
    org_unit_id     INTEGER REFERENCES org_units(id),
    fte             NUMERIC(4,2) NOT NULL DEFAULT 1,
    person_id       INTEGER REFERENCES exec_person(id),
    status          VARCHAR(20) NOT NULL DEFAULT 'vacant',
    date_from       DATE,
    date_to         DATE,
    note            TEXT,
    is_test_data    BOOLEAN NOT NULL DEFAULT false,
    created_by      VARCHAR(255),
    created_at      TIMESTAMP NOT NULL DEFAULT now(),
    updated_at      TIMESTAMP NOT NULL DEFAULT now(),
    CONSTRAINT chk_position_status CHECK (status IN ('occupied','vacant','frozen','eliminated')),
    CONSTRAINT chk_position_occupied CHECK (status <> 'occupied' OR person_id IS NOT NULL),
    CONSTRAINT chk_position_fte CHECK (fte > 0 AND fte <= 1.5),
    CONSTRAINT chk_position_period CHECK (date_to IS NULL OR date_from IS NULL OR date_to >= date_from)
);
CREATE INDEX IF NOT EXISTS idx_role_position_role ON exec_role_position(role_id);
CREATE INDEX IF NOT EXISTS idx_role_position_person ON exec_role_position(person_id);
COMMENT ON TABLE exec_role_position IS
    'Штатная единица роли. Вакансия = status=vacant/person_id IS NULL. Не путать с проектной ресурсной потребностью (exec_resource_requirement) — одна вакансия может закрывать несколько будущих потребностей, потребность может закрываться без найма.';

-- ---------- 4. КОМПЕТЕНЦИИ ----------
CREATE TABLE IF NOT EXISTS exec_center_role_competency (
    id              SERIAL PRIMARY KEY,
    role_id         INTEGER NOT NULL REFERENCES exec_center_role(id),
    competency_id   INTEGER NOT NULL REFERENCES professional_competencies(id),
    required_level  INTEGER NOT NULL DEFAULT 3,
    is_critical     BOOLEAN NOT NULL DEFAULT false,
    note            TEXT,
    CONSTRAINT chk_rc_level CHECK (required_level BETWEEN 1 AND 5),
    CONSTRAINT uq_role_competency UNIQUE (role_id, competency_id)
);

CREATE TABLE IF NOT EXISTS exec_requirement_competency (
    id              SERIAL PRIMARY KEY,
    requirement_id  INTEGER NOT NULL REFERENCES exec_resource_requirement(id),
    competency_id   INTEGER NOT NULL REFERENCES professional_competencies(id),
    required_level  INTEGER NOT NULL DEFAULT 3,
    CONSTRAINT chk_reqc_level CHECK (required_level BETWEEN 1 AND 5),
    CONSTRAINT uq_requirement_competency UNIQUE (requirement_id, competency_id)
);
COMMENT ON TABLE exec_requirement_competency IS
    'Компетенции, необходимые для закрытия ресурсной потребности (для расчёта дефицита компетенций по проектам).';

-- ---------- 5. RACI ----------
CREATE TABLE IF NOT EXISTS exec_raci_matrix (
    id              SERIAL PRIMARY KEY,
    entity_type     VARCHAR(32) NOT NULL,
    entity_id       INTEGER NOT NULL,
    person_id       INTEGER NOT NULL REFERENCES exec_person(id),
    raci_role       VARCHAR(1) NOT NULL DEFAULT 'R',
    is_collective_a BOOLEAN NOT NULL DEFAULT false,
    valid_from      DATE NOT NULL DEFAULT CURRENT_DATE,
    valid_to        DATE,
    note            TEXT,
    created_by      VARCHAR(255),
    created_at      TIMESTAMP NOT NULL DEFAULT now(),
    CONSTRAINT chk_raci_entity_type CHECK (entity_type IN
        ('process','initiative','project','result','milestone')),
    CONSTRAINT chk_raci_role CHECK (raci_role IN ('R','A','C','I')),
    CONSTRAINT chk_raci_period CHECK (valid_to IS NULL OR valid_to >= valid_from)
);
CREATE INDEX IF NOT EXISTS idx_raci_entity ON exec_raci_matrix(entity_type, entity_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_raci_single_owner
    ON exec_raci_matrix(entity_type, entity_id)
    WHERE raci_role = 'A' AND valid_to IS NULL AND is_collective_a = false;
COMMENT ON TABLE exec_raci_matrix IS
    'RACI для process/initiative/project/result/milestone через (entity_type, entity_id) — без дублирования данных объектов. RACI функций Центра — в exec_function_raci.';

-- ---------- 6. ГОДОВОЙ РЕСУРСНЫЙ ПЛАН ----------
CREATE TABLE IF NOT EXISTS exec_org_resource_plan_version (
    id              SERIAL PRIMARY KEY,
    year            INTEGER NOT NULL,
    title           VARCHAR(200),
    status          VARCHAR(20) NOT NULL DEFAULT 'draft',
    note            TEXT,
    is_test_data    BOOLEAN NOT NULL DEFAULT false,
    created_by      VARCHAR(255),
    created_at      TIMESTAMP NOT NULL DEFAULT now(),
    updated_at      TIMESTAMP NOT NULL DEFAULT now(),
    approved_at     TIMESTAMP,
    approved_by     VARCHAR(255),
    CONSTRAINT chk_orpv_status CHECK (status IN ('draft','approved'))
);
COMMENT ON COLUMN exec_org_resource_plan_version.status IS
    'approved = строки версии больше не редактируются через API, только новая версия (как exec_budget_version.is_locked).';

CREATE TABLE IF NOT EXISTS exec_org_resource_plan_line (
    id                      SERIAL PRIMARY KEY,
    version_id              INTEGER NOT NULL REFERENCES exec_org_resource_plan_version(id),
    org_unit_id             INTEGER REFERENCES org_units(id),
    role_id                 INTEGER REFERENCES exec_center_role(id),
    month                   DATE NOT NULL,
    planned_fte             NUMERIC(6,2) NOT NULL DEFAULT 0,
    available_fte           NUMERIC(6,2) NOT NULL DEFAULT 0,
    operational_demand_fte  NUMERIC(6,2) NOT NULL DEFAULT 0,
    external_fte            NUMERIC(6,2) NOT NULL DEFAULT 0,
    fot_plan_amount         NUMERIC(14,2),
    comment                 TEXT,
    created_at              TIMESTAMP NOT NULL DEFAULT now(),
    updated_at              TIMESTAMP NOT NULL DEFAULT now(),
    CONSTRAINT chk_orpl_scope CHECK (org_unit_id IS NOT NULL OR role_id IS NOT NULL),
    CONSTRAINT uq_orpl_period UNIQUE (version_id, org_unit_id, role_id, month)
);
CREATE INDEX IF NOT EXISTS idx_orpl_version ON exec_org_resource_plan_line(version_id);
CREATE INDEX IF NOT EXISTS idx_orpl_month ON exec_org_resource_plan_line(month);
COMMENT ON TABLE exec_org_resource_plan_line IS
    'Ручная часть годового плана (штат/доступность/операционная потребность/внешний ресурс/ФОТ). Проектная потребность и дефицит вычисляются на лету агрегацией exec_resource_requirement — не копируются сюда.';

CREATE TABLE IF NOT EXISTS exec_org_resource_plan_snapshot (
    id              SERIAL PRIMARY KEY,
    version_id      INTEGER NOT NULL REFERENCES exec_org_resource_plan_version(id),
    payload_json    TEXT NOT NULL,
    payload_sha256  VARCHAR(64) NOT NULL,
    version_group   VARCHAR(150) NOT NULL,
    version_number  INTEGER NOT NULL DEFAULT 1,
    is_test_data    BOOLEAN NOT NULL DEFAULT false,
    created_by      VARCHAR(255),
    created_at      TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_orps_version ON exec_org_resource_plan_snapshot(version_id);
COMMENT ON TABLE exec_org_resource_plan_snapshot IS
    'Неизменяемый утверждённый снимок годового ресурсного плана. Нет action на изменение — только новая версия при повторной публикации (payload_sha256 проверяется при чтении).';
