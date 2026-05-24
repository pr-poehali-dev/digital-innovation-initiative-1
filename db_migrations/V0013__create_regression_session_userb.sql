
INSERT INTO sessions (id, user_id, expires_at)
VALUES (
  'regression_test_session_userb_isolation_check_64hexchar000000aaa',
  2,
  NOW() + INTERVAL '10 years'
)
ON CONFLICT (id) DO NOTHING;
