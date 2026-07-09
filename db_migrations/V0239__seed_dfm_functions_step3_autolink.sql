-- Шаг 4: автопривязка функций ДФМ к узлам оргдерева ТОЛЬКО по exact match code == org_units.code.
-- Исключаем medium-confidence формулировки (они уходят в unmatched → ручная верификация):
--   'вопросам консультирование под работников' (4.1), 'контроль методическая обязательному поддержка' (4.2).
INSERT INTO t_p61016064_digital_innovation_i.function_org_units
    (function_id, org_unit_id, role, confidence, source_ref)
SELECT f.id, u.id, 'owner', 0.9, 'manual:' || f.source_section_code
FROM t_p61016064_digital_innovation_i.dept_functions f
JOIN t_p61016064_digital_innovation_i.org_units u
     ON u.project_id = 1 AND u.code = f.source_section_code AND u.is_archived = false
WHERE f.project_id = 1
  AND f.dept_name = 'Департамент финансового мониторинга (ДФМ)'
  AND f.source_section_code <> ''
  AND f.normalized_title NOT IN ('вопросам консультирование под работников', 'контроль методическая обязательному поддержка')
ON CONFLICT (function_id, org_unit_id, role) DO NOTHING;