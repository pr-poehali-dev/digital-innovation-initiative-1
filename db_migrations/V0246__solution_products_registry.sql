CREATE TABLE IF NOT EXISTS solution_vendors (
    id          SERIAL PRIMARY KEY,
    slug        TEXT NOT NULL UNIQUE,
    name        TEXT NOT NULL,
    summary     TEXT,
    website_url TEXT,
    status      TEXT NOT NULL DEFAULT 'active',  -- draft|active|archived
    sort_order  INTEGER NOT NULL DEFAULT 0,
    source_note TEXT,
    source_url  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS solution_products (
    id               SERIAL PRIMARY KEY,
    vendor_id        INTEGER NOT NULL REFERENCES solution_vendors(id),
    slug             TEXT NOT NULL UNIQUE,
    name             TEXT NOT NULL,
    category         TEXT NOT NULL DEFAULT '',
    summary          TEXT,
    deployment_types TEXT[] NOT NULL DEFAULT '{}',  -- cloud|on_prem|hybrid
    website_url      TEXT,
    status           TEXT NOT NULL DEFAULT 'active',
    sort_order       INTEGER NOT NULL DEFAULT 0,
    source_note      TEXT,
    source_url       TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS solution_product_modules (
    id          SERIAL PRIMARY KEY,
    product_id  INTEGER NOT NULL REFERENCES solution_products(id),
    slug        TEXT NOT NULL UNIQUE,
    name        TEXT NOT NULL,
    category    TEXT NOT NULL DEFAULT '',
    summary     TEXT,
    status      TEXT NOT NULL DEFAULT 'active',
    sort_order  INTEGER NOT NULL DEFAULT 0,
    source_note TEXT,
    source_url  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS solution_module_capability_map (
    id             SERIAL PRIMARY KEY,
    module_id      INTEGER NOT NULL REFERENCES solution_product_modules(id),
    capability_id  INTEGER NOT NULL REFERENCES solution_capabilities(id),
    coverage_level TEXT NOT NULL DEFAULT 'supporting',  -- core|supporting|limited
    note           TEXT,
    source_note    TEXT,
    source_url     TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_module_capability UNIQUE (module_id, capability_id)
);

CREATE INDEX IF NOT EXISTS idx_sp_vendor ON solution_products(vendor_id);
CREATE INDEX IF NOT EXISTS idx_spm_product ON solution_product_modules(product_id);
CREATE INDEX IF NOT EXISTS idx_smcm_module ON solution_module_capability_map(module_id);
CREATE INDEX IF NOT EXISTS idx_smcm_capability ON solution_module_capability_map(capability_id);