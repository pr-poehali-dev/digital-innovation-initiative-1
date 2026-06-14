-- Линки бенчмарков к проекту 5
INSERT INTO t_p61016064_digital_innovation_i.wb_case_benchmarks (case_id, benchmark_id, relevance_note)
VALUES
(5, 1, 'Принцип единой карточки — основа целевого процесса'),
(5, 2, 'NLP-классификация — первый AI use case для этого кейса'),
(5, 3, 'Суммаризация и черновик карточки — быстрый первый шаг'),
(5, 4, 'Дашборд контроля исполнения — не AI, но ключевая ценность')
ON CONFLICT DO NOTHING;
