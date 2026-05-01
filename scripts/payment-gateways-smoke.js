#!/usr/bin/env node
'use strict';

const assert = require('assert');
const crypto = require('crypto');
const os = require('os');
const path = require('path');
const express = require('express');
const Database = require('better-sqlite3');
const { createPlatformSecretsService } = require('../server/services/platformSecrets.service');
const { createPaymentGatewaySecretsService } = require('../server/services/paymentGatewaySecrets.service');
const { createAdminPaymentGatewaysRouter } = require('../server/routes/admin.paymentGateways.routes');

const runId = `payment_gateways_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
const sqlitePath = path.join(os.tmpdir(), `${runId}.sqlite`);
const masterKey = crypto.randomBytes(32).toString('hex');
const rawStripeSecret = `sk_test_${crypto.randomBytes(12).toString('hex')}`;
const rawWebhookSecret = `whsec_${crypto.randomBytes(12).toString('hex')}`;
const rotatedStripeSecret = `sk_test_rotated_${crypto.randomBytes(8).toString('hex')}`;

function createSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS platform_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS platform_secrets (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      key_name TEXT NOT NULL,
      encrypted_value TEXT NOT NULL,
      iv TEXT NOT NULL,
      auth_tag TEXT NOT NULL,
      value_hash TEXT,
      masked_value TEXT,
      enabled INTEGER DEFAULT 1,
      environment TEXT DEFAULT 'production',
      last_test_status TEXT,
      last_test_message TEXT,
      last_tested_at TEXT,
      rotated_at TEXT,
      updated_by TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(provider, key_name, environment)
    );
    CREATE TABLE IF NOT EXISTS platform_secret_audit (
      id TEXT PRIMARY KEY,
      provider TEXT,
      key_name TEXT,
      environment TEXT,
      action TEXT,
      actor_user_id TEXT,
      ip_address TEXT,
      user_agent TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

function makeApp(db, auditRows) {
  const app = express();
  app.use((req, _res, next) => {
    const role = String(req.headers['x-role'] || '').trim().toLowerCase();
    if (role) {
      req.auth = {
        id: role === 'super_admin' ? 'super_smoke' : 'admin_smoke',
        role,
        superAdmin: role === 'super_admin',
        mfaVerified: req.headers['x-mfa'] === '1'
      };
    }
    next();
  });
  app.use('/api/admin/payment-gateways', (req, res, next) => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && req.headers['x-csrf-token'] !== 'csrf-smoke') {
      return res.status(403).json({ error: 'csrf required' });
    }
    return next();
  });

  const platformSecretsService = createPlatformSecretsService({
    db,
    masterKey,
    env: {},
    writeAudit: (action, meta) => auditRows.push({ action, meta })
  });
  const paymentGatewaySecretsService = createPaymentGatewaySecretsService({
    db,
    platformSecretsService,
    env: { PAYMENT_GATEWAY_SKIP_NETWORK_TEST: 'true' }
  });

  const authRequired = (req, res, next) => {
    if (!req.auth) return res.status(401).json({ error: 'unauthorized' });
    return next();
  };
  const requireSuperAdmin = (req, res) => {
    if (!req.auth || req.auth.role !== 'super_admin') {
      res.status(403).json({ error: 'super_admin required' });
      return null;
    }
    if (!req.auth.mfaVerified) {
      res.status(403).json({ error: 'MFA required' });
      return null;
    }
    return req.auth;
  };

  app.use('/api/admin/payment-gateways', createAdminPaymentGatewaysRouter({
    service: paymentGatewaySecretsService,
    authRequired,
    requireSuperAdmin,
    auditAction(action, req, meta = {}) {
      auditRows.push({ action, actor: req.auth?.id || null, meta });
    }
  }));
  return app;
}

async function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      resolve({ server, baseUrl: `http://127.0.0.1:${server.address().port}` });
    });
  });
}

async function request(baseUrl, method, route, { role = 'super_admin', mfa = true, csrf = true, body = undefined, expectedStatus = 200 } = {}) {
  const headers = { 'x-role': role };
  if (mfa) headers['x-mfa'] = '1';
  if (csrf) headers['x-csrf-token'] = 'csrf-smoke';
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  assert.strictEqual(response.status, expectedStatus, `${method} ${route} expected ${expectedStatus}, got ${response.status}: ${text}`);
  return data;
}

function assertNoSecrets(payload) {
  const text = JSON.stringify(payload);
  assert.ok(!text.includes(rawStripeSecret), 'response exposed raw Stripe secret');
  assert.ok(!text.includes(rawWebhookSecret), 'response exposed raw webhook secret');
  assert.ok(!text.includes(rotatedStripeSecret), 'response exposed rotated Stripe secret');
}

async function main() {
  const db = new Database(sqlitePath);
  const auditRows = [];
  createSchema(db);
  const { server, baseUrl } = await listen(makeApp(db, auditRows));

  try {
    await request(baseUrl, 'GET', '/api/admin/payment-gateways', { role: 'school_admin', expectedStatus: 403 });
    await request(baseUrl, 'GET', '/api/admin/payment-gateways', { mfa: false, expectedStatus: 403 });
    await request(baseUrl, 'POST', '/api/admin/payment-gateways/stripe', { csrf: false, body: {}, expectedStatus: 403 });

    const initial = await request(baseUrl, 'GET', '/api/admin/payment-gateways');
    assertNoSecrets(initial);

    const saved = await request(baseUrl, 'POST', '/api/admin/payment-gateways/stripe', {
      body: {
        enabled: true,
        mode: 'test',
        STRIPE_PUBLIC_KEY: 'pk_test_public_smoke',
        STRIPE_SECRET_KEY: rawStripeSecret,
        STRIPE_WEBHOOK_SECRET: rawWebhookSecret,
        STRIPE_PRICE_STARTER: 'price_starter_smoke'
      }
    });
    assert.strictEqual(saved.provider, 'stripe');
    assert.ok(saved.fields.some((field) => field.keyName === 'STRIPE_SECRET_KEY' && field.configured && field.maskedValue));
    assertNoSecrets(saved);

    const status = await request(baseUrl, 'GET', '/api/admin/payment-gateways');
    assert.strictEqual(status.activeProvider, 'stripe');
    assert.ok(status.providers.some((provider) => provider.provider === 'stripe' && provider.enabled));
    assertNoSecrets(status);

    const tested = await request(baseUrl, 'POST', '/api/admin/payment-gateways/stripe/test', { body: { environment: 'test' } });
    assert.strictEqual(tested.provider, 'stripe');
    assert.ok(['ok', 'failed'].includes(tested.status));
    assertNoSecrets(tested);

    const rotated = await request(baseUrl, 'POST', '/api/admin/payment-gateways/stripe/rotate', {
      body: { keyName: 'STRIPE_SECRET_KEY', value: rotatedStripeSecret, environment: 'test' }
    });
    assert.strictEqual(rotated.keyName, 'STRIPE_SECRET_KEY');
    assertNoSecrets(rotated);

    const deleted = await request(baseUrl, 'DELETE', '/api/admin/payment-gateways/stripe/STRIPE_WEBHOOK_SECRET?environment=test');
    assert.strictEqual(deleted.ok, true);

    const active = await request(baseUrl, 'POST', '/api/admin/payment-gateways/active-provider', { body: { provider: 'stripe' } });
    assert.strictEqual(active.activeProvider, 'stripe');

    const events = await request(baseUrl, 'GET', '/api/admin/payment-gateways/events');
    assert.ok(Array.isArray(events.rows));
    assert.ok(events.rows.length >= 4, 'expected provider events');
    assertNoSecrets(events);

    await request(baseUrl, 'POST', '/api/admin/payment-gateways/notreal', { body: {}, expectedStatus: 400 });
    assert.ok(auditRows.some((row) => row.action === 'payment_gateway.saved'));

    console.log('[payment-gateways-smoke] passed');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    db.close();
  }
}

main().catch((error) => {
  console.error('[payment-gateways-smoke] failed:', error);
  process.exit(1);
});
