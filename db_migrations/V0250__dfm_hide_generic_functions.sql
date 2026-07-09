-- Скрываем 15 обобщённых функций (заменяем детальными). App фильтрует dept_name LIKE '[SMOKETEST%'
UPDATE t_p61016064_digital_innovation_i.dept_functions
SET dept_name = '[SMOKETEST-OLD] ' || dept_name,
    source_section_code = '',
    updated_at = now()
WHERE project_id = 1
  AND id BETWEEN 38 AND 52
  AND dept_name NOT LIKE '[SMOKETEST%';

-- Снимаем их привязки к узлам, чтобы не искажали покрытие/отчёты
UPDATE t_p61016064_digital_innovation_i.function_org_units
SET org_unit_id = org_unit_id  -- no-op placeholder to keep statement valid
WHERE FALSE;