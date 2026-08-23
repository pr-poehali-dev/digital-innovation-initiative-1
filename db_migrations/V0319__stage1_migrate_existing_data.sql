-- ЭТАП 1, ШАГ 4: перенос данных. Повторно запускаемая, без дублей.

UPDATE t_p61016064_digital_innovation_i.exec_plan_assignee a
SET raci_role = 'A'
FROM t_p61016064_digital_innovation_i.exec_plan_step s
WHERE s.id = a.step_id
  AND s.responsible_person_id = a.person_id
  AND a.raci_role = 'R'
  AND NOT EXISTS (
      SELECT 1 FROM t_p61016064_digital_innovation_i.exec_plan_assignee x
      WHERE x.step_id = a.step_id AND x.raci_role = 'A'
  );

INSERT INTO t_p61016064_digital_innovation_i.exec_plan_assignee
    (step_id, person_id, role_in_step, workload_pct, raci_role)
SELECT s.id, s.responsible_person_id, 'responsible', 100, 'A'
FROM t_p61016064_digital_innovation_i.exec_plan_step s
WHERE s.responsible_person_id IS NOT NULL
  AND s.status <> 'cancelled'
  AND NOT EXISTS (
      SELECT 1 FROM t_p61016064_digital_innovation_i.exec_plan_assignee a
      WHERE a.step_id = s.id AND a.raci_role = 'A'
  );

UPDATE t_p61016064_digital_innovation_i.exec_plan_assignee a
SET plan_hours = ROUND(
        s.estimate_hours * COALESCE(a.workload_pct, 100)::numeric
        / NULLIF((SELECT SUM(COALESCE(x.workload_pct, 100))
                  FROM t_p61016064_digital_innovation_i.exec_plan_assignee x
                  WHERE x.step_id = a.step_id), 0), 1)
FROM t_p61016064_digital_innovation_i.exec_plan_step s
WHERE s.id = a.step_id
  AND a.plan_hours IS NULL
  AND s.estimate_hours IS NOT NULL;

UPDATE t_p61016064_digital_innovation_i.exec_plan_assignee a
SET valid_from = COALESCE(a.valid_from, s.start_date),
    valid_to   = COALESCE(a.valid_to, s.due_date)
FROM t_p61016064_digital_innovation_i.exec_plan_step s
WHERE s.id = a.step_id
  AND (a.valid_from IS NULL OR a.valid_to IS NULL)
  AND (s.start_date IS NOT NULL OR s.due_date IS NOT NULL);

UPDATE t_p61016064_digital_innovation_i.exec_plan_step
SET step_type = 'milestone'
WHERE is_milestone = true AND step_type <> 'milestone';

INSERT INTO t_p61016064_digital_innovation_i.exec_person_capacity
    (person_id, valid_from, hours_per_week, fte, work_schedule, note)
SELECT p.id, CURRENT_DATE, 40, 1, '5/2', 'Значение по умолчанию при переходе на новую модель'
FROM t_p61016064_digital_innovation_i.exec_person p
WHERE COALESCE(p.record_state, 'active') = 'active'
  AND NOT EXISTS (
      SELECT 1 FROM t_p61016064_digital_innovation_i.exec_person_capacity c
      WHERE c.person_id = p.id
  );

INSERT INTO t_p61016064_digital_innovation_i.exec_function_raci
    (function_id, person_id, raci_role, is_backup, valid_from, note)
SELECT f.id, f.owner_person_id, 'A', false, CURRENT_DATE, 'Перенесено из карточки функции'
FROM t_p61016064_digital_innovation_i.exec_center_function f
WHERE f.owner_person_id IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM t_p61016064_digital_innovation_i.exec_function_raci r
      WHERE r.function_id = f.id AND r.raci_role = 'A' AND r.valid_to IS NULL AND r.is_backup = false
  );

INSERT INTO t_p61016064_digital_innovation_i.exec_function_raci
    (function_id, person_id, raci_role, is_backup, valid_from, note)
SELECT f.id, f.backup_person_id, 'R', true, CURRENT_DATE, 'Перенесено из карточки функции'
FROM t_p61016064_digital_innovation_i.exec_center_function f
WHERE f.backup_person_id IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM t_p61016064_digital_innovation_i.exec_function_raci r
      WHERE r.function_id = f.id AND r.person_id = f.backup_person_id AND r.raci_role = 'R'
  );

INSERT INTO t_p61016064_digital_innovation_i.exec_plan_step_function
    (step_id, function_id, is_primary)
SELECT s.id, s.center_function_id, true
FROM t_p61016064_digital_innovation_i.exec_plan_step s
WHERE s.center_function_id IS NOT NULL
ON CONFLICT (step_id, function_id) DO NOTHING;

INSERT INTO t_p61016064_digital_innovation_i.exec_plan_step_initiative
    (step_id, initiative_id, is_primary)
SELECT s.id, p.initiative_id, true
FROM t_p61016064_digital_innovation_i.exec_plan_step s
JOIN t_p61016064_digital_innovation_i.exec_plan p ON p.id = s.plan_id
WHERE p.initiative_id IS NOT NULL
  AND s.status <> 'cancelled'
ON CONFLICT (step_id, initiative_id) DO NOTHING;

INSERT INTO t_p61016064_digital_innovation_i.exec_work_calendar (calendar_date, day_type, work_hours)
SELECT d::date,
       CASE WHEN EXTRACT(ISODOW FROM d) >= 6 THEN 'weekend' ELSE 'work' END,
       CASE WHEN EXTRACT(ISODOW FROM d) >= 6 THEN 0 ELSE 8 END
FROM generate_series('2026-01-01'::date, '2027-12-31'::date, '1 day'::interval) d
ON CONFLICT (calendar_date) DO NOTHING;