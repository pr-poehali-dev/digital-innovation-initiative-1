-- Идемпотентный перенос 6 legacy-записей exec_knowledge.
-- Исходные строки НЕ удаляются и НЕ перезаписываются.
-- Повторный запуск не создаёт дублей (защита через legacy_knowledge_map.legacy_id UNIQUE).

-- ===== №1: Матрица стейкхолдеров -> рабочий артефакт (файла нет) =====
INSERT INTO knowledge_entry (title, display_title, entry_type, body, origin_kind,
                             verification_state, applicability, ai_usage_policy, created_by)
SELECT k.title, 'Матрица стейкхолдеров по этапам инициативы', 'work_artifact', k.body,
       'human', 'unverified', 'reference_only', 'not_allowed', k.created_by
FROM exec_knowledge k
WHERE k.id = 1 AND NOT EXISTS (SELECT 1 FROM legacy_knowledge_map WHERE legacy_id = 1);

INSERT INTO legacy_knowledge_map (legacy_id, target_kind, target_entry_id, migration_note)
SELECT 1, 'knowledge_entry', ke.id,
       'Структурированный рабочий артефакт. Оригинального файла нет, источник не установлен.'
FROM knowledge_entry ke
WHERE ke.entry_type = 'work_artifact'
  AND ke.title = (SELECT title FROM exec_knowledge WHERE id = 1)
  AND NOT EXISTS (SELECT 1 FROM legacy_knowledge_map WHERE legacy_id = 1)
ORDER BY ke.id DESC LIMIT 1;

-- ===== №2: Рабочая группа, ЕСТЬ оригинал в S3 -> кандидат в канонический документ =====
INSERT INTO doc_source (title, display_title, source_kind, source_status, intake_channel, created_by)
SELECT k.title, k.title, 'order', 'not_established', 'file_upload', k.created_by
FROM exec_knowledge k
WHERE k.id = 2 AND NOT EXISTS (SELECT 1 FROM legacy_knowledge_map WHERE legacy_id = 2);

INSERT INTO doc_revision (source_id, revision_label, origin_kind, extraction_method,
                          processing_state, verification_state, applicability, created_by)
SELECT ds.id, NULL, 'import', 'docx_text_extract', 'text_extracted', 'unverified', 'unknown',
       (SELECT created_by FROM exec_knowledge WHERE id = 2)
FROM doc_source ds
WHERE ds.title = (SELECT title FROM exec_knowledge WHERE id = 2)
  AND NOT EXISTS (SELECT 1 FROM legacy_knowledge_map WHERE legacy_id = 2)
ORDER BY ds.id DESC LIMIT 1;

INSERT INTO doc_file (revision_id, original_name, mime_type, size_bytes, s3_key, file_presence)
SELECT dr.id, k.filename,
       'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
       k.file_size, k.s3_key, 'present'
FROM doc_revision dr
JOIN doc_source ds ON ds.id = dr.source_id
JOIN exec_knowledge k ON k.id = 2
WHERE ds.title = k.title
  AND NOT EXISTS (SELECT 1 FROM legacy_knowledge_map WHERE legacy_id = 2)
ORDER BY dr.id DESC LIMIT 1;

-- Текст как чанк с диапазоном символов; страница НЕ выдумывается (page_id NULL)
INSERT INTO doc_chunk (revision_id, chunk_index, content, content_length, char_start, char_end)
SELECT dr.id, 0, k.body, length(k.body), 0, length(k.body)
FROM doc_revision dr
JOIN doc_source ds ON ds.id = dr.source_id
JOIN exec_knowledge k ON k.id = 2
WHERE ds.title = k.title AND k.body IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM legacy_knowledge_map WHERE legacy_id = 2)
ORDER BY dr.id DESC LIMIT 1;

INSERT INTO legacy_knowledge_map (legacy_id, target_kind, target_source_id, target_revision_id, migration_note)
SELECT 2, 'doc_source', ds.id, dr.id,
       'Кандидат на канонический документ: оригинал DOCX в S3 присутствует. Требуется сверка текста с оригиналом, редакция и страницы не установлены.'
FROM doc_source ds
JOIN doc_revision dr ON dr.source_id = ds.id
WHERE ds.title = (SELECT title FROM exec_knowledge WHERE id = 2)
  AND NOT EXISTS (SELECT 1 FROM legacy_knowledge_map WHERE legacy_id = 2)
ORDER BY ds.id DESC LIMIT 1;

-- ===== №3: Обоснование ЦЦиРТКД (фото слайдов) -> legacy OCR, оригинал не связан =====
INSERT INTO knowledge_entry (title, display_title, entry_type, body, origin_kind,
                             verification_state, applicability, ai_usage_policy, created_by)
SELECT k.title, 'Обоснование создания ЦЦиРТКД (распознанный текст слайдов)', 'legacy_ocr',
       k.body, 'ocr', 'unverified', 'reference_only', 'not_allowed', k.created_by
FROM exec_knowledge k
WHERE k.id = 3 AND NOT EXISTS (SELECT 1 FROM legacy_knowledge_map WHERE legacy_id = 3);

INSERT INTO legacy_knowledge_map (legacy_id, target_kind, target_entry_id, migration_note)
SELECT 3, 'knowledge_entry', ke.id,
       'Legacy OCR-представление. Имя файла указано (PPTX, фото слайдов), но бинарный оригинал не связан: s3_key отсутствует.'
FROM knowledge_entry ke
WHERE ke.entry_type = 'legacy_ocr'
  AND ke.title = (SELECT title FROM exec_knowledge WHERE id = 3)
  AND NOT EXISTS (SELECT 1 FROM legacy_knowledge_map WHERE legacy_id = 3)
ORDER BY ke.id DESC LIMIT 1;

-- ===== №4: Роль CDS -> legacy-запись знания / сводка =====
INSERT INTO knowledge_entry (title, display_title, entry_type, body, origin_kind,
                             verification_state, applicability, ai_usage_policy, created_by)
SELECT k.title, 'Роль CDS Блока внутреннего контроля', 'legacy_record', k.body,
       'legacy', 'unverified', 'reference_only', 'not_allowed', k.created_by
FROM exec_knowledge k
WHERE k.id = 4 AND NOT EXISTS (SELECT 1 FROM legacy_knowledge_map WHERE legacy_id = 4);

INSERT INTO legacy_knowledge_map (legacy_id, target_kind, target_entry_id, migration_note)
SELECT 4, 'knowledge_entry', ke.id,
       'Legacy-запись знания о роли CDS. Оригинального файла нет, происхождение текста не установлено.'
FROM knowledge_entry ke
WHERE ke.entry_type = 'legacy_record'
  AND ke.title = (SELECT title FROM exec_knowledge WHERE id = 4)
  AND NOT EXISTS (SELECT 1 FROM legacy_knowledge_map WHERE legacy_id = 4)
ORDER BY ke.id DESC LIMIT 1;

-- ===== №5: Концепция роли CDS -> legacy, слово "официальный" НЕ подтверждено =====
-- Исходный заголовок сохраняется в title, для показа используется нейтральный display_title.
INSERT INTO knowledge_entry (title, display_title, entry_type, body, origin_kind,
                             verification_state, applicability, ai_usage_policy, created_by)
SELECT k.title, 'Концепция роли CDS', 'legacy_record', k.body,
       'legacy', 'unverified', 'unknown', 'not_allowed', k.created_by
FROM exec_knowledge k
WHERE k.id = 5 AND NOT EXISTS (SELECT 1 FROM legacy_knowledge_map WHERE legacy_id = 5);

INSERT INTO legacy_knowledge_map (legacy_id, target_kind, target_entry_id, migration_note)
SELECT 5, 'knowledge_entry', ke.id,
       'Legacy-представление концепции. Исходный заголовок содержал слово "официальный документ Банка" - статус источника НЕ установлен и не подтверждён. Для показа используется нейтральный заголовок. Оригинал (.md) не связан.'
FROM knowledge_entry ke
WHERE ke.entry_type = 'legacy_record'
  AND ke.title = (SELECT title FROM exec_knowledge WHERE id = 5)
  AND NOT EXISTS (SELECT 1 FROM legacy_knowledge_map WHERE legacy_id = 5)
ORDER BY ke.id DESC LIMIT 1;

-- ===== №6: Положение о ДВКиК -> legacy OCR, оригинал не связан =====
INSERT INTO knowledge_entry (title, display_title, entry_type, body, origin_kind,
                             verification_state, applicability, ai_usage_policy, created_by)
SELECT k.title, 'Положение о ДВКиК (распознанный текст)', 'legacy_ocr', k.body,
       'ocr', 'unverified', 'unknown', 'not_allowed', k.created_by
FROM exec_knowledge k
WHERE k.id = 6 AND NOT EXISTS (SELECT 1 FROM legacy_knowledge_map WHERE legacy_id = 6);

INSERT INTO legacy_knowledge_map (legacy_id, target_kind, target_entry_id, migration_note)
SELECT 6, 'knowledge_entry', ke.id,
       'Legacy OCR-представление Положения. Имя файла (скан PDF) указано, бинарный оригинал не связан. Текст не сверен с оригиналом, страницы и пункты не установлены.'
FROM knowledge_entry ke
WHERE ke.entry_type = 'legacy_ocr'
  AND ke.title = (SELECT title FROM exec_knowledge WHERE id = 6)
  AND NOT EXISTS (SELECT 1 FROM legacy_knowledge_map WHERE legacy_id = 6)
ORDER BY ke.id DESC LIMIT 1;
