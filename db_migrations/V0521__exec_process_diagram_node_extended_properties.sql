-- Итерация 2: расширяем узлы схемы и дорожки под требуемые свойства
-- редактора процессов (боковая панель операции, временная подпись дорожки
-- без фиктивной записи в справочнике, версии/подтверждение элементов).

ALTER TABLE exec_process_diagram_node
    ADD COLUMN IF NOT EXISTS description TEXT,
    ADD COLUMN IF NOT EXISTS input_note TEXT,
    ADD COLUMN IF NOT EXISTS output_note TEXT,
    ADD COLUMN IF NOT EXISTS duration_note VARCHAR(128),
    ADD COLUMN IF NOT EXISTS is_critical BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS confirmation_status VARCHAR(20) NOT NULL DEFAULT 'user_draft',
    ADD COLUMN IF NOT EXISTS gateway_outcomes TEXT,
    ADD COLUMN IF NOT EXISTS ref_org_unit_id INTEGER REFERENCES org_units(id),
    ADD COLUMN IF NOT EXISTS system_note VARCHAR(255),
    ADD COLUMN IF NOT EXISTS document_note VARCHAR(255);

ALTER TABLE exec_process_diagram_node
    ADD CONSTRAINT chk_epdn_confirmation CHECK (confirmation_status IN ('user_draft', 'confirmed'));

COMMENT ON COLUMN exec_process_diagram_node.description IS 'Описание операции — для панели свойств.';
COMMENT ON COLUMN exec_process_diagram_node.input_note IS 'Вход операции текстом (пока не структурировано отдельной таблицей потоков данных).';
COMMENT ON COLUMN exec_process_diagram_node.output_note IS 'Результат операции текстом.';
COMMENT ON COLUMN exec_process_diagram_node.duration_note IS 'Длительность при наличии данных, например "2 рабочих дня". Не число — чтобы не придумывать единицы измерения за пользователя.';
COMMENT ON COLUMN exec_process_diagram_node.is_critical IS 'Признак критичности операции (ручная отметка пользователя).';
COMMENT ON COLUMN exec_process_diagram_node.confirmation_status IS 'user_draft/confirmed — статус подтверждения конкретного элемента схемы, отдельно от статуса всей диаграммы.';
COMMENT ON COLUMN exec_process_diagram_node.gateway_outcomes IS 'Для узлов типа gateway — текстовое перечисление вариантов выхода (да/нет и т.п.), пока не структурировано отдельной сущностью.';
COMMENT ON COLUMN exec_process_diagram_node.ref_org_unit_id IS 'Подразделение-исполнитель операции (может отличаться от дорожки, если дорожка по роли).';
COMMENT ON COLUMN exec_process_diagram_node.system_note IS 'Название информационной системы текстом, если она ещё не заведена как отдельный справочный объект exec_info_system.';
COMMENT ON COLUMN exec_process_diagram_node.document_note IS 'Название документа текстом, если он ещё не заведён как exec_source_document.';

-- Дорожка может быть временной текстовой подписью "Требует уточнения" —
-- без создания фиктивной записи в org_units или exec_person.
ALTER TABLE exec_process_diagram_lane
    ADD COLUMN IF NOT EXISTS lane_type VARCHAR(20) NOT NULL DEFAULT 'org_unit',
    ADD COLUMN IF NOT EXISTS placeholder_label VARCHAR(255),
    ADD COLUMN IF NOT EXISTS needs_clarification BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE exec_process_diagram_lane
    ADD CONSTRAINT chk_epdl_lane_type CHECK (lane_type IN ('org_unit', 'role', 'placeholder'));

COMMENT ON COLUMN exec_process_diagram_lane.lane_type IS 'org_unit — привязана к org_units, role — свободный текст роли (role_title), placeholder — временная подпись "Требует уточнения" без ссылки на справочник.';
COMMENT ON COLUMN exec_process_diagram_lane.placeholder_label IS 'Текст временной подписи дорожки, когда lane_type=placeholder.';
COMMENT ON COLUMN exec_process_diagram_lane.needs_clarification IS 'true — дорожка помечена как требующая уточнения ответственного (участник ещё не подтверждён).';

-- Черновик перед сохранением — recovery-снимок несохранённых изменений
-- для функции "отменить несохранённые изменения" при повторном открытии.
CREATE TABLE exec_process_diagram_draft_snapshot (
    id SERIAL PRIMARY KEY,
    diagram_id INTEGER NOT NULL REFERENCES exec_process_diagram(id),
    actor VARCHAR(255) NOT NULL,
    snapshot_json JSONB NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX idx_epdds_diagram ON exec_process_diagram_draft_snapshot(diagram_id);
COMMENT ON TABLE exec_process_diagram_draft_snapshot IS 'Автосохранение состояния холста для восстановления после случайного закрытия — не версия схемы, просто recovery-буфер, последняя запись на diagram_id актуальна.';
