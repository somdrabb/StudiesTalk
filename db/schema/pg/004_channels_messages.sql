CREATE TABLE IF NOT EXISTS channels (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  topic TEXT NOT NULL DEFAULT '',
  members INTEGER NOT NULL DEFAULT 0,
  unread INTEGER NOT NULL DEFAULT 0,
  category TEXT NOT NULL DEFAULT 'classes',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text
);

CREATE INDEX IF NOT EXISTS idx_channels_workspace
  ON channels(workspace_id);

CREATE TABLE IF NOT EXISTS channel_members (
  channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
  PRIMARY KEY (channel_id, user_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  author TEXT NOT NULL,
  initials TEXT NOT NULL,
  avatar_url TEXT,
  time TEXT NOT NULL,
  text TEXT NOT NULL,
  alt INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
  original_language TEXT NOT NULL DEFAULT 'en',
  original_language_source TEXT
);

CREATE INDEX IF NOT EXISTS idx_messages_channel_created
  ON messages(channel_id, created_at, id);

CREATE TABLE IF NOT EXISTS replies (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  author TEXT NOT NULL,
  initials TEXT NOT NULL,
  avatar_url TEXT,
  time TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text
);

CREATE INDEX IF NOT EXISTS idx_replies_message_created
  ON replies(message_id, created_at, id);

CREATE TABLE IF NOT EXISTS message_reactions (
  id BIGINT,
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (message_id, emoji)
);

CREATE TABLE IF NOT EXISTS message_reaction_users (
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  user_id TEXT NOT NULL,
  PRIMARY KEY (message_id, emoji, user_id)
);

CREATE TABLE IF NOT EXISTS reply_reactions (
  reply_id TEXT NOT NULL REFERENCES replies(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (reply_id, emoji)
);

CREATE TABLE IF NOT EXISTS reply_reaction_users (
  reply_id TEXT NOT NULL REFERENCES replies(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  user_id TEXT NOT NULL,
  PRIMARY KEY (reply_id, emoji, user_id)
);

CREATE TABLE IF NOT EXISTS user_channel_prefs (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  culture_read_language TEXT DEFAULT 'en',
  culture_write_language TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
  PRIMARY KEY (user_id, channel_id)
);

CREATE TABLE IF NOT EXISTS files_registry (
  file_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  channel_id TEXT REFERENCES channels(id) ON DELETE SET NULL,
  message_id TEXT,
  uploader_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  purpose TEXT NOT NULL DEFAULT 'media',
  file_name TEXT NOT NULL,
  mime TEXT NOT NULL DEFAULT 'application/octet-stream',
  size_bytes INTEGER NOT NULL DEFAULT 0,
  url TEXT NOT NULL,
  pinned INTEGER NOT NULL DEFAULT 0,
  deleted INTEGER NOT NULL DEFAULT 0,
  replaced_from TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text
);

CREATE INDEX IF NOT EXISTS idx_files_registry_ws_channel
  ON files_registry(workspace_id, channel_id);

CREATE TABLE IF NOT EXISTS dms (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  initials TEXT,
  online INTEGER NOT NULL DEFAULT 0,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS dm_members (
  dm_id TEXT NOT NULL REFERENCES dms(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (dm_id, user_id)
);

CREATE TABLE IF NOT EXISTS dm_messages (
  id TEXT PRIMARY KEY,
  dm_id TEXT NOT NULL REFERENCES dms(id) ON DELETE CASCADE,
  author TEXT NOT NULL,
  initials TEXT NOT NULL,
  time TEXT NOT NULL,
  text TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dm_replies (
  id TEXT PRIMARY KEY,
  dm_message_id TEXT NOT NULL REFERENCES dm_messages(id) ON DELETE CASCADE,
  author TEXT NOT NULL,
  initials TEXT NOT NULL,
  avatar_url TEXT,
  time TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text
);

CREATE TABLE IF NOT EXISTS dm_message_reactions (
  message_id TEXT NOT NULL REFERENCES dm_messages(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (message_id, emoji)
);

CREATE TABLE IF NOT EXISTS dm_reply_reactions (
  reply_id TEXT NOT NULL REFERENCES dm_replies(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (reply_id, emoji)
);

CREATE TABLE IF NOT EXISTS dm_reply_reaction_users (
  reply_id TEXT NOT NULL REFERENCES dm_replies(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  user_id TEXT NOT NULL,
  PRIMARY KEY (reply_id, emoji, user_id)
);

CREATE TABLE IF NOT EXISTS message_translations (
  id TEXT,
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  target_language TEXT NOT NULL,
  viewer_user_id TEXT,
  provider TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  translated_text TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
  PRIMARY KEY (message_id, target_language, viewer_user_id)
);

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS original_language_source TEXT;

ALTER TABLE message_reactions
  ADD COLUMN IF NOT EXISTS id BIGINT;

DO $$
DECLARE
  legacy_has_id BOOLEAN := false;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'message_translations' AND column_name = 'viewer_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'message_translations' AND column_name = 'viewer_user_id'
  ) THEN
    ALTER TABLE message_translations RENAME TO message_translations_legacy;
    CREATE TABLE message_translations (
      id TEXT,
      message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      target_language TEXT NOT NULL,
      viewer_user_id TEXT,
      provider TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      translated_text TEXT,
      error_message TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
      PRIMARY KEY (message_id, target_language, viewer_user_id)
    );
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'message_translations_legacy' AND column_name = 'id'
    ) INTO legacy_has_id;
    IF legacy_has_id THEN
      EXECUTE $sql$
        INSERT INTO message_translations (id, message_id, target_language, viewer_user_id, provider, status, translated_text, error_message, created_at, updated_at)
        SELECT COALESCE(id, message_id || ':' || target_language || ':' || COALESCE(viewer_id, '')),
               message_id,
               target_language,
               viewer_id,
               provider,
               status,
               translated_text,
               error_message,
               created_at,
               updated_at
        FROM message_translations_legacy
      $sql$;
    ELSE
      EXECUTE $sql$
        INSERT INTO message_translations (id, message_id, target_language, viewer_user_id, provider, status, translated_text, error_message, created_at, updated_at)
        SELECT message_id || ':' || target_language || ':' || COALESCE(viewer_id, ''),
               message_id,
               target_language,
               viewer_id,
               provider,
               status,
               translated_text,
               error_message,
               created_at,
               updated_at
        FROM message_translations_legacy
      $sql$;
    END IF;
    DROP TABLE message_translations_legacy;
  END IF;
END $$;

ALTER TABLE message_translations
  ADD COLUMN IF NOT EXISTS id TEXT;
