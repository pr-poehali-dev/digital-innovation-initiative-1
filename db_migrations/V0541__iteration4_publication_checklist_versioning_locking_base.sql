-- Итерация 4 (продолжение), разделы 1-7 ТЗ: блокировка небезопасной публикации,
-- полный optimistic locking, публикационный чек-лист, версии, замечания,
-- контрольная сумма снимка. Ничего не удаляем, только добавляем.

-- ── Раздел 2: optimistic locking для участника процесса ──────────────────────
-- exec_process_participant не имел updated_at/updated_by — нельзя было защитить
-- от молчаливой перезаписи. Добавляем и подтверждение обязательных участников
-- (требуется публикационным чек-листом: «есть неподтверждённые обязательные
-- участники»).
ALTER TABLE exec_process_participant ADD COLUMN IF NOT EXISTS confirmation_status VARCHAR(20) NOT NULL DEFAULT 'user_draft'
    CHECK (confirmation_status IN ('user_draft', 'confirmed'));
ALTER TABLE exec_process_participant ADD COLUMN IF NOT EXISTS is_required BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE exec_process_participant ADD COLUMN IF NOT EXISTS updated_by VARCHAR(255);
ALTER TABLE exec_process_participant ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT now();
COMMENT ON COLUMN exec_process_participant.confirmation_status IS
    'Публикационный чек-лист (раздел 3 ТЗ итерации 4): обязательный участник должен быть подтверждён (не просто введён).';

-- ── Раздел 3: решение по контролю критичного риска ───────────────────────────
-- «Не трактуй контроль пока не определён как существующий». Для публикации
-- критичного риска нужно зафиксированное управленческое решение: контроль
-- подтверждён, ИЛИ риск принят уполномоченным лицом, ИЛИ разработка контроля
-- включена в улучшение/инициативу с владельцем и сроком.
ALTER TABLE exec_process_risk ADD COLUMN IF NOT EXISTS accepted_by VARCHAR(255);
ALTER TABLE exec_process_risk ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMP;
ALTER TABLE exec_process_risk ADD COLUMN IF NOT EXISTS accepted_note TEXT;
ALTER TABLE exec_process_risk ADD COLUMN IF NOT EXISTS control_plan_improvement_id INTEGER REFERENCES exec_process_improvement(id);
COMMENT ON COLUMN exec_process_risk.accepted_by IS
    'Риск принят уполномоченным лицом «как есть» (без контроля) — управленческое решение, раздел 3 ТЗ итерации 4.';
COMMENT ON COLUMN exec_process_risk.control_plan_improvement_id IS
    'Разработка контроля включена в это улучшение TO-BE (должно иметь owner_person_id и due_date) вместо готового контроля.';

ALTER TABLE exec_process_improvement ADD COLUMN IF NOT EXISTS due_date DATE;
COMMENT ON COLUMN exec_process_improvement.due_date IS
    'Срок реализации улучшения — обязателен, если улучшение используется как план разработки контроля критичного риска.';

-- ── Раздел 3: обязательные документы ──────────────────────────────────────────
ALTER TABLE exec_process_document_link ADD COLUMN IF NOT EXISTS is_required BOOLEAN NOT NULL DEFAULT true;
COMMENT ON COLUMN exec_process_document_link.is_required IS
    'Документ обязателен для публикации процесса — публикационный чек-лист проверяет его подтверждение (exec_source_document.confirmed_actual_by).';

-- ── Раздел 3/4: замечания (отдельно от журнала решений согласования) ─────────
CREATE TABLE IF NOT EXISTS exec_process_remark (
    id SERIAL PRIMARY KEY,
    process_node_id INTEGER NOT NULL REFERENCES exec_process_node(id),
    entity_type VARCHAR(30) NOT NULL DEFAULT 'process_node'
        CHECK (entity_type IN ('process_node', 'diagram', 'passport', 'diagram_node', 'diagram_edge', 'risk', 'control', 'metric', 'issue')),
    entity_id INTEGER,
    diagram_id INTEGER REFERENCES exec_process_diagram(id),
    diagram_node_id INTEGER REFERENCES exec_process_diagram_node(id),
    risk_id INTEGER REFERENCES exec_process_risk(id),
    field_ref VARCHAR(120),
    text TEXT NOT NULL,
    author VARCHAR(255) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'accepted_exception')),
    resolved_by VARCHAR(255),
    resolved_at TIMESTAMP,
    resolution_note TEXT,
    reviewer_confirmed_by VARCHAR(255),
    reviewer_confirmed_at TIMESTAMP,
    is_test_data BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_by VARCHAR(255)
);
CREATE INDEX IF NOT EXISTS idx_process_remark_node ON exec_process_remark(process_node_id, status);
COMMENT ON TABLE exec_process_remark IS
    'Замечания экрана согласования (раздел 4 ТЗ итерации 4): автор, дата, текст, ссылка на объект модели, статус открыто/устранено/принято как исключение, подтверждение проверяющего.';

-- ── Раздел 3: явное принятие предупреждения уполномоченным пользователем ─────
CREATE TABLE IF NOT EXISTS exec_process_warning_decision (
    id SERIAL PRIMARY KEY,
    entity_type VARCHAR(20) NOT NULL CHECK (entity_type IN ('process_node', 'diagram')),
    entity_id INTEGER NOT NULL,
    warning_code VARCHAR(60) NOT NULL,
    warning_ref_id INTEGER,
    actor VARCHAR(255) NOT NULL,
    comment TEXT NOT NULL,
    is_test_data BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_process_warning_decision ON exec_process_warning_decision(entity_type, entity_id, warning_code);
COMMENT ON TABLE exec_process_warning_decision IS
    'Явное решение уполномоченного пользователя принять предупреждение чек-листа — обязателен комментарий, нет «Игнорировать всё» (раздел 3 ТЗ итерации 4).';

-- ── Раздел 6: контрольная сумма снимка версии ─────────────────────────────────
ALTER TABLE exec_process_version_history ADD COLUMN IF NOT EXISTS snapshot_checksum VARCHAR(64);
COMMENT ON COLUMN exec_process_version_history.snapshot_checksum IS
    'SHA-256 канонического JSON снимка — подтверждает неизменность опубликованных данных (раздел 6 ТЗ итерации 4).';

-- ── Раздел 5: полноценные версии — форк процесса вместо правки published ────
ALTER TABLE exec_process_node ADD COLUMN IF NOT EXISTS is_current BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE exec_process_node ADD COLUMN IF NOT EXISTS root_lineage_id INTEGER;
ALTER TABLE exec_process_node ADD COLUMN IF NOT EXISTS derived_from_id INTEGER REFERENCES exec_process_node(id);
UPDATE exec_process_node SET root_lineage_id = id WHERE root_lineage_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_process_node_lineage ON exec_process_node(root_lineage_id);
COMMENT ON COLUMN exec_process_node.is_current IS
    'false — историческая версия (опубликованный снимок, доступен только на чтение через реестр версий), не показывается в активном дереве архитектуры.';
COMMENT ON COLUMN exec_process_node.root_lineage_id IS
    'Id первой версии этого процесса — объединяет все версии одного логического процесса для реестра версий.';
COMMENT ON COLUMN exec_process_node.derived_from_id IS
    'Id опубликованной версии, из которой создан этот черновик («Создать новую версию»), раздел 5 ТЗ итерации 4.';

ALTER TABLE exec_process_diagram ADD COLUMN IF NOT EXISTS is_current BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE exec_process_diagram ADD COLUMN IF NOT EXISTS derived_from_id INTEGER REFERENCES exec_process_diagram(id);
COMMENT ON COLUMN exec_process_diagram.is_current IS
    'false — историческая версия схемы, принадлежит неактуальной версии процесса (is_current=false у exec_process_node), доступна только на чтение.';
COMMENT ON COLUMN exec_process_diagram.derived_from_id IS
    'Id схемы предыдущей версии процесса, из которой склонирована эта схема при создании новой версии процесса.';

-- ── Раздел 10: журнал/undo — «специальное право» на отмену чужого действия ───
-- can_confirm уже используется как «уполномоченный» во всём контуре; отдельная
-- колонка не нужна, документируем это решение здесь, чтобы не потерять контекст.
COMMENT ON TABLE exec_audit_log IS
    'Общий журнал действий контура «Процессное управление». Отмена (undo) своего действия доступна автору; отмена чужого действия — только пользователю с can_confirm=true (раздел 10 ТЗ итерации 4). Проверяется в backend, не в БД.';
