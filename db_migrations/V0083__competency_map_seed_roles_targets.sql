-- W8.1 Seed: Role Profiles + Competency Targets

INSERT INTO t_p61016064_digital_innovation_i.professional_role_profiles
    (vertical_key, code, name, description)
VALUES
('pm_operations','project_coordinator',
 'Координатор проектов',
 'Начальный уровень. Поддерживает планирование и отслеживание задач, готовит статусы, координирует встречи.'),
('pm_operations','project_manager',
 'Руководитель проекта',
 'Самостоятельно ведёт проекты от инициации до закрытия. Управляет стейкхолдерами, рисками, командой.'),
('pm_operations','operations_manager',
 'Операционный менеджер',
 'Отвечает за операционную эффективность. Проектирует и оптимизирует процессы, строит метрики, управляет командой.')
ON CONFLICT (code) DO NOTHING;

-- Targets: Project Coordinator (target_level 2-3, core = планирование и трекинг)
INSERT INTO t_p61016064_digital_innovation_i.professional_role_competency_targets
    (role_profile_id, competency_id, target_level, importance)
SELECT r.id, c.id,
    CASE c.code
        WHEN 'C_D1_1' THEN 2  WHEN 'C_D1_2' THEN 2  WHEN 'C_D1_3' THEN 3
        WHEN 'C_D1_4' THEN 2  WHEN 'C_D1_5' THEN 2
        WHEN 'C_D2_1' THEN 3  WHEN 'C_D2_2' THEN 2  WHEN 'C_D2_3' THEN 2  WHEN 'C_D2_4' THEN 2
        WHEN 'C_D3_1' THEN 2  WHEN 'C_D3_2' THEN 1  WHEN 'C_D3_3' THEN 2  WHEN 'C_D3_4' THEN 1
        WHEN 'C_D4_1' THEN 2  WHEN 'C_D4_2' THEN 1  WHEN 'C_D4_3' THEN 2  WHEN 'C_D4_4' THEN 2
        WHEN 'C_D5_1' THEN 2  WHEN 'C_D5_2' THEN 2  WHEN 'C_D5_3' THEN 1  WHEN 'C_D5_4' THEN 2
        WHEN 'C_D6_1' THEN 2  WHEN 'C_D6_2' THEN 3  WHEN 'C_D6_3' THEN 3  WHEN 'C_D6_4' THEN 2  WHEN 'C_D6_5' THEN 2
        ELSE 2
    END,
    CASE c.code
        WHEN 'C_D1_3' THEN 'core'  WHEN 'C_D2_1' THEN 'core'  WHEN 'C_D6_2' THEN 'core'  WHEN 'C_D6_3' THEN 'core'
        WHEN 'C_D1_1' THEN 'important'  WHEN 'C_D1_2' THEN 'important'
        ELSE 'supporting'
    END
FROM t_p61016064_digital_innovation_i.professional_role_profiles r,
     t_p61016064_digital_innovation_i.professional_competencies c
WHERE r.code = 'project_coordinator'
ON CONFLICT (role_profile_id, competency_id) DO NOTHING;

-- Targets: Project Manager (target_level 3-4, все домены важны)
INSERT INTO t_p61016064_digital_innovation_i.professional_role_competency_targets
    (role_profile_id, competency_id, target_level, importance)
SELECT r.id, c.id,
    CASE c.code
        WHEN 'C_D1_1' THEN 4  WHEN 'C_D1_2' THEN 4  WHEN 'C_D1_3' THEN 3
        WHEN 'C_D1_4' THEN 3  WHEN 'C_D1_5' THEN 4
        WHEN 'C_D2_1' THEN 4  WHEN 'C_D2_2' THEN 4  WHEN 'C_D2_3' THEN 3  WHEN 'C_D2_4' THEN 3
        WHEN 'C_D3_1' THEN 3  WHEN 'C_D3_2' THEN 3  WHEN 'C_D3_3' THEN 3  WHEN 'C_D3_4' THEN 3
        WHEN 'C_D4_1' THEN 3  WHEN 'C_D4_2' THEN 3  WHEN 'C_D4_3' THEN 2  WHEN 'C_D4_4' THEN 3
        WHEN 'C_D5_1' THEN 3  WHEN 'C_D5_2' THEN 3  WHEN 'C_D5_3' THEN 3  WHEN 'C_D5_4' THEN 2
        WHEN 'C_D6_1' THEN 4  WHEN 'C_D6_2' THEN 4  WHEN 'C_D6_3' THEN 4  WHEN 'C_D6_4' THEN 3  WHEN 'C_D6_5' THEN 3
        ELSE 3
    END,
    CASE c.code
        WHEN 'C_D1_1' THEN 'core'  WHEN 'C_D1_2' THEN 'core'  WHEN 'C_D1_5' THEN 'core'
        WHEN 'C_D2_1' THEN 'core'  WHEN 'C_D2_2' THEN 'core'
        WHEN 'C_D6_1' THEN 'core'  WHEN 'C_D6_2' THEN 'core'  WHEN 'C_D6_3' THEN 'core'
        WHEN 'C_D3_1' THEN 'important'  WHEN 'C_D3_4' THEN 'important'
        ELSE 'supporting'
    END
FROM t_p61016064_digital_innovation_i.professional_role_profiles r,
     t_p61016064_digital_innovation_i.professional_competencies c
WHERE r.code = 'project_manager'
ON CONFLICT (role_profile_id, competency_id) DO NOTHING;

-- Targets: Operations Manager (target_level 3-5, акцент на D4, D5, D6)
INSERT INTO t_p61016064_digital_innovation_i.professional_role_competency_targets
    (role_profile_id, competency_id, target_level, importance)
SELECT r.id, c.id,
    CASE c.code
        WHEN 'C_D1_1' THEN 3  WHEN 'C_D1_2' THEN 4  WHEN 'C_D1_3' THEN 3
        WHEN 'C_D1_4' THEN 3  WHEN 'C_D1_5' THEN 3
        WHEN 'C_D2_1' THEN 3  WHEN 'C_D2_2' THEN 3  WHEN 'C_D2_3' THEN 4  WHEN 'C_D2_4' THEN 3
        WHEN 'C_D3_1' THEN 3  WHEN 'C_D3_2' THEN 3  WHEN 'C_D3_3' THEN 4  WHEN 'C_D3_4' THEN 4
        WHEN 'C_D4_1' THEN 4  WHEN 'C_D4_2' THEN 4  WHEN 'C_D4_3' THEN 4  WHEN 'C_D4_4' THEN 4
        WHEN 'C_D5_1' THEN 4  WHEN 'C_D5_2' THEN 4  WHEN 'C_D5_3' THEN 4  WHEN 'C_D5_4' THEN 3
        WHEN 'C_D6_1' THEN 4  WHEN 'C_D6_2' THEN 4  WHEN 'C_D6_3' THEN 4  WHEN 'C_D6_4' THEN 4  WHEN 'C_D6_5' THEN 3
        ELSE 3
    END,
    CASE c.code
        WHEN 'C_D4_1' THEN 'core'  WHEN 'C_D4_2' THEN 'core'  WHEN 'C_D4_3' THEN 'core'  WHEN 'C_D4_4' THEN 'core'
        WHEN 'C_D5_1' THEN 'core'  WHEN 'C_D5_2' THEN 'core'  WHEN 'C_D5_3' THEN 'core'
        WHEN 'C_D6_1' THEN 'core'  WHEN 'C_D6_4' THEN 'core'
        WHEN 'C_D1_2' THEN 'important'  WHEN 'C_D2_3' THEN 'important'  WHEN 'C_D3_3' THEN 'important'
        ELSE 'supporting'
    END
FROM t_p61016064_digital_innovation_i.professional_role_profiles r,
     t_p61016064_digital_innovation_i.professional_competencies c
WHERE r.code = 'operations_manager'
ON CONFLICT (role_profile_id, competency_id) DO NOTHING;
