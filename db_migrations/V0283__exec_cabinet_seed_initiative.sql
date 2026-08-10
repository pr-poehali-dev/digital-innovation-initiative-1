INSERT INTO exec_initiative (code, title, summary, problem, goal, expected_result, owner_person_id, manager_person_id, curator_person_id, realization_form, scale, priority, status, stage, plan_start, plan_end, solution_title, solution_type, effect_description, effect_owner_person_id, effect_metric, effect_baseline, effect_target, budget_need, escalation_level, verification_status, is_test_data)
SELECT
 'INIT-001',
 'Автоматизация мониторинга реализации инициатив Блока внутреннего контроля',
 'Единый механизм получения статусов, выявления отклонений и контроля принятых решений',
 'Информация о ходе инициатив хранится в разных таблицах, письмах и презентациях; статусы обновляются вручную; проблемы выявляются несвоевременно; принятые решения и их исполнение не связаны в едином контуре.',
 'Создать единый механизм получения статусов, выявления отклонений, подготовки вопросов для Группы и контроля принятых решений',
 'Единый реестр инициатив, единые статусы и контрольные точки, журнал управленческих решений, механизм эскалации, управленческая панель, автоматизированная подготовка сводки',
 (SELECT id FROM exec_person WHERE display_name='Участник В'),
 (SELECT id FROM exec_person WHERE display_name='Участник Г'),
 (SELECT id FROM exec_person WHERE display_name='Участник А'),
 'pilot','block','high','pilot','pilot',
 CURRENT_DATE - 30, CURRENT_DATE + 60,
 'Управленческая панель мониторинга инициатив','analytics',
 'Сокращение времени подготовки сводки по портфелю',
 (SELECT id FROM exec_person WHERE display_name='Участник Б'),
 'Часы на подготовку сводки','16 часов','4 часа','Не определена','group','user_draft',true
WHERE NOT EXISTS (SELECT 1 FROM exec_initiative WHERE code='INIT-001');

INSERT INTO exec_role_assignment (initiative_id, role_code, person_id, date_from, status, verification_status, created_by)
SELECT i.id, v.role_code, p.id, CURRENT_DATE - 30, 'active', 'user_draft', 'seed'
FROM exec_initiative i
CROSS JOIN (VALUES
  ('curator','Участник А'),
  ('group_head','Участник Б'),
  ('owner','Участник В'),
  ('manager','Участник Г'),
  ('business_customer','Участник Д'),
  ('tech_executor','Участник Е'),
  ('infosec','Участник Ж'),
  ('effect_owner','Участник Б')
) AS v(role_code, pname)
JOIN exec_person p ON p.display_name = v.pname
WHERE i.code='INIT-001'
AND NOT EXISTS (SELECT 1 FROM exec_role_assignment ra WHERE ra.initiative_id=i.id AND ra.role_code=v.role_code);

INSERT INTO exec_stakeholder (initiative_id, person_id, role_in_initiative, formal_participation, can_decide, must_approve, can_block, controls_resource, participation_state, participation_state_at, position_on_topic, confirmed_requirements, open_questions, noninvolvement_risk, engagement_goal, next_action, next_action_due, engagement_status, responsible_person_id, verification_status, is_test_data)
SELECT i.id, p.id, v.role_title, v.formal, v.can_decide, v.must_approve, v.can_block, v.controls_res, v.pstate, now(), v.position_txt, v.reqs, v.open_q, v.risk, v.goal_txt, v.next_act, CURRENT_DATE + v.due_days, v.eng_status,
  (SELECT id FROM exec_person WHERE display_name='Участник Г'), 'user_draft', true
FROM exec_initiative i
CROSS JOIN (VALUES
  ('Участник А','Куратор, руководитель Блока',5,true,true,true,true,'decision_pending','Поддерживает при условии измеримого эффекта','Ежемесячная сводка по портфелю','Не определён источник финансирования','medium','Обеспечить поддержку на уровне Блока','Представить расчёт эффекта на заседании Группы',7,'in_progress'),
  ('Участник Б','Руководитель Группы',5,true,true,false,true,'materials_provided','Инициатива включена в портфель','Единый реестр и журнал решений','Требуется согласование формата сводки','low','Синхронизировать с повесткой Группы','Включить вопрос в повестку ближайшего заседания',3,'in_progress'),
  ('Участник В','Владелец инициативы',4,false,true,false,false,'confirmed','Отвечает за результат','Подтверждение проблемы и эффекта','Не назначен ответственный за данные','low','Поддерживать вовлечённость владельца','Согласовать критерии успеха пилота',5,'in_progress'),
  ('Участник Г','Руководитель инициативы',3,false,false,false,false,'confirmed','Ведёт оперативную работу','Контрольные точки и отчётность','Нужны ресурсы на разработку','low','Обеспечить оперативное ведение','Обновить контрольные точки пилота',2,'in_progress'),
  ('Участник Д','Функциональный заказчик',4,false,true,true,false,'remarks_received','Требует сохранения текущей отчётности','Совместимость с существующей отчётностью','Не решён вопрос переноса исторических данных','high','Снять замечания по отчётности','Провести встречу по требованиям к отчётности',10,'planned'),
  ('Участник Е','Представитель ИТ',3,false,true,false,true,'invite_sent','Позиция не выражена','Оценка трудоёмкости','Не подтверждены сроки разработки','medium','Получить оценку трудоёмкости','Запросить оценку сроков и ресурсов',14,'planned'),
  ('Участник Ж','Представитель ИБ',4,false,true,true,false,'invite_not_sent','no_data','Требования к обработке данных','Не начато согласование требований ИБ','high','Согласовать требования ИБ до пилота','Направить запрос на требования ИБ',1,'overdue')
) AS v(pname, role_title, formal, can_decide, must_approve, can_block, controls_res, pstate, position_txt, reqs, open_q, risk, goal_txt, next_act, due_days, eng_status)
JOIN exec_person p ON p.display_name = v.pname
WHERE i.code='INIT-001'
AND NOT EXISTS (SELECT 1 FROM exec_stakeholder s WHERE s.initiative_id=i.id AND s.person_id=p.id);
