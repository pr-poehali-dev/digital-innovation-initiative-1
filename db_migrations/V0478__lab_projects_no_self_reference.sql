-- Защита от ссылки проекта реализации на самого себя как исходный лабораторный кейс
ALTER TABLE t_p61016064_digital_innovation_i.projects
    ADD CONSTRAINT chk_projects_no_self_source
    CHECK (source_lab_project_id IS NULL OR source_lab_project_id <> id);
