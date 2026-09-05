
CREATE TABLE exec_person_functional_role (
    id                  serial PRIMARY KEY,
    person_id           integer NOT NULL REFERENCES exec_person(id),
    title               varchar(300) NOT NULL,
    scope               varchar(200) NULL,
    role_type           varchar(30) NOT NULL DEFAULT 'additional',
    status              varchar(20) NOT NULL DEFAULT 'assigned',
    participation_format varchar(30) NULL,
    authority_source    varchar(300) NULL,
    purpose             text NULL,
    duties              text NULL,
    not_included        text NULL,
    related_center_id   integer NULL REFERENCES exec_center(id),
    date_from           date NULL,
    date_to             date NULL,
    note                text NULL,
    created_by          varchar(255) NULL,
    created_at          timestamp NOT NULL DEFAULT now(),
    updated_at          timestamp NOT NULL DEFAULT now()
);

CREATE INDEX idx_exec_person_functional_role_person ON exec_person_functional_role(person_id);

COMMENT ON TABLE exec_person_functional_role IS
'Дополнительные функциональные роли сотрудника (например CDS), не являющиеся штатной должностью и не привязанные к конкретной инициативе. Отделены от должности exec_person.position_title и от ролей в exec_role_assignment/exec_function_raci.';
