-- Статус паспорта: черновик / подтверждён владельцем. Нужен, чтобы отличать
-- предварительное заполнение (в т.ч. из внешних материалов) от версии,
-- лично подтверждённой владельцем кейса.
ALTER TABLE t_p61016064_digital_innovation_i.wb_case_analysis
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft';

ALTER TABLE t_p61016064_digital_innovation_i.wb_case_analysis
    ADD CONSTRAINT chk_wb_case_analysis_status
    CHECK (status IN ('draft', 'confirmed'));

COMMENT ON COLUMN t_p61016064_digital_innovation_i.wb_case_analysis.status IS
    'draft — черновик (в т.ч. предзаполнен из исходных материалов, требует подтверждения владельцем кейса), confirmed — владелец лично подтвердил паспорт';

UPDATE t_p61016064_digital_innovation_i.wb_case_analysis
SET status = 'draft'
WHERE project_id = 16;
