UPDATE exec_effect SET archived_at = now() WHERE title = 'ТЕСТ: синтетический эффект';
UPDATE exec_result SET archived_at = now() WHERE title = 'ТЕСТ: синтетический результат';
UPDATE exec_task SET archived_at = now() WHERE title LIKE 'ТЕСТ: синтетическая задача%';
UPDATE exec_link SET archived_at = now() WHERE note = 'сценарная проверка';
UPDATE exec_project SET archived_at = now(), archived_by = 'scenario_test' WHERE title = 'ТЕСТ: синтетический проект';
