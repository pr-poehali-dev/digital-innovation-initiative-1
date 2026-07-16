"""Отправка email через Яндекс.Почту (SMTP). Ошибки не должны ронять основной запрос."""
import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

SMTP_HOST = "smtp.yandex.ru"
SMTP_PORT = 465
SMTP_USER = os.environ.get("ADMIN_EMAIL", "")
SMTP_PASSWORD = os.environ.get("SMTP_YANDEX_APP_PASSWORD", "")


def send_email(to_email: str, subject: str, html_body: str) -> bool:
    """Отправляет письмо. Возвращает True при успехе, False при ошибке (не бросает исключение)."""
    if not SMTP_USER or not SMTP_PASSWORD:
        return False
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = SMTP_USER
        msg["To"] = to_email
        msg.attach(MIMEText(html_body, "html", "utf-8"))

        with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, timeout=10) as server:
            server.login(SMTP_USER, SMTP_PASSWORD)
            server.sendmail(SMTP_USER, [to_email], msg.as_string())
        return True
    except Exception:
        return False
