CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  workspace_id TEXT,
  actor TEXT,
  action TEXT NOT NULL,
  target TEXT,
  payload_json TEXT,
  created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_log_workspace_created
  ON audit_log(workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  at BIGINT NOT NULL,
  user_id TEXT,
  role TEXT,
  workspace_id TEXT,
  action TEXT NOT NULL,
  target TEXT,
  meta_json TEXT,
  ip TEXT,
  user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_at
  ON audit_logs(at);

CREATE INDEX IF NOT EXISTS idx_audit_workspace
  ON audit_logs(workspace_id);
