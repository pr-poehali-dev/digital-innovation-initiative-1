UPDATE t_p61016064_digital_innovation_i.passport_overlaps
SET status = 'resolved',
    resolution = 'Закрыто в W3.1: дашборд переработан на Command Center с тремя группами — Platform, Operations, Users & Projects.',
    updated_at = NOW(), updated_by = 'w3.1'
WHERE title ILIKE '%карточки Platform%Operations%';

UPDATE t_p61016064_digital_innovation_i.project_waves
SET status = 'in_progress', updated_at = NOW(), updated_by = 'system'
WHERE wave_num = 3;
