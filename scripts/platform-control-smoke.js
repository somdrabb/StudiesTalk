#!/usr/bin/env node
'use strict';

const assert = require('assert');
const crypto = require('crypto');
const os = require('os');
const path = require('path');
const express = require('express');
const Database = require('better-sqlite3');
const { createPlatformControlService } = require('../server/services/platformControl.service');
const { createPlatformControlRouter } = require('../server/routes/platformControl.routes');

const runId = `platform_control_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
const sqlitePath = path.join(os.tmpdir(), `${runId}.sqlite`);
const ids = {
  workspaceAlpha: `ws_alpha_${runId}`,
  workspaceBeta: `ws_beta_${runId}`
};

function createSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS platform_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT ''
    );
  `);
  db.prepare(`INSERT INTO workspaces (id, name) VALUES (?, ?), (?, ?)`)
    .run(ids.workspaceAlpha, 'Alpha School', ids.workspaceBeta, 'Beta School');
}

async function startApp(db, platformControlService, auditRows) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const role = String(req.headers['x-role'] || '').trim().toLowerCase();
    if (!role) return next();
    req.auth = {
      id: role === 'super_admin' ? 'super_1' : 'admin_1',
      role,
      superAdmin: role === 'super_admin',
      workspaceId: ids.workspaceAlpha
    };
    req.ctx = {
      ip: '127.0.0.1',
      ua: 'platform-control-smoke',
      at: Date.now(),
      userId: req.auth.id,
      role: req.auth.role,
      workspaceId: req.auth.workspaceId
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

  app.use('/api/admin/platform-control', createPlatformControlRouter({
    db,
    platformControlService,
    authRequired,
    requireSuperAdmin,
    auditAction(action, req, meta = {}) {
      auditRows.push({
        action,
        userId: req.auth?.id || null,
        role: req.auth?.role || null,
        workspaceId: meta.workspaceId || null,
        target: meta.target || null
      });
    }
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

async function request(baseUrl, role, method, route, body, expectedStatus = 200) {
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-role': role
    },
    body: body == null ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
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

  const platformControlService = createPlatformControlService({ db });
  await platformControlService.ensureSchema();

  const auditRows = [];
  const { server, baseUrl } = await startApp(db, platformControlService, auditRows);

  try {
    const globalInitial = await request(baseUrl, 'super_admin', 'GET', '/api/admin/platform-control/global');
    assert.strictEqual(globalInitial.settings.workspaceDefaults.maxUsersPerWorkspace, 50);

    await request(baseUrl, 'school_admin', 'GET', '/api/admin/platform-control/global', null, 403);
    await request(baseUrl, 'school_admin', 'PATCH', '/api/admin/platform-control/global', {
      settings: { features: { aiEnabled: false } }
    }, 403);

    const updatedGlobal = await request(baseUrl, 'super_admin', 'PATCH', '/api/admin/platform-control/global', {
      settings: {
        workspaceDefaults: {
          defaultAiBudgetEur: 9,
          maxUsersPerWorkspace: 120
        },
        features: {
          aiEnabled: true,
          liveClassesEnabled: false
        },
        communication: {
          maxOtpPerUserPerDay: 7
        }
      }
    });
    assert.strictEqual(updatedGlobal.row.settings.workspaceDefaults.defaultAiBudgetEur, 9);
    assert.strictEqual(updatedGlobal.row.settings.features.liveClassesEnabled, false);

    await request(baseUrl, 'super_admin', 'PATCH', '/api/admin/platform-control/global', {
      settings: {
        storage: {
          allowedTypes: []
        }
      }
    }, 400);

    const workspaceOverride = await request(baseUrl, 'super_admin', 'PATCH', `/api/admin/platform-control/workspaces/${ids.workspaceAlpha}`, {
      settings: {
        features: {
          aiEnabled: false
        },
        providerLimits: {
          openai: {
            enabled: false,
            monthlyLimitEur: 2
          }
        },
        subscriptions: {
          defaultPlan: 'professional'
        }
      }
    });
    assert.strictEqual(workspaceOverride.row.settings.features.aiEnabled, false);

    const effective = await request(baseUrl, 'super_admin', 'GET', `/api/admin/platform-control/effective/${ids.workspaceAlpha}`);
    assert.strictEqual(effective.settings.workspaceDefaults.defaultAiBudgetEur, 9);
    assert.strictEqual(effective.settings.features.aiEnabled, false);
    assert.strictEqual(effective.settings.features.liveClassesEnabled, false);
    assert.strictEqual(effective.settings.providerLimits.openai.enabled, false);
    assert.strictEqual(effective.settings.subscriptions.defaultPlan, 'professional');

    const features = await request(baseUrl, 'super_admin', 'GET', `/api/admin/platform-control/features/${ids.workspaceAlpha}`);
    assert.strictEqual(features.features.aiEnabled, false);
    assert.strictEqual(features.features.liveClassesEnabled, false);

    const providers = await request(baseUrl, 'super_admin', 'GET', `/api/admin/platform-control/providers/${ids.workspaceAlpha}`);
    assert.strictEqual(providers.providerLimits.openai.monthlyLimitEur, 2);

    const plans = await request(baseUrl, 'super_admin', 'GET', '/api/admin/platform-control/subscription-plans');
    assert.ok(plans.plans.starter);
    assert.strictEqual(plans.defaultPlan, 'starter');

    const directFeature = await platformControlService.isFeatureEnabled(ids.workspaceAlpha, 'aiEnabled');
    assert.strictEqual(directFeature, false);
    const directProvider = await platformControlService.getProviderLimit(ids.workspaceAlpha, 'openai');
    assert.strictEqual(directProvider.monthlyLimitEur, 2);
    const directPlan = await platformControlService.getSubscriptionPlan('professional', ids.workspaceAlpha);
    assert.strictEqual(directPlan.maxUsers, 200);

    const globalAfter = await request(baseUrl, 'super_admin', 'GET', '/api/admin/platform-control/global');
    const responseString = JSON.stringify(globalAfter);
    assert.ok(!responseString.includes('OPENAI_API_KEY'));
    assert.ok(!responseString.includes('TWILIO_AUTH_TOKEN'));
    assert.ok(!responseString.includes('SMTP_PASS'));

    const resetResult = await request(baseUrl, 'super_admin', 'DELETE', `/api/admin/platform-control/workspaces/${ids.workspaceAlpha}`);
    assert.strictEqual(resetResult.ok, true);
    const effectiveAfterReset = await request(baseUrl, 'super_admin', 'GET', `/api/admin/platform-control/effective/${ids.workspaceAlpha}`);
    assert.strictEqual(effectiveAfterReset.settings.features.aiEnabled, true);
    assert.strictEqual(effectiveAfterReset.settings.subscriptions.defaultPlan, 'starter');

    assert.ok(auditRows.some((row) => row.action === 'platform_control.global.update'));
    assert.ok(auditRows.some((row) => row.action === 'platform_control.workspace.update'));
    assert.ok(auditRows.some((row) => row.action === 'platform_control.workspace.reset'));

    console.log('[platform-control-smoke] ok');
  } finally {
    await stopServer(server);
    db.close();
  }
}

main().catch((error) => {
  console.error('[platform-control-smoke] failed:', error?.stack || error?.message || error);
  process.exit(1);
});
