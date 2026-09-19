-- Привязываем существующие задачи D1-D16 к стадиям S1-S8 по согласованному
-- распределению (действует для любого проекта с этими кодами задач).
UPDATE t_p61016064_digital_innovation_i.wb_case_workplan_task SET stage_code = v.stage_code
FROM (VALUES
    ('D1', 'S1'),
    ('D2', 'S2'), ('D3', 'S2'), ('D4', 'S2'),
    ('D5', 'S3'), ('D6', 'S3'),
    ('D7', 'S4'),
    ('D8', 'S5'), ('D9', 'S5'), ('D10', 'S5'), ('D11', 'S5'),
    ('D12', 'S6'), ('D13', 'S6'),
    ('D14', 'S7'), ('D15', 'S7'),
    ('D16', 'S8')
) AS v(code, stage_code)
WHERE wb_case_workplan_task.code = v.code;
