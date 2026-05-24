# DocMind AI — API Contract v1

**Дата:** 2026-05-24
**Версия:** 1.0
**Статус:** активный

---

## Общие правила

### Транспорт
- Все запросы — `POST` на корень функции `/`
- `Content-Type: application/json`
- Авторизация — заголовок `X-Session-Id` (получается из `auth.login`)

### Обязательное поле `action`
Каждый запрос ОБЯЗАН содержать поле `action` в теле. Допустимые значения — строго из enum (см. ниже). Любое другое значение возвращает ошибку `unknown_action`.

### Формат ответа

**Успех:**
```json
{
  "ok": true,
  "request_id": "uuid",
  "data": { ... }
}
```

**Ошибка:**
```json
{
  "ok": false,
  "request_id": "uuid",
  "error": { "code": "...", "message": "..." }
}
```

### Стандартные коды ошибок
| Код | HTTP | Когда |
|---|---|---|
| `auth_required` | 401 | Нет/невалидная сессия |
| `access_denied` | 403 | Нет прав на ресурс |
| `not_found` | 404 | Ресурс не существует |
| `validation_error` | 400 | Не хватает / некорректные поля |
| `unknown_action` | 400 | Action не из enum |
| `invalid_json` | 400 | Body не JSON |
| `method_not_allowed` | 405 | Не POST |
| `not_implemented` | 501 | Action заявлен но не реализован |
| `internal_error` | 500 | Необработанная ошибка |

---

## Функция: auth
URL: `https://functions.poehali.dev/be0bd4a6-9b46-46f0-ae8e-bee273a46b38`

| Action | Вход | Выход | Кто может |
|---|---|---|---|
| `register` | `email, password, name` | `session_id, user` | гость |
| `login` | `email, password` | `session_id, user` | гость |
| `logout` | — | `ok` | авторизованный |
| `me` | — | `user` | авторизованный |
| `reset_password` | `email` | `temp_password` (MVP) | гость |
| `change_password` | `old_password, new_password` | `ok` | авторизованный |

---

## Функция: projects
URL: `https://functions.poehali.dev/d439f270-aaa6-4a75-9c30-6ef538ff5bdd`

| Action | Вход | Выход | Кто может |
|---|---|---|---|
| `project.list` | — | `projects[]` | авторизованный |
| `project.get` | `project_id` | `project + members + activity + my_role` | member проекта |
| `project.create` | `title, description?` | `project` | авторизованный |
| `project.update` | `project_id, title, description?` | `ok` | owner проекта |
| `project.invite` | `project_id, email` | `name` | owner проекта |

---

## Функция: tasks (планируется рефактор v2)
URL: `https://functions.poehali.dev/363a1c77-0e9a-41a6-a862-b1cf2a632688`

| Action (целевой) | Вход | Выход | Кто может |
|---|---|---|---|
| `task.list` | `project_id` | `tasks[]` | member |
| `task.get` | `task_id` | `task + documents + runs` | member |
| `task.create` | `project_id, title, task_type, topic, …` | `task` | member |
| `task.update_documents` | `task_id, document_roles[]` | `ok` | member |

---

## Функция: documents (планируется рефактор v2)
URL: `https://functions.poehali.dev/94029017-e75a-4ce2-a3b7-17adc33fa8a1`

| Action (целевой) | Вход | Выход | Кто может |
|---|---|---|---|
| `document.list` | `project_id` | `documents[]` | member |
| `document.upload` | `project_id, filename, file_type, file_data, category` | `document` | member |
| `document.get_text` | `document_id` | `text, structure` | member |
| `document.set_category` | `document_id, category` | `ok` | member |

---

## Функция: generate (планируется рефактор v2)
URL: `https://functions.poehali.dev/90160450-b2a6-44cd-8e78-089f457c619d`

| Action (целевой) | Вход | Выход | Кто может |
|---|---|---|---|
| `generation.run` | `task_id, prompt?, use_web_search?, revision_of?` | `run_id, content` | member |
| `generation.get` | `run_id` | `run + content + sources` | member |

---

## Функция: export / export_docx / search / web_search / media_upload
**TODO**: привести к единому контракту в v2.

---

## История изменений

### v1.0 (2026-05-24)
- Введён единый формат `{ok, request_id, data | error}`
- Введён `X-Request-Id` в ответ для трассировки
- `projects` полностью переведена на namespace-actions
- Запрещён "магический" роутинг по наличию полей
