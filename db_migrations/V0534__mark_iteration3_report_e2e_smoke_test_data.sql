-- Помечаем данные, созданные при сквозной e2e-проверке итерации 3 в рамках
-- аудита ("Юра, подготовь подробный отчёт..."), как тестовые. Все эти
-- записи созданы на выделенном smoke-процессе (exec_process_node.id = 2,
-- уже is_test_data=true) и на новой TO-BE диаграмме, созданной при проверке
-- фикса дублирования. Список: проблема id=4, риск id=3, контроль id=3,
-- показатель id=3, улучшение id=3, диаграммы id 6 и 7 (7 — дубль,
-- доказательство найденного и исправленного дефекта), новые дорожки 6 и 7.

UPDATE exec_process_issue SET is_test_data = true WHERE id = 4;
UPDATE exec_process_risk SET is_test_data = true WHERE id = 3;
UPDATE exec_process_control SET is_test_data = true WHERE id = 3;
UPDATE exec_process_metric SET is_test_data = true WHERE id = 3;
UPDATE exec_process_improvement SET is_test_data = true WHERE id = 3;

UPDATE exec_process_diagram SET is_test_data = true, model_status = 'archived',
    title = '[ТЕСТ отчёт-аудит итерация 3] ' || COALESCE(title, '')
    WHERE id IN (6, 7);
UPDATE exec_process_diagram_node SET is_test_data = true WHERE diagram_id IN (6, 7);
UPDATE exec_process_diagram_edge SET is_test_data = true WHERE diagram_id IN (6, 7);
UPDATE exec_process_diagram_lane SET is_test_data = true WHERE diagram_id IN (6, 7);

-- Дополнительные дорожки на исходной AS-IS (id=1), добавленные для проверки
-- многодорожечного сценария и длинных названий — тоже тестовые.
UPDATE exec_process_diagram_lane SET is_test_data = true WHERE id IN (6, 7);
