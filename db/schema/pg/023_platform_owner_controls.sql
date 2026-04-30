CREATE TABLE IF NOT EXISTS platform_health_events (
  id TEXT PRIMARY KEY,
  provider_key TEXT,
  status TEXT,
  message TEXT,
  metadata_json TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS backup_runs (
  id TEXT PRIMARY KEY,
  type TEXT,
  status TEXT,
  file_path TEXT,
  file_size_bytes BIGINT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  error_message TEXT,
  metadata_json TEXT
);

CREATE TABLE IF NOT EXISTS workspace_lifecycle_events (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  action TEXT NOT NULL,
  actor_user_id TEXT,
  reason TEXT,
  metadata_json TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS owner_user_id TEXT;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS customer_type TEXT DEFAULT 'customer';

CREATE TABLE IF NOT EXISTS support_impersonation_sessions (
  id TEXT PRIMARY KEY,
  super_admin_id TEXT NOT NULL,
  target_user_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  read_only INTEGER DEFAULT 1,
  reason TEXT,
  started_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  ended_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  status TEXT DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS platform_incidents (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  status TEXT DEFAULT 'open',
  severity TEXT DEFAULT 'info',
  public_message TEXT,
  internal_note TEXT,
  affected_services_json TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS platform_maintenance (
  id TEXT PRIMARY KEY,
  enabled INTEGER DEFAULT 0,
  public_message TEXT,
  disabled_features_json TEXT,
  updated_by TEXT,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS data_governance_requests (
  id TEXT PRIMARY KEY,
  workspace_id TEXT,
  request_type TEXT,
  status TEXT DEFAULT 'pending',
  requested_by TEXT,
  approved_by TEXT,
  reason TEXT,
  metadata_json TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS platform_notifications (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  target_scope TEXT DEFAULT 'all',
  workspace_id TEXT,
  channel TEXT DEFAULT 'in_app',
  status TEXT DEFAULT 'draft',
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS subscription_events (
  id TEXT PRIMARY KEY,
  workspace_id TEXT,
  provider TEXT DEFAULT 'stripe',
  event_type TEXT,
  status TEXT,
  metadata_json TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS platform_branding (
  id TEXT PRIMARY KEY,
  settings_json TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS workspace_domains (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  domain TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  verification_token TEXT,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
