CREATE TABLE IF NOT EXISTS attendance_sessions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  session_date TEXT NOT NULL,
  start_time TEXT,
  grace_period_minutes INTEGER NOT NULL DEFAULT 10,
  checkin_code_hash TEXT,
  checkin_code_expires_at TEXT,
  checkin_code_created_at TEXT,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
  UNIQUE (channel_id, session_date)
);

CREATE TABLE IF NOT EXISTS attendance_records (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL REFERENCES attendance_sessions(id) ON DELETE CASCADE,
  channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  student_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('present', 'late', 'absent', 'excused')),
  note TEXT NOT NULL DEFAULT '',
  checked_in_at TEXT,
  checkin_method TEXT NOT NULL DEFAULT 'manual',
  certificate_file_id TEXT REFERENCES files_registry(file_id) ON DELETE SET NULL,
  marked_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  marked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
  UNIQUE (session_id, student_user_id)
);

CREATE INDEX IF NOT EXISTS idx_att_records_session
  ON attendance_records(session_id);

CREATE INDEX IF NOT EXISTS idx_att_records_student
  ON attendance_records(student_user_id);

CREATE INDEX IF NOT EXISTS idx_att_records_certificate
  ON attendance_records(certificate_file_id);

CREATE TABLE IF NOT EXISTS attendance_notifications (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL REFERENCES attendance_sessions(id) ON DELETE CASCADE,
  channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  student_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  sent_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
  UNIQUE (session_id, student_user_id, type)
);
