-- Seed оргструктуры ДФМ (project_id = 1). Собрано вручную по скринам положения о ДФМ.
-- Корень
INSERT INTO t_p61016064_digital_innovation_i.org_units (project_id, code, name, type, parent_id, path, level, sort_order, source_ref)
VALUES (1, '4', 'Департамент финансового мониторинга (ДФМ)', 'department', NULL, 'ДФМ', 0, 0, 'Положение о ДФМ');

-- Управления (level 1) — дети корня
INSERT INTO t_p61016064_digital_innovation_i.org_units (project_id, code, name, type, parent_id, path, level, sort_order, source_ref)
SELECT 1, v.code, v.name, 'management', d.id, 'ДФМ / ' || v.name, 1, v.sort, v.src
FROM t_p61016064_digital_innovation_i.org_units d,
(VALUES
  ('4.1', 'Управление методологии и организации процессов', 1, 'структура ДФМ'),
  ('4.2', 'Управление обязательного контроля и отчётности', 2, 'структура ДФМ'),
  ('4.3', 'Управление противодействия подозрительным операциям', 3, 'п.4.3.3 скрин'),
  ('4.4', 'Управление оценки деятельности клиентов', 4, 'п.4.4 скрин 20/21')
) AS v(code, name, sort, src)
WHERE d.project_id = 1 AND d.code = '4' AND d.parent_id IS NULL;

-- Узлы прямого подчинения департаменту (level 1): 4.5 Группа, 4.6 Центр
INSERT INTO t_p61016064_digital_innovation_i.org_units (project_id, code, name, type, parent_id, path, level, sort_order, source_ref)
SELECT 1, v.code, v.name, v.type, d.id, 'ДФМ / ' || v.name, 1, v.sort, v.src
FROM t_p61016064_digital_innovation_i.org_units d,
(VALUES
  ('4.5', 'Группа аналитической поддержки', 'group', 5, 'п.4.5 скрин 24'),
  ('4.6', 'Центр оценки рисков государственного оборонного заказа', 'center', 6, 'п.4.6 скрин 24/25')
) AS v(code, name, type, sort, src)
WHERE d.project_id = 1 AND d.code = '4' AND d.parent_id IS NULL;

-- Отделы/группы Управления 4.3 (level 2)
INSERT INTO t_p61016064_digital_innovation_i.org_units (project_id, code, name, type, parent_id, path, level, sort_order, source_ref)
SELECT 1, v.code, v.name, v.type, p.id, p.path || ' / ' || v.name, 2, v.sort, v.src
FROM t_p61016064_digital_innovation_i.org_units p,
(VALUES
  ('4.3.3', 'Отдел мониторинга операций электронной коммерции', 'division', 3, 'п.4.3.3 скрин 18')
) AS v(code, name, type, sort, src)
WHERE p.project_id = 1 AND p.code = '4.3';

-- Отделы/группы Управления 4.4 (level 2)
INSERT INTO t_p61016064_digital_innovation_i.org_units (project_id, code, name, type, parent_id, path, level, sort_order, source_ref)
SELECT 1, v.code, v.name, v.type, p.id, p.path || ' / ' || v.name, 2, v.sort, v.src
FROM t_p61016064_digital_innovation_i.org_units p,
(VALUES
  ('4.4.1', 'Отдел углублённых проверок деятельности клиентов', 'division', 1, 'п.4.4.1 скрин 20/22'),
  ('4.4.3', 'Группа оценки потенциальных клиентов', 'group', 3, 'п.4.4.3 скрин 23')
) AS v(code, name, type, sort, src)
WHERE p.project_id = 1 AND p.code = '4.4';