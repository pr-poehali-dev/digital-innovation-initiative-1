-- ── Sections: as_is / to_be / notes ─────────────────────────────────────────
UPDATE t_p61016064_digital_innovation_i.project_sections
SET content = 'Админка уже перестаёт быть набором разрозненных экранов и собирается в управленческий контур.

Сейчас есть:
• /admin — главный экран как точка входа
• /admin/hq — единый источник стратегической памяти проекта
• /admin/plan — слой планирования спринтов и задач
• /admin/project — новый архитектурный слой (этот экран)

Что характерно для текущего состояния:
• стратегический контекст вынесен из чатов в БД
• старая strategy-страница убрана как отдельный источник правды
• архитектурная карта только формируется
• границы между Plan / Project / Passport ещё требуют нормализации
• нет полной инвентаризации модулей, сущностей, owners и связей
• часть контекста о платформе существует не как структура, а как договорённости команды',
    updated_at = NOW(), updated_by = 'seed'
WHERE section_key = 'as_is';

UPDATE t_p61016064_digital_innovation_i.project_sections
SET content = 'Целевая платформа состоит из шести связанных слоёв, каждый из которых отвечает на свой вопрос и не дублирует соседний:

1. Command Center — /admin
   Здоровье системы, алерты, статус спринта, быстрый вход в ключевые модули.

2. Project HQ — /admin/hq
   Видение, миссия, цели, правила, решения, риски, идеи, контекст для AI.

3. Plan — /admin/plan
   Backlog, спринты, статусы, owners, дедлайны, прогресс.

4. Project / Architecture Map — /admin/project
   As-is, to-be, gaps, conflicts, architecture decisions, waves of change.

5. Platform Passport — /admin/passport
   Модули, разделы, сущности, owners, связи, пересечения, статус нормализации.

6. Operational Tools
   Errors, feature flags, alerts, tickets, communications, content, analytics, finance, funnel.

Принцип: каждый слой отвечает на свой вопрос и не дублирует соседний.',
    updated_at = NOW(), updated_by = 'seed'
WHERE section_key = 'to_be';

UPDATE t_p61016064_digital_innovation_i.project_sections
SET content = 'Project не должен превращаться в ещё один backlog.

Правило разграничения слоёв:
• Если запись отвечает на вопрос "что делаем и когда" — это Plan.
• Если отвечает на вопрос "как устроено сейчас, куда переходим и что конфликтует" — это Project.
• Если отвечает на вопрос "что есть в платформе и кто за это отвечает" — это Passport.

Project summary:
Платформа движется от набора экранов и договорённостей к управляемой архитектуре с четырьмя основными слоями: HQ, Plan, Project и Passport. HQ уже стал единым источником стратегической памяти. Project фиксирует архитектурный переход от текущего состояния к целевому. Следующий ключевой шаг — Passport, чтобы зафиксировать модули, сущности, owners и связи. Основные открытые конфликты: границы между слоями, отсутствие полной карты модулей, риск второй правды и риск расхождения AI summary с системными данными.',
    updated_at = NOW(), updated_by = 'seed'
WHERE section_key = 'notes';

-- ── Gaps / Conflicts ──────────────────────────────────────────────────────────
INSERT INTO t_p61016064_digital_innovation_i.project_gaps (title, description, gap_type, status, created_by) VALUES
('Границы между Plan / Project / Passport',
 'Пока не до конца формализовано, где заканчивается планирование задач и где начинается архитектурное описание. Нужно жёстко развести роли: Plan = задачи и спринты, Project = архитектурные изменения и переходы, Passport = инвентаризация платформы и owners.',
 'unclear', 'open', 'seed'),

('Риск повторного появления второй правды',
 'После закрытия отдельной strategy-страницы есть риск, что новые страницы снова начнут хранить стратегические данные локально или дублировать HQ. Любой стратегический контент хранится только через HQ.',
 'duplicate', 'open', 'seed'),

('Нет полной карты модулей и связей',
 'Есть маршруты, экраны и слои, но нет нормализованной карты: какие модули существуют, кто владелец, какие сущности они используют, какие зависимости. Закрывается через /admin/passport.',
 'gap', 'open', 'seed'),

('Смешение платформенных и доменных инструментов на дашборде',
 'На главном экране есть риск смешать системные модули (HQ, Project, Passport, Flags, Errors) и бизнес-модули (контент, рассылки, финансы, воронка) без явной группировки. Нужно разделить карточки по группам: Platform / Operations / Content / Analytics / Support.',
 'unclear', 'open', 'seed'),

('Отсутствует слой owners и ответственности',
 'Не у всех модулей и архитектурных зон есть зафиксированный owner. Это мешает сопровождению и ухудшает управляемость. Ввести owner-level в Passport и связать с Project.',
 'gap', 'open', 'seed'),

('AI summary может расходиться с фактическими данными',
 'Если summary для AI будет редактироваться отдельно, он перестанет отражать реальные данные HQ и Project. AI context должен генерироваться только из сохранённых блоков БД.',
 'duplicate', 'open', 'seed'),

('Отдельная strategy-страница как второй источник правды',
 'Параллельное хранение стратегии в /admin/strategy и /admin/hq. Решение принято и реализовано: /admin/strategy редиректит в HQ. Источник правды — HQ.',
 'duplicate', 'resolved', 'seed');

-- ── Architecture Decisions ────────────────────────────────────────────────────
INSERT INTO t_p61016064_digital_innovation_i.project_decisions (what, why, changed, decided_at, created_by) VALUES
('HQ — единый источник стратегической памяти',
 'Стратегия, правила, риски и идеи не должны жить в переписке и дублироваться по страницам.',
 'Стратегический контур централизован. Все стратегические блоки хранятся в БД и доступны через /admin/hq.',
 '2026-06-05', 'seed'),

('Project — отдельный слой архитектурных переходов',
 'Архитектурные изменения нельзя смешивать с backlog-спринтами — это разные уровни абстракции.',
 '/admin/project фиксирует as-is, to-be, gaps, conflicts и waves. Это не задачи, а архитектурные переходы.',
 '2026-06-05', 'seed'),

('Passport будет отдельным слоем инвентаризации платформы',
 'Архитектурная карта (Project) и инвентаризация модулей (Passport) — принципиально разные задачи.',
 'Сущности, owners и связи будут жить в /admin/passport, а не в Project.',
 '2026-06-05', 'seed'),

('Один источник правды для каждой сущности',
 'Дублирование разрушает доверие к системе и создаёт расхождения, которые нельзя разрешить без ручного аудита.',
 'Новые экраны нельзя строить как параллельные хранилища тех же данных. Правило проверяется при каждом новом разделе.',
 '2026-06-05', 'seed'),

('AI context должен собираться из БД, а не поддерживаться вручную',
 'Вручную поддерживаемый summary быстро устаревает и расходится с реальностью.',
 'AI context строится из живых данных HQ / Project / Passport. Кнопка «Контекст для AI» агрегирует данные из БД.',
 '2026-06-05', 'seed');

-- ── Waves ─────────────────────────────────────────────────────────────────────
INSERT INTO t_p61016064_digital_innovation_i.project_waves (wave_num, title, goal, status, order_index, updated_by) VALUES
(1, 'W1 — Foundation / Основание',
 'Собрать базовый управленческий контур и убрать вторую правду.',
 'in_progress', 1, 'seed'),
(2, 'W2 — Normalization / Нормализация',
 'Нормализовать структуру платформы и развести роли слоёв.',
 'planned', 2, 'seed'),
(3, 'W3 — Operations / Операционный слой',
 'Подключить рабочие управленческие инструменты.',
 'planned', 3, 'seed'),
(4, 'W4 — Intelligence / AI Layer',
 'Сделать платформу понятной для AI без ручного пересказа.',
 'planned', 4, 'seed');

-- ── Wave items ────────────────────────────────────────────────────────────────
-- W1
INSERT INTO t_p61016064_digital_innovation_i.project_wave_items (wave_id, title, status, order_index)
SELECT id, 'HQ как единый источник стратегической памяти', 'done', 1
FROM t_p61016064_digital_innovation_i.project_waves WHERE wave_num = 1;

INSERT INTO t_p61016064_digital_innovation_i.project_wave_items (wave_id, title, status, order_index)
SELECT id, 'Редирект со старой strategy-страницы', 'done', 2
FROM t_p61016064_digital_innovation_i.project_waves WHERE wave_num = 1;

INSERT INTO t_p61016064_digital_innovation_i.project_wave_items (wave_id, title, status, order_index)
SELECT id, 'Last updated / updated_by во всех блоках HQ', 'done', 3
FROM t_p61016064_digital_innovation_i.project_waves WHERE wave_num = 1;

INSERT INTO t_p61016064_digital_innovation_i.project_wave_items (wave_id, title, status, order_index)
SELECT id, '/admin/project как архитектурная карта', 'done', 4
FROM t_p61016064_digital_innovation_i.project_waves WHERE wave_num = 1;

INSERT INTO t_p61016064_digital_innovation_i.project_wave_items (wave_id, title, status, order_index)
SELECT id, 'Карточки HQ и Architecture на дашборде', 'done', 5
FROM t_p61016064_digital_innovation_i.project_waves WHERE wave_num = 1;

INSERT INTO t_p61016064_digital_innovation_i.project_wave_items (wave_id, title, status, order_index)
SELECT id, 'Заполнить /admin/project каноническим содержимым', 'done', 6
FROM t_p61016064_digital_innovation_i.project_waves WHERE wave_num = 1;

-- W2
INSERT INTO t_p61016064_digital_innovation_i.project_wave_items (wave_id, title, status, order_index)
SELECT id, 'Построить /admin/passport', 'todo', 1
FROM t_p61016064_digital_innovation_i.project_waves WHERE wave_num = 2;

INSERT INTO t_p61016064_digital_innovation_i.project_wave_items (wave_id, title, status, order_index)
SELECT id, 'Описать модули, разделы, сущности и owners', 'todo', 2
FROM t_p61016064_digital_innovation_i.project_waves WHERE wave_num = 2;

INSERT INTO t_p61016064_digital_innovation_i.project_wave_items (wave_id, title, status, order_index)
SELECT id, 'Зафиксировать связи между HQ / Plan / Project / Passport', 'todo', 3
FROM t_p61016064_digital_innovation_i.project_waves WHERE wave_num = 2;

INSERT INTO t_p61016064_digital_innovation_i.project_wave_items (wave_id, title, status, order_index)
SELECT id, 'Ввести архитектурные зоны и границы ответственности', 'todo', 4
FROM t_p61016064_digital_innovation_i.project_waves WHERE wave_num = 2;

INSERT INTO t_p61016064_digital_innovation_i.project_wave_items (wave_id, title, status, order_index)
SELECT id, 'Убрать неоднозначности в терминологии', 'todo', 5
FROM t_p61016064_digital_innovation_i.project_waves WHERE wave_num = 2;

-- W3
INSERT INTO t_p61016064_digital_innovation_i.project_wave_items (wave_id, title, status, order_index)
SELECT id, 'Ошибки / логи', 'todo', 1
FROM t_p61016064_digital_innovation_i.project_waves WHERE wave_num = 3;

INSERT INTO t_p61016064_digital_innovation_i.project_wave_items (wave_id, title, status, order_index)
SELECT id, 'Feature flags', 'todo', 2
FROM t_p61016064_digital_innovation_i.project_waves WHERE wave_num = 3;

INSERT INTO t_p61016064_digital_innovation_i.project_wave_items (wave_id, title, status, order_index)
SELECT id, 'Alerts', 'todo', 3
FROM t_p61016064_digital_innovation_i.project_waves WHERE wave_num = 3;

INSERT INTO t_p61016064_digital_innovation_i.project_wave_items (wave_id, title, status, order_index)
SELECT id, 'Tickets / support', 'todo', 4
FROM t_p61016064_digital_innovation_i.project_waves WHERE wave_num = 3;

INSERT INTO t_p61016064_digital_innovation_i.project_wave_items (wave_id, title, status, order_index)
SELECT id, 'Communications / рассылки', 'todo', 5
FROM t_p61016064_digital_innovation_i.project_waves WHERE wave_num = 3;

INSERT INTO t_p61016064_digital_innovation_i.project_wave_items (wave_id, title, status, order_index)
SELECT id, 'Content / banners / blog', 'todo', 6
FROM t_p61016064_digital_innovation_i.project_waves WHERE wave_num = 3;

INSERT INTO t_p61016064_digital_innovation_i.project_wave_items (wave_id, title, status, order_index)
SELECT id, 'Funnel / analytics', 'todo', 7
FROM t_p61016064_digital_innovation_i.project_waves WHERE wave_num = 3;

-- W4
INSERT INTO t_p61016064_digital_innovation_i.project_wave_items (wave_id, title, status, order_index)
SELECT id, 'Unified AI context из HQ + Project + Passport', 'todo', 1
FROM t_p61016064_digital_innovation_i.project_waves WHERE wave_num = 4;

INSERT INTO t_p61016064_digital_innovation_i.project_wave_items (wave_id, title, status, order_index)
SELECT id, 'Экспорт контекста в текст / markdown', 'todo', 2
FROM t_p61016064_digital_innovation_i.project_waves WHERE wave_num = 4;

INSERT INTO t_p61016064_digital_innovation_i.project_wave_items (wave_id, title, status, order_index)
SELECT id, 'Сигналы о конфликте данных', 'todo', 3
FROM t_p61016064_digital_innovation_i.project_waves WHERE wave_num = 4;

INSERT INTO t_p61016064_digital_innovation_i.project_wave_items (wave_id, title, status, order_index)
SELECT id, 'Проверка устаревшего контекста', 'todo', 4
FROM t_p61016064_digital_innovation_i.project_waves WHERE wave_num = 4;

INSERT INTO t_p61016064_digital_innovation_i.project_wave_items (wave_id, title, status, order_index)
SELECT id, 'Summary по архитектурным изменениям', 'todo', 5
FROM t_p61016064_digital_innovation_i.project_waves WHERE wave_num = 4;
