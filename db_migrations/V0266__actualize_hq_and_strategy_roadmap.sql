-- Актуализация управленческого контура суперадминки (согласовано)
-- HQ: focus / mission / vision. Strategy Roadmap: перезапись 14 карточек по 3 горизонтам.

BEGIN;

UPDATE t_p61016064_digital_innovation_i.hq_blocks
SET content = 'Текущий фокус Траектории — связать Рабочий, Учебный и Профессиональный кабинеты в единую систему развития.

Рабочий кабинет формирует контекст реальной деятельности и трансформации функций.
Учебный кабинет помогает закрывать выявленные пробелы и выстраивать развитие.
Профессиональный кабинет фиксирует результат в компетенциях, профессиональном профиле и навигаторе роста.

Базовое ядро платформы уже сформировано: реализованы ключевые кабинеты, суперадминка core и Рабочий кабинет / Полигон трансформации.

Следующий этап — усилить сквозную связку между кабинетами, повысить доказательность компетенций, стабилизировать обзорные контуры и привести HQ, планы и roadmap в соответствие с фактическим состоянием продукта.',
    updated_at = NOW(), updated_by = 'actualization-2026-07'
WHERE block_key = 'focus';

UPDATE t_p61016064_digital_innovation_i.hq_blocks
SET content = 'Превращать реальную работу в развитие, а развитие — в подтверждённые компетенции, изменения и новые профессиональные возможности.',
    updated_at = NOW(), updated_by = 'actualization-2026-07'
WHERE block_key = 'mission';

UPDATE t_p61016064_digital_innovation_i.hq_blocks
SET content = 'Единая цифровая среда, где работа, обучение, компетенции и карьерный путь больше не существуют отдельно. Любой участник за 1–2 минуты понимает, что это за продукт, куда мы идём, что уже сделано, что в работе и что дальше.',
    updated_at = NOW(), updated_by = 'actualization-2026-07'
WHERE block_key = 'vision';

-- Roadmap horizon mapping: Done -> lane now/status done, Current -> lane next/status in_progress, Next -> lane later/status planned

UPDATE t_p61016064_digital_innovation_i.admin_strategy_roadmap_items SET
  title='Платформенное ядро', description='Базовая архитектура платформы, общие сущности, навигация, файлы и AI-инфраструктура.',
  lane='now', status='done', source_type='manual', source_report_id=NULL, source_payload='{}'::jsonb,
  target_segment='', target_metric='', impact='critical', effort='high', confidence='high',
  sort_order=1, updated_by='actualization-2026-07', updated_at=NOW() WHERE id=1;
UPDATE t_p61016064_digital_innovation_i.admin_strategy_roadmap_items SET
  title='Учебный кабинет core', description='Основные сценарии обучения и развития: цели, AI-план, темы, статусы, weekly check-in, образовательный паспорт.',
  lane='now', status='done', source_type='manual', source_report_id=NULL, source_payload='{}'::jsonb,
  target_segment='', target_metric='', impact='high', effort='medium', confidence='high',
  sort_order=2, updated_by='actualization-2026-07', updated_at=NOW() WHERE id=2;
UPDATE t_p61016064_digital_innovation_i.admin_strategy_roadmap_items SET
  title='Профессиональный кабинет core', description='Профессиональный профиль, карта компетенций, fit / gap логика и навигатор развития.',
  lane='now', status='done', source_type='manual', source_report_id=NULL, source_payload='{}'::jsonb,
  target_segment='', target_metric='', impact='high', effort='high', confidence='high',
  sort_order=3, updated_by='actualization-2026-07', updated_at=NOW() WHERE id=3;
UPDATE t_p61016064_digital_innovation_i.admin_strategy_roadmap_items SET
  title='Суперадминка core', description='HQ, strategy, roadmap, plan, tickets, users и audit.',
  lane='now', status='done', source_type='manual', source_report_id=NULL, source_payload='{}'::jsonb,
  target_segment='', target_metric='', impact='high', effort='medium', confidence='high',
  sort_order=4, updated_by='actualization-2026-07', updated_at=NOW() WHERE id=4;
UPDATE t_p61016064_digital_innovation_i.admin_strategy_roadmap_items SET
  title='Рабочий кабинет / Полигон трансформации', description='Оргструктура, функции, проблемы, гипотезы, инициативы, решения, пилоты и сводки.',
  lane='now', status='done', source_type='manual', source_report_id=NULL, source_payload='{}'::jsonb,
  target_segment='', target_metric='', impact='critical', effort='high', confidence='high',
  sort_order=5, updated_by='actualization-2026-07', updated_at=NOW() WHERE id=5;
UPDATE t_p61016064_digital_innovation_i.admin_strategy_roadmap_items SET
  title='AI-разбор документов и извлечение функций', description='AI-помощь в разборе положений, документов и структурировании исходных данных.',
  lane='now', status='done', source_type='manual', source_report_id=NULL, source_payload='{}'::jsonb,
  target_segment='', target_metric='', impact='high', effort='medium', confidence='high',
  sort_order=6, updated_by='actualization-2026-07', updated_at=NOW() WHERE id=6;

UPDATE t_p61016064_digital_innovation_i.admin_strategy_roadmap_items SET
  title='Сквозная связка «работа → обучение → профиль»', description='Замыкание кабинетов в единую систему развития.',
  lane='next', status='in_progress', source_type='manual', source_report_id=NULL, source_payload='{}'::jsonb,
  target_segment='', target_metric='', impact='critical', effort='high', confidence='medium',
  sort_order=7, updated_by='actualization-2026-07', updated_at=NOW() WHERE id=7;
UPDATE t_p61016064_digital_innovation_i.admin_strategy_roadmap_items SET
  title='Доказательный слой компетенций', description='Связка компетенций с практикой, обучением, подтверждёнными сигналами и результатами работы.',
  lane='next', status='in_progress', source_type='manual', source_report_id=NULL, source_payload='{}'::jsonb,
  target_segment='', target_metric='', impact='critical', effort='medium', confidence='medium',
  sort_order=8, updated_by='actualization-2026-07', updated_at=NOW() WHERE id=8;
UPDATE t_p61016064_digital_innovation_i.admin_strategy_roadmap_items SET
  title='Стабилизация и упаковка Полигона трансформации', description='Улучшение качества данных, обзорных сценариев и зрелости рабочего контура.',
  lane='next', status='in_progress', source_type='manual', source_report_id=NULL, source_payload='{}'::jsonb,
  target_segment='', target_metric='', impact='high', effort='medium', confidence='high',
  sort_order=9, updated_by='actualization-2026-07', updated_at=NOW() WHERE id=9;
UPDATE t_p61016064_digital_innovation_i.admin_strategy_roadmap_items SET
  title='Метрики зрелости и актуализация стратегии', description='Синхронизация HQ, plans и roadmap с фактическим состоянием продукта.',
  lane='next', status='in_progress', source_type='manual', source_report_id=NULL, source_payload='{}'::jsonb,
  target_segment='', target_metric='', impact='medium', effort='low', confidence='high',
  sort_order=10, updated_by='actualization-2026-07', updated_at=NOW() WHERE id=10;

UPDATE t_p61016064_digital_innovation_i.admin_strategy_roadmap_items SET
  title='Внешний карьерный контур', description='Расширение внешнего профессионального представления и карьерных сценариев.',
  lane='later', status='planned', source_type='manual', source_report_id=NULL, source_payload='{}'::jsonb,
  target_segment='', target_metric='', impact='critical', effort='high', confidence='medium',
  sort_order=11, updated_by='actualization-2026-07', updated_at=NOW() WHERE id=11;
UPDATE t_p61016064_digital_innovation_i.admin_strategy_roadmap_items SET
  title='Верифицированные профессиональные сигналы', description='Подтверждённые сигналы опыта, компетенций и достижений.',
  lane='later', status='planned', source_type='manual', source_report_id=NULL, source_payload='{}'::jsonb,
  target_segment='', target_metric='', impact='high', effort='high', confidence='medium',
  sort_order=12, updated_by='actualization-2026-07', updated_at=NOW() WHERE id=12;
UPDATE t_p61016064_digital_innovation_i.admin_strategy_roadmap_items SET
  title='Enterprise governance, безопасность и аудит', description='Роли, доступы, аудит, управляемость данных и корпоративный контур использования.',
  lane='later', status='planned', source_type='manual', source_report_id=NULL, source_payload='{}'::jsonb,
  target_segment='', target_metric='', impact='high', effort='high', confidence='medium',
  sort_order=13, updated_by='actualization-2026-07', updated_at=NOW() WHERE id=13;
UPDATE t_p61016064_digital_innovation_i.admin_strategy_roadmap_items SET
  title='Интеграции и масштабирование', description='Расширение платформы через интеграции и масштабирование на новые контуры и организации.',
  lane='later', status='planned', source_type='manual', source_report_id=NULL, source_payload='{}'::jsonb,
  target_segment='', target_metric='', impact='medium', effort='high', confidence='medium',
  sort_order=14, updated_by='actualization-2026-07', updated_at=NOW() WHERE id=14;

COMMIT;