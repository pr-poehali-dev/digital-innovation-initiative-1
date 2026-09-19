-- Рабочий проект-контейнер для плана исполнения инициативы 100401 СУРР.
-- Переиспользует существующий механизм Ганта/сетевого графика/CPM
-- (exec_project + exec_task/exec_milestone + exec_schedule_dependency),
-- а не создаёт параллельный.
INSERT INTO exec_project (title, project_kind, initiative_id, status, priority, plan_start, plan_end, verification_status, created_by)
SELECT 'План исполнения: Автоматизация процессов управления регуляторным риском (СУРР)',
       'project', i.id, 'in_progress', 'high', '2026-09-01', '2026-12-31', 'user_draft', 'import:presentation'
FROM exec_initiative i
WHERE i.external_code = '100401'
  AND NOT EXISTS (SELECT 1 FROM exec_project p WHERE p.initiative_id = i.id);

-- Существующие вехи 100401 СУРР переносятся в этот проект, чтобы попасть
-- в Гант/сетевой график/шкалу вех проекта (там выборка идёт по project_id).
UPDATE exec_milestone m
SET project_id = p.id
FROM exec_project p
WHERE p.initiative_id = m.initiative_id
  AND m.initiative_id = (SELECT id FROM exec_initiative WHERE external_code = '100401')
  AND m.project_id IS NULL;
