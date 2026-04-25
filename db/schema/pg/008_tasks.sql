CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  priority TEXT NOT NULL DEFAULT 'normal',
  due_at BIGINT,
  completed_at BIGINT,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  assigned_to TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tasks_workspace_channel
  ON tasks(workspace_id, channel_id);

CREATE TABLE IF NOT EXISTS task_comments (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  body TEXT NOT NULL,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS task_reactions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  emoji TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at BIGINT NOT NULL,
  UNIQUE (target_type, target_id, emoji, user_id)
);

CREATE TABLE IF NOT EXISTS homework_items (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  class_channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  resource_url TEXT,
  due_date TEXT,
  is_archived INTEGER NOT NULL DEFAULT 0,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
  is_locked INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS homework_completions (
  homework_id TEXT NOT NULL REFERENCES homework_items(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  completed_at TEXT NOT NULL,
  PRIMARY KEY (homework_id, student_id)
);

CREATE TABLE IF NOT EXISTS homework_item_files (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES homework_items(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  file_id TEXT NOT NULL REFERENCES files_registry(file_id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  mime TEXT NOT NULL DEFAULT 'application/octet-stream',
  size_bytes INTEGER NOT NULL DEFAULT 0,
  url TEXT NOT NULL,
  file_role TEXT NOT NULL DEFAULT 'task',
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS homework_submissions (
  id TEXT PRIMARY KEY,
  homework_item_id TEXT NOT NULL REFERENCES homework_items(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'draft',
  submission_text TEXT NOT NULL DEFAULT '',
  is_late INTEGER NOT NULL DEFAULT 0,
  submitted_at TEXT,
  reviewed_at TEXT,
  reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  returned_at TEXT,
  feedback_text TEXT NOT NULL DEFAULT '',
  grade_value TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_homework_submissions_item_student
  ON homework_submissions(homework_item_id, student_id);

CREATE TABLE IF NOT EXISTS homework_submission_files (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL REFERENCES homework_submissions(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  file_id TEXT NOT NULL REFERENCES files_registry(file_id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  mime TEXT NOT NULL DEFAULT 'application/octet-stream',
  size_bytes INTEGER NOT NULL DEFAULT 0,
  url TEXT NOT NULL,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS homework_submission_comments (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL REFERENCES homework_submissions(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  comment_text TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text
);

ALTER TABLE homework_items
  ALTER COLUMN updated_at SET DEFAULT CURRENT_TIMESTAMP::text;

ALTER TABLE homework_submissions
  ALTER COLUMN updated_at SET DEFAULT CURRENT_TIMESTAMP::text;

ALTER TABLE homework_submission_comments
  ALTER COLUMN updated_at SET DEFAULT CURRENT_TIMESTAMP::text;
