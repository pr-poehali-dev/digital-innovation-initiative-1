-- W15.1 Competency Map event store — lightweight adoption tracking
-- Хранит ключевые события карты для построения воронки adoption.
-- Параллельно с Яндекс Метрикой — дублирует только важные события карты.

CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.competency_map_events (
    id          SERIAL      PRIMARY KEY,
    user_id     INTEGER     NOT NULL REFERENCES t_p61016064_digital_innovation_i.users(id),
    event       VARCHAR(64) NOT NULL,        -- competency_map_loaded, self_assessed, etc.
    map_status  VARCHAR(16),                  -- empty / partial / ready (состояние на момент события)
    props_json  JSONB       DEFAULT '{}',     -- дополнительные параметры (level, competency_id, etc.)
    created_at  TIMESTAMP   DEFAULT NOW()
);

CREATE INDEX idx_cme_user ON t_p61016064_digital_innovation_i.competency_map_events (user_id);
CREATE INDEX idx_cme_event ON t_p61016064_digital_innovation_i.competency_map_events (event);
CREATE INDEX idx_cme_created ON t_p61016064_digital_innovation_i.competency_map_events (created_at DESC);
