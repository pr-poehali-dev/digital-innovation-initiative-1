-- ============================================================
-- ВИЗУАЛЬНОЕ УПРАВЛЕНИЕ ПОРТФЕЛЕМ, ФАЗА 1+3: дорожная карта, шкала вех,
-- и backend-модель на будущее (зависимости, версии расписания/baseline).
-- Переиспользует exec_project/exec_project_stage/exec_task/exec_milestone —
-- новых сущностей для самих проектов/задач не создаётся, только два новых
-- служебных объекта: зависимости и снимки baseline.
-- ============================================================

-- ---------- 1. ЗАВИСИМОСТИ РАСПИСАНИЯ ----------
CREATE TABLE IF NOT EXISTS exec_schedule_dependency (
    id                  SERIAL PRIMARY KEY,
    dependency_type     VARCHAR(8) NOT NULL DEFAULT 'FS',
    src_kind            VARCHAR(16) NOT NULL,
    src_id              INTEGER NOT NULL,
    tgt_kind            VARCHAR(16) NOT NULL,
    tgt_id              INTEGER NOT NULL,
    lag_days            INTEGER NOT NULL DEFAULT 0,
    lag_kind            VARCHAR(16) NOT NULL DEFAULT 'calendar',
    note                TEXT,
    created_by          VARCHAR(255),
    created_at          TIMESTAMP NOT NULL DEFAULT now(),
    archived_at         TIMESTAMP,
    archived_by         VARCHAR(255),
    is_test_data        BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT chk_dependency_type CHECK (dependency_type IN ('FS','SS','FF','SF')),
    CONSTRAINT chk_dependency_kind CHECK (src_kind IN ('task','milestone','project','stage')
        AND tgt_kind IN ('task','milestone','project','stage')),
    CONSTRAINT chk_dependency_lag_kind CHECK (lag_kind IN ('calendar','working')),
    CONSTRAINT chk_dependency_no_self_ref CHECK (NOT (src_kind = tgt_kind AND src_id = tgt_id))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_schedule_dependency_active
    ON exec_schedule_dependency (dependency_type, src_kind, src_id, tgt_kind, tgt_id)
    WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_schedule_dependency_src ON exec_schedule_dependency(src_kind, src_id) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_schedule_dependency_tgt ON exec_schedule_dependency(tgt_kind, tgt_id) WHERE archived_at IS NULL;
COMMENT ON TABLE exec_schedule_dependency IS
    'Зависимости между задачами/вехами/проектами/этапами (в т.ч. межпроектные — kind/id не привязаны к одному project_id). FS/SS/FF/SF = finish-to-start/start-to-start/finish-to-finish/start-to-finish. Циклы и самоссылки проверяются в backend при сохранении, дубли — партиционным уникальным индексом. Автоматический сдвиг дат при создании зависимости backend не выполняет — это будущая функция ручного переноса мышью с явным подтверждением пользователя.';

-- ---------- 2. ВЕРСИИ РАСПИСАНИЯ (BASELINE) ----------
-- "Черновой план"/"актуальный план"/"факт" уже существуют как изменяемые
-- plan_start/plan_end/fact_start/fact_end на exec_project/exec_task и
-- plan_date_original/plan_date/fact_date на exec_milestone (там же уже
-- есть reschedule_reason/reschedule_count — не дублируем). Здесь добавляем
-- именно недостающий формальный неизменяемый снимок "утверждённый baseline".
CREATE TABLE IF NOT EXISTS exec_schedule_baseline (
    id                  SERIAL PRIMARY KEY,
    scope_kind          VARCHAR(16) NOT NULL DEFAULT 'project',
    scope_id            INTEGER,
    title               VARCHAR(300) NOT NULL,
    version_number      INTEGER NOT NULL DEFAULT 1,
    payload_json        TEXT NOT NULL,
    payload_sha256      VARCHAR(64) NOT NULL,
    is_test_data        BOOLEAN NOT NULL DEFAULT false,
    created_by          VARCHAR(255),
    created_at          TIMESTAMP NOT NULL DEFAULT now(),
    CONSTRAINT chk_baseline_scope CHECK (scope_kind IN ('project','portfolio'))
);
CREATE INDEX IF NOT EXISTS idx_schedule_baseline_scope ON exec_schedule_baseline(scope_kind, scope_id);
COMMENT ON TABLE exec_schedule_baseline IS
    'Неизменяемый снимок дат проекта/этапов/задач/вех на момент утверждения базового плана (baseline). scope_kind=project — snapshot одного проекта, scope_kind=portfolio — снимок по всему портфелю (scope_id NULL). Перенос сроков после создания baseline не переписывает эту запись — публикуется новая версия (version_number+1) в том же scope.';

-- ---------- 3. ПРОГНОЗ ЗАВЕРШЕНИЯ ПРОЕКТА ----------
ALTER TABLE exec_project ADD COLUMN IF NOT EXISTS forecast_end DATE;
COMMENT ON COLUMN exec_project.forecast_end IS
    'Прогнозируемая дата завершения (может отличаться от plan_end по факту прогресса) — вводится вручную до появления автоматического прогнозирования по трендам.';
