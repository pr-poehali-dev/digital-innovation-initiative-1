UPDATE exec_schedule_dependency SET archived_at = now(), archived_by = 'cpm_scenario_test_cleanup'
WHERE created_by = 'cpm_scenario_test_direct_insert' AND archived_at IS NULL;
