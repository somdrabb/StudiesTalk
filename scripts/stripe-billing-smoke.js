#!/usr/bin/env node
'use strict';

const assert = require('assert');
const crypto = require('crypto');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');
const { createBillingRepository } = require('../server/repositories/billingRepository');
const { createStripeBillingService, STRIPE_API_VERSION } = require('../server/services/billing/stripe.service');

const runId = `stripe_billing_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
const sqlitePath = path.join(os.tmpdir(), `${runId}.sqlite`);
const workspaceId = `ws_${runId}`;

function createSchema(db) {
  db.exec(`
    CREATE TABLE workspaces (id TEXT PRIMARY KEY, name TEXT);
    CREATE TABLE users (id TEXT PRIMARY KEY, workspace_id TEXT, email TEXT, role TEXT);
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
  db.prepare('INSERT INTO workspaces (id, name) VALUES (?, ?)').run(workspaceId, 'Stripe Smoke School');
  db.prepare('INSERT INTO users (id, workspace_id, email, role) VALUES (?, ?, ?, ?)').run(`admin_${runId}`, workspaceId, 'billing@example.com', 'school_admin');
}

async function main() {
  const db = new Database(sqlitePath);
  createSchema(db);
  const repository = createBillingRepository({ engine: 'sqlite', sqliteDb: db });
  await repository.ensureWorkspaceBilling({ workspaceId, billingEmail: 'billing@example.com' });

  const service = createStripeBillingService({
    env: {
      STRIPE_SECRET_KEY: '',
      STRIPE_WEBHOOK_SECRET: '',
      STRIPE_DEFAULT_CURRENCY: 'eur',
      APP_BASE_URL: 'https://example.test'
    },
    billingRepository: repository,
    updateWorkspaceStatus: async (ws, status) => {
      db.prepare('UPDATE workspaces SET name = name WHERE id = ?').run(ws);
      db.__lastWorkspaceStatus = status;
    }
  });

  const status = service.getStatus();
  assert.strictEqual(status.provider, 'stripe');
  assert.strictEqual(status.configured, false);
  assert.strictEqual(status.apiVersion, STRIPE_API_VERSION);
  assert.ok(!JSON.stringify(status).includes('sk_'), 'status must not expose secret keys');

  await repository.updateWorkspaceStripeState({
    workspaceId,
    stripeCustomerId: 'cus_smoke',
    stripeSubscriptionId: 'sub_smoke',
    stripePriceId: 'price_smoke',
    stripeSubscriptionStatus: 'active'
  });
  const profile = await repository.getWorkspaceBillingProfile(workspaceId);
  assert.strictEqual(profile.stripeCustomerId, 'cus_smoke');
  assert.strictEqual(profile.providerCustomerId, 'cus_smoke');
  assert.strictEqual(profile.providerSubscriptionId, 'sub_smoke');
  assert.strictEqual(profile.stripeSubscriptionStatus, 'active');
  assert.strictEqual(profile.status, 'active');

  await service.handleWebhookEvent({
    id: 'evt_payment_succeeded',
    type: 'invoice.payment_succeeded',
    livemode: false,
    data: {
      object: {
        id: 'in_smoke',
        customer: 'cus_smoke',
        amount_paid: 2500,
        currency: 'eur',
        payment_intent: 'pi_smoke'
      }
    }
  });

  const payments = await repository.listPayments(workspaceId);
  assert.strictEqual(payments.length, 1);
  assert.strictEqual(payments[0].provider, 'stripe');
  assert.strictEqual(payments[0].providerRef, 'in_smoke');
  assert.strictEqual(payments[0].providerPaymentIntentId, 'pi_smoke');

  await service.handleWebhookEvent({
    id: 'evt_payment_succeeded_duplicate',
    type: 'invoice.payment_succeeded',
    livemode: false,
    data: {
      object: {
        id: 'in_smoke',
        customer: 'cus_smoke',
        amount_paid: 2500,
        currency: 'eur',
        payment_intent: 'pi_smoke'
      }
    }
  });
  assert.strictEqual((await repository.listPayments(workspaceId)).length, 1, 'webhook payment handling should be idempotent');
  assert.strictEqual(db.__lastWorkspaceStatus, 'active');

  await service.handleWebhookEvent({
    id: 'evt_invoice_failed',
    type: 'invoice.payment_failed',
    livemode: false,
    data: {
      object: {
        id: 'in_failed',
        customer: 'cus_smoke',
        amount_due: 2500,
        currency: 'eur',
        payment_intent: 'pi_failed',
        subscription: 'sub_smoke'
      }
    }
  });
  assert.strictEqual((await repository.getWorkspaceBillingProfile(workspaceId)).stripeSubscriptionStatus, 'past_due');
  assert.strictEqual(db.__lastWorkspaceStatus, 'past_due');
  assert.ok((await repository.listInvoices(workspaceId)).some((row) => row.providerInvoiceId === 'in_failed' && row.status === 'open'));

  await service.handleWebhookEvent({
    id: 'evt_subscription_deleted',
    type: 'customer.subscription.deleted',
    livemode: false,
    data: {
      object: {
        id: 'sub_smoke',
        customer: 'cus_smoke',
        status: 'canceled',
        current_period_end: 1777650000,
        items: { data: [{ price: { id: 'price_smoke' } }] }
      }
    }
  });
  assert.strictEqual((await repository.getWorkspaceBillingProfile(workspaceId)).stripeSubscriptionStatus, 'canceled');
  assert.strictEqual(db.__lastWorkspaceStatus, 'suspended');

  let missingConfigBlocked = false;
  try {
    await service.createCheckoutSession({ workspaceId, plan: 'starter' });
  } catch (err) {
    missingConfigBlocked = err.statusCode === 503 && /Stripe is not configured/i.test(err.message);
  }
  assert.ok(missingConfigBlocked, 'checkout should fail cleanly when Stripe is not configured');

  const eventCount = db.prepare('SELECT COUNT(*) AS count FROM billing_provider_events WHERE provider = ?').get('stripe').count;
  assert.ok(eventCount >= 2, 'provider events should be recorded');
  db.close();
  console.log('[stripe-billing-smoke] passed');
}

main().catch((err) => {
  console.error('[stripe-billing-smoke] failed:', err?.message || err);
  process.exit(1);
});
