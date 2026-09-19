-- ============================================================
-- Импорт инициативы 100401 «СУРР» из презентации Блока ВК
-- (эталонная запись для проверки модели, дата среза данных —
-- сентябрь-октябрь 2026, слайды 1, 2 и 5 презентации).
-- Все импортированные записи помечены verification_status='user_draft'
-- и source_note со ссылкой на слайд — требуют подтверждения владельцем.
-- ============================================================

INSERT INTO exec_initiative (
    external_code, title, summary, customer_org_unit_id, portfolio_id,
    status, priority, plan_start, plan_end, data_as_of, source_note,
    verification_status
)
SELECT
    '100401',
    'Автоматизация процессов управления регуляторным риском (СУРР)',
    'Система учёта регуляторного риска (СУРР, IS000359). На дату среза — работы по вводу в ПЭ, устранение замечаний БИБ/ДСИТ, заключение договора на техподдержку с вендором.',
    (SELECT id FROM org_units WHERE code = 'ДВКиК'),
    (SELECT id FROM exec_portfolio WHERE code = 'BLOCK-VK-2026'),
    'in_progress', 'high', '2026-09-01', '2026-12-31', '2026-09-30',
    'Импортировано из презентации «Инициативы по направлению 8.10 Контроль и аудит Блока ВК», слайды 1-2 (дорожная карта) и 5 (риски). Веха «Инициатива прекращена» (31.12.2026) на слайде — это ПЛАН, не подтверждённый факт: статус инициативы намеренно оставлен «В работе», а не «Прекращена», до отдельного решения владельца.',
    'user_draft'
WHERE NOT EXISTS (SELECT 1 FROM exec_initiative WHERE external_code = '100401');

-- ---------- Роль функционального заказчика ----------
INSERT INTO exec_role_assignment (initiative_id, role_code, org_unit_id, status, verification_status, created_by)
SELECT i.id, 'business_customer', (SELECT id FROM org_units WHERE code = 'ДВКиК'), 'active', 'user_draft', 'import:presentation'
FROM exec_initiative i
WHERE i.external_code = '100401'
  AND NOT EXISTS (
      SELECT 1 FROM exec_role_assignment ra WHERE ra.initiative_id = i.id AND ra.role_code = 'business_customer'
  );

-- ---------- Вехи с иерархией (1 -> 1.1, 1.2; 2; 6) ----------
INSERT INTO exec_milestone (
    initiative_id, title, milestone_type, plan_date, status,
    outline_code, sort_order, responsible_role, comment,
    verification_status, source_note, source_ref, data_as_of, created_by
)
SELECT i.id, 'Система учёта регуляторного риска (СУРР) введена в ПЭ (IS000359)', 'rollout', '2026-09-30', 'not_started',
       '1', 10, 'РП', 'Согласование с вендором и смежными службами подхода к решению.',
       'user_draft', 'Слайд 2 презентации Блока ВК, инициатива 100401', 'presentation:slide2', '2026-09-30', 'import:presentation'
FROM exec_initiative i WHERE i.external_code = '100401'
  AND NOT EXISTS (SELECT 1 FROM exec_milestone m WHERE m.initiative_id = i.id AND m.outline_code = '1');

INSERT INTO exec_milestone (
    initiative_id, title, milestone_type, plan_date, status,
    outline_code, sort_order, responsible_role, parent_milestone_id,
    verification_status, source_note, source_ref, data_as_of, created_by
)
SELECT i.id, 'Устранены замечания БИБ, ДСИТ', 'other', '2026-10-30', 'not_started',
       '1.1', 11, 'РП', (SELECT id FROM exec_milestone WHERE initiative_id = i.id AND outline_code = '1'),
       'user_draft', 'Слайд 2 презентации Блока ВК, инициатива 100401', 'presentation:slide2', '2026-09-30', 'import:presentation'
FROM exec_initiative i WHERE i.external_code = '100401'
  AND NOT EXISTS (SELECT 1 FROM exec_milestone m WHERE m.initiative_id = i.id AND m.outline_code = '1.1');

INSERT INTO exec_milestone (
    initiative_id, title, milestone_type, plan_date, status,
    outline_code, sort_order, responsible_role, parent_milestone_id,
    verification_status, source_note, source_ref, data_as_of, created_by
)
SELECT i.id, 'Утверждён приказ о переносе срока ОЭ', 'approval', '2026-10-30', 'not_started',
       '1.2', 12, 'РП', (SELECT id FROM exec_milestone WHERE initiative_id = i.id AND outline_code = '1'),
       'user_draft', 'Слайд 2 презентации Блока ВК, инициатива 100401', 'presentation:slide2', '2026-09-30', 'import:presentation'
FROM exec_initiative i WHERE i.external_code = '100401'
  AND NOT EXISTS (SELECT 1 FROM exec_milestone m WHERE m.initiative_id = i.id AND m.outline_code = '1.2');

INSERT INTO exec_milestone (
    initiative_id, title, milestone_type, plan_date, status,
    outline_code, sort_order, responsible_role,
    verification_status, source_note, source_ref, data_as_of, created_by
)
SELECT i.id, 'Заключён договор с вендором на техническую поддержку ИС СУРР (IS000359)', 'other', '2026-10-30', 'not_started',
       '2', 20, 'РП',
       'user_draft', 'Слайд 2 презентации Блока ВК, инициатива 100401', 'presentation:slide2', '2026-09-30', 'import:presentation'
FROM exec_initiative i WHERE i.external_code = '100401'
  AND NOT EXISTS (SELECT 1 FROM exec_milestone m WHERE m.initiative_id = i.id AND m.outline_code = '2');

INSERT INTO exec_milestone (
    initiative_id, title, milestone_type, plan_date, status,
    outline_code, sort_order, responsible_role,
    verification_status, source_note, source_ref, data_as_of, created_by
)
SELECT i.id, 'Инициатива прекращена (план на слайде, требует подтверждения)', 'other', '2026-12-31', 'not_started',
       '6', 60, 'РП',
       'user_draft', 'Слайд 2 презентации Блока ВК, инициатива 100401 — веха отражает ПЛАН прекращения, не факт. Статус самой инициативы не менялся автоматически.', 'presentation:slide2', '2026-09-30', 'import:presentation'
FROM exec_initiative i WHERE i.external_code = '100401'
  AND NOT EXISTS (SELECT 1 FROM exec_milestone m WHERE m.initiative_id = i.id AND m.outline_code = '6');

-- ---------- Риски (слайд 5) ----------
-- Риск 1 (основной, привязан к веха 1.1): критичный
INSERT INTO exec_risk (
    initiative_id, description, cause, consequence, probability, impact,
    category, related_milestone_id, preventive_measures, owner_role, status,
    verification_status, source_note, source_ref, data_as_of, created_by
)
SELECT i.id, 'Изменение входных данных, требований',
       'Не устранение вендором тех.долга с 2025 года на платформе ФИС в рамках инициативы 100416 New Collection System',
       'Срыв сроков работ', 4, 4,
       'integration', (SELECT id FROM exec_milestone WHERE initiative_id = i.id AND outline_code = '1.1'),
       'Согласование с вендором и смежными службами подхода к урегулированию требований (тестирование ролевой модели БИБ — выявление требований к донастройке).',
       'ОМ, РП', 'active',
       'user_draft', 'Слайд 5 презентации, риски инициативы 100401, строка 1. Числовые вероятность/влияние не указаны в источнике — подобраны для соответствия качественному уровню «Критичный», требуют подтверждения владельцем.',
       'presentation:slide5', '2026-09-30', 'import:presentation'
FROM exec_initiative i WHERE i.external_code = '100401'
  AND NOT EXISTS (
      SELECT 1 FROM exec_risk r WHERE r.initiative_id = i.id AND r.description = 'Изменение входных данных, требований'
  );

-- Риск 1б (вторая строка под тем же мероприятием на слайде — читается неоднозначно)
INSERT INTO exec_risk (
    initiative_id, description, consequence, probability, impact,
    category, related_milestone_id, status,
    verification_status, source_note, source_ref, data_as_of, created_by
)
SELECT i.id, 'Срыв срока', 'Бюджет', 5, 2,
       'schedule', (SELECT id FROM exec_milestone WHERE initiative_id = i.id AND outline_code = '1.1'), 'active',
       'user_draft', 'ТРЕБУЕТ ПРОВЕРКИ: вторая строка риска на слайде 5 (под мероприятием «Устранения замечаний ДСИТ и БИБ») читается неоднозначно — заполнены не все столбцы. Перенесено как отдельный риск с пометкой на проверку.',
       'presentation:slide5', '2026-09-30', 'import:presentation'
FROM exec_initiative i WHERE i.external_code = '100401'
  AND NOT EXISTS (
      SELECT 1 FROM exec_risk r WHERE r.initiative_id = i.id AND r.description = 'Срыв срока' AND r.related_milestone_id =
          (SELECT id FROM exec_milestone WHERE initiative_id = i.id AND outline_code = '1.1')
  );

-- Риск 2 (основной, привязан к веха 2): высокий
INSERT INTO exec_risk (
    initiative_id, description, cause, consequence, probability, impact,
    category, related_milestone_id, preventive_measures, owner_role, status,
    verification_status, source_note, source_ref, data_as_of, created_by
)
SELECT i.id, 'Заключение договора дольше планового срока',
       'Устранение / доработка функциональности вендором на платформе ФИС в рамках установленного ПО',
       'Недоработка ПО функциональности вендором в рамках договора тех.поддержки', 4, 3,
       'schedule', (SELECT id FROM exec_milestone WHERE initiative_id = i.id AND outline_code = '2'),
       'Ускорение процедуры заключения договора', 'РП, ТРП', 'active',
       'user_draft', 'Слайд 5 презентации, риски инициативы 100401, строка 2. Числовые вероятность/влияние не указаны в источнике — подобраны для соответствия качественному уровню «Высокий», требуют подтверждения владельцем.',
       'presentation:slide5', '2026-09-30', 'import:presentation'
FROM exec_initiative i WHERE i.external_code = '100401'
  AND NOT EXISTS (
      SELECT 1 FROM exec_risk r WHERE r.initiative_id = i.id AND r.description = 'Заключение договора дольше планового срока'
  );

-- Риск 2б (вторая строка под тем же мероприятием — читается неоднозначно)
INSERT INTO exec_risk (
    initiative_id, description, consequence, probability, impact,
    category, related_milestone_id, status,
    verification_status, source_note, source_ref, data_as_of, created_by
)
SELECT i.id, 'Срыв срока', 'Бюджет', 4, 3,
       'schedule', (SELECT id FROM exec_milestone WHERE initiative_id = i.id AND outline_code = '2'), 'active',
       'user_draft', 'ТРЕБУЕТ ПРОВЕРКИ: вторая строка риска на слайде 5 (под мероприятием «Заключение договора с вендором») читается неоднозначно. Перенесено как отдельный риск с пометкой на проверку.',
       'presentation:slide5', '2026-09-30', 'import:presentation'
FROM exec_initiative i WHERE i.external_code = '100401'
  AND NOT EXISTS (
      SELECT 1 FROM exec_risk r WHERE r.initiative_id = i.id AND r.description = 'Срыв срока' AND r.related_milestone_id =
          (SELECT id FROM exec_milestone WHERE initiative_id = i.id AND outline_code = '2')
  );

-- ---------- Требует решения руководителя ----------
INSERT INTO exec_initiative_decision_request (
    initiative_id, question, due_at, consequence_if_not_decided, status,
    source_note, verification_status, created_by
)
SELECT i.id,
       'Подтвердить прекращение инициативы 100401 (СУРР) к 31.12.2026 согласно плану на слайде, либо пересмотреть срок и основание.',
       '2026-11-30',
       'Веха «Инициатива прекращена» наступит по плану 31.12.2026 без формального решения руководителя — статус инициативы останется неопределённым.',
       'open',
       'Основано на веха 6 «Инициатива прекращена» слайда 100401 презентации Блока ВК — сама веха ещё не наступила, требует подтверждения РП.',
       'user_draft', 'import:presentation'
FROM exec_initiative i WHERE i.external_code = '100401'
  AND NOT EXISTS (SELECT 1 FROM exec_initiative_decision_request d WHERE d.initiative_id = i.id);
