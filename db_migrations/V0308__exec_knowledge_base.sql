-- База знаний руководителя: регламенты, матрицы, правила для AI-контекста

CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.exec_knowledge (
    id SERIAL PRIMARY KEY,
    title VARCHAR(500) NOT NULL,
    doc_type VARCHAR(48) NOT NULL DEFAULT 'rule',
    summary TEXT,
    body TEXT,
    filename VARCHAR(255),
    file_type VARCHAR(16),
    file_size INTEGER,
    s3_key VARCHAR(512),
    page_count INTEGER,
    extracted_length INTEGER,
    use_in_ai BOOLEAN NOT NULL DEFAULT true,
    priority INTEGER NOT NULL DEFAULT 50,
    status VARCHAR(32) NOT NULL DEFAULT 'active',
    created_by VARCHAR(255),
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.exec_knowledge_chunk (
    id SERIAL PRIMARY KEY,
    knowledge_id INTEGER NOT NULL,
    chunk_index INTEGER NOT NULL,
    page_number INTEGER,
    content TEXT NOT NULL,
    content_length INTEGER,
    created_at TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_exec_knowledge_status
    ON t_p61016064_digital_innovation_i.exec_knowledge(status);
CREATE INDEX IF NOT EXISTS idx_exec_knowledge_ai
    ON t_p61016064_digital_innovation_i.exec_knowledge(use_in_ai, priority);
CREATE INDEX IF NOT EXISTS idx_exec_knowledge_chunk_doc
    ON t_p61016064_digital_innovation_i.exec_knowledge_chunk(knowledge_id);
