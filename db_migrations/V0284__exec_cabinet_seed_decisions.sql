INSERT INTO exec_decision_instance (initiative_id, decision_type_code, question, basis, raised_at, due_at, status, proposed_option, final_decision, decided_by_body_id, decided_at, result_document, execution_status, escalation_level, verification_status, is_test_data)
SELECT i.id, v.dtype, v.question, v.basis, CURRENT_DATE - v.raised_days, CURRENT_DATE + v.due_days, v.status,
 v.proposed, v.final_dec,
 CASE WHEN v.decided THEN (SELECT id FROM exec_collegial_body WHERE code='group') ELSE NULL END,
 CASE WHEN v.decided THEN CURRENT_DATE - v.raised_days + 5 ELSE NULL END,
 CASE WHEN v.decided THEN 'Протокол Группы' ELSE NULL END,
 v.exec_status, 'group', 'user_draft', true
FROM exec_initiative i
CROSS JOIN (VALUES
 ('confirm_problem','Подтвердить наличие проблемы разрозненности данных о ходе инициатив','Аналитическая записка по портфелю',40,-35,'decided','Признать проблему подтверждённой','Проблема подтверждена',true,'done'),
 ('include_portfolio','Включить инициативу в портфель Блока','Решение Группы',38,-33,'decided','Включить в портфель','Инициатива включена в портфель',true,'done'),
 ('assign_owner','Назначить владельца и руководителя инициативы','Предложение Группы',36,-31,'decided','Назначить владельцем Участника В','Назначены владелец и руководитель',true,'done'),
 ('approve_goal','Утвердить целевой результат и показатель эффекта','Паспорт инициативы',34,-29,'decided','Сокращение подготовки сводки с 16 до 4 часов','Цель утверждена',true,'done'),
 ('approve_concept','Согласовать концепцию управленческой панели','Концепция решения',30,-20,'decided','Единый реестр и журнал решений','Концепция согласована',true,'done'),
 ('security_requirements','Определить требования к данным и информационной безопасности','Запрос в подразделение ИБ',20,3,'preparing','Ограничить обработку обезличенными данными',NULL,false,'not_started'),
 ('set_priority','Определить приоритет инициативы в портфеле','Сравнительная оценка портфеля',18,-10,'decided','Высокий приоритет','Присвоен высокий приоритет',true,'done'),
 ('budget_include','Включить потребность в бюджетную заявку','Расчёт потребности',15,10,'raised','Определить источник финансирования',NULL,false,'not_started'),
 ('start_pilot','Разрешить запуск пилота управленческой панели','План пилота и критерии успеха',10,5,'review','Разрешить пилот на ограниченном контуре',NULL,false,'not_started'),
 ('accept_pilot','Принять результаты пилота','Отчёт о пилоте',5,45,'raised','Оценить по критериям успеха',NULL,false,'not_started'),
 ('scale_decision','Принять решение о масштабировании на весь Блок','Итоги пилота',3,60,'raised','Определить после пилота',NULL,false,'not_started'),
 ('confirm_effect','Подтвердить достижение эффекта и закрыть инициативу','Расчёт фактического эффекта',1,90,'raised','Подтвердить владельцем эффекта',NULL,false,'not_started')
) AS v(dtype, question, basis, raised_days, due_days, status, proposed, final_dec, decided, exec_status)
WHERE i.code='INIT-001'
AND NOT EXISTS (SELECT 1 FROM exec_decision_instance d WHERE d.initiative_id=i.id AND d.decision_type_code=v.dtype);

INSERT INTO exec_decision_participation (decision_id, decision_type_code, role_code, person_id, participation_kind, is_mandatory, sequence_order, verification_status)
SELECT d.id, d.decision_type_code, v.role_code, ra.person_id, v.kind, true, v.seq, 'user_draft'
FROM exec_decision_instance d
JOIN exec_initiative i ON i.id = d.initiative_id AND i.code='INIT-001'
CROSS JOIN (VALUES
 ('manager','initiate',1),
 ('manager','prepare',2),
 ('business_customer','inform_provide',3),
 ('group_head','recommend',4),
 ('infosec','approve',5),
 ('owner','approve',6),
 ('curator','decide',7),
 ('tech_executor','execute',8),
 ('effect_owner','control',9)
) AS v(role_code, kind, seq)
LEFT JOIN exec_role_assignment ra ON ra.initiative_id = i.id AND ra.role_code = v.role_code
WHERE NOT EXISTS (
  SELECT 1 FROM exec_decision_participation p
  WHERE p.decision_id = d.id AND p.role_code = v.role_code AND p.participation_kind = v.kind
);

INSERT INTO exec_decision_dependency (predecessor_id, dependent_id, dependency_type, condition_text, is_mandatory, condition_met)
SELECT pred.id, dep.id, 'required_predecessor', 'Требования к данным и безопасности должны быть определены до запуска пилота', true, false
FROM exec_decision_instance pred
JOIN exec_decision_instance dep ON dep.initiative_id = pred.initiative_id
JOIN exec_initiative i ON i.id = pred.initiative_id AND i.code='INIT-001'
WHERE pred.decision_type_code='security_requirements' AND dep.decision_type_code='start_pilot'
AND NOT EXISTS (SELECT 1 FROM exec_decision_dependency dd WHERE dd.predecessor_id=pred.id AND dd.dependent_id=dep.id);

INSERT INTO exec_decision_dependency (predecessor_id, dependent_id, dependency_type, condition_text, is_mandatory, condition_met)
SELECT pred.id, dep.id, 'required_predecessor', 'Результаты пилота должны быть приняты до решения о масштабировании', true, false
FROM exec_decision_instance pred
JOIN exec_decision_instance dep ON dep.initiative_id = pred.initiative_id
JOIN exec_initiative i ON i.id = pred.initiative_id AND i.code='INIT-001'
WHERE pred.decision_type_code='accept_pilot' AND dep.decision_type_code='scale_decision'
AND NOT EXISTS (SELECT 1 FROM exec_decision_dependency dd WHERE dd.predecessor_id=pred.id AND dd.dependent_id=dep.id);
