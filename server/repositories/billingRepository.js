'use strict';

const { normalizeEngine } = require('../../db/helpers');
const { generateInvoiceNumber } = require('../services/invoiceNumber.service');

function billingTimestamp(engine) {
  return engine === 'postgres' ? new Date().toISOString() : Date.now();
}

function toEpochMs(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return value;
  const ts = new Date(value).getTime();
  return Number.isNaN(ts) ? value : ts;
}

function toDateOnly(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const ts = new Date(value);
  if (Number.isNaN(ts.getTime())) return value;
  return ts.toISOString().slice(0, 10);
}

function parseJson(value, fallback = {}) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch (_err) {
    return fallback;
  }
}

function stringifyJson(value) {
  return JSON.stringify(value == null ? {} : value);
}

function moneyCents(value) {
  return Math.max(0, Math.floor(Number(value || 0)));
}

function normalizePostgresInvoice(row) {
  if (!row) return row;
  return {
    ...row,
    dueDate: toDateOnly(row.dueDate),
    createdAt: toEpochMs(row.createdAt),
    paidAt: toEpochMs(row.paidAt)
  };
}

function normalizePostgresPayment(row) {
  if (!row) return row;
  return {
    ...row,
    createdAt: toEpochMs(row.createdAt)
  };
}

function createBillingRepository({ engine = 'sqlite', sqliteDb } = {}) {
  const normalizedEngine = normalizeEngine(engine);

  if (normalizedEngine === 'postgres') {
    return createPostgresBillingRepository();
  }

  if (!sqliteDb) {
    throw new Error('sqliteDb is required for the SQLite billing repository');
  }

  return createSqliteBillingRepository(sqliteDb);
}

function createSqliteBillingRepository(sqliteDb) {
  const engine = 'sqlite';

  function execIgnore(sql) {
    try {
      sqliteDb.exec(sql);
    } catch (_err) {}
  }

  execIgnore('ALTER TABLE workspace_billing ADD COLUMN stripe_customer_id TEXT');
  execIgnore('ALTER TABLE workspace_billing ADD COLUMN stripe_subscription_id TEXT');
  execIgnore('ALTER TABLE workspace_billing ADD COLUMN stripe_price_id TEXT');
  execIgnore('ALTER TABLE workspace_billing ADD COLUMN stripe_subscription_status TEXT');
  execIgnore("ALTER TABLE workspace_billing ADD COLUMN provider TEXT DEFAULT 'stripe'");
  execIgnore('ALTER TABLE workspace_billing ADD COLUMN provider_customer_id TEXT');
  execIgnore('ALTER TABLE workspace_billing ADD COLUMN provider_subscription_id TEXT');
  execIgnore('ALTER TABLE workspace_billing ADD COLUMN current_period_end TEXT');
  execIgnore('ALTER TABLE workspace_billing ADD COLUMN legal_company_name TEXT');
  execIgnore('ALTER TABLE workspace_billing ADD COLUMN billing_contact_name TEXT');
  execIgnore('ALTER TABLE workspace_billing ADD COLUMN billing_address_line1 TEXT');
  execIgnore('ALTER TABLE workspace_billing ADD COLUMN billing_address_line2 TEXT');
  execIgnore('ALTER TABLE workspace_billing ADD COLUMN billing_city TEXT');
  execIgnore('ALTER TABLE workspace_billing ADD COLUMN billing_postal_code TEXT');
  execIgnore('ALTER TABLE workspace_billing ADD COLUMN billing_country TEXT');
  execIgnore('ALTER TABLE workspace_billing ADD COLUMN vat_id TEXT');
  execIgnore('ALTER TABLE workspace_billing ADD COLUMN tax_number TEXT');
  execIgnore("ALTER TABLE workspace_billing ADD COLUMN invoice_language TEXT DEFAULT 'en'");
  execIgnore("ALTER TABLE workspace_billing ADD COLUMN invoice_currency TEXT DEFAULT 'EUR'");
  execIgnore('ALTER TABLE workspace_billing ADD COLUMN reverse_charge_applicable INTEGER DEFAULT 0');
  execIgnore("ALTER TABLE invoices ADD COLUMN provider TEXT DEFAULT 'manual'");
  execIgnore('ALTER TABLE invoices ADD COLUMN provider_invoice_id TEXT');
  execIgnore('ALTER TABLE invoices ADD COLUMN seller_company_name TEXT');
  execIgnore('ALTER TABLE invoices ADD COLUMN seller_address TEXT');
  execIgnore('ALTER TABLE invoices ADD COLUMN seller_vat_id TEXT');
  execIgnore('ALTER TABLE invoices ADD COLUMN seller_tax_number TEXT');
  execIgnore('ALTER TABLE invoices ADD COLUMN buyer_company_name TEXT');
  execIgnore('ALTER TABLE invoices ADD COLUMN buyer_billing_address TEXT');
  execIgnore('ALTER TABLE invoices ADD COLUMN buyer_vat_id TEXT');
  execIgnore('ALTER TABLE invoices ADD COLUMN invoice_number TEXT');
  execIgnore('ALTER TABLE invoices ADD COLUMN invoice_date TEXT');
  execIgnore('ALTER TABLE invoices ADD COLUMN net_amount INTEGER');
  execIgnore('ALTER TABLE invoices ADD COLUMN vat_rate REAL DEFAULT 0');
  execIgnore('ALTER TABLE invoices ADD COLUMN vat_amount INTEGER DEFAULT 0');
  execIgnore('ALTER TABLE invoices ADD COLUMN gross_amount INTEGER');
  execIgnore('ALTER TABLE invoices ADD COLUMN reverse_charge_note TEXT');
  execIgnore('ALTER TABLE invoices ADD COLUMN payment_provider TEXT');
  execIgnore('ALTER TABLE invoices ADD COLUMN legal_footer TEXT');
  execIgnore('ALTER TABLE payments ADD COLUMN provider_payment_intent_id TEXT');
  execIgnore(`
    CREATE TABLE IF NOT EXISTS billing_provider_events (
      id TEXT PRIMARY KEY,
      workspace_id TEXT,
      provider TEXT NOT NULL DEFAULT 'stripe',
      event_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'received',
      provider_ref TEXT,
      metadata_json TEXT,
      created_at INTEGER NOT NULL
    )
  `);

  function normalizeBillingProfileRow(row) {
    if (!row) return null;
    return {
      workspaceId: row.workspaceId || row.workspace_id || '',
      plan: row.plan || 'free',
      status: row.status || 'active',
      currency: row.currency || 'EUR',
      monthlyPriceCents: Number(row.monthlyPriceCents ?? row.monthly_price_cents ?? 0),
      billingEmail: row.billingEmail ?? row.billing_email ?? null,
      invoiceContactName: row.invoiceContactName ?? row.invoice_contact_name ?? null,
      readinessAcknowledgedAt: row.readinessAcknowledgedAt ?? row.readiness_acknowledged_at ?? null,
      readinessAcknowledgedByUserId: row.readinessAcknowledgedByUserId ?? row.readiness_acknowledged_by_user_id ?? null,
      provider: row.provider || 'stripe',
      providerCustomerId: row.providerCustomerId ?? row.provider_customer_id ?? null,
      providerSubscriptionId: row.providerSubscriptionId ?? row.provider_subscription_id ?? null,
      stripeCustomerId: row.stripeCustomerId ?? row.stripe_customer_id ?? row.providerCustomerId ?? row.provider_customer_id ?? null,
      stripeSubscriptionId: row.stripeSubscriptionId ?? row.stripe_subscription_id ?? row.providerSubscriptionId ?? row.provider_subscription_id ?? null,
      stripePriceId: row.stripePriceId ?? row.stripe_price_id ?? null,
      stripeSubscriptionStatus: row.stripeSubscriptionStatus ?? row.stripe_subscription_status ?? null,
      currentPeriodEnd: row.currentPeriodEnd ?? row.current_period_end ?? null,
      legalCompanyName: row.legalCompanyName ?? row.legal_company_name ?? null,
      billingContactName: row.billingContactName ?? row.billing_contact_name ?? row.invoiceContactName ?? row.invoice_contact_name ?? null,
      billingAddressLine1: row.billingAddressLine1 ?? row.billing_address_line1 ?? null,
      billingAddressLine2: row.billingAddressLine2 ?? row.billing_address_line2 ?? null,
      billingCity: row.billingCity ?? row.billing_city ?? null,
      billingPostalCode: row.billingPostalCode ?? row.billing_postal_code ?? null,
      billingCountry: row.billingCountry ?? row.billing_country ?? null,
      vatId: row.vatId ?? row.vat_id ?? null,
      taxNumber: row.taxNumber ?? row.tax_number ?? null,
      invoiceLanguage: row.invoiceLanguage ?? row.invoice_language ?? 'en',
      invoiceCurrency: row.invoiceCurrency ?? row.invoice_currency ?? row.currency ?? 'EUR',
      reverseChargeApplicable: Boolean(Number(row.reverseChargeApplicable ?? row.reverse_charge_applicable ?? 0)),
      updatedAt: row.updatedAt ?? row.updated_at ?? null
    };
  }

  return {
    engine,

    async getBillingSummary(workspaceId = 'all') {
      const ws = String(workspaceId || 'all');
      const params = ws === 'all' ? [] : [ws];
      const where = ws === 'all' ? '' : 'WHERE workspace_id = ?';
      const andWhere = ws === 'all' ? '' : 'AND workspace_id = ?';

      const activeSubscriptions = sqliteDb.prepare(`
        SELECT COUNT(*) AS c
        FROM workspace_billing
        WHERE status = 'active' AND plan <> 'free'
        ${andWhere}
      `).get(...params).c || 0;

      const openInvoices = sqliteDb.prepare(`
        SELECT COUNT(*) AS c
        FROM invoices
        ${where}
        ${ws === 'all' ? 'WHERE' : 'AND'} status = 'open'
      `).get(...params).c || 0;

      const payments = sqliteDb.prepare(`
        SELECT
          COUNT(*) AS paymentsCount,
          COALESCE(SUM(amount_cents), 0) AS collectedAmountCents
        FROM payments
        ${where}
      `).get(...params);

      return {
        activeSubscriptions,
        openInvoices,
        paymentsCount: Number(payments?.paymentsCount || 0),
        collectedAmountCents: Number(payments?.collectedAmountCents || 0)
      };
    },

    async getOverviewStats() {
      return this.getBillingSummary('all');
    },

    async ensureWorkspaceBilling({ workspaceId, billingEmail = null }) {
      sqliteDb.prepare(`
        INSERT INTO workspace_billing (
          workspace_id, plan, status, currency, monthly_price_cents,
          billing_email, invoice_contact_name, readiness_acknowledged_at,
          readiness_acknowledged_by_user_id, updated_at
        )
        VALUES (?, 'free', 'active', 'EUR', 0, ?, NULL, NULL, NULL, ?)
        ON CONFLICT(workspace_id) DO NOTHING
      `).run(workspaceId, billingEmail || null, billingTimestamp(engine));
    },

    async getWorkspaceBillingProfile(workspaceId) {
      const row = sqliteDb.prepare(`
        SELECT
          workspace_id AS "workspaceId",
          plan,
          status,
          currency,
          monthly_price_cents AS "monthlyPriceCents",
          billing_email AS "billingEmail",
          invoice_contact_name AS "invoiceContactName",
          readiness_acknowledged_at AS "readinessAcknowledgedAt",
          readiness_acknowledged_by_user_id AS "readinessAcknowledgedByUserId",
          provider,
          provider_customer_id AS "providerCustomerId",
          provider_subscription_id AS "providerSubscriptionId",
          stripe_customer_id AS "stripeCustomerId",
          stripe_subscription_id AS "stripeSubscriptionId",
          stripe_price_id AS "stripePriceId",
          stripe_subscription_status AS "stripeSubscriptionStatus",
          current_period_end AS "currentPeriodEnd",
          legal_company_name AS "legalCompanyName",
          billing_contact_name AS "billingContactName",
          billing_address_line1 AS "billingAddressLine1",
          billing_address_line2 AS "billingAddressLine2",
          billing_city AS "billingCity",
          billing_postal_code AS "billingPostalCode",
          billing_country AS "billingCountry",
          vat_id AS "vatId",
          tax_number AS "taxNumber",
          invoice_language AS "invoiceLanguage",
          invoice_currency AS "invoiceCurrency",
          reverse_charge_applicable AS "reverseChargeApplicable",
          updated_at AS "updatedAt"
        FROM workspace_billing
        WHERE workspace_id = ?
      `).get(workspaceId);
      return normalizeBillingProfileRow(row);
    },

    async updateWorkspaceBillingProfile({
      workspaceId,
      billingEmail,
      invoiceContactName,
      legalCompanyName,
      billingContactName,
      billingAddressLine1,
      billingAddressLine2,
      billingCity,
      billingPostalCode,
      billingCountry,
      vatId,
      taxNumber,
      invoiceLanguage,
      invoiceCurrency,
      reverseChargeApplicable,
      acknowledgeReadiness = false,
      clearAcknowledgement = false,
      userId = null
    }) {
      const now = billingTimestamp(engine);
      await this.ensureWorkspaceBilling({ workspaceId, billingEmail: billingEmail || null });
      const existing = await this.getWorkspaceBillingProfile(workspaceId);
      const nextBillingEmail = billingEmail !== undefined ? (billingEmail || null) : existing?.billingEmail || null;
      const nextInvoiceContactName = invoiceContactName !== undefined ? (invoiceContactName || null) : existing?.invoiceContactName || null;
      const nextBillingContactName = billingContactName !== undefined ? (billingContactName || null) : existing?.billingContactName || nextInvoiceContactName || null;
      let acknowledgedAt = existing?.readinessAcknowledgedAt || null;
      let acknowledgedBy = existing?.readinessAcknowledgedByUserId || null;
      if (clearAcknowledgement) {
        acknowledgedAt = null;
        acknowledgedBy = null;
      } else if (acknowledgeReadiness) {
        acknowledgedAt = now;
        acknowledgedBy = userId || null;
      }
      sqliteDb.prepare(`
        UPDATE workspace_billing
        SET billing_email = ?,
            invoice_contact_name = ?,
            legal_company_name = ?,
            billing_contact_name = ?,
            billing_address_line1 = ?,
            billing_address_line2 = ?,
            billing_city = ?,
            billing_postal_code = ?,
            billing_country = ?,
            vat_id = ?,
            tax_number = ?,
            invoice_language = ?,
            invoice_currency = ?,
            reverse_charge_applicable = ?,
            readiness_acknowledged_at = ?,
            readiness_acknowledged_by_user_id = ?,
            updated_at = ?
        WHERE workspace_id = ?
      `).run(
        nextBillingEmail,
        nextInvoiceContactName,
        legalCompanyName !== undefined ? (legalCompanyName || null) : existing?.legalCompanyName || null,
        nextBillingContactName,
        billingAddressLine1 !== undefined ? (billingAddressLine1 || null) : existing?.billingAddressLine1 || null,
        billingAddressLine2 !== undefined ? (billingAddressLine2 || null) : existing?.billingAddressLine2 || null,
        billingCity !== undefined ? (billingCity || null) : existing?.billingCity || null,
        billingPostalCode !== undefined ? (billingPostalCode || null) : existing?.billingPostalCode || null,
        billingCountry !== undefined ? (billingCountry || null) : existing?.billingCountry || null,
        vatId !== undefined ? (vatId || null) : existing?.vatId || null,
        taxNumber !== undefined ? (taxNumber || null) : existing?.taxNumber || null,
        invoiceLanguage !== undefined ? (invoiceLanguage || 'en') : existing?.invoiceLanguage || 'en',
        invoiceCurrency !== undefined ? (invoiceCurrency || 'EUR') : existing?.invoiceCurrency || 'EUR',
        reverseChargeApplicable !== undefined ? (reverseChargeApplicable ? 1 : 0) : (existing?.reverseChargeApplicable ? 1 : 0),
        acknowledgedAt,
        acknowledgedBy,
        now,
        workspaceId
      );
      return this.getWorkspaceBillingProfile(workspaceId);
    },

    async listInvoices(workspaceId = 'all') {
      const ws = String(workspaceId || 'all');
      const params = ws === 'all' ? [] : [ws];
      const where = ws === 'all' ? '' : 'WHERE workspace_id = ?';

      return sqliteDb.prepare(`
        SELECT
          id,
          workspace_id AS "workspaceId",
          student_user_id AS "studentUserId",
          amount_cents AS "amountCents",
          currency,
          description,
          provider,
          provider_invoice_id AS "providerInvoiceId",
          seller_company_name AS "sellerCompanyName",
          seller_address AS "sellerAddress",
          seller_vat_id AS "sellerVatId",
          seller_tax_number AS "sellerTaxNumber",
          buyer_company_name AS "buyerCompanyName",
          buyer_billing_address AS "buyerBillingAddress",
          buyer_vat_id AS "buyerVatId",
          invoice_number AS "invoiceNumber",
          invoice_date AS "invoiceDate",
          net_amount AS "netAmount",
          vat_rate AS "vatRate",
          vat_amount AS "vatAmount",
          gross_amount AS "grossAmount",
          reverse_charge_note AS "reverseChargeNote",
          payment_provider AS "paymentProvider",
          legal_footer AS "legalFooter",
          status,
          due_date AS "dueDate",
          created_at AS "createdAt",
          paid_at AS "paidAt"
        FROM invoices
        ${where}
        ORDER BY created_at DESC, id DESC
        LIMIT 500
      `).all(...params);
    },

    async listPayments(workspaceId = 'all') {
      const ws = String(workspaceId || 'all');
      const params = ws === 'all' ? [] : [ws];
      const where = ws === 'all' ? '' : 'WHERE workspace_id = ?';

      return sqliteDb.prepare(`
        SELECT
          id,
          invoice_id AS "invoiceId",
          workspace_id AS "workspaceId",
          student_user_id AS "studentUserId",
          amount_cents AS "amountCents",
          currency,
          provider,
          provider_ref AS "providerRef",
          provider_payment_intent_id AS "providerPaymentIntentId",
          created_at AS "createdAt"
        FROM payments
        ${where}
        ORDER BY created_at DESC, id DESC
        LIMIT 500
      `).all(...params);
    },

    async listBilling(workspaceId = 'all') {
      const invoices = await this.listInvoices(workspaceId);
      const payments = await this.listPayments(workspaceId);
      return { invoices, payments };
    },

    async createInvoice({
      id,
      workspaceId,
      studentUserId = null,
      amountCents,
      currency = 'EUR',
      description = null,
      dueDate = null,
      sellerCompanyName = null,
      sellerAddress = null,
      sellerVatId = null,
      sellerTaxNumber = null,
      buyerCompanyName = null,
      buyerBillingAddress = null,
      buyerVatId = null,
      invoiceNumber = null,
      invoiceDate = null,
      netAmount = null,
      vatRate = 0,
      vatAmount = null,
      grossAmount = null,
      reverseChargeNote = null,
      paymentProvider = 'manual',
      providerInvoiceId = null,
      legalFooter = null
    }) {
      const createdAt = billingTimestamp(engine);
      const gross = moneyCents(grossAmount ?? amountCents);
      const net = moneyCents(netAmount ?? gross);
      const vat = moneyCents(vatAmount ?? Math.max(0, gross - net));
      const number = invoiceNumber || generateInvoiceNumber({ db: sqliteDb });

      sqliteDb.prepare(`
        INSERT INTO invoices (
          id, workspace_id, student_user_id, amount_cents, currency, description, provider, provider_invoice_id,
          seller_company_name, seller_address, seller_vat_id, seller_tax_number,
          buyer_company_name, buyer_billing_address, buyer_vat_id,
          invoice_number, invoice_date, net_amount, vat_rate, vat_amount, gross_amount,
          reverse_charge_note, payment_provider, legal_footer,
          status, due_date, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)
      `).run(
        id,
        workspaceId,
        studentUserId || null,
        gross,
        String(currency || 'EUR'),
        description || null,
        paymentProvider || 'manual',
        providerInvoiceId || null,
        sellerCompanyName || null,
        sellerAddress || null,
        sellerVatId || null,
        sellerTaxNumber || null,
        buyerCompanyName || null,
        buyerBillingAddress || null,
        buyerVatId || null,
        number,
        invoiceDate || (typeof createdAt === 'number' ? new Date(createdAt).toISOString().slice(0, 10) : String(createdAt).slice(0, 10)),
        net,
        Number(vatRate || 0),
        vat,
        gross,
        reverseChargeNote || null,
        paymentProvider || 'manual',
        legalFooter || null,
        dueDate || null,
        createdAt
      );

      return { id, invoiceNumber: number, createdAt };
    },

    async getInvoiceById(invoiceId) {
      return sqliteDb.prepare(`
        SELECT
          id,
          workspace_id AS "workspaceId",
          student_user_id AS "studentUserId",
          amount_cents AS "amountCents",
          currency,
          status
        FROM invoices
        WHERE id = ?
      `).get(invoiceId) || null;
    },

    async markInvoicePaid({ invoiceId, invoice = null, paymentId }) {
      if (!invoice && invoiceId) {
        invoice = await this.getInvoiceById(invoiceId);
      }
      if (!invoice) throw new Error('invoice is required');
      const paidAt = billingTimestamp(engine);

      const tx = sqliteDb.transaction(() => {
        sqliteDb.prepare('UPDATE invoices SET status = ?, paid_at = ? WHERE id = ?')
          .run('paid', paidAt, invoice.id);

        sqliteDb.prepare(`
          INSERT INTO payments (id, invoice_id, workspace_id, student_user_id, amount_cents, currency, provider, provider_ref, created_at)
          VALUES (?, ?, ?, ?, ?, ?, 'manual', NULL, ?)
        `).run(
          paymentId,
          invoice.id,
          invoice.workspaceId,
          invoice.studentUserId || null,
          invoice.amountCents,
          invoice.currency,
          paidAt
        );
      });

      tx();
      return { paymentId, paidAt };
    },

    async updateWorkspaceStripeState({
      workspaceId,
      stripeCustomerId,
      stripeSubscriptionId,
      stripePriceId,
      stripeSubscriptionStatus,
      currentPeriodEnd
    }) {
      if (!workspaceId) return null;
      await this.ensureWorkspaceBilling({ workspaceId });
      const existing = await this.getWorkspaceBillingProfile(workspaceId);
      const now = billingTimestamp(engine);
      sqliteDb.prepare(`
        UPDATE workspace_billing
        SET provider = 'stripe',
            provider_customer_id = ?,
            provider_subscription_id = ?,
            stripe_customer_id = ?,
            stripe_subscription_id = ?,
            stripe_price_id = ?,
            stripe_subscription_status = ?,
            current_period_end = ?,
            status = CASE
              WHEN ? IN ('active', 'trialing') THEN 'active'
              WHEN ? IN ('past_due', 'unpaid') THEN 'past_due'
              WHEN ? IN ('canceled', 'incomplete_expired') THEN 'canceled'
              ELSE status
            END,
            updated_at = ?
        WHERE workspace_id = ?
      `).run(
        stripeCustomerId !== undefined ? stripeCustomerId : existing?.stripeCustomerId || null,
        stripeSubscriptionId !== undefined ? stripeSubscriptionId : existing?.stripeSubscriptionId || null,
        stripeCustomerId !== undefined ? stripeCustomerId : existing?.stripeCustomerId || null,
        stripeSubscriptionId !== undefined ? stripeSubscriptionId : existing?.stripeSubscriptionId || null,
        stripePriceId !== undefined ? stripePriceId : existing?.stripePriceId || null,
        stripeSubscriptionStatus !== undefined ? stripeSubscriptionStatus : existing?.stripeSubscriptionStatus || null,
        currentPeriodEnd !== undefined ? currentPeriodEnd : existing?.currentPeriodEnd || null,
        stripeSubscriptionStatus || '',
        stripeSubscriptionStatus || '',
        stripeSubscriptionStatus || '',
        now,
        workspaceId
      );
      return this.getWorkspaceBillingProfile(workspaceId);
    },

    async findWorkspaceByStripeCustomerId(stripeCustomerId) {
      if (!stripeCustomerId) return null;
      const row = sqliteDb.prepare('SELECT workspace_id AS "workspaceId" FROM workspace_billing WHERE stripe_customer_id = ? OR provider_customer_id = ? LIMIT 1').get(stripeCustomerId, stripeCustomerId);
      return row?.workspaceId || null;
    },

    async recordBillingProviderEvent({ workspaceId = null, provider = 'stripe', eventType, status = 'received', providerRef = null, metadata = {} }) {
      const id = `bill_evt_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      sqliteDb.prepare(`
        INSERT INTO billing_provider_events (id, workspace_id, provider, event_type, status, provider_ref, metadata_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, workspaceId || null, provider, eventType, status, providerRef || null, stringifyJson(metadata), billingTimestamp(engine));
      return { id };
    },

    async recordStripePaymentFromInvoice({ workspaceId, stripeInvoiceId, stripePaymentIntentId = null, amountPaid = 0, currency = 'eur' }) {
      if (!workspaceId || !stripeInvoiceId || Number(amountPaid || 0) <= 0) return null;
      const existing = sqliteDb.prepare('SELECT id FROM payments WHERE provider = ? AND (provider_ref = ? OR provider_payment_intent_id = ?) LIMIT 1').get('stripe', stripeInvoiceId, stripePaymentIntentId || stripeInvoiceId);
      if (existing) return { paymentId: existing.id, idempotent: true };
      const invoiceId = `stripe_inv_${stripeInvoiceId}`;
      const paymentId = `stripe_pay_${stripePaymentIntentId || stripeInvoiceId}`;
      const now = billingTimestamp(engine);
      const tx = sqliteDb.transaction(() => {
        sqliteDb.prepare(`
          INSERT INTO invoices (id, workspace_id, student_user_id, amount_cents, currency, description, provider, provider_invoice_id, status, due_date, created_at, paid_at)
          VALUES (?, ?, NULL, ?, ?, ?, 'stripe', ?, 'paid', NULL, ?, ?)
          ON CONFLICT(id) DO UPDATE SET status = 'paid', paid_at = excluded.paid_at
        `).run(invoiceId, workspaceId, Math.floor(Number(amountPaid)), String(currency || 'eur').toUpperCase(), 'Stripe subscription invoice', stripeInvoiceId, now, now);
        sqliteDb.prepare(`
          INSERT INTO payments (id, invoice_id, workspace_id, student_user_id, amount_cents, currency, provider, provider_ref, provider_payment_intent_id, created_at)
          VALUES (?, ?, ?, NULL, ?, ?, 'stripe', ?, ?, ?)
        `).run(paymentId, invoiceId, workspaceId, Math.floor(Number(amountPaid)), String(currency || 'eur').toUpperCase(), stripeInvoiceId, stripePaymentIntentId || null, now);
      });
      tx();
      return { paymentId };
    },

    async recordStripeInvoiceFailure({ workspaceId, stripeInvoiceId, amountDue = 0, currency = 'eur' }) {
      if (!workspaceId || !stripeInvoiceId) return null;
      const invoiceId = `stripe_inv_${stripeInvoiceId}`;
      const existing = sqliteDb.prepare('SELECT id, status FROM invoices WHERE id = ? LIMIT 1').get(invoiceId);
      if (existing) return { invoiceId, idempotent: true };
      sqliteDb.prepare(`
        INSERT INTO invoices (id, workspace_id, student_user_id, amount_cents, currency, description, provider, provider_invoice_id, status, due_date, created_at)
        VALUES (?, ?, NULL, ?, ?, ?, 'stripe', ?, 'open', NULL, ?)
      `).run(
        invoiceId,
        workspaceId,
        Math.max(1, Math.floor(Number(amountDue || 0) || 1)),
        String(currency || 'eur').toUpperCase(),
        'Stripe failed subscription invoice',
        stripeInvoiceId,
        billingTimestamp(engine)
      );
      return { invoiceId };
    }
  };
}

function createPostgresBillingRepository() {
  const engine = 'postgres';
  const postgres = require('../../db/postgres');

  function normalizeBillingProfileRow(row) {
    if (!row) return null;
    return {
      workspaceId: row.workspaceId || row.workspace_id || '',
      plan: row.plan || 'free',
      status: row.status || 'active',
      currency: row.currency || 'EUR',
      monthlyPriceCents: Number(row.monthlyPriceCents ?? row.monthly_price_cents ?? 0),
      billingEmail: row.billingEmail ?? row.billing_email ?? null,
      invoiceContactName: row.invoiceContactName ?? row.invoice_contact_name ?? null,
      readinessAcknowledgedAt: row.readinessAcknowledgedAt ?? row.readiness_acknowledged_at ?? null,
      readinessAcknowledgedByUserId: row.readinessAcknowledgedByUserId ?? row.readiness_acknowledged_by_user_id ?? null,
      provider: row.provider || 'stripe',
      providerCustomerId: row.providerCustomerId ?? row.provider_customer_id ?? null,
      providerSubscriptionId: row.providerSubscriptionId ?? row.provider_subscription_id ?? null,
      stripeCustomerId: row.stripeCustomerId ?? row.stripe_customer_id ?? row.providerCustomerId ?? row.provider_customer_id ?? null,
      stripeSubscriptionId: row.stripeSubscriptionId ?? row.stripe_subscription_id ?? row.providerSubscriptionId ?? row.provider_subscription_id ?? null,
      stripePriceId: row.stripePriceId ?? row.stripe_price_id ?? null,
      stripeSubscriptionStatus: row.stripeSubscriptionStatus ?? row.stripe_subscription_status ?? null,
      currentPeriodEnd: row.currentPeriodEnd ?? row.current_period_end ?? null,
      legalCompanyName: row.legalCompanyName ?? row.legal_company_name ?? null,
      billingContactName: row.billingContactName ?? row.billing_contact_name ?? row.invoiceContactName ?? row.invoice_contact_name ?? null,
      billingAddressLine1: row.billingAddressLine1 ?? row.billing_address_line1 ?? null,
      billingAddressLine2: row.billingAddressLine2 ?? row.billing_address_line2 ?? null,
      billingCity: row.billingCity ?? row.billing_city ?? null,
      billingPostalCode: row.billingPostalCode ?? row.billing_postal_code ?? null,
      billingCountry: row.billingCountry ?? row.billing_country ?? null,
      vatId: row.vatId ?? row.vat_id ?? null,
      taxNumber: row.taxNumber ?? row.tax_number ?? null,
      invoiceLanguage: row.invoiceLanguage ?? row.invoice_language ?? 'en',
      invoiceCurrency: row.invoiceCurrency ?? row.invoice_currency ?? row.currency ?? 'EUR',
      reverseChargeApplicable: Boolean(Number(row.reverseChargeApplicable ?? row.reverse_charge_applicable ?? 0)),
      updatedAt: row.updatedAt ?? row.updated_at ?? null
    };
  }

  return {
    engine,

    async getBillingSummary(workspaceId = 'all') {
      const ws = String(workspaceId || 'all');
      const params = ws === 'all' ? [] : [ws];
      const where = ws === 'all' ? '' : 'WHERE workspace_id = ?';
      const andWhere = ws === 'all' ? '' : 'AND workspace_id = ?';

      const activeSubscriptionsRow = await postgres.queryOne(`
        SELECT COUNT(*)::int AS c
        FROM workspace_billing
        WHERE status = 'active' AND plan <> 'free'
        ${andWhere}
      `, params);

      const openInvoicesRow = await postgres.queryOne(`
        SELECT COUNT(*)::int AS c
        FROM invoices
        ${where}
        ${ws === 'all' ? 'WHERE' : 'AND'} status = 'open'
      `, params);

      const paymentsRow = await postgres.queryOne(`
        SELECT
          COUNT(*)::int AS "paymentsCount",
          COALESCE(SUM(amount_cents), 0)::int AS "collectedAmountCents"
        FROM payments
        ${where}
      `, params);

      return {
        activeSubscriptions: activeSubscriptionsRow?.c || 0,
        openInvoices: openInvoicesRow?.c || 0,
        paymentsCount: paymentsRow?.paymentsCount || 0,
        collectedAmountCents: paymentsRow?.collectedAmountCents || 0
      };
    },

    async getOverviewStats() {
      return this.getBillingSummary('all');
    },

    async ensureWorkspaceBilling({ workspaceId, billingEmail = null }) {
      await postgres.execute(`
        INSERT INTO workspace_billing (
          workspace_id, plan, status, currency, monthly_price_cents,
          billing_email, invoice_contact_name, readiness_acknowledged_at,
          readiness_acknowledged_by_user_id, updated_at
        )
        VALUES (?, 'free', 'active', 'EUR', 0, ?, NULL, NULL, NULL, ?)
        ON CONFLICT(workspace_id) DO NOTHING
      `, [workspaceId, billingEmail || null, billingTimestamp(engine)]);
    },

    async getWorkspaceBillingProfile(workspaceId) {
      const row = await postgres.queryOne(`
        SELECT
          workspace_id AS "workspaceId",
          plan,
          status,
          currency,
          monthly_price_cents AS "monthlyPriceCents",
          billing_email AS "billingEmail",
          invoice_contact_name AS "invoiceContactName",
          readiness_acknowledged_at AS "readinessAcknowledgedAt",
          readiness_acknowledged_by_user_id AS "readinessAcknowledgedByUserId",
          provider,
          provider_customer_id AS "providerCustomerId",
          provider_subscription_id AS "providerSubscriptionId",
          stripe_customer_id AS "stripeCustomerId",
          stripe_subscription_id AS "stripeSubscriptionId",
          stripe_price_id AS "stripePriceId",
          stripe_subscription_status AS "stripeSubscriptionStatus",
          current_period_end AS "currentPeriodEnd",
          legal_company_name AS "legalCompanyName",
          billing_contact_name AS "billingContactName",
          billing_address_line1 AS "billingAddressLine1",
          billing_address_line2 AS "billingAddressLine2",
          billing_city AS "billingCity",
          billing_postal_code AS "billingPostalCode",
          billing_country AS "billingCountry",
          vat_id AS "vatId",
          tax_number AS "taxNumber",
          invoice_language AS "invoiceLanguage",
          invoice_currency AS "invoiceCurrency",
          reverse_charge_applicable AS "reverseChargeApplicable",
          updated_at AS "updatedAt"
        FROM workspace_billing
        WHERE workspace_id = ?
      `, [workspaceId]);
      return normalizeBillingProfileRow(row);
    },

    async updateWorkspaceBillingProfile({
      workspaceId,
      billingEmail,
      invoiceContactName,
      legalCompanyName,
      billingContactName,
      billingAddressLine1,
      billingAddressLine2,
      billingCity,
      billingPostalCode,
      billingCountry,
      vatId,
      taxNumber,
      invoiceLanguage,
      invoiceCurrency,
      reverseChargeApplicable,
      acknowledgeReadiness = false,
      clearAcknowledgement = false,
      userId = null
    }) {
      const now = billingTimestamp(engine);
      await this.ensureWorkspaceBilling({ workspaceId, billingEmail: billingEmail || null });
      const existing = await this.getWorkspaceBillingProfile(workspaceId);
      const nextBillingEmail = billingEmail !== undefined ? (billingEmail || null) : existing?.billingEmail || null;
      const nextInvoiceContactName = invoiceContactName !== undefined ? (invoiceContactName || null) : existing?.invoiceContactName || null;
      const nextBillingContactName = billingContactName !== undefined ? (billingContactName || null) : existing?.billingContactName || nextInvoiceContactName || null;
      let acknowledgedAt = existing?.readinessAcknowledgedAt || null;
      let acknowledgedBy = existing?.readinessAcknowledgedByUserId || null;
      if (clearAcknowledgement) {
        acknowledgedAt = null;
        acknowledgedBy = null;
      } else if (acknowledgeReadiness) {
        acknowledgedAt = now;
        acknowledgedBy = userId || null;
      }
      await postgres.execute(`
        UPDATE workspace_billing
        SET billing_email = ?,
            invoice_contact_name = ?,
            legal_company_name = ?,
            billing_contact_name = ?,
            billing_address_line1 = ?,
            billing_address_line2 = ?,
            billing_city = ?,
            billing_postal_code = ?,
            billing_country = ?,
            vat_id = ?,
            tax_number = ?,
            invoice_language = ?,
            invoice_currency = ?,
            reverse_charge_applicable = ?,
            readiness_acknowledged_at = ?,
            readiness_acknowledged_by_user_id = ?,
            updated_at = ?
        WHERE workspace_id = ?
      `, [
        nextBillingEmail,
        nextInvoiceContactName,
        legalCompanyName !== undefined ? (legalCompanyName || null) : existing?.legalCompanyName || null,
        nextBillingContactName,
        billingAddressLine1 !== undefined ? (billingAddressLine1 || null) : existing?.billingAddressLine1 || null,
        billingAddressLine2 !== undefined ? (billingAddressLine2 || null) : existing?.billingAddressLine2 || null,
        billingCity !== undefined ? (billingCity || null) : existing?.billingCity || null,
        billingPostalCode !== undefined ? (billingPostalCode || null) : existing?.billingPostalCode || null,
        billingCountry !== undefined ? (billingCountry || null) : existing?.billingCountry || null,
        vatId !== undefined ? (vatId || null) : existing?.vatId || null,
        taxNumber !== undefined ? (taxNumber || null) : existing?.taxNumber || null,
        invoiceLanguage !== undefined ? (invoiceLanguage || 'en') : existing?.invoiceLanguage || 'en',
        invoiceCurrency !== undefined ? (invoiceCurrency || 'EUR') : existing?.invoiceCurrency || 'EUR',
        reverseChargeApplicable !== undefined ? (reverseChargeApplicable ? 1 : 0) : (existing?.reverseChargeApplicable ? 1 : 0),
        acknowledgedAt,
        acknowledgedBy,
        now,
        workspaceId
      ]);
      return this.getWorkspaceBillingProfile(workspaceId);
    },

    async listInvoices(workspaceId = 'all') {
      const ws = String(workspaceId || 'all');
      const params = ws === 'all' ? [] : [ws];
      const where = ws === 'all' ? '' : 'WHERE workspace_id = ?';

      const rows = await postgres.queryMany(`
        SELECT
          id,
          workspace_id AS "workspaceId",
          student_user_id AS "studentUserId",
          amount_cents AS "amountCents",
          currency,
          description,
          provider,
          provider_invoice_id AS "providerInvoiceId",
          seller_company_name AS "sellerCompanyName",
          seller_address AS "sellerAddress",
          seller_vat_id AS "sellerVatId",
          seller_tax_number AS "sellerTaxNumber",
          buyer_company_name AS "buyerCompanyName",
          buyer_billing_address AS "buyerBillingAddress",
          buyer_vat_id AS "buyerVatId",
          invoice_number AS "invoiceNumber",
          invoice_date AS "invoiceDate",
          net_amount AS "netAmount",
          vat_rate AS "vatRate",
          vat_amount AS "vatAmount",
          gross_amount AS "grossAmount",
          reverse_charge_note AS "reverseChargeNote",
          payment_provider AS "paymentProvider",
          legal_footer AS "legalFooter",
          status,
          due_date AS "dueDate",
          created_at AS "createdAt",
          paid_at AS "paidAt"
        FROM invoices
        ${where}
        ORDER BY created_at DESC, id DESC
        LIMIT 500
      `, params);
      return rows.map(normalizePostgresInvoice);
    },

    async listPayments(workspaceId = 'all') {
      const ws = String(workspaceId || 'all');
      const params = ws === 'all' ? [] : [ws];
      const where = ws === 'all' ? '' : 'WHERE workspace_id = ?';

      const rows = await postgres.queryMany(`
        SELECT
          id,
          invoice_id AS "invoiceId",
          workspace_id AS "workspaceId",
          student_user_id AS "studentUserId",
          amount_cents AS "amountCents",
          currency,
          provider,
          provider_ref AS "providerRef",
          provider_payment_intent_id AS "providerPaymentIntentId",
          created_at AS "createdAt"
        FROM payments
        ${where}
        ORDER BY created_at DESC, id DESC
        LIMIT 500
      `, params);
      return rows.map(normalizePostgresPayment);
    },

    async listBilling(workspaceId = 'all') {
      const invoices = await this.listInvoices(workspaceId);
      const payments = await this.listPayments(workspaceId);
      return { invoices, payments };
    },

    async createInvoice({
      id,
      workspaceId,
      studentUserId = null,
      amountCents,
      currency = 'EUR',
      description = null,
      dueDate = null,
      sellerCompanyName = null,
      sellerAddress = null,
      sellerVatId = null,
      sellerTaxNumber = null,
      buyerCompanyName = null,
      buyerBillingAddress = null,
      buyerVatId = null,
      invoiceNumber = null,
      invoiceDate = null,
      netAmount = null,
      vatRate = 0,
      vatAmount = null,
      grossAmount = null,
      reverseChargeNote = null,
      paymentProvider = 'manual',
      providerInvoiceId = null,
      legalFooter = null
    }) {
      const createdAt = billingTimestamp(engine);
      const gross = moneyCents(grossAmount ?? amountCents);
      const net = moneyCents(netAmount ?? gross);
      const vat = moneyCents(vatAmount ?? Math.max(0, gross - net));
      const number = invoiceNumber || `ST-${new Date().getUTCFullYear()}-${String(Date.now()).slice(-6)}`;

      await postgres.execute(`
        INSERT INTO invoices (
          id, workspace_id, student_user_id, amount_cents, currency, description, provider, provider_invoice_id,
          seller_company_name, seller_address, seller_vat_id, seller_tax_number,
          buyer_company_name, buyer_billing_address, buyer_vat_id,
          invoice_number, invoice_date, net_amount, vat_rate, vat_amount, gross_amount,
          reverse_charge_note, payment_provider, legal_footer,
          status, due_date, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)
      `, [
        id,
        workspaceId,
        studentUserId || null,
        gross,
        String(currency || 'EUR'),
        description || null,
        paymentProvider || 'manual',
        providerInvoiceId || null,
        sellerCompanyName || null,
        sellerAddress || null,
        sellerVatId || null,
        sellerTaxNumber || null,
        buyerCompanyName || null,
        buyerBillingAddress || null,
        buyerVatId || null,
        number,
        invoiceDate || (typeof createdAt === 'number' ? new Date(createdAt).toISOString().slice(0, 10) : String(createdAt).slice(0, 10)),
        net,
        Number(vatRate || 0),
        vat,
        gross,
        reverseChargeNote || null,
        paymentProvider || 'manual',
        legalFooter || null,
        dueDate || null,
        createdAt
      ]);

      return { id, invoiceNumber: number, createdAt };
    },

    async getInvoiceById(invoiceId) {
      return postgres.queryOne(`
        SELECT
          id,
          workspace_id AS "workspaceId",
          student_user_id AS "studentUserId",
          amount_cents AS "amountCents",
          currency,
          status
        FROM invoices
        WHERE id = ?
      `, [invoiceId]);
    },

    async markInvoicePaid({ invoiceId, invoice = null, paymentId }) {
      if (!invoice && invoiceId) {
        invoice = await this.getInvoiceById(invoiceId);
      }
      if (!invoice) throw new Error('invoice is required');
      const paidAt = billingTimestamp(engine);

      await postgres.transaction(async (tx) => {
        await tx.execute('UPDATE invoices SET status = ?, paid_at = ? WHERE id = ?', [
          'paid',
          paidAt,
          invoice.id
        ]);

        await tx.execute(`
          INSERT INTO payments (id, invoice_id, workspace_id, student_user_id, amount_cents, currency, provider, provider_ref, created_at)
          VALUES (?, ?, ?, ?, ?, ?, 'manual', NULL, ?)
        `, [
          paymentId,
          invoice.id,
          invoice.workspaceId,
          invoice.studentUserId || null,
          invoice.amountCents,
          invoice.currency,
          paidAt
        ]);
      });

      return { paymentId, paidAt };
    },

    async updateWorkspaceStripeState({
      workspaceId,
      stripeCustomerId,
      stripeSubscriptionId,
      stripePriceId,
      stripeSubscriptionStatus,
      currentPeriodEnd
    }) {
      if (!workspaceId) return null;
      await this.ensureWorkspaceBilling({ workspaceId });
      const existing = await this.getWorkspaceBillingProfile(workspaceId);
      const now = billingTimestamp(engine);
      await postgres.execute(`
        UPDATE workspace_billing
        SET provider = 'stripe',
            provider_customer_id = ?,
            provider_subscription_id = ?,
            stripe_customer_id = ?,
            stripe_subscription_id = ?,
            stripe_price_id = ?,
            stripe_subscription_status = ?,
            current_period_end = ?,
            status = CASE
              WHEN ? IN ('active', 'trialing') THEN 'active'
              WHEN ? IN ('past_due', 'unpaid') THEN 'past_due'
              WHEN ? IN ('canceled', 'incomplete_expired') THEN 'canceled'
              ELSE status
            END,
            updated_at = ?
        WHERE workspace_id = ?
      `, [
        stripeCustomerId !== undefined ? stripeCustomerId : existing?.stripeCustomerId || null,
        stripeSubscriptionId !== undefined ? stripeSubscriptionId : existing?.stripeSubscriptionId || null,
        stripeCustomerId !== undefined ? stripeCustomerId : existing?.stripeCustomerId || null,
        stripeSubscriptionId !== undefined ? stripeSubscriptionId : existing?.stripeSubscriptionId || null,
        stripePriceId !== undefined ? stripePriceId : existing?.stripePriceId || null,
        stripeSubscriptionStatus !== undefined ? stripeSubscriptionStatus : existing?.stripeSubscriptionStatus || null,
        currentPeriodEnd !== undefined ? currentPeriodEnd : existing?.currentPeriodEnd || null,
        stripeSubscriptionStatus || '',
        stripeSubscriptionStatus || '',
        stripeSubscriptionStatus || '',
        now,
        workspaceId
      ]);
      return this.getWorkspaceBillingProfile(workspaceId);
    },

    async findWorkspaceByStripeCustomerId(stripeCustomerId) {
      if (!stripeCustomerId) return null;
      const row = await postgres.queryOne('SELECT workspace_id AS "workspaceId" FROM workspace_billing WHERE stripe_customer_id = ? OR provider_customer_id = ? LIMIT 1', [stripeCustomerId, stripeCustomerId]);
      return row?.workspaceId || null;
    },

    async recordBillingProviderEvent({ workspaceId = null, provider = 'stripe', eventType, status = 'received', providerRef = null, metadata = {} }) {
      const id = `bill_evt_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      await postgres.execute(`
        INSERT INTO billing_provider_events (id, workspace_id, provider, event_type, status, provider_ref, metadata_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [id, workspaceId || null, provider, eventType, status, providerRef || null, stringifyJson(metadata), billingTimestamp(engine)]);
      return { id };
    },

    async recordStripePaymentFromInvoice({ workspaceId, stripeInvoiceId, stripePaymentIntentId = null, amountPaid = 0, currency = 'eur' }) {
      if (!workspaceId || !stripeInvoiceId || Number(amountPaid || 0) <= 0) return null;
      const existing = await postgres.queryOne('SELECT id FROM payments WHERE provider = ? AND (provider_ref = ? OR provider_payment_intent_id = ?) LIMIT 1', ['stripe', stripeInvoiceId, stripePaymentIntentId || stripeInvoiceId]);
      if (existing) return { paymentId: existing.id, idempotent: true };
      const invoiceId = `stripe_inv_${stripeInvoiceId}`;
      const paymentId = `stripe_pay_${stripePaymentIntentId || stripeInvoiceId}`;
      const now = billingTimestamp(engine);
      await postgres.transaction(async (tx) => {
        await tx.execute(`
          INSERT INTO invoices (id, workspace_id, student_user_id, amount_cents, currency, description, provider, provider_invoice_id, status, due_date, created_at, paid_at)
          VALUES (?, ?, NULL, ?, ?, ?, 'stripe', ?, 'paid', NULL, ?, ?)
          ON CONFLICT(id) DO UPDATE SET status = 'paid', paid_at = EXCLUDED.paid_at
        `, [invoiceId, workspaceId, Math.floor(Number(amountPaid)), String(currency || 'eur').toUpperCase(), 'Stripe subscription invoice', stripeInvoiceId, now, now]);
        await tx.execute(`
          INSERT INTO payments (id, invoice_id, workspace_id, student_user_id, amount_cents, currency, provider, provider_ref, provider_payment_intent_id, created_at)
          VALUES (?, ?, ?, NULL, ?, ?, 'stripe', ?, ?, ?)
        `, [paymentId, invoiceId, workspaceId, Math.floor(Number(amountPaid)), String(currency || 'eur').toUpperCase(), stripeInvoiceId, stripePaymentIntentId || null, now]);
      });
      return { paymentId };
    },

    async recordStripeInvoiceFailure({ workspaceId, stripeInvoiceId, amountDue = 0, currency = 'eur' }) {
      if (!workspaceId || !stripeInvoiceId) return null;
      const invoiceId = `stripe_inv_${stripeInvoiceId}`;
      const existing = await postgres.queryOne('SELECT id, status FROM invoices WHERE id = ? LIMIT 1', [invoiceId]);
      if (existing) return { invoiceId, idempotent: true };
      await postgres.execute(`
        INSERT INTO invoices (id, workspace_id, student_user_id, amount_cents, currency, description, provider, provider_invoice_id, status, due_date, created_at)
        VALUES (?, ?, NULL, ?, ?, ?, 'stripe', ?, 'open', NULL, ?)
      `, [
        invoiceId,
        workspaceId,
        Math.max(1, Math.floor(Number(amountDue || 0) || 1)),
        String(currency || 'eur').toUpperCase(),
        'Stripe failed subscription invoice',
        stripeInvoiceId,
        billingTimestamp(engine)
      ]);
      return { invoiceId };
    }
  };
}

module.exports = {
  createBillingRepository
};
