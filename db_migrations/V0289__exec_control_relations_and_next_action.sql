CREATE TABLE IF NOT EXISTS exec_relation (
    id SERIAL PRIMARY KEY,
    relation_type VARCHAR(64) NOT NULL,
    src_issue_id INTEGER REFERENCES exec_issue(id),
    src_risk_id INTEGER REFERENCES exec_risk(id),
    src_milestone_id INTEGER REFERENCES exec_milestone(id),
    tgt_milestone_id INTEGER REFERENCES exec_milestone(id),
    tgt_decision_id INTEGER REFERENCES exec_decision_instance(id),
    tgt_stakeholder_id INTEGER REFERENCES exec_stakeholder(id),
    tgt_role_assignment_id INTEGER REFERENCES exec_role_assignment(id),
    tgt_person_id INTEGER REFERENCES exec_person(id),
    note TEXT,
    created_by VARCHAR(255),
    created_at TIMESTAMP DEFAULT now(),
    CONSTRAINT exec_relation_one_src CHECK (
        (CASE WHEN src_issue_id IS NOT NULL THEN 1 ELSE 0 END) +
        (CASE WHEN src_risk_id IS NOT NULL THEN 1 ELSE 0 END) +
        (CASE WHEN src_milestone_id IS NOT NULL THEN 1 ELSE 0 END) = 1
    ),
    CONSTRAINT exec_relation_one_tgt CHECK (
        (CASE WHEN tgt_milestone_id IS NOT NULL THEN 1 ELSE 0 END) +
        (CASE WHEN tgt_decision_id IS NOT NULL THEN 1 ELSE 0 END) +
        (CASE WHEN tgt_stakeholder_id IS NOT NULL THEN 1 ELSE 0 END) +
        (CASE WHEN tgt_role_assignment_id IS NOT NULL THEN 1 ELSE 0 END) +
        (CASE WHEN tgt_person_id IS NOT NULL THEN 1 ELSE 0 END) = 1
    )
);

CREATE INDEX IF NOT EXISTS idx_exec_relation_src_issue ON exec_relation(src_issue_id);
CREATE INDEX IF NOT EXISTS idx_exec_relation_src_risk ON exec_relation(src_risk_id);
CREATE INDEX IF NOT EXISTS idx_exec_relation_src_ms ON exec_relation(src_milestone_id);

ALTER TABLE exec_initiative
    ADD COLUMN IF NOT EXISTS next_action_text TEXT,
    ADD COLUMN IF NOT EXISTS next_action_due DATE,
    ADD COLUMN IF NOT EXISTS next_action_person_id INTEGER REFERENCES exec_person(id),
    ADD COLUMN IF NOT EXISTS next_action_is_manual BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS next_action_manual_by VARCHAR(255),
    ADD COLUMN IF NOT EXISTS next_action_manual_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS next_action_manual_reason TEXT;

ALTER TABLE exec_decision_instance
    ADD COLUMN IF NOT EXISTS review_body_id INTEGER REFERENCES exec_collegial_body(id),
    ADD COLUMN IF NOT EXISTS needs_group_review BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS review_target_date DATE;

INSERT INTO ref_dictionary_type (code, title, is_system) VALUES
('milestone_type','Тип контрольной точки',false),
('milestone_status','Статус контрольной точки',true),
('issue_category','Категория проблемы',false),
('issue_criticality','Критичность проблемы',true),
('issue_status','Статус проблемы',true),
('risk_status','Статус риска',true),
('risk_level','Уровень риска',true),
('action_status','Статус действия',true),
('escalation_status','Статус эскалации',true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO ref_dictionary_value (type_code, code, title, sort_order, color, is_system) VALUES
('milestone_type','decision','Решение',10,null,false),
('milestone_type','document','Документ',20,null,false),
('milestone_type','approval','Согласование',30,null,false),
('milestone_type','development','Разработка',40,null,false),
('milestone_type','pilot','Пилот',50,null,false),
('milestone_type','rollout','Внедрение',60,null,false),
('milestone_type','result','Результат',70,null,false),
('milestone_type','other','Иное',80,null,false),

('milestone_status','not_started','Не начато',10,'gray',true),
('milestone_status','in_progress','В работе',20,'blue',true),
('milestone_status','achieved','Достигнуто',30,'green',true),
('milestone_status','cancelled','Отменено',40,'gray',true),

('issue_category','organizational','Организационная',10,null,false),
('issue_category','resource','Ресурсная',20,null,false),
('issue_category','technological','Технологическая',30,null,false),
('issue_category','methodological','Методологическая',40,null,false),
('issue_category','legal','Правовая',50,null,false),
('issue_category','cross_functional','Межфункциональная',60,null,false),
('issue_category','other','Иная',70,null,false),

('issue_criticality','low','Низкая',10,'gray',true),
('issue_criticality','medium','Средняя',20,'amber',true),
('issue_criticality','high','Высокая',30,'orange',true),
('issue_criticality','critical','Критическая',40,'red',true),

('issue_status','open','Открыта',10,'orange',true),
('issue_status','in_progress','В работе',20,'blue',true),
('issue_status','awaiting_decision','Ожидает решения',30,'purple',true),
('issue_status','resolved','Устранена',40,'green',true),
('issue_status','closed','Закрыта',50,'gray',true),
('issue_status','irrelevant','Неактуальна',60,'gray',true),

('risk_status','active','Активен',10,'orange',true),
('risk_status','mitigated','Снижен',20,'blue',true),
('risk_status','accepted','Принят',30,'amber',true),
('risk_status','materialized','Реализовался',40,'red',true),
('risk_status','closed','Закрыт',50,'green',true),
('risk_status','irrelevant','Неактуален',60,'gray',true),

('risk_level','low','Низкий',10,'green',true),
('risk_level','medium','Средний',20,'amber',true),
('risk_level','high','Высокий',30,'orange',true),
('risk_level','critical','Критический',40,'red',true),

('action_status','not_started','Не начато',10,'gray',true),
('action_status','in_progress','В работе',20,'blue',true),
('action_status','done','Выполнено',30,'green',true),
('action_status','cancelled','Отменено',40,'gray',true),
('action_status','needs_review','Требует пересмотра',50,'amber',true),

('escalation_status','sent','Передано',10,'blue',true),
('escalation_status','in_review','На рассмотрении',20,'amber',true),
('escalation_status','decided','Решение принято',30,'green',true),
('escalation_status','returned','Возвращено',40,'orange',true),
('escalation_status','closed','Закрыто',50,'gray',true)
ON CONFLICT (type_code, code) DO NOTHING;
