import json
import os
import uuid
import base64
import urllib.request
import urllib.parse
import psycopg2

DB = os.environ["DATABASE_URL"]
SCHEMA = os.environ.get("MAIN_DB_SCHEMA", "public")
SHOP_ID = os.environ.get("YOOKASSA_SHOP_ID", "")
SECRET_KEY = os.environ.get("YOOKASSA_SECRET_KEY", "")
RETURN_URL = os.environ.get("YOOKASSA_RETURN_URL", "https://raven.moscow/cabinet/wallet")

TOPUP_PRESETS = [500, 1000, 3000, 5000]  # рублей


def cors(body: dict, code: int = 200) -> dict:
    return {
        "statusCode": code,
        "headers": {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, X-User-Id, X-Auth-Token, X-Session-Id",
            "Content-Type": "application/json",
        },
        "body": json.dumps(body, ensure_ascii=False, default=str),
    }


def get_user(conn, session_id: str):
    with conn.cursor() as cur:
        cur.execute(
            f"SELECT u.id, u.name, u.email FROM {SCHEMA}.sessions s JOIN {SCHEMA}.users u ON u.id = s.user_id WHERE s.id = %s AND s.expires_at > NOW()",
            (session_id,),
        )
        row = cur.fetchone()
    if not row:
        return None
    return {"id": row[0], "name": row[1], "email": row[2]}


def get_or_create_wallet(conn, user_id: int) -> dict:
    with conn.cursor() as cur:
        cur.execute(
            f"SELECT id, balance_kopecks, currency FROM {SCHEMA}.wallet_accounts WHERE user_id = %s",
            (user_id,),
        )
        row = cur.fetchone()
        if not row:
            cur.execute(
                f"INSERT INTO {SCHEMA}.wallet_accounts (user_id) VALUES (%s) RETURNING id, balance_kopecks, currency",
                (user_id,),
            )
            row = cur.fetchone()
            conn.commit()
    return {"id": row[0], "balance_kopecks": row[1], "currency": row[2]}


def yookassa_create_payment(amount_rub: int, idempotency_key: str, user_id: int, payment_db_id: int, user_email: str = "") -> dict:
    """Создать платёж в ЮKassa API"""
    return_url = f"{RETURN_URL}?payment_id={payment_db_id}"
    payload = {
        "amount": {"value": f"{amount_rub}.00", "currency": "RUB"},
        "confirmation": {"type": "redirect", "return_url": return_url},
        "capture": True,
        "description": f"Пополнение кошелька Траектория на {amount_rub} ₽",
        "metadata": {
            "user_id": str(user_id),
            "payment_db_id": str(payment_db_id),
            "source": "wallet_topup",
        },
        "receipt": {
            "customer": {"email": user_email or "noreply@raven.moscow"},
            "items": [
                {
                    "description": f"Пополнение кошелька на {amount_rub} ₽",
                    "quantity": "1.00",
                    "amount": {"value": f"{amount_rub}.00", "currency": "RUB"},
                    "vat_code": 1,
                    "payment_mode": "full_prepayment",
                    "payment_subject": "service",
                }
            ],
        },
    }
    data = json.dumps(payload).encode()
    credentials = base64.b64encode(f"{SHOP_ID}:{SECRET_KEY}".encode()).decode()
    req = urllib.request.Request(
        "https://api.yookassa.ru/v3/payments",
        data=data,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Basic {credentials}",
            "Idempotence-Key": idempotency_key,
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        error_body = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"YooKassa HTTP {e.code}: {error_body}")


def handler(event: dict, context) -> dict:
    """Кошелёк пользователя: баланс, транзакции, пополнение через ЮKassa"""
    if event.get("httpMethod") == "OPTIONS":
        return cors({})

    session_id = (event.get("headers") or {}).get("x-session-id") or (event.get("headers") or {}).get("X-Session-Id")
    if not session_id:
        return cors({"error": "unauthorized"}, 401)

    body = {}
    if event.get("body"):
        try:
            body = json.loads(event["body"])
        except Exception:
            pass

    action = body.get("action") or (event.get("queryStringParameters") or {}).get("action", "")

    conn = psycopg2.connect(DB)
    try:
        user = get_user(conn, session_id)
        if not user:
            return cors({"error": "unauthorized"}, 401)

        # --- get_balance ---
        if action == "wallet.get_balance":
            wallet = get_or_create_wallet(conn, user["id"])
            return cors({
                "balance_kopecks": wallet["balance_kopecks"],
                "balance_rub": wallet["balance_kopecks"] / 100,
                "currency": wallet["currency"],
                "presets": TOPUP_PRESETS,
            })

        # --- get_transactions ---
        elif action == "wallet.get_transactions":
            wallet = get_or_create_wallet(conn, user["id"])
            limit = min(int(body.get("limit", 20)), 50)
            offset = int(body.get("offset", 0))
            with conn.cursor() as cur:
                cur.execute(
                    f"""SELECT id, amount_kopecks, type, status, source, description, created_at
                        FROM {SCHEMA}.wallet_transactions
                        WHERE user_id = %s
                        ORDER BY created_at DESC
                        LIMIT %s OFFSET %s""",
                    (user["id"], limit, offset),
                )
                rows = cur.fetchall()
            txs = [
                {
                    "id": r[0],
                    "amount_kopecks": r[1],
                    "amount_rub": r[1] / 100,
                    "type": r[2],
                    "status": r[3],
                    "source": r[4],
                    "description": r[5],
                    "created_at": r[6],
                }
                for r in rows
            ]
            return cors({"transactions": txs})

        # --- create_topup_payment ---
        elif action == "wallet.create_topup":
            amount_rub = int(body.get("amount_rub", 0))
            if amount_rub < 10 or amount_rub > 100000:
                return cors({"error": "invalid_amount"}, 400)

            idempotency_key = str(uuid.uuid4())
            amount_kopecks = amount_rub * 100

            with conn.cursor() as cur:
                cur.execute(
                    f"""INSERT INTO {SCHEMA}.payments
                        (user_id, amount_kopecks, idempotency_key, metadata)
                        VALUES (%s, %s, %s, %s)
                        RETURNING id""",
                    (user["id"], amount_kopecks, idempotency_key,
                     json.dumps({"source": "wallet_topup", "user_id": user["id"]})),
                )
                payment_db_id = cur.fetchone()[0]
            conn.commit()

            print(f"[wallet] creating YK payment: shop={SHOP_ID!r} amount={amount_rub} return_url={RETURN_URL}?payment_id={payment_db_id}")
            try:
                yk_payment = yookassa_create_payment(amount_rub, idempotency_key, user["id"], payment_db_id, user.get("email",""))
            except RuntimeError as e:
                print(f"[wallet] YK error: {e}")
                return cors({"error": "payment_gateway_error", "detail": str(e)}, 502)

            provider_payment_id = yk_payment.get("id")
            confirmation_url = yk_payment.get("confirmation", {}).get("confirmation_url", "")
            yk_status = yk_payment.get("status", "pending")

            with conn.cursor() as cur:
                cur.execute(
                    f"""UPDATE {SCHEMA}.payments
                        SET provider_payment_id = %s, confirmation_url = %s, status = %s, updated_at = NOW()
                        WHERE id = %s""",
                    (provider_payment_id, confirmation_url, yk_status, payment_db_id),
                )
            conn.commit()

            return cors({
                "payment_id": payment_db_id,
                "provider_payment_id": provider_payment_id,
                "confirmation_url": confirmation_url,
                "status": yk_status,
                "amount_rub": amount_rub,
            })

        # --- get_payment_status ---
        elif action == "wallet.get_payment_status":
            payment_db_id = int(body.get("payment_id", 0))
            with conn.cursor() as cur:
                cur.execute(
                    f"SELECT status, amount_kopecks, webhook_processed FROM {SCHEMA}.payments WHERE id = %s AND user_id = %s",
                    (payment_db_id, user["id"]),
                )
                row = cur.fetchone()
            if not row:
                return cors({"error": "not_found"}, 404)
            return cors({
                "status": row[0],
                "amount_rub": row[1] / 100,
                "webhook_processed": row[2],
            })

        else:
            return cors({"error": "unknown_action"}, 400)

    finally:
        conn.close()