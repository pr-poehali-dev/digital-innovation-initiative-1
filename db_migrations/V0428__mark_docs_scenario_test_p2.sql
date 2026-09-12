UPDATE exec_package SET is_test_data = true WHERE title LIKE 'ТЕСТ-DOCS:%';
UPDATE exec_task SET is_test_data = true, archived_at = now(), archived_by = 'docs-scenario-test@internal'
    WHERE title LIKE 'ТЕСТ-DOCS:%' AND archived_at IS NULL;
