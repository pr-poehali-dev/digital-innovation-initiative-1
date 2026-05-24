# DocMind AI — Матрица ролей и прав

**Дата:** 2026-05-24
**Версия:** v1.0
**Статус:** действующий

---

## Роли

В текущей версии **только 2 роли** (см. TECH_DEBT.md — расширение запланировано):

| Роль | Описание |
|---|---|
| `owner` | Создатель проекта. Полный контроль. |
| `member` | Приглашённый участник. Полный доступ к данным проекта, кроме админских операций. |
| `guest` | Не залогинен. Может только зарегистрироваться/войти. |

Планируется в v2: `editor`, `reviewer`, `viewer`.

---

## Матрица действий

### Auth (function: auth)

| Action | guest | member | owner | Примечание |
|---|---|---|---|---|
| `register` | ✅ | — | — | Создаёт нового user |
| `login` | ✅ | ✅ | ✅ | Любой |
| `logout` | ❌ | ✅ | ✅ | Требует сессию |
| `me` | ❌ | ✅ | ✅ | Текущий user |
| `reset_password` | ✅ | ✅ | ✅ | По email |
| `change_password` | ❌ | ✅ | ✅ | Только свой |

### Projects (function: projects, v1 контракт)

| Action | guest | member | owner | Возвращает 403 если |
|---|---|---|---|---|
| `project.list` | 401 | ✅ только свои | ✅ только свои | — |
| `project.get` | 401 | ✅ только участник | ✅ | Не участник проекта |
| `project.create` | 401 | ✅ становится owner | — | — |
| `project.update` | 401 | ❌ | ✅ | Не owner |
| `project.invite` | 401 | ❌ | ✅ | Не owner |

### Documents (function: documents)

| Action | guest | member | owner | Изоляция |
|---|---|---|---|---|
| `list_documents` | 401 | ✅ свои проекты | ✅ свои проекты | Фильтр по `archived_at IS NULL` + project_members |
| `upload` (file_data) | 401 | ✅ | ✅ | check_access(project) |
| `document.get_url` | 401 | ✅ | ✅ | check_access(project) — presigned 1h |
| `document.rename` | 401 | ✅ | ✅ | check_access(project) |
| `document.delete` | 401 | ✅ | ✅ | check_access(project), soft archive |
| `document.restore` | 401 | ✅ | ✅ | check_access(project) |
| `get_text` | 401 | ✅ | ✅ | check_access(project) |
| `set_category` | 401 | ✅ | ✅ | check_access(project) |

### Tasks (function: tasks)

| Action | guest | member | owner | Изоляция |
|---|---|---|---|---|
| `list_tasks` (project_id) | 401 | ✅ | ✅ | check_access(project) |
| `get_task` | 401 | ✅ | ✅ | check_access(project через task.project_id) |
| Create task | 401 | ✅ | ✅ | check_access(project) |
| `update_task_documents` | 401 | ✅ | ✅ | check_access(project через task.project_id) |

### Generate (function: generate)

| Action | guest | member | owner | Изоляция |
|---|---|---|---|---|
| Run generation (task_id) | 401 | ✅ | ✅ | check_access(project через task.project_id) |
| `get_run` | 401 | ✅ | ✅ | TODO: добавить проверку доступа к task |

### Export (function: export, export_docx)

| Action | guest | member | owner | Изоляция |
|---|---|---|---|---|
| Export PPTX | 401 | ✅ | ✅ | check_access(project через run → task) |
| Export DOCX | 401 | ✅ | ✅ | check_access(project через run → task) |

### Search / Chat with document (function: search)

| Action | guest | member | owner | Изоляция |
|---|---|---|---|---|
| `search_knowledge` | 401 | ✅ | ✅ | check_access(project) |
| `chat_with_document` | 401 | ✅ | ✅ | check_access(project через document) |
| `get_chat_history` | 401 | ✅ | ✅ | TODO: добавить проверку доступа |

---

## Реализация в коде

Везде используется единая функция:

```python
def check_access(cur, schema, project_id, user_id) -> Optional[str]:
    """Возвращает роль или None если нет доступа."""
    cur.execute(
        f"SELECT role FROM {schema}.project_members WHERE project_id = %s AND user_id = %s",
        (project_id, user_id),
    )
    row = cur.fetchone()
    return row[0] if row else None
```

**Правило:** каждый action, работающий с данными проекта, должен вызвать `check_access` **до** любых SQL-операций с этими данными.

---

## Доказательства изоляции — все опасные операции проверены живым тестом от User B (id=2) на проект id=1 Алексея (2026-05-24, спринт стабилизации П1/П2)

### ✅ Уже было защищено (проверено)

| Endpoint | Метод проверки | Результат |
|---|---|---|
| `project.get` | check_access | 403 ✅ |
| `project.list` | JOIN project_members | пустой массив ✅ |
| `documents.list` | check_access | 403 ✅ |
| `documents.get_url` | check_access | 403 ✅ |
| `documents.delete` (soft archive) | check_access | 403 ✅ |
| `documents.rename` | check_access | 403 ✅ |
| `tasks.get_task` | check_access | 403 ✅ |
| `tasks.list_tasks` | check_access | 403 ✅ |
| `export.pptx` | check_access | 403 ✅ |
| `export.docx` | check_access | 403 ✅ |
| `search.search_knowledge` | check_access | 403 ✅ |
| `search.chat_with_document` | check_access | 403 ✅ |

### 🔴 Найдено и закрыто (КРИТИЧНО — была утечка данных)

| Endpoint | Что было | Что стало |
|---|---|---|
| `generate.get_run` | User B видел ПОЛНЫЙ диплом Алексея | Добавлен JOIN с tasks → проверка project_id → 403 ✅ |
| `search.get_chat_history` | User B видел чужую историю чата | Добавлена проверка project_id через document → 403 ✅ |

### Контрольная проверка (positive path)
- Алексей сам получает свои данные → 200 OK для всех операций (проверено отдельно)

---

## Безопасность паролей (2026-05-24)

### ✅ Argon2id для новых паролей
- Параметры: `time_cost=2, memory_cost=19456, parallelism=1` (OWASP recommended)
- Используется библиотека `argon2-cffi`

### ✅ Автомиграция SHA-256 → Argon2
- Старые пароли в БД остаются как SHA-256
- При следующем успешном входе пароль автоматически пересчитывается в Argon2
- Без перебоя в работе, без принудительного сброса паролей
- Подтверждено: пароль Алексея уже мигрирован в `$argon2id$v=19$m=19456,t=2,p=1...`

### ✅ Timing-safe сравнение
- Логика `verify_password` не сравнивает хеши в SQL (защита от timing attack)
- Хеш загружается, потом сравнивается через `argon2.verify()`

---

## Известные пробелы (см. TECH_DEBT.md)

- Нет ролей `editor` / `reviewer` / `viewer`
- Нет аудита access_denied событий
- ⏳ Rate limiting на login / register / generate — в работе (П3)
- CORS = `*` — нужно ограничить на прод-домен (П3)