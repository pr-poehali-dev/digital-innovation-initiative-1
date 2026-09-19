-- ============================================================
-- Импорт инициативы 100422 «Цифровой аудит» из презентации Блока ВК
-- (слайды 1, 4 — вехи; сводная таблица статусов; таблица исполнения
-- бюджета 2026). Риски по инициативе явно не выделены в источнике
-- («*** Риски по инициативе не выделены») — не придумываем их.
-- Все записи помечены verification_status='user_draft'.
-- ============================================================

INSERT INTO exec_initiative (
    external_code, title, summary, customer_org_unit_id, portfolio_id,
    status, priority, plan_start, plan_end, data_as_of, source_note,
    verification_status
)
SELECT
    '100422',
    'Внедрение цифрового аудита, включая применение инструментов искусственного интеллекта',
    'Система «Цифровой аудит» — поставка принята 12.08.2026, работы по вводу в опытную эксплуатацию (ОЭ), согласование 19 документов в системе Project Ruler. Следующий шаг — аудит со стороны БИБ, документы подготовлены. Первый круг аудита пройден, последний параметр по устранению — база данных.',
    (SELECT id FROM org_units WHERE code = 'СВА'),
    (SELECT id FROM exec_portfolio WHERE code = 'BLOCK-VK-2026'),
    'in_progress', 'high', '2026-09-01', '2027-06-30', '2026-09-30',
    'Импортировано из презентации «Инициативы по направлению 8.10 Контроль и аудит Блока ВК», слайд 4 (вехи инициативы 100422) и сводных слайдов (статус, бюджет). Риски по инициативе в источнике явно не выделены — пометка на слайде 4: «Риски по инициативе не выделены».',
    'user_draft'
WHERE NOT EXISTS (SELECT 1 FROM exec_initiative WHERE external_code = '100422');

-- ---------- Роль функционального заказчика ----------
INSERT INTO exec_role_assignment (initiative_id, role_code, org_unit_id, status, verification_status, created_by)
SELECT i.id, 'business_customer', (SELECT id FROM org_units WHERE code = 'СВА'), 'active', 'user_draft', 'import:presentation'
FROM exec_initiative i
WHERE i.external_code = '100422'
  AND NOT EXISTS (SELECT 1 FROM exec_role_assignment ra WHERE ra.initiative_id = i.id AND ra.role_code = 'business_customer');

-- ---------- Вехи (слайд 4) ----------
INSERT INTO exec_milestone (
    initiative_id, title, milestone_type, plan_date, status,
    outline_code, sort_order, verification_status, source_note, source_ref, data_as_of, created_by
)
SELECT i.id, 'Провести тестирование скорректированной поставки', 'other', '2026-09-30', 'not_started',
       '1', 10, 'user_draft', 'Слайд 4 презентации Блока ВК, инициатива 100422', 'presentation:slide4', '2026-09-30', 'import:presentation'
FROM exec_initiative i WHERE i.external_code = '100422'
  AND NOT EXISTS (SELECT 1 FROM exec_milestone m WHERE m.initiative_id = i.id AND m.outline_code = '1');

INSERT INTO exec_milestone (
    initiative_id, title, milestone_type, plan_date, status,
    outline_code, sort_order, verification_status, source_note, source_ref, data_as_of, created_by
)
SELECT i.id, 'Система «Цифровой аудит» введена в ОЭ', 'rollout', '2026-12-31', 'not_started',
       '2', 20, 'user_draft', 'Слайд 4 презентации Блока ВК, инициатива 100422', 'presentation:slide4', '2026-09-30', 'import:presentation'
FROM exec_initiative i WHERE i.external_code = '100422'
  AND NOT EXISTS (SELECT 1 FROM exec_milestone m WHERE m.initiative_id = i.id AND m.outline_code = '2');

INSERT INTO exec_milestone (
    initiative_id, title, milestone_type, plan_date, status,
    outline_code, sort_order, verification_status, source_note, source_ref, data_as_of, created_by
)
SELECT i.id, '1-я проверка СВА проведена с помощью системы «Цифровой аудит» в тестовом режиме', 'result', '2026-12-31', 'not_started',
       '3', 30, 'user_draft', 'Слайд 4 презентации Блока ВК, инициатива 100422', 'presentation:slide4', '2026-09-30', 'import:presentation'
FROM exec_initiative i WHERE i.external_code = '100422'
  AND NOT EXISTS (SELECT 1 FROM exec_milestone m WHERE m.initiative_id = i.id AND m.outline_code = '3');

INSERT INTO exec_milestone (
    initiative_id, title, milestone_type, plan_date, status,
    outline_code, sort_order, verification_status, source_note, source_ref, data_as_of, created_by
)
SELECT i.id, 'Система «Цифровой аудит» введена в ПЭ', 'rollout', '2027-06-30', 'not_started',
       '4', 40, 'user_draft', 'Слайд 4 презентации Блока ВК, инициатива 100422', 'presentation:slide4', '2026-09-30', 'import:presentation'
FROM exec_initiative i WHERE i.external_code = '100422'
  AND NOT EXISTS (SELECT 1 FROM exec_milestone m WHERE m.initiative_id = i.id AND m.outline_code = '4');

-- ---------- Бюджет 2026 (план/прогноз, слайд «Исполнение бюджета 2026») ----------
INSERT INTO exec_budget_version (initiative_id, year, version_label, version_status, note, is_snapshot, snapshot_as_of, source_note, created_by)
SELECT i.id, 2026, '2026 — план (БПК 15-26 от 03.06) и прогноз реализации', 'forecast',
       'Импортировано из слайда «Исполнение бюджета 2026 года инициатив по направлению 8.10 Контроль и аудит». По итогу 1 кв. 2026 — изъятие экономии по ФОТ 11,3 млн.руб. (в разбивке по инициативам).',
       true, '2026-09-30',
       'Слайд «Исполнение бюджета 2026 года» презентации Блока ВК. Значения — план, утверждённый БПК 15-26, и прогноз реализации на 2026 год; факт исполнения в источнике не приведён.',
       'import:presentation'
FROM exec_initiative i WHERE i.external_code = '100422'
  AND NOT EXISTS (SELECT 1 FROM exec_budget_version bv WHERE bv.initiative_id = i.id AND bv.year = 2026);

-- План: CAPEX 15,00 / OPEX 0,70 / ФОТ 47,60 (млн руб. -> руб.)
INSERT INTO exec_budget_line (version_id, category_id, budget_type, month, amount_plan, amount_forecast, comment)
SELECT bv.id, (SELECT id FROM exec_cost_category WHERE code='equipment'), 'capex', '2026-01-01', 15000000, 15000000, 'CAPEX план/прогноз 2026, слайд «Исполнение бюджета 2026»'
FROM exec_budget_version bv JOIN exec_initiative i ON i.id = bv.initiative_id
WHERE i.external_code = '100422' AND bv.year = 2026
  AND NOT EXISTS (SELECT 1 FROM exec_budget_line bl WHERE bl.version_id = bv.id AND bl.budget_type = 'capex');

INSERT INTO exec_budget_line (version_id, category_id, budget_type, month, amount_plan, amount_forecast, comment)
SELECT bv.id, (SELECT id FROM exec_cost_category WHERE code='operations'), 'opex', '2026-01-01', 700000, 700000, 'OPEX план/прогноз 2026, слайд «Исполнение бюджета 2026»'
FROM exec_budget_version bv JOIN exec_initiative i ON i.id = bv.initiative_id
WHERE i.external_code = '100422' AND bv.year = 2026
  AND NOT EXISTS (SELECT 1 FROM exec_budget_line bl WHERE bl.version_id = bv.id AND bl.budget_type = 'opex');

INSERT INTO exec_budget_line (version_id, category_id, budget_type, month, amount_plan, amount_forecast, comment)
SELECT bv.id, (SELECT id FROM exec_cost_category WHERE code='fot'), 'fot', '2026-01-01', 47600000, 44500000, 'ФОТ план 47,60 млн / прогноз 44,50 млн, отклонение 3,1 млн за счёт ФОТ (слайд «Исполнение бюджета 2026»)'
FROM exec_budget_version bv JOIN exec_initiative i ON i.id = bv.initiative_id
WHERE i.external_code = '100422' AND bv.year = 2026
  AND NOT EXISTS (SELECT 1 FROM exec_budget_line bl WHERE bl.version_id = bv.id AND bl.budget_type = 'fot');

-- ---------- Вопрос владельцу: ответственный не указан на слайдах ----------
INSERT INTO exec_initiative_decision_request
    (initiative_id, question, question_type, status, source_note, verification_status, created_by)
SELECT i.id,
       'По инициативе 100422 (Цифровой аудит) в презентации не указан ответственный (роль РП/ОМ на слайде вех — прочерк). Необходимо подтвердить владельца и ответственного за исполнение.',
       'data_clarification', 'open',
       'Слайд 4 презентации: колонка «Ответственный» пуста для всех строк.', 'user_draft', 'import:presentation'
FROM exec_initiative i WHERE i.external_code = '100422'
  AND NOT EXISTS (
      SELECT 1 FROM exec_initiative_decision_request idr
      WHERE idr.initiative_id = i.id AND idr.question_type = 'data_clarification' AND idr.question ILIKE '%ответственный%'
  );
