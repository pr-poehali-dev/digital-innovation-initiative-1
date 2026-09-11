-- Резервная копия перед добавлением ресурсно-бюджетного контура
CREATE TABLE IF NOT EXISTS exec_project_backup_v0379 AS SELECT *, now() AS backup_created_at FROM exec_project;
CREATE TABLE IF NOT EXISTS exec_initiative_backup_v0379 AS SELECT *, now() AS backup_created_at FROM exec_initiative;
