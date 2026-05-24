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

## Доказательства изоляции

### ✅ Проверено живым тестом (2026-05-24)

1. **`project.get`** — User B (id=2) с валидной сессией пытается открыть проект Алексея (id=1) → HTTP 403 `access_denied`
2. **`project.list`** — User B видит пустой массив, хотя в БД у Алексея 2 проекта

### ⚠️ Требует проверки автотестами в следующем спринте

- `document.get_url` (presigned URL) — User B не должен получить ссылку на чужой файл
- `document.delete` — User B не должен архивировать чужой файл
- `document.rename` — User B не должен переименовать чужой файл
- `get_run` — User B не должен видеть чужой результат генерации
- `chat_with_document` — User B не должен спрашивать чужой документ
- Export PPTX/DOCX — User B не должен скачать чужую работу

---

## Известные пробелы (см. TECH_DEBT.md)

- Нет ролей `editor` / `reviewer` / `viewer`
- Нет аудита access_denied событий
- Нет rate limiting
- `change_password` не проверяет старый пароль с защитой от brute-force
- Файлы в S3 — публичные по CDN URL (нет проверки прав при прямом скачивании по CDN, только через presigned)
