INSERT INTO exec_project
    (id, title, project_kind, status, priority, progress_pct,
     plan_start, plan_end, is_test_data, archived_at, created_by)
OVERRIDING SYSTEM VALUE
SELECT 15, 'Repair placeholder project', 'project', 'in_progress', 'high', 35,
       '2026-09-01'::date, '2026-12-15'::date, true, now(), 'migration_repair'
WHERE NOT EXISTS (SELECT 1 FROM exec_project WHERE id = 15);
