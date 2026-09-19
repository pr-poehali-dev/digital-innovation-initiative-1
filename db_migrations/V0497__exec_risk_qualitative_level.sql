-- Многие риски в исходных материалах (презентациях) содержат ТОЛЬКО
-- качественную оценку («Высокий», «Критичный») без числовой вероятности
-- и влияния. Подбирать числа под качественную метку — ложная точность,
-- которая искажает управленческую аналитику. Разделяем:
--   * qualitative_level — исходный текстовый уровень из источника (факт);
--   * severity_rank — технический ранг ТОЛЬКО для сортировки/группировки
--     в интерфейсе, не является вероятностью, влиянием или risk_score;
--   * probability/impact остаются NULL, если в источнике нет числовой оценки —
--     risk_score (generated по probability*impact) тоже останется NULL,
--     что корректно отражает «не рассчитано».
ALTER TABLE exec_risk
    ADD COLUMN IF NOT EXISTS qualitative_level VARCHAR(16),
    ADD CONSTRAINT chk_risk_qualitative_level
        CHECK (qualitative_level IS NULL OR qualitative_level IN ('low', 'medium', 'high', 'critical')),
    ADD COLUMN IF NOT EXISTS severity_rank SMALLINT;

COMMENT ON COLUMN exec_risk.qualitative_level IS
    'Исходная качественная оценка риска из источника (например, презентации), когда числовые probability/impact там не указаны. Не путать с risk_score — это не расчёт, а перенесённая экспертная метка.';
COMMENT ON COLUMN exec_risk.severity_rank IS
    'Технический ранг ТОЛЬКО для сортировки в UI, когда probability/impact неизвестны (low=1..critical=4). Не является вероятностью, влиянием или рассчитанным risk_score — не показывать как таковые в интерфейсе.';

-- Ранее для инициативы 100401 (СУРР) под качественные уровни были подобраны
-- числовые probability/impact — это создавало ложное впечатление точного
-- расчёта. Очищаем числа, сохраняя качественный уровень и текст оценки.
UPDATE exec_risk
SET qualitative_level = 'critical', severity_rank = 4, probability = NULL, impact = NULL
WHERE initiative_id = (SELECT id FROM exec_initiative WHERE external_code = '100401')
  AND description = 'Изменение входных данных, требований';

UPDATE exec_risk
SET qualitative_level = 'high', severity_rank = 3, probability = NULL, impact = NULL
WHERE initiative_id = (SELECT id FROM exec_initiative WHERE external_code = '100401')
  AND description = 'Заключение договора дольше планового срока';

-- Строки без явного уровня в источнике (неоднозначные, «требуют проверки») —
-- тоже не должны нести придуманные числа.
UPDATE exec_risk
SET probability = NULL, impact = NULL
WHERE initiative_id = (SELECT id FROM exec_initiative WHERE external_code = '100401')
  AND description = 'Срыв срока';
