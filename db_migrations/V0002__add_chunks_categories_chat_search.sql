
-- Категории документов (этап 1)
ALTER TABLE documents ADD COLUMN category VARCHAR(32) DEFAULT 'other';
ALTER TABLE documents ADD COLUMN page_count INTEGER;
ALTER TABLE documents ADD COLUMN extracted_length INTEGER;

-- Чанки документов для большого текста и векторного поиска (этап 1+2)
CREATE TABLE document_chunks (
    id SERIAL PRIMARY KEY,
    document_id INTEGER REFERENCES documents(id),
    chunk_index INTEGER NOT NULL,
    page_number INTEGER,
    content TEXT NOT NULL,
    content_length INTEGER,
    embedding TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_chunks_doc ON document_chunks(document_id);

-- Веб-поиск результаты (этап 1)
CREATE TABLE web_search_results (
    id SERIAL PRIMARY KEY,
    task_id INTEGER REFERENCES tasks(id),
    generation_run_id INTEGER REFERENCES generation_runs(id),
    query TEXT NOT NULL,
    results_json TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Чат с документом (этап 2)
CREATE TABLE document_chats (
    id SERIAL PRIMARY KEY,
    document_id INTEGER REFERENCES documents(id),
    user_id INTEGER REFERENCES users(id),
    question TEXT NOT NULL,
    answer TEXT,
    sources_json TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_chats_doc ON document_chats(document_id);

-- Глобальный поиск история (этап 2)
CREATE TABLE knowledge_searches (
    id SERIAL PRIMARY KEY,
    project_id INTEGER REFERENCES projects(id),
    user_id INTEGER REFERENCES users(id),
    query TEXT NOT NULL,
    results_count INTEGER,
    created_at TIMESTAMP DEFAULT NOW()
);
