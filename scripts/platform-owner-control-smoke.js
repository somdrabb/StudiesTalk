#!/usr/bin/env node
'use strict';

const assert = require('assert');
const crypto = require('crypto');
const os = require('os');
const path = require('path');
const express = require('express');
const Database = require('better-sqlite3');
const { createPlatformOwnerControlService } = require('../server/services/platformOwnerControl.service');
const { createPlatformOwnerControlRouter } = require('../server/routes/platformOwnerControl.routes');

const runId = `platform_owner_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
const sqlitePath = path.join(os.tmpdir(), `${runId}.sqlite`);
const ids = {
  workspace: `ws_${runId}`,
  superAdmin: `super_${runId}`,
  schoolAdmin: `admin_${runId}`,
  targetUser: `target_${runId}`
};

function createSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      status TEXT DEFAULT 'active'
    );
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      workspace_id TEXT,
      name TEXT,
      email TEXT,
      role TEXT
    );
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      revoked_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS platform_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS workspace_subscriptions (
      id TEXT PRIMARY KEY,
      workspace_id TEXT,
      plan_key TEXT,
      status TEXT,
      monthly_price_eur REAL,
      updated_at TEXT
    );
    CREATE TABLE IF NOT EXISTS usage_ledger (
      id TEXT PRIMARY KEY,
      workspace_id TEXT,
      provider_key TEXT,
      cost_eur REAL,
      created_at TEXT
    );
  `);
  db.prepare('INSERT INTO workspaces (id, name, status) VALUES (?, ?, ?)').run(ids.workspace, 'Owner Smoke School', 'active');
  db.prepare('INSERT INTO users (id, workspace_id, name, email, role) VALUES (?, ?, ?, ?, ?)').run(ids.superAdmin, ids.workspace, 'Super Admin', 'super@example.com', 'super_admin');
  db.prepare('INSERT INTO users (id, workspace_id, name, email, role) VALUES (?, ?, ?, ?, ?)').run(ids.schoolAdmin, ids.workspace, 'School Admin', 'admin@example.com', 'school_admin');
  db.prepare('INSERT INTO users (id, workspace_id, name, email, role) VALUES (?, ?, ?, ?, ?)').run(ids.targetUser, ids.workspace, 'Target User', 'target@example.com', 'teacher');
}

async function startApp(service, auditRows) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const role = String(req.headers['x-role'] || '').trim().toLowerCase();
    if (role) {
      req.auth = {
        id: role === 'super_admin' ? ids.superAdmin : ids.schoolAdmin,
        role,
        superAdmin: role === 'super_admin',
        workspaceId: ids.workspace
      };
    }
    next();
  });

  const authRequired = (req, res, next) => {
    if (!req.auth) return res.status(401).json({ error: 'unauthorized' });
    return next();
  };
  const requireSuperAdmin = (req, res) => {
    if (!req.auth?.superAdmin && req.auth?.role !== 'super_admin') {
      res.status(403).json({ error: 'forbidden' });
      return null;
    }
    return req.auth;
  };

  app.use('/api/admin', createPlatformOwnerControlRouter({
    service,
    authRequired,
    requireSuperAdmin,
    auditAction(action, req, meta = {}) {
      auditRows.push({
        action,
        userId: req.auth?.id || null,
        workspaceId: meta.workspaceId || null,
        target: meta.target || null
      });
    }
  }));

  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      resolve({ server, baseUrl: `http://127.0.0.1:${server.address().port}` });
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
  let data = text;
  if (parseJson) {
    data = text ? JSON.parse(text) : null;
  }
  assert.strictEqual(response.status, expectedStatus, `${method} ${route} expected ${expectedStatus}, got ${response.status}: ${text}`);
  return data;
}

async function main() {
  const db = new Database(sqlitePath);
  createSchema(db);
  const service = createPlatformOwnerControlService({
    db,
    env: {
      OPENAI_API_KEY: 'sk-test-redacted',
      STRIPE_SECRET_KEY: '',
      DB_BACKUP_DIR: 'backup'
    },
    backupDir: path.join(os.tmpdir(), `${runId}_backup`),
    storageAdapter: 'local'
  });
  await service.ensureSchema();

  const auditRows = [];
  const { server, baseUrl } = await startApp(service, auditRows);
  try {
    const overviewRoutes = [
      '/api/admin/operations/health',
      '/api/admin/backups/status',
      '/api/admin/workspaces/lifecycle',
      '/api/admin/support/impersonation/active',
      '/api/admin/incidents',
      '/api/admin/data-governance/overview',
      '/api/admin/notifications',
      '/api/admin/subscription-automation/overview',
      '/api/admin/branding',
      '/api/admin/reports/overview'
    ];
    for (const route of overviewRoutes) {
      const data = await request(baseUrl, 'super_admin', 'GET', route);
      assert.ok(data, `${route} should return data`);
      await request(baseUrl, 'school_admin', 'GET', route, null, 403);
    }

    const healthText = JSON.stringify(await request(baseUrl, 'super_admin', 'GET', '/api/admin/operations/health'));
    assert.ok(!healthText.includes('sk-test-redacted'), 'health response must not expose secret values');

    await request(baseUrl, 'super_admin', 'POST', '/api/admin/maintenance', {
      enabled: true,
      publicMessage: 'Maintenance window',
      disabledFeatures: ['uploads', 'ai']
    });
    assert.ok(auditRows.some((row) => row.action === 'platform_owner.maintenance_updated'));

    await request(baseUrl, 'super_admin', 'POST', `/api/admin/workspaces/${ids.workspace}/suspend`, { reason: 'billing failure smoke' });
    assert.strictEqual(db.prepare('SELECT status FROM workspaces WHERE id = ?').get(ids.workspace).status, 'suspended');
    await request(baseUrl, 'super_admin', 'POST', `/api/admin/workspaces/${ids.workspace}/unsuspend`, { reason: 'paid smoke' });
    assert.strictEqual(db.prepare('SELECT status FROM workspaces WHERE id = ?').get(ids.workspace).status, 'active');
    assert.ok(auditRows.some((row) => row.action === 'platform_owner.workspace_suspend'));

    const backupStatus = await request(baseUrl, 'super_admin', 'GET', '/api/admin/backups/status');
    assert.ok(backupStatus.location);
    await request(baseUrl, 'super_admin', 'POST', '/api/admin/backups/run', {});

    const notification = await request(baseUrl, 'super_admin', 'POST', '/api/admin/notifications', {
      name: 'Smoke campaign',
      subject: 'Smoke announcement',
      body: 'Smoke body',
      channels: ['email', 'in_app'],
      targetType: 'selected_workspaces',
      workspaceIds: [ids.workspace],
      priority: 'critical',
      smsToEmail: true,
      emailToInApp: true
    });
    assert.ok(notification.row.id);
    assert.strictEqual(db.prepare('SELECT COUNT(*) AS count FROM notifications_campaigns').get().count, 1);
    assert.strictEqual(db.prepare('SELECT COUNT(*) AS count FROM notifications_targets').get().count, 1);
    const notificationOverview = await request(baseUrl, 'super_admin', 'GET', '/api/admin/notifications');
    assert.ok(Array.isArray(notificationOverview.rows));
    assert.ok(Array.isArray(notificationOverview.templates));
    assert.ok(Array.isArray(notificationOverview.deliveries));
    assert.ok(Array.isArray(notificationOverview.automations));
    await request(baseUrl, 'super_admin', 'POST', `/api/admin/notifications/${notification.row.id}/send`, {});
    assert.strictEqual(db.prepare('SELECT status FROM notifications_campaigns WHERE id = ?').get(notification.row.id).status, 'completed');
    assert.ok(db.prepare('SELECT COUNT(*) AS count FROM notifications_logs WHERE campaign_id = ?').get(notification.row.id).count >= 1);
    await request(baseUrl, 'super_admin', 'POST', `/api/admin/notifications/${notification.row.id}/retry`, {});

    const exportRequest = await request(baseUrl, 'super_admin', 'POST', `/api/admin/data-governance/export/${ids.workspace}`, {
      reason: 'customer request smoke'
    });
    assert.strictEqual(exportRequest.row.request_type, 'export');

    await request(baseUrl, 'super_admin', 'POST', '/api/admin/support/impersonation/start', {
      workspaceId: ids.workspace,
      targetUserId: ids.targetUser,
      readOnly: true
    }, 400);
    const support = await request(baseUrl, 'super_admin', 'POST', '/api/admin/support/impersonation/start', {
      workspaceId: ids.workspace,
      targetUserId: ids.targetUser,
      readOnly: true,
      reason: 'teacher support smoke'
    });
    assert.strictEqual(support.row.read_only, 1);

    const branding = await request(baseUrl, 'super_admin', 'PATCH', '/api/admin/branding/platform', {
      settings: {
        platformName: 'StudiesTalk Smoke',
        supportEmail: 'support@example.com'
      }
    });
    assert.ok(branding.row.id);

    const reports = await request(baseUrl, 'super_admin', 'GET', '/api/admin/reports/overview');
    assert.ok(Array.isArray(reports.cards));
    const csv = await request(baseUrl, 'super_admin', 'GET', '/api/admin/reports/export.csv?type=cost', null, 200, false);
    assert.ok(csv.includes('Cost by provider report'));

    const serialized = JSON.stringify({
      health: healthText,
      backupStatus,
      reports,
      branding
    });
    assert.ok(!serialized.includes('TWILIO_AUTH_TOKEN'));
    assert.ok(!serialized.includes('OPENAI_API_KEY'));

    console.log('[platform-owner-control-smoke] ok');
  } finally {
    await stopServer(server);
    db.close();
  }
}

main().catch((error) => {
  console.error('[platform-owner-control-smoke] failed');
  console.error(error);
  process.exit(1);
});
