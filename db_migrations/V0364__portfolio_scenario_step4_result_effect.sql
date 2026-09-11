INSERT INTO exec_result (title, result_kind, project_id, created_by)
VALUES ('ТЕСТ: синтетический результат', 'report', 1, 'scenario_test');

INSERT INTO exec_effect (title, result_id, metric, baseline_value, plan_value, calculation_method, created_by)
VALUES ('ТЕСТ: синтетический эффект', 1, 'Время обработки', '10 дней', '3 дня', 'Замер по журналу заявок', 'scenario_test');
