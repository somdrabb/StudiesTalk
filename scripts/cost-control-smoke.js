#!/usr/bin/env node
'use strict';

const assert = require('assert');
const crypto = require('crypto');
const os = require('os');
const path = require('path');
const express = require('express');
const Database = require('better-sqlite3');
const { createCostControlService } = require('../server/services/costControl.service');
const { createAdminCostControlRouter } = require('../server/routes/admin.costControl.routes');

const runId = `cost_control_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
const sqlitePath = path.join(os.tmpdir(), `${runId}.sqlite`);
const ids = {
  wsAlpha: `ws_alpha_${runId}`,
  wsBeta: `ws_beta_${runId}`
};

let clock = new Date('2026-04-29T10:00:00.000Z');

function now() {
  return new Date(clock);
}

function setClock(value) {
  clock = new Date(value);
}

function createSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS provider_catalog (
      id TEXT PRIMARY KEY,
      provider_key TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL,
      category TEXT,
      unit_name TEXT,
      default_unit_cost_eur REAL DEFAULT 0,
      active INTEGER DEFAULT 1,
      created_at TEXT,
      updated_at TEXT
    );
    CREATE TABLE IF NOT EXISTS workspace_provider_limits (
      id TEXT PRIMARY KEY,
      workspace_id TEXT,
      provider_key TEXT NOT NULL,
      period TEXT NOT NULL DEFAULT 'monthly',
      hard_limit_eur REAL,
      soft_limit_eur REAL,
      unit_limit REAL,
      enabled INTEGER DEFAULT 1,
      created_at TEXT,
      updated_at TEXT,
      UNIQUE(workspace_id, provider_key, period)
    );
    CREATE TABLE IF NOT EXISTS usage_ledger (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      provider_key TEXT NOT NULL,
      feature_key TEXT,
      units REAL DEFAULT 0,
      unit_name TEXT,
      unit_cost_eur REAL DEFAULT 0,
      cost_eur REAL DEFAULT 0,
      metadata_json TEXT,
      created_at TEXT
    );
    CREATE TABLE IF NOT EXISTS workspace_subscriptions (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      plan_key TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      monthly_price_eur REAL DEFAULT 0,
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT,
      current_period_start TEXT,
      current_period_end TEXT,
      created_at TEXT,
      updated_at TEXT
    );
    CREATE TABLE IF NOT EXISTS cost_alerts (
      id TEXT PRIMARY KEY,
      workspace_id TEXT,
      provider_key TEXT,
      alert_type TEXT NOT NULL,
      period TEXT NOT NULL,
      threshold_eur REAL,
      current_cost_eur REAL,
      acknowledged INTEGER DEFAULT 0,
      created_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_usage_ledger_workspace_provider_created ON usage_ledger(workspace_id, provider_key, created_at);
    CREATE INDEX IF NOT EXISTS idx_usage_ledger_provider_created ON usage_ledger(provider_key, created_at);
    CREATE INDEX IF NOT EXISTS idx_usage_ledger_workspace_created ON usage_ledger(workspace_id, created_at);
  `);
  db.prepare(`INSERT INTO workspaces (id, name) VALUES (?, ?), (?, ?)`)
    .run(ids.wsAlpha, 'Alpha School', ids.wsBeta, 'Beta School');
}

async function startApp(db, costControlService) {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    const role = String(req.headers['x-role'] || '').trim().toLowerCase();
    if (!role) return next();
    req.auth = {
      id: role === 'super_admin' ? 'super_1' : 'admin_1',
      role,
      superAdmin: role === 'super_admin',
      workspaceId: ids.wsAlpha
    };
    return next();
  });

  const authRequired = (req, res, next) => {
    if (!req.auth) return res.status(401).json({ error: 'unauthorized' });
    return next();
  };
  const requireSuperAdmin = (req, res) => {
    if (!req.auth || String(req.auth.role || '').toLowerCase() !== 'super_admin') {
      res.status(403).json({ error: 'forbidden' });
      return null;
    }
    return req.auth;
  };

  app.use('/api/admin/cost-control', createAdminCostControlRouter({
    db,
    costControlService,
    authRequired,
    requireSuperAdmin
  }));

  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({
        server,
        baseUrl: `http://127.0.0.1:${address.port}`
      });
    });
  });
}

async function stopServer(server) {
  await new Promise((resolve) => server.close(resolve));
}

async function request(baseUrl, role, method, route, body, expectedStatus = 200, parseJson = true) {
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-role': role
    },
    body: body == null ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  const data = parseJson ? (text ? JSON.parse(text) : null) : text;
  assert.strictEqual(
    response.status,
    expectedStatus,
    `${method} ${route} expected ${expectedStatus}, got ${response.status}: ${text}`
  );
  return data;
}

async function main() {
  const db = new Database(sqlitePath);
  createSchema(db);

  const costControlService = createCostControlService({ db, now });
  await costControlService.seedProviderCatalog();

  await costControlService.setWorkspaceProviderLimit({
    workspaceId: null,
    providerKey: 'openai',
    period: 'monthly',
    softLimitEur: 4,
    hardLimitEur: 5
  });
  await costControlService.setWorkspaceProviderLimit({
    workspaceId: ids.wsAlpha,
    providerKey: 'openai',
    period: 'monthly',
    softLimitEur: 1.5,
    hardLimitEur: 2
  });

  setClock('2026-04-29T09:00:00.000Z');
  await costControlService.recordUsage({
    workspaceId: ids.wsAlpha,
    providerKey: 'openai',
    featureKey: 'ai_chat',
    units: 1600,
    unitName: 'tokens',
    costEur: 1.6
  });
  await costControlService.recordUsage({
    workspaceId: ids.wsAlpha,
    providerKey: 'twilio',
    featureKey: 'sms_otp',
    units: 1,
    unitName: 'sms',
    costEur: 0.2
  });

  setClock('2026-04-28T12:00:00.000Z');
  await costControlService.recordUsage({
    workspaceId: ids.wsBeta,
    providerKey: 'openai',
    featureKey: 'ai_voice',
    units: 45,
    unitName: 'seconds',
    costEur: 1.1
  });

  setClock('2026-01-10T15:00:00.000Z');
  await costControlService.recordUsage({
    workspaceId: ids.wsBeta,
    providerKey: 'google_translate',
    featureKey: 'message_translation',
    units: 2500,
    unitName: 'characters',
    costEur: 0.4
  });

  setClock('2026-04-29T10:00:00.000Z');

  const alphaDailyOpenAi = await costControlService.getUsageSummary({
    workspaceId: ids.wsAlpha,
    providerKey: 'openai',
    period: 'daily'
  });
  assert.strictEqual(alphaDailyOpenAi.total_cost_eur, 1.6);

  const alphaMonthlyOpenAi = await costControlService.getUsageSummary({
    workspaceId: ids.wsAlpha,
    providerKey: 'openai',
    period: 'monthly'
  });
  assert.strictEqual(alphaMonthlyOpenAi.total_cost_eur, 1.6);

  const betaYearlyTranslate = await costControlService.getUsageSummary({
    workspaceId: ids.wsBeta,
    providerKey: 'google_translate',
    period: 'yearly'
  });
  assert.strictEqual(betaYearlyTranslate.total_cost_eur, 0.4);

  const softCheck = await costControlService.canUseProvider({
    workspaceId: ids.wsAlpha,
    providerKey: 'openai',
    estimatedCostEur: 0.1
  });
  assert.strictEqual(softCheck.allowed, true);
  assert.strictEqual(softCheck.alert_created, true);

  let hardBlocked = false;
  try {
    await costControlService.enforceProviderLimit({
      workspaceId: ids.wsAlpha,
      providerKey: 'openai',
      estimatedCostEur: 0.5
    });
  } catch (error) {
    hardBlocked = true;
    assert.strictEqual(error.statusCode, 402);
    assert.strictEqual(error.payload.providerKey, 'openai');
    assert.strictEqual(error.payload.limit, 2);
  }
  assert.strictEqual(hardBlocked, true, 'hard limit should block usage');

  const overview = await costControlService.getDashboardOverview({ period: 'monthly' });
  assert.ok((overview.top_providers || []).some((row) => row.provider_key === 'openai'));

  const { server, baseUrl } = await startApp(db, costControlService);
  try {
    await request(baseUrl, 'school_admin', 'GET', '/api/admin/cost-control/overview?period=monthly', null, 403);

    const routeOverview = await request(baseUrl, 'super_admin', 'GET', '/api/admin/cost-control/overview?period=monthly');
    assert.ok(routeOverview.totals.monthly_cost_eur >= 2.9);

    const workspaceSummary = await request(baseUrl, 'super_admin', 'GET', `/api/admin/cost-control/workspaces/${encodeURIComponent(ids.wsAlpha)}/summary?period=monthly`);
    assert.strictEqual(workspaceSummary.workspace_id, ids.wsAlpha);

    const providerSummary = await request(baseUrl, 'super_admin', 'GET', '/api/admin/cost-control/providers/openai/summary?period=monthly');
    assert.strictEqual(providerSummary.provider_key, 'openai');

    const savedLimit = await request(baseUrl, 'super_admin', 'POST', '/api/admin/cost-control/limits', {
      workspaceId: ids.wsBeta,
      providerKey: 'twilio',
      period: 'daily',
      softLimitEur: 0.5,
      hardLimitEur: 1.0,
      unitLimit: 10
    });
    assert.strictEqual(savedLimit.ok, true);

    const limitsPayload = await request(baseUrl, 'super_admin', 'GET', '/api/admin/cost-control/limits');
    assert.ok((limitsPayload.rows || []).some((row) => row.provider_key === 'twilio' && row.workspace_id === ids.wsBeta));

    const alertsPayload = await request(baseUrl, 'super_admin', 'GET', '/api/admin/cost-control/alerts');
    assert.ok((alertsPayload.rows || []).length >= 2);
    const unacked = alertsPayload.rows.find((row) => !row.acknowledged);
    assert.ok(unacked);

    const ackPayload = await request(baseUrl, 'super_admin', 'POST', `/api/admin/cost-control/alerts/${encodeURIComponent(unacked.id)}/acknowledge`);
    assert.strictEqual(ackPayload.ok, true);

    const csv = await request(baseUrl, 'super_admin', 'GET', '/api/admin/cost-control/export.csv?period=monthly', null, 200, false);
    assert.ok(csv.includes('workspace_id,provider_key,total_units,total_cost_eur'));
    assert.ok(csv.includes(ids.wsAlpha));

    const twilioLimit = (limitsPayload.rows || []).find((row) => row.provider_key === 'twilio' && row.workspace_id === ids.wsBeta);
    assert.ok(twilioLimit);
    const deletePayload = await request(baseUrl, 'super_admin', 'DELETE', `/api/admin/cost-control/limits/${encodeURIComponent(twilioLimit.id)}`);
    assert.strictEqual(deletePayload.ok, true);
  } finally {
    await stopServer(server);
    db.close();
  }

  console.log('[cost-control-smoke] passed');
}

main().catch((error) => {
  console.error('[cost-control-smoke] failed:', error?.stack || error?.message || error);
  process.exit(1);
});
