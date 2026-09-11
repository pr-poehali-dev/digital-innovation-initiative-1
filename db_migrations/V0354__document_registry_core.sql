-- Резервная копия exec_knowledge перед любыми операциями
CREATE TABLE IF NOT EXISTS exec_knowledge_backup_v0354 AS
SELECT *, now() AS backup_created_at FROM exec_knowledge;

-- ============ ИСТОЧНИК ============
CREATE TABLE IF NOT EXISTS doc_source (
    id SERIAL PRIMARY KEY,
    title VARCHAR(500) NOT NULL,
    display_title VARCHAR(500) NULL,
    issuer VARCHAR(300) NULL,
    source_kind VARCHAR(48) NOT NULL DEFAULT 'unknown',
    source_status VARCHAR(32) NOT NULL DEFAULT 'not_established',
    intake_channel VARCHAR(48) NULL,
    created_by VARCHAR(255) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now()
);
COMMENT ON COLUMN doc_source.source_status IS 'not_established|draft|approved|in_force|repealed';
COMMENT ON COLUMN doc_source.display_title IS 'Нейтральный заголовок для показа; оригинал сохраняется в title';

-- ============ РЕДАКЦИЯ ============
CREATE TABLE IF NOT EXISTS doc_revision (
    id SERIAL PRIMARY KEY,
    source_id INTEGER NOT NULL REFERENCES doc_source(id),
    revision_label VARCHAR(120) NULL,
    revision_date DATE NULL,
    is_current BOOLEAN NOT NULL DEFAULT false,
    origin_kind VARCHAR(32) NOT NULL DEFAULT 'unknown',
    extraction_method VARCHAR(48) NULL,
    processing_state VARCHAR(32) NOT NULL DEFAULT 'registered',
    verification_state VARCHAR(32) NOT NULL DEFAULT 'unverified',
    applicability VARCHAR(32) NOT NULL DEFAULT 'unknown',
    created_by VARCHAR(255) NULL,
    verified_by VARCHAR(255) NULL,
    verified_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now()
);
COMMENT ON COLUMN doc_revision.origin_kind IS 'human|ocr|ai_summary|legacy|import - neizmenyaemo';
COMMENT ON COLUMN doc_revision.processing_state IS 'registered|text_extracted|chunked|failed';
COMMENT ON COLUMN doc_revision.verification_state IS 'unverified|checked_against_original|confirmed';
COMMENT ON COLUMN doc_revision.applicability IS 'unknown|applicable|reference_only|obsolete';

-- ============ ФАЙЛ-ОРИГИНАЛ ============
CREATE TABLE IF NOT EXISTS doc_file (
    id SERIAL PRIMARY KEY,
    revision_id INTEGER NOT NULL REFERENCES doc_revision(id),
    original_name VARCHAR(500) NOT NULL,
    mime_type VARCHAR(128) NULL,
    size_bytes BIGINT NULL,
    content_sha256 VARCHAR(64) NULL,
    s3_key VARCHAR(512) NULL,
    file_presence VARCHAR(32) NOT NULL DEFAULT 'unknown',
    created_at TIMESTAMP NOT NULL DEFAULT now()
);
COMMENT ON COLUMN doc_file.file_presence IS 'present|absent|name_only_no_binary|unknown';

-- ============ СТРАНИЦА ============
CREATE TABLE IF NOT EXISTS doc_page (
    id SERIAL PRIMARY KEY,
    revision_id INTEGER NOT NULL REFERENCES doc_revision(id),
    page_number INTEGER NULL,
    page_label VARCHAR(64) NULL,
    page_text TEXT NULL,
    text_layer VARCHAR(32) NOT NULL DEFAULT 'unknown',
    created_at TIMESTAMP NOT NULL DEFAULT now()
);
COMMENT ON COLUMN doc_page.page_number IS 'NULL = stranica ne ustanovlena; fiktivnuyu 1 ne sozdavat';
COMMENT ON COLUMN doc_page.text_layer IS 'native|ocr|manual|unknown';

-- ============ СТРУКТУРНЫЙ ПУНКТ ============
CREATE TABLE IF NOT EXISTS doc_clause (
    id SERIAL PRIMARY KEY,
    revision_id INTEGER NOT NULL REFERENCES doc_revision(id),
    page_id INTEGER NULL REFERENCES doc_page(id),
    clause_path VARCHAR(120) NULL,
    clause_title VARCHAR(500) NULL,
    clause_text TEXT NULL,
    char_start INTEGER NULL,
    char_end INTEGER NULL,
    created_at TIMESTAMP NOT NULL DEFAULT now()
);

-- ============ ЧАНК ============
CREATE TABLE IF NOT EXISTS doc_chunk (
    id SERIAL PRIMARY KEY,
    revision_id INTEGER NOT NULL REFERENCES doc_revision(id),
    page_id INTEGER NULL REFERENCES doc_page(id),
    clause_id INTEGER NULL REFERENCES doc_clause(id),
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    content_length INTEGER NOT NULL DEFAULT 0,
    char_start INTEGER NULL,
    char_end INTEGER NULL,
    created_at TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_doc_chunk_revision ON doc_chunk(revision_id);

-- ============ ЗАПИСЬ ЗНАНИЯ ============
CREATE TABLE IF NOT EXISTS knowledge_entry (
    id SERIAL PRIMARY KEY,
    title VARCHAR(500) NOT NULL,
    display_title VARCHAR(500) NULL,
    entry_type VARCHAR(48) NOT NULL,
    body TEXT NULL,
    source_id INTEGER NULL REFERENCES doc_source(id),
    revision_id INTEGER NULL REFERENCES doc_revision(id),
    origin_kind VARCHAR(32) NOT NULL DEFAULT 'human',
    verification_state VARCHAR(32) NOT NULL DEFAULT 'unverified',
    applicability VARCHAR(32) NOT NULL DEFAULT 'unknown',
    ai_usage_policy VARCHAR(32) NOT NULL DEFAULT 'not_allowed',
    created_by VARCHAR(255) NULL,
    verified_by VARCHAR(255) NULL,
    verified_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now()
);
COMMENT ON COLUMN knowledge_entry.entry_type IS 'note|work_artifact|ai_summary|legacy_ocr|legacy_record|canonical_candidate';
COMMENT ON COLUMN knowledge_entry.ai_usage_policy IS 'not_allowed|allowed_after_review|allowed';

-- ============ СООТВЕТСТВИЕ LEGACY ============
CREATE TABLE IF NOT EXISTS legacy_knowledge_map (
    id SERIAL PRIMARY KEY,
    legacy_id INTEGER NOT NULL UNIQUE,
    target_kind VARCHAR(32) NOT NULL,
    target_source_id INTEGER NULL REFERENCES doc_source(id),
    target_revision_id INTEGER NULL REFERENCES doc_revision(id),
    target_entry_id INTEGER NULL REFERENCES knowledge_entry(id),
    migration_note TEXT NULL,
    migrated_at TIMESTAMP NOT NULL DEFAULT now()
);
COMMENT ON TABLE legacy_knowledge_map IS 'Idempotent: legacy_id UNIQUE predotvrashaet dubli';
