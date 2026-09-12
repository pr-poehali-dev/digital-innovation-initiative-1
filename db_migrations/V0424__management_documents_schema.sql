-- ============================================================
-- УПРАВЛЕНЧЕСКИЕ ДОКУМЕНТЫ: шаблоны, черновики/опубликованные версии,
-- руководительский пакет, повестки, протоколы.
-- Переиспользует: exec_action (поручения из протокола), exec_decision_instance
-- (проект решения), exec_meeting (повестка/протокол расширяют существующую
-- встречу, не дублируют её), doc_source/knowledge_entry (регистрация
-- опубликованного документа как рабочего артефакта).
-- Новую cloud function не создаёт — логика в exec-reports.
-- ============================================================

-- ---------- 1. РЕЕСТР ШАБЛОНОВ ----------
CREATE TABLE IF NOT EXISTS exec_doc_template (
    id                  SERIAL PRIMARY KEY,
    code                VARCHAR(64),
    title               VARCHAR(300) NOT NULL,
    doc_type            VARCHAR(48) NOT NULL,
    purpose             TEXT,
    recipient           VARCHAR(255),
    sections_json       TEXT NOT NULL DEFAULT '[]',
    version_number      INTEGER NOT NULL DEFAULT 1,
    status              VARCHAR(20) NOT NULL DEFAULT 'draft',
    valid_from          DATE,
    valid_to            DATE,
    author              VARCHAR(255),
    approved_at         TIMESTAMP,
    approved_by         VARCHAR(255),
    available_formats   VARCHAR(120) NOT NULL DEFAULT 'html',
    required_sources    TEXT,
    comment             TEXT,
    replaced_by_id      INTEGER REFERENCES exec_doc_template(id),
    is_test_data        BOOLEAN NOT NULL DEFAULT false,
    created_at          TIMESTAMP NOT NULL DEFAULT now(),
    updated_at          TIMESTAMP NOT NULL DEFAULT now(),
    CONSTRAINT chk_doc_template_status CHECK (status IN
        ('draft','review','approved','superseded','archived')),
    CONSTRAINT chk_doc_template_type CHECK (doc_type IN
        ('weekly_report','monthly_report','actions_report','portfolio_report','project_card',
         'initiative_brief','risks_issues_brief','budget_planfact','resource_plan','goals_kpi_report',
         'results_effects_brief','decision_draft','meeting_agenda','meeting_protocol','executive_package'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_doc_template_code_version ON exec_doc_template(code, version_number) WHERE code IS NOT NULL;
COMMENT ON TABLE exec_doc_template IS
    'Реестр шаблонов управленческих документов. Утверждённый шаблон (status=approved) не редактируется — правка создаёт новую запись с version_number+1 и replaced_by_id у предыдущей.';
COMMENT ON COLUMN exec_doc_template.sections_json IS
    'JSON-массив разделов: [{key, title, kind, order, intro_text, closing_text}]. kind = text|table|placeholder_block. Подстановки — только из разрешённого списка (см. ALLOWED_PLACEHOLDERS в backend), без eval/SQL/произвольного кода.';
COMMENT ON COLUMN exec_doc_template.available_formats IS
    'Через запятую: html,docx,xlsx (без пробелов).';

-- ---------- 2. ВЕРСИИ СФОРМИРОВАННОГО ДОКУМЕНТА (черновик → опубликован) ----------
CREATE TABLE IF NOT EXISTS exec_doc_version (
    id                  SERIAL PRIMARY KEY,
    template_id         INTEGER NOT NULL REFERENCES exec_doc_template(id),
    title               VARCHAR(300) NOT NULL,
    period_from         DATE,
    period_to           DATE,
    params_json         TEXT,
    payload_json        TEXT,
    payload_sha256      VARCHAR(64),
    version_group       VARCHAR(150) NOT NULL,
    version_number      INTEGER NOT NULL DEFAULT 1,
    status              VARCHAR(20) NOT NULL DEFAULT 'draft',
    source_snapshot_refs TEXT,
    quality_warnings    TEXT,
    knowledge_entry_id  INTEGER,
    is_test_data        BOOLEAN NOT NULL DEFAULT false,
    author              VARCHAR(255),
    created_at          TIMESTAMP NOT NULL DEFAULT now(),
    published_at        TIMESTAMP,
    published_by        VARCHAR(255),
    CONSTRAINT chk_doc_version_status CHECK (status IN ('draft','published'))
);
CREATE INDEX IF NOT EXISTS idx_doc_version_template ON exec_doc_version(template_id);
CREATE INDEX IF NOT EXISTS idx_doc_version_group ON exec_doc_version(version_group);
COMMENT ON TABLE exec_doc_version IS
    'Черновик пересобирается (UPDATE payload/params), опубликованная версия (status=published) больше не редактируется — повторная публикация создаёт новую запись с version_number+1 в той же version_group. knowledge_entry_id — ссылка на регистрацию в документном контуре после публикации.';
COMMENT ON COLUMN exec_doc_version.source_snapshot_refs IS
    'JSON-массив ID использованных исходных снимков (exec_report_snapshot/exec_goals_report_snapshot/exec_financial_snapshot и т.д.) для прослеживаемости происхождения.';

-- ---------- 3. РУКОВОДИТЕЛЬСКИЙ ПАКЕТ ----------
CREATE TABLE IF NOT EXISTS exec_package (
    id                  SERIAL PRIMARY KEY,
    title               VARCHAR(300) NOT NULL,
    recipient           VARCHAR(255),
    period_from         DATE,
    period_to           DATE,
    sections_json       TEXT NOT NULL DEFAULT '[]',
    comment             TEXT,
    status              VARCHAR(20) NOT NULL DEFAULT 'draft',
    version_group       VARCHAR(150) NOT NULL,
    version_number      INTEGER NOT NULL DEFAULT 1,
    payload_json        TEXT,
    payload_sha256      VARCHAR(64),
    is_test_data        BOOLEAN NOT NULL DEFAULT false,
    author              VARCHAR(255),
    created_at          TIMESTAMP NOT NULL DEFAULT now(),
    published_at        TIMESTAMP,
    published_by        VARCHAR(255),
    CONSTRAINT chk_package_status CHECK (status IN ('draft','published'))
);
CREATE INDEX IF NOT EXISTS idx_package_group ON exec_package(version_group);
COMMENT ON TABLE exec_package IS
    'Руководительский пакет за период: набор разделов (sections_json задаёт состав и порядок — id раздела + doc_version_id при наличии). Публикация фиксирует неизменяемый payload с SHA-256.';

-- ---------- 4. ПОВЕСТКА И ПРОТОКОЛ (расширяют exec_meeting, не дублируют) ----------
ALTER TABLE exec_meeting ADD COLUMN IF NOT EXISTS planned_duration_minutes INTEGER;
ALTER TABLE exec_meeting ADD COLUMN IF NOT EXISTS agenda_published_at TIMESTAMP;
ALTER TABLE exec_meeting ADD COLUMN IF NOT EXISTS protocol_published_at TIMESTAMP;
ALTER TABLE exec_meeting ADD COLUMN IF NOT EXISTS agenda_payload_json TEXT;
ALTER TABLE exec_meeting ADD COLUMN IF NOT EXISTS agenda_payload_sha256 VARCHAR(64);
ALTER TABLE exec_meeting ADD COLUMN IF NOT EXISTS protocol_payload_json TEXT;
ALTER TABLE exec_meeting ADD COLUMN IF NOT EXISTS protocol_payload_sha256 VARCHAR(64);
COMMENT ON COLUMN exec_meeting.agenda_payload_json IS
    'Неизменяемый снимок повестки на момент публикации (агенда/участники/материалы/требуемые решения). NULL пока не опубликована.';
COMMENT ON COLUMN exec_meeting.protocol_payload_json IS
    'Неизменяемый снимок протокола на момент публикации (фактические участники/решения/поручения/сроки).';

-- ---------- 5. РЕГИСТРАЦИЯ ОПУБЛИКОВАННОГО ДОКУМЕНТА В ДОКУМЕНТНОМ КОНТУРЕ ----------
-- knowledge_entry уже поддерживает entry_type без CHECK-ограничения —
-- используем entry_type='exec_document', origin_kind='system_generated'
-- (новое значение, не ломает существующие 'human'|'ocr'|'ai_summary'|'legacy'|'import').
ALTER TABLE exec_doc_version ADD CONSTRAINT fk_doc_version_knowledge_entry
    FOREIGN KEY (knowledge_entry_id) REFERENCES knowledge_entry(id);

CREATE INDEX IF NOT EXISTS idx_doc_version_knowledge_entry ON exec_doc_version(knowledge_entry_id);
