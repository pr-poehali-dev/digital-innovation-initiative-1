-- Шаг 2: записи автоматизации для функций ДФМ (идемпотентно)
INSERT INTO t_p61016064_digital_innovation_i.dept_automation (function_id, project_id)
SELECT f.id, 1
FROM t_p61016064_digital_innovation_i.dept_functions f
WHERE f.project_id = 1
  AND f.dept_name = 'Департамент финансового мониторинга (ДФМ)'
  AND NOT EXISTS (SELECT 1 FROM t_p61016064_digital_innovation_i.dept_automation a WHERE a.function_id = f.id);

-- Шаг 3: направления (все функции ДФМ относятся к направлению 18 «Финансовый мониторинг»,
-- кроме «Взаимодействие с контрольно-надзорными органами» — оно без направления)
INSERT INTO t_p61016064_digital_innovation_i.function_directions
    (function_id, direction_code, direction_name, source_ref)
SELECT f.id, '18', 'Финансовый мониторинг', 'manual_from_screenshot'
FROM t_p61016064_digital_innovation_i.dept_functions f
WHERE f.project_id = 1
  AND f.dept_name = 'Департамент финансового мониторинга (ДФМ)'
  AND f.source_section_code <> ''
ON CONFLICT (function_id, direction_code) DO NOTHING;