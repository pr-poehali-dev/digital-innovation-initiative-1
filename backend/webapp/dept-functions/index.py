"""
dept-functions — ЗАМОРОЖЕНО. v2
Функция отключена до завершения согласования архитектуры и приёмки.
"""
import json


def handler(event: dict, context) -> dict:
    """Заглушка: модуль функций подразделения временно недоступен."""
    return {
        "statusCode": 503,
        "headers": {
            "Access-Control-Allow-Origin": "*",
            "Content-Type": "application/json",
        },
        "body": json.dumps({
            "ok": False,
            "error": "Модуль временно недоступен. Находится на доработке."
        }, ensure_ascii=False),
    }