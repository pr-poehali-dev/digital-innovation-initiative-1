-- Сообщения для TCK-1001
INSERT INTO t_p61016064_digital_innovation_i.admin_ticket_messages
  (ticket_id, message_type, author_name, author_email, body, created_by)
SELECT id, 'public_reply', 'Ivan Petrov', 'ivan@example.com',
  'I tried clearing cache and cookies but the issue persists. The spinner just keeps going indefinitely.', 'seed'
FROM t_p61016064_digital_innovation_i.admin_tickets WHERE ticket_no = 'TCK-1001';

INSERT INTO t_p61016064_digital_innovation_i.admin_ticket_messages
  (ticket_id, message_type, author_name, author_email, body, created_by)
SELECT id, 'internal_note', 'platform@project', 'platform@project',
  'Looks like the BOTTOM_ITEMS bug. Already fixed in commit 9666645. Need to verify the deployed version matches.', 'seed'
FROM t_p61016064_digital_innovation_i.admin_tickets WHERE ticket_no = 'TCK-1001';

INSERT INTO t_p61016064_digital_innovation_i.admin_ticket_messages
  (ticket_id, message_type, author_name, author_email, body, created_by)
SELECT id, 'public_reply', 'platform@project', 'platform@project',
  'We have identified and fixed the root cause. The fix is deployed. Please try clearing cache and refreshing.', 'seed'
FROM t_p61016064_digital_innovation_i.admin_tickets WHERE ticket_no = 'TCK-1001';

-- Сообщения для TCK-1003
INSERT INTO t_p61016064_digital_innovation_i.admin_ticket_messages
  (ticket_id, message_type, author_name, author_email, body, created_by)
SELECT id, 'public_reply', 'platform@project', 'platform@project',
  'Thank you for the report. We are investigating. Could you confirm which browser and which owner field specifically?', 'seed'
FROM t_p61016064_digital_innovation_i.admin_tickets WHERE ticket_no = 'TCK-1003';

INSERT INTO t_p61016064_digital_innovation_i.admin_ticket_messages
  (ticket_id, message_type, author_name, author_email, body, created_by)
SELECT id, 'internal_note', 'platform@project', 'platform@project',
  'The owner_email field update goes through the passport API. The normalization migration may have set updated_by=normalization which could cause a conflict. Need to check the PUT handler.', 'seed'
FROM t_p61016064_digital_innovation_i.admin_tickets WHERE ticket_no = 'TCK-1003';

-- Сообщения для TCK-1006
INSERT INTO t_p61016064_digital_innovation_i.admin_ticket_messages
  (ticket_id, message_type, author_name, author_email, body, created_by)
SELECT id, 'public_reply', 'platform@project', 'platform@project',
  'Confirmed and fixed. The issue was a race condition in the wave status update that cleared the conflicts filter.', 'seed'
FROM t_p61016064_digital_innovation_i.admin_tickets WHERE ticket_no = 'TCK-1006';

INSERT INTO t_p61016064_digital_innovation_i.admin_ticket_messages
  (ticket_id, message_type, author_name, author_email, body, created_by)
SELECT id, 'system_event', 'System', 'system',
  'Статус изменён → resolved', 'seed'
FROM t_p61016064_digital_innovation_i.admin_tickets WHERE ticket_no = 'TCK-1006';

-- Обновляем resolved_at для TCK-1006
UPDATE t_p61016064_digital_innovation_i.admin_tickets
SET resolved_at = NOW() - INTERVAL '4 hours'
WHERE ticket_no = 'TCK-1006';

-- first_response_at
UPDATE t_p61016064_digital_innovation_i.admin_tickets t
SET first_response_at = NOW() - INTERVAL '1 hour'
WHERE ticket_no IN ('TCK-1001', 'TCK-1003', 'TCK-1006');
