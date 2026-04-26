CREATE TABLE IF NOT EXISTS live_breakout_rooms (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  opened_at TEXT,
  closed_at TEXT,
  created_at TEXT NOT NULL DEFAULT to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')
);

CREATE TABLE IF NOT EXISTS live_breakout_room_members (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL REFERENCES live_breakout_rooms(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT '',
  assigned_at TEXT NOT NULL DEFAULT to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'),
  joined_at TEXT,
  left_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_live_breakout_room_members_unique
  ON live_breakout_room_members(room_id, user_id);

CREATE INDEX IF NOT EXISTS idx_live_breakout_rooms_workspace
  ON live_breakout_rooms(workspace_id, session_id, status, created_at);

CREATE INDEX IF NOT EXISTS idx_live_breakout_room_members_room
  ON live_breakout_room_members(room_id, user_id, assigned_at);

CREATE INDEX IF NOT EXISTS idx_live_breakout_room_members_user
  ON live_breakout_room_members(user_id, room_id);
