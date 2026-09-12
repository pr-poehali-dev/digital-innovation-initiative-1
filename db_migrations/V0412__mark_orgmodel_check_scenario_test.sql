UPDATE exec_center_role SET is_test_data = true WHERE title LIKE 'ТЕСТ-ORGMODEL:%';
UPDATE exec_role_position SET is_test_data = true WHERE role_id IN (
    SELECT id FROM exec_center_role WHERE title LIKE 'ТЕСТ-ORGMODEL:%'
);
UPDATE exec_resource_requirement SET is_test_data = true WHERE role_title LIKE 'ТЕСТ-ORGMODEL:%';
UPDATE exec_org_resource_plan_version SET is_test_data = true WHERE title LIKE 'ТЕСТ-ORGMODEL:%';
UPDATE exec_raci_matrix SET valid_to = CURRENT_DATE
    WHERE entity_type = 'project' AND entity_id = 9 AND valid_to IS NULL;
