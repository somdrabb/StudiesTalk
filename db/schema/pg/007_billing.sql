CREATE TABLE IF NOT EXISTS workspace_billing (
  workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  plan TEXT NOT NULL DEFAULT 'free',
  status TEXT NOT NULL DEFAULT 'active',
  currency TEXT NOT NULL DEFAULT 'EUR',
  monthly_price_cents INTEGER NOT NULL DEFAULT 0,
  billing_email CITEXT,
  invoice_contact_name TEXT,
  legal_company_name TEXT,
  billing_contact_name TEXT,
  billing_address_line1 TEXT,
  billing_address_line2 TEXT,
  billing_city TEXT,
  billing_postal_code TEXT,
  billing_country TEXT,
  vat_id TEXT,
  tax_number TEXT,
  invoice_language TEXT DEFAULT 'en',
  invoice_currency TEXT DEFAULT 'EUR',
  reverse_charge_applicable INTEGER DEFAULT 0,
  readiness_acknowledged_at TIMESTAMPTZ,
  readiness_acknowledged_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  provider TEXT NOT NULL DEFAULT 'stripe',
  provider_customer_id TEXT,
  provider_subscription_id TEXT,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  stripe_price_id TEXT,
  stripe_subscription_status TEXT,
  current_period_end TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE workspace_billing ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'stripe';
ALTER TABLE workspace_billing ADD COLUMN IF NOT EXISTS provider_customer_id TEXT;
ALTER TABLE workspace_billing ADD COLUMN IF NOT EXISTS provider_subscription_id TEXT;
ALTER TABLE workspace_billing ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
ALTER TABLE workspace_billing ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;
ALTER TABLE workspace_billing ADD COLUMN IF NOT EXISTS stripe_price_id TEXT;
ALTER TABLE workspace_billing ADD COLUMN IF NOT EXISTS stripe_subscription_status TEXT;
ALTER TABLE workspace_billing ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ;
ALTER TABLE workspace_billing ADD COLUMN IF NOT EXISTS legal_company_name TEXT;
ALTER TABLE workspace_billing ADD COLUMN IF NOT EXISTS billing_contact_name TEXT;
ALTER TABLE workspace_billing ADD COLUMN IF NOT EXISTS billing_address_line1 TEXT;
ALTER TABLE workspace_billing ADD COLUMN IF NOT EXISTS billing_address_line2 TEXT;
ALTER TABLE workspace_billing ADD COLUMN IF NOT EXISTS billing_city TEXT;
ALTER TABLE workspace_billing ADD COLUMN IF NOT EXISTS billing_postal_code TEXT;
ALTER TABLE workspace_billing ADD COLUMN IF NOT EXISTS billing_country TEXT;
ALTER TABLE workspace_billing ADD COLUMN IF NOT EXISTS vat_id TEXT;
ALTER TABLE workspace_billing ADD COLUMN IF NOT EXISTS tax_number TEXT;
ALTER TABLE workspace_billing ADD COLUMN IF NOT EXISTS invoice_language TEXT DEFAULT 'en';
ALTER TABLE workspace_billing ADD COLUMN IF NOT EXISTS invoice_currency TEXT DEFAULT 'EUR';
ALTER TABLE workspace_billing ADD COLUMN IF NOT EXISTS reverse_charge_applicable INTEGER DEFAULT 0;

CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  student_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  currency TEXT NOT NULL DEFAULT 'EUR',
  description TEXT,
  provider TEXT NOT NULL DEFAULT 'manual',
  provider_invoice_id TEXT,
  seller_company_name TEXT,
  seller_address TEXT,
  seller_vat_id TEXT,
  seller_tax_number TEXT,
  buyer_company_name TEXT,
  buyer_billing_address TEXT,
  buyer_vat_id TEXT,
  invoice_number TEXT,
  invoice_date DATE,
  net_amount INTEGER,
  vat_rate NUMERIC,
  vat_amount INTEGER,
  gross_amount INTEGER,
  reverse_charge_note TEXT,
  payment_provider TEXT,
  legal_footer TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'paid', 'void')),
  due_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  paid_at TIMESTAMPTZ
);

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS provider_invoice_id TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS seller_company_name TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS seller_address TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS seller_vat_id TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS seller_tax_number TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS buyer_company_name TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS buyer_billing_address TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS buyer_vat_id TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS invoice_number TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS invoice_date DATE;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS net_amount INTEGER;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS vat_rate NUMERIC;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS vat_amount INTEGER;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS gross_amount INTEGER;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS reverse_charge_note TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_provider TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS legal_footer TEXT;

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
  provider TEXT NOT NULL DEFAULT 'manual',
  provider_ref TEXT,
  provider_payment_intent_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE payments ADD COLUMN IF NOT EXISTS provider_payment_intent_id TEXT;

CREATE INDEX IF NOT EXISTS idx_payments_workspace_student
  ON payments(workspace_id, student_user_id);

CREATE INDEX IF NOT EXISTS idx_payments_invoice
  ON payments(invoice_id);

CREATE TABLE IF NOT EXISTS billing_provider_events (
  id TEXT PRIMARY KEY,
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
  provider TEXT NOT NULL DEFAULT 'stripe',
  event_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'received',
  provider_ref TEXT,
  metadata_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_billing_provider_events_workspace
  ON billing_provider_events(workspace_id, provider, created_at);
