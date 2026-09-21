-- Раздел 3 ТЗ итерации 4, публикационный чек-лист: «проверка или подтверждение
-- выполнены неуполномоченным пользователем» — нужно знать, обладал ли actor
-- правом can_confirm В МОМЕНТ принятия решения (роль могла измениться позже).
ALTER TABLE exec_process_review_decision ADD COLUMN IF NOT EXISTS actor_authorized BOOLEAN NOT NULL DEFAULT true;
COMMENT ON COLUMN exec_process_review_decision.actor_authorized IS
    'can_confirm actor-а на момент принятия решения confirmed/published — публикационный чек-лист блокирует, если запись подтверждения/публикации сделана неуполномоченным пользователем.';
