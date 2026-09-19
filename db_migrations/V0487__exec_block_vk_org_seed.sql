-- Служебный проект-контейнер для узлов оргструктуры портфеля "Инициативы
-- Блока внутреннего контроля" (тот же приём, что и у exec_center в
-- V0404 — org_units.project_id NOT NULL и не меняется).
INSERT INTO projects (title, description)
SELECT 'Блок внутреннего контроля: оргструктура портфеля (служебный)',
       'Технический проект-контейнер для org_units структуры Блока ВК и его функциональных заказчиков. Не бизнес-проект и не ДФМ (project_id=12).'
WHERE NOT EXISTS (
    SELECT 1 FROM projects WHERE title = 'Блок внутреннего контроля: оргструктура портфеля (служебный)'
);

-- Верхний узел: Блок внутреннего контроля
INSERT INTO org_units (project_id, code, name, type, parent_id, path, level, sort_order)
SELECT p.id, 'БВК', 'Блок внутреннего контроля (Блок ВК)', 'block', NULL, 'БВК', 0, 10
FROM projects p
WHERE p.title = 'Блок внутреннего контроля: оргструктура портфеля (служебный)'
  AND NOT EXISTS (SELECT 1 FROM org_units WHERE project_id = p.id AND code = 'БВК');

-- Функциональные заказчики (подразделения) — уровень 1
INSERT INTO org_units (project_id, code, name, type, parent_id, path, level, sort_order)
SELECT b.project_id, t.code, t.name, 'department', b.id, 'БВК.' || t.code, 1, t.sort_order
FROM org_units b
CROSS JOIN (VALUES
    ('СВА', 'Служба внутреннего аудита (СВА)', 10),
    ('ДВКиК', 'Департамент внутреннего контроля и комплаенса (ДВКиК)', 20),
    ('ДРКНОиПНП', 'Департамент по работе с контрольно-надзорными органами и противодействия недобросовестным практикам', 30)
) AS t(code, name, sort_order)
WHERE b.code = 'БВК'
  AND NOT EXISTS (SELECT 1 FROM org_units u2 WHERE u2.project_id = b.project_id AND u2.code = t.code);
