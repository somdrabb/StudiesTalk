CREATE TABLE IF NOT EXISTS live_sessions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL DEFAULT 'default' REFERENCES workspaces(id) ON DELETE CASCADE,
  channel_id TEXT REFERENCES channels(id) ON DELETE CASCADE,
  title TEXT DEFAULT 'Live Class',
  date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  meeting_url TEXT NOT NULL,
  meeting_pass TEXT,
  student_notes TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled',
  autopost_mode TEXT DEFAULT 'none',
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'),
  updated_at TEXT,
  audience TEXT,
  invited_user_ids TEXT DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_live_sessions_workspace
  ON live_sessions(workspace_id);

CREATE INDEX IF NOT EXISTS idx_live_sessions_channel
  ON live_sessions(channel_id);

CREATE TABLE IF NOT EXISTS live_attendance (
  session_id TEXT NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  joined_at TEXT,
  status TEXT DEFAULT 'unmarked',
  note TEXT,
  updated_at TEXT NOT NULL DEFAULT to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'),
  PRIMARY KEY (session_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_live_attendance_student
  ON live_attendance(student_id);

CREATE TABLE IF NOT EXISTS live_session_participants (
  live_session_id TEXT NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  requested_at TEXT,
  approved_at TEXT,
  denied_at TEXT,
  approved_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  denied_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  denial_reason TEXT,
  joined_at TEXT,
  left_at TEXT,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  hand_status TEXT NOT NULL DEFAULT 'lowered',
  hand_raised_at TEXT,
  hand_lowered_at TEXT,
  updated_at TEXT NOT NULL DEFAULT to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'),
  PRIMARY KEY (live_session_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_live_session_participants_workspace
  ON live_session_participants(workspace_id, live_session_id, status);

CREATE INDEX IF NOT EXISTS idx_live_session_participants_user
  ON live_session_participants(user_id, live_session_id);
