-- Итерация 4, раздел 1: конкурентное редактирование.
-- expected_updated_at уже был введён backend-функцией check_optimistic_lock
-- в итерации 3 для risk/control/metric/issue/improvement (см. V0526+), но
-- ключевые сущности — узел архитектуры, паспорт, диаграмма, дорожка, узел и
-- связь диаграммы — не были им защищены. Здесь ничего не удаляем и не меняем
-- в уже сохранённых данных, только добавляем недостающие технические колонки
-- для честного "кем и когда изменено" в конфликтном сообщении.

ALTER TABLE exec_process_diagram_lane ADD COLUMN IF NOT EXISTS updated_by VARCHAR(255);
ALTER TABLE exec_process_diagram_node ADD COLUMN IF NOT EXISTS updated_by VARCHAR(255);
ALTER TABLE exec_process_diagram_edge ADD COLUMN IF NOT EXISTS updated_by VARCHAR(255);

-- Для риска/контроля/показателя/проблемы уже есть блокировка по
-- expected_updated_at (итерация 3), но нет updated_by — конфликтное
-- сообщение не могло назвать автора конфликтующего изменения. Добавляем для
-- единообразия конфликтного UX по всем защищаемым сущностям.
ALTER TABLE exec_process_risk ADD COLUMN IF NOT EXISTS updated_by VARCHAR(255);
ALTER TABLE exec_process_control ADD COLUMN IF NOT EXISTS updated_by VARCHAR(255);
ALTER TABLE exec_process_metric ADD COLUMN IF NOT EXISTS updated_by VARCHAR(255);
ALTER TABLE exec_process_issue ADD COLUMN IF NOT EXISTS updated_by VARCHAR(255);

COMMENT ON COLUMN exec_process_diagram_lane.updated_by IS
    'Кто последним изменил дорожку — для конфликтного сообщения при optimistic locking (раздел 1 ТЗ итерации 4).';
COMMENT ON COLUMN exec_process_diagram_node.updated_by IS
    'Кто последним изменил элемент схемы — для конфликтного сообщения при optimistic locking.';
COMMENT ON COLUMN exec_process_diagram_edge.updated_by IS
    'Кто последним изменил связь схемы — для конфликтного сообщения при optimistic locking.';

-- ── Раздел 3: версии и неизменяемая публикация ──────────────────────────────
-- exec_process_version_history уже существовал (итерация 3, V0517) со
-- snapshot_json, но backend никогда его не заполнял — версии фиксировались
-- только числом, без самого снимка. Добавляем недостающие поля для полного
-- жизненного цикла публикации и находим её текущее использование в коде.
ALTER TABLE exec_process_version_history ADD COLUMN IF NOT EXISTS published_basis_note TEXT;
COMMENT ON COLUMN exec_process_version_history.published_basis_note IS
    'Основание публикации — заполняется при model_status=published, ручной комментарий уполномоченного пользователя.';

-- ── Раздел 3 (продолжение): жизненный цикл модели ───────────────────────────
-- Текущий CHECK на model_status уже содержит нужный набор статусов
-- (draft/in_review/confirmed/published/archived) без needs_revision.
-- Юра просил явный статус "Требует доработки" — добавляем его в оба CHECK.
ALTER TABLE exec_process_node DROP CONSTRAINT exec_process_node_model_status_check;
ALTER TABLE exec_process_node ADD CONSTRAINT exec_process_node_model_status_check
    CHECK (model_status IN ('draft', 'in_review', 'needs_revision', 'confirmed', 'published', 'archived'));

ALTER TABLE exec_process_diagram DROP CONSTRAINT exec_process_diagram_model_status_check;
ALTER TABLE exec_process_diagram ADD CONSTRAINT exec_process_diagram_model_status_check
    CHECK (model_status IN ('draft', 'in_review', 'needs_revision', 'confirmed', 'published', 'archived'));

-- ── Раздел 4: маршрут согласования ──────────────────────────────────────────
-- Лёгкий журнал решений по проверке (кто/когда/что решил), отдельно от
-- exec_audit_log (тот хранит все технические действия, этот — только
-- содержательные решения проверяющего для отображения в UI согласования).
CREATE TABLE IF NOT EXISTS exec_process_review_decision (
    id SERIAL PRIMARY KEY,
    entity_type VARCHAR(20) NOT NULL CHECK (entity_type IN ('process_node', 'diagram')),
    entity_id INTEGER NOT NULL,
    version INTEGER NOT NULL,
    decision VARCHAR(20) NOT NULL
        CHECK (decision IN ('submitted', 'taken_in_work', 'commented', 'needs_revision', 'confirmed', 'published')),
    actor VARCHAR(255) NOT NULL,
    reviewer_role VARCHAR(120),
    reviewer_org_unit_id INTEGER REFERENCES org_units(id),
    comment TEXT,
    found_issues TEXT,
    open_questions TEXT,
    reviewer_assigned BOOLEAN NOT NULL DEFAULT true,
    is_test_data BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_eprd_entity ON exec_process_review_decision(entity_type, entity_id);
COMMENT ON TABLE exec_process_review_decision IS
    'Маршрут согласования модели процесса/диаграммы: отправка на проверку, взятие в работу, замечание, возврат на доработку, подтверждение, публикация. reviewer_assigned=false — в справочнике нет подтверждённого проверяющего, роль/подразделение указаны текстом, "Адресат не назначен" показывается в UI.';
