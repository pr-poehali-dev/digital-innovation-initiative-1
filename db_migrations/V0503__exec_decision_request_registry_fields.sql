-- Единый реестр вопросов по всем инициативам требует:
--  * dispatch_status — направлен ли вопрос адресату физически (отдельно
--    от жизненного цикла самого вопроса status=open/decided/withdrawn).
--    По умолчанию все вопросы — черновики, ничего не направляется
--    автоматически.
--  * addressee_person_id — предполагаемый адресат, ссылка на exec_person.
--    Назначается ТОЛЬКО когда в справочнике есть подтверждённый
--    сотрудник — фиктивные персоны не создаются.
--  * priority — управленческая оценка приоритета вопроса (не факт из
--    источника, а расстановка значимости для проверки руководителем).
--  * converted_to_action_id — если вопрос преобразован в поручение
--    (exec_action), ссылка на созданное поручение. exec_action.decision_id
--    ссылается на exec_decision_instance (формальные решения органов),
--    поэтому связь с "лёгким" decision_request хранится в обратную
--    сторону, отдельным полем, без изменения существующей FK.
ALTER TABLE exec_initiative_decision_request
    ADD COLUMN IF NOT EXISTS dispatch_status VARCHAR(20) NOT NULL DEFAULT 'draft_not_sent',
    ADD CONSTRAINT chk_idr_dispatch_status
        CHECK (dispatch_status IN ('draft_not_sent', 'converted', 'sent')),
    ADD COLUMN IF NOT EXISTS addressee_person_id INTEGER REFERENCES exec_person(id),
    ADD COLUMN IF NOT EXISTS priority VARCHAR(16),
    ADD CONSTRAINT chk_idr_priority CHECK (priority IS NULL OR priority IN ('low', 'medium', 'high')),
    ADD COLUMN IF NOT EXISTS converted_to_action_id INTEGER REFERENCES exec_action(id);

COMMENT ON COLUMN exec_initiative_decision_request.dispatch_status IS
    'draft_not_sent — черновик, никому не направлен (состояние по умолчанию для всех импортированных вопросов); converted — преобразован в поручение (exec_action), но поручение может быть ещё не отправлено; sent — направлено адресату вне exec_action (зарезервировано).';
COMMENT ON COLUMN exec_initiative_decision_request.addressee_person_id IS
    'Предполагаемый адресат — заполняется только при наличии подтверждённого сотрудника в exec_person. NULL означает "адресат не подтверждён", а не "не важно".';
COMMENT ON COLUMN exec_initiative_decision_request.converted_to_action_id IS
    'Поручение (exec_action), созданное из этого вопроса после подтверждения адресата, срока и ожидаемого результата пользователем. NULL — вопрос ещё не преобразован.';

-- Все ранее импортированные вопросы — черновики, ничего не направлялось.
UPDATE exec_initiative_decision_request SET dispatch_status = 'draft_not_sent' WHERE dispatch_status IS NULL OR dispatch_status <> 'draft_not_sent';

-- Ранее у вопроса по 100401 был установлен предположительный срок
-- (30 дней до наступления вехи) — это не подтверждённый источником
-- срок, а самостоятельно подобранная дата. Очищаем по принципу
-- "не устанавливать произвольные сроки" до подтверждения владельцем.
UPDATE exec_initiative_decision_request SET due_at = NULL WHERE due_at IS NOT NULL AND status = 'open';

-- Управленческая расстановка приоритета для проверки (не факт из
-- источника): решения о возможном прекращении инициативы — высокий
-- приоритет (истекает срок вехи); полное отсутствие плана по
-- инициативе с бюджетом — тоже высокий; технические уточнения дат/ФИО —
-- средний или низкий.
UPDATE exec_initiative_decision_request idr SET priority = 'high'
FROM exec_initiative i WHERE idr.initiative_id = i.id
  AND idr.question_type = 'decision' AND i.external_code IN ('100401', '100397');

UPDATE exec_initiative_decision_request idr SET priority = 'high'
FROM exec_initiative i WHERE idr.initiative_id = i.id
  AND idr.question_type = 'data_clarification' AND i.external_code IN ('100398', '101066');

UPDATE exec_initiative_decision_request idr SET priority = 'medium'
FROM exec_initiative i WHERE idr.initiative_id = i.id
  AND idr.question_type = 'data_clarification' AND i.external_code IN ('100401', '100397', '100422');

UPDATE exec_initiative_decision_request idr SET priority = 'low'
FROM exec_initiative i WHERE idr.initiative_id = i.id
  AND idr.question_type = 'data_clarification' AND i.external_code = '100395';
