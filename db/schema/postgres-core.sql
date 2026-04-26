CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  logo_url TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  school_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL DEFAULT '',
  last_name TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  avatar_url TEXT,
  email CITEXT,
  password_hash TEXT,
  role TEXT NOT NULL DEFAULT 'member',
  status TEXT NOT NULL DEFAULT 'active',
  course_start DATE,
  course_end DATE,
  course_level TEXT,
  salutation TEXT NOT NULL DEFAULT '',
  gender TEXT NOT NULL DEFAULT '',
  date_of_birth DATE,
  phone TEXT NOT NULL DEFAULT '',
  phone_verified BOOLEAN NOT NULL DEFAULT false,
  must_change_password BOOLEAN NOT NULL DEFAULT false,
  phone_country TEXT NOT NULL DEFAULT '',
  phone_number TEXT NOT NULL DEFAULT '',
  username TEXT NOT NULL,
  native_language TEXT NOT NULL DEFAULT 'en',
  native_language_confirmed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (workspace_id, username)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_workspace_email
  ON users(workspace_id, lower(email::text))
  WHERE email IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_workspace
  ON users(workspace_id);

CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (workspace_id, user_id)
);

CREATE TABLE IF NOT EXISTS channels (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  topic TEXT,
  category TEXT NOT NULL DEFAULT 'general',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_channels_workspace
  ON channels(workspace_id);

CREATE TABLE IF NOT EXISTS channel_members (
  channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (channel_id, user_id)
);

CREATE TABLE IF NOT EXISTS files_registry (
  file_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  channel_id TEXT REFERENCES channels(id) ON DELETE SET NULL,
  message_id TEXT NOT NULL,
  uploader_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  purpose TEXT NOT NULL DEFAULT 'media',
  file_name TEXT NOT NULL,
  mime TEXT NOT NULL DEFAULT 'application/octet-stream',
  size_bytes INTEGER NOT NULL DEFAULT 0,
  url TEXT NOT NULL,
  storage_key TEXT NOT NULL DEFAULT '',
  checksum TEXT NOT NULL DEFAULT '',
  storage_provider TEXT NOT NULL DEFAULT 'local_disk',
  storage_mode TEXT NOT NULL DEFAULT 'plain',
  encryption_key_id TEXT NOT NULL DEFAULT '',
  encryption_iv TEXT NOT NULL DEFAULT '',
  encryption_tag TEXT NOT NULL DEFAULT '',
  permissions TEXT NOT NULL DEFAULT 'workspace_private',
  pinned INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1)),
  deleted INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1)),
  replaced_from TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_files_registry_ws
  ON files_registry(workspace_id);

CREATE INDEX IF NOT EXISTS idx_files_registry_ws_channel
  ON files_registry(workspace_id, channel_id);

CREATE INDEX IF NOT EXISTS idx_files_registry_ws_purpose
  ON files_registry(workspace_id, purpose);

CREATE INDEX IF NOT EXISTS idx_files_registry_ws_pinned
  ON files_registry(workspace_id, pinned);
CREATE INDEX IF NOT EXISTS idx_files_registry_ws_checksum
  ON files_registry(workspace_id, checksum);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'doing', 'done')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  due_at BIGINT,
  completed_at BIGINT,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  assigned_to TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tasks_workspace_channel
  ON tasks(workspace_id, channel_id);

CREATE INDEX IF NOT EXISTS idx_tasks_status
  ON tasks(workspace_id, channel_id, status);

CREATE INDEX IF NOT EXISTS idx_tasks_due
  ON tasks(workspace_id, channel_id, due_at);

CREATE TABLE IF NOT EXISTS task_comments (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  body TEXT NOT NULL,
  created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_task_comments_task
  ON task_comments(task_id, created_at);

CREATE TABLE IF NOT EXISTS task_reactions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('task', 'comment')),
  target_id TEXT NOT NULL,
  emoji TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at BIGINT NOT NULL,
  UNIQUE (target_type, target_id, emoji, user_id)
);

CREATE INDEX IF NOT EXISTS idx_task_reactions_target
  ON task_reactions(target_type, target_id);

CREATE TABLE IF NOT EXISTS homework_items (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  class_channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  resource_url TEXT,
  due_date TEXT,
  is_archived INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0, 1)),
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  is_locked INTEGER NOT NULL DEFAULT 0 CHECK (is_locked IN (0, 1))
);

CREATE INDEX IF NOT EXISTS idx_homework_items_ws_class
  ON homework_items(workspace_id, class_channel_id);

CREATE INDEX IF NOT EXISTS idx_homework_items_created
  ON homework_items(created_at);

CREATE TABLE IF NOT EXISTS homework_completions (
  homework_id TEXT NOT NULL REFERENCES homework_items(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  completed_at TEXT NOT NULL,
  PRIMARY KEY (homework_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_homework_completions_student
  ON homework_completions(student_id);

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
  file_role TEXT NOT NULL DEFAULT 'task' CHECK (file_role IN ('task', 'solution')),
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_homework_item_files_item
  ON homework_item_files(item_id, created_at);

CREATE TABLE IF NOT EXISTS homework_submissions (
  id TEXT PRIMARY KEY,
  homework_item_id TEXT NOT NULL REFERENCES homework_items(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'draft',
  submission_text TEXT NOT NULL DEFAULT '',
  is_late INTEGER NOT NULL DEFAULT 0 CHECK (is_late IN (0, 1)),
  submitted_at TEXT,
  reviewed_at TEXT,
  reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  returned_at TEXT,
  feedback_text TEXT NOT NULL DEFAULT '',
  grade_value TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_homework_submissions_item_student
  ON homework_submissions(homework_item_id, student_id);

CREATE INDEX IF NOT EXISTS idx_homework_submissions_student
  ON homework_submissions(student_id, updated_at);

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

CREATE INDEX IF NOT EXISTS idx_homework_submission_files_submission
  ON homework_submission_files(submission_id, created_at);

CREATE TABLE IF NOT EXISTS homework_submission_comments (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL REFERENCES homework_submissions(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  comment_text TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS policy_acceptances (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  version TEXT NOT NULL,
  policy_type TEXT NOT NULL DEFAULT 'workspace_entry',
  accepted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
  UNIQUE (user_id, workspace_id, version)
);

CREATE INDEX IF NOT EXISTS idx_policy_acceptances_user
  ON policy_acceptances(user_id);

CREATE INDEX IF NOT EXISTS idx_policy_acceptances_workspace_user
  ON policy_acceptances(workspace_id, user_id);

CREATE INDEX IF NOT EXISTS idx_homework_submission_comments_submission
  ON homework_submission_comments(submission_id, created_at);

CREATE TABLE IF NOT EXISTS attendance_sessions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  session_date TEXT NOT NULL,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'),
  UNIQUE (channel_id, session_date)
);

CREATE TABLE IF NOT EXISTS attendance_records (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL REFERENCES attendance_sessions(id) ON DELETE CASCADE,
  channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  student_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('present', 'absent')),
  marked_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  marked_at TEXT NOT NULL DEFAULT to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'),
  UNIQUE (session_id, student_user_id)
);

CREATE INDEX IF NOT EXISTS idx_att_records_session
  ON attendance_records(session_id);

CREATE INDEX IF NOT EXISTS idx_att_records_student
  ON attendance_records(student_user_id);

CREATE TABLE IF NOT EXISTS attendance_notifications (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL REFERENCES attendance_sessions(id) ON DELETE CASCADE,
  channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  student_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  sent_at TEXT NOT NULL DEFAULT to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'),
  UNIQUE (session_id, student_user_id, type)
);

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
  recording_consent INTEGER NOT NULL DEFAULT 0,
  consented_at TEXT,
  updated_at TEXT NOT NULL DEFAULT to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'),
  PRIMARY KEY (live_session_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_live_session_participants_workspace
  ON live_session_participants(workspace_id, live_session_id, status);

CREATE INDEX IF NOT EXISTS idx_live_session_participants_user
  ON live_session_participants(user_id, live_session_id);

CREATE TABLE IF NOT EXISTS live_session_recording (
  session_id TEXT PRIMARY KEY REFERENCES live_sessions(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  recording_enabled INTEGER NOT NULL DEFAULT 0,
  recording_started_at TEXT,
  recording_started_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  consent_required INTEGER NOT NULL DEFAULT 1,
  student_playback_allowed INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')
);

CREATE INDEX IF NOT EXISTS idx_live_session_recording_workspace
  ON live_session_recording(workspace_id, recording_enabled);

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

CREATE TABLE IF NOT EXISTS live_session_polls (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  type TEXT NOT NULL DEFAULT 'poll',
  question TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  allow_multiple INTEGER NOT NULL DEFAULT 0,
  anonymous_results INTEGER NOT NULL DEFAULT 0,
  correct_option_id TEXT,
  created_at TEXT NOT NULL DEFAULT to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'),
  opened_at TEXT,
  closed_at TEXT
);

CREATE TABLE IF NOT EXISTS live_session_poll_options (
  id TEXT PRIMARY KEY,
  poll_id TEXT NOT NULL REFERENCES live_session_polls(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS live_session_poll_responses (
  id TEXT PRIMARY KEY,
  poll_id TEXT NOT NULL REFERENCES live_session_polls(id) ON DELETE CASCADE,
  option_id TEXT NOT NULL REFERENCES live_session_poll_options(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  answered_at TEXT NOT NULL DEFAULT to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')
);

CREATE INDEX IF NOT EXISTS idx_live_session_polls_workspace
  ON live_session_polls(workspace_id, session_id, status, created_at);

CREATE INDEX IF NOT EXISTS idx_live_session_poll_options_poll
  ON live_session_poll_options(poll_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_live_session_poll_responses_poll_user
  ON live_session_poll_responses(poll_id, user_id, answered_at);

CREATE TABLE IF NOT EXISTS workspace_billing (
  workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  plan TEXT NOT NULL DEFAULT 'free',
  status TEXT NOT NULL DEFAULT 'active',
  currency TEXT NOT NULL DEFAULT 'EUR',
  monthly_price_cents INTEGER NOT NULL DEFAULT 0,
  billing_email CITEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  student_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  currency TEXT NOT NULL DEFAULT 'EUR',
  description TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'paid', 'void')),
  due_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  paid_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_invoices_workspace_student
  ON invoices(workspace_id, student_user_id);

CREATE INDEX IF NOT EXISTS idx_invoices_workspace_status_due
  ON invoices(workspace_id, status, due_date);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  student_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  currency TEXT NOT NULL DEFAULT 'EUR',
  provider TEXT NOT NULL DEFAULT 'manual' CHECK (provider IN ('manual', 'stripe', 'paypal')),
  provider_ref TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_payments_workspace_student
  ON payments(workspace_id, student_user_id);

CREATE INDEX IF NOT EXISTS idx_payments_invoice
  ON payments(invoice_id);
