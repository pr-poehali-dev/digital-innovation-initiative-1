UPDATE t_p61016064_digital_innovation_i.passport_overlaps
SET status = 'resolved',
    resolution = 'Закрыто в W4.1: единый /backend/ai-context собирает HQ + Project + Passport из БД в реальном времени. Компонент AiContextExporter подключён на HQ, Project, Passport и Dashboard.',
    updated_at = NOW(), updated_by = 'w4.1'
WHERE title ILIKE '%AI context%не объединён%';

UPDATE t_p61016064_digital_innovation_i.project_waves
SET status = 'in_progress', updated_at = NOW(), updated_by = 'system'
WHERE wave_num = 4;
