CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  recipient_user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  recipient_role TEXT CHECK (recipient_role IS NULL OR recipient_role IN ('student', 'teacher', 'admin', 'school_admin')),
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  type TEXT NOT NULL DEFAULT 'system' CHECK (type IN ('mention', 'homework', 'exam', 'class', 'teacher', 'system', 'attendance')),
  title TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  entity_type TEXT,
  entity_id TEXT,
  action_url TEXT,
  is_read BOOLEAN NOT NULL DEFAULT false,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high')),
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  read_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ,
  archived_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_notifications_workspace_visible
  ON notifications(workspace_id, recipient_user_id, recipient_role, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_workspace_type
  ON notifications(workspace_id, type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_workspace_unread
  ON notifications(workspace_id, is_read, created_at DESC);
