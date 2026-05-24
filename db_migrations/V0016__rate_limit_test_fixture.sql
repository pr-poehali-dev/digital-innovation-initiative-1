
-- Фикстура для regression-теста rate limiting: сразу заблокированный счётчик
-- IP 198.51.100.42 — RFC5737 documentation IP (никогда не будет реального трафика)
INSERT INTO rate_limits (key, bucket, hit_count, first_hit_at, last_hit_at, blocked_until)
VALUES (
  'login:rate_limit_test_fixture_ip:rate_limit_test@fixture.com',
  'login_attempts',
  10,
  NOW(),
  NOW(),
  NOW() + INTERVAL '1 year'
)
ON CONFLICT (key, bucket) DO UPDATE SET
  hit_count = 10,
  blocked_until = NOW() + INTERVAL '1 year';
