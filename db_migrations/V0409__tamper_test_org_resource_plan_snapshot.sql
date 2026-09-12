-- Тест целостности снимка годового плана: намеренно портим payload
-- для проверки, что integrity_ok корректно обнаруживает расхождение
UPDATE exec_org_resource_plan_snapshot SET payload_json = '{"tampered": true}' WHERE id = 2;
