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
