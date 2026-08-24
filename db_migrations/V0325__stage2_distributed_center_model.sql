-- ЭТАП 2, ШАГ 1: распределённая модель Центра.
-- Центр работает как рабочая модель ещё до официального создания:
-- статус меняется отдельно от готовности инструментов.

ALTER TABLE t_p61016064_digital_innovation_i.exec_center
    ADD COLUMN IF NOT EXISTS reserve_pct numeric(5,2) NOT NULL DEFAULT 15,
    ADD COLUMN IF NOT EXISTS annual_fund_hours numeric(8,1) NOT NULL DEFAULT 1900,
    ADD COLUMN IF NOT EXISTS backup_coverage_pct numeric(5,2) NOT NULL DEFAULT 30;

COMMENT ON COLUMN t_p61016064_digital_innovation_i.exec_center.status IS
    'modeling — моделирование, preparation — подготовка к созданию, '
    'proposed — на согласовании, active — действует, archived — архив';
COMMENT ON COLUMN t_p61016064_digital_innovation_i.exec_center.reserve_pct IS
    'Резерв на внеплановые задачи, % от расчётной трудоёмкости';
COMMENT ON COLUMN t_p61016064_digital_innovation_i.exec_center.annual_fund_hours IS
    'Полезный годовой фонd времени одного сотрудника, часов';
COMMENT ON COLUMN t_p61016064_digital_innovation_i.exec_center.backup_coverage_pct IS
    'Доля ёмкости критичных функций, закладываемая на замещение и непрерывность';

-- Единственная запись Центра переводится в режим моделирования
UPDATE t_p61016064_digital_innovation_i.exec_center SET status = 'modeling';

-- Категория работы функции: нужна для расшифровки расчёта численности
-- по постоянным функциям, проектной работе, управлению и аналитике
ALTER TABLE t_p61016064_digital_innovation_i.exec_center_function
    ADD COLUMN IF NOT EXISTS work_category varchar(30) NOT NULL DEFAULT 'operational';

ALTER TABLE t_p61016064_digital_innovation_i.exec_center_function
    ADD CONSTRAINT chk_function_work_category
    CHECK (work_category IN ('operational', 'project', 'management', 'analytics'));

COMMENT ON COLUMN t_p61016064_digital_innovation_i.exec_center_function.work_category IS
    'operational — постоянная функция, project — проектная работа, '
    'management — управление и координация, analytics — аналитика и отчётность';

-- Участие сотрудника распределённой команды в модели Центра.
-- Функции и роль (RACI) не дублируются: они уже есть в exec_function_raci.
-- Здесь фиксируется только то, чего не хватает: формат участия, доля времени
-- для Центра, источник ресурса и перспектива перевода.
CREATE TABLE t_p61016064_digital_innovation_i.exec_person_center_participation (
    id serial PRIMARY KEY,
    person_id integer NOT NULL REFERENCES t_p61016064_digital_innovation_i.exec_person(id),
    center_id integer NOT NULL REFERENCES t_p61016064_digital_innovation_i.exec_center(id),
    role_in_model varchar(50),
    participation_format varchar(20) NOT NULL DEFAULT 'partial',
    center_hours_per_week numeric(5,1),
    target_role_title varchar(300),
    planned_transfer boolean NOT NULL DEFAULT false,
    resource_source varchar(30) NOT NULL DEFAULT 'own_staff',
    date_from date,
    date_to date,
    note text,
    created_at timestamp NOT NULL DEFAULT now(),
    updated_at timestamp NOT NULL DEFAULT now()
);

ALTER TABLE t_p61016064_digital_innovation_i.exec_person_center_participation
    ADD CONSTRAINT chk_participation_format
    CHECK (participation_format IN ('permanent', 'partial', 'expert', 'temporary')),
    ADD CONSTRAINT chk_participation_source
    CHECK (resource_source IN ('own_staff', 'other_unit', 'project_team', 'contractor'));

COMMENT ON TABLE t_p61016064_digital_innovation_i.exec_person_center_participation IS
    'Участие сотрудника распределённой команды в модели Центра до его официального создания';
COMMENT ON COLUMN t_p61016064_digital_innovation_i.exec_person_center_participation.center_hours_per_week IS
    'Доля общей ёмкости человека, выделенная на задачи Центра — база для расчёта загрузки Центра';