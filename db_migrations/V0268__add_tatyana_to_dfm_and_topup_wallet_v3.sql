-- 1. Добавляем Татьяну (user_id=4, t.mogilevskaya@mail.ru) в проект ДФМ (project_id=12)
INSERT INTO t_p61016064_digital_innovation_i.project_members (project_id, user_id, role)
VALUES (12, 4, 'member')
ON CONFLICT DO NOTHING;

-- Логируем в историю активности проекта
INSERT INTO t_p61016064_digital_innovation_i.activity_log (project_id, user_id, action, entity_type, entity_id, details)
VALUES (12, 1, 'invited_member', 'user', 4, 't.mogilevskaya@mail.ru');

-- 2. Пополняем кошелёк Татьяны на 5000 руб (500000 копеек)
UPDATE t_p61016064_digital_innovation_i.wallet_accounts
SET balance_kopecks = balance_kopecks + 500000, updated_at = NOW()
WHERE user_id = 4;

INSERT INTO t_p61016064_digital_innovation_i.wallet_transactions (user_id, wallet_id, amount_kopecks, type, status, source, description)
SELECT 4, id, 500000, 'topup', 'completed', 'manual_topup', 'Пополнение баланса вручную (Татьяна, ДФМ)'
FROM t_p61016064_digital_innovation_i.wallet_accounts WHERE user_id = 4;

-- Убираем ошибочное приглашение на неверный email
UPDATE t_p61016064_digital_innovation_i.project_invitations
SET status = 'cancelled'
WHERE project_id = 12 AND email = 'ttian4@yandex.ru' AND status = 'pending';