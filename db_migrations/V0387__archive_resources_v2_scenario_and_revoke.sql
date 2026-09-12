UPDATE exec_resource_assignment SET archived_at = now(), archived_by = 'resources-v2-test@internal'
WHERE project_id IN (6, 7) AND archived_at IS NULL;

UPDATE exec_project SET archived_at = now(), archived_by = 'resources-v2-test@internal'
WHERE title IN ('ТЕСТ-V2: проект', 'ТЕСТ-V2: проект Б') AND archived_at IS NULL;

UPDATE admin_sessions SET revoked_at = now()
WHERE actor_email = 'resources-v2-test@internal' AND revoked_at IS NULL;
