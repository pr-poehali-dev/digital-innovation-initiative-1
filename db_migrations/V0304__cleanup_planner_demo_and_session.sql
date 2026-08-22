-- Убираем демо-план проверки и отзываем временную сессию
UPDATE t_p61016064_digital_innovation_i.exec_plan
SET status = 'archived', updated_at = now()
WHERE id = 1 AND title = 'Запустить мониторинг инициатив блока';

UPDATE t_p61016064_digital_innovation_i.exec_plan_step
SET status = 'cancelled', updated_at = now()
WHERE plan_id = 1;

UPDATE t_p61016064_digital_innovation_i.admin_sessions
SET revoked_at = now()
WHERE session_token_hash = '79ab2df804560715d0467970b895b3a9e9120041dbe0cbeb99d279735e18b9e0';
