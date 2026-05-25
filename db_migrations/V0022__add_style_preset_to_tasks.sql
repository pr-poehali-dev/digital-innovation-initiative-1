
-- Этап 1.2.1: style_preset для задач + doc_prompt уже есть как instruction в task_documents
-- Добавим только style_preset, instruction уже используется

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS style_preset VARCHAR(64);
-- style_preset: from_template / dark_corporate / light_minimal / academic / marketing / scientific
-- если from_template — берём цвета из PPTX-образца с ролью template

COMMENT ON COLUMN tasks.style_preset IS 'Визуальный пресет PPTX-экспорта';
