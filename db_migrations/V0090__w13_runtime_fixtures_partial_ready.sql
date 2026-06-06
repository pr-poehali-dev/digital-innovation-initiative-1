-- W13.1 Runtime fixtures: seed-данные для partial/ready smoke
-- User 1 (Алексей) → ready state: 5 компетенций, 3 verified evidence
-- User 3 (test@raven.moscow) → partial state: 2 компетенции, 1 verified

-- ── User 1: ready ────────────────────────────────────────────────────

-- Компетенции с explicit level > 0
INSERT INTO professional_user_competencies (user_id, competency_id, current_level, confidence, last_assessed_at, updated_at)
VALUES
  (1, 1, 3, 'medium', NOW(), NOW()),  -- Планирование проекта, level 3
  (1, 2, 4, 'high',   NOW(), NOW()),  -- Расстановка приоритетов, level 4
  (1, 6, 3, 'medium', NOW(), NOW()),  -- Статусная коммуникация, level 3
  (1, 7, 2, 'low',    NOW(), NOW()),  -- Управление ожиданиями, level 2
  (1,10, 2, 'low',    NOW(), NOW())   -- Выявление рисков, level 2
ON CONFLICT (user_id, competency_id) DO UPDATE
  SET current_level = EXCLUDED.current_level,
      confidence = EXCLUDED.confidence,
      last_assessed_at = EXCLUDED.last_assessed_at,
      updated_at = EXCLUDED.updated_at;

-- Learning completion evidence для user 1
-- Компетенция 1 (Планирование проекта) — verified
INSERT INTO professional_competency_evidence (user_competency_id, evidence_type, title, description, source_ref, created_at)
SELECT uc.id,
  'learning_completion',
  'Завершено: Введение в управление проектами',
  'Источник: education_item #101. Компетенция: Планирование проекта. Почему связано: базовый курс по планированию.',
  'education_item:101:1',
  NOW() - INTERVAL '10 days'
FROM professional_user_competencies uc
WHERE uc.user_id = 1 AND uc.competency_id = 1
ON CONFLICT DO NOTHING;

-- Компетенция 2 (Расстановка приоритетов) — verified
INSERT INTO professional_competency_evidence (user_competency_id, evidence_type, title, description, source_ref, created_at)
SELECT uc.id,
  'learning_completion',
  'Завершено: Приоритизация задач и backlog management',
  'Источник: education_item #102. Компетенция: Расстановка приоритетов. Почему связано: практический курс по приоритетам.',
  'education_item:102:2',
  NOW() - INTERVAL '7 days'
FROM professional_user_competencies uc
WHERE uc.user_id = 1 AND uc.competency_id = 2
ON CONFLICT DO NOTHING;

-- Компетенция 6 (Статусная коммуникация) — verified
INSERT INTO professional_competency_evidence (user_competency_id, evidence_type, title, description, source_ref, created_at)
SELECT uc.id,
  'learning_completion',
  'Завершено: Коммуникация со стейкхолдерами',
  'Источник: education_item #103. Компетенция: Статусная коммуникация. Почему связано: модуль по статус-репортингу.',
  'education_item:103:6',
  NOW() - INTERVAL '3 days'
FROM professional_user_competencies uc
WHERE uc.user_id = 1 AND uc.competency_id = 6
ON CONFLICT DO NOTHING;

-- ── User 3: partial ──────────────────────────────────────────────────

INSERT INTO professional_user_competencies (user_id, competency_id, current_level, confidence, last_assessed_at, updated_at)
VALUES
  (3, 3, 2, 'low',    NOW(), NOW()),  -- Отслеживание исполнения, level 2
  (3, 5, 1, 'low',    NOW(), NOW())   -- Предсказуемость результатов, level 1
ON CONFLICT (user_id, competency_id) DO UPDATE
  SET current_level = EXCLUDED.current_level,
      confidence = EXCLUDED.confidence,
      last_assessed_at = EXCLUDED.last_assessed_at,
      updated_at = EXCLUDED.updated_at;

-- Компетенция 3 (Отслеживание исполнения) — verified для user 3
INSERT INTO professional_competency_evidence (user_competency_id, evidence_type, title, description, source_ref, created_at)
SELECT uc.id,
  'learning_completion',
  'Завершено: Трекинг задач и контроль исполнения',
  'Источник: education_item #201. Компетенция: Отслеживание исполнения.',
  'education_item:201:3',
  NOW() - INTERVAL '5 days'
FROM professional_user_competencies uc
WHERE uc.user_id = 3 AND uc.competency_id = 3
ON CONFLICT DO NOTHING;
