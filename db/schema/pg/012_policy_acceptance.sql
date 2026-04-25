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

INSERT INTO platform_settings (key, value, updated_at)
VALUES ('workspace_policy_version_default', '2026-04-23', CURRENT_TIMESTAMP::text)
ON CONFLICT (key) DO NOTHING;
