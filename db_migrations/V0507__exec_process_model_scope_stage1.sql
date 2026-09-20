-- Этап 1 обучающего мастера процессного управления — «Границы Блока ВК».
-- Дизайн зафиксирован ранее в V0505/V0506 (design only). Эта миграция
-- реализует минимально необходимые новые таблицы и расширяет уже
-- существующий exec_source_document — НЕ дублирует org_units и НЕ
-- создаёт параллельный справочник документов.

-- ---------- 1. ПАСПОРТ ГРАНИЦ МОДЕЛИ ----------
CREATE TABLE IF NOT EXISTS exec_process_model_scope (
    id SERIAL PRIMARY KEY,
    block_org_unit_id INTEGER NOT NULL REFERENCES org_units(id),
    title VARCHAR(300) NOT NULL DEFAULT 'Границы Блока внутреннего контроля',
    purpose TEXT,
    scope_in TEXT,
    scope_out TEXT,
    owner_person_id INTEGER REFERENCES exec_person(id),
    model_status VARCHAR(20) NOT NULL DEFAULT 'draft',
    wizard_status VARCHAR(20) NOT NULL DEFAULT 'not_started',
    current_step INTEGER NOT NULL DEFAULT 1,
    progress_pct INTEGER NOT NULL DEFAULT 0,
    confirmed_at TIMESTAMP,
    confirmed_by VARCHAR(255),
    created_by VARCHAR(255),
    updated_by VARCHAR(255),
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now(),
    CONSTRAINT chk_scope_model_status CHECK (model_status IN ('draft', 'confirmed')),
    CONSTRAINT chk_scope_wizard_status CHECK (wizard_status IN ('not_started', 'in_progress', 'completed', 'needs_review')),
    CONSTRAINT uq_scope_block UNIQUE (block_org_unit_id)
);
COMMENT ON TABLE exec_process_model_scope IS
    'Паспорт границ процессной модели (Этап 1 обучающего мастера). model_status=confirmed относится только к этому паспорту, НЕ к публикации всей процессной модели — это отдельное будущее действие.';
COMMENT ON COLUMN exec_process_model_scope.wizard_status IS
    'Прогресс прохождения мастера самим пользователем: not_started/in_progress/completed/needs_review.';
COMMENT ON COLUMN exec_process_model_scope.model_status IS
    'Статус самого артефакта (паспорта границ): draft/confirmed. Подтверждение этапа мастера ≠ публикация процессной модели.';

-- ---------- 2. СОСТАВ МОДЕЛИ (ссылки на существующие оргюниты) ----------
CREATE TABLE IF NOT EXISTS exec_process_model_scope_unit (
    id SERIAL PRIMARY KEY,
    scope_id INTEGER NOT NULL REFERENCES exec_process_model_scope(id),
    org_unit_id INTEGER NOT NULL REFERENCES org_units(id),
    decision VARCHAR(20) NOT NULL DEFAULT 'included',
    is_manually_added BOOLEAN NOT NULL DEFAULT false,
    exclusion_reason TEXT,
    confirmation_status VARCHAR(20) NOT NULL DEFAULT 'pending',
    comment TEXT,
    updated_by VARCHAR(255),
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now(),
    CONSTRAINT chk_scope_unit_decision CHECK (decision IN ('included', 'excluded')),
    CONSTRAINT chk_scope_unit_confirmation CHECK (confirmation_status IN ('pending', 'confirmed')),
    CONSTRAINT uq_scope_unit UNIQUE (scope_id, org_unit_id)
);
COMMENT ON TABLE exec_process_model_scope_unit IS
    'Состав границ модели: ссылка на существующий org_unit + решение включён/исключён + статус подтверждения. НЕ копирует название подразделения, НЕ изменяет org_units.';
COMMENT ON COLUMN exec_process_model_scope_unit.is_manually_added IS
    'true — подразделение добавлено пользователем вручную (например ДФМ, который структурно не является дочерним для Блока ВК в org_units, но входит в границы функционально). false — подсказано автоматически как дочерний оргюнит блока.';

-- ---------- 3. РАСШИРЕНИЕ exec_source_document ПОД МЕТАДАННЫЕ И ФАЙЛ ----------
ALTER TABLE exec_source_document
    ADD COLUMN IF NOT EXISTS scope_id INTEGER REFERENCES exec_process_model_scope(id),
    ADD COLUMN IF NOT EXISTS org_unit_id INTEGER REFERENCES org_units(id),
    ADD COLUMN IF NOT EXISTS version_label VARCHAR(60),
    ADD COLUMN IF NOT EXISTS s3_key VARCHAR(512),
    ADD COLUMN IF NOT EXISTS original_filename VARCHAR(255),
    ADD COLUMN IF NOT EXISTS mime_type VARCHAR(128),
    ADD COLUMN IF NOT EXISTS file_size INTEGER,
    ADD COLUMN IF NOT EXISTS confidentiality_level VARCHAR(20) NOT NULL DEFAULT 'internal',
    ADD COLUMN IF NOT EXISTS confirmed_actual_by VARCHAR(255),
    ADD COLUMN IF NOT EXISTS confirmed_actual_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS comment TEXT,
    ADD COLUMN IF NOT EXISTS uploaded_by VARCHAR(255);

ALTER TABLE exec_source_document
    ADD CONSTRAINT chk_source_doc_confidentiality CHECK (
        confidentiality_level IN ('public', 'internal', 'confidential', 'restricted')
    );

COMMENT ON COLUMN exec_source_document.scope_id IS
    'Паспорт границ модели, в рамках которого документ загружен мастером (NULL — документ добавлен вне мастера).';
COMMENT ON COLUMN exec_source_document.org_unit_id IS
    'Подразделение, к которому относится документ (положение о блоке/подразделении).';
COMMENT ON COLUMN exec_source_document.confidentiality_level IS
    'Уровень конфиденциальности: public/internal/confidential/restricted. Определяет, кому доступно скачивание (см. backend exec-process-scope).';
COMMENT ON COLUMN exec_source_document.confirmed_actual_by IS
    'Кто вручную подтвердил, что документ действительно действующая версия. Система НЕ признаёт документ действующим автоматически (например по дате загрузки).';
COMMENT ON COLUMN exec_source_document.s3_key IS
    'Ключ файла в S3 (bucket files), если документ загружен как файл, а не как ссылка/запись без вложения.';

CREATE INDEX IF NOT EXISTS idx_source_doc_scope ON exec_source_document(scope_id);
CREATE INDEX IF NOT EXISTS idx_source_doc_org_unit ON exec_source_document(org_unit_id);
CREATE INDEX IF NOT EXISTS idx_scope_unit_scope ON exec_process_model_scope_unit(scope_id);
