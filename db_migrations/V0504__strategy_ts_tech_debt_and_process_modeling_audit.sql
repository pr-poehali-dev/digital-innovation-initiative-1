-- Технический долг: 88 существующих ошибок TypeScript (tsc --noEmit),
-- не связанных с переносом портфеля Блока ВК — обнаружены при проверке,
-- перенос портфеля из-за них не останавливаем, но чтобы не потерялись,
-- фиксируем как decision + roadmap item.
INSERT INTO admin_strategy_decisions
    (title, description, decision_type, status, owner, created_by, updated_by)
VALUES (
    'Технический долг: 88 ошибок TypeScript вне контура переноса портфеля Блока ВК',
    'При проверке сборки (npx tsc --noEmit) обнаружено 88 ошибок компиляции, локализованных ВНЕ файлов, затронутых переносом инициатив Блока ВК. Основная концентрация:
- src/pages/LearningPage.tsx — 24 ошибки (сравнения несовместимых типов статусов, implicit any, неопределённая переменная allChildren);
- src/lib/__tests__/dashboardModel.test.ts — 14 ошибок (несовпадение типа DashboardTaskId[] в тестах);
- src/pages/admin/AdminHQPage.tsx — 10 ошибок (отсутствующие поля в типах Rule/Idea, необъявленные copyContext/copied/buildAIContext);
- src/components/task/RunViewer.tsx — 9 ошибок (некорректное приведение VisualPlanItem к Record<string, unknown>);
- src/pages/admin/AdminStrategyPage.tsx — 7 ошибок (Type unknown not assignable to ReactNode);
- src/pages/admin/AdminExecutionPage.tsx — 5 ошибок;
- остальные файлы (ProjectPage, GoalsPage, AuditPage, icon.tsx, calendar.tsx, AdminUsersPage, AdminProjectDetailPage, AdminCompetenciesPage, GrowthNavigatorPage, CompetencyMapPage, main.tsx, api.ts) — по 1-4 ошибки, в основном неиспользуемые переменные (TS6133) и несовместимые типы (TS2322/TS2352/TS2367).

Ни один из изменённых в рамках переноса портфеля файлов (backend/exec-*, src/lib/execCabinetApi.ts, src/lib/execRoadmapApi.ts, src/pages/cabinet/exec/*, src/components/exec/*) новых ошибок не содержит — проверено отдельно.

Решение: не блокировать перенос портфеля, исправить отдельным техническим этапом (нужен явный владелец и приоритизация: сначала LearningPage.tsx и AdminHQPage.tsx как самые "живые" модули с необъявленными переменными — вероятная реальная runtime-ошибка, не только типизация).',
    'other',
    'open',
    '',
    'system',
    'system'
);

-- Ответ на вопрос "рисуем ли процессы как в Business Studio" — фиксируем
-- аудит текущего состояния как roadmap item в категории later/idea,
-- чтобы не потерять договорённость вернуться к пилоту после портфеля.
INSERT INTO admin_strategy_roadmap_items
    (title, description, lane, status, source_type, target_segment, impact, effort, confidence, owner, sort_order, created_by, updated_by)
VALUES (
    'Аудит: моделирование бизнес-процессов (уровень Business Studio) — НЕ начато',
    'Проверка показала: полноценного графического редактора процессов (BPMN/IDEF0, canvas с узлами и связями, drag-n-drop) в проекте нет.

Что есть:
- macro_processes, function_process_cards, wb_processes/wb_process_steps — текстовые паспорта процессов (код, название, владелец, входы/выходы, боли, целевое состояние) БЕЗ полей координат/типов узлов/связей;
- ProcessMapPage.tsx, ProcessesTab.tsx, ProcessCardsBlock.tsx, DeptProcessMapTab.tsx — карточки и таблицы, статистика автоматизации функций. Нет canvas/SVG-редактора;
- backend/process-map/index.py — отдаёт только структурированные метаданные (processes[], summary, uncovered_functions), НЕТ nodes/edges для графа;
- библиотек графов (react-flow, bpmn-js, jointjs, gojs, dagre, cytoscape) в package.json НЕТ;
- единственный рабочий SVG-граф в проекте — DependencyGraphView.tsx (сетевая схема зависимостей задач/вех проекта, слоистая раскладка Sugiyama, просмотр без редактирования) — может стать техническим шаблоном для будущего процессного редактора, но сейчас относится к другому домену (расписание проекта, не бизнес-процессы).

Вывод: реестр процессов частично есть (текстовые паспорта), графический редактор и связи с ролями/рисками/контролями/документами/инициативами через единую модель — не реализованы.

Минимальная первая итерация (предложение, не начато): реестр процессов + паспорт + простой BPMN-редактор (события/задачи/шлюзы/дорожки подразделений) + AS-IS/TO-BE + версии + экспорт PNG/PDF + связи с оргструктурой/документами/рисками/инициативами + журнал изменений. ИИ — в бэклоге (извлечение процесса из регламента, поиск разрывов, сравнение AS-IS/TO-BE), без права утверждать модель.

Приоритет: НЕ начинать параллельно с переносом портфеля инициатив Блока ВК. Пилот — после завершения проверки шести карточек, на одном процессе (предложение: управление регуляторными требованиями и изменениями по модели «6И»).',
    'later',
    'idea',
    'manual',
    'Блок ВК — процессы внутреннего контроля, комплаенса, регуляторного риска, аудита',
    'medium',
    'high',
    'high',
    '',
    4,
    'system',
    'system'
);
