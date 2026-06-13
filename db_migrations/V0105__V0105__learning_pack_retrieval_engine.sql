-- V0105: Learning Pack — retrieval-first learning engine
-- ADR-001: material = first-class entity, AI = post-processing layer

-- Реестр доверенных источников (whitelist доменов)
CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.content_sources (
    id          SERIAL PRIMARY KEY,
    domain      TEXT NOT NULL UNIQUE,
    name        TEXT NOT NULL,
    trust_level TEXT NOT NULL DEFAULT 'C',
    -- A = official (gov, regulators, standards)
    -- B = professional (universities, major platforms, industry media)
    -- C = additional (articles, blogs, open materials)
    source_type TEXT NOT NULL DEFAULT 'article',
    -- official | course_platform | university | media | docs | blog | video
    language    TEXT NOT NULL DEFAULT 'ru',
    is_active   BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Центральный каталог материалов (переиспользуется между пользователями)
CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.materials (
    id               SERIAL PRIMARY KEY,
    url              TEXT NOT NULL UNIQUE,
    domain           TEXT NOT NULL,
    title            TEXT NOT NULL,
    description      TEXT,
    source_type      TEXT NOT NULL DEFAULT 'article',
    trust_level      TEXT NOT NULL DEFAULT 'C',
    language         TEXT NOT NULL DEFAULT 'ru',
    format           TEXT NOT NULL DEFAULT 'article',
    -- article | book | course | video | doc | report | lecture
    estimated_minutes INTEGER,
    authors          TEXT,
    publisher        TEXT,
    tags             TEXT[],
    is_active        BOOLEAN NOT NULL DEFAULT true,
    retrieved_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Кешированные AI-выжимки по материалу (shared, не user-specific)
CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.material_summaries (
    id           SERIAL PRIMARY KEY,
    material_id  INTEGER NOT NULL,
    summary_type TEXT NOT NULL DEFAULT 'brief',
    -- brief | key_points | eli5
    content      TEXT NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Связь материалов с milestone (user-specific)
CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.milestone_materials (
    id              SERIAL PRIMARY KEY,
    milestone_id    INTEGER NOT NULL,
    goal_id         INTEGER NOT NULL,
    user_id         INTEGER NOT NULL,
    material_id     INTEGER NOT NULL,
    relevance_score NUMERIC(3,2) DEFAULT 0.8,
    selection_reason TEXT,
    -- почему AI выбрал этот материал для этого milestone
    sort_order      INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Прогресс пользователя по материалу
CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.user_material_progress (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL,
    material_id INTEGER NOT NULL,
    milestone_id INTEGER,
    status      TEXT NOT NULL DEFAULT 'new',
    -- new | opened | in_progress | done | saved
    opened_at   TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    notes       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, material_id, milestone_id)
);

-- Асинхронные jobs для подбора learning pack
CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.learning_jobs (
    id           SERIAL PRIMARY KEY,
    user_id      INTEGER NOT NULL,
    milestone_id INTEGER NOT NULL,
    goal_id      INTEGER NOT NULL,
    status       TEXT NOT NULL DEFAULT 'pending',
    -- pending | running | ready | failed
    error_text   TEXT,
    materials_found INTEGER DEFAULT 0,
    started_at   TIMESTAMPTZ,
    finished_at  TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_materials_domain ON t_p61016064_digital_innovation_i.materials(domain);
CREATE INDEX IF NOT EXISTS idx_milestone_materials_milestone ON t_p61016064_digital_innovation_i.milestone_materials(milestone_id);
CREATE INDEX IF NOT EXISTS idx_milestone_materials_user ON t_p61016064_digital_innovation_i.milestone_materials(user_id);
CREATE INDEX IF NOT EXISTS idx_user_material_progress_user ON t_p61016064_digital_innovation_i.user_material_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_learning_jobs_user ON t_p61016064_digital_innovation_i.learning_jobs(user_id, milestone_id);
CREATE INDEX IF NOT EXISTS idx_material_summaries_material ON t_p61016064_digital_innovation_i.material_summaries(material_id);

-- Seed: проверенные источники (whitelist)
INSERT INTO t_p61016064_digital_innovation_i.content_sources (domain, name, trust_level, source_type, language) VALUES
('consultant.ru', 'КонсультантПлюс', 'A', 'official', 'ru'),
('garant.ru', 'Гарант', 'A', 'official', 'ru'),
('cbr.ru', 'Банк России', 'A', 'official', 'ru'),
('minfin.gov.ru', 'Министерство финансов', 'A', 'official', 'ru'),
('digital.gov.ru', 'Минцифры России', 'A', 'official', 'ru'),
('kremlin.ru', 'Официальный сайт Президента', 'A', 'official', 'ru'),
('government.ru', 'Правительство России', 'A', 'official', 'ru'),
('rosstandart.ru', 'Росстандарт', 'A', 'official', 'ru'),
('hse.ru', 'Высшая школа экономики', 'B', 'university', 'ru'),
('ranepa.ru', 'РАНХиГС', 'B', 'university', 'ru'),
('msu.ru', 'МГУ им. Ломоносова', 'B', 'university', 'ru'),
('spbu.ru', 'СПбГУ', 'B', 'university', 'ru'),
('coursera.org', 'Coursera', 'B', 'course_platform', 'en'),
('stepik.org', 'Stepik', 'B', 'course_platform', 'ru'),
('openedu.ru', 'Открытое образование', 'B', 'course_platform', 'ru'),
('edx.org', 'edX', 'B', 'course_platform', 'en'),
('habr.com', 'Хабр', 'B', 'media', 'ru'),
('vc.ru', 'VC.ru', 'B', 'media', 'ru'),
('forbes.ru', 'Forbes Россия', 'B', 'media', 'ru'),
('rbc.ru', 'РБК', 'B', 'media', 'ru'),
('kommersant.ru', 'Коммерсантъ', 'B', 'media', 'ru'),
('tadviser.ru', 'TAdviser', 'B', 'media', 'ru'),
('microsoft.com', 'Microsoft', 'B', 'docs', 'en'),
('docs.python.org', 'Python Docs', 'B', 'docs', 'en'),
('wikipedia.org', 'Википедия', 'C', 'article', 'ru'),
('medium.com', 'Medium', 'C', 'article', 'en'),
('youtube.com', 'YouTube', 'C', 'video', 'ru')
ON CONFLICT (domain) DO NOTHING;
