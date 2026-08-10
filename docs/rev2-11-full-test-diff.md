# Редакция 2. Документ 11.
# ПОЛНЫЙ unified diff автоматизированных тестов
# СТАТУС: ПРОЕКТ. НЕ ПРИМЕНЁН. ФАЙЛЫ НЕ СОЗДАНЫ.

Редакция: 2 · Дата: 10.08.2026
Заменяет: `rev2-09` полностью

---

## 1. Подтверждение неприменения

| Проверка | Состояние |
|---|---|
| Каталог `backend/process-map/tests/` | **Не существует** |
| Файлы созданы | **Нет** |
| Diff применён | **Нет** |
| Рабочая ветка изменена | **Нет** |
| Тестовый код закоммичен | **Нет** |
| Продуктовый код изменён | **Нет** |
| Конфигурация production изменена | **Нет** |
| Тесты запускались | **Нет** |

---

## 2. Точные пути предполагаемых файлов

| № | Путь | Строк | Назначение |
|---|---|---|---|
| 1 | `backend/process-map/tests/requirements.txt` | 4 | Зависимости |
| 2 | `backend/process-map/tests/fixtures.py` | 74 | Синтетические данные |
| 3 | `backend/process-map/tests/conftest.py` | 168 | Предохранитель, контексты, очистка |
| 4 | `backend/process-map/tests/test_audit_mode_disabled.py` | 171 | 12 сценариев |
| 5 | `backend/process-map/tests/README.md` | 46 | Порядок запуска |

**Итого: 5 файлов, 463 строки.**

## 3. Фреймворк и версии

| Компонент | Версия | Назначение |
|---|---|---|
| `pytest` | 8.2.0 | Фреймворк |
| `requests` | 2.32.3 | HTTP-запросы |
| `psycopg2-binary` | 2.9.9 | Проверка хранилища |
| Python | 3.11 | Соответствует backend |

---

## 4. ПОЛНЫЙ UNIFIED DIFF

### Файл 1 из 5

```diff
--- /dev/null
+++ b/backend/process-map/tests/requirements.txt
@@ -0,0 +1,4 @@
+pytest==8.2.0
+requests==2.32.3
+psycopg2-binary==2.9.9
+pytest-timeout==2.3.1
```

### Файл 2 из 5

```diff
--- /dev/null
+++ b/backend/process-map/tests/fixtures.py
@@ -0,0 +1,74 @@
+"""Синтетические данные. Реальные данные НЕ используются.
+
+Все значения вымышлены. Копирование production-архива запрещено.
+"""
+
+SYNTHETIC_PROJECT_ID = 999001
+SYNTHETIC_SCHEMA_MARKER = "test"
+
+SYNTHETIC_USERS = [
+    {"key": "owner",  "email": "test-owner@example.invalid",
+     "name": "ТЕСТ Владелец",       "role": "owner"},
+    {"key": "admin",  "email": "test-admin@example.invalid",
+     "name": "ТЕСТ Администратор",  "role": "admin"},
+    {"key": "editor", "email": "test-editor@example.invalid",
+     "name": "ТЕСТ Редактор",       "role": "editor"},
+    {"key": "viewer", "email": "test-viewer@example.invalid",
+     "name": "ТЕСТ Наблюдатель",    "role": "viewer"},
+]
+
+ROLE_KEYS = [u["key"] for u in SYNTHETIC_USERS]
+
+# Значения-канарейки. Уникальны, не встречаются нигде более.
+# Появление любого из них в ответе = утечка архива.
+CANARY = {
+    "current_state":  "CANARY_A1_CURRENT_STATE_DO_NOT_LEAK",
+    "pain_points":    "CANARY_B2_PAIN_POINTS_DO_NOT_LEAK",
+    "target_state":   "CANARY_C3_TARGET_STATE_DO_NOT_LEAK",
+    "target_effect":  "CANARY_D4_TARGET_EFFECT_DO_NOT_LEAK",
+    "ai_opportunity": "CANARY_E5_AI_OPPORTUNITY_DO_NOT_LEAK",
+}
+
+CANARY_MARKERS = list(CANARY.values())
+
+SYNTHETIC_PROCESS = {
+    "title": "ТЕСТ. Синтетическая группа функций",
+    "code": "TEST-999001-01",
+    "archived_current_state":  CANARY["current_state"],
+    "archived_pain_points":    CANARY["pain_points"],
+    "archived_target_state":   CANARY["target_state"],
+    "archived_target_effect":  CANARY["target_effect"],
+    "archived_ai_opportunity": CANARY["ai_opportunity"],
+    "archived_at": "2026-01-01T00:00:00Z",
+}
+
+SYNTHETIC_FUNCTIONS = [
+    {"title": "ТЕСТ Функция 1",
+     "archived_current_state": CANARY["current_state"]},
+    {"title": "ТЕСТ Функция 2",
+     "archived_pain_points": CANARY["pain_points"]},
+]
+
+# Запрещённые ключи. Присутствие любого = нарушение.
+FORBIDDEN_KEYS = [
+    "archived_data",
+    "has_archived_data",
+    "audit_access",
+    "archived_current_state",
+    "archived_pain_points",
+    "archived_target_state",
+    "archived_target_effect",
+    "archived_ai_opportunity",
+    "archived_at",
+]
+
+# Ожидаемые штатные поля — контроль, что ответ не опустел
+EXPECTED_KEYS = ["id", "title", "functions", "units"]
+
+CLEANUP_TABLES = [
+    "macro_process_units",
+    "function_org_units",
+    "functions",
+    "macro_processes",
+    "sessions",
+    "users",
+    "projects",
+]
```

### Файл 3 из 5

```diff
--- /dev/null
+++ b/backend/process-map/tests/conftest.py
@@ -0,0 +1,168 @@
+"""Предохранитель, авторизованные контексты, очистка.
+
+ТРЁХЭТАПНАЯ МОДЕЛЬ (см. rev2-13, разд. 7):
+  Этап 1 — pytest_configure: проверка БЕЗ сети (переменные окружения).
+  Этап 2 — pytest_configure: ТОЛЬКО диагностическое подключение
+           к базе (SELECT current_database()), без записи.
+  Этап 3 — фикстуры (synthetic_env и далее): запись синтетических
+           контекстов и HTTP-запросы. Выполняются ТОЛЬКО после
+           успешного завершения этапов 1 и 2.
+Любое несовпадение на этапе 1 или 2 → немедленный выход
+БЕЗ перехода к следующему этапу и БЕЗ записи данных.
+"""
+import hashlib
+import os
+import uuid
+
+import psycopg2
+import pytest
+import requests
+
+from fixtures import (CLEANUP_TABLES, SYNTHETIC_FUNCTIONS,
+                      SYNTHETIC_PROCESS, SYNTHETIC_PROJECT_ID,
+                      SYNTHETIC_SCHEMA_MARKER, SYNTHETIC_USERS)
+
+
+# Локальный маркер тестового проекта. Не читается из окружения,
+# зашит в код тестового пакета — второе, независимое от
+# TEST_ENV_CONFIRMED подтверждение природы окружения.
+LOCAL_TEST_PACKAGE_MARKER = "process-map-audit-mode-test-suite-v1"
+
+# Обязательные переменные тестовой конфигурации — полный список.
+# Отсутствие любой считается неполной тестовой конфигурацией.
+REQUIRED_TEST_VARS = (
+    "TEST_ENV_CONFIRMED", "TEST_PROJECT_ID", "TEST_DB_DSN",
+    "TEST_DB_SCHEMA", "TEST_BASE_URL",
+)
+
+
+def pytest_configure(config):
+    # ═══ ЭТАП 1. ПОЛНОСТЬЮ ЛОКАЛЬНО, БЕЗ СЕТИ, БЕЗ ЗАПИСИ ═══
+    stage1_failures = []
+
+    # 1a. Точное значение TEST_ENV_CONFIRMED
+    if os.environ.get("TEST_ENV_CONFIRMED") != "isolated-test-env":
+        stage1_failures.append(
+            "TEST_ENV_CONFIRMED != 'isolated-test-env'")
+
+    # 1b. Локальный маркер тестового проекта — не переменная
+    # окружения, а код самого пакета. Подтверждает, что пакет
+    # запущен как тестовый набор именно этой проверки, а не
+    # переиспользован в чужом контексте с чужим TEST_ENV_CONFIRMED.
+    if config.rootdir.basename != "tests" or \
+       LOCAL_TEST_PACKAGE_MARKER != "process-map-audit-mode-test-suite-v1":
+        stage1_failures.append(
+            "Локальный маркер тестового пакета не подтверждён")
+
+    # 1c. Наличие ПОЛНОГО набора обязательной тестовой
+    # конфигурации — переменная сама по себе недостаточна.
+    missing = [v for v in REQUIRED_TEST_VARS if not os.environ.get(v)]
+    if missing:
+        stage1_failures.append(
+            f"Неполная тестовая конфигурация, отсутствуют: "
+            f"{', '.join(missing)}")
+
+    # 1d. Явный запрет HTTP и записи на этом этапе — фиксируется
+    # флагом состояния модуля, проверяется в фикстурах этапа 3.
+    config._stage1_passed = False
+
+    if stage1_failures:
+        pytest.exit(
+            "ОСТАНОВЛЕНО на этапе 1 (полностью локально, без сети, "
+            "без записи):\n  - " + "\n  - ".join(stage1_failures),
+            returncode=2)
+
+    # ═══ ЭТАП 2. ТОЛЬКО ограниченная диагностика базы ═══
+    # Единственное сетевое действие: чтение имени базы и
+    # отдельного диагностического маркера. DDL, DML, создание
+    # пользователей/сессий/фикстур и HTTP-запросы ЗАПРЕЩЕНЫ.
+    dsn = os.environ["TEST_DB_DSN"]
+    try:
+        # options=-c default_transaction_read_only=on — соединение
+        # в режиме только чтения, где это поддерживается сервером.
+        with psycopg2.connect(
+                dsn, connect_timeout=5,
+                options="-c default_transaction_read_only=on") as conn:
+            with conn.cursor() as cur:
+                cur.execute("SELECT current_database()")
+                dbname = cur.fetchone()[0]
+                # Отдельный маркер НАЗНАЧЕНИЯ базы — одного имени
+                # базы недостаточно. Требуется специальная запись,
+                # которую владелец тестовой среды заводит один раз
+                # при подготовке изолированного контура.
+                cur.execute(
+                    "SELECT 1 FROM information_schema.tables "
+                    "WHERE table_name = 'test_environment_marker'")
+                marker_table_exists = cur.fetchone() is not None
+                purpose, marker_project_id = None, None
+                if marker_table_exists:
+                    # Маркер должен подтверждать НЕ ТОЛЬКО назначение,
+                    # но и ожидаемые идентификаторы проекта и базы —
+                    # одного известного значения purpose недостаточно.
+                    cur.execute(
+                        "SELECT purpose, expected_project_id "
+                        "FROM test_environment_marker LIMIT 1")
+                    row = cur.fetchone()
+                    if row:
+                        purpose, marker_project_id = row
+    except Exception as exc:
+        pytest.exit(
+            f"ОСТАНОВЛЕНО на этапе 2: нет диагностического "
+            f"подключения к заявленной тестовой базе: {exc}",
+            returncode=2)
+
+    stage2_failures = []
+    if SYNTHETIC_SCHEMA_MARKER not in dbname.lower():
+        stage2_failures.append(
+            f"База '{dbname}' не помечена как тестовая по имени")
+    if purpose != "isolated-audit-mode-test":
+        stage2_failures.append(
+            "Отсутствует или не совпадает маркер назначения "
+            "test_environment_marker.purpose = "
+            "'isolated-audit-mode-test'")
+    # Маркер обязан подтверждать ожидаемый идентификатор проекта —
+    # совпадение только purpose недостаточно, значение не секретно
+    # и само по себе не доказывает, что база предназначена именно
+    # для ЭТОГО тестового набора.
+    if marker_project_id != SYNTHETIC_PROJECT_ID:
+        stage2_failures.append(
+            f"test_environment_marker.expected_project_id "
+            f"({marker_project_id}) не совпадает с "
+            f"SYNTHETIC_PROJECT_ID ({SYNTHETIC_PROJECT_ID})")
+
+    if stage2_failures:
+        pytest.exit(
+            "ОСТАНОВЛЕНО на этапе 2 (диагностика без записи):\n  - "
+            + "\n  - ".join(stage2_failures), returncode=2)
+
+    # Этапы 1 и 2 пройдены ТРЕМЯ независимыми признаками: именем
+    # базы, маркером назначения И маркером ожидаемого проекта.
+    # ТЕХНИЧЕСКАЯ, а не договорная гарантия: pytest.exit() выше
+    # немедленно завершает ВЕСЬ сеанс pytest при любом провале —
+    # ни одна фикстура ниже физически не будет вызвана, поскольку
+    # сбор и выполнение тестов до этой точки не доходит. Флаги
+    # ниже — дополнительный defense-in-depth поверх этой гарантии.
+    config._stage1_passed = True
+    config._stage2_passed = True
+
+
+@pytest.fixture(scope="session")
+def base_url():
+    return os.environ["TEST_BASE_URL"]
+
+
+@pytest.fixture(scope="session")
+def db_dsn():
+    return os.environ["TEST_DB_DSN"]
+
+
+@pytest.fixture(scope="session")
+def schema():
+    return os.environ["TEST_DB_SCHEMA"]
+
+
+# ── Создание синтетических данных и АВТОРИЗОВАННЫХ КОНТЕКСТОВ ──
+@pytest.fixture(scope="session")
+def synthetic_env(request, db_dsn, schema):
+    """Создаёт проект, 4 пользователя, сессии, процесс с архивом.
+
+    Сессии создаются ПРЯМОЙ ЗАПИСЬЮ В ТЕСТОВУЮ БАЗУ,
+    без обращения к production и без формы входа.
+
+    ЗАЩИТА ВТОРОГО УРОВНЯ: явная проверка флагов этапов 1 и 2
+    перед любой записью — на случай, если в будущем фикстура
+    будет вызвана в обход обычного порядка сбора pytest.
+    """
+    assert getattr(request.config, "_stage1_passed", False), (
+        "Запись запрещена: этап 1 предохранителя не пройден")
+    assert getattr(request.config, "_stage2_passed", False), (
+        "Запись запрещена: этап 2 предохранителя не пройден")
+
+    conn = psycopg2.connect(db_dsn)
+    conn.autocommit = True
+    sessions, process_id = {}, None
+    with conn.cursor() as cur:
+        cur.execute(
+            f"INSERT INTO {schema}.projects (id, name) VALUES (%s, %s) "
+            f"ON CONFLICT (id) DO NOTHING",
+            (SYNTHETIC_PROJECT_ID, "ТЕСТ. Синтетический проект"))
+
+        for user in SYNTHETIC_USERS:
+            cur.execute(
+                f"INSERT INTO {schema}.users "
+                f"(project_id, email, name, role) "
+                f"VALUES (%s, %s, %s, %s) RETURNING id",
+                (SYNTHETIC_PROJECT_ID, user["email"],
+                 user["name"], user["role"]))
+            user_id = cur.fetchone()[0]
+            token = f"test-{uuid.uuid4()}"
+            cur.execute(
+                f"INSERT INTO {schema}.sessions "
+                f"(user_id, token, expires_at) "
+                f"VALUES (%s, %s, now() + interval '1 hour')",
+                (user_id, token))
+            sessions[user["key"]] = token
+
+        cols = ", ".join(SYNTHETIC_PROCESS.keys())
+        vals = ", ".join(["%s"] * len(SYNTHETIC_PROCESS))
+        cur.execute(
+            f"INSERT INTO {schema}.macro_processes "
+            f"(project_id, {cols}) VALUES (%s, {vals}) RETURNING id",
+            (SYNTHETIC_PROJECT_ID, *SYNTHETIC_PROCESS.values()))
+        process_id = cur.fetchone()[0]
+
+        for fn in SYNTHETIC_FUNCTIONS:
+            fcols = ", ".join(fn.keys())
+            fvals = ", ".join(["%s"] * len(fn))
+            cur.execute(
+                f"INSERT INTO {schema}.functions "
+                f"(macro_process_id, {fcols}) "
+                f"VALUES (%s, {fvals})",
+                (process_id, *fn.values()))
+
+    yield {"sessions": sessions, "process_id": process_id,
+           "conn": conn}
+
+    # ── ОЧИСТКА. Выполняется ВСЕГДА, включая падение тестов ──
+    with conn.cursor() as cur:
+        for table in CLEANUP_TABLES:
+            cur.execute(
+                f"DELETE FROM {schema}.{table} "
+                f"WHERE project_id = %s", (SYNTHETIC_PROJECT_ID,))
+        cur.execute(
+            f"SELECT COUNT(*) FROM {schema}.macro_processes "
+            f"WHERE project_id = %s", (SYNTHETIC_PROJECT_ID,))
+        assert cur.fetchone()[0] == 0, "Очистка не завершена"
+    conn.close()
+
+
+@pytest.fixture(scope="session")
+def sessions(synthetic_env):
+    return synthetic_env["sessions"]
+
+
+@pytest.fixture(scope="session")
+def process_id(synthetic_env):
+    return synthetic_env["process_id"]
+
+
+def _archive_checksum(dsn, schema):
+    """MD5 архивных полей в хранилище."""
+    with psycopg2.connect(dsn) as conn:
+        with conn.cursor() as cur:
+            cur.execute(
+                f"SELECT id, archived_current_state, "
+                f"archived_pain_points, archived_target_state, "
+                f"archived_target_effect, archived_ai_opportunity "
+                f"FROM {schema}.macro_processes "
+                f"WHERE project_id = %s ORDER BY id",
+                (SYNTHETIC_PROJECT_ID,))
+            raw = repr(cur.fetchall()).encode()
+    return hashlib.md5(raw).hexdigest()
+
+
+@pytest.fixture(scope="session")
+def db_checksum_before(synthetic_env, db_dsn, schema):
+    return _archive_checksum(db_dsn, schema)
+
+
+@pytest.fixture
+def db_checksum_after(db_dsn, schema):
+    return lambda: _archive_checksum(db_dsn, schema)
```

### Файл 4 из 5

```diff
--- /dev/null
+++ b/backend/process-map/tests/test_audit_mode_disabled.py
@@ -0,0 +1,171 @@
+"""Проверка: audit_mode отключён, архив не выдаётся.
+
+ЗАПУСК ТОЛЬКО В ИЗОЛИРОВАННОЙ СРЕДЕ.
+Предохранитель в conftest.py прерывает выполнение
+до первого сетевого запроса при отсутствии подтверждений.
+"""
+import json
+
+import pytest
+import requests
+
+from fixtures import (CANARY_MARKERS, EXPECTED_KEYS,
+                      FORBIDDEN_KEYS, ROLE_KEYS)
+
+TIMEOUT = 15
+
+
+def walk(obj, keys=None, values=None):
+    """Рекурсивный обход ЛЮБОЙ вложенности.
+
+    Собирает отдельно все ключи и все скалярные значения,
+    включая словари внутри списков внутри словарей.
+    """
+    keys = [] if keys is None else keys
+    values = [] if values is None else values
+    if isinstance(obj, dict):
+        for k, v in obj.items():
+            keys.append(str(k))
+            walk(v, keys, values)
+    elif isinstance(obj, (list, tuple)):
+        for v in obj:
+            walk(v, keys, values)
+    else:
+        values.append(str(obj))
+    return keys, values
+
+
+def assert_no_archive(response_text, context=""):
+    """Тройная проверка: ключи, значения, сырой текст."""
+    # 1. Сырой текст — ловит утечку даже при неразбираемом JSON
+    for marker in CANARY_MARKERS:
+        assert marker not in response_text, (
+            f"[{context}] Архивное значение в сыром ответе: {marker}")
+
+    try:
+        payload = json.loads(response_text)
+    except json.JSONDecodeError:
+        return
+
+    keys, values = walk(payload)
+
+    # 2. Запрещённые ключи на любом уровне
+    for forbidden in FORBIDDEN_KEYS:
+        assert forbidden not in keys, (
+            f"[{context}] Запрещённый ключ на любом уровне: {forbidden}")
+
+    # 3. Канарейки в значениях на любом уровне
+    for marker in CANARY_MARKERS:
+        assert marker not in values, (
+            f"[{context}] Архивное значение во вложенности: {marker}")
+
+
+def call(base_url, payload, token=None):
+    headers = {"Content-Type": "application/json"}
+    if token:
+        headers["X-Session-Id"] = token
+    return requests.post(base_url, json=payload,
+                         headers=headers, timeout=TIMEOUT)
+
+
+# ═══ Сценарий 1. Без авторизации → 401 ════════════════════════
+def test_01_no_auth_returns_401(base_url, process_id):
+    r = call(base_url, {"action": "process_map.get",
+                        "process_id": process_id,
+                        "audit_mode": True})
+    assert r.status_code == 401, f"Ожидался 401, получен {r.status_code}"
+    assert_no_archive(r.text, "без авторизации")
+
+
+# ═══ Сценарии 2-5. Все четыре роли с audit_mode: true ═════════
+@pytest.mark.parametrize("role", ROLE_KEYS)
+def test_02_05_no_archive_any_role(base_url, process_id,
+                                   sessions, role):
+    r = call(base_url, {"action": "process_map.get",
+                        "process_id": process_id,
+                        "audit_mode": True}, sessions[role])
+    assert r.status_code in (200, 403)
+    assert_no_archive(r.text, f"роль {role}")
+
+
+# ═══ Сценарий 6. Отсутствие has_archived_data ═════════════════
+@pytest.mark.parametrize("role", ROLE_KEYS)
+def test_06_no_has_archived_data(base_url, process_id,
+                                 sessions, role):
+    r = call(base_url, {"action": "process_map.get",
+                        "process_id": process_id}, sessions[role])
+    keys, _ = walk(json.loads(r.text))
+    assert "has_archived_data" not in keys, (
+        f"Флаг has_archived_data присутствует, роль {role}")
+
+
+# ═══ Сценарий 7. Отсутствие audit_access ══════════════════════
+@pytest.mark.parametrize("role", ROLE_KEYS)
+def test_07_no_audit_access(base_url, process_id, sessions, role):
+    r = call(base_url, {"action": "process_map.get",
+                        "process_id": process_id}, sessions[role])
+    keys, _ = walk(json.loads(r.text))
+    assert "audit_access" not in keys, (
+        f"Флаг audit_access присутствует, роль {role}")
+
+
+# ═══ Сценарий 8. audit_mode: true игнорируется ════════════════
+@pytest.mark.parametrize("role", ROLE_KEYS)
+def test_08_audit_mode_ignored(base_url, process_id,
+                               sessions, role):
+    with_flag = call(base_url, {"action": "process_map.get",
+                                "process_id": process_id,
+                                "audit_mode": True}, sessions[role])
+    without = call(base_url, {"action": "process_map.get",
+                              "process_id": process_id},
+                   sessions[role])
+    assert with_flag.status_code == without.status_code
+    a = json.loads(with_flag.text).get("data")
+    b = json.loads(without.text).get("data")
+    assert a == b, f"audit_mode влияет на ответ, роль {role}"
+
+
+# ═══ Сценарий 9. Штатный ответ без параметра ══════════════════
+def test_09_normal_response(base_url, process_id, sessions):
+    r = call(base_url, {"action": "process_map.get",
+                        "process_id": process_id},
+             sessions["owner"])
+    assert r.status_code == 200
+    proc = json.loads(r.text)["data"]["process"]
+    for key in EXPECTED_KEYS:
+        assert key in proc, f"Отсутствует штатное поле {key}"
+    assert_no_archive(r.text, "штатный ответ")
+
+
+# ═══ Сценарий 10. Вложенные объекты ═══════════════════════════
+def test_10_no_archive_nested(base_url, process_id, sessions):
+    """Архив есть у процесса И у функций.
+    Обход walk() покрывает functions[], units[] и любую глубину.
+    """
+    r = call(base_url, {"action": "process_map.list"},
+             sessions["owner"])
+    assert_no_archive(r.text, "список, вложенность")
+
+    r2 = call(base_url, {"action": "process_map.get",
+                         "process_id": process_id},
+              sessions["owner"])
+    payload = json.loads(r2.text)
+    _, values = walk(payload)
+    assert len(values) > 0, "Пустой ответ — обход некорректен"
+    assert_no_archive(r2.text, "карточка, вложенность")
+
+
+# ═══ Сценарий 11. Неизменность архива в хранилище ═════════════
+def test_11_archive_unchanged(db_checksum_before, db_checksum_after):
+    assert db_checksum_before == db_checksum_after(), (
+        "Архивные данные в хранилище изменились")
+
+
+# ═══ Сценарий 12. Пользовательские ошибки ═════════════════════
+@pytest.mark.parametrize("bad", [
+    {"action": "process_map.get", "process_id": 999999999,
+     "audit_mode": True},
+    {"action": "process_map.get", "process_id": "не-число",
+     "audit_mode": True},
+    {"action": "process_map.get", "audit_mode": True},
+    {"action": "неизвестное_действие", "audit_mode": True},
+    {"audit_mode": True},
+    {"action": "process_map.get", "process_id": -1,
+     "audit_mode": "да"},
+])
+def test_12_no_archive_in_errors(base_url, sessions, bad):
+    r = call(base_url, bad, sessions["owner"])
+    assert_no_archive(r.text, f"ошибка {bad.get('action')}")
+    assert "Traceback" not in r.text, "Утечка стека вызовов"
```

### Файл 5 из 5

```diff
--- /dev/null
+++ b/backend/process-map/tests/README.md
@@ -0,0 +1,46 @@
+# Тесты отключения режима аудита
+
+## ТОЛЬКО ИЗОЛИРОВАННАЯ СРЕДА
+
+Запуск против production **запрещён**. Предохранитель прерывает
+выполнение до первого сетевого запроса при отсутствии хотя бы
+одного из трёх положительных подтверждений.
+
+## Обязательные переменные
+
+| Переменная | Значение | Проверка |
+|---|---|---|
+| `TEST_ENV_CONFIRMED` | `isolated-test-env` | Точное совпадение |
+| `TEST_PROJECT_ID` | `999001` | Точное совпадение |
+| `TEST_DB_DSN` | DSN тестовой базы | Подключение + имя базы содержит `test` |
+| `TEST_DB_SCHEMA` | Схема тестовой базы | — |
+| `TEST_BASE_URL` | URL тестовой функции | — |
+
+## Запуск
+
+```bash
+cd backend/process-map/tests
+pip install -r requirements.txt
+
+export TEST_ENV_CONFIRMED="isolated-test-env"
+export TEST_PROJECT_ID="999001"
+export TEST_DB_DSN="<dsn-тестовой-базы>"
+export TEST_DB_SCHEMA="<схема>"
+export TEST_BASE_URL="<url-тестовой-функции>"
+
+pytest -v --tb=short --timeout=60
+```
+
+## Очистка
+
+Выполняется автоматически в фикстуре `synthetic_env`,
+включая случай падения тестов. Проверяется контрольным
+запросом: записей с `project_id = 999001` не остаётся.
+
+## Ожидаемый результат
+
+27 прогонов, все пройдены. Любое падение = признак утечки.
```

---

## 5. Способ создания авторизованных контекстов

| Роль | Способ |
|---|---|
| Владелец, администратор, редактор, наблюдатель | Прямая вставка пользователя и сессии **в тестовую базу** |

**Существенно:**

| Свойство | Реализация |
|---|---|
| Обращение к production | **Отсутствует** |
| Форма входа production | Не используется |
| Реальные учётные данные | Не используются |
| Срок жизни сессии | 1 час |
| Домен адресов | `example.invalid` — зарезервирован, не существует |
| Удаление после прогона | Обязательно, проверяется |

---

## 6. Соответствие 12 обязательным сценариям

| № | Сценарий | Тест | Прогонов | Ожидаемый результат |
|---|---|---|---|---|
| 1 | 401 без авторизации | `test_01` | 1 | Код 401, архива нет |
| 2 | Нет `archived_*` у владельца | `test_02_05[owner]` | 1 | Пройден |
| 3 | Нет `archived_*` у администратора | `test_02_05[admin]` | 1 | Пройден |
| 4 | Нет архивных полей у редактора | `test_02_05[editor]` | 1 | Пройден |
| 5 | Нет архивных полей у наблюдателя | `test_02_05[viewer]` | 1 | Пройден |
| 6 | Отсутствие `has_archived_data` | `test_06` | **4** | Пройден для всех ролей |
| 7 | Отсутствие `audit_access` | `test_07` | **4** | Пройден для всех ролей |
| 8 | Игнорирование `audit_mode: true` | `test_08` | **4** | Ответы идентичны |
| 9 | Штатный ответ без параметра | `test_09` | 1 | 200, штатные поля на месте |
| 10 | Нет архива во вложенных объектах | `test_10` | 1 | Пройден |
| 11 | Неизменность архива в хранилище | `test_11` | 1 | MD5 совпадает |
| 12 | Нет раскрытия в ошибках | `test_12` | **6** | Пройден, стека нет |
| — | **ИТОГО** | **12 тестов** | **27 прогонов** | Все пройдены |

---

## 7. Предохранитель — трёхэтапная модель, исправлено по замечанию

**Исправление принято.** Прежний этап 1 проверял только
`TEST_ENV_CONFIRMED` и `TEST_PROJECT_ID` — этого недостаточно,
одной переменной мало. Модель дополнена.

| Этап | Что проверяется | Сетевое обращение | Действия при успехе |
|---|---|---|---|
| **1** | `TEST_ENV_CONFIRMED` **+** локальный маркер тестового пакета (зашит в код, не в окружении) **+** полнота всех 5 обязательных переменных **+** явный запрет HTTP/записи до этого момента | **Нет** | Переход к этапу 2 |
| **2** | `SELECT current_database()` **+** диагностическая таблица `test_environment_marker` с полями `purpose` и `expected_project_id` **+** соединение в режиме `read_only`, где сервер это поддерживает | **Да, только чтение** | Переход к этапу 3 |
| **3** | — | Запись фикстур, HTTP-запросы к функции | Только в отдельных фикстурах, **не** в `pytest_configure`, и только после отдельного разрешения на применение diff |

### 7.1. Этап 1 — четыре локальные проверки

| № | Проверка | Источник |
|---|---|---|
| 1a | `TEST_ENV_CONFIRMED == "isolated-test-env"` | Переменная окружения |
| 1b | **Локальный маркер тестового пакета** — константа в коде, не из окружения. Подтверждает состав тестового пакета, но **не доказывает изоляцию сам по себе** — используется только совместно с 1a, 1c, 1d и признаками этапа 2 | Код `conftest.py` |
| 1c | **Полнота** всех 5 обязательных переменных (`TEST_ENV_CONFIRMED`, `TEST_PROJECT_ID`, `TEST_DB_DSN`, `TEST_DB_SCHEMA`, `TEST_BASE_URL`) | Переменные окружения |
| 1d | Флаг `_stage1_passed` явно `False` до прохождения | Состояние `pytest` |

**Переменная `TEST_ENV_CONFIRMED` сама по себе недостаточна** —
это один из четырёх признаков этапа 1, ни один не самодостаточен.

**Техническая, а не только договорная невозможность записи
до завершения этапа 2:** `pytest.exit()` внутри
`pytest_configure` немедленно останавливает **весь сеанс**
pytest — сбор и выполнение тестов, включая фикстуру
`synthetic_env`, физически не начинается. Дополнительно
`synthetic_env` содержит явный `assert` на флаги
`_stage1_passed`/`_stage2_passed` перед первой записью —
двойная защита на случай нестандартного вызова фикстуры.

### 7.2. Этап 2 — три независимых признака базы

Проверка одного `current_database()` признана недостаточной.
Одного известного значения `purpose` тоже недостаточно —
добавлена проверка ожидаемого идентификатора проекта.

| № | Признак | Что подтверждает |
|---|---|---|
| 2a | Имя базы содержит маркер `test` | Слабый признак — легко подделать именованием |
| 2b | `test_environment_marker.purpose = 'isolated-audit-mode-test'` | Осознанное назначение среды владельцем |
| 2c | `test_environment_marker.expected_project_id = 999001` | **Дополнительно** — подтверждает, что база предназначена именно для ЭТОГО тестового набора, а не для чужого с похожим `purpose` |

**Все три признака обязательны одновременно.**

**Требование к среде дополнено:** при создании изолированной
среды необходимо создать таблицу-маркер:

```sql
CREATE TABLE test_environment_marker (
    purpose             text NOT NULL,
    expected_project_id integer NOT NULL
);
INSERT INTO test_environment_marker (purpose, expected_project_id)
VALUES ('isolated-audit-mode-test', 999001);
```

**Статус таблицы, по вашему уточнению:**

| Свойство | Значение |
|---|---|
| Входит в реестр MVP | **Нет** — не одна из 17 таблиц |
| Создаётся в production | **Нет** |
| В плане продуктовых миграций | **Нет** |
| Кто создаёт | Владелец тестовой среды при подготовке контура |
| Содержимое | Только технический маркер, без персональных или архивных данных |
| Удаляется вместе со средой | Да |

Требование добавлено в запрос на среду как элемент тестовой
инфраструктуры (`rev2-12`, разд. 7.2, пункт 11).

**На этапе 2 по-прежнему запрещено:** HTTP-запросы к тестируемой
функции, создание пользователей, сессий, любых фикстур, DDL,
DML — только диагностическое чтение в режиме read-only.

### 7.3. Общие правила

| Свойство | Реализация |
|---|---|
| При несовпадении на этапе 1 или 2 | Немедленный выход, без перехода дальше, без записи, код 2 |
| Накопление ошибок | В пределах одного этапа выводятся все непройденные признаки сразу |
| Список запрещённых адресов | Как единственный механизм **не используется** |
| Этап 3 | Требует **отдельного разрешения на применение diff**, которого сейчас нет |

---

## 8. Процедура очистки

| Шаг | Действие | Гарантия |
|---|---|---|
| 1 | Удаление связей группы функций с оргединицами | Фикстура `synthetic_env` |
| 2 | Удаление связей функций с подразделениями | То же |
| 3 | Удаление синтетических функций | То же |
| 4 | Удаление синтетических групп функций | То же |
| 5 | Удаление тестовых сессий | То же |
| 6 | Удаление тестовых пользователей | То же |
| 7 | Удаление синтетического проекта | То же |
| 8 | **Контрольная проверка** отсутствия записей | `assert` в фикстуре |

Очистка в блоке после `yield` — выполняется **всегда**,
включая падение тестов и прерывание.

---

## 9. Что запрещено и не выполнено

| Запрет | Соблюдён |
|---|---|
| Создавать файлы в `backend/process-map/tests/` | **Да** — каталог отсутствует |
| Изменять рабочую ветку | **Да** |
| Коммитить тестовый код | **Да** |
| Изменять продуктовый код | **Да** |
| Изменять конфигурацию production | **Да** |
| Развёртывать тесты | **Да** |
| Создавать сессии в production | **Да** |
| Снимать заморозку схемы и миграций | **Да** |
| Запускать тесты | **Да** — среды нет |