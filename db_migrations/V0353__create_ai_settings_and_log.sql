CREATE TABLE ai_module_settings (
    id SERIAL PRIMARY KEY,
    module_code VARCHAR(64) NOT NULL UNIQUE,
    module_label VARCHAR(200) NOT NULL,
    service VARCHAR(32) NOT NULL,
    trigger_type VARCHAR(16) NOT NULL DEFAULT 'manual',
    is_enabled BOOLEAN NOT NULL DEFAULT false,
    data_description TEXT,
    last_used_at TIMESTAMP NULL,
    last_result VARCHAR(32) NULL,
    updated_by VARCHAR(255) NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT now(),
    created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE ai_global_settings (
    id SERIAL PRIMARY KEY,
    is_enabled BOOLEAN NOT NULL DEFAULT false,
    updated_by VARCHAR(255) NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT now()
);

INSERT INTO ai_global_settings (is_enabled, updated_by) VALUES (false, 'system_init');

CREATE TABLE ai_operation_log (
    id SERIAL PRIMARY KEY,
    module_code VARCHAR(64) NOT NULL,
    service VARCHAR(32) NOT NULL,
    action VARCHAR(64) NOT NULL,
    object_type VARCHAR(64) NULL,
    object_id VARCHAR(64) NULL,
    data_kind VARCHAR(64) NULL,
    approx_volume INTEGER NULL,
    result VARCHAR(32) NOT NULL,
    error_message TEXT NULL,
    duration_ms INTEGER NULL,
    initiated_by VARCHAR(255) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_operation_log_created ON ai_operation_log(created_at DESC);
CREATE INDEX idx_ai_operation_log_module ON ai_operation_log(module_code);

INSERT INTO ai_module_settings (module_code, module_label, service, trigger_type, is_enabled, data_description) VALUES
('exec_knowledge', 'База знаний и RAG (AI-планировщик)', 'YandexGPT', 'manual', false, 'Фрагменты внутренних регламентов и документов кабинета'),
('media_upload', 'Обработка изображений и аудио', 'Vision/SpeechKit', 'manual', false, 'Содержимое загруженных фото и аудиофайлов'),
('education', 'Образовательные документы', 'YandexGPT', 'manual', false, 'Текст CV, сертификатов, дипломов'),
('ai_chat', 'AI-чат', 'YandexGPT', 'manual', false, 'История переписки пользователя с ассистентом'),
('generate', 'Генерация презентаций и материалов', 'YandexGPT', 'manual', false, 'Чанки документов проекта'),
('search', 'Поиск и чат по документам', 'YandexGPT', 'manual', false, 'Фрагменты документов проекта'),
('workspace', 'AI-копайлот проекта', 'YandexGPT', 'manual', false, 'Цели, стейкхолдеры, гипотезы, фрагменты файлов'),
('admin_strategy', 'Стратегия и аналитика', 'YandexGPT', 'manual', false, 'Метрики продукта, квартальные цели'),
('dept_functions', 'Функции подразделений', 'YandexGPT', 'manual', false, 'Функции, процессы, компетенции организации'),
('professional', 'Профессиональные материалы', 'YandexGPT', 'manual', false, 'Содержимое рабочих артефактов проекта'),
('goals', 'Цели и развитие', 'YandexGPT', 'manual', false, 'Образовательный паспорт, цели развития'),
('audit', 'Аудит документов и презентаций', 'YandexGPT', 'manual', false, 'Полный текст документов и слайдов'),
('glossary', 'Глоссарий', 'YandexGPT', 'manual', false, 'Термин и общий оргконтекст'),
('learning_pack', 'Учебные материалы (саммари)', 'YandexGPT', 'manual', false, 'Текст учебного материала'),
('learning', 'Обучение и квизы', 'YandexGPT', 'manual', false, 'Учебный контент, вопросы для проверки');
