ALTER TABLE live_session_recording
  ADD COLUMN IF NOT EXISTS student_playback_allowed INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS live_session_recordings (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
  storage_key TEXT NOT NULL,
  storage_provider TEXT NOT NULL DEFAULT 'local_disk',
  storage_mode TEXT NOT NULL DEFAULT 'plain',
  encryption_key_id TEXT DEFAULT '',
  encryption_iv TEXT DEFAULT '',
  encryption_tag TEXT DEFAULT '',
  checksum TEXT DEFAULT '',
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  size_bytes INTEGER NOT NULL DEFAULT 0,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'processing',
  started_at TEXT,
  stopped_at TEXT,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  retention_until TEXT,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_live_session_recordings_workspace
  ON live_session_recordings(workspace_id, session_id, status);

CREATE INDEX IF NOT EXISTS idx_live_session_recordings_retention
  ON live_session_recordings(retention_until, deleted_at);
