
-- Тест изоляции: создаём второго пользователя
INSERT INTO users (email, password_hash, name)
VALUES ('test_user_b@example.com', encode(sha256(convert_to('TestUserB2026', 'UTF8')), 'hex'), 'Тестовый Пользователь B')
ON CONFLICT (email) DO NOTHING;
