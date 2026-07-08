INSERT INTO t_p61016064_digital_innovation_i.project_members (project_id, user_id, role)
SELECT 11, 3, 'member'
WHERE NOT EXISTS (
  SELECT 1 FROM t_p61016064_digital_innovation_i.project_members WHERE project_id = 11 AND user_id = 3
);