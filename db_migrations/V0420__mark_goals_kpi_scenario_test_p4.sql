UPDATE exec_link SET is_test_data = true WHERE src_kind = 'goal' AND src_id IN (
    SELECT id FROM exec_center_goal WHERE title LIKE 'ТЕСТ-GOALS:%'
);
