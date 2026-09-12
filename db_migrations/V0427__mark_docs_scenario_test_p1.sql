UPDATE exec_doc_template SET is_test_data = true WHERE title LIKE 'ТЕСТ-DOCS:%';
UPDATE exec_doc_version SET is_test_data = true WHERE title LIKE 'ТЕСТ-DOCS:%';
