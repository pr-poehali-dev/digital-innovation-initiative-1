UPDATE exec_milestone SET is_test_data = true WHERE title LIKE 'ТЕСТ-ROADMAP:%';
UPDATE exec_schedule_dependency SET is_test_data = true WHERE
  (src_kind = 'milestone' AND src_id IN (SELECT id FROM exec_milestone WHERE title LIKE 'ТЕСТ-ROADMAP:%'))
  OR (tgt_kind = 'milestone' AND tgt_id IN (SELECT id FROM exec_milestone WHERE title LIKE 'ТЕСТ-ROADMAP:%'));
