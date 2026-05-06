CREATE TABLE IF NOT EXISTS notification_automation_rules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  trigger_key TEXT NOT NULL,
  channels_json TEXT NOT NULL,
  target_config_json TEXT,
  template_id TEXT,
  enabled INTEGER DEFAULT 1,
  cooldown_minutes INTEGER DEFAULT 1440,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notification_automation_runs (
  id TEXT PRIMARY KEY,
  rule_id TEXT NOT NULL,
  status TEXT,
  result_json TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notification_automation_rules_trigger
  ON notification_automation_rules(trigger_key, enabled);

CREATE INDEX IF NOT EXISTS idx_notification_automation_runs_rule_created
  ON notification_automation_runs(rule_id, created_at);
