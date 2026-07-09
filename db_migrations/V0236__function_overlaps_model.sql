-- Нормализованная форма функции (для exact/normalized-пересечений)
ALTER TABLE t_p61016064_digital_innovation_i.dept_functions
ADD COLUMN IF NOT EXISTS normalized_title TEXT NOT NULL DEFAULT '';

-- Код структурного пункта источника (4.1.2, 4.3.3...) — для предзаполнения в узел дерева
ALTER TABLE t_p61016064_digital_innovation_i.dept_functions
ADD COLUMN IF NOT EXISTS source_section_code TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_df_normalized ON t_p61016064_digital_innovation_i.dept_functions(project_id, normalized_title);

-- Кластеры канонических функций (зрелая модель для отчёта пересечений)
CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.function_clusters (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL,
    canonical_name TEXT NOT NULL,
    normalized_key TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    overlap_type TEXT NOT NULL DEFAULT 'duplicate',
    status TEXT NOT NULL DEFAULT 'new',
    method TEXT NOT NULL DEFAULT 'normalized',
    created_by INTEGER NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fc_project ON t_p61016064_digital_innovation_i.function_clusters(project_id);
CREATE INDEX IF NOT EXISTS idx_fc_key ON t_p61016064_digital_innovation_i.function_clusters(project_id, normalized_key);

-- Элементы кластера (какие функции в него входят)
CREATE TABLE IF NOT EXISTS t_p61016064_digital_innovation_i.function_cluster_items (
    id SERIAL PRIMARY KEY,
    cluster_id INTEGER NOT NULL REFERENCES t_p61016064_digital_innovation_i.function_clusters(id),
    function_id INTEGER NOT NULL REFERENCES t_p61016064_digital_innovation_i.dept_functions(id),
    confidence NUMERIC(4,3) NOT NULL DEFAULT 1.0,
    status TEXT NOT NULL DEFAULT 'new',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fci_cluster ON t_p61016064_digital_innovation_i.function_cluster_items(cluster_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_fci_cluster_function ON t_p61016064_digital_innovation_i.function_cluster_items(cluster_id, function_id);