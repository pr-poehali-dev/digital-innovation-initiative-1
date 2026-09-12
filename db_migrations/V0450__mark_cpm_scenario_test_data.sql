UPDATE exec_project SET is_test_data = true WHERE title LIKE 'ТЕСТ-CPM:%';
UPDATE exec_task SET is_test_data = true WHERE title LIKE 'ТЕСТ-CPM:%';
UPDATE exec_milestone SET is_test_data = true WHERE title LIKE 'ТЕСТ-CPM:%';
UPDATE exec_initiative SET is_test_data = true, status = 'closed' WHERE title LIKE 'ТЕСТ-CPM:%';
UPDATE exec_schedule_dependency SET is_test_data = true WHERE
  (src_kind = 'task' AND src_id IN (SELECT id FROM exec_task WHERE title LIKE 'ТЕСТ-CPM:%'))
  OR (tgt_kind = 'task' AND tgt_id IN (SELECT id FROM exec_task WHERE title LIKE 'ТЕСТ-CPM:%'))
  OR (tgt_kind = 'milestone' AND tgt_id IN (SELECT id FROM exec_milestone WHERE title LIKE 'ТЕСТ-CPM:%'));
