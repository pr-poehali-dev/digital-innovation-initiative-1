-- ЭТАП 3: конструктор презентации обоснования Центра.
-- Хранятся только редактируемые надстройки над слайдом и оценки эксперта.
-- Сами цифры (факт/расчёт) не дублируются — берутся из model()/dashboard().

CREATE TABLE t_p61016064_digital_innovation_i.exec_center_deck_slide (
    id serial PRIMARY KEY,
    center_id integer NOT NULL REFERENCES t_p61016064_digital_innovation_i.exec_center(id),
    slide_key varchar(40) NOT NULL,
    order_index integer NOT NULL DEFAULT 0,
    is_included boolean NOT NULL DEFAULT true,
    title_override text,
    thesis_text text,
    narrative_text text,
    speaker_notes text,
    created_at timestamp NOT NULL DEFAULT now(),
    updated_at timestamp NOT NULL DEFAULT now(),
    UNIQUE (center_id, slide_key)
);

COMMENT ON TABLE t_p61016064_digital_innovation_i.exec_center_deck_slide IS
    'Редактируемые надстройки слайдов презентации обоснования Центра: заголовок, тезис, текст, заметки докладчика, порядок и видимость. Цифры берутся из model()/dashboard(), не дублируются';
COMMENT ON COLUMN t_p61016064_digital_innovation_i.exec_center_deck_slide.thesis_text IS
    'Основной управленческий тезис слайда — формулирует докладчик';
COMMENT ON COLUMN t_p61016064_digital_innovation_i.exec_center_deck_slide.narrative_text IS
    'Текстовые выводы под данными — формулирует докладчик';

CREATE TABLE t_p61016064_digital_innovation_i.exec_center_expert_value (
    id serial PRIMARY KEY,
    center_id integer NOT NULL REFERENCES t_p61016064_digital_innovation_i.exec_center(id),
    metric_key varchar(80) NOT NULL,
    value_text text NOT NULL,
    unit varchar(40),
    comment text,
    created_by varchar(255),
    created_at timestamp NOT NULL DEFAULT now(),
    updated_at timestamp NOT NULL DEFAULT now(),
    UNIQUE (center_id, metric_key)
);

COMMENT ON TABLE t_p61016064_digital_innovation_i.exec_center_expert_value IS
    'Экспертные оценки для показателей, которые нельзя посчитать из фактических данных. Всегда маркируются в интерфейсе как «экспертная оценка», не как факт';