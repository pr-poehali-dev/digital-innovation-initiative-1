-- Acceptance test: вставляем visual_plan в run id=8 для демо
-- Сценарий A (task instructions): process + timeline
-- Сценарий C (PPTX notes): diagram
UPDATE t_p61016064_digital_innovation_i.generation_runs
SET result_json = jsonb_set(
    result_json::jsonb,
    '{visual_plan}',
    '[
      {
        "slide_index": 2,
        "slide_title": "Предпосылки реализации проекта",
        "visual_type": "process",
        "render_mode": "pptx_shapes",
        "source_prompt": "5 этапов внедрения цифрового решения: анализ → проектирование → разработка → тестирование → запуск",
        "normalized_prompt": "5 этапов внедрения цифрового решения: анализ → проектирование → разработка → тестирование → запуск",
        "source_doc_id": null,
        "source_doc_name": "Задание",
        "source_type": "task_instruction",
        "placement_hint": "content_area",
        "generation_status": "pending_render",
        "asset_s3_key": null,
        "asset_url": null,
        "warnings": []
      },
      {
        "slide_index": 4,
        "slide_title": "Цели и критерии успеха проекта",
        "visual_type": "timeline",
        "render_mode": "pptx_shapes",
        "source_prompt": "Дорожная карта проекта на 6 месяцев: январь — анализ, февраль — дизайн, март — разработка, апрель — интеграция, май — пилот, июнь — запуск",
        "normalized_prompt": "Дорожная карта проекта на 6 месяцев: январь — анализ, февраль — дизайн, март — разработка, апрель — интеграция, май — пилот, июнь — запуск",
        "source_doc_id": null,
        "source_doc_name": "Задание",
        "source_type": "task_instruction",
        "placement_hint": "content_area",
        "generation_status": "pending_render",
        "asset_s3_key": null,
        "asset_url": null,
        "warnings": []
      },
      {
        "slide_index": 6,
        "slide_title": "Оценка сложности проекта",
        "visual_type": "diagram",
        "render_mode": "pptx_shapes",
        "source_prompt": "4 этапа цифровой трансформации: диагностика → приоритизация → пилот → масштабирование",
        "normalized_prompt": "4 этапа цифровой трансформации: диагностика → приоритизация → пилот → масштабирование",
        "source_doc_id": null,
        "source_doc_name": "PPTX notes (демо)",
        "source_type": "pptx_notes",
        "placement_hint": "content_area",
        "generation_status": "pending_render",
        "asset_s3_key": null,
        "asset_url": null,
        "warnings": []
      }
    ]'::jsonb
)::text
WHERE id = 8;
