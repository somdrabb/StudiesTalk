CREATE TABLE IF NOT EXISTS platform_secrets (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  key_name TEXT NOT NULL,
  encrypted_value TEXT NOT NULL,
  iv TEXT NOT NULL,
  auth_tag TEXT NOT NULL,
  value_hash TEXT,
  masked_value TEXT,
  enabled INTEGER DEFAULT 1,
  environment TEXT DEFAULT 'production',
  last_test_status TEXT,
  last_test_message TEXT,
  last_tested_at TEXT,
  rotated_at TEXT,
  updated_by TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(provider, key_name, environment)
);

CREATE TABLE IF NOT EXISTS platform_secret_audit (
  id TEXT PRIMARY KEY,
  provider TEXT,
  key_name TEXT,
  environment TEXT,
  action TEXT,
  actor_user_id TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_platform_secrets_provider_env
  ON platform_secrets(provider, environment);

CREATE INDEX IF NOT EXISTS idx_platform_secret_audit_provider_env
  ON platform_secret_audit(provider, environment, created_at);
