-- Лёгкая заметка-уточнение помощника контура «Процессное управление».
-- Это НЕ второй реестр вопросов портфеля (exec_initiative_decision_request,
-- где initiative_id обязателен) — тот реестр не трогаем и не дублируем.
-- Здесь фиксируются пометки "требует уточнения" на любой сущности модели
-- процессов (функция, процесс, паспорт, риск, показатель и т.д.), когда
-- обязательных данных ещё нет и помощник не должен их выдумывать.
-- При желании пользователь может отдельно и вручную завести полноценный
-- вопрос в существующем реестре решений, если он привязан к инициативе.
CREATE TABLE exec_process_clarification_note (
    id SERIAL PRIMARY KEY,
    scope_id INTEGER REFERENCES exec_process_model_scope(id),
    entity_type VARCHAR(40) NOT NULL,
    entity_id INTEGER,
    question TEXT NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
    resolution_note TEXT,
    created_by VARCHAR(255),
    resolved_by VARCHAR(255),
    resolved_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX idx_epcn_scope ON exec_process_clarification_note(scope_id);
CREATE INDEX idx_epcn_entity ON exec_process_clarification_note(entity_type, entity_id);