
-- Очистка дубликата education_items, созданного при первой неудачной попытке загрузки
UPDATE education_items SET archived_at = NOW() WHERE id = 1 AND user_id = 1;
