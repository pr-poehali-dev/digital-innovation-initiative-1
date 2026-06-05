-- W1 закрыта честно: все 6/6 задач done → статус волны = done
UPDATE t_p61016064_digital_innovation_i.project_waves
SET status = 'done', updated_at = NOW(), updated_by = 'system'
WHERE wave_num = 1;

-- ── Passport: 7 таблиц ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.passport_modules (
    id                   SERIAL PRIMARY KEY,
    name                 VARCHAR(256) NOT NULL,
    slug                 VARCHAR(64)  NOT NULL UNIQUE,
    category             VARCHAR(32)  NOT NULL DEFAULT 'platform',
    layer                VARCHAR(32)  NOT NULL DEFAULT 'admin',
    description          TEXT         NOT NULL DEFAULT '',
    status               VARCHAR(32)  NOT NULL DEFAULT 'active',
    owner_email          VARCHAR(256) NOT NULL DEFAULT '',
    backup_owner_email   VARCHAR(256) NOT NULL DEFAULT '',
    primary_route        VARCHAR(256) NOT NULL DEFAULT '',
    source_of_truth      TEXT         NOT NULL DEFAULT '',
    notes                TEXT         NOT NULL DEFAULT '',
    created_at           TIMESTAMP    NOT NULL DEFAULT NOW(),
    created_by           VARCHAR(128) NOT NULL DEFAULT '',
    updated_at           TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_by           VARCHAR(128) NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.passport_routes (
    id          SERIAL PRIMARY KEY,
    module_id   INTEGER      NOT NULL REFERENCES t_p61016064_digital_innovation_i.passport_modules(id),
    title       VARCHAR(256) NOT NULL,
    route       VARCHAR(256) NOT NULL,
    route_type  VARCHAR(32)  NOT NULL DEFAULT 'page',
    description TEXT         NOT NULL DEFAULT '',
    status      VARCHAR(32)  NOT NULL DEFAULT 'active',
    owner_email VARCHAR(256) NOT NULL DEFAULT '',
    created_at  TIMESTAMP    NOT NULL DEFAULT NOW(),
    created_by  VARCHAR(128) NOT NULL DEFAULT '',
    updated_at  TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_by  VARCHAR(128) NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.passport_entities (
    id                       SERIAL PRIMARY KEY,
    name                     VARCHAR(256) NOT NULL,
    kind                     VARCHAR(32)  NOT NULL DEFAULT 'business',
    description              TEXT         NOT NULL DEFAULT '',
    module_id                INTEGER      REFERENCES t_p61016064_digital_innovation_i.passport_modules(id),
    source_of_truth_module_id INTEGER     REFERENCES t_p61016064_digital_innovation_i.passport_modules(id),
    source_of_truth_details  TEXT         NOT NULL DEFAULT '',
    owner_email              VARCHAR(256) NOT NULL DEFAULT '',
    data_class               VARCHAR(32)  NOT NULL DEFAULT 'internal',
    status                   VARCHAR(32)  NOT NULL DEFAULT 'active',
    notes                    TEXT         NOT NULL DEFAULT '',
    created_at               TIMESTAMP    NOT NULL DEFAULT NOW(),
    created_by               VARCHAR(128) NOT NULL DEFAULT '',
    updated_at               TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_by               VARCHAR(128) NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.passport_dependencies (
    id              SERIAL PRIMARY KEY,
    from_module_id  INTEGER      NOT NULL REFERENCES t_p61016064_digital_innovation_i.passport_modules(id),
    to_module_id    INTEGER      NOT NULL REFERENCES t_p61016064_digital_innovation_i.passport_modules(id),
    dep_type        VARCHAR(32)  NOT NULL DEFAULT 'reads',
    criticality     VARCHAR(16)  NOT NULL DEFAULT 'medium',
    notes           TEXT         NOT NULL DEFAULT '',
    created_at      TIMESTAMP    NOT NULL DEFAULT NOW(),
    created_by      VARCHAR(128) NOT NULL DEFAULT '',
    updated_at      TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_by      VARCHAR(128) NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.passport_overlaps (
    id                SERIAL PRIMARY KEY,
    overlap_type      VARCHAR(32)  NOT NULL DEFAULT 'unclear_boundary',
    status            VARCHAR(32)  NOT NULL DEFAULT 'open',
    title             VARCHAR(512) NOT NULL,
    description       TEXT         NOT NULL DEFAULT '',
    related_module_id INTEGER      REFERENCES t_p61016064_digital_innovation_i.passport_modules(id),
    resolution        TEXT         NOT NULL DEFAULT '',
    created_at        TIMESTAMP    NOT NULL DEFAULT NOW(),
    created_by        VARCHAR(128) NOT NULL DEFAULT '',
    updated_at        TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_by        VARCHAR(128) NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.passport_notes (
    id         INTEGER PRIMARY KEY DEFAULT 1,
    content    TEXT     NOT NULL DEFAULT '',
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_by VARCHAR(128) NOT NULL DEFAULT ''
);

INSERT INTO t_p61016064_digital_innovation_i.passport_notes (id, content) VALUES (1, '')
ON CONFLICT (id) DO NOTHING;
