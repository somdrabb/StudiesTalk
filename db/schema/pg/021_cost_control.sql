CREATE TABLE IF NOT EXISTS provider_catalog (
  id TEXT PRIMARY KEY,
  provider_key TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  category TEXT,
  unit_name TEXT,
  default_unit_cost_eur REAL DEFAULT 0,
  active INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS workspace_provider_limits (
  id TEXT PRIMARY KEY,
  workspace_id TEXT,
  provider_key TEXT NOT NULL,
  period TEXT NOT NULL DEFAULT 'monthly',
  hard_limit_eur REAL,
  soft_limit_eur REAL,
  unit_limit REAL,
  enabled INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(workspace_id, provider_key, period)
);

CREATE TABLE IF NOT EXISTS usage_ledger (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  provider_key TEXT NOT NULL,
  feature_key TEXT,
  units REAL DEFAULT 0,
  unit_name TEXT,
  unit_cost_eur REAL DEFAULT 0,
  cost_eur REAL DEFAULT 0,
  metadata_json TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_usage_ledger_workspace_provider_created
  ON usage_ledger(workspace_id, provider_key, created_at);

CREATE INDEX IF NOT EXISTS idx_usage_ledger_provider_created
  ON usage_ledger(provider_key, created_at);

CREATE INDEX IF NOT EXISTS idx_usage_ledger_workspace_created
  ON usage_ledger(workspace_id, created_at);

CREATE TABLE IF NOT EXISTS workspace_subscriptions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  plan_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  monthly_price_eur REAL DEFAULT 0,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cost_alerts (
  id TEXT PRIMARY KEY,
  workspace_id TEXT,
  provider_key TEXT,
  alert_type TEXT NOT NULL,
  period TEXT NOT NULL,
  threshold_eur REAL,
  current_cost_eur REAL,
  acknowledged INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO provider_catalog (id, provider_key, display_name, category, unit_name, default_unit_cost_eur, active)
VALUES
  ('openai', 'openai', 'OpenAI', 'ai', 'tokens', 0, 1),
  ('twilio', 'twilio', 'Twilio', 'messaging', 'sms', 0, 1),
  ('google_translate', 'google_translate', 'Google Translate', 'translation', 'characters', 0, 1),
  ('ionos_email', 'ionos_email', 'IONOS Email', 'email', 'email', 0, 1),
  ('storage', 'storage', 'Storage', 'storage', 'bytes', 0, 1),
  ('jitsi', 'jitsi', 'Jitsi', 'live_class', 'minutes', 0, 1),
  ('custom', 'custom', 'Custom', 'custom', 'units', 0, 1)
ON CONFLICT (provider_key) DO NOTHING;
