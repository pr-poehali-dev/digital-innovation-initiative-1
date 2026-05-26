-- Добавляем visual prompts в дополнительные инструкции задания id=4
-- Чтобы при следующей генерации сработал visual pipeline
UPDATE t_p61016064_digital_innovation_i.tasks
SET additional_instructions =
'[[process: 5 этапов внедрения: анализ → проектирование → разработка → тестирование → запуск]]
[[timeline: январь — анализ, февраль — дизайн, март — разработка, апрель — интеграция, май — пилот, июнь — запуск]]',
    updated_at = NOW()
WHERE id = 4;
