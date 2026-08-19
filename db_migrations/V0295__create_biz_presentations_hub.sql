CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.biz_presentations (
    id SERIAL PRIMARY KEY,
    slug VARCHAR(120) UNIQUE NOT NULL,
    title VARCHAR(300) NOT NULL,
    subtitle VARCHAR(500),
    cover_icon VARCHAR(40) DEFAULT 'Presentation',
    cover_color VARCHAR(20) DEFAULT 'violet',
    is_published BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by VARCHAR(200),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by VARCHAR(200)
);

CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.biz_slides (
    id SERIAL PRIMARY KEY,
    presentation_id INTEGER NOT NULL REFERENCES t_p61016064_digital_innovation_i.biz_presentations(id),
    order_index INTEGER NOT NULL DEFAULT 0,
    layout VARCHAR(30) NOT NULL DEFAULT 'content',
    title VARCHAR(400),
    subtitle VARCHAR(500),
    blocks_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_biz_slides_presentation ON t_p61016064_digital_innovation_i.biz_slides(presentation_id, order_index);
