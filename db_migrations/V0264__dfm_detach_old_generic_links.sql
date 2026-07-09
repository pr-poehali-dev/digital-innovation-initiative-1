-- Переносим привязки скрытых (старых обобщённых) функций на корень департамента,
-- чтобы не завышать счётчики реальных узлов. Скрытые функции исключены фильтром smoketest.
UPDATE t_p61016064_digital_innovation_i.function_org_units l
SET org_unit_id = 1
FROM t_p61016064_digital_innovation_i.dept_functions f
WHERE l.function_id = f.id
  AND f.project_id = 1
  AND f.dept_name LIKE '[SMOKETEST-OLD]%';