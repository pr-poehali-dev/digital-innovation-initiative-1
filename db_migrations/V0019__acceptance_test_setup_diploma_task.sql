
-- Acceptance test setup: IPMO обязательный с high priority,
-- образец с явной инструкцией не копировать содержание
UPDATE task_documents
SET priority = 'high', must_use = true,
    instruction = 'Возьми отсюда обязательные разделы дипломной работы (введение, 3 главы, заключение, список литературы 30+) и требования к оформлению.'
WHERE task_id = 1 AND document_id = 1;

UPDATE task_documents
SET priority = 'medium',
    usage_mode = 'format_only',
    instruction = 'НЕ копируй вехи и тезисы про банковский сектор — это чужая тема. Возьми ТОЛЬКО формат: число слайдов, паттерн заголовков, плотность текста, наличие блоков цель/задачи/выводы.'
WHERE task_id = 1 AND document_id = 2;

UPDATE task_documents
SET priority = 'high',
    usage_mode = 'full_content',
    instruction = 'Это основной источник фактов и тезисов про управление проектами в digital. Бери ключевые идеи и формулировки.'
WHERE task_id = 1 AND document_id = 3;
