-- Vendors
INSERT INTO solution_vendors (slug, name, summary, website_url, status, sort_order, source_note) VALUES
('acme-flow','Acme Flow','Разработчик BPM и workflow-платформы','https://example.com/acme','active',10,'curated starter set'),
('docuwise','DocuWise','Вендор ECM и интеллектуальной обработки документов','https://example.com/docuwise','active',20,'curated starter set'),
('knowlink','KnowLink','Платформа управления знаниями и поиска','https://example.com/knowlink','active',30,'curated starter set'),
('insightgrid','InsightGrid','BI и аналитика процессов','https://example.com/insightgrid','active',40,'curated starter set'),
('guardline','GuardLine','Комплаенс и скоринг для контроля рисков','https://example.com/guardline','active',50,'curated starter set'),
('servicedesk-pro','ServiceDesk Pro','Кейс-менеджмент и портал самообслуживания','https://example.com/sdpro','active',60,'curated starter set')
ON CONFLICT (slug) DO NOTHING;

-- Products
INSERT INTO solution_products (vendor_id, slug, name, category, summary, deployment_types, website_url, status, sort_order, source_note)
SELECT v.id, x.slug, x.name, x.category, x.summary, x.depl, x.url, 'active', x.ord, 'curated starter set'
FROM (VALUES
  ('acme-flow','acme-flow-bpm','Acme Flow BPM','BPM/workflow','Оркестрация процессов и маршрутизация задач', ARRAY['cloud','hybrid'], 'https://example.com/acme-bpm', 10),
  ('docuwise','docuwise-ecm','DocuWise ECM','ECM/СЭД','Хранение документов и извлечение данных', ARRAY['cloud','on_prem','hybrid'], 'https://example.com/docuwise-ecm', 20),
  ('knowlink','knowlink-platform','KnowLink Platform','Knowledge management','База знаний и семантический поиск', ARRAY['cloud'], 'https://example.com/knowlink', 30),
  ('insightgrid','insightgrid-analytics','InsightGrid Analytics','BI/analytics','Дашборды и аналитика процессов', ARRAY['cloud','on_prem'], 'https://example.com/insightgrid', 40),
  ('guardline','guardline-suite','GuardLine Suite','GRC/regtech','Скоринг и скрининг с контрольными точками', ARRAY['on_prem','hybrid'], 'https://example.com/guardline', 50),
  ('servicedesk-pro','servicedesk-pro-csm','ServiceDesk Pro CSM','Case management','Кейс-менеджмент и самообслуживание', ARRAY['cloud','hybrid'], 'https://example.com/sdpro', 60)
) AS x(vendor_slug, slug, name, category, summary, depl, url, ord)
JOIN solution_vendors v ON v.slug = x.vendor_slug
ON CONFLICT (slug) DO NOTHING;

-- Modules
INSERT INTO solution_product_modules (product_id, slug, name, category, summary, status, sort_order, source_note)
SELECT p.id, x.slug, x.name, x.category, x.summary, 'active', x.ord, 'curated starter set'
FROM (VALUES
  ('acme-flow-bpm','acme-flow-routing','Acme Flow Routing','route','Маршрутизация задач и приоритетные очереди',10),
  ('acme-flow-bpm','acme-flow-rules','Acme Flow Rules','decide','Движок бизнес-правил и автоматические решения',20),
  ('acme-flow-bpm','acme-flow-sla','Acme Flow SLA','monitor','Контроль сроков и эскалации',30),
  ('acme-flow-bpm','acme-flow-notify','Acme Flow Notify','collaborate','Уведомления и оповещения участников',40),
  ('docuwise-ecm','docuwise-capture','DocuWise Capture','capture','Приём и захват входящих документов',10),
  ('docuwise-ecm','docuwise-ocr','DocuWise OCR','capture','Распознавание и извлечение полей из документов',20),
  ('docuwise-ecm','docuwise-docgen','DocuWise DocGen','generate','Генерация документов по шаблонам',30),
  ('docuwise-ecm','docuwise-audit','DocuWise Audit','monitor','Журналирование действий и аудит',40),
  ('knowlink-platform','knowlink-search','KnowLink Search','retrieve','Семантический поиск по знаниям',10),
  ('knowlink-platform','knowlink-base','KnowLink Base','retrieve','Структурированная база знаний',20),
  ('knowlink-platform','knowlink-copilot','KnowLink Copilot','generate','Черновики ответов на базе знаний',30),
  ('insightgrid-analytics','insightgrid-dashboards','InsightGrid Dashboards','analyze','Дашборды показателей процесса',10),
  ('insightgrid-analytics','insightgrid-classify','InsightGrid Classify','classify','Классификация и типизация обращений',20),
  ('guardline-suite','guardline-scoring','GuardLine Scoring','decide','Скоринг и скрининг объектов',10),
  ('guardline-suite','guardline-rules','GuardLine Rules','decide','Правила комплаенс-контроля',20),
  ('guardline-suite','guardline-audit','GuardLine Audit','monitor','Неизменяемый журнал контроля',30),
  ('servicedesk-pro-csm','sdpro-cases','ServiceDesk Cases','decide','Ведение кейсов от приёма до закрытия',10),
  ('servicedesk-pro-csm','sdpro-portal','ServiceDesk Portal','collaborate','Портал самообслуживания и уведомления',20)
) AS x(product_slug, slug, name, category, summary, ord)
JOIN solution_products p ON p.slug = x.product_slug
ON CONFLICT (slug) DO NOTHING;

-- Module <-> capability map
INSERT INTO solution_module_capability_map (module_id, capability_id, coverage_level, source_note)
SELECT m.id, c.id, x.cov, 'curated starter set'
FROM (VALUES
  ('acme-flow-routing','workflow-routing','core'),
  ('acme-flow-rules','rules-engine','core'),
  ('acme-flow-rules','screening-scoring','supporting'),
  ('acme-flow-sla','sla-tracking','core'),
  ('acme-flow-notify','notifications','core'),
  ('docuwise-capture','data-capture','core'),
  ('docuwise-ocr','ocr-idp','core'),
  ('docuwise-ocr','data-capture','supporting'),
  ('docuwise-docgen','document-generation','core'),
  ('docuwise-audit','audit-logging','core'),
  ('knowlink-search','knowledge-retrieval','core'),
  ('knowlink-base','knowledge-retrieval','supporting'),
  ('knowlink-copilot','document-generation','supporting'),
  ('insightgrid-dashboards','analytics-dashboards','core'),
  ('insightgrid-classify','classification','core'),
  ('guardline-scoring','screening-scoring','core'),
  ('guardline-rules','rules-engine','supporting'),
  ('guardline-audit','audit-logging','supporting'),
  ('sdpro-cases','case-management','core'),
  ('sdpro-cases','workflow-routing','limited'),
  ('sdpro-portal','collaboration','core'),
  ('sdpro-portal','notifications','supporting')
) AS x(module_slug, capability_slug, cov)
JOIN solution_product_modules m ON m.slug = x.module_slug
JOIN solution_capabilities c ON c.slug = x.capability_slug
ON CONFLICT (module_id, capability_id) DO NOTHING;