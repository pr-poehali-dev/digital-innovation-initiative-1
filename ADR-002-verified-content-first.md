# ADR-002: Verified Content-First Learning Pack

**Статус:** accepted  
**Дата:** 2026-06-14  
**Заменяет:** часть ADR-001 (retrieval strategy)

## Контекст

ADR-001 зафиксировал retrieval-first подход. После smoke-теста выяснилось:
- AI-сгенерированные URL частично битые (404, редиректы на лендинги)
- "Выжимка" строилась по title/description, а не по содержимому материала → декоративная функция
- Пользователь ожидает обучение внутри кабинета, а не переход по внешним ссылкам

## Решение

> Learning Pack показывает только те материалы, которые прошли URL verification и имеют извлечённое содержимое. Ссылка — provenance, не учебный интерфейс.

### Принципы

| Принцип | Формулировка |
|---------|-------------|
| **Verified only** | Материал показывается только после `url_verified=true + http_status=200` |
| **Content-first** | Основной режим — чтение внутри кабинета (reader_markdown) |
| **Summary from content** | Выжимка строится только по `snapshot_text`. Нет snapshot → нет summary |
| **Source as provenance** | Ссылка на оригинал — для доверия и проверки, не для обучения |

### Статусы материала

| Статус | Условие | Показываем? |
|--------|---------|------------|
| `ready` | url_verified + content_extracted + summary_ready | ✅ Полностью |
| `source_only` | url_verified + нет контента (платформа/paywall) | ⚠️ Только как ссылка с описанием |
| `pending` | ещё не проверен | 🔄 С лоадером |
| `failed` | 404 / redirect / login-wall / нерелевантный | ❌ Не показываем |

### Pipeline

```
[AI: подобрать кандидатов по теме milestone]
          ↓
[URL verify: HEAD → resolved_url + http_status]
          ↓
[Content fetch: GET → HTML → extract main text → reader_markdown]
          ↓
[Relevance check: AI сравнивает extracted text с milestone]
          ↓
[Build assets: summary + key_points из snapshot_text]
          ↓
[Show in UI: in-app reader + source link]
```

### Что AI делает

- Подбирает кандидатов (как в ADR-001)
- Проверяет relevance по **extracted content**, не по заголовку
- Строит summary, key_points, study_notes из **snapshot_text**

### Что AI НЕ делает

- Не является источником URL (ссылки проверяются fetch'ом)
- Не строит summary по title/description без snapshot
- Не показывает непроверенный материал как "готовый"

## Новые сущности в БД

```sql
-- Дополнительные поля materials:
resolved_url, http_status, content_type, availability_mode,
verification_status, topic_match_score, summary_basis, last_verified_at

-- Новая таблица material_snapshots:
material_id, raw_html_size, reader_markdown, plain_text,
content_hash, fetched_at, word_count

-- Новая таблица material_learning_assets:
material_id, milestone_id, content_summary, key_points[],
study_notes, generated_from_hash, generated_at
```

## Последствия

- 1.3 переходит в **rework** (не done)
- Подзадачи: 1.3a (verify) → 1.3b (content fetch) → 1.3c (assets) → 1.3d (UI reader)
- Seed-каталог 50-100 верифицированных материалов нужен для надёжного MVP

## Варианты которые не выбрали

| Вариант | Причина отказа |
|---------|---------------|
| Показывать неверифицированные ссылки | Плохой UX, битые URL, нет trust |
| Summary по title/description | Декоративная функция, не учебная |
| Только внешние ссылки | Нарушает ожидание "учиться в кабинете" |
