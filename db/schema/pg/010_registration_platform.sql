CREATE TABLE IF NOT EXISTS registration_links (
  token TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  channel_id TEXT REFERENCES channels(id) ON DELETE SET NULL,
  role TEXT NOT NULL,
  email TEXT NOT NULL,
  course_level TEXT,
  first_name TEXT,
  last_name TEXT,
  salutation TEXT DEFAULT '',
  date_of_birth TEXT,
  phone_country TEXT DEFAULT '',
  phone_number TEXT DEFAULT '',
  native_language TEXT DEFAULT '',
  learning_goal TEXT DEFAULT '',
  available_days TEXT DEFAULT '',
  emergency_contact_name TEXT DEFAULT '',
  emergency_contact_phone TEXT DEFAULT '',
  emergency_contact_relation TEXT DEFAULT '',
  course_start TEXT,
  course_end TEXT,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  expires_at BIGINT NOT NULL,
  used BOOLEAN NOT NULL DEFAULT false,
  used_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_registration_links_email
  ON registration_links(lower(email));

CREATE INDEX IF NOT EXISTS idx_registration_links_ws
  ON registration_links(workspace_id);

CREATE INDEX IF NOT EXISTS idx_registration_links_expires
  ON registration_links(expires_at);

CREATE TABLE IF NOT EXISTS platform_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text
);

ALTER TABLE registration_sessions
  ADD COLUMN IF NOT EXISTS email TEXT;

ALTER TABLE registration_sessions
  ADD COLUMN IF NOT EXISTS phone TEXT;

ALTER TABLE registration_sessions
  ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE registration_sessions
  ADD COLUMN IF NOT EXISTS mobile_verified BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE registration_sessions
  ADD COLUMN IF NOT EXISTS otp_sent_at BIGINT;

ALTER TABLE register_otps
  ADD COLUMN IF NOT EXISTS code TEXT;

UPDATE register_otps
SET code = COALESCE(code, otp_hash)
WHERE code IS NULL;

ALTER TABLE register_otps
  ALTER COLUMN code SET DEFAULT '';

ALTER TABLE register_otps
  ALTER COLUMN code SET NOT NULL;

ALTER TABLE register_otps
  ALTER COLUMN otp_hash DROP NOT NULL;

INSERT INTO platform_settings (key, value, updated_at)
VALUES ('ai_default_monthly_cap_eur', '5', CURRENT_TIMESTAMP::text)
ON CONFLICT (key) DO NOTHING;
