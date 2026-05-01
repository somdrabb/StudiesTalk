#!/usr/bin/env node
'use strict';

const assert = require('assert');
const crypto = require('crypto');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');
const { createBillingRepository } = require('../server/repositories/billingRepository');
const { createStripeBillingService } = require('../server/services/billing/stripe.service');

const runId = `billing_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
const sqlitePath = path.join(os.tmpdir(), `${runId}.sqlite`);
const workspaceId = `ws_${runId}`;

function createSchema(db) {
  db.exec(`
    CREATE TABLE workspaces (
      id TEXT PRIMARY KEY,
      name TEXT,
      status TEXT DEFAULT 'active',
      admin_email TEXT
    );
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      workspace_id TEXT,
      email TEXT,
      role TEXT
    );
    CREATE TABLE workspace_billing (
      workspace_id TEXT PRIMARY KEY,
      plan TEXT DEFAULT 'free',
      status TEXT DEFAULT 'active',
      currency TEXT DEFAULT 'EUR',
      monthly_price_cents INTEGER DEFAULT 0,
      billing_email TEXT,
      invoice_contact_name TEXT,
      readiness_acknowledged_at TEXT,
      readiness_acknowledged_by_user_id TEXT,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE invoices (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      student_user_id TEXT,
      amount_cents INTEGER NOT NULL,
      currency TEXT DEFAULT 'EUR',
      description TEXT,
      status TEXT DEFAULT 'open',
      due_date TEXT,
      created_at INTEGER NOT NULL,
      paid_at INTEGER
    );
    CREATE TABLE payments (
      id TEXT PRIMARY KEY,
      invoice_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      student_user_id TEXT,
      amount_cents INTEGER NOT NULL,
      currency TEXT DEFAULT 'EUR',
      provider TEXT DEFAULT 'manual',
      provider_ref TEXT,
      created_at INTEGER NOT NULL
    );
  `);
  db.prepare('INSERT INTO workspaces (id, name, status, admin_email) VALUES (?, ?, ?, ?)').run(workspaceId, 'Billing Smoke School', 'active', 'billing@example.com');
  db.prepare('INSERT INTO users (id, workspace_id, email, role) VALUES (?, ?, ?, ?)').run(`admin_${runId}`, workspaceId, 'billing@example.com', 'school_admin');
}

function createFakeStripe() {
  return {
    customers: {
      async create(payload) {
        assert.strictEqual(payload.metadata.workspaceId, workspaceId);
        return { id: 'cus_mock_billing' };
      }
    },
    checkout: {
      sessions: {
        async create(payload) {
          assert.strictEqual(payload.mode, 'subscription');
          assert.strictEqual(payload.customer, 'cus_mock_billing');
          assert.strictEqual(payload.line_items[0].price, 'price_mock_starter');
          return { id: 'cs_mock_billing', url: 'https://checkout.stripe.test/session/cs_mock_billing' };
        }
      }
    },
    billingPortal: {
      sessions: {
        async create(payload) {
          assert.strictEqual(payload.customer, 'cus_mock_billing');
          return { id: 'bps_mock_billing', url: 'https://billing.stripe.test/session/bps_mock_billing' };
        }
      }
    },
    webhooks: {
      constructEvent(rawBody) {
        return JSON.parse(Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody || '{}'));
      }
    }
  };
}

async function main() {
  const db = new Database(sqlitePath);
  createSchema(db);
  const repository = createBillingRepository({ engine: 'sqlite', sqliteDb: db });
  await repository.ensureWorkspaceBilling({ workspaceId, billingEmail: 'billing@example.com' });

  const statusChanges = [];
  const service = createStripeBillingService({
    env: {
      STRIPE_SECRET_KEY: 'sk_test_mock',
      STRIPE_WEBHOOK_SECRET: 'whsec_mock',
      STRIPE_PRICE_STARTER: 'price_mock_starter',
      STRIPE_PRICE_PRO: 'price_mock_pro',
      STRIPE_PRICE_ENTERPRISE: 'price_mock_enterprise',
      APP_BASE_URL: 'https://app.example.test'
    },
    billingRepository: repository,
    stripeClient: createFakeStripe(),
    updateWorkspaceStatus: async (ws, status) => {
      statusChanges.push({ workspaceId: ws, status });
      db.prepare('UPDATE workspaces SET status = ? WHERE id = ?').run(status, ws);
    }
  });

  const checkout = await service.createCheckoutSession({ workspaceId, plan: 'starter', email: 'billing@example.com', actorId: `admin_${runId}` });
  assert.strictEqual(checkout.url, 'https://checkout.stripe.test/session/cs_mock_billing');

  await service.handleWebhook({
    id: 'evt_checkout_complete',
    type: 'checkout.session.completed',
    livemode: false,
    data: {
      object: {
        id: 'cs_mock_billing',
        customer: 'cus_mock_billing',
        subscription: 'sub_mock_billing',
        status: 'complete',
        metadata: { workspaceId }
      }
    }
  });
  let profile = await repository.getWorkspaceBillingProfile(workspaceId);
  assert.strictEqual(profile.providerCustomerId, 'cus_mock_billing');
  assert.strictEqual(profile.providerSubscriptionId, 'sub_mock_billing');
  assert.strictEqual(profile.status, 'active');
  assert.strictEqual(db.prepare('SELECT status FROM workspaces WHERE id = ?').get(workspaceId).status, 'active');

  await service.handleWebhook({
    id: 'evt_subscription_updated',
    type: 'customer.subscription.updated',
    livemode: false,
    data: {
      object: {
        id: 'sub_mock_billing',
        customer: 'cus_mock_billing',
        status: 'trialing',
        current_period_end: 1777651200,
        items: { data: [{ price: { id: 'price_mock_pro' } }] }
      }
    }
  });
  profile = await repository.getWorkspaceBillingProfile(workspaceId);
  assert.strictEqual(profile.stripePriceId, 'price_mock_pro');
  assert.strictEqual(profile.stripeSubscriptionStatus, 'trialing');
  assert.ok(profile.currentPeriodEnd, 'current period end should be stored');

  await service.handleWebhook({
    id: 'evt_invoice_paid',
    type: 'invoice.paid',
    livemode: false,
    data: {
      object: {
        id: 'in_mock_paid',
        customer: 'cus_mock_billing',
        subscription: 'sub_mock_billing',
        amount_paid: 4900,
        currency: 'eur',
        payment_intent: 'pi_mock_paid'
      }
    }
  });
  const payments = await repository.listPayments(workspaceId);
  assert.strictEqual(payments.length, 1);
  assert.strictEqual(payments[0].provider, 'stripe');
  assert.strictEqual(payments[0].providerPaymentIntentId, 'pi_mock_paid');

  await service.handleWebhook({
    id: 'evt_invoice_failed',
    type: 'invoice.payment_failed',
    livemode: false,
    data: {
      object: {
        id: 'in_mock_failed',
        customer: 'cus_mock_billing',
        subscription: 'sub_mock_billing',
        amount_due: 4900,
        currency: 'eur',
        payment_intent: 'pi_mock_failed'
      }
    }
  });
  profile = await repository.getWorkspaceBillingProfile(workspaceId);
  assert.strictEqual(profile.status, 'past_due');
  assert.strictEqual(db.prepare('SELECT status FROM workspaces WHERE id = ?').get(workspaceId).status, 'past_due');

  await service.handleWebhook({
    id: 'evt_subscription_deleted',
    type: 'customer.subscription.deleted',
    livemode: false,
    data: {
      object: {
        id: 'sub_mock_billing',
        customer: 'cus_mock_billing',
        status: 'canceled',
        current_period_end: 1777651200,
        items: { data: [{ price: { id: 'price_mock_pro' } }] }
      }
    }
  });
  profile = await repository.getWorkspaceBillingProfile(workspaceId);
  assert.strictEqual(profile.status, 'canceled');
  assert.strictEqual(db.prepare('SELECT status FROM workspaces WHERE id = ?').get(workspaceId).status, 'suspended');

  const portal = await service.getCustomerPortalSession('cus_mock_billing');
  assert.strictEqual(portal.url, 'https://billing.stripe.test/session/bps_mock_billing');
  assert.ok(statusChanges.some((row) => row.status === 'past_due'));
  assert.ok(statusChanges.some((row) => row.status === 'suspended'));

  console.log('[billing-smoke] passed');
}

main().catch((err) => {
  console.error('[billing-smoke] failed:', err?.message || err);
  process.exit(1);
});
