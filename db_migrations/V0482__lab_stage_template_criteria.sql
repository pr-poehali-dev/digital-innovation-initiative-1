-- Критерии шлюза задаются шаблоном стадии (переиспользуются для всех
-- будущих lab_development кейсов), а не жёстко прошиты под «6И».
CREATE TABLE t_p61016064_digital_innovation_i.wb_stage_template_criterion (
    id SERIAL PRIMARY KEY,
    stage_template_id INTEGER NOT NULL REFERENCES t_p61016064_digital_innovation_i.wb_stage_template(id),
    order_no INTEGER NOT NULL,
    code TEXT NOT NULL,
    title TEXT NOT NULL,
    criterion_type TEXT NOT NULL DEFAULT 'manual',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO t_p61016064_digital_innovation_i.wb_stage_template_criterion
    (stage_template_id, order_no, code, title, criterion_type)
SELECT t.id, 1, 'C_TASKS', 'Все задачи стадии выполнены', 'stage_tasks_done'
FROM t_p61016064_digital_innovation_i.wb_stage_template t WHERE t.project_kind = 'lab_development';

-- Для стадии 1 «Постановка задачи» дополнительный критерий: паспорт подтверждён владельцем.
INSERT INTO t_p61016064_digital_innovation_i.wb_stage_template_criterion
    (stage_template_id, order_no, code, title, criterion_type)
SELECT t.id, 2, 'C_PASSPORT', 'Паспорт кейса подтверждён владельцем', 'passport_confirmed'
FROM t_p61016064_digital_innovation_i.wb_stage_template t
WHERE t.project_kind = 'lab_development' AND t.code = 'S1';

COMMENT ON TABLE t_p61016064_digital_innovation_i.wb_stage_template_criterion IS
    'Шаблонные критерии шлюза для каждой стадии шаблона — источник для создания wb_case_stage_criterion при инициализации стадий проекта';
