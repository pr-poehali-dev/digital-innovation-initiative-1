UPDATE exec_project SET is_test_data = true WHERE title IN ('ТЕСТ-V2: проект', 'ТЕСТ-V2: проект Б');
UPDATE exec_resource_assignment SET is_test_data = true WHERE project_id IN (6, 7);
UPDATE exec_budget_version SET is_test_data = true WHERE project_id = 6;
UPDATE exec_financial_actual SET is_test_data = true WHERE project_id = 6;
UPDATE exec_financial_commitment SET is_test_data = true WHERE project_id = 6;
UPDATE exec_financial_expected SET is_test_data = true WHERE project_id = 6;
UPDATE exec_fot_plan SET is_test_data = true WHERE project_id = 6;
