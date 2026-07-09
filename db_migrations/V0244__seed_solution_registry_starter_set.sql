-- Curated starter set: practices
INSERT INTO solution_practices (slug, name, category, summary, is_digital, status, sort_order, source_note) VALUES
('single-intake-channel','Единый канал приёма','intake','Свести все входящие обращения в одну точку приёма вместо разрозненных каналов',true,'active',10,'curated starter set'),
('request-typification','Типизация обращений','intake','Классифицировать входящие по типам для маршрутизации и SLA',true,'active',20,'curated starter set'),
('intake-checklists','Чек-листы приёма','intake','Стандартные чек-листы полноты входящих данных на входе',false,'active',30,'curated starter set'),
('rule-based-routing','Маршрутизация по правилам','routing','Автоматическое назначение исполнителя по формальным правилам',true,'active',40,'curated starter set'),
('priority-queue','Приоритетная очередь','routing','Единая очередь с приоритетами вместо ручного распределения',true,'active',50,'curated starter set'),
('data-validation-at-source','Валидация данных на входе','validation','Проверять корректность и полноту данных в момент ввода',true,'active',60,'curated starter set'),
('two-level-control','Двухуровневый контроль','validation','Второй контроль качества для критичных операций',false,'active',70,'curated starter set'),
('approval-workflow','Регламент согласований','approvals','Формализованный маршрут согласований с ролями и сроками',true,'active',80,'curated starter set'),
('parallel-approvals','Параллельные согласования','approvals','Одновременное согласование вместо последовательного',true,'active',90,'curated starter set'),
('knowledge-base','База знаний','knowledge','Единая структурированная база знаний по типовым кейсам',true,'active',100,'curated starter set'),
('response-templates','Шаблоны ответов','knowledge','Стандартные шаблоны для типовых ответов и документов',true,'active',110,'curated starter set'),
('document-standardization','Стандартизация документов','document handling','Единые формы и шаблоны исходящих документов',true,'active',120,'curated starter set'),
('document-digitization','Оцифровка документов','document handling','Перевод бумажных и сканов в структурированный вид',true,'active',130,'curated starter set'),
('sla-monitoring','SLA-мониторинг','monitoring','Контроль сроков и уведомления о приближении дедлайна',true,'active',140,'curated starter set'),
('process-dashboards','Дашборды процесса','monitoring','Оперативная визуализация состояния очереди и нагрузки',true,'active',150,'curated starter set'),
('audit-trail','Журнал аудита','compliance','Полный неизменяемый след действий для проверок',true,'active',160,'curated starter set'),
('compliance-checkpoints','Контрольные точки комплаенса','compliance','Обязательные проверки на регуляторные требования',false,'active',170,'curated starter set'),
('self-service-portal','Портал самообслуживания','self-service','Клиент или сотрудник решает типовые задачи без оператора',true,'active',180,'curated starter set'),
('shared-service-center','Центр общих сервисов','shared services','Централизация однотипных операций в общий центр',false,'active',190,'curated starter set'),
('escalation-rules','Правила эскалации','routing','Автоэскалация при нарушении сроков или сложных кейсах',true,'active',200,'curated starter set')
ON CONFLICT (slug) DO NOTHING;

-- Curated starter set: capabilities
INSERT INTO solution_capabilities (slug, name, category, description, status, sort_order, source_note) VALUES
('data-capture','Захват данных','capture','Приём и фиксация входящих данных из разных каналов','active',10,'curated starter set'),
('ocr-idp','OCR и извлечение из документов','capture','Распознавание текста и извлечение полей из документов и сканов','active',20,'curated starter set'),
('classification','Классификация','classify','Автоматическое отнесение объекта к категории или типу','active',30,'curated starter set'),
('workflow-routing','Маршрутизация процессов','route','Назначение задач и маршрутов по правилам','active',40,'curated starter set'),
('rules-engine','Движок правил','decide','Исполнение бизнес-правил для автоматических решений','active',50,'curated starter set'),
('case-management','Управление кейсами','decide','Ведение обращения от приёма до закрытия с историей','active',60,'curated starter set'),
('knowledge-retrieval','Поиск по знаниям','retrieve','Быстрый поиск релевантной информации и прецедентов','active',70,'curated starter set'),
('document-generation','Генерация документов','generate','Автоматическое формирование документов по шаблонам и данным','active',80,'curated starter set'),
('sla-tracking','Контроль SLA','monitor','Отслеживание сроков и триггеры при их нарушении','active',90,'curated starter set'),
('audit-logging','Журналирование аудита','monitor','Неизменяемая фиксация действий и изменений','active',100,'curated starter set'),
('notifications','Уведомления','collaborate','Оповещение участников о событиях и сроках','active',110,'curated starter set'),
('collaboration','Совместная работа','collaborate','Совместное ведение и обсуждение задач','active',120,'curated starter set'),
('integration','Интеграция систем','integrate','Обмен данными между системами и сервисами','active',130,'curated starter set'),
('analytics-dashboards','Аналитика и дашборды','analyze','Визуализация показателей и трендов процесса','active',140,'curated starter set'),
('screening-scoring','Скоринг и скрининг','decide','Оценка и ранжирование объектов по правилам или моделям','active',150,'curated starter set')
ON CONFLICT (slug) DO NOTHING;

-- Curated starter set: practice <-> capability mapping
INSERT INTO solution_practice_capability_map (practice_id, capability_id, relation_type, source_note)
SELECT p.id, c.id, m.rel, 'curated starter set'
FROM (VALUES
  ('single-intake-channel','data-capture','required'),
  ('single-intake-channel','integration','supporting'),
  ('request-typification','classification','required'),
  ('request-typification','rules-engine','supporting'),
  ('request-typification','screening-scoring','supporting'),
  ('intake-checklists','data-capture','supporting'),
  ('rule-based-routing','workflow-routing','required'),
  ('rule-based-routing','rules-engine','required'),
  ('priority-queue','workflow-routing','required'),
  ('priority-queue','case-management','supporting'),
  ('data-validation-at-source','rules-engine','required'),
  ('data-validation-at-source','data-capture','supporting'),
  ('two-level-control','case-management','supporting'),
  ('two-level-control','audit-logging','supporting'),
  ('approval-workflow','workflow-routing','required'),
  ('approval-workflow','notifications','supporting'),
  ('parallel-approvals','workflow-routing','required'),
  ('knowledge-base','knowledge-retrieval','required'),
  ('response-templates','document-generation','required'),
  ('response-templates','knowledge-retrieval','supporting'),
  ('document-standardization','document-generation','required'),
  ('document-digitization','ocr-idp','required'),
  ('document-digitization','data-capture','supporting'),
  ('sla-monitoring','sla-tracking','required'),
  ('sla-monitoring','notifications','supporting'),
  ('process-dashboards','analytics-dashboards','required'),
  ('audit-trail','audit-logging','required'),
  ('compliance-checkpoints','rules-engine','required'),
  ('compliance-checkpoints','audit-logging','supporting'),
  ('self-service-portal','case-management','supporting'),
  ('self-service-portal','integration','supporting'),
  ('shared-service-center','case-management','supporting'),
  ('escalation-rules','workflow-routing','required'),
  ('escalation-rules','sla-tracking','required'),
  ('escalation-rules','notifications','supporting')
) AS m(p_slug, c_slug, rel)
JOIN solution_practices p ON p.slug = m.p_slug
JOIN solution_capabilities c ON c.slug = m.c_slug
ON CONFLICT (practice_id, capability_id, relation_type) DO NOTHING;