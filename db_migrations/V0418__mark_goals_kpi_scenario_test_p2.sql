UPDATE exec_indicator_methodology SET is_test_data = true WHERE indicator_id IN (
    SELECT id FROM exec_indicator WHERE title LIKE 'ТЕСТ-GOALS:%'
);
UPDATE exec_indicator_value SET is_test_data = true WHERE indicator_id IN (
    SELECT id FROM exec_indicator WHERE title LIKE 'ТЕСТ-GOALS:%'
);
