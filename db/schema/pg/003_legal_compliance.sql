CREATE TABLE IF NOT EXISTS platform_legal_settings (
  id TEXT PRIMARY KEY,
  company_name TEXT,
  operator_name TEXT,
  legal_address TEXT,
  legal_email TEXT,
  phone TEXT,
  vat_id TEXT,
  tax_number TEXT,
  business_registration TEXT,
  responsible_person TEXT,
  supervisory_authority TEXT,
  hosting_provider TEXT,
  video_provider TEXT,
  ai_provider TEXT,
  email_provider TEXT,
  sms_provider TEXT,
  storage_provider TEXT,
  analytics_provider TEXT,
  recording_retention_days INTEGER,
  security_log_retention_days INTEGER,
  backup_retention_days INTEGER,
  learning_data_retention_months INTEGER,
  support_email TEXT,
  privacy_email TEXT,
  terms_version TEXT,
  privacy_version TEXT,
  impressum_version TEXT,
  liability_text TEXT,
  sla_text TEXT,
  gdpr_dpa_text TEXT,
  ai_notice_text TEXT,
  recording_notice_text TEXT,
  cookie_notice_text TEXT,
  locale_default TEXT DEFAULT 'en',
  is_published INTEGER DEFAULT 0,
  published_at TEXT,
  updated_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text
);

CREATE TABLE IF NOT EXISTS platform_legal_versions (
  id TEXT PRIMARY KEY,
  legal_settings_id TEXT REFERENCES platform_legal_settings(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL CHECK (document_type IN ('privacy','terms','impressum','cookies','dpa','ai_notice','recording_notice','subprocessor_list')),
  version TEXT,
  locale TEXT DEFAULT 'en',
  title TEXT,
  body TEXT,
  status TEXT DEFAULT 'draft',
  is_active INTEGER DEFAULT 0,
  published_at TEXT,
  effective_from TEXT,
  created_by TEXT,
  updated_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text
);

ALTER TABLE platform_legal_versions ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'draft';
ALTER TABLE platform_legal_versions ADD COLUMN IF NOT EXISTS effective_from TEXT;
ALTER TABLE platform_legal_versions ADD COLUMN IF NOT EXISTS updated_by TEXT;

CREATE INDEX IF NOT EXISTS idx_platform_legal_versions_doc_locale
  ON platform_legal_versions(document_type, locale, is_active);

CREATE TABLE IF NOT EXISTS legal_acceptances (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  workspace_id TEXT,
  document_type TEXT,
  version TEXT,
  accepted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
  ip_address TEXT,
  user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_legal_acceptances_user_workspace
  ON legal_acceptances(user_id, workspace_id, document_type, version);

CREATE TABLE IF NOT EXISTS legal_subprocessors (
  id TEXT PRIMARY KEY,
  provider_name TEXT NOT NULL,
  service_type TEXT,
  data_location TEXT,
  purpose TEXT,
  legal_basis TEXT,
  dpa_available INTEGER DEFAULT 0,
  privacy_url TEXT,
  active INTEGER DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text
);

CREATE INDEX IF NOT EXISTS idx_legal_subprocessors_active
  ON legal_subprocessors(active, provider_name);
