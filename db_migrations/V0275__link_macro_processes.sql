-- Привязка подразделений к макропроцессам (владелец + участники)
INSERT INTO t_p61016064_digital_innovation_i.macro_process_units (macro_process_id, org_unit_id, role)
SELECT mp.id, u.id,
       CASE WHEN u.code = mp.owner_unit_code THEN 'owner' ELSE 'participant' END
FROM t_p61016064_digital_innovation_i.macro_processes mp
JOIN t_p61016064_digital_innovation_i.org_units u
  ON u.code = mp.owner_unit_code OR u.parent_id = (
      SELECT id FROM t_p61016064_digital_innovation_i.org_units WHERE code = mp.owner_unit_code LIMIT 1
  )
WHERE mp.project_id = 12
ON CONFLICT (macro_process_id, org_unit_id) DO NOTHING;

-- Привязка функций к макропроцессам через оргединицы владельца процесса
INSERT INTO t_p61016064_digital_innovation_i.macro_process_functions (macro_process_id, function_id)
SELECT DISTINCT mp.id, fo.function_id
FROM t_p61016064_digital_innovation_i.macro_processes mp
JOIN t_p61016064_digital_innovation_i.macro_process_units mpu ON mpu.macro_process_id = mp.id
JOIN t_p61016064_digital_innovation_i.function_org_units fo ON fo.org_unit_id = mpu.org_unit_id
JOIN t_p61016064_digital_innovation_i.dept_functions df ON df.id = fo.function_id
WHERE mp.project_id = 12
  AND df.project_id = 12
  AND df.dept_name NOT LIKE '%SMOKETEST%'
ON CONFLICT (macro_process_id, function_id) DO NOTHING;
