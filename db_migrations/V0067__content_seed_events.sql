INSERT INTO t_p61016064_digital_innovation_i.admin_communication_events
  (communication_id, event_type, event_value, meta_json, created_by)
SELECT c.id, 'queued',    NULL, '{}'::jsonb,                            'seed' FROM t_p61016064_digital_innovation_i.admin_communications c WHERE c.comm_no = 'COM-1001'
UNION ALL
SELECT c.id, 'sent',      NULL, '{"recipients": 3}'::jsonb,            'seed' FROM t_p61016064_digital_innovation_i.admin_communications c WHERE c.comm_no = 'COM-1001'
UNION ALL
SELECT c.id, 'delivered', NULL, '{"delivered": 3, "opened": 2}'::jsonb,'seed' FROM t_p61016064_digital_innovation_i.admin_communications c WHERE c.comm_no = 'COM-1001'
UNION ALL
SELECT c.id, 'queued', NULL, '{}'::jsonb,                'seed' FROM t_p61016064_digital_innovation_i.admin_communications c WHERE c.comm_no = 'COM-1002'
UNION ALL
SELECT c.id, 'sent',   NULL, '{"recipients": 3}'::jsonb, 'seed' FROM t_p61016064_digital_innovation_i.admin_communications c WHERE c.comm_no = 'COM-1002'
UNION ALL
SELECT c.id, 'queued', NULL, '{}'::jsonb,                                                    'seed' FROM t_p61016064_digital_innovation_i.admin_communications c WHERE c.comm_no = 'COM-1005'
UNION ALL
SELECT c.id, 'failed', 'smtp_connection_refused', '{"error": "smtp.example.com:587"}'::jsonb,'seed' FROM t_p61016064_digital_innovation_i.admin_communications c WHERE c.comm_no = 'COM-1005';
