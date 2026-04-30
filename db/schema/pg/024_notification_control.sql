CREATE TABLE IF NOT EXISTS notification_campaigns (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  channels_json TEXT NOT NULL,
  priority TEXT DEFAULT 'normal',
  target_type TEXT NOT NULL,
  target_config_json TEXT,
  subject TEXT,
  body TEXT NOT NULL,
  status TEXT DEFAULT 'draft',
  scheduled_at TIMESTAMPTZ,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  sent_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS notification_deliveries (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  workspace_id TEXT,
  user_id TEXT,
  channel TEXT NOT NULL,
  recipient TEXT,
  status TEXT DEFAULT 'pending',
  cost_eur REAL DEFAULT 0,
  error_message TEXT,
  metadata_json TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notification_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  channel TEXT NOT NULL,
  subject TEXT,
  body TEXT NOT NULL,
  variables_json TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notification_events (
  id TEXT PRIMARY KEY,
  campaign_id TEXT,
  delivery_id TEXT,
  event_type TEXT NOT NULL,
  message TEXT,
  metadata_json TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notification_campaigns_status_scheduled
  ON notification_campaigns(status, scheduled_at);

CREATE INDEX IF NOT EXISTS idx_notification_deliveries_campaign_status
  ON notification_deliveries(campaign_id, status);

CREATE INDEX IF NOT EXISTS idx_notification_deliveries_workspace_channel_created
  ON notification_deliveries(workspace_id, channel, created_at);
