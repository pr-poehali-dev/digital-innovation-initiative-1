-- Резервная копия перед добавлением полей рабочего цикла руководителя
CREATE TABLE IF NOT EXISTS exec_cabinet_access_backup_v0394 AS
SELECT *, now() AS backup_created_at FROM exec_cabinet_access;
