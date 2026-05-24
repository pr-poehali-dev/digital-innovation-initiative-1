
-- Очистка тестового счётчика для повторной проверки rate limiter после рефактора
UPDATE rate_limits SET hit_count = 0, blocked_until = NULL, first_hit_at = NOW() - INTERVAL '1 hour'
WHERE key LIKE 'login:%rate_test_atomic%';

-- Создание нового тестового ключа на всякий случай
INSERT INTO rate_limits (key, bucket, hit_count, first_hit_at, last_hit_at)
VALUES ('init_atomic_test_marker', 'init_bucket', 0, NOW(), NOW())
ON CONFLICT (key, bucket) DO NOTHING;
