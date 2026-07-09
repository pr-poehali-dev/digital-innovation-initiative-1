-- Перенос данных ДФМ из проекта 1 (Дипломная работа) в проект 12 (кейс «ДФМ»),
-- который пользователь реально открывает. id узлов/функций и связи сохраняются.
UPDATE t_p61016064_digital_innovation_i.org_units
SET project_id = 12, updated_at = now()
WHERE project_id = 1;

UPDATE t_p61016064_digital_innovation_i.dept_functions
SET project_id = 12, updated_at = now()
WHERE project_id = 1;

-- Операционные профили функций (если заведены) — привязаны по function_id, но хранят project_id
UPDATE t_p61016064_digital_innovation_i.function_operating_profiles
SET project_id = 12
WHERE project_id = 1;

-- Процессные карточки функций
UPDATE t_p61016064_digital_innovation_i.function_process_cards
SET project_id = 12
WHERE project_id = 1;