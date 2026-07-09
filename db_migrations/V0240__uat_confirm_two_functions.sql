-- UAT вариант A: ручное подтверждение 2 функций из unmatched (owner, exact match кода).
-- Третью функцию (без кода раздела) НАМЕРЕННО оставляем в «Без привязки».
-- Consultирование → 4.1
INSERT INTO t_p61016064_digital_innovation_i.function_org_units
    (function_id, org_unit_id, role, confidence, source_ref)
SELECT f.id, u.id, 'owner', 1.0, 'manual_uat:4.1'
FROM t_p61016064_digital_innovation_i.dept_functions f
JOIN t_p61016064_digital_innovation_i.org_units u ON u.project_id = 1 AND u.code = '4.1' AND u.is_archived = false
WHERE f.id = 46
ON CONFLICT (function_id, org_unit_id, role) DO NOTHING;

-- Методподдержка → 4.2
INSERT INTO t_p61016064_digital_innovation_i.function_org_units
    (function_id, org_unit_id, role, confidence, source_ref)
SELECT f.id, u.id, 'owner', 1.0, 'manual_uat:4.2'
FROM t_p61016064_digital_innovation_i.dept_functions f
JOIN t_p61016064_digital_innovation_i.org_units u ON u.project_id = 1 AND u.code = '4.2' AND u.is_archived = false
WHERE f.id = 45
ON CONFLICT (function_id, org_unit_id, role) DO NOTHING;