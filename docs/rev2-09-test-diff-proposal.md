# Редакция 2. Документ 9.
# ПРОЕКТ diff автоматизированных тестов
# НЕ ПРИМЕНЯТЬ до письменного разрешения

Редакция: 2 · Статус: **Проект, не применён** · Дата: 10.08.2026

---

## 1. Статус документа

| Параметр | Значение |
|---|---|
| Diff применён | **НЕТ** |
| Тестовый код закоммичен | **НЕТ** |
| Рабочая ветка изменена | **НЕТ** |
| Продуктовый код изменён | **НЕТ** |
| Конфигурация production изменена | **НЕТ** |
| Тесты развёрнуты | **НЕТ** |
| Сессии или пользователи в production созданы | **НЕТ** |
| Заморозка схемы и миграций снята | **НЕТ** |

Документ содержит **только предложение**. Файлы, описанные ниже,
**в репозитории не созданы**.

---

## 2. Требования к изолированной среде

Тесты **не могут** выполняться в текущей среде.

| Требование | Обоснование |
|---|---|
| Отдельная база с синтетическими данными | Запрет копирования реальных архивных и персональных данных |
| Отдельный экземпляр функции `process-map` | Запрет изменения production |
| Возможность создавать сессии без production | Запрет production-сессий |
| Изолированная схема БД | Запрет записи в рабочую базу |
| Возможность полной очистки после прогона | Требование удаления временных данных |

**Ни одно требование в текущей среде не выполняется.**

---

## 3. Синтетические фикстуры

Реальные данные не используются. Все значения вымышлены.

```python
# ПРОЕКТ. Файл: backend/process-map/tests/fixtures.py — НЕ СОЗДАН

SYNTHETIC_PROJECT_ID = 999001

SYNTHETIC_USERS = [
    {"key": "owner",   "email": "test-owner@example.invalid",   "role": "owner"},
    {"key": "admin",   "email": "test-admin@example.invalid",   "role": "admin"},
    {"key": "editor",  "email": "test-editor@example.invalid",  "role": "editor"},
    {"key": "viewer",  "email": "test-viewer@example.invalid",  "role": "viewer"},
]

# Синтетический процесс с ЗАВЕДОМО ВЫМЫШЛЕННЫМ архивом.
# Реальные архивные сведения НЕ копируются.
SYNTHETIC_PROCESS = {
    "title": "ТЕСТ. Синтетическая группа функций",
    "archived_current_state": "SYNTHETIC_CANARY_CURRENT_STATE",
    "archived_pain_points":   "SYNTHETIC_CANARY_PAIN_POINTS",
    "archived_target_state":  "SYNTHETIC_CANARY_TARGET_STATE",
    "archived_target_effect": "SYNTHETIC_CANARY_TARGET_EFFECT",
    "archived_ai_opportunity":"SYNTHETIC_CANARY_AI_OPPORTUNITY",
}

# Маркеры-канарейки: если хоть один встретится в ответе,
# сообщениях об ошибке или логах — утечка архива.
CANARY_MARKERS = [v for k, v in SYNTHETIC_PROCESS.items()
                  if k.startswith("archived_")]

FORBIDDEN_KEYS = ["archived_data", "has_archived_data", "audit_access",
                  "archived_current_state", "archived_pain_points",
                  "archived_target_state", "archived_target_effect",
                  "archived_ai_opportunity", "archived_at"]
```

---

## 4. Проект diff тестового файла

```diff
# ПРОЕКТ. НЕ ПРИМЕНЁН.
--- /dev/null
+++ b/backend/process-map/tests/test_audit_mode_disabled.py
@@ -0,0 +1,148 @@
+"""Проверка: режим аудита отключён, архивные сведения не выдаются.
+
+ЗАПУСК ТОЛЬКО В ИЗОЛИРОВАННОЙ СРЕДЕ С СИНТЕТИЧЕСКИМИ ДАННЫМИ.
+Запрещено выполнять против production.
+"""
+import json
+import pytest
+import requests
+
+from fixtures import (SYNTHETIC_PROCESS, CANARY_MARKERS,
+                      FORBIDDEN_KEYS, SYNTHETIC_USERS)
+
+
+def collect_all_values(obj, acc=None):
+    """Рекурсивный обход ЛЮБОЙ вложенности ответа."""
+    acc = [] if acc is None else acc
+    if isinstance(obj, dict):
+        for k, v in obj.items():
+            acc.append(str(k))
+            collect_all_values(v, acc)
+    elif isinstance(obj, list):
+        for v in obj:
+            collect_all_values(v, acc)
+    else:
+        acc.append(str(obj))
+    return acc
+
+
+def assert_no_archive(response_text):
+    """Ни ключей, ни значений архива ни на одном уровне."""
+    payload = json.loads(response_text)
+    flat = collect_all_values(payload)
+    blob = " ".join(flat)
+    for key in FORBIDDEN_KEYS:
+        assert key not in blob, f"Обнаружен запрещённый ключ: {key}"
+    for marker in CANARY_MARKERS:
+        assert marker not in blob, f"Утечка архивного значения: {marker}"
+    # Дополнительно — по сырому тексту, минуя разбор
+    for marker in CANARY_MARKERS:
+        assert marker not in response_text, "Утечка в сыром ответе"
+
+
+# ── 1. Без авторизации ────────────────────────────────────────
+def test_01_no_auth_returns_401(base_url, process_id):
+    r = requests.post(base_url, json={
+        "action": "process_map.get",
+        "process_id": process_id, "audit_mode": True})
+    assert r.status_code == 401
+    assert_no_archive(r.text)
+
+
+# ── 2-5. Все роли с audit_mode: true ──────────────────────────
+@pytest.mark.parametrize("role_key", ["owner", "admin", "editor", "viewer"])
+def test_02_05_no_archive_for_any_role(base_url, process_id,
+                                       sessions, role_key):
+    r = requests.post(base_url,
+        headers={"X-Session-Id": sessions[role_key]},
+        json={"action": "process_map.get",
+              "process_id": process_id, "audit_mode": True})
+    assert r.status_code in (200, 403)
+    assert_no_archive(r.text)
+
+
+# ── 6-7. Флаги has_archived_data и audit_access ───────────────
+@pytest.mark.parametrize("flag", ["has_archived_data", "audit_access"])
+def test_06_07_flags_absent(base_url, process_id, sessions, flag):
+    r = requests.post(base_url,
+        headers={"X-Session-Id": sessions["owner"]},
+        json={"action": "process_map.get", "process_id": process_id})
+    body = json.loads(r.text)
+    proc = body.get("data", {}).get("process", {})
+    assert flag not in proc, f"Флаг {flag} присутствует в ответе"
+
+
+# ── 8. Параметр audit_mode игнорируется ───────────────────────
+def test_08_audit_mode_ignored(base_url, process_id, sessions):
+    with_flag = requests.post(base_url,
+        headers={"X-Session-Id": sessions["owner"]},
+        json={"action": "process_map.get",
+              "process_id": process_id, "audit_mode": True})
+    without = requests.post(base_url,
+        headers={"X-Session-Id": sessions["owner"]},
+        json={"action": "process_map.get", "process_id": process_id})
+    a = json.loads(with_flag.text).get("data")
+    b = json.loads(without.text).get("data")
+    assert a == b, "Параметр audit_mode влияет на ответ"
+
+
+# ── 9. Штатный ответ без параметра ────────────────────────────
+def test_09_normal_response(base_url, process_id, sessions):
+    r = requests.post(base_url,
+        headers={"X-Session-Id": sessions["owner"]},
+        json={"action": "process_map.get", "process_id": process_id})
+    assert r.status_code == 200
+    proc = json.loads(r.text)["data"]["process"]
+    assert "title" in proc and "functions" in proc and "units" in proc
+    assert_no_archive(r.text)
+
+
+# ── 10. Вложенные объекты ─────────────────────────────────────
+def test_10_no_archive_in_nested(base_url, process_id, sessions):
+    r = requests.post(base_url,
+        headers={"X-Session-Id": sessions["owner"]},
+        json={"action": "process_map.get", "process_id": process_id})
+    # Обход покрывает functions[], units[] и любую глубину
+    assert_no_archive(r.text)
+
+
+# ── 11. Неизменность архива в хранилище ───────────────────────
+def test_11_archive_unchanged(db_checksum_before, db_checksum_after):
+    assert db_checksum_before == db_checksum_after, \
+        "Архивные данные изменились при выполнении тестов"
+
+
+# ── 12. Отсутствие раскрытия в ошибках ────────────────────────
+@pytest.mark.parametrize("bad_payload", [
+    {"action": "process_map.get", "process_id": 999999999,
+     "audit_mode": True},
+    {"action": "process_map.get", "process_id": "не-число",
+     "audit_mode": True},
+    {"action": "process_map.get", "audit_mode": True},
+    {"action": "неизвестное", "audit_mode": True},
+])
+def test_12_no_archive_in_errors(base_url, sessions, bad_payload):
+    r = requests.post(base_url,
+        headers={"X-Session-Id": sessions["owner"]}, json=bad_payload)
+    assert_no_archive(r.text)
```

---

## 5. Покрытие обязательных сценариев

| № | Требуемый сценарий | Тест | Покрыт |
|---|---|---|---|
| 1 | 401 без авторизации | `test_01` | ✓ |
| 2 | Нет `archived_*` у владельца | `test_02_05[owner]` | ✓ |
| 3 | Нет `archived_*` у администратора | `test_02_05[admin]` | ✓ |
| 4 | Нет архивных полей у редактора | `test_02_05[editor]` | ✓ |
| 5 | Нет архивных полей у наблюдателя | `test_02_05[viewer]` | ✓ |
| 6 | Отсутствие `has_archived_data` | `test_06_07[has_archived_data]` | ✓ |
| 7 | Отсутствие `audit_access` | `test_06_07[audit_access]` | ✓ |
| 8 | Игнорирование `audit_mode: true` | `test_08` | ✓ |
| 9 | Штатный ответ без параметра | `test_09` | ✓ |
| 10 | Нет архива во вложенных объектах | `test_10` | ✓ |
| 11 | Неизменность архива в хранилище | `test_11` | ✓ |
| 12 | Нет раскрытия в пользовательских ошибках | `test_12` | ✓ |

**Все 12 обязательных сценариев покрыты.**

### 5.1. Метод проверки утечки

Двойной контроль в каждом тесте:

1. **По ключам** — 9 запрещённых имён полей;
2. **По значениям-канарейкам** — уникальные синтетические строки.
   Если строка встретится где угодно в ответе, включая
   произвольную вложенность и сырой текст, — утечка обнаружена.

Рекурсивный обход покрывает любую глубину вложенности,
массивы и ключи словарей.

---

## 6. Команды запуска

```bash
# ТОЛЬКО В ИЗОЛИРОВАННОЙ СРЕДЕ
export TEST_BASE_URL="https://<изолированный-эндпоинт>"
export TEST_DB_DSN="<синтетическая-база>"
export TEST_PROJECT_ID="999001"

cd backend/process-map/tests
pytest test_audit_mode_disabled.py -v --tb=short
```

**Предохранитель:** тесты должны прерываться, если
`TEST_BASE_URL` совпадает с production-адресом. Проверка
включается в `conftest.py`.

---

## 7. Процедура очистки

| Шаг | Действие |
|---|---|
| 1 | Удалить синтетические сессии |
| 2 | Удалить синтетических пользователей проекта 999001 |
| 3 | Удалить синтетический процесс и связи |
| 4 | Удалить синтетический проект 999001 |
| 5 | Проверить отсутствие записей с `project_id = 999001` |
| 6 | Сохранить обезличенный журнал результатов |

Очистка выполняется **всегда**, включая случай падения тестов.

---

## 8. Ожидаемые результаты

| Показатель | Ожидание |
|---|---|
| Всего тестов | **12 наборов**, 18 прогонов с учётом параметризации |
| Ожидаемый результат | Все пройдены |
| Признак утечки | Любой упавший тест |
| Время выполнения | Менее 1 минуты |

---

## 9. Файлы, которые потребуется создать

| Файл | Назначение | Создан |
|---|---|---|
| `backend/process-map/tests/fixtures.py` | Синтетические данные | **Нет** |
| `backend/process-map/tests/conftest.py` | Фикстуры, предохранитель | **Нет** |
| `backend/process-map/tests/test_audit_mode_disabled.py` | Тесты | **Нет** |
| `backend/process-map/tests/requirements.txt` | `pytest`, `requests`, `psycopg2` | **Нет** |

**Ни один файл не создан. Diff не применён.**
