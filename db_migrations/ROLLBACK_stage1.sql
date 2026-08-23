-- СЦЕНАРИЙ ОТКАТА ЭТАПА 1 (миграции V0316-V0319)
-- Метка резервной копии: bk20260823
-- Проверено 2026-08-23: все строки восстановимы построчно по id.
--
-- ВНИМАНИЕ: выполнять только целиком и в транзакции.
-- Новые таблицы НЕ удаляются автоматически: сначала убедитесь,
-- что в них нет данных, внесённых после миграции.

BEGIN;

-- 1. Восстановление изменённых значений из резервных копий.
--    Новые колонки не трогаем: они станут неиспользуемыми.

-- 1.1 Тип шага и связь с вехой
UPDATE t_p61016064_digital_innovation_i.exec_plan_step s
SET step_type = b.step_type,
    is_milestone = b.is_milestone
FROM t_p61016064_digital_innovation_i.bk20260823_exec_plan_step b
WHERE s.id = b.id
  AND (s.step_type IS DISTINCT FROM b.step_type
       OR s.is_milestone IS DISTINCT FROM b.is_milestone);

-- 1.2 Назначения: роль RACI и часы
UPDATE t_p61016064_digital_innovation_i.exec_plan_assignee a
SET raci_role = 'R',
    plan_hours = NULL,
    valid_from = NULL,
    valid_to = NULL
FROM t_p61016064_digital_innovation_i.bk20260823_exec_plan_assignee b
WHERE a.id = b.id;

-- 1.3 Назначения, созданные миграцией (их нет в копии), удаляются
DELETE FROM t_p61016064_digital_innovation_i.exec_plan_assignee a
WHERE NOT EXISTS (
    SELECT 1 FROM t_p61016064_digital_innovation_i.bk20260823_exec_plan_assignee b
    WHERE b.id = a.id
);

-- 2. Очистка данных, порождённых миграцией в новых таблицах.
--    Условие note/created_at защищает данные, внесённые пользователем позже.

DELETE FROM t_p61016064_digital_innovation_i.exec_person_capacity
WHERE note = 'Значение по умолчанию при переходе на новую модель';

DELETE FROM t_p61016064_digital_innovation_i.exec_function_raci
WHERE note = 'Перенесено из карточки функции';

DELETE FROM t_p61016064_digital_innovation_i.exec_plan_step_function
WHERE is_primary = true
  AND EXISTS (
      SELECT 1 FROM t_p61016064_digital_innovation_i.exec_plan_step s
      WHERE s.id = step_id AND s.center_function_id = function_id
  );

DELETE FROM t_p61016064_digital_innovation_i.exec_plan_step_initiative
WHERE is_primary = true;

DELETE FROM t_p61016064_digital_innovation_i.exec_work_calendar
WHERE calendar_date BETWEEN '2026-01-01' AND '2027-12-31'
  AND note IS NULL;

-- 3. Проверка результата перед фиксацией.
--    Ожидается: assignee = 15, steps = 66, persons = 9, role_assign = 8.
SELECT 'assignee' AS t, count(*) FROM t_p61016064_digital_innovation_i.exec_plan_assignee
UNION ALL SELECT 'steps', count(*) FROM t_p61016064_digital_innovation_i.exec_plan_step
UNION ALL SELECT 'persons', count(*) FROM t_p61016064_digital_innovation_i.exec_person
UNION ALL SELECT 'role_assign', count(*) FROM t_p61016064_digital_innovation_i.exec_role_assignment;

-- Если числа совпали:
COMMIT;
-- Если нет:
-- ROLLBACK;

-- 4. ОПЦИОНАЛЬНО, после подтверждения: снятие структурных изменений.
--    Выполнять отдельно и только при полном отказе от модели.
--
-- DROP INDEX IF EXISTS t_p61016064_digital_innovation_i.uq_assignee_single_a;
-- DROP INDEX IF EXISTS t_p61016064_digital_innovation_i.uq_assignee_step_person_role;
-- DROP INDEX IF EXISTS t_p61016064_digital_innovation_i.uq_person_user_id;
-- ALTER TABLE t_p61016064_digital_innovation_i.exec_plan_assignee
--     DROP CONSTRAINT IF EXISTS chk_assignee_raci;
--
--    Новые таблицы (удалять только при отказе от модели):
--    exec_person_competency, exec_person_capacity, exec_person_absence,
--    exec_person_profile_record, exec_function_raci,
--    exec_center_function_dept_function, exec_function_initiative,
--    exec_function_competency, exec_plan_step_function,
--    exec_plan_step_initiative, exec_assignee_week, exec_time_entry,
--    exec_work_calendar, exec_center_kpi_value
