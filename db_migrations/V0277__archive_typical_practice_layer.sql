-- Архивный технический слой: сведения из типовой практики убираются из представления,
-- но НЕ удаляются физически. Видимыми остаются только подтверждённые документами данные.

ALTER TABLE t_p61016064_digital_innovation_i.macro_processes
  ADD COLUMN IF NOT EXISTS archived_current_state TEXT,
  ADD COLUMN IF NOT EXISTS archived_pain_points TEXT,
  ADD COLUMN IF NOT EXISTS archived_target_state TEXT,
  ADD COLUMN IF NOT EXISTS archived_target_effect TEXT,
  ADD COLUMN IF NOT EXISTS archived_ai_opportunity TEXT,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archive_reason TEXT,
  ADD COLUMN IF NOT EXISTS display_mode VARCHAR(24) NOT NULL DEFAULT 'documents_only';

-- Переносим типовую практику в архивный слой
UPDATE t_p61016064_digital_innovation_i.macro_processes
SET archived_current_state  = current_state,
    archived_pain_points    = pain_points,
    archived_target_state   = target_state,
    archived_target_effect  = target_effect,
    archived_ai_opportunity = ai_opportunity,
    archived_at    = NOW(),
    archive_reason = 'Сведения сформированы из типовой банковской практики, а не из внутренних документов организации. Не могут отображаться как фактическое состояние (AS IS). Перенесены в архивный слой до подтверждения владельцами деятельности.',
    current_state  = '',
    pain_points    = '',
    target_state   = '',
    target_effect  = '',
    ai_opportunity = '',
    maturity_current = 0,
    maturity_target  = 0,
    display_mode = 'documents_only',
    verification_status = 'ai_draft',
    confidence = 'low'
WHERE project_id = 12
  AND archived_at IS NULL;

-- Уточняем основание группировки: это гипотеза, а не восстановленный процесс
UPDATE t_p61016064_digital_innovation_i.macro_processes
SET grouping_basis = 'AI-гипотеза. Функции сгруппированы механически по владеющей организационной единице, указанной в положении о подразделении. Реальная последовательность действий, инициирующие события, контрольные точки и потребители результата НЕ восстанавливались. Группировка не является описанием процесса и требует подтверждения владельцами деятельности.',
    source_type = 'ai_hypothesis'
WHERE project_id = 12;
