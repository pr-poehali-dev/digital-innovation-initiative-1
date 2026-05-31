import json
import os
import psycopg2

DB = os.environ["DATABASE_URL"]
SCHEMA = os.environ.get("MAIN_DB_SCHEMA", "public")


def cors(body: dict, code: int = 200) -> dict:
    return {
        "statusCode": code,
        "headers": {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
            "Content-Type": "application/json",
        },
        "body": json.dumps(body, ensure_ascii=False, default=str),
    }


def credit_wallet(conn, user_id: int, amount_kopecks: int, payment_id: int):
    """Начислить баланс пользователю и записать транзакцию"""
    with conn.cursor() as cur:
        # Получить или создать кошелёк
        cur.execute(
            f"SELECT id FROM {SCHEMA}.wallet_accounts WHERE user_id = %s",
            (user_id,),
        )
        row = cur.fetchone()
        if not row:
            cur.execute(
                f"INSERT INTO {SCHEMA}.wallet_accounts (user_id) VALUES (%s) RETURNING id",
                (user_id,),
            )
            row = cur.fetchone()
        wallet_id = row[0]

        # Начислить баланс атомарно
        cur.execute(
            f"""UPDATE {SCHEMA}.wallet_accounts
                SET balance_kopecks = balance_kopecks + %s, updated_at = NOW()
                WHERE id = %s""",
            (amount_kopecks, wallet_id),
        )

        # Записать транзакцию
        cur.execute(
            f"""INSERT INTO {SCHEMA}.wallet_transactions
                (user_id, wallet_id, amount_kopecks, type, status, source, payment_id, description)
                VALUES (%s, %s, %s, 'topup', 'completed', 'yookassa', %s, %s)""",
            (
                user_id,
                wallet_id,
                amount_kopecks,
                payment_id,
                f"Пополнение кошелька на {amount_kopecks // 100} ₽ через ЮKassa",
            ),
        )


def handler(event: dict, context) -> dict:
    """Webhook от ЮKassa: получаем уведомление об оплате и начисляем баланс"""
    if event.get("httpMethod") == "OPTIONS":
        return cors({})

    if event.get("httpMethod") != "POST":
        return cors({"error": "method_not_allowed"}, 405)

    body_raw = event.get("body", "") or ""
    if not isinstance(body_raw, str):
        body_raw = json.dumps(body_raw)
    try:
        payload = json.loads(body_raw)
        if not isinstance(payload, dict):
            raise ValueError("not a dict")
    except Exception:
        return cors({"error": "invalid_json"}, 400)

    event_type = payload.get("event", "")
    payment_obj = payload.get("object", {})
    provider_payment_id = payment_obj.get("id", "")

    conn = psycopg2.connect(DB)
    try:
        # Сохраняем любой входящий webhook для аудита
        with conn.cursor() as cur:
            cur.execute(
                f"""INSERT INTO {SCHEMA}.yookassa_webhook_events
                    (event_type, provider_payment_id, payload)
                    VALUES (%s, %s, %s)
                    RETURNING id""",
                (event_type, provider_payment_id, json.dumps(payload)),
            )
            webhook_event_id = cur.fetchone()[0]
        conn.commit()

        # Обрабатываем только успешные платежи
        if event_type != "payment.succeeded":
            return cors({"ok": True, "event_type": event_type})

        yk_status = payment_obj.get("status", "")
        if yk_status != "succeeded":
            return cors({"ok": True, "status": yk_status})

        # Ищем платёж в нашей БД
        with conn.cursor() as cur:
            cur.execute(
                f"""SELECT id, user_id, amount_kopecks, webhook_processed
                    FROM {SCHEMA}.payments
                    WHERE provider_payment_id = %s""",
                (provider_payment_id,),
            )
            payment_row = cur.fetchone()

        if not payment_row:
            # Помечаем webhook как ошибочный
            with conn.cursor() as cur:
                cur.execute(
                    f"UPDATE {SCHEMA}.yookassa_webhook_events SET error = 'payment_not_found' WHERE id = %s",
                    (webhook_event_id,),
                )
            conn.commit()
            return cors({"ok": True, "warn": "payment_not_found"})

        payment_db_id, user_id, amount_kopecks, already_processed = payment_row

        # Идемпотентность: не начислять дважды
        if already_processed:
            return cors({"ok": True, "warn": "already_processed"})

        # Проверяем сумму из ЮKassa
        yk_amount = payment_obj.get("amount", {})
        yk_value_rub = float(yk_amount.get("value", 0))
        yk_kopecks = int(round(yk_value_rub * 100))

        if yk_kopecks != amount_kopecks:
            with conn.cursor() as cur:
                cur.execute(
                    f"UPDATE {SCHEMA}.yookassa_webhook_events SET error = 'amount_mismatch' WHERE id = %s",
                    (webhook_event_id,),
                )
                cur.execute(
                    f"UPDATE {SCHEMA}.payments SET status = 'failed', updated_at = NOW() WHERE id = %s",
                    (payment_db_id,),
                )
            conn.commit()
            return cors({"ok": True, "warn": "amount_mismatch"})

        # Всё проверено — начисляем баланс
        credit_wallet(conn, user_id, amount_kopecks, payment_db_id)

        # Помечаем платёж как обработанный
        with conn.cursor() as cur:
            cur.execute(
                f"""UPDATE {SCHEMA}.payments
                    SET status = 'succeeded', webhook_processed = TRUE, updated_at = NOW()
                    WHERE id = %s""",
                (payment_db_id,),
            )
            cur.execute(
                f"UPDATE {SCHEMA}.yookassa_webhook_events SET processed = TRUE WHERE id = %s",
                (webhook_event_id,),
            )
        conn.commit()

        return cors({"ok": True})

    except Exception as e:
        conn.rollback()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    f"UPDATE {SCHEMA}.yookassa_webhook_events SET error = %s WHERE provider_payment_id = %s AND processed = FALSE",
                    (str(e), provider_payment_id),
                )
            conn.commit()
        except Exception:
            pass
        raise
    finally:
        conn.close()