CREATE TABLE IF NOT EXISTS workspace_onboarding (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL UNIQUE REFERENCES workspaces(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'not_started',
  current_step TEXT DEFAULT 'welcome',
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  started_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  completed_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  CHECK (status IN ('not_started', 'in_progress', 'completed', 'skipped'))
);

CREATE INDEX IF NOT EXISTS idx_workspace_onboarding_workspace
  ON workspace_onboarding(workspace_id);

CREATE TABLE IF NOT EXISTS workspace_onboarding_steps (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  step_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  completed_at TEXT,
  completed_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  meta_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (workspace_id, step_key),
  CHECK (status IN ('pending', 'in_progress', 'completed', 'skipped'))
);

CREATE INDEX IF NOT EXISTS idx_workspace_onboarding_steps_workspace
  ON workspace_onboarding_steps(workspace_id);

CREATE TABLE IF NOT EXISTS workspace_onboarding_events (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  step_key TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
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
  updated_at TEXT NOT NULL
);
