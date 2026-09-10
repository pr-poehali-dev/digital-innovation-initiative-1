
ALTER TABLE exec_center_function ADD COLUMN IF NOT EXISTS bank_code varchar(20);
ALTER TABLE exec_center_function ADD COLUMN IF NOT EXISTS bank_code_extra varchar(200);

UPDATE exec_center_function SET bank_code='93.11', bank_code_extra='81.101'
  WHERE center_id=1 AND code='F01';
UPDATE exec_center_function SET bank_code='81.11', bank_code_extra='93.15'
  WHERE center_id=1 AND code='F02';
UPDATE exec_center_function SET bank_code='81.11', bank_code_extra='96.51'
  WHERE center_id=1 AND code='F03';
UPDATE exec_center_function SET bank_code='81.11', bank_code_extra='81.15'
  WHERE center_id=1 AND code='F04';
UPDATE exec_center_function SET bank_code='81.22', bank_code_extra='81.82'
  WHERE center_id=1 AND code='F05';
UPDATE exec_center_function SET bank_code='81.834', bank_code_extra='81.226, 81.42'
  WHERE center_id=1 AND code='F06';
UPDATE exec_center_function SET bank_code='81.833', bank_code_extra='96.4, 96.42, 81.83, 81.85'
  WHERE center_id=1 AND code='F07';
UPDATE exec_center_function SET bank_code='81.25', bank_code_extra='93.11'
  WHERE center_id=1 AND code='F08';
UPDATE exec_center_function SET bank_code='81.2', bank_code_extra='81.25'
  WHERE center_id=1 AND code='F09';
UPDATE exec_center_function SET bank_code='93.15', bank_code_extra='96.4'
  WHERE center_id=1 AND code='F10';
UPDATE exec_center_function SET bank_code='93.15', bank_code_extra='81.15'
  WHERE center_id=1 AND code='F11';
UPDATE exec_center_function SET bank_code='93.11', bank_code_extra='81.342'
  WHERE center_id=1 AND code='F12';

INSERT INTO exec_center_function
    (center_id, code, title, purpose, work_category, regularity, hours_per_month, criticality, status, sort_order, bank_code, bank_code_extra)
VALUES
    (1,'F13','Тиражирование и повторное использование решений',
     'Снижать стоимость и сроки цифровизации за счёт переиспользования уже созданных решений',
     'project','on_demand',20.0,'medium','planned',13,'81.2','81.52'),
    (1,'F14','Развитие цифровых компетенций и сообщества Блока ВК',
     'Обеспечить реальное использование внедрённых решений сотрудниками Блока',
     'management','monthly',24.0,'medium','planned',14,'93.15','81.15')
ON CONFLICT DO NOTHING;
