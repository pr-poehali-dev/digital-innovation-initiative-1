-- ============================================================
-- Импорт инициативы 100397 «Скрининг» (комплаенс-контроль) из
-- презентации Блока ВК. На сводном слайде явно отмечена как
-- «инициатива с самым большим риском не достижения результатов».
--
-- ВАЖНО: на слайде детального плана инициативы встречаются две
-- неоднозначные строки под номерами 1.1 и 6 с ИДЕНТИЧНЫМ текстом
-- «Мероприятия по устранению риска срыва срока ввода в ОЭ / Перенос
-- вехи» — похоже на дублирование в исходной презентации. По решению
-- владельца кабинета: обе строки сохраняются как ИСХОДНЫЕ ЗАПИСИ
-- (не как вехи, а как мероприятия по риску), помечены «требует
-- проверки», отдельным вопросом выносится на уточнение владельцу.
-- Строка «Инициатива прекращена» (номер 3) переносится как условный
-- сценарий, требующий управленческого решения — по аналогии с СУРР.
-- ============================================================

INSERT INTO exec_initiative (
    external_code, title, summary, customer_org_unit_id, portfolio_id,
    status, priority, plan_start, plan_end, data_as_of, source_note,
    verification_status
)
SELECT
    '100397',
    'Автоматизация процессов комплаенс-контроля «Скрининг»',
    'Ввод в ОЭ, согласование требований со стороны ДСИТ и БИБ, интеграция со смежными системами. На сводном слайде инициатива отмечена как имеющая «самый большой риск не достижения результатов» — нехватка ресурсов для реализации, риск сдвига срока ОЭ/ПЭ, увеличение бюджета на 2027 год.',
    (SELECT id FROM org_units WHERE code = 'ДВКиК'),
    (SELECT id FROM exec_portfolio WHERE code = 'BLOCK-VK-2026'),
    'in_progress', 'high', '2026-09-01', '2026-12-31', '2026-09-30',
    'Импортировано из презентации «Инициативы по направлению 8.10 Контроль и аудит Блока ВК»: слайд детального плана инициативы 100397 (совместно с 100401), слайд рисков инициативы 100397, сводная таблица статусов и слайд исполнения бюджета 2026. Плановое окончание указано ориентировочно — на слайде отмечен риск сдвига срока ввода в ОЭ/ПЭ на 2027 год.',
    'user_draft'
WHERE NOT EXISTS (SELECT 1 FROM exec_initiative WHERE external_code = '100397');

-- ---------- Роль функционального заказчика ----------
INSERT INTO exec_role_assignment (initiative_id, role_code, org_unit_id, status, verification_status, created_by)
SELECT i.id, 'business_customer', (SELECT id FROM org_units WHERE code = 'ДВКиК'), 'active', 'user_draft', 'import:presentation'
FROM exec_initiative i
WHERE i.external_code = '100397'
  AND NOT EXISTS (SELECT 1 FROM exec_role_assignment ra WHERE ra.initiative_id = i.id AND ra.role_code = 'business_customer');

-- ---------- Вехи (outline 1, 2) ----------
INSERT INTO exec_milestone (
    initiative_id, title, milestone_type, plan_date, status,
    outline_code, sort_order, responsible_role,
    verification_status, source_note, source_ref, data_as_of, created_by
)
SELECT i.id, 'Ввод в ОЭ / согласовать требования со стороны ДСИТ и БИБ / Интеграция со смежными системами', 'rollout', '2026-09-30', 'not_started',
       '1', 10, 'РП', 'user_draft', 'Слайд плана инициативы 100397 (100401 и 100397)', 'presentation:slide2b', '2026-09-30', 'import:presentation'
FROM exec_initiative i WHERE i.external_code = '100397'
  AND NOT EXISTS (SELECT 1 FROM exec_milestone m WHERE m.initiative_id = i.id AND m.outline_code = '1');

INSERT INTO exec_milestone (
    initiative_id, title, milestone_type, plan_date, status,
    outline_code, sort_order, responsible_role,
    verification_status, source_note, source_ref, data_as_of, created_by
)
SELECT i.id, 'Установка и настройка дополнительного оборудования для повышения класса критичности системы до МС / Ввод в ПЭ', 'rollout', '2026-10-30', 'not_started',
       '2', 20, 'РП', 'user_draft', 'Слайд плана инициативы 100397 (100401 и 100397)', 'presentation:slide2b', '2026-09-30', 'import:presentation'
FROM exec_initiative i WHERE i.external_code = '100397'
  AND NOT EXISTS (SELECT 1 FROM exec_milestone m WHERE m.initiative_id = i.id AND m.outline_code = '2');

-- Условный сценарий (outline 3) — как в СУРР, не подтверждённый факт
INSERT INTO exec_milestone (
    initiative_id, title, milestone_type, plan_date, status,
    outline_code, sort_order, responsible_role, is_conditional_scenario,
    verification_status, source_note, source_ref, data_as_of, created_by
)
SELECT i.id, 'Возможное прекращение инициативы — требует решения руководителя', 'other', '2026-12-31', 'not_started',
       '3', 30, 'РП', true,
       'user_draft', 'Слайд плана инициативы 100397 — строка «Инициатива прекращена» (номер 3). ПЛАН на слайде, не подтверждённый факт — статус инициативы намеренно оставлен «В работе».',
       'presentation:slide2b', '2026-09-30', 'import:presentation'
FROM exec_initiative i WHERE i.external_code = '100397'
  AND NOT EXISTS (SELECT 1 FROM exec_milestone m WHERE m.initiative_id = i.id AND m.outline_code = '3');

-- ---------- Мероприятия по риску (outline 1.1 и 6) — ДУБЛИРУЮЩИЙСЯ ТЕКСТ ----------
-- Обе строки перенесены как самостоятельные мероприятия (exec_action),
-- не как вехи — по решению владельца кабинета. Требуют проверки.
INSERT INTO exec_action (
    initiative_id, title, description, due_at, status,
    verification_status, source_note, created_by
)
SELECT i.id, 'Мероприятия по устранению риска срыва срока ввода в ОЭ / Перенос вехи (строка 1.1)',
       'Перенесено дословно со слайда плана инициативы 100397, строка с номером 1.1.',
       '2026-09-30', 'not_started',
       'user_draft',
       'ТРЕБУЕТ ПРОВЕРКИ: строка с номером 1.1 текстуально идентична строке с номером 6 на том же слайде («Мероприятия по устранению риска срыва срока ввода в ОЭ / Перенос вехи») — похоже на дублирование в исходной презентации. Перенесено как мероприятие по риску (не веха) до уточнения владельцем.',
       'import:presentation'
FROM exec_initiative i WHERE i.external_code = '100397'
  AND NOT EXISTS (
      SELECT 1 FROM exec_action a WHERE a.initiative_id = i.id AND a.title LIKE '%строка 1.1%'
  );

INSERT INTO exec_action (
    initiative_id, title, description, due_at, status,
    verification_status, source_note, created_by
)
SELECT i.id, 'Мероприятия по устранению риска срыва срока ввода в ОЭ / Перенос вехи (строка 6)',
       'Перенесено дословно со слайда плана инициативы 100397, строка с номером 6 (расположена после строки «Инициатива прекращена», номер 3).',
       NULL, 'not_started',
       'user_draft',
       'ТРЕБУЕТ ПРОВЕРКИ: строка с номером 6 текстуально идентична строке с номером 1.1 на том же слайде — похоже на дублирование в исходной презентации. Дата в источнике для этой строки не читается однозначно. Перенесено как мероприятие по риску (не веха) до уточнения владельцем.',
       'import:presentation'
FROM exec_initiative i WHERE i.external_code = '100397'
  AND NOT EXISTS (
      SELECT 1 FROM exec_action a WHERE a.initiative_id = i.id AND a.title LIKE '%строка 6%'
  );

-- ---------- Риски (отдельный слайд рисков 100397) ----------
INSERT INTO exec_risk (
    initiative_id, description, cause, consequence, qualitative_level, severity_rank,
    category, related_milestone_id, preventive_measures, owner_role, status,
    verification_status, source_note, source_ref, data_as_of, created_by
)
SELECT i.id, 'Найм нового персонала дольше планового срока',
       'Задача/этап: Реализация инициативы (нехватка ресурсов для реализации инициативы)',
       'Срыв сроков работ', 'high', 3,
       'resources', NULL,
       'Подключение к проекту действующих сотрудников за счёт перераспределения задач (повышение приоритета задач проекта для действующих сотрудников)',
       'РП', 'active',
       'user_draft', 'Слайд «Риски по инициативе 100397», строка 1а. Численные вероятность/влияние в источнике не указаны — хранится только качественный уровень.',
       'presentation:slide_risks_100397', '2026-09-30', 'import:presentation'
FROM exec_initiative i WHERE i.external_code = '100397'
  AND NOT EXISTS (SELECT 1 FROM exec_risk r WHERE r.initiative_id = i.id AND r.description = 'Найм нового персонала дольше планового срока');

INSERT INTO exec_risk (
    initiative_id, description, cause, consequence, qualitative_level, severity_rank,
    category, related_milestone_id, preventive_measures, owner_role, status,
    verification_status, source_note, source_ref, data_as_of, created_by
)
SELECT i.id, 'Увеличение ФОТ на персонал',
       'Задача/этап: Реализация инициативы (нехватка ресурсов для реализации инициативы)',
       'Бюджет', 'high', 3,
       'budget', NULL,
       'Мотивация в качестве участия в инновационном проекте',
       'РП', 'active',
       'user_draft', 'Слайд «Риски по инициативе 100397», строка 1б. Численные вероятность/влияние в источнике не указаны.',
       'presentation:slide_risks_100397', '2026-09-30', 'import:presentation'
FROM exec_initiative i WHERE i.external_code = '100397'
  AND NOT EXISTS (SELECT 1 FROM exec_risk r WHERE r.initiative_id = i.id AND r.description = 'Увеличение ФОТ на персонал');

INSERT INTO exec_risk (
    initiative_id, description, cause, consequence, qualitative_level, severity_rank,
    category, related_milestone_id, preventive_measures, owner_role, status,
    verification_status, source_note, source_ref, data_as_of, created_by
)
SELECT i.id, 'Изменение входных данных, требований',
       'Задача/этап: Комплект документов для ввода в ОЭ не зафиксирован — изменения по интеграциям со смежными системами и архитектурой построения',
       'Срыв сроков работ', 'critical', 4,
       'other', (SELECT id FROM exec_milestone WHERE initiative_id = i.id AND outline_code = '1'),
       'Проработка нового решения, нового подхода',
       'РП', 'active',
       'user_draft', 'Слайд «Риски по инициативе 100397», строка 2а.',
       'presentation:slide_risks_100397', '2026-09-30', 'import:presentation'
FROM exec_initiative i WHERE i.external_code = '100397'
  AND NOT EXISTS (SELECT 1 FROM exec_risk r WHERE r.initiative_id = i.id AND r.description = 'Изменение входных данных, требований' AND r.category = 'other');

INSERT INTO exec_risk (
    initiative_id, description, cause, consequence, qualitative_level, severity_rank,
    category, related_milestone_id, preventive_measures, owner_role, status,
    verification_status, source_note, source_ref, data_as_of, created_by
)
SELECT i.id, 'Изменение подхода по интеграциям со смежными системами',
       'Задача/этап: Комплект документов для ввода в ОЭ не зафиксирован — изменения по интеграциям со смежными системами и архитектурой построения',
       'Срыв сроков работ, бюджет', 'critical', 4,
       'integration', (SELECT id FROM exec_milestone WHERE initiative_id = i.id AND outline_code = '1'),
       'Проработка нового решения, нового подхода',
       'РП и команда ИТ', 'active',
       'user_draft', 'Слайд «Риски по инициативе 100397», строка 2б.',
       'presentation:slide_risks_100397', '2026-09-30', 'import:presentation'
FROM exec_initiative i WHERE i.external_code = '100397'
  AND NOT EXISTS (SELECT 1 FROM exec_risk r WHERE r.initiative_id = i.id AND r.description = 'Изменение подхода по интеграциям со смежными системами');

INSERT INTO exec_risk (
    initiative_id, description, cause, consequence, qualitative_level, severity_rank,
    category, related_milestone_id, preventive_measures, owner_role, status,
    verification_status, source_note, source_ref, data_as_of, created_by
)
SELECT i.id, 'Не согласование целевого класса критичности',
       'Задача/этап: Комплект документов для ввода в ОЭ не зафиксирован — изменения по интеграциям со смежными системами и архитектурой построения',
       'Срыв сроков работ, бюджет', 'critical', 4,
       'other', (SELECT id FROM exec_milestone WHERE initiative_id = i.id AND outline_code = '1'),
       'Проработка нового решения, нового подхода',
       'РП и команда ИТ', 'active',
       'user_draft', 'Слайд «Риски по инициативе 100397», строка 2в.',
       'presentation:slide_risks_100397', '2026-09-30', 'import:presentation'
FROM exec_initiative i WHERE i.external_code = '100397'
  AND NOT EXISTS (SELECT 1 FROM exec_risk r WHERE r.initiative_id = i.id AND r.description = 'Не согласование целевого класса критичности');

-- ---------- Бюджет 2026 (план/прогноз) ----------
INSERT INTO exec_budget_version (initiative_id, year, version_label, version_status, note, is_snapshot, snapshot_as_of, source_note, created_by)
SELECT i.id, 2026, '2026 — план (БПК 15-26 от 03.06) и прогноз реализации', 'forecast',
       'Импортировано из слайда «Исполнение бюджета 2026 года инициатив по направлению 8.10 Контроль и аудит». Отклонение 21,7 млн — не реализован бюджет за счёт ФОТ.',
       true, '2026-09-30',
       'Слайд «Исполнение бюджета 2026 года» презентации Блока ВК. План/прогноз на 2026 год, факт исполнения в источнике не приведён.',
       'import:presentation'
FROM exec_initiative i WHERE i.external_code = '100397'
  AND NOT EXISTS (SELECT 1 FROM exec_budget_version bv WHERE bv.initiative_id = i.id AND bv.year = 2026);

INSERT INTO exec_budget_line (version_id, category_id, budget_type, month, amount_plan, amount_forecast, comment)
SELECT bv.id, (SELECT id FROM exec_cost_category WHERE code='equipment'), 'capex', '2026-01-01', 76000000, 63500000, 'CAPEX план 76,00 млн / прогноз 63,50 млн'
FROM exec_budget_version bv JOIN exec_initiative i ON i.id = bv.initiative_id
WHERE i.external_code = '100397' AND bv.year = 2026
  AND NOT EXISTS (SELECT 1 FROM exec_budget_line bl WHERE bl.version_id = bv.id AND bl.budget_type = 'capex');

INSERT INTO exec_budget_line (version_id, category_id, budget_type, month, amount_plan, amount_forecast, comment)
SELECT bv.id, (SELECT id FROM exec_cost_category WHERE code='operations'), 'opex', '2026-01-01', 9700000, 7700000, 'OPEX план 9,70 млн / прогноз 7,70 млн'
FROM exec_budget_version bv JOIN exec_initiative i ON i.id = bv.initiative_id
WHERE i.external_code = '100397' AND bv.year = 2026
  AND NOT EXISTS (SELECT 1 FROM exec_budget_line bl WHERE bl.version_id = bv.id AND bl.budget_type = 'opex');

INSERT INTO exec_budget_line (version_id, category_id, budget_type, month, amount_plan, amount_forecast, comment)
SELECT bv.id, (SELECT id FROM exec_cost_category WHERE code='fot'), 'fot', '2026-01-01', 56500000, 49300000, 'ФОТ план 56,50 млн / прогноз 49,30 млн — основной вклад в отклонение 21,7 млн'
FROM exec_budget_version bv JOIN exec_initiative i ON i.id = bv.initiative_id
WHERE i.external_code = '100397' AND bv.year = 2026
  AND NOT EXISTS (SELECT 1 FROM exec_budget_line bl WHERE bl.version_id = bv.id AND bl.budget_type = 'fot');

-- ---------- Вопросы владельцу ----------
-- 1) Управленческий вопрос — прекращение инициативы
INSERT INTO exec_initiative_decision_request
    (initiative_id, question, question_type, status, source_note, verification_status, created_by)
SELECT i.id,
       'Подтвердить прекращение инициативы 100397 (Скрининг) согласно плану на слайде (31.12.2026), либо пересмотреть срок и основание.',
       'decision', 'open',
       'Слайд плана инициативы 100397, строка «Инициатива прекращена» (номер 3).', 'user_draft', 'import:presentation'
FROM exec_initiative i WHERE i.external_code = '100397'
  AND NOT EXISTS (
      SELECT 1 FROM exec_initiative_decision_request idr WHERE idr.initiative_id = i.id AND idr.question_type = 'decision'
  );

-- 2) Уточнение данных — дублирование строк 1.1 и 6
INSERT INTO exec_initiative_decision_request
    (initiative_id, question, options, question_type, status, source_note, verification_status, created_by)
SELECT i.id,
       'На слайде плана инициативы 100397 строки с номерами 1.1 и 6 содержат идентичный текст «Мероприятия по устранению риска срыва срока ввода в ОЭ / Перенос вехи». Уточнить: это дублирование (техническая ошибка презентации) или две разные по смыслу записи, требующие разных дат и содержания?',
       'Вариант A: строка 6 — дубль строки 1.1, одну из записей нужно удалить.
Вариант B: это разные мероприятия (например, по разным этапам риска), нужно уточнить формулировки и даты каждой.',
       'data_clarification', 'open',
       'Слайд плана инициативы 100397 (совместно с 100401).', 'user_draft', 'import:presentation'
FROM exec_initiative i WHERE i.external_code = '100397'
  AND NOT EXISTS (
      SELECT 1 FROM exec_initiative_decision_request idr
      WHERE idr.initiative_id = i.id AND idr.question_type = 'data_clarification' AND idr.question ILIKE '%1.1 и 6%'
  );
