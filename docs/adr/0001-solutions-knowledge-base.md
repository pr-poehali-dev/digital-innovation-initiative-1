# ADR-0001: База практик и решений как source-backed knowledge base

- Status: Proposed
- Date: 2026-07-09
- Deciders: Product / Architecture
- Tags: automation, knowledge-base, matching, solutions, vendors

## Контекст

Система уже формирует нормализованную структуру:

- проект
- оргструктура
- функции подразделения
- импорт / подтверждение / автопривязка
- разбор несопоставленных функций

Следующий логический слой — подбор способов улучшения и автоматизации функций и процессов.

Нужна база, которая отвечает на вопросы:

1. Какие практики улучшения существуют для данной функции/процесса?
2. Какие capability автоматизации нужны для реализации этих практик?
3. Какие конкретные продукты, модули, вендоры и партнёры могут это покрыть?
4. На каком основании система рекомендует те или иные варианты?

Ключевое требование: база не должна быть "списком вендоров" или набором маркетинговых утверждений без источников. Все утверждения должны быть объяснимыми и source-backed.

---

## Решение

Ввести отдельный модуль: **База практик, capability, продуктов, компаний и доказательств**

Каноническая цепочка связывания:

**Function / Process → Practice → Capability → Product / Module → Vendor / Company → Offer → Evidence**

Прямую связь **Function → Vendor** не использовать как основную модель, потому что она:
- смешивает уровень бизнес-задачи и уровень поставщика;
- затрудняет explainability;
- не позволяет отделить практику от инструмента;
- плохо переносится между рынками, вендорами и deployment-моделями.

---

## Почему принято именно так

**1. Одна функция может улучшаться без ПО** (регламент маршрута, SLA-контроль, чек-листы, очередность обработки, CoE / shared service, контрольные точки). Поэтому first-class сущность — **Practice**, а не продукт.

**2. Один capability покрывается многими продуктами** (маршрутизация, OCR/IDP, case management, rules engine, knowledge retrieval, audit trail, BI). Поэтому отдельный слой **Capability**.

**3. Один вендор имеет несколько продуктов/модулей** — различаются deployment model, локализация, интеграции, зрелость. Поэтому отдельно **Product/Module** и **Vendor/Company**.

**4. Рекомендации должны быть объяснимыми** — почему предложено, на каком основании, ограничения, что vendor claim vs независимый источник vs внутренний опыт.

---

## Минимальная модель сущностей

### 1. Practice
Практика улучшения (единая очередь, knowledge base, SLA-мониторинг, контроль сроков, типизация кейсов, эскалации, шаблоны ответов, двухуровневый контроль, централизованная обработка).
Поля: `id`, `name`, `slug`, `summary`, `category`, `is_digital`, `notes`.

### 2. Capability
Функциональная способность (workflow routing, OCR/extraction, rules engine, case management, search/retrieval, document generation, audit logging, SLA tracking, screening/scoring, analytics/dashboards).
Поля: `id`, `name`, `slug`, `category`, `description`.

### 3. ProductModule
Поля: `id`, `vendor_id`, `product_name`, `module_name`, `deployment_model` (on_prem/cloud/hybrid/unknown), `origin_country`, `available_in_ru`, `ru_language_support`, `short_description`, `status` (active/legacy/unknown).

### 4. VendorCompany
Поля: `id`, `name`, `company_type` (vendor/integrator/consulting/service_provider), `country`, `local_presence_ru`, `website`, `notes`.

### 5. Offer
Поля: `id`, `vendor_id`, `product_module_id` (nullable), `offer_type` (license/implementation/customization/support/managed_service/consulting), `description`, `target_segment`.

### 6. Evidence
Поля: `id`, `source_type` (vendor_site/documentation/datasheet/case_study/registry/analyst/internal_experience/pilot/interview), `title`, `url` (nullable), `publisher`, `published_at` (nullable), `retrieved_at`, `reliability_level` (vendor_claim/independent_source/internal_verified/pilot_verified), `notes`.

### 7. Mapping-сущности
- **PracticeCapabilityMap** — практика ↔ нужный capability
- **CapabilityProductMap** — product/module подтверждённо покрывает capability
- **FunctionPracticeMap** — практики применимы к функции/процессу
- **ClaimEvidenceMap** — основание, что capability поддерживается

---

## Принципы качества данных

1. **Любое утверждение — с источником.** Запрещены «система умеет X» / «вендор подходит» / «лидер рынка» без evidence.
2. **Разделять типы утверждений:** vendor claim / независимый источник / внутренний опыт / пилот.
3. **Хранить дату актуальности** (публикации и последней проверки).
4. **Не смешивать продукт и услугу.**
5. **Степень покрытия capability:** native / with_configuration / with_customization / via_partner / unknown.

---

## Правила мэтчинга

Не «магический выбор». Система формирует shortlist + объяснение + ограничения + качество доказательной базы.

Логика: функция → practices → capabilities → product/modules (подтверждённо покрывающие) → фильтр по ограничениям → vendors/partners/offers.

Ограничения: РФ/иностранное; локальное присутствие; on-prem/cloud/hybrid; русский язык; регуляторика; аудит; explainability; AI allowed/not; human-in-the-loop; интеграции; отрасль/размер.

Результат: `подходит` / `условно подходит` / `не подходит` + пояснение (почему, какие capability, ограничения, источники).

---

## Что не входит в решение сейчас

live crawling; автозаполнение из интернета без верификации; авто vendor ranking без методики; TCO / юр. согласование; AI-автовыбор без explainability; UI-подборщик в проде до появления базового набора данных.

---

## Последствия

**Плюсы:** объяснимость; не привязано к одному рынку/вендору; слои развиваются отдельно; простая фильтрация; РФ и иностранные решения в одной модели.
**Минусы:** сложнее каталога; нужна дисциплина по evidence; нужно наполнение taxonomy.

---

## MVP-подход

- **Этап 0.** Архитектурная фиксация (этот ADR) + taxonomy.
- **Этап 1.** Controlled templates: `practices.csv`, `capabilities.csv`, `vendors.csv`, `product_modules.csv`, `offers.csv`, `evidence.csv`, `practice_capability_map.csv`, `capability_product_map.csv`, `function_practice_map.csv`.
- **Этап 2.** Source-backed ingestion с валидацией (обязательные поля, уникальность, ссылки на evidence, проверка справочников).
- **Этап 3.** Read-only UI: practices / capabilities / products / vendors / evidence.
- **Этап 4.** Matching UI: из карточки функции «Подобрать практики и решения».

---

## Интеграция с текущей системой

Отдельный модуль, логически связан с контуром функций/процессов. Точки входа: карточка функции, карточка процесса, аналитический режим shortlist / roadmap.

---

## Открытые вопросы

1. Нужен ли отдельный справочник отраслей?
2. Нужен ли справочник интеграций / систем-источников?
3. Как учитывать реестр отечественного ПО?
4. Различать ли developer / implementer / support partner как разные company-role?
5. Какой минимум evidence нужен для статуса «подходит»?

---

## Принятое направление

Принять модель **Function / Process → Practice → Capability → Product / Module → Vendor / Company → Offer → Evidence** как каноническую.

## Место в траектории

1. Функции и оргструктура ✅
2. Процессы и параметры функции
3. **База практик и решений** ← этот ADR
4. Мэтчинг
5. Shortlist и дорожная карта пилотов
