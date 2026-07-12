-- Включаем режим "Полигон трансформации" для проекта ДФМ (id=12),
-- чтобы приглашённый участник видел все разделы Полигона сразу после регистрации.
UPDATE t_p61016064_digital_innovation_i.projects
SET workspace_mode = 'polygon', updated_at = NOW()
WHERE id = 12;