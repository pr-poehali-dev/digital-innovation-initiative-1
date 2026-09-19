-- ============================================================
-- Минимальный импорт двух инициатив, по которым в презентации нет
-- детальных слайдов (вехи, риски) — только одна строка в сводной
-- таблице статусов направления 8.10. Загружаем только подтверждённое
-- материалами, без выдуманных вех/рисков/задач. Отсутствие бюджетных
-- данных по 101066 — «данные не представлены», НЕ нулевой бюджет.
-- ============================================================

-- ---------- 100398 AC GRM ----------
INSERT INTO exec_initiative (
    external_code, title, summary, customer_org_unit_id, portfolio_id,
    status, priority, data_as_of, source_note, verification_status
)
SELECT
    '100398',
    'Автоматизация процессов взаимодействия Банка с органами гос. власти (AC GRM)',
    'Система доступна в пользовательском режиме, идёт анализ функциональности. Детальный план вех и риски по инициативе в презентации не представлены — только сводная строка статуса.',
    (SELECT id FROM org_units WHERE code = 'ДРКНОиПНП'),
    (SELECT id FROM exec_portfolio WHERE code = 'BLOCK-VK-2026'),
    'in_progress', 'medium', '2026-09-30',
    'Импортировано из презентации «Инициативы по направлению 8.10 Контроль и аудит Блока ВК»: организационная схема направления (заказчик — ДРКНОиПНП), сводная таблица статусов (ключевой статус «Система доступна в пользовательском режиме», ключевая задача «Анализ функциональности», участники — «команда»), слайд исполнения бюджета 2026. ДАННЫЕ НЕПОЛНЫ: детальный слайд с вехами и рисками по инициативе 100398 в переданных материалах отсутствует.',
    'user_draft'
WHERE NOT EXISTS (SELECT 1 FROM exec_initiative WHERE external_code = '100398');

INSERT INTO exec_role_assignment (initiative_id, role_code, org_unit_id, status, verification_status, created_by)
SELECT i.id, 'business_customer', (SELECT id FROM org_units WHERE code = 'ДРКНОиПНП'), 'active', 'user_draft', 'import:presentation'
FROM exec_initiative i WHERE i.external_code = '100398'
  AND NOT EXISTS (SELECT 1 FROM exec_role_assignment ra WHERE ra.initiative_id = i.id AND ra.role_code = 'business_customer');

-- Бюджет 2026 — единственные подтверждённые числа по инициативе (слайд исполнения бюджета)
INSERT INTO exec_budget_version (initiative_id, year, version_label, version_status, note, is_snapshot, snapshot_as_of, source_note, created_by)
SELECT i.id, 2026, '2026 — план (БПК 15-26 от 03.06) и прогноз реализации', 'forecast',
       'Единственная позиция направления 8.10 без отклонения плана и прогноза (100% освоение).',
       true, '2026-09-30',
       'Слайд «Исполнение бюджета 2026 года» презентации Блока ВК. План/прогноз на 2026 год, факт исполнения в источнике не приведён.',
       'import:presentation'
FROM exec_initiative i WHERE i.external_code = '100398'
  AND NOT EXISTS (SELECT 1 FROM exec_budget_version bv WHERE bv.initiative_id = i.id AND bv.year = 2026);

INSERT INTO exec_budget_line (version_id, category_id, budget_type, month, amount_plan, amount_forecast, comment)
SELECT bv.id, (SELECT id FROM exec_cost_category WHERE code='operations'), 'opex', '2026-01-01', 100000, 100000, 'OPEX план/прогноз 0,10 млн'
FROM exec_budget_version bv JOIN exec_initiative i ON i.id = bv.initiative_id
WHERE i.external_code = '100398' AND bv.year = 2026
  AND NOT EXISTS (SELECT 1 FROM exec_budget_line bl WHERE bl.version_id = bv.id AND bl.budget_type = 'opex');

INSERT INTO exec_budget_line (version_id, category_id, budget_type, month, amount_plan, amount_forecast, comment)
SELECT bv.id, (SELECT id FROM exec_cost_category WHERE code='fot'), 'fot', '2026-01-01', 11600000, 11600000, 'ФОТ план/прогноз 11,60 млн (100% освоение, без отклонения)'
FROM exec_budget_version bv JOIN exec_initiative i ON i.id = bv.initiative_id
WHERE i.external_code = '100398' AND bv.year = 2026
  AND NOT EXISTS (SELECT 1 FROM exec_budget_line bl WHERE bl.version_id = bv.id AND bl.budget_type = 'fot');

INSERT INTO exec_initiative_decision_request
    (initiative_id, question, question_type, status, source_note, verification_status, created_by)
SELECT i.id,
       'По инициативе 100398 (AC GRM) в переданных материалах нет детального плана вех и рисков — только одна строка в сводной таблице статусов. Необходимо запросить у владельца инициативы: вехи с датами, ответственных, риски и текущий план работ.',
       'data_clarification', 'open',
       'Сводная таблица статусов и оргсхема направления 8.10 — единственные источники по инициативе 100398.', 'user_draft', 'import:presentation'
FROM exec_initiative i WHERE i.external_code = '100398'
  AND NOT EXISTS (SELECT 1 FROM exec_initiative_decision_request idr WHERE idr.initiative_id = i.id AND idr.question_type = 'data_clarification');

-- ---------- 101066 Эгида ----------
INSERT INTO exec_initiative (
    external_code, title, summary, customer_org_unit_id, portfolio_id,
    status, priority, data_as_of, source_note, verification_status
)
SELECT
    '101066',
    'Инициатива «Эгида»',
    'Ключевой статус на дату среза — «Ввод в ПЭ». Детальный план вех, риски и бюджет по инициативе в переданных материалах не представлены — только сводная строка статуса и указание функционального заказчика.',
    (SELECT id FROM org_units WHERE code = '4'),
    (SELECT id FROM exec_portfolio WHERE code = 'BLOCK-VK-2026'),
    'in_progress', 'medium', '2026-09-30',
    'Импортировано из презентации «Инициативы по направлению 8.10 Контроль и аудит Блока ВК»: организационная схема направления (заказчик — Департамент финансового мониторинга) и сводная таблица статусов (ключевой статус «Ввод в ПЭ»). ДАННЫЕ НЕПОЛНЫ: вехи, риски и бюджет по инициативе 101066 в переданных материалах отсутствуют — бюджет НЕ приравнивается к нулю, а помечен как не представленный.',
    'user_draft'
WHERE NOT EXISTS (SELECT 1 FROM exec_initiative WHERE external_code = '101066');

INSERT INTO exec_role_assignment (initiative_id, role_code, org_unit_id, status, verification_status, created_by)
SELECT i.id, 'business_customer', (SELECT id FROM org_units WHERE code = '4'), 'active', 'user_draft', 'import:presentation'
FROM exec_initiative i WHERE i.external_code = '101066'
  AND NOT EXISTS (SELECT 1 FROM exec_role_assignment ra WHERE ra.initiative_id = i.id AND ra.role_code = 'business_customer');

INSERT INTO exec_initiative_decision_request
    (initiative_id, question, question_type, status, source_note, verification_status, created_by)
SELECT i.id,
       'По инициативе 101066 («Эгида») в переданных материалах нет ни вех, ни рисков, ни данных бюджета — только упоминание в оргсхеме направления и сводной таблице статусов («Ввод в ПЭ»). Необходимо запросить у владельца (Департамент финансового мониторинга) полное описание инициативы: цель, план работ, ответственных, бюджет.',
       'data_clarification', 'open',
       'Сводная таблица статусов и оргсхема направления 8.10 — единственные источники по инициативе 101066. Бюджетный слайд направления 8.10 инициативу 101066 не включает — вероятно, относится к отдельному бюджету ДФМ.',
       'user_draft', 'import:presentation'
FROM exec_initiative i WHERE i.external_code = '101066'
  AND NOT EXISTS (SELECT 1 FROM exec_initiative_decision_request idr WHERE idr.initiative_id = i.id AND idr.question_type = 'data_clarification');
