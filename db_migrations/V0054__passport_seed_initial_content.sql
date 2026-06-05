-- ── Modules (12 канонических) ────────────────────────────────────────────────
INSERT INTO t_p61016064_digital_innovation_i.passport_modules
  (name, slug, category, layer, description, status, owner_email, primary_route, source_of_truth, created_by, updated_by)
VALUES
('Admin Dashboard',      'admin-dashboard', 'platform',   'admin', 'Главный экран админки — точка входа, обзор состояния, быстрые ссылки',                               'active',  '', '/admin',          'AdminDashboard.tsx', 'seed', 'seed'),
('Project HQ',           'hq',              'platform',   'admin', 'Единый источник стратегической памяти: видение, миссия, правила, решения, риски, идеи, AI-контекст',  'active',  '', '/admin/hq',       'hq_blocks + hq_goals + hq_decisions + hq_risks + hq_rules + hq_ideas', 'seed', 'seed'),
('Plan',                 'plan',            'platform',   'admin', 'Планирование спринтов, backlog, задачи, статусы, прогресс',                                           'active',  '', '/admin/plan',     'AdminPlanPage.tsx (hardcoded, нужна миграция в БД)', 'seed', 'seed'),
('Project / Architecture','project',        'platform',   'admin', 'Архитектурная карта: as-is, to-be, gaps, conflicts, decisions, waves',                                'active',  '', '/admin/project',  'project_sections + project_gaps + project_decisions + project_waves', 'seed', 'seed'),
('Platform Passport',    'passport',        'platform',   'admin', 'Реестр модулей, сущностей, owners, связей, overlaps — инвентаризация платформы',                     'active',  '', '/admin/passport', 'passport_modules + passport_entities + passport_routes', 'seed', 'seed'),
('Errors / Logs',        'errors',          'operations', 'admin', 'Просмотр ошибок, логов, исключений платформы',                                                        'planned', '', '/admin/errors',   '', 'seed', 'seed'),
('Feature Flags',        'feature-flags',   'operations', 'admin', 'Управление фич-флагами и A/B-тестами',                                                                'planned', '', '/admin/flags',    '', 'seed', 'seed'),
('Alerts',               'alerts',          'operations', 'admin', 'Алерты и подсказки системы, состояние инфраструктуры',                                                'planned', '', '/admin/alerts',   '', 'seed', 'seed'),
('Tickets / Support',    'tickets',         'support',    'admin', 'Тикетная система, заявки пользователей, очередь поддержки',                                           'planned', '', '/admin/tickets',  '', 'seed', 'seed'),
('Communications',       'communications',  'content',    'admin', 'Рассылки, push-уведомления, email-кампании',                                                          'planned', '', '/admin/comms',    '', 'seed', 'seed'),
('Content',              'content',         'content',    'admin', 'Управление контентом: блог, баннеры, страницы, медиа',                                                 'planned', '', '/admin/content',  '', 'seed', 'seed'),
('Analytics / Funnel',   'analytics',       'analytics',  'admin', 'Аналитика, воронка, конверсии, трафик, пользовательские события',                                     'planned', '', '/admin/analytics','', 'seed', 'seed');

-- ── Routes ────────────────────────────────────────────────────────────────────
INSERT INTO t_p61016064_digital_innovation_i.passport_routes
  (module_id, title, route, route_type, status, created_by, updated_by)
SELECT id, 'Admin Dashboard', '/admin', 'page', 'active', 'seed', 'seed'
FROM t_p61016064_digital_innovation_i.passport_modules WHERE slug = 'admin-dashboard';

INSERT INTO t_p61016064_digital_innovation_i.passport_routes
  (module_id, title, route, route_type, status, created_by, updated_by)
SELECT id, 'Project HQ', '/admin/hq', 'page', 'active', 'seed', 'seed'
FROM t_p61016064_digital_innovation_i.passport_modules WHERE slug = 'hq';

INSERT INTO t_p61016064_digital_innovation_i.passport_routes
  (module_id, title, route, route_type, status, created_by, updated_by)
SELECT id, 'Plan', '/admin/plan', 'page', 'active', 'seed', 'seed'
FROM t_p61016064_digital_innovation_i.passport_modules WHERE slug = 'plan';

INSERT INTO t_p61016064_digital_innovation_i.passport_routes
  (module_id, title, route, route_type, status, created_by, updated_by)
SELECT id, 'Architecture Map', '/admin/project', 'page', 'active', 'seed', 'seed'
FROM t_p61016064_digital_innovation_i.passport_modules WHERE slug = 'project';

INSERT INTO t_p61016064_digital_innovation_i.passport_routes
  (module_id, title, route, route_type, status, created_by, updated_by)
SELECT id, 'Platform Passport', '/admin/passport', 'page', 'active', 'seed', 'seed'
FROM t_p61016064_digital_innovation_i.passport_modules WHERE slug = 'passport';

-- ── Entities (14 канонических) ────────────────────────────────────────────────
INSERT INTO t_p61016064_digital_innovation_i.passport_entities
  (name, kind, description, module_id, source_of_truth_module_id, owner_email, status, created_by, updated_by)
SELECT 'hq_block', 'system',
  'Текстовые блоки HQ: видение, миссия, фокус, размышления',
  hq.id, hq.id, '', 'active', 'seed', 'seed'
FROM t_p61016064_digital_innovation_i.passport_modules hq WHERE hq.slug = 'hq';

INSERT INTO t_p61016064_digital_innovation_i.passport_entities
  (name, kind, description, module_id, source_of_truth_module_id, owner_email, status, created_by, updated_by)
SELECT 'strategic_goal', 'business',
  'Стратегические цели проекта с горизонтом и критерием успеха',
  hq.id, hq.id, '', 'active', 'seed', 'seed'
FROM t_p61016064_digital_innovation_i.passport_modules hq WHERE hq.slug = 'hq';

INSERT INTO t_p61016064_digital_innovation_i.passport_entities
  (name, kind, description, module_id, source_of_truth_module_id, owner_email, status, created_by, updated_by)
SELECT 'project_rule', 'business',
  'Правила проекта по категориям: UX, архитектура, данные, релизы, AI',
  hq.id, hq.id, '', 'active', 'seed', 'seed'
FROM t_p61016064_digital_innovation_i.passport_modules hq WHERE hq.slug = 'hq';

INSERT INTO t_p61016064_digital_innovation_i.passport_entities
  (name, kind, description, module_id, source_of_truth_module_id, owner_email, status, created_by, updated_by)
SELECT 'project_decision', 'business',
  'Записи журнала решений из HQ',
  hq.id, hq.id, '', 'active', 'seed', 'seed'
FROM t_p61016064_digital_innovation_i.passport_modules hq WHERE hq.slug = 'hq';

INSERT INTO t_p61016064_digital_innovation_i.passport_entities
  (name, kind, description, module_id, source_of_truth_module_id, owner_email, status, created_by, updated_by)
SELECT 'project_risk', 'business',
  'Риски и ограничения проекта',
  hq.id, hq.id, '', 'active', 'seed', 'seed'
FROM t_p61016064_digital_innovation_i.passport_modules hq WHERE hq.slug = 'hq';

INSERT INTO t_p61016064_digital_innovation_i.passport_entities
  (name, kind, description, module_id, source_of_truth_module_id, owner_email, status, created_by, updated_by)
SELECT 'project_idea', 'business',
  'Идеи / Parking lot из HQ',
  hq.id, hq.id, '', 'active', 'seed', 'seed'
FROM t_p61016064_digital_innovation_i.passport_modules hq WHERE hq.slug = 'hq';

INSERT INTO t_p61016064_digital_innovation_i.passport_entities
  (name, kind, description, module_id, source_of_truth_module_id, owner_email, status, created_by, updated_by)
SELECT 'project_wave', 'system',
  'Волна изменений с задачами — из Architecture Map',
  pr.id, pr.id, '', 'active', 'seed', 'seed'
FROM t_p61016064_digital_innovation_i.passport_modules pr WHERE pr.slug = 'project';

INSERT INTO t_p61016064_digital_innovation_i.passport_entities
  (name, kind, description, module_id, source_of_truth_module_id, owner_email, status, created_by, updated_by)
SELECT 'project_gap', 'system',
  'Разрывы и конфликты архитектуры — из Architecture Map',
  pr.id, pr.id, '', 'active', 'seed', 'seed'
FROM t_p61016064_digital_innovation_i.passport_modules pr WHERE pr.slug = 'project';

INSERT INTO t_p61016064_digital_innovation_i.passport_entities
  (name, kind, description, module_id, source_of_truth_module_id, owner_email, status, created_by, updated_by)
SELECT 'passport_module', 'system',
  'Модуль платформы — запись Passport',
  pp.id, pp.id, '', 'active', 'seed', 'seed'
FROM t_p61016064_digital_innovation_i.passport_modules pp WHERE pp.slug = 'passport';

INSERT INTO t_p61016064_digital_innovation_i.passport_entities
  (name, kind, description, module_id, source_of_truth_module_id, owner_email, status, created_by, updated_by)
SELECT 'passport_entity', 'system',
  'Бизнес / системная сущность платформы — запись Passport',
  pp.id, pp.id, '', 'active', 'seed', 'seed'
FROM t_p61016064_digital_innovation_i.passport_modules pp WHERE pp.slug = 'passport';

INSERT INTO t_p61016064_digital_innovation_i.passport_entities
  (name, kind, description, module_id, source_of_truth_module_id, owner_email, status, created_by, updated_by)
SELECT 'admin_session', 'system',
  'Сессия авторизованного админа — таблица admin_sessions',
  dash.id, dash.id, '', 'active', 'seed', 'seed'
FROM t_p61016064_digital_innovation_i.passport_modules dash WHERE dash.slug = 'admin-dashboard';

INSERT INTO t_p61016064_digital_innovation_i.passport_entities
  (name, kind, description, module_id, source_of_truth_module_id, owner_email, status, created_by, updated_by)
VALUES ('feature_flag', 'system', 'Фич-флаги для управления функциональностью', NULL, NULL, '', 'planned', 'seed', 'seed');

INSERT INTO t_p61016064_digital_innovation_i.passport_entities
  (name, kind, description, module_id, source_of_truth_module_id, owner_email, status, created_by, updated_by)
VALUES ('support_ticket', 'support', 'Тикет поддержки пользователя', NULL, NULL, '', 'planned', 'seed', 'seed');

INSERT INTO t_p61016064_digital_innovation_i.passport_entities
  (name, kind, description, module_id, source_of_truth_module_id, owner_email, status, created_by, updated_by)
VALUES ('funnel_event', 'analytics', 'Событие воронки / конверсионного пути пользователя', NULL, NULL, '', 'planned', 'seed', 'seed');

-- ── Overlaps ──────────────────────────────────────────────────────────────────
INSERT INTO t_p61016064_digital_innovation_i.passport_overlaps
  (overlap_type, status, title, description, related_module_id, created_by, updated_by)
VALUES
('missing_owner', 'open',
 'Большинство модулей не имеют зафиксированного owner',
 'Owner не заполнен для 10+ модулей. Это мешает сопровождению и распределению ответственности. Нужно пройти по всем модулям и проставить owner_email.',
 NULL, 'seed', 'seed'),

('missing_owner', 'open',
 'Большинство сущностей не имеют указанного source of truth',
 '9 из 14 сущностей не имеют привязанного source_of_truth_module_id. Это означает, что непонятно откуда брать данные для AI-контекста и сводки.',
 NULL, 'seed', 'seed'),

('unclear_boundary', 'open',
 'Карточки Platform и Operations смешаны на дашборде без группировки',
 'На /admin все модули сейчас выглядят одинаково — и системные (HQ, Project, Passport), и операционные (Errors, Flags). Нужно разделить их по группам.',
 NULL, 'seed', 'seed'),

('duplicate', 'open',
 'AI context пока не объединён из HQ + Project + Passport',
 'Сейчас у каждого раздела своя кнопка «Контекст для AI» с частичными данными. Нужен единый unified AI context, который агрегирует все три источника.',
 NULL, 'seed', 'seed'),

('duplicate', 'resolved',
 'Параллельная strategy-страница как второй источник правды',
 'Закрыто: /admin/strategy редиректит в /admin/hq.',
 NULL, 'seed', 'seed');

-- ── Passport notes ────────────────────────────────────────────────────────────
UPDATE t_p61016064_digital_innovation_i.passport_notes
SET content = 'Passport — это реестр платформы, а не стратегия и не план.

Правило разграничения:
• HQ = зачем и по каким правилам мы это строим
• Project = как меняется архитектура (as-is → to-be)
• Passport = что вообще есть и кто за это отвечает
• Plan = что делаем и когда

Приоритеты нормализации:
1. Заполнить owner_email у всех модулей
2. Заполнить source_of_truth у всех сущностей
3. Привязать все routes к модулям
4. Закрыть overlaps через конкретные решения

Acceptance criteria Passport:
- Все P0-модули имеют owner
- Все core-сущности имеют SOT
- Нет анонимных routes
- Overlaps закрываются через решения, а не просто помечаются',
    updated_at = NOW(), updated_by = 'seed'
WHERE id = 1;
