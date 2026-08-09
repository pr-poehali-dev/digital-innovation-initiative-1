-- Статусы достоверности: разделяем AI-гипотезы и подтверждённые данные

ALTER TABLE t_p61016064_digital_innovation_i.macro_processes
  ADD COLUMN IF NOT EXISTS verification_status VARCHAR(24) NOT NULL DEFAULT 'ai_draft',
  ADD COLUMN IF NOT EXISTS source_type VARCHAR(32) NOT NULL DEFAULT 'ai_hypothesis',
  ADD COLUMN IF NOT EXISTS current_state_source VARCHAR(32) NOT NULL DEFAULT 'typical_practice',
  ADD COLUMN IF NOT EXISTS grouping_basis TEXT,
  ADD COLUMN IF NOT EXISTS confidence VARCHAR(16) NOT NULL DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS verified_by INTEGER,
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

ALTER TABLE t_p61016064_digital_innovation_i.macro_process_functions
  ADD COLUMN IF NOT EXISTS link_basis VARCHAR(32) NOT NULL DEFAULT 'org_unit_inference',
  ADD COLUMN IF NOT EXISTS confidence VARCHAR(16) NOT NULL DEFAULT 'low',
  ADD COLUMN IF NOT EXISTS is_confirmed BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE t_p61016064_digital_innovation_i.glossary_terms
  ADD COLUMN IF NOT EXISTS status VARCHAR(24) NOT NULL DEFAULT 'ai_draft',
  ADD COLUMN IF NOT EXISTS source_document TEXT,
  ADD COLUMN IF NOT EXISTS source_edition TEXT,
  ADD COLUMN IF NOT EXISTS actual_date DATE,
  ADD COLUMN IF NOT EXISTS scope_of_use TEXT,
  ADD COLUMN IF NOT EXISTS verified_by INTEGER,
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

-- Честная маркировка ранее загруженных данных
UPDATE t_p61016064_digital_innovation_i.macro_processes
SET verification_status = 'ai_draft',
    source_type = 'ai_hypothesis',
    current_state_source = 'typical_practice',
    confidence = 'low',
    grouping_basis = 'Автоматическая группировка по владеющей оргединице из положения о подразделении. Состояние AS IS описано по типовой банковской практике, а НЕ по подтверждённым источникам. Требует проверки владельцем деятельности.'
WHERE project_id = 12;

-- Глоссарий: термины из внутренних документов vs общеотраслевые
UPDATE t_p61016064_digital_innovation_i.glossary_terms
SET status = 'ai_draft'
WHERE source = 'seed';

UPDATE t_p61016064_digital_innovation_i.glossary_terms
SET status = 'confirmed',
    source_document = 'Сведения предоставлены руководителем (структура Блока внутреннего контроля)',
    actual_date = CURRENT_DATE
WHERE category = 'org';
