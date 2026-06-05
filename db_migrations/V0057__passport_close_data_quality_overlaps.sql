UPDATE t_p61016064_digital_innovation_i.passport_overlaps
SET status = 'resolved',
    resolution = 'Нормализация завершена: все 12 модулей получили role-based owner (platform@/product@/ops@/support@/content@/analytics@).',
    updated_at = NOW(), updated_by = 'normalization'
WHERE title ILIKE '%модулей не имеют%owner%';

UPDATE t_p61016064_digital_innovation_i.passport_overlaps
SET status = 'resolved',
    resolution = 'Нормализация завершена: все 14 сущностей получили SOT и owner. W3-сущности привязаны к запланированным модулям.',
    updated_at = NOW(), updated_by = 'normalization'
WHERE title ILIKE '%сущностей не имеют%source%';
