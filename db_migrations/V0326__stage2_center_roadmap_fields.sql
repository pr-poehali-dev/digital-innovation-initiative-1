-- ЭТАП 2, ШАГ 2: дорожная карта создания Центра — часть паспорта,
-- не отдельная сущность. Нужна для мастера и экрана обоснования.

ALTER TABLE t_p61016064_digital_innovation_i.exec_center
    ADD COLUMN IF NOT EXISTS roadmap_text text,
    ADD COLUMN IF NOT EXISTS expected_effects text;

COMMENT ON COLUMN t_p61016064_digital_innovation_i.exec_center.roadmap_text IS
    'Дорожная карта создания Центра: этапы перехода от модели к штатной единице';
COMMENT ON COLUMN t_p61016064_digital_innovation_i.exec_center.expected_effects IS
    'Ожидаемые эффекты от официального создания Центра';