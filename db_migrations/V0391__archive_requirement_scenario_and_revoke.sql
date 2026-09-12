UPDATE exec_resource_assignment SET archived_at = now(), archived_by = 'requirement-test@internal'
WHERE project_id = 8 AND archived_at IS NULL;
UPDATE exec_resource_requirement SET archived_at = now(), archived_by = 'requirement-test@internal'
WHERE project_id = 8 AND archived_at IS NULL;
UPDATE exec_task SET archived_at = now(), archived_by = 'requirement-test@internal'
WHERE title LIKE 'ТЕСТ-REQ:%' AND archived_at IS NULL;
UPDATE exec_project SET archived_at = now(), archived_by = 'requirement-test@internal'
WHERE title = 'ТЕСТ-REQ: проект' AND archived_at IS NULL;

UPDATE admin_sessions SET revoked_at = now()
WHERE actor_email = 'requirement-test@internal' AND revoked_at IS NULL;
