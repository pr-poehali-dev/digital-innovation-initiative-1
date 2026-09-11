UPDATE exec_project SET status = 'in_progress', progress_pct = 50 WHERE title = 'ТЕСТ: синтетический проект';
UPDATE exec_task SET status = 'done', fact_date = CURRENT_DATE WHERE title = 'ТЕСТ: синтетическая задача 1';
