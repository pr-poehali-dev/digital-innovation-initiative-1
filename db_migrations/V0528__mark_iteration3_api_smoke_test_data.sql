-- Данные, созданные при ручной проверке backend-действий итерации 3 через
-- curl (риски/контроли/показатели/проблемы/улучшения/TO-BE на реальных
-- процессах), помечаем is_test_data = true, чтобы они не отображались в
-- обычных списках (все list_* функции backend уже фильтруют по этому флагу).

UPDATE exec_process_risk SET is_test_data = true WHERE id = 1;
UPDATE exec_process_control SET is_test_data = true WHERE id = 1;
UPDATE exec_process_metric SET is_test_data = true WHERE id = 1;
UPDATE exec_process_issue SET is_test_data = true WHERE id IN (1, 2);
UPDATE exec_process_improvement SET is_test_data = true WHERE id = 1;

-- exec_process_diagram и его дочерние таблицы не имели is_test_data —
-- добавляем такой же флаг, как у остальных сущностей контура, и помечаем
-- тестовые TO-BE-диаграммы (id 3, 4), созданные во время API-проверки.
ALTER TABLE exec_process_diagram ADD COLUMN IF NOT EXISTS is_test_data BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE exec_process_diagram_node ADD COLUMN IF NOT EXISTS is_test_data BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE exec_process_diagram_edge ADD COLUMN IF NOT EXISTS is_test_data BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE exec_process_diagram_lane ADD COLUMN IF NOT EXISTS is_test_data BOOLEAN NOT NULL DEFAULT false;

UPDATE exec_process_diagram SET is_test_data = true, model_status = 'archived',
    title = '[ТЕСТ API-проверка] ' || COALESCE(title, '')
    WHERE id IN (3, 4);
UPDATE exec_process_diagram_node SET is_test_data = true WHERE diagram_id IN (3, 4);
UPDATE exec_process_diagram_edge SET is_test_data = true WHERE diagram_id IN (3, 4);
UPDATE exec_process_diagram_lane SET is_test_data = true WHERE diagram_id IN (3, 4);
