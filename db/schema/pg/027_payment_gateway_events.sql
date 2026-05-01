CREATE TABLE IF NOT EXISTS payment_gateway_events (
  id TEXT PRIMARY KEY,
  provider TEXT,
  event_type TEXT NOT NULL,
  status TEXT,
  message TEXT,
  actor_user_id TEXT,
  ip TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_gateway_events_provider_created
  ON payment_gateway_events(provider, created_at);
