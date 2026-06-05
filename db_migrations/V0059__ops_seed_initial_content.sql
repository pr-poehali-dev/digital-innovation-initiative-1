INSERT INTO t_p61016064_digital_innovation_i.admin_errors
  (title, fingerprint, module_slug, source, environment, severity, status, occurrences_count, details, owner_email, created_by, updated_by)
VALUES
('401 on action=me for anonymous session',
 'auth_401_anon_me', 'admin-dashboard', '/backend/admin-auth', 'production',
 'low', 'muted', 47,
 'Anonymous frontend calls ?action=me on load. Expected 401 — no action needed.',
 'ops@project', 'seed', 'seed'),

('Admin API save failure on hq_blocks',
 'hq_save_fail', 'hq', '/backend/hq', 'production',
 'high', 'resolved', 3,
 'SQL interpolation error on old PUT handler. Fixed by parameterized queries.',
 'platform@project', 'seed', 'seed'),

('Passport load timeout',
 'passport_timeout', 'passport', '/backend/passport', 'production',
 'medium', 'investigating', 2,
 'Occasional slow response on ?action=all when entities count is high.',
 'platform@project', 'seed', 'seed');

INSERT INTO t_p61016064_digital_innovation_i.admin_alerts
  (name, module_slug, condition_text, threshold_value, window_minutes, severity, status, channel, owner_email, notes, created_by, updated_by)
VALUES
('5xx spike', 'admin-dashboard', 'HTTP 5xx responses > threshold per window', '10', 5, 'critical', 'active', 'email', 'ops@project', 'Requires immediate investigation', 'seed', 'seed'),
('401/403 flood', 'admin-dashboard', '4xx auth errors > threshold per window', '50', 10, 'high', 'active', 'email', 'ops@project', 'May indicate brute-force or broken token', 'seed', 'seed'),
('HQ save errors', 'hq', 'Failed PUT /hq > threshold per window', '3', 15, 'medium', 'active', 'email', 'platform@project', '', 'seed', 'seed'),
('Passport all slow', 'passport', 'GET ?action=all > 3s response time', '3s', 30, 'medium', 'active', '', 'platform@project', 'Triggered during seed stress test', 'seed', 'seed');

INSERT INTO t_p61016064_digital_innovation_i.admin_feature_flags
  (key, name, description, environment, enabled, rollout_percent, owner_email, status, notes, created_by, updated_by)
VALUES
('admin_dashboard_grouped_cards', 'Grouped Dashboard Cards',   'Карточки дашборда разделены на Platform / Operations / Users — новый Command Center layout', 'production', true,  100, 'platform@project', 'active', 'Shipped in W3.1', 'seed', 'seed'),
('admin_project_enabled',         'Project Architecture Map',  'Страница /admin/project — архитектурная карта as-is/to-be/waves', 'production', true,  100, 'platform@project', 'active', 'Shipped in W1', 'seed', 'seed'),
('admin_passport_enabled',        'Platform Passport',         'Страница /admin/passport — реестр модулей, сущностей и owners', 'production', true,  100, 'platform@project', 'active', 'Shipped in W2', 'seed', 'seed'),
('unified_ai_context',            'Unified AI Context',        'Единый AI context из HQ + Project + Passport — агрегирует все три источника', 'production', false, 0,   'platform@project', 'planned', 'W4 task', 'seed', 'seed'),
('admin_errors_module',           'Errors Module',             'Страница /admin/errors — реестр ошибок платформы', 'production', true,  100, 'ops@project', 'active', 'Shipped in W3.1', 'seed', 'seed'),
('admin_alerts_module',           'Alerts Module',             'Страница /admin/alerts — правила мониторинга', 'production', true,  100, 'ops@project', 'active', 'Shipped in W3.1', 'seed', 'seed');
