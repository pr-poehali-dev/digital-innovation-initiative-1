-- Владелец явно разрешил включить готовый AI-контур. Включаем ТОЛЬКО
-- глобальный тумблер и модуль exec_ai_assistant (управленческий
-- помощник) — остальные 15 AI-модулей остаются выключенными, как и было.
-- Новый провайдер не подключается, новая cloud function не создаётся —
-- используется существующий YandexGPT-контур. Если секреты
-- YANDEX_GPT_API_KEY/YANDEX_FOLDER_ID фактически пусты, существующий код
-- call_gpt() в backend/exec-planner-ai корректно вернёт понятную ошибку
-- "AI недоступен: не настроен ключ YandexGPT", которую фронтенд уже умеет
-- показывать как явное состояние "ИИ не настроен" — имитации успеха нет.
UPDATE ai_global_settings SET is_enabled = true, updated_by = 'owner_enabled_2026-09-13'
WHERE id = (SELECT id FROM ai_global_settings ORDER BY id DESC LIMIT 1);

UPDATE ai_module_settings SET is_enabled = true, updated_by = 'owner_enabled_2026-09-13'
WHERE module_code = 'exec_ai_assistant';
