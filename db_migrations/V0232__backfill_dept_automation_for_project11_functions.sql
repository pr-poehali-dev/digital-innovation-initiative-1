INSERT INTO t_p61016064_digital_innovation_i.dept_automation (function_id, project_id, current_status, implementation_horizon)
SELECT df.id, df.project_id, 'manual', 'medium'
FROM t_p61016064_digital_innovation_i.dept_functions df
WHERE df.project_id = 11
  AND NOT EXISTS (SELECT 1 FROM t_p61016064_digital_innovation_i.dept_automation da WHERE da.function_id = df.id);