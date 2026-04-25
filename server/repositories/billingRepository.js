'use strict';

const { normalizeEngine } = require('../../db/helpers');

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
      acknowledgeReadiness = false,
      clearAcknowledgement = false,
      userId = null
    }) {
      const now = billingTimestamp(engine);
      await this.ensureWorkspaceBilling({ workspaceId, billingEmail: billingEmail || null });
      const existing = await this.getWorkspaceBillingProfile(workspaceId);
      const nextBillingEmail = billingEmail !== undefined ? (billingEmail || null) : existing?.billingEmail || null;
      const nextInvoiceContactName = invoiceContactName !== undefined ? (invoiceContactName || null) : existing?.invoiceContactName || null;
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
            readiness_acknowledged_at = ?,
            readiness_acknowledged_by_user_id = ?,
            updated_at = ?
        WHERE workspace_id = ?
      `).run(nextBillingEmail, nextInvoiceContactName, acknowledgedAt, acknowledgedBy, now, workspaceId);
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

    async createInvoice({ id, workspaceId, studentUserId = null, amountCents, currency = 'EUR', description = null, dueDate = null }) {
      const createdAt = billingTimestamp(engine);

      sqliteDb.prepare(`
        INSERT INTO invoices (id, workspace_id, student_user_id, amount_cents, currency, description, status, due_date, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?)
      `).run(
        id,
        workspaceId,
        studentUserId || null,
        Math.floor(Number(amountCents)),
        String(currency || 'EUR'),
        description || null,
        dueDate || null,
        createdAt
      );

      return { id, createdAt };
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
      acknowledgeReadiness = false,
      clearAcknowledgement = false,
      userId = null
    }) {
      const now = billingTimestamp(engine);
      await this.ensureWorkspaceBilling({ workspaceId, billingEmail: billingEmail || null });
      const existing = await this.getWorkspaceBillingProfile(workspaceId);
      const nextBillingEmail = billingEmail !== undefined ? (billingEmail || null) : existing?.billingEmail || null;
      const nextInvoiceContactName = invoiceContactName !== undefined ? (invoiceContactName || null) : existing?.invoiceContactName || null;
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
            readiness_acknowledged_at = ?,
            readiness_acknowledged_by_user_id = ?,
            updated_at = ?
        WHERE workspace_id = ?
      `, [nextBillingEmail, nextInvoiceContactName, acknowledgedAt, acknowledgedBy, now, workspaceId]);
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

    async createInvoice({ id, workspaceId, studentUserId = null, amountCents, currency = 'EUR', description = null, dueDate = null }) {
      const createdAt = billingTimestamp(engine);

      await postgres.execute(`
        INSERT INTO invoices (id, workspace_id, student_user_id, amount_cents, currency, description, status, due_date, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?)
      `, [
        id,
        workspaceId,
        studentUserId || null,
        Math.floor(Number(amountCents)),
        String(currency || 'EUR'),
        description || null,
        dueDate || null,
        createdAt
      ]);

      return { id, createdAt };
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
    }
  };
}

module.exports = {
  createBillingRepository
};
