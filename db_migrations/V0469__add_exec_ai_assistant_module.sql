-- Новый AI-модуль: управленческий помощник (сводки проекта, отклонения,
-- просрочки, критический путь, риски, ресурсные конфликты, KPI) —
-- отдельный переключатель в существующей единой системе управления AI
-- (ai_global_settings + ai_module_settings), тот же принцип, что у уже
-- работающих модулей exec_knowledge/ai_chat. Новую таблицу/cloud function
-- не создаём — используем существующий контур.
INSERT INTO ai_module_settings (module_code, module_label, service, trigger_type, is_enabled, data_description)
SELECT 'exec_ai_assistant', 'AI-помощник руководителя (сводки, отклонения, риски)', 'YandexGPT', 'manual', false,
       'Сроки, статусы, отклонения, критический путь, риски/проблемы, ресурсные конфликты и KPI проекта — только по явному запросу владельца кабинета'
WHERE NOT EXISTS (SELECT 1 FROM ai_module_settings WHERE module_code = 'exec_ai_assistant');
