-- ============================================================
-- Импорт инициативы 100395 «ПНИИИМР» (списки инсайдеров, 224-ФЗ)
-- из презентации Блока ВК. Заказчик — ДРКНОиПНП.
-- ФИО из слайдов (Тимофеев В.О., Яковлева Н.С. и др.) НЕ найдены в
-- справочнике exec_person — по решению владельца НЕ создаём фиктивные
-- персоны, переносим как текст в комментарии/source_note до сверки.
-- ============================================================

INSERT INTO exec_initiative (
    external_code, title, summary, customer_org_unit_id, portfolio_id,
    status, priority, plan_start, plan_end, data_as_of, source_note,
    verification_status
)
SELECT
    '100395',
    'Автоматизация процессов внутреннего контроля в целях ПНИИИМР (224-ФЗ)',
    'Модуль ведения списка инсайдеров (1-я очередь). На дату среза — тендер на закупку работ по внедрению модуля, согласование БТ на миграцию БД «Инсайдеры». Ускорение процесса через привлечение в команду дополнительных участников.',
    (SELECT id FROM org_units WHERE code = 'ДРКНОиПНП'),
    (SELECT id FROM exec_portfolio WHERE code = 'BLOCK-VK-2026'),
    'in_progress', 'high', '2026-09-01', '2026-12-31', '2026-09-30',
    'Импортировано из презентации «Инициативы по направлению 8.10 Контроль и аудит Блока ВК»: слайд плана инициативы 100395, слайд рисков инициативы 100395, сводная таблица статусов и слайд исполнения бюджета 2026. ФИО участников (Тимофеев В.О., Яковлева Н.С. и др.), упомянутые на слайдах, не найдены в справочнике персон кабинета — сохранены как текст, персональные записи не создавались.',
    'user_draft'
WHERE NOT EXISTS (SELECT 1 FROM exec_initiative WHERE external_code = '100395');

-- ---------- Роль функционального заказчика ----------
INSERT INTO exec_role_assignment (initiative_id, role_code, org_unit_id, status, verification_status, created_by)
SELECT i.id, 'business_customer', (SELECT id FROM org_units WHERE code = 'ДРКНОиПНП'), 'active', 'user_draft', 'import:presentation'
FROM exec_initiative i
WHERE i.external_code = '100395'
  AND NOT EXISTS (SELECT 1 FROM exec_role_assignment ra WHERE ra.initiative_id = i.id AND ra.role_code = 'business_customer');

-- ---------- Вехи (слайд плана инициативы 100395) ----------
INSERT INTO exec_milestone (
    initiative_id, title, milestone_type, plan_date, status,
    outline_code, sort_order, responsible_role, comment,
    verification_status, source_note, source_ref, data_as_of, created_by
)
SELECT i.id, 'Проведён тендер на закупку работ по внедрению Модуля списка инсайдеров (1-я очередь); АТК по выбору решения — согласовано в системе СЭД Тезис (в повестку заседания АТК вопрос не включён)',
       'other', '2026-10-31', 'not_started',
       '1', 10, 'РП, Департамент закупок', 'В команду для ускорения процесса привлекаются дополнительные участники.',
       'user_draft', 'Слайд плана инициативы 100395', 'presentation:slide3', '2026-09-30', 'import:presentation'
FROM exec_initiative i WHERE i.external_code = '100395'
  AND NOT EXISTS (SELECT 1 FROM exec_milestone m WHERE m.initiative_id = i.id AND m.outline_code = '1');

INSERT INTO exec_milestone (
    initiative_id, title, milestone_type, plan_date, status,
    outline_code, sort_order, responsible_role, parent_milestone_id,
    verification_status, source_note, source_ref, data_as_of, created_by
)
SELECT i.id, 'Заявка на проведение тендера сформирована и подана в системе', 'other', '2026-09-30', 'not_started',
       '1.1', 11, 'РП', (SELECT id FROM exec_milestone WHERE initiative_id = i.id AND outline_code = '1'),
       'user_draft', 'Слайд плана инициативы 100395', 'presentation:slide3', '2026-09-30', 'import:presentation'
FROM exec_initiative i WHERE i.external_code = '100395'
  AND NOT EXISTS (SELECT 1 FROM exec_milestone m WHERE m.initiative_id = i.id AND m.outline_code = '1.1');

INSERT INTO exec_milestone (
    initiative_id, title, milestone_type, plan_date, status,
    outline_code, sort_order, responsible_role, comment,
    verification_status, source_note, source_ref, data_as_of, created_by
)
SELECT i.id, 'Согласование БТ на миграцию БД «Инсайдеры» в модуль ведения списка инсайдеров', 'other', '2026-10-31', 'not_started',
       '2', 20, 'бизнес-аналитик', 'На слайде указаны бизнес-аналитик Яковлева Н.С. и Тимофеев В.О. — персональные записи не создавались, ФИО не найдены в справочнике.',
       'user_draft', 'Слайд плана инициативы 100395', 'presentation:slide3', '2026-09-30', 'import:presentation'
FROM exec_initiative i WHERE i.external_code = '100395'
  AND NOT EXISTS (SELECT 1 FROM exec_milestone m WHERE m.initiative_id = i.id AND m.outline_code = '2');

INSERT INTO exec_milestone (
    initiative_id, title, milestone_type, plan_date, status,
    outline_code, sort_order, responsible_role,
    verification_status, source_note, source_ref, data_as_of, created_by
)
SELECT i.id, 'Модуль ведения списка инсайдеров доступен пользователям в тестовом контуре', 'result', '2026-12-31', 'not_started',
       '3', 30, 'РП',
       'user_draft', 'Слайд плана инициативы 100395', 'presentation:slide3', '2026-09-30', 'import:presentation'
FROM exec_initiative i WHERE i.external_code = '100395'
  AND NOT EXISTS (SELECT 1 FROM exec_milestone m WHERE m.initiative_id = i.id AND m.outline_code = '3');

INSERT INTO exec_milestone (
    initiative_id, title, milestone_type, plan_date, status,
    outline_code, sort_order, responsible_role, comment,
    verification_status, source_note, source_ref, data_as_of, created_by
)
SELECT i.id, 'Формирование плана (вех) на 2027 г.', 'other', '2026-11-30', 'not_started',
       '4', 40, 'РП', 'На слайде также указаны Тимофеев В.О. и СВА как участники — персональные записи не создавались.',
       'user_draft', 'Слайд плана инициативы 100395', 'presentation:slide3', '2026-09-30', 'import:presentation'
FROM exec_initiative i WHERE i.external_code = '100395'
  AND NOT EXISTS (SELECT 1 FROM exec_milestone m WHERE m.initiative_id = i.id AND m.outline_code = '4');

-- ---------- Риски (слайд рисков 100395) ----------
INSERT INTO exec_risk (
    initiative_id, description, cause, consequence, qualitative_level, severity_rank,
    category, related_milestone_id, preventive_measures, owner_role, status,
    verification_status, source_note, source_ref, data_as_of, created_by
)
SELECT i.id, 'Изменение входных данных, требований',
       'На рынке нет готовых коробочных решений по ведению инсайдеров и защите инсайдерской информации, отвечающих всем требованиям ФЗ',
       'Длительная проработка и согласование АТК; срыв сроков', 'high', 3,
       'regulatory', (SELECT id FROM exec_milestone WHERE initiative_id = i.id AND outline_code = '1'),
       'Проработка нового решения, нового подхода для обоснования закупки у Единственного поставщика',
       'ОМ, РП', 'active',
       'user_draft', 'Слайд «Риски инициатива 100395», строка 1.',
       'presentation:slide_risks_100395', '2026-09-30', 'import:presentation'
FROM exec_initiative i WHERE i.external_code = '100395'
  AND NOT EXISTS (SELECT 1 FROM exec_risk r WHERE r.initiative_id = i.id AND r.description = 'Изменение входных данных, требований');

INSERT INTO exec_risk (
    initiative_id, description, cause, consequence, qualitative_level, severity_rank,
    category, related_milestone_id, preventive_measures, owner_role, status,
    verification_status, source_note, source_ref, data_as_of, created_by
)
SELECT i.id, 'Заключение договора с ЕП (лицензии) Модуля списка инсайдеров (1-я очередь) дольше планового срока',
       'Длительная проработка и согласование АТК',
       'Срыв сроков', 'high', 3,
       'schedule', (SELECT id FROM exec_milestone WHERE initiative_id = i.id AND outline_code = '1'),
       'Ускорение через вовлечение участников',
       'РП, ОМ', 'active',
       'user_draft', 'Слайд «Риски инициатива 100395», строка 2.',
       'presentation:slide_risks_100395', '2026-09-30', 'import:presentation'
FROM exec_initiative i WHERE i.external_code = '100395'
  AND NOT EXISTS (SELECT 1 FROM exec_risk r WHERE r.initiative_id = i.id AND r.description LIKE 'Заключение договора с ЕП%');

-- ---------- Бюджет 2026 (план/прогноз) ----------
INSERT INTO exec_budget_version (initiative_id, year, version_label, version_status, note, is_snapshot, snapshot_as_of, source_note, created_by)
SELECT i.id, 2026, '2026 — план (БПК 15-26 от 03.06) и прогноз реализации', 'forecast',
       'Импортировано из слайда «Исполнение бюджета 2026 года инициатив по направлению 8.10 Контроль и аудит». Включён лимит по инициативе 101165 — 7,4 млн руб. Отклонение 43,7 млн — не реализован бюджет за счёт CAPEX.',
       true, '2026-09-30',
       'Слайд «Исполнение бюджета 2026 года» презентации Блока ВК. План/прогноз на 2026 год, факт исполнения в источнике не приведён.',
       'import:presentation'
FROM exec_initiative i WHERE i.external_code = '100395'
  AND NOT EXISTS (SELECT 1 FROM exec_budget_version bv WHERE bv.initiative_id = i.id AND bv.year = 2026);

INSERT INTO exec_budget_line (version_id, category_id, budget_type, month, amount_plan, amount_forecast, comment)
SELECT bv.id, (SELECT id FROM exec_cost_category WHERE code='equipment'), 'capex', '2026-01-01', 40000000, 0, 'CAPEX план 40,00 млн / прогноз 0,00 млн (основной вклад в отклонение 43,7 млн)'
FROM exec_budget_version bv JOIN exec_initiative i ON i.id = bv.initiative_id
WHERE i.external_code = '100395' AND bv.year = 2026
  AND NOT EXISTS (SELECT 1 FROM exec_budget_line bl WHERE bl.version_id = bv.id AND bl.budget_type = 'capex');

INSERT INTO exec_budget_line (version_id, category_id, budget_type, month, amount_plan, amount_forecast, comment)
SELECT bv.id, (SELECT id FROM exec_cost_category WHERE code='operations'), 'opex', '2026-01-01', 500000, 500000, 'OPEX план/прогноз 0,50 млн'
FROM exec_budget_version bv JOIN exec_initiative i ON i.id = bv.initiative_id
WHERE i.external_code = '100395' AND bv.year = 2026
  AND NOT EXISTS (SELECT 1 FROM exec_budget_line bl WHERE bl.version_id = bv.id AND bl.budget_type = 'opex');

INSERT INTO exec_budget_line (version_id, category_id, budget_type, month, amount_plan, amount_forecast, comment)
SELECT bv.id, (SELECT id FROM exec_cost_category WHERE code='fot'), 'fot', '2026-01-01', 39600000, 35900000, 'ФОТ план 39,60 млн / прогноз 35,90 млн'
FROM exec_budget_version bv JOIN exec_initiative i ON i.id = bv.initiative_id
WHERE i.external_code = '100395' AND bv.year = 2026
  AND NOT EXISTS (SELECT 1 FROM exec_budget_line bl WHERE bl.version_id = bv.id AND bl.budget_type = 'fot');

-- ---------- Вопрос владельцу: сверка ФИО участников ----------
INSERT INTO exec_initiative_decision_request
    (initiative_id, question, question_type, status, source_note, verification_status, created_by)
SELECT i.id,
       'По инициативе 100395 (ПНИИИМР) на слайдах указаны ФИО участников (Тимофеев В.О., Яковлева Н.С., СВА), которые не найдены в справочнике персон кабинета. Нужно подтвердить точные ФИО, должности и роли для привязки ответственных к вехам.',
       'data_clarification', 'open',
       'Слайд плана инициативы 100395, колонка «Участники / Процессы».', 'user_draft', 'import:presentation'
FROM exec_initiative i WHERE i.external_code = '100395'
  AND NOT EXISTS (
      SELECT 1 FROM exec_initiative_decision_request idr
      WHERE idr.initiative_id = i.id AND idr.question_type = 'data_clarification' AND idr.question ILIKE '%справочнике персон%'
  );
