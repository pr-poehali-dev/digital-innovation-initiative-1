-- Оргдерево департамента: универсальная иерархия (parent_id + type)
CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.org_units (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL,
    code TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'division',
    parent_id INTEGER NULL REFERENCES t_p61016064_digital_innovation_i.org_units(id),
    path TEXT NOT NULL DEFAULT '',
    level INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    source_document_id INTEGER NULL,
    source_ref TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_org_units_parent ON t_p61016064_digital_innovation_i.org_units(parent_id);
CREATE INDEX IF NOT EXISTS idx_org_units_project_code ON t_p61016064_digital_innovation_i.org_units(project_id, code);

-- Связь функций с оргединицами (многие-ко-многим + роль: owner / co_executor / participant / reviewer)
CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.function_org_units (
    id SERIAL PRIMARY KEY,
    function_id INTEGER NOT NULL REFERENCES t_p61016064_digital_innovation_i.dept_functions(id),
    org_unit_id INTEGER NOT NULL REFERENCES t_p61016064_digital_innovation_i.org_units(id),
    role TEXT NOT NULL DEFAULT 'owner',
    confidence NUMERIC(4,3) NOT NULL DEFAULT 1.0,
    source_ref TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fou_function ON t_p61016064_digital_innovation_i.function_org_units(function_id);
CREATE INDEX IF NOT EXISTS idx_fou_org_unit ON t_p61016064_digital_innovation_i.function_org_units(org_unit_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_fou_function_unit_role ON t_p61016064_digital_innovation_i.function_org_units(function_id, org_unit_id, role);

-- Мост к уже распознаваемым кодам направлений (18, 93, 32.2, 93.43 и т.д.)
CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.function_directions (
    id SERIAL PRIMARY KEY,
    function_id INTEGER NOT NULL REFERENCES t_p61016064_digital_innovation_i.dept_functions(id),
    direction_code TEXT NOT NULL,
    direction_name TEXT NOT NULL DEFAULT '',
    confidence NUMERIC(4,3) NOT NULL DEFAULT 1.0,
    source_ref TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fd_function ON t_p61016064_digital_innovation_i.function_directions(function_id);
CREATE INDEX IF NOT EXISTS idx_fd_code ON t_p61016064_digital_innovation_i.function_directions(direction_code);