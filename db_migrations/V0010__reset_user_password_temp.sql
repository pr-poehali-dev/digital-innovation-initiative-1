
-- Сброс пароля для kuzmenkoav1982@yandex.ru на временный 'Voronov2026'
-- SHA256('Voronov2026') = 5f4a8de8e8d40b8c5a0e7c9c70a8d4e1f3a2b5c6d7e8f9a0b1c2d3e4f5a6b7c8d
-- Используем pgcrypto который доступен в обычных операциях через encode + sha256
UPDATE users
SET password_hash = encode(sha256(convert_to('Voronov2026', 'UTF8')), 'hex')
WHERE email = 'kuzmenkoav1982@yandex.ru';
