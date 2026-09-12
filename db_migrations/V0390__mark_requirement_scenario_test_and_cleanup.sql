UPDATE exec_project SET is_test_data = true WHERE title = 'ТЕСТ-REQ: проект';
UPDATE exec_task SET is_test_data = true WHERE title LIKE 'ТЕСТ-REQ:%';
UPDATE exec_milestone SET is_test_data = true WHERE title LIKE 'ТЕСТ-REQ:%';
UPDATE exec_resource_requirement SET is_test_data = true WHERE role_title LIKE 'ТЕСТ-REQ:%';
UPDATE exec_resource_assignment SET is_test_data = true WHERE comment LIKE '%ресурсной потребности%' AND project_id = 8;
