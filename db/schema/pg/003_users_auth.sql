CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL DEFAULT '',
  last_name TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  avatar_url TEXT,
  email CITEXT,
  password_hash TEXT,
  username TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  status TEXT NOT NULL DEFAULT 'active',
  course_start TEXT,
  course_end TEXT,
  course_level TEXT,
  native_language TEXT NOT NULL DEFAULT 'en',
  native_language_confirmed BOOLEAN NOT NULL DEFAULT false,
  culture_read_lang TEXT NOT NULL DEFAULT '',
  culture_write_lang TEXT NOT NULL DEFAULT '',
  gender TEXT NOT NULL DEFAULT '',
  date_of_birth TEXT,
  phone_country TEXT NOT NULL DEFAULT '',
  phone_number TEXT NOT NULL DEFAULT '',
  teaching_languages TEXT NOT NULL DEFAULT '',
  employment_type TEXT NOT NULL DEFAULT '',
  available_days TEXT NOT NULL DEFAULT '',
  emergency_contact_name TEXT NOT NULL DEFAULT '',
  emergency_contact_phone TEXT NOT NULL DEFAULT '',
  emergency_contact_relation TEXT NOT NULL DEFAULT '',
  learning_goal TEXT NOT NULL DEFAULT '',
  salutation TEXT NOT NULL DEFAULT '',
  must_change_password BOOLEAN NOT NULL DEFAULT false,
  password_changed_at TEXT,
  temp_login_started_at BIGINT,
  phone TEXT NOT NULL DEFAULT '',
  phone_verified BOOLEAN NOT NULL DEFAULT false,
  mfa_enabled BOOLEAN NOT NULL DEFAULT false,
  mfa_secret TEXT NOT NULL DEFAULT '',
  mfa_setup_at TEXT,
  mfa_last_verified_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
  UNIQUE (workspace_id, username)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_workspace_email
  ON users(workspace_id, lower(email::text))
  WHERE email IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_workspace
  ON users(workspace_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_workspace_members_user'
  ) THEN
    ALTER TABLE workspace_members
      ADD CONSTRAINT fk_workspace_members_user
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  issued_at BIGINT NOT NULL,
  created_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL,
  revoked_at BIGINT,
  replaced_by TEXT,
  ip TEXT,
  user_agent TEXT
);

CREATE TABLE IF NOT EXISTS revoked_access_tokens (
  jti TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  revoked_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS password_history (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  password_hash TEXT NOT NULL,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS password_resets (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
  created_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL,
  used BOOLEAN NOT NULL DEFAULT false,
  used_at TEXT
);

CREATE TABLE IF NOT EXISTS login_attempts (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  identifier TEXT,
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
  success BOOLEAN NOT NULL DEFAULT false,
  ip TEXT,
  user_agent TEXT,
  created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_created
  ON login_attempts(created_at DESC);

CREATE TABLE IF NOT EXISTS security_events (
  id TEXT PRIMARY KEY,
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  target_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info',
  ip TEXT,
  user_agent TEXT,
  created_at BIGINT NOT NULL,
  payload TEXT
);

CREATE TABLE IF NOT EXISTS registration_sessions (
  session_id TEXT PRIMARY KEY,
  step TEXT NOT NULL,
  payload TEXT DEFAULT '{}',
  created_at BIGINT NOT NULL,
  last_updated BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS register_otps (
  email TEXT PRIMARY KEY,
  otp_hash TEXT NOT NULL,
  expires_at BIGINT NOT NULL,
  created_at BIGINT NOT NULL
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS culture_read_lang TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS culture_write_lang TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS date_of_birth TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_country TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_number TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS teaching_languages TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS employment_type TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS available_days TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS emergency_contact_name TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS emergency_contact_phone TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS emergency_contact_relation TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS learning_goal TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS salutation TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS temp_login_started_at BIGINT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_secret TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_setup_at TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_last_verified_at TEXT;

ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS issued_at BIGINT;
ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS replaced_by TEXT;
ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS ip TEXT;
ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS user_agent TEXT;
UPDATE refresh_tokens
SET issued_at = COALESCE(issued_at, created_at)
WHERE issued_at IS NULL;
ALTER TABLE refresh_tokens ALTER COLUMN issued_at SET NOT NULL;

ALTER TABLE login_attempts ADD COLUMN IF NOT EXISTS identifier TEXT;
ALTER TABLE login_attempts ADD COLUMN IF NOT EXISTS workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL;
ALTER TABLE login_attempts ADD COLUMN IF NOT EXISTS user_agent TEXT;

ALTER TABLE security_events ADD COLUMN IF NOT EXISTS workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL;
ALTER TABLE security_events ADD COLUMN IF NOT EXISTS type TEXT;
ALTER TABLE security_events ADD COLUMN IF NOT EXISTS severity TEXT NOT NULL DEFAULT 'info';
ALTER TABLE security_events ADD COLUMN IF NOT EXISTS user_agent TEXT;
ALTER TABLE security_events ADD COLUMN IF NOT EXISTS payload TEXT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'security_events' AND column_name = 'event_type'
  ) THEN
    EXECUTE 'UPDATE security_events SET type = event_type WHERE type IS NULL AND event_type IS NOT NULL';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'revoked_access_tokens' AND column_name = 'id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'revoked_access_tokens' AND column_name = 'jti'
  ) THEN
    ALTER TABLE revoked_access_tokens RENAME TO revoked_access_tokens_legacy;
    CREATE TABLE revoked_access_tokens (
      jti TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      revoked_at BIGINT NOT NULL,
      expires_at BIGINT NOT NULL
    );
    EXECUTE '
      INSERT INTO revoked_access_tokens (jti, user_id, revoked_at, expires_at)
      SELECT id, user_id, COALESCE(created_at, (EXTRACT(EPOCH FROM NOW()) * 1000)::bigint), expires_at
      FROM revoked_access_tokens_legacy
    ';
    DROP TABLE revoked_access_tokens_legacy;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'password_resets' AND column_name = 'id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'password_resets' AND column_name = 'token'
  ) THEN
    ALTER TABLE password_resets RENAME TO password_resets_legacy;
    CREATE TABLE password_resets (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
      created_at BIGINT NOT NULL,
      expires_at BIGINT NOT NULL,
      used BOOLEAN NOT NULL DEFAULT false,
      used_at TEXT
    );
    EXECUTE '
      INSERT INTO password_resets (token, user_id, workspace_id, created_at, expires_at, used, used_at)
      SELECT id, user_id, NULL, created_at, expires_at, (used_at IS NOT NULL), used_at::text
      FROM password_resets_legacy
    ';
    DROP TABLE password_resets_legacy;
  END IF;
END $$;
