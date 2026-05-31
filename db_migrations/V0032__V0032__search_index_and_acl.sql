CREATE TABLE IF NOT EXISTS search_index (
    id SERIAL PRIMARY KEY,
    entity_type VARCHAR(64) NOT NULL,
    entity_id INTEGER NOT NULL,
    project_id INTEGER NULL,
    title TEXT NOT NULL,
    content_text TEXT NULL,
    search_vector TSVECTOR,
    meta JSONB NOT NULL DEFAULT '{}',
    updated_at TIMESTAMP NOT NULL DEFAULT now(),
    CONSTRAINT uq_search_index_entity UNIQUE (entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_search_index_vector ON search_index USING GIN(search_vector);
CREATE INDEX IF NOT EXISTS idx_search_index_project_id ON search_index(project_id);
CREATE INDEX IF NOT EXISTS idx_search_index_title ON search_index(title);

CREATE TABLE IF NOT EXISTS search_acl (
    id SERIAL PRIMARY KEY,
    entity_type VARCHAR(64) NOT NULL,
    entity_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    CONSTRAINT uq_search_acl_entry UNIQUE (entity_type, entity_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_search_acl_user_id ON search_acl(user_id);
CREATE INDEX IF NOT EXISTS idx_search_acl_entity ON search_acl(entity_type, entity_id);
