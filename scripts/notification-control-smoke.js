#!/usr/bin/env node
'use strict';

const assert = require('assert');
const crypto = require('crypto');
const os = require('os');
const path = require('path');
const express = require('express');
const Database = require('better-sqlite3');
const { createNotificationControlService } = require('../server/services/notificationControl.service');
const { createNotificationControlRouter } = require('../server/routes/notificationControl.routes');

const runId = `notification_control_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
const sqlitePath = path.join(os.tmpdir(), `${runId}.sqlite`);
const ids = {
  workspaceA: `ws_a_${runId}`,
  workspaceB: `ws_b_${runId}`,
  superAdmin: `super_${runId}`,
  schoolAdmin: `admin_${runId}`,
  teacherA: `teacher_a_${runId}`,
  studentA: `student_a_${runId}`,
  teacherB: `teacher_b_${runId}`
};

function createSchema(db) {
  db.exec(`
    CREATE TABLE workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      status TEXT DEFAULT 'active'
    );
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      workspace_id TEXT,
      name TEXT,
      email TEXT,
      role TEXT,
      phone TEXT
    );
    CREATE TABLE workspace_subscriptions (
      id TEXT PRIMARY KEY,
      workspace_id TEXT,
      plan_key TEXT,
      status TEXT
    );
  `);
  db.prepare('INSERT INTO workspaces (id, name, status) VALUES (?, ?, ?)').run(ids.workspaceA, 'Notification School A', 'active');
  db.prepare('INSERT INTO workspaces (id, name, status) VALUES (?, ?, ?)').run(ids.workspaceB, 'Notification School B', 'active');
  const insertUser = db.prepare('INSERT INTO users (id, workspace_id, name, email, role, phone) VALUES (?, ?, ?, ?, ?, ?)');
  insertUser.run(ids.superAdmin, ids.workspaceA, 'Super Admin', 'super@example.com', 'super_admin', '+15550001000');
  insertUser.run(ids.schoolAdmin, ids.workspaceA, 'School Admin', 'admin@example.com', 'school_admin', '+15550001001');
  insertUser.run(ids.teacherA, ids.workspaceA, 'Teacher A', 'teacher.a@example.com', 'teacher', '+15550001002');
  insertUser.run(ids.studentA, ids.workspaceA, 'Student A', 'student.a@example.com', 'student', '+15550001003');
  insertUser.run(ids.teacherB, ids.workspaceB, 'Teacher B', 'teacher.b@example.com', 'teacher', '+15550001004');
  db.prepare('INSERT INTO workspace_subscriptions (id, workspace_id, plan_key, status) VALUES (?, ?, ?, ?)').run(`sub_${runId}`, ids.workspaceA, 'pro', 'active');
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
        workspaceId: ids.workspaceA
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

  app.use('/api/admin/notifications-control', createNotificationControlRouter({
    notificationControlService: service,
    authRequired,
    requireSuperAdmin,
    auditAction(action, req, meta = {}) {
      auditRows.push({
        action,
        userId: req.auth?.id || null,
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
  assert.strictEqual(response.status, expectedStatus, `${method} ${route} expected ${expectedStatus}, got ${response.status}: ${text}`);
  return data;
}

async function main() {
  const db = new Database(sqlitePath);
  createSchema(db);
  const sentEmails = [];
  const sentSms = [];
  const usageRows = [];
  let smsConfigured = false;
  const service = createNotificationControlService({
    db,
    emailSender: async (message) => {
      sentEmails.push(message);
      return { ok: true, disabled: true, provider: 'disabled', messageId: `email_${sentEmails.length}` };
    },
    smsSender: async (message) => {
      if (!smsConfigured) throw new Error('Twilio credentials are not configured.');
      sentSms.push(message);
      return { ok: true, provider: 'twilio', messageId: `sms_${sentSms.length}` };
    },
    platformControlService: {
      async isFeatureEnabled(_workspaceId, _featureKey) {
        return true;
      }
    },
    costControlService: {
      async enforceProviderLimit() {
        return { allowed: true };
      },
      async recordUsage(row) {
        usageRows.push(row);
        return row;
      }
    }
  });
  await service.ensureSchema();

  const auditRows = [];
  const { server, baseUrl } = await startApp(service, auditRows);
  try {
    await request(baseUrl, 'school_admin', 'GET', '/api/admin/notifications-control/campaigns', null, 403);

    const template = await request(baseUrl, 'super_admin', 'POST', '/api/admin/notifications-control/templates', {
      name: 'Smoke template',
      channel: 'email',
      subject: 'Hello {{workspace}}',
      body: 'Hello {{name}}, this is a smoke template.'
    });
    assert.ok(template.row.id);

    const campaign = await request(baseUrl, 'super_admin', 'POST', '/api/admin/notifications-control/campaigns', {
      title: 'Smoke campaign',
      description: 'Draft-only campaign',
      channels: ['email', 'in_app'],
      priority: 'high',
      targetType: 'selected_workspaces',
      workspaceIds: [ids.workspaceA],
      subject: 'Smoke subject',
      body: 'Hello {{name}}, your workspace {{workspace}} has an update.',
      status: 'draft'
    });
    assert.ok(campaign.row.id);
    assert.ok(auditRows.some((row) => row.action === 'notification_control.campaign_created'));

    await request(baseUrl, 'school_admin', 'POST', '/api/admin/notifications-control/campaigns', {
      title: 'Forbidden',
      channels: ['in_app'],
      targetType: 'all_workspaces',
      body: 'Nope'
    }, 403);

    const estimate = await request(baseUrl, 'super_admin', 'POST', `/api/admin/notifications-control/campaigns/${campaign.row.id}/estimate`, {});
    assert.strictEqual(estimate.recipients, 4);
    assert.strictEqual(estimate.emailCost, 0.002);
    assert.strictEqual(estimate.smsCost, 0);

    const built = await request(baseUrl, 'super_admin', 'POST', `/api/admin/notifications-control/campaigns/${campaign.row.id}/build-deliveries`, {});
    assert.strictEqual(built.count, 8);
    assert.ok(auditRows.some((row) => row.action === 'notification_control.deliveries_built'));

    const stats = await request(baseUrl, 'super_admin', 'GET', `/api/admin/notifications-control/campaigns/${campaign.row.id}/stats`);
    assert.strictEqual(stats.pending, 8);
    assert.strictEqual(stats.failed, 0);

    const campaigns = await request(baseUrl, 'super_admin', 'GET', '/api/admin/notifications-control/campaigns');
    assert.ok(Array.isArray(campaigns.rows));
    assert.ok(campaigns.rows.some((row) => row.id === campaign.row.id));

    const updated = await request(baseUrl, 'super_admin', 'PATCH', `/api/admin/notifications-control/campaigns/${campaign.row.id}`, {
      title: 'Updated smoke campaign',
      channels: ['sms'],
      targetType: 'role',
      role: 'teacher',
      body: 'Short SMS body',
      status: 'scheduled',
      scheduledAt: '2026-05-02T09:00'
    });
    assert.strictEqual(updated.row.title, 'Updated smoke campaign');
    assert.strictEqual(updated.row.status, 'scheduled');

    await request(baseUrl, 'super_admin', 'POST', '/api/admin/notifications-control/campaigns', {
      title: 'Invalid SMS',
      channels: ['sms'],
      targetType: 'all_workspaces',
      body: 'x'.repeat(1001)
    }, 400);

    const deliveries = await request(baseUrl, 'super_admin', 'GET', `/api/admin/notifications-control/deliveries?campaignId=${encodeURIComponent(campaign.row.id)}&status=pending`);
    assert.strictEqual(deliveries.rows.length, 8);

    await request(baseUrl, 'school_admin', 'POST', `/api/admin/notifications-control/campaigns/${campaign.row.id}/send`, {}, 403);

    const inAppCampaign = await request(baseUrl, 'super_admin', 'POST', '/api/admin/notifications-control/campaigns', {
      title: 'In-app send',
      channels: ['in_app'],
      targetType: 'selected_workspaces',
      workspaceIds: [ids.workspaceA],
      subject: 'In-app subject',
      body: 'In-app body'
    });
    await request(baseUrl, 'super_admin', 'POST', `/api/admin/notifications-control/campaigns/${inAppCampaign.row.id}/build-deliveries`, {});
    const inAppSend = await request(baseUrl, 'super_admin', 'POST', `/api/admin/notifications-control/campaigns/${inAppCampaign.row.id}/send`, {});
    assert.strictEqual(inAppSend.processed, 4);
    assert.strictEqual(db.prepare('SELECT COUNT(*) AS count FROM platform_user_notifications WHERE title = ?').get('In-app subject').count, 4);

    const emailCampaign = await request(baseUrl, 'super_admin', 'POST', '/api/admin/notifications-control/campaigns', {
      title: 'Email send',
      channels: ['email'],
      targetType: 'selected_workspaces',
      workspaceIds: [ids.workspaceA],
      subject: 'Email subject',
      body: 'Email body'
    });
    await request(baseUrl, 'super_admin', 'POST', `/api/admin/notifications-control/campaigns/${emailCampaign.row.id}/build-deliveries`, {});
    const emailSend = await request(baseUrl, 'super_admin', 'POST', `/api/admin/notifications-control/campaigns/${emailCampaign.row.id}/send`, {});
    assert.strictEqual(emailSend.processed, 4);
    assert.strictEqual(sentEmails.length, 4);
    assert.ok(usageRows.some((row) => row.providerKey === 'ionos_email'));

    const smsCampaign = await request(baseUrl, 'super_admin', 'POST', '/api/admin/notifications-control/campaigns', {
      title: 'SMS send',
      channels: ['sms'],
      targetType: 'role',
      role: 'teacher',
      subject: 'SMS subject',
      body: 'SMS body'
    });
    await request(baseUrl, 'super_admin', 'POST', `/api/admin/notifications-control/campaigns/${smsCampaign.row.id}/build-deliveries`, {});
    const smsSend = await request(baseUrl, 'super_admin', 'POST', `/api/admin/notifications-control/campaigns/${smsCampaign.row.id}/send`, {});
    assert.strictEqual(smsSend.processed, 2);
    assert.strictEqual(smsSend.status, 'failed');
    const failedSms = await request(baseUrl, 'super_admin', 'GET', `/api/admin/notifications-control/deliveries?campaignId=${encodeURIComponent(smsCampaign.row.id)}&status=failed`);
    assert.strictEqual(failedSms.rows.length, 2);
    assert.ok(String(failedSms.rows[0].error_message || '').includes('Twilio credentials are not configured'));
    smsConfigured = true;
    const retry = await request(baseUrl, 'super_admin', 'POST', `/api/admin/notifications-control/deliveries/${failedSms.rows[0].id}/retry`, {});
    assert.ok(['sent', 'delivered'].includes(retry.delivery.status));
    assert.strictEqual(sentSms.length, 1);

    const cancelCampaign = await request(baseUrl, 'super_admin', 'POST', '/api/admin/notifications-control/campaigns', {
      title: 'Cancel campaign',
      channels: ['in_app'],
      targetType: 'selected_workspaces',
      workspaceIds: [ids.workspaceA],
      body: 'Cancel body'
    });
    await request(baseUrl, 'super_admin', 'POST', `/api/admin/notifications-control/campaigns/${cancelCampaign.row.id}/build-deliveries`, {});
    const cancelled = await request(baseUrl, 'super_admin', 'POST', `/api/admin/notifications-control/campaigns/${cancelCampaign.row.id}/cancel`, {});
    assert.strictEqual(cancelled.row.status, 'cancelled');

    const templates = await request(baseUrl, 'super_admin', 'GET', '/api/admin/notifications-control/templates');
    assert.ok(Array.isArray(templates.rows));

    await request(baseUrl, 'school_admin', 'POST', '/api/admin/notifications-control/automation-rules', {
      name: 'Forbidden automation',
      triggerKey: 'ai_budget_80',
      channels: ['in_app']
    }, 403);

    const automationRule = await request(baseUrl, 'super_admin', 'POST', '/api/admin/notifications-control/automation-rules', {
      name: 'AI budget warning',
      triggerKey: 'ai_budget_80',
      channels: ['in_app', 'email'],
      targetType: 'selected_workspaces',
      workspaceIds: [ids.workspaceA],
      templateId: template.row.id,
      enabled: true,
      cooldownMinutes: 60
    });
    assert.ok(automationRule.row.id);
    assert.strictEqual(automationRule.row.trigger_key, 'ai_budget_80');
    assert.ok(auditRows.some((row) => row.action === 'notification_control.automation_rule_created'));

    const automationList = await request(baseUrl, 'super_admin', 'GET', '/api/admin/notifications-control/automation-rules');
    assert.ok(automationList.rows.some((row) => row.id === automationRule.row.id));

    const automationTest = await request(baseUrl, 'super_admin', 'POST', `/api/admin/notifications-control/automation-rules/${automationRule.row.id}/test`, {});
    assert.strictEqual(automationTest.ok, true);
    assert.strictEqual(automationTest.result.matched, true);
    assert.strictEqual(automationTest.result.dryRunOnly, true);

    const automationUpdated = await request(baseUrl, 'super_admin', 'PATCH', `/api/admin/notifications-control/automation-rules/${automationRule.row.id}`, {
      enabled: false,
      cooldownMinutes: 120
    });
    assert.strictEqual(automationUpdated.row.enabled, 0);
    assert.strictEqual(automationUpdated.row.cooldown_minutes, 120);

    const automationAfterRun = await request(baseUrl, 'super_admin', 'GET', '/api/admin/notifications-control/automation-rules');
    assert.ok(automationAfterRun.runs.some((row) => row.rule_id === automationRule.row.id && row.status === 'matched'));

    await request(baseUrl, 'super_admin', 'DELETE', `/api/admin/notifications-control/automation-rules/${automationRule.row.id}`, {});
    const automationAfterDelete = await request(baseUrl, 'super_admin', 'GET', '/api/admin/notifications-control/automation-rules');
    assert.ok(!automationAfterDelete.rows.some((row) => row.id === automationRule.row.id));

    const serialized = JSON.stringify({ campaigns, stats, deliveries, templates, automationList, automationTest });
    assert.ok(!serialized.includes('TWILIO_AUTH_TOKEN'));
    assert.ok(!serialized.includes('OPENAI_API_KEY'));
    assert.ok(!serialized.includes('sk-'));

    console.log('[notification-control-smoke] ok');
  } finally {
    await stopServer(server);
    db.close();
  }
}

main().catch((error) => {
  console.error('[notification-control-smoke] failed');
  console.error(error);
  process.exit(1);
});
