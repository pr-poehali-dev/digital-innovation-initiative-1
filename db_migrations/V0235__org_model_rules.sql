-- Правило: только ОДИН owner на функцию (partial unique index)
CREATE UNIQUE INDEX IF NOT EXISTS uq_fou_single_owner
ON t_p61016064_digital_innovation_i.function_org_units(function_id)
WHERE role = 'owner';

-- Анти-дубли направлений: одно направление не повторяется у одной функции
CREATE UNIQUE INDEX IF NOT EXISTS uq_fd_function_direction
ON t_p61016064_digital_innovation_i.function_directions(function_id, direction_code);

-- Архивация вместо удаления для org_units
ALTER TABLE t_p61016064_digital_innovation_i.org_units
ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT false;