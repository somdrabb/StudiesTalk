ALTER TABLE platform_settings
  ADD COLUMN IF NOT EXISTS id TEXT;

ALTER TABLE platform_settings
  ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'global';

ALTER TABLE platform_settings
  ADD COLUMN IF NOT EXISTS workspace_id TEXT;

ALTER TABLE platform_settings
  ADD COLUMN IF NOT EXISTS settings_json TEXT NOT NULL DEFAULT '{}';

ALTER TABLE platform_settings
  ADD COLUMN IF NOT EXISTS created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text;

UPDATE platform_settings
SET
  id = COALESCE(NULLIF(id, ''), key),
  settings_json = CASE
    WHEN COALESCE(settings_json, '') = '' THEN value
    ELSE settings_json
  END,
  created_at = COALESCE(NULLIF(created_at, ''), updated_at, CURRENT_TIMESTAMP::text)
WHERE
  COALESCE(id, '') = ''
  OR COALESCE(settings_json, '') = ''
  OR COALESCE(created_at, '') = '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_settings_scope_workspace
  ON platform_settings(scope, workspace_id);
