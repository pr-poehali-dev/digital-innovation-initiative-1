-- Плановые сценарии, не подтверждённые фактом (например, "инициатива
-- прекращена" из презентации, пока не принято решение руководителя) —
-- отдельный флаг, а не обычный статус вехи. Такие вехи:
--   * визуально помечаются как условные, а не как часть согласованного плана;
--   * исключаются из расчёта критического пути (CPM), чтобы не создавать
--     ложное управленческое впечатление о реальной критичности.
ALTER TABLE exec_milestone
    ADD COLUMN IF NOT EXISTS is_conditional_scenario BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS decision_request_id INTEGER REFERENCES exec_initiative_decision_request(id);

COMMENT ON COLUMN exec_milestone.is_conditional_scenario IS
    'true — веха отражает план ИЗ ИСТОЧНИКА, который сам по себе является предметом решения руководителя (например, дата прекращения инициативы), а не согласованный срок исполнения. Такие вехи не включаются в расчёт критического пути и визуально отделяются от подтверждённого плана.';

UPDATE exec_milestone m
SET is_conditional_scenario = true,
    decision_request_id = (SELECT id FROM exec_initiative_decision_request WHERE initiative_id = m.initiative_id AND status = 'open' LIMIT 1),
    title = 'Возможное прекращение инициативы — требует решения руководителя'
WHERE m.initiative_id = (SELECT id FROM exec_initiative WHERE external_code = '100401')
  AND m.outline_code = '6';
