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
    CREATE TABLE workspace_email_logs (
      id TEXT PRIMARY KEY,
      workspace_id TEXT,
      sent_by_user_id TEXT,
      to_email TEXT NOT NULL,
      to_name TEXT,
      from_email TEXT,
      subject TEXT,
      body_text TEXT,
      body_html TEXT,
      type TEXT DEFAULT 'test',
      status TEXT DEFAULT 'sent',
      error_message TEXT,
      message_id TEXT DEFAULT '',
      direction TEXT,
      provider_key TEXT,
      metadata_json TEXT,
      created_at TEXT
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
      },
      async getEffectiveSettings() {
        return {
          features: { emailEnabled: true, smsEnabled: true },
          communication: { emailEnabled: true, smsEnabled: true },
          providerLimits: { ionosEmail: { enabled: true }, twilio: { enabled: true } }
        };
      },
      async getProviderLimit(_workspaceId, providerKey) {
        return providerKey === 'ionosEmail' || providerKey === 'twilio' ? { enabled: true } : { enabled: true };
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
    assert.strictEqual(stats.emailPending, 4);
    assert.strictEqual(stats.emailSent, 0);
    assert.strictEqual(stats.emailFailed, 0);

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
    const inAppSend = await request(baseUrl, 'super_admin', 'POST', `/api/admin/notifications-control/campaigns/${inAppCampaign.row.id}/send-in-app`, {});
    assert.strictEqual(inAppSend.processed, 4);
    assert.strictEqual(inAppSend.status, 'completed');
    assert.ok(inAppSend.results.every((row) => row.status === 'sent'));
    assert.strictEqual(db.prepare('SELECT COUNT(*) AS count FROM platform_user_notifications WHERE title = ?').get('In-app subject').count, 4);
    assert.ok(auditRows.some((row) => row.action === 'notification_control.campaign_send_in_app'));
    const inAppSendAgain = await request(baseUrl, 'super_admin', 'POST', `/api/admin/notifications-control/campaigns/${inAppCampaign.row.id}/send-in-app`, {});
    assert.strictEqual(inAppSendAgain.processed, 0);
    assert.strictEqual(db.prepare('SELECT COUNT(*) AS count FROM platform_user_notifications WHERE title = ?').get('In-app subject').count, 4);

    const mixedCampaign = await request(baseUrl, 'super_admin', 'POST', '/api/admin/notifications-control/campaigns', {
      title: 'Mixed in-app only send',
      channels: ['email', 'sms', 'in_app'],
      targetType: 'selected_workspaces',
      workspaceIds: [ids.workspaceA],
      subject: 'Mixed subject',
      body: 'Mixed body'
    });
    await request(baseUrl, 'super_admin', 'POST', `/api/admin/notifications-control/campaigns/${mixedCampaign.row.id}/build-deliveries`, {});
    const mixedSend = await request(baseUrl, 'super_admin', 'POST', `/api/admin/notifications-control/campaigns/${mixedCampaign.row.id}/send-in-app`, {});
    assert.strictEqual(mixedSend.processed, 4);
    assert.strictEqual(mixedSend.status, 'sending');
    assert.strictEqual(sentEmails.length, 0);
    assert.strictEqual(sentSms.length, 0);
    assert.strictEqual(usageRows.length, 0);
    const mixedPendingEmail = await request(baseUrl, 'super_admin', 'GET', `/api/admin/notifications-control/deliveries?campaignId=${encodeURIComponent(mixedCampaign.row.id)}&status=pending`);
    assert.strictEqual(mixedPendingEmail.rows.filter((row) => row.channel === 'email').length, 4);
    assert.strictEqual(mixedPendingEmail.rows.filter((row) => row.channel === 'sms').length, 4);

    const emailCampaign = await request(baseUrl, 'super_admin', 'POST', '/api/admin/notifications-control/campaigns', {
      title: 'Email send',
      channels: ['email'],
      targetType: 'selected_workspaces',
      workspaceIds: [ids.workspaceA],
      subject: 'Email subject',
      body: 'Email body'
    });
    await request(baseUrl, 'super_admin', 'POST', `/api/admin/notifications-control/campaigns/${emailCampaign.row.id}/build-deliveries`, {});
    await request(baseUrl, 'school_admin', 'POST', `/api/admin/notifications-control/campaigns/${emailCampaign.row.id}/send-email`, {}, 403);
    const emailPending = await request(baseUrl, 'super_admin', 'GET', `/api/admin/notifications-control/deliveries?campaignId=${encodeURIComponent(emailCampaign.row.id)}&status=pending&channel=email`);
    assert.strictEqual(emailPending.rows.length, 4);
    await request(baseUrl, 'school_admin', 'POST', `/api/admin/notifications-control/deliveries/${emailPending.rows[0].id}/retry-email`, {}, 403);
    const emailSend = await request(baseUrl, 'super_admin', 'POST', `/api/admin/notifications-control/campaigns/${emailCampaign.row.id}/send-email`, {});
    assert.strictEqual(emailSend.processed, 4);
    assert.strictEqual(emailSend.status, 'completed');
    assert.ok(emailSend.results.every((row) => row.status === 'sent'));
    assert.strictEqual(sentEmails.length, 4);
    assert.strictEqual(sentSms.length, 0);
    assert.ok(usageRows.filter((row) => row.providerKey === 'ionos_email').length >= 4);
    const emailStats = await request(baseUrl, 'super_admin', 'GET', `/api/admin/notifications-control/campaigns/${emailCampaign.row.id}/stats`);
    assert.strictEqual(emailStats.emailPending, 0);
    assert.strictEqual(emailStats.emailSent, 4);
    assert.strictEqual(emailStats.emailFailed, 0);
    assert.strictEqual(db.prepare('SELECT COUNT(*) AS count FROM workspace_email_logs WHERE type = ? AND status = ?').get('notification_control', 'sent').count, 4);
    assert.ok(db.prepare("SELECT COUNT(*) AS count FROM notification_events WHERE event_type = 'delivery.sent'").get().count >= 8);
    assert.ok(auditRows.some((row) => row.action === 'notification_control.campaign_send_email'));
    const sentEmailDeliveries = await request(baseUrl, 'super_admin', 'GET', `/api/admin/notifications-control/deliveries?campaignId=${encodeURIComponent(emailCampaign.row.id)}&status=sent&channel=email`);
    const retryEmailAgain = await request(baseUrl, 'super_admin', 'POST', `/api/admin/notifications-control/deliveries/${sentEmailDeliveries.rows[0].id}/retry-email`, {});
    assert.strictEqual(retryEmailAgain.skipped, true);
    assert.strictEqual(retryEmailAgain.reason, 'already_sent');
    assert.strictEqual(sentEmails.length, 4);
    assert.ok(auditRows.some((row) => row.action === 'notification_control.delivery_retry_email'));

    const mixedEmailSend = await request(baseUrl, 'super_admin', 'POST', `/api/admin/notifications-control/campaigns/${mixedCampaign.row.id}/send-email`, {});
    assert.strictEqual(mixedEmailSend.processed, 4);
    assert.strictEqual(sentEmails.length, 8);
    assert.strictEqual(sentSms.length, 0);
    const mixedPendingAfterEmail = await request(baseUrl, 'super_admin', 'GET', `/api/admin/notifications-control/deliveries?campaignId=${encodeURIComponent(mixedCampaign.row.id)}&status=pending`);
    assert.strictEqual(mixedPendingAfterEmail.rows.filter((row) => row.channel === 'email').length, 0);
    assert.strictEqual(mixedPendingAfterEmail.rows.filter((row) => row.channel === 'sms').length, 4);

    const smsCampaign = await request(baseUrl, 'super_admin', 'POST', '/api/admin/notifications-control/campaigns', {
      title: 'SMS send',
      channels: ['sms'],
      targetType: 'selected_workspaces',
      workspaceIds: [ids.workspaceA],
      subject: 'SMS subject',
      body: 'SMS body'
    });
    await request(baseUrl, 'super_admin', 'POST', `/api/admin/notifications-control/campaigns/${smsCampaign.row.id}/build-deliveries`, {});
    await request(baseUrl, 'school_admin', 'POST', `/api/admin/notifications-control/campaigns/${smsCampaign.row.id}/send-sms`, { dryRun: true }, 403);
    const smsPending = await request(baseUrl, 'super_admin', 'GET', `/api/admin/notifications-control/deliveries?campaignId=${encodeURIComponent(smsCampaign.row.id)}&status=pending&channel=sms`);
    assert.strictEqual(smsPending.rows.length, 4);
    await request(baseUrl, 'school_admin', 'POST', `/api/admin/notifications-control/deliveries/${smsPending.rows[0].id}/retry-sms`, { dryRun: true }, 403);
    const smsDryRun = await request(baseUrl, 'super_admin', 'POST', `/api/admin/notifications-control/campaigns/${smsCampaign.row.id}/send-sms`, { dryRun: true });
    assert.strictEqual(smsDryRun.processed, 4);
    assert.strictEqual(smsDryRun.dryRun, true);
    assert.strictEqual(sentSms.length, 0);
    assert.strictEqual(usageRows.filter((row) => row.providerKey === 'twilio').length, 0);
    const smsAfterDryRun = await request(baseUrl, 'super_admin', 'GET', `/api/admin/notifications-control/deliveries?campaignId=${encodeURIComponent(smsCampaign.row.id)}&status=pending&channel=sms`);
    assert.strictEqual(smsAfterDryRun.rows.length, 4);
    assert.ok(db.prepare("SELECT COUNT(*) AS count FROM notification_events WHERE event_type = 'campaign.sms_dry_run'").get().count >= 1);
    const smsSendMissingTwilio = await request(baseUrl, 'super_admin', 'POST', `/api/admin/notifications-control/campaigns/${smsCampaign.row.id}/send-sms`, {});
    assert.strictEqual(smsSendMissingTwilio.processed, 4);
    assert.ok(smsSendMissingTwilio.results.every((row) => row.status === 'failed' && row.error));
    assert.strictEqual(sentSms.length, 0);
    assert.strictEqual(usageRows.filter((row) => row.providerKey === 'twilio').length, 0);
    const smsFailed = await request(baseUrl, 'super_admin', 'GET', `/api/admin/notifications-control/deliveries?campaignId=${encodeURIComponent(smsCampaign.row.id)}&status=failed&channel=sms`);
    assert.strictEqual(smsFailed.rows.length, 4);
    assert.ok(smsFailed.rows.every((row) => row.error_message && !String(row.error_message).includes('TWILIO_AUTH_TOKEN')));
    const smsStats = await request(baseUrl, 'super_admin', 'GET', `/api/admin/notifications-control/campaigns/${smsCampaign.row.id}/stats`);
    assert.strictEqual(smsStats.smsPending, 0);
    assert.strictEqual(smsStats.smsSent, 0);
    assert.strictEqual(smsStats.smsFailed, 4);
    assert.ok(Number(smsStats.smsCost) > 0);
    assert.ok(auditRows.some((row) => row.action === 'notification_control.campaign_send_sms'));
    smsConfigured = true;
    const retrySms = await request(baseUrl, 'super_admin', 'POST', `/api/admin/notifications-control/deliveries/${smsFailed.rows[0].id}/retry-sms`, {});
    assert.strictEqual(retrySms.delivery.status, 'sent');
    assert.strictEqual(sentSms.length, 1);
    assert.strictEqual(usageRows.filter((row) => row.providerKey === 'twilio').length, 1);
    const retrySmsAgain = await request(baseUrl, 'super_admin', 'POST', `/api/admin/notifications-control/deliveries/${smsFailed.rows[0].id}/retry-sms`, {});
    assert.strictEqual(retrySmsAgain.skipped, true);
    assert.strictEqual(retrySmsAgain.reason, 'already_sent');
    assert.strictEqual(sentSms.length, 1);
    assert.ok(auditRows.some((row) => row.action === 'notification_control.delivery_retry_sms'));

    const mixedBeforeSmsDryRun = await request(baseUrl, 'super_admin', 'GET', `/api/admin/notifications-control/deliveries?campaignId=${encodeURIComponent(mixedCampaign.row.id)}`);
    const mixedEmailSentBeforeSms = mixedBeforeSmsDryRun.rows.filter((row) => row.channel === 'email' && row.status === 'sent').length;
    const mixedInAppSentBeforeSms = mixedBeforeSmsDryRun.rows.filter((row) => row.channel === 'in_app' && row.status === 'sent').length;
    const mixedSmsDryRun = await request(baseUrl, 'super_admin', 'POST', `/api/admin/notifications-control/campaigns/${mixedCampaign.row.id}/send-sms`, { dryRun: true });
    assert.strictEqual(mixedSmsDryRun.processed, 4);
    const mixedAfterSmsDryRun = await request(baseUrl, 'super_admin', 'GET', `/api/admin/notifications-control/deliveries?campaignId=${encodeURIComponent(mixedCampaign.row.id)}`);
    assert.strictEqual(mixedAfterSmsDryRun.rows.filter((row) => row.channel === 'email' && row.status === 'sent').length, mixedEmailSentBeforeSms);
    assert.strictEqual(mixedAfterSmsDryRun.rows.filter((row) => row.channel === 'in_app' && row.status === 'sent').length, mixedInAppSentBeforeSms);
    assert.strictEqual(mixedAfterSmsDryRun.rows.filter((row) => row.channel === 'sms' && row.status === 'pending').length, 4);

    const retryCampaign = await request(baseUrl, 'super_admin', 'POST', '/api/admin/notifications-control/campaigns', {
      title: 'Retry in-app send',
      channels: ['in_app'],
      targetType: 'selected_workspaces',
      workspaceIds: [ids.workspaceA],
      subject: 'Retry subject',
      body: 'Retry body'
    });
    await request(baseUrl, 'super_admin', 'POST', `/api/admin/notifications-control/campaigns/${retryCampaign.row.id}/build-deliveries`, {});
    const retryDeliveries = await request(baseUrl, 'super_admin', 'GET', `/api/admin/notifications-control/deliveries?campaignId=${encodeURIComponent(retryCampaign.row.id)}&status=pending`);
    const retry = await request(baseUrl, 'super_admin', 'POST', `/api/admin/notifications-control/deliveries/${retryDeliveries.rows[0].id}/retry-in-app`, {});
    assert.strictEqual(retry.delivery.status, 'sent');
    assert.strictEqual(db.prepare('SELECT COUNT(*) AS count FROM platform_user_notifications WHERE title = ?').get('Retry subject').count, 1);
    const retryAgain = await request(baseUrl, 'super_admin', 'POST', `/api/admin/notifications-control/deliveries/${retryDeliveries.rows[0].id}/retry-in-app`, {});
    assert.strictEqual(retryAgain.skipped, true);
    assert.strictEqual(retryAgain.reason, 'already_sent');
    assert.strictEqual(db.prepare('SELECT COUNT(*) AS count FROM platform_user_notifications WHERE title = ?').get('Retry subject').count, 1);
    assert.ok(auditRows.some((row) => row.action === 'notification_control.delivery_retry_in_app'));
    const emailDelivery = mixedPendingEmail.rows.find((row) => row.channel === 'email');
    await request(baseUrl, 'super_admin', 'POST', `/api/admin/notifications-control/deliveries/${emailDelivery.id}/retry-in-app`, {}, 400);

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

    const serialized = JSON.stringify({ campaigns, stats, deliveries, templates, automationList, automationTest, emailSend, emailStats, mixedEmailSend, smsDryRun, smsSendMissingTwilio, smsStats, retrySms, mixedSmsDryRun });
    assert.ok(!serialized.includes('TWILIO_AUTH_TOKEN'));
    assert.ok(!serialized.includes('TWILIO_ACCOUNT_SID'));
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
