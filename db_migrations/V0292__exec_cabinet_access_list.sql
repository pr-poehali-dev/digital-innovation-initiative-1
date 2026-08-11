CREATE TABLE IF NOT EXISTS exec_cabinet_access (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    access_role VARCHAR(32) NOT NULL DEFAULT 'viewer',
    person_id INTEGER REFERENCES exec_person(id),
    is_active BOOLEAN DEFAULT true,
    can_confirm BOOLEAN DEFAULT false,
    note TEXT,
    granted_by VARCHAR(255),
    created_at TIMESTAMP DEFAULT now(),
    CONSTRAINT exec_access_role_chk CHECK (
        access_role IN ('head','curator','contributor','viewer')
    )
);

CREATE INDEX IF NOT EXISTS idx_exec_access_email ON exec_cabinet_access(LOWER(email));

INSERT INTO exec_cabinet_access (email, access_role, is_active, can_confirm, note, granted_by)
VALUES ('kuzmenkoav1982@yandex.ru', 'head', true, true,
        'Руководитель Группы сопровождения и продвижения инициатив', 'system')
ON CONFLICT (email) DO UPDATE
SET access_role = 'head', is_active = true, can_confirm = true;
