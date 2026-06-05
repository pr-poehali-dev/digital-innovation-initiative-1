INSERT INTO t_p61016064_digital_innovation_i.admin_tickets
  (ticket_no, status, priority, source, module_slug, requester_name, requester_email,
   subject, body, assignee_email, owner_email, created_by, updated_by, last_message_at)
VALUES
('TCK-1001','open','high','web','dashboard',
 'Ivan Petrov','ivan@example.com',
 'User cannot access project dashboard',
 'After login the dashboard loads blank. No errors in console visible to user. Reproducible on Chrome + Firefox.',
 'platform@project','platform@project','seed','seed', NOW() - INTERVAL '2 hours'),

('TCK-1002','new','urgent','manual','feature-flags',
 'Maria Sidorova','maria@example.com',
 'Feature flag not applied in production',
 'Flag admin_project_enabled shows enabled=true but the module is not visible in production environment.',
 '','ops@project','seed','seed', NOW() - INTERVAL '30 minutes'),

('TCK-1003','waiting_user','medium','web','passport',
 'Alexey Kozlov','alexey@example.com',
 'Passport owner update not saved',
 'When I update the owner field and click Save, the field reverts after page refresh.',
 'platform@project','platform@project','seed','seed', NOW() - INTERVAL '1 day'),

('TCK-1004','open','medium','web','alerts',
 'Support Team','support@example.com',
 'Duplicate alert notifications',
 'The 5xx spike alert fires twice per event. Suspect double-trigger from two overlapping windows.',
 'ops@project','ops@project','seed','seed', NOW() - INTERVAL '3 hours'),

('TCK-1005','pending','low','email','billing',
 'Elena Volkova','elena@example.com',
 'Billing question: when will invoice arrive',
 'Hello, I made a payment via YooKassa 3 days ago but have not received an invoice yet.',
 'support@project','support@project','seed','seed', NOW() - INTERVAL '5 hours'),

('TCK-1006','resolved','high','web','project',
 'Dmitry Morozov','dmitry@example.com',
 'Project conflict card missing after wave update',
 'After marking W3 as in_progress the open conflicts section on /admin/project became empty.',
 'platform@project','platform@project','seed','seed', NOW() - INTERVAL '6 hours'),

('TCK-1007','new','medium','system','errors',
 'System Monitor','monitor@system',
 'Automated: elevated 401 error rate detected',
 'Error rate for admin_session expired tokens exceeded 20/min threshold. Possible token rotation issue.',
 '','ops@project','seed','seed', NOW());
