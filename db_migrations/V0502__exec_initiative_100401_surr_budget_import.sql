-- Бюджет 2026 по инициативе 100401 (СУРР) со слайда «Исполнение бюджета
-- 2026 года инициатив по направлению 8.10 Контроль и аудит» — не был
-- перенесён в первом импорте карточки, добавляется отдельно.
INSERT INTO exec_budget_version (initiative_id, year, version_label, version_status, note, is_snapshot, snapshot_as_of, source_note, created_by)
SELECT i.id, 2026, '2026 — план (БПК 15-26 от 03.06) и прогноз реализации', 'forecast',
       'Отклонение 0,9 млн — не реализован бюджет за счёт ФОТ.',
       true, '2026-09-30',
       'Слайд «Исполнение бюджета 2026 года» презентации Блока ВК. План/прогноз на 2026 год, факт исполнения в источнике не приведён.',
       'import:presentation'
FROM exec_initiative i WHERE i.external_code = '100401'
  AND NOT EXISTS (SELECT 1 FROM exec_budget_version bv WHERE bv.initiative_id = i.id AND bv.year = 2026);

INSERT INTO exec_budget_line (version_id, category_id, budget_type, month, amount_plan, amount_forecast, comment)
SELECT bv.id, (SELECT id FROM exec_cost_category WHERE code='equipment'), 'capex', '2026-01-01', 400000, 400000, 'CAPEX план/прогноз 0,40 млн'
FROM exec_budget_version bv JOIN exec_initiative i ON i.id = bv.initiative_id
WHERE i.external_code = '100401' AND bv.year = 2026
  AND NOT EXISTS (SELECT 1 FROM exec_budget_line bl WHERE bl.version_id = bv.id AND bl.budget_type = 'capex');

INSERT INTO exec_budget_line (version_id, category_id, budget_type, month, amount_plan, amount_forecast, comment)
SELECT bv.id, (SELECT id FROM exec_cost_category WHERE code='operations'), 'opex', '2026-01-01', 6400000, 6200000, 'OPEX план 6,40 млн / прогноз 6,20 млн'
FROM exec_budget_version bv JOIN exec_initiative i ON i.id = bv.initiative_id
WHERE i.external_code = '100401' AND bv.year = 2026
  AND NOT EXISTS (SELECT 1 FROM exec_budget_line bl WHERE bl.version_id = bv.id AND bl.budget_type = 'opex');

INSERT INTO exec_budget_line (version_id, category_id, budget_type, month, amount_plan, amount_forecast, comment)
SELECT bv.id, (SELECT id FROM exec_cost_category WHERE code='fot'), 'fot', '2026-01-01', 19100000, 18400000, 'ФОТ план 19,10 млн / прогноз 18,40 млн (основной вклад в отклонение 0,9 млн)'
FROM exec_budget_version bv JOIN exec_initiative i ON i.id = bv.initiative_id
WHERE i.external_code = '100401' AND bv.year = 2026
  AND NOT EXISTS (SELECT 1 FROM exec_budget_line bl WHERE bl.version_id = bv.id AND bl.budget_type = 'fot');
