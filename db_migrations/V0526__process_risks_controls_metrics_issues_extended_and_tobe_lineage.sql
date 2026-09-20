-- Итерация 3: единый контур AS-IS -> риски и контроли -> показатели ->
-- проблемы -> улучшения -> TO-BE -> связь с инициативами.
--
-- Принципы (по ТЗ):
-- - вероятность/влияние НЕ придумываем, используем только qualitative_level/severity_rank;
-- - контроль может быть не определён — это не ошибка, а повод для вопроса на уточнение;
-- - НЕ создаём второй реестр инициатив — только ссылки на существующий exec_initiative;
-- - риск процесса (exec_process_risk) — отдельная сущность от риска инициативы (exec_risk),
--   между ними разрешена необязательная ссылка, без автокопирования.

-- ── 1. Риски процесса: причина, владелец/роль, источник, комментарий, ссылка на риск инициативы
ALTER TABLE exec_process_risk
    ADD COLUMN IF NOT EXISTS cause TEXT,
    ADD COLUMN IF NOT EXISTS owner_person_id INTEGER REFERENCES exec_person(id),
    ADD COLUMN IF NOT EXISTS owner_role VARCHAR(255),
    ADD COLUMN IF NOT EXISTS source_note TEXT,
    ADD COLUMN IF NOT EXISTS comment TEXT,
    ADD COLUMN IF NOT EXISTS linked_initiative_risk_id INTEGER REFERENCES exec_risk(id);
COMMENT ON COLUMN exec_process_risk.linked_initiative_risk_id IS
    'Необязательная ссылка на риск инициативы (exec_risk) — НЕ копия и не второй реестр. '
    'Устанавливается пользователем вручную, ничего не подставляется автоматически.';
COMMENT ON COLUMN exec_process_risk.cause IS 'Причина возникновения риска (текстом, без выдуманных формулировок).';
COMMENT ON COLUMN exec_process_risk.owner_role IS 'Ответственная роль текстом, если конкретный владелец (owner_person_id) не назначен.';
COMMENT ON COLUMN exec_process_risk.source_note IS 'Источник сведений о риске: документ, интервью, инцидент и т.п.';

-- ── 2. Контроли: цель, тип (предупреждающий/выявляющий), способ, привязка к операции,
-- нормативный документ и информационная система текстом (справочники — на будущее).
ALTER TABLE exec_process_control
    ADD COLUMN IF NOT EXISTS goal_note TEXT,
    ADD COLUMN IF NOT EXISTS control_type VARCHAR(16) CHECK (control_type IS NULL OR control_type IN ('preventive', 'detective')),
    ADD COLUMN IF NOT EXISTS method VARCHAR(16) CHECK (method IS NULL OR method IN ('manual', 'automated', 'mixed')),
    ADD COLUMN IF NOT EXISTS diagram_node_id INTEGER REFERENCES exec_process_diagram_node(id),
    ADD COLUMN IF NOT EXISTS normative_document_note TEXT,
    ADD COLUMN IF NOT EXISTS info_system_id INTEGER REFERENCES exec_info_system(id),
    ADD COLUMN IF NOT EXISTS comment TEXT,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT now();
COMMENT ON COLUMN exec_process_control.control_type IS 'preventive — предупреждающий (до события), detective — выявляющий (после события).';
COMMENT ON COLUMN exec_process_control.method IS 'manual / automated / mixed — способ выполнения контроля.';
COMMENT ON COLUMN exec_process_control.diagram_node_id IS 'Конкретная операция на схеме, к которой относится контроль (если известна) — процесс уже известен через risk_id.';
CREATE INDEX IF NOT EXISTS idx_epc_diagram_node ON exec_process_control(diagram_node_id);

-- ── 3. Проблемы AS-IS: тип, причина, источник, серьёзность, направление улучшения
ALTER TABLE exec_process_issue
    ADD COLUMN IF NOT EXISTS problem_type VARCHAR(24) CHECK (problem_type IS NULL OR problem_type IN
        ('delay', 'extra_approval', 'duplication', 'manual_operation', 'responsibility_gap',
         'no_control', 'data_gap', 'system_limitation', 'normative_conflict', 'other')),
    ADD COLUMN IF NOT EXISTS cause TEXT,
    ADD COLUMN IF NOT EXISTS source_note TEXT,
    ADD COLUMN IF NOT EXISTS severity_rank SMALLINT,
    ADD COLUMN IF NOT EXISTS improvement_direction TEXT,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT now();
COMMENT ON COLUMN exec_process_issue.severity_rank IS 'Технический ранг только для сортировки в UI, качественно назначается пользователем — не вычисляется.';

-- ── 4. Показатели: привязка к конкретной операции (не только к процессу целиком)
ALTER TABLE exec_process_metric
    ADD COLUMN IF NOT EXISTS diagram_node_id INTEGER REFERENCES exec_process_diagram_node(id);
CREATE INDEX IF NOT EXISTS idx_epm_diagram_node ON exec_process_metric(diagram_node_id);

-- ── 5. Происхождение элементов схемы — устойчивые идентификаторы для сравнения
-- AS-IS/TO-BE (не только по совпадению названий). Само-ссылка: узел/ребро/дорожка
-- TO-BE хранит id соответствующего элемента исходной схемы.
ALTER TABLE exec_process_diagram_node
    ADD COLUMN IF NOT EXISTS origin_node_id INTEGER REFERENCES exec_process_diagram_node(id);
ALTER TABLE exec_process_diagram_edge
    ADD COLUMN IF NOT EXISTS origin_edge_id INTEGER REFERENCES exec_process_diagram_edge(id),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT now();
ALTER TABLE exec_process_diagram_lane
    ADD COLUMN IF NOT EXISTS origin_lane_id INTEGER REFERENCES exec_process_diagram_lane(id),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT now();
COMMENT ON COLUMN exec_process_diagram_node.origin_node_id IS
    'При создании TO-BE копированием AS-IS хранит id исходного узла — используется для diff по устойчивому происхождению, а не по совпадению названия.';

-- ── 6. Улучшения TO-BE и ожидаемый эффект (раздел 8 ТЗ)
CREATE TABLE IF NOT EXISTS exec_process_improvement (
    id SERIAL PRIMARY KEY,
    to_be_diagram_id INTEGER NOT NULL REFERENCES exec_process_diagram(id),
    to_be_node_id INTEGER REFERENCES exec_process_diagram_node(id),
    as_is_issue_id INTEGER REFERENCES exec_process_issue(id),
    description TEXT NOT NULL,
    expected_effect_note TEXT,
    effect_type VARCHAR(24) CHECK (effect_type IS NULL OR effect_type IN
        ('time_reduction', 'risk_reduction', 'quality_improvement', 'cost_reduction',
         'manual_op_elimination', 'control_strengthening', 'automation', 'duplication_elimination')),
    result_metric_id INTEGER REFERENCES exec_process_metric(id),
    owner_person_id INTEGER REFERENCES exec_person(id),
    status VARCHAR(20) NOT NULL DEFAULT 'user_draft' CHECK (status IN ('user_draft', 'confirmed')),
    initiative_id INTEGER REFERENCES exec_initiative(id),
    is_test_data BOOLEAN NOT NULL DEFAULT false,
    created_by VARCHAR(255),
    updated_by VARCHAR(255),
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_epimp_diagram ON exec_process_improvement(to_be_diagram_id);
CREATE INDEX IF NOT EXISTS idx_epimp_issue ON exec_process_improvement(as_is_issue_id);
COMMENT ON TABLE exec_process_improvement IS
    'Изменение TO-BE и его ожидаемый эффект. Экономический эффект НЕ рассчитывается автоматически — '
    'expected_effect_note заполняется пользователем, поле initiative_id заполняется только после его подтверждения (не подставляется системой).';
