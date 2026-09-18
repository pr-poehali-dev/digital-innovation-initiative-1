-- Тестовый пилотный кейс лаборатории решений: «Разработка концепции 6И»
-- Паспорт намеренно оставлен пустым — заполняется пользователем через новую вкладку «Паспорт»
-- в рамках приёмочной проверки Итерации 1.
INSERT INTO t_p61016064_digital_innovation_i.projects
    (title, description, owner_id, project_kind)
SELECT
    'Разработка концепции управления регуляторными требованиями «6И»',
    'Единый механизм управления регуляторными требованиями и изменениями через шесть взаимосвязанных элементов: Информация, Инициация, Инструмент, Институт, Источник/инвестиции, Интеграция. Пилотный кейс Лаборатории управленческих решений.',
    1,
    'lab_development'
WHERE NOT EXISTS (
    SELECT 1 FROM t_p61016064_digital_innovation_i.projects WHERE title ILIKE '%6И%'
);

INSERT INTO t_p61016064_digital_innovation_i.project_members (project_id, user_id, role)
SELECT p.id, 1, 'owner'
FROM t_p61016064_digital_innovation_i.projects p
WHERE p.title ILIKE '%6И%'
  AND NOT EXISTS (
      SELECT 1 FROM t_p61016064_digital_innovation_i.project_members m
      WHERE m.project_id = p.id AND m.user_id = 1
  );
