-- Деактивируем тестового viewer-пользователя после проверки прав доступа
-- редактора схем (Итерация 2). Тестовая диаграмма/узлы/дорожки остаются
-- привязанными к процессу с is_test_data=true (уже отфильтрованы из
-- рабочих метрик overview) — используются далее как площадка для
-- демонстрации редактора, при необходимости будут удалены вручную позже.

UPDATE exec_cabinet_access SET is_active = false WHERE email = 'viewer-diagram-smoke@internal.local';
UPDATE sessions SET expires_at = now() - interval '1 day' WHERE id = 'pm-diagram-smoke-session-0001';
