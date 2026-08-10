UPDATE admin_sessions SET revoked_at = now()
WHERE user_agent = 'e2e-scenario';

UPDATE exec_milestone SET is_test_data = true WHERE initiative_id = 1;
UPDATE exec_issue SET is_test_data = true WHERE initiative_id = 1;
UPDATE exec_risk SET is_test_data = true WHERE initiative_id = 1;
UPDATE exec_action SET is_test_data = true
WHERE issue_id IN (SELECT id FROM exec_issue WHERE initiative_id = 1);
UPDATE exec_escalation SET is_test_data = true
WHERE issue_id IN (SELECT id FROM exec_issue WHERE initiative_id = 1);
