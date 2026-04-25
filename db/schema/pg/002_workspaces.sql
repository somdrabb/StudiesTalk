CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  logo_url TEXT,
  status TEXT NOT NULL DEFAULT 'approved',
  school_code TEXT,
  admin_email TEXT,
  approved_at TEXT,
  approved_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text
);

CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
  PRIMARY KEY (workspace_id, user_id)
);

CREATE TABLE IF NOT EXISTS workspace_settings_admin (
  workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  settings_json TEXT NOT NULL DEFAULT '{}',
  updated_at BIGINT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS workspace_class_meta (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  channel_id TEXT NOT NULL,
  start_date TEXT,
  end_date TEXT,
  status TEXT NOT NULL DEFAULT 'private',
  capacity INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
  PRIMARY KEY (workspace_id, channel_id)
);

CREATE TABLE IF NOT EXISTS workspace_profile (
  workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  registration_details TEXT,
  school_name TEXT DEFAULT '',
  street TEXT DEFAULT '',
  house_number TEXT DEFAULT '',
  city TEXT DEFAULT '',
  postal_code TEXT DEFAULT '',
  state TEXT DEFAULT '',
  country TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  opening_hours_json TEXT DEFAULT '',
  website TEXT DEFAULT '',
  use_platform_contact_email INTEGER DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text
);

CREATE TABLE IF NOT EXISTS workspace_email_settings (
  workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  enabled INTEGER NOT NULL DEFAULT 0,
  brand_school_name TEXT DEFAULT '',
  reply_to_email TEXT DEFAULT '',
  subject_prefix TEXT DEFAULT '',
  footer_text TEXT DEFAULT '',
  logo_url TEXT DEFAULT '',
  signature_html TEXT DEFAULT '',
  manual_body_text TEXT DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text
);

CREATE TABLE IF NOT EXISTS workspace_onboarding (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL UNIQUE REFERENCES workspaces(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'not_started',
  current_step TEXT DEFAULT 'welcome',
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
  started_by_user_id TEXT,
  completed_by_user_id TEXT,
  CHECK (status IN ('not_started','in_progress','completed','skipped'))
);

CREATE TABLE IF NOT EXISTS workspace_onboarding_steps (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  step_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  completed_at TEXT,
  completed_by_user_id TEXT,
  meta_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
  UNIQUE (workspace_id, step_key),
  CHECK (status IN ('pending','in_progress','completed','skipped'))
);

CREATE INDEX IF NOT EXISTS idx_workspace_onboarding_steps_workspace
  ON workspace_onboarding_steps(workspace_id);

CREATE TABLE IF NOT EXISTS workspace_onboarding_events (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id TEXT,
  event_type TEXT NOT NULL,
  step_key TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text
);

CREATE INDEX IF NOT EXISTS idx_workspace_onboarding_events_workspace
  ON workspace_onboarding_events(workspace_id, created_at);

CREATE TABLE IF NOT EXISTS workspace_activation_metrics (
  workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  teachers_count INTEGER NOT NULL DEFAULT 0,
  students_count INTEGER NOT NULL DEFAULT 0,
  classes_count INTEGER NOT NULL DEFAULT 0,
  channels_count INTEGER NOT NULL DEFAULT 0,
  live_sessions_count INTEGER NOT NULL DEFAULT 0,
  homework_count INTEGER NOT NULL DEFAULT 0,
  announcements_count INTEGER NOT NULL DEFAULT 0,
  ai_enabled INTEGER NOT NULL DEFAULT 0,
  billing_ready INTEGER NOT NULL DEFAULT 0,
  activation_score INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text
);

CREATE TABLE IF NOT EXISTS school_requests (
  id TEXT PRIMARY KEY,
  school_name TEXT NOT NULL,
  admin_email TEXT NOT NULL,
  password_hash TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  reviewed_by TEXT,
  reviewed_at TEXT,
  reject_reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text
);

CREATE INDEX IF NOT EXISTS idx_school_requests_status
  ON school_requests(status);

ALTER TABLE workspace_profile
  ADD COLUMN IF NOT EXISTS opening_hours_json TEXT DEFAULT '';

ALTER TABLE workspace_profile
  ADD COLUMN IF NOT EXISTS use_platform_contact_email INTEGER DEFAULT 0;

ALTER TABLE school_requests
  ADD COLUMN IF NOT EXISTS reviewed_by TEXT;

ALTER TABLE school_requests
  ADD COLUMN IF NOT EXISTS reviewed_at TEXT;

ALTER TABLE school_requests
  ADD COLUMN IF NOT EXISTS reject_reason TEXT;

CREATE TABLE IF NOT EXISTS registration_review_requests (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at BIGINT NOT NULL,
  reviewed_by TEXT,
  reviewed_at BIGINT,
  review_note TEXT
);
