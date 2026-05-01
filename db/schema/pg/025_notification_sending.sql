CREATE TABLE IF NOT EXISTS platform_user_notifications (
  id TEXT PRIMARY KEY,
  workspace_id TEXT,
  user_id TEXT,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_platform_user_notifications_user_created
  ON platform_user_notifications(user_id, created_at);
