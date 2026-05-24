
-- Задание: "Подготовить дипломную работу по образцу"
INSERT INTO tasks (project_id, created_by, title, task_type, topic, goal, audience, language, style, requested_slide_count, additional_instructions, status)
VALUES (
  1, 1,
  'Дипломная работа: Цифровая трансформация управления проектами',
  'write_text',
  'Цифровая трансформация управления проектами в крупной организации',
  'Разработать методику внедрения цифровых инструментов в проектное управление',
  'Дипломная комиссия, научный руководитель',
  'ru',
  'академический',
  NULL,
  'Объём 60-80 страниц. Структура: введение, 3 главы, заключение. Учти все требования стандарта IPMO к оформлению.',
  'active'
) RETURNING id;

-- Связи документов с ролями
INSERT INTO task_documents (task_id, document_id, role) VALUES
(1, 1, 'standard'),                -- стандарт IPMO
(1, 2, 'reference_presentation'),   -- образец презентации
(1, 3, 'content_source');           -- конспект лекций

-- Лог активности
INSERT INTO activity_log (project_id, user_id, action, entity_type, entity_id, details) VALUES
(1, 1, 'created_project', 'project', 1, 'Дипломная работа 2026'),
(1, 1, 'uploaded_document', 'document', 1, 'Стандарт IPMO ICB 4.0.pdf'),
(1, 1, 'uploaded_document', 'document', 2, 'Защита диплома 2024 — образец.pptx'),
(1, 1, 'uploaded_document', 'document', 3, 'Конспект — Управление проектами в digital.docx'),
(1, 1, 'created_task', 'task', 1, 'Дипломная работа: Цифровая трансформация управления проектами');
