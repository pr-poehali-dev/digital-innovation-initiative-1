
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE sessions (
    id VARCHAR(64) PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP NOT NULL
);

CREATE TABLE projects (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    owner_id INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE project_members (
    id SERIAL PRIMARY KEY,
    project_id INTEGER REFERENCES projects(id),
    user_id INTEGER REFERENCES users(id),
    role VARCHAR(32) DEFAULT 'member',
    joined_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(project_id, user_id)
);

CREATE TABLE documents (
    id SERIAL PRIMARY KEY,
    project_id INTEGER REFERENCES projects(id),
    uploaded_by INTEGER REFERENCES users(id),
    filename VARCHAR(255) NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    file_type VARCHAR(16) NOT NULL,
    file_size INTEGER,
    s3_key VARCHAR(512),
    extracted_text TEXT,
    structure_json TEXT,
    status VARCHAR(32) DEFAULT 'processing',
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE tasks (
    id SERIAL PRIMARY KEY,
    project_id INTEGER REFERENCES projects(id),
    created_by INTEGER REFERENCES users(id),
    title VARCHAR(255) NOT NULL,
    task_type VARCHAR(64) NOT NULL,
    topic TEXT,
    goal TEXT,
    audience TEXT,
    language VARCHAR(32) DEFAULT 'ru',
    style VARCHAR(64),
    requested_slide_count INTEGER,
    additional_instructions TEXT,
    status VARCHAR(32) DEFAULT 'draft',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE task_documents (
    id SERIAL PRIMARY KEY,
    task_id INTEGER REFERENCES tasks(id),
    document_id INTEGER REFERENCES documents(id),
    role VARCHAR(64) NOT NULL,
    UNIQUE(task_id, document_id)
);

CREATE TABLE generation_runs (
    id SERIAL PRIMARY KEY,
    task_id INTEGER REFERENCES tasks(id),
    created_by INTEGER REFERENCES users(id),
    version_number INTEGER NOT NULL DEFAULT 1,
    input_prompt TEXT,
    system_constraints TEXT,
    result_json TEXT,
    output_summary TEXT,
    status VARCHAR(32) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE revisions (
    id SERIAL PRIMARY KEY,
    generation_run_id INTEGER REFERENCES generation_runs(id),
    user_id INTEGER REFERENCES users(id),
    instruction_text TEXT NOT NULL,
    scope VARCHAR(64),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE activity_log (
    id SERIAL PRIMARY KEY,
    project_id INTEGER REFERENCES projects(id),
    user_id INTEGER REFERENCES users(id),
    action VARCHAR(128) NOT NULL,
    entity_type VARCHAR(64),
    entity_id INTEGER,
    details TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);
