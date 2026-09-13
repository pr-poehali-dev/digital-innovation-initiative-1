-- ============================================================
-- СРАВНЕНИЕ РАСПИСАНИЙ: явное поле "прогноз" отдельно от "план" и "факт".
-- Прогноз — ожидаемые сроки с учётом текущего состояния работы, не
-- перезаписывает утверждённый план (plan_*) и не подменяется им. Если
-- прогноз не указан явно, при сравнении он не выдумывается автоматически
-- — используется актуальный план как консервативная оценка (это решается
-- в backend при чтении, а не подменой данных в БД).
-- ============================================================

ALTER TABLE exec_project_stage ADD COLUMN IF NOT EXISTS forecast_end DATE;
COMMENT ON COLUMN exec_project_stage.forecast_end IS
    'Прогнозируемая дата завершения этапа с учётом текущего темпа работы. Отдельно от plan_end (утверждённый план) — не путать и не подменять одно другим.';

ALTER TABLE exec_task ADD COLUMN IF NOT EXISTS forecast_date DATE;
COMMENT ON COLUMN exec_task.forecast_date IS
    'Прогнозируемый срок выполнения задачи, отдельно от due_at (план) и fact_date (факт).';

ALTER TABLE exec_milestone ADD COLUMN IF NOT EXISTS forecast_date DATE;
COMMENT ON COLUMN exec_milestone.forecast_date IS
    'Прогнозируемая дата достижения вехи, отдельно от plan_date (актуальный план), plan_date_original (исходный/baseline-подобный план на момент создания) и fact_date (факт).';
