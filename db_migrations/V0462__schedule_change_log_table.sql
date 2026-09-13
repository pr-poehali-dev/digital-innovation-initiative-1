-- ============================================================
-- СПЕЦИАЛИЗИРОВАННЫЙ ЖУРНАЛ ИЗМЕНЕНИЙ РАСПИСАНИЯ
-- Отдельная история (не общий exec_audit_log) специально для изменений
-- дат план/прогноз/факт по проекту/этапу/задаче/вехе — с полями,
-- специфичными для планирования: величина сдвига, изменение критичности,
-- влияние на конечную дату проекта, затронутые зависимости. Секреты и
-- полные чувствительные комментарии сюда не пишутся — только сжатая
-- причина (reason), подробное обоснование хранится в связанном решении/
-- документе через существующие id, а не текстом здесь.
-- ============================================================

CREATE TABLE IF NOT EXISTS exec_schedule_change_log (
    id SERIAL PRIMARY KEY,
    object_kind VARCHAR(32) NOT NULL,
    object_id INTEGER NOT NULL,
    project_id INTEGER REFERENCES exec_project(id),
    layer VARCHAR(16) NOT NULL,
    field_name VARCHAR(32) NOT NULL,
    old_value DATE,
    new_value DATE,
    shift_days INTEGER,
    reason VARCHAR(500),
    related_decision_id INTEGER,
    related_document_id INTEGER,
    affected_dependency_count INTEGER NOT NULL DEFAULT 0,
    criticality_changed BOOLEAN NOT NULL DEFAULT false,
    project_end_shift_days INTEGER,
    actor VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    CONSTRAINT chk_sched_log_object_kind CHECK (object_kind IN ('project','stage','task','milestone')),
    CONSTRAINT chk_sched_log_layer CHECK (layer IN ('plan','forecast','fact'))
);

CREATE INDEX IF NOT EXISTS idx_sched_change_log_object ON exec_schedule_change_log(object_kind, object_id);
CREATE INDEX IF NOT EXISTS idx_sched_change_log_project ON exec_schedule_change_log(project_id, created_at DESC);

COMMENT ON TABLE exec_schedule_change_log IS
    'Специализированная история изменений дат расписания (план/прогноз/факт), отдельная от общего exec_audit_log — хранит специфичные для планирования поля: сдвиг в днях, изменение критичности, влияние на срок проекта, связанные решения/документы по ссылке (не текстом).';
