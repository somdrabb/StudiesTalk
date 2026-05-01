'use strict';

const express = require('express');

function createNotificationControlRouter({
  notificationControlService,
  authRequired,
  requireSuperAdmin,
  auditAction = null
} = {}) {
  if (!notificationControlService) throw new Error('createNotificationControlRouter requires notificationControlService.');
  if (typeof authRequired !== 'function') throw new Error('createNotificationControlRouter requires authRequired.');
  if (typeof requireSuperAdmin !== 'function') throw new Error('createNotificationControlRouter requires requireSuperAdmin.');

  const router = express.Router();
  router.use(express.json({ limit: '1mb' }));

  function resolveSuperAdmin(req, res) {
    const user = requireSuperAdmin(req, res);
    return user || null;
  }

  function audit(req, user, action, meta = {}) {
    if (typeof auditAction === 'function') {
      auditAction(action, req, {
        user,
        workspaceId: meta.workspaceId || null,
        target: meta.target || null,
        meta
      });
    }
  }

  function handler(fn) {
    return async (req, res) => {
      const user = resolveSuperAdmin(req, res);
      if (!user) return;
      try {
        await fn(req, res, user);
      } catch (error) {
        res.status(error.statusCode || 500).json({ error: error.message || 'Notification control request failed' });
      }
    };
  }

  router.get('/campaigns', authRequired, handler(async (req, res) => {
    res.json(await notificationControlService.listCampaigns({
      status: req.query.status,
      channel: req.query.channel,
      limit: req.query.limit
    }));
  }));

  router.post('/campaigns', authRequired, handler(async (req, res, user) => {
    const row = await notificationControlService.createCampaign(req.body || {}, user.id || user.sub || null);
    audit(req, user, 'notification_control.campaign_created', { target: row.id });
    res.json({ ok: true, row });
  }));

  router.get('/campaigns/:id', authRequired, handler(async (req, res) => {
    res.json({ row: await notificationControlService.getCampaign(req.params.id) });
  }));

  router.patch('/campaigns/:id', authRequired, handler(async (req, res, user) => {
    const row = await notificationControlService.updateCampaign(req.params.id, req.body || {}, user.id || user.sub || null);
    audit(req, user, 'notification_control.campaign_updated', { target: row.id });
    res.json({ ok: true, row });
  }));

  router.delete('/campaigns/:id', authRequired, handler(async (req, res, user) => {
    const result = await notificationControlService.deleteCampaign(req.params.id);
    audit(req, user, 'notification_control.campaign_deleted', { target: req.params.id });
    res.json(result);
  }));

  router.post('/campaigns/:id/estimate', authRequired, handler(async (req, res) => {
    res.json(await notificationControlService.estimateCampaign(req.params.id));
  }));

  router.post('/campaigns/:id/build-deliveries', authRequired, handler(async (req, res, user) => {
    const result = await notificationControlService.buildDeliveryDrafts(req.params.id);
    audit(req, user, 'notification_control.deliveries_built', { target: req.params.id, count: result.count });
    res.json(result);
  }));

  router.post('/campaigns/:id/send', authRequired, handler(async (req, res, user) => {
    const result = await notificationControlService.sendCampaign(req.params.id, {
      dryRun: !!req.body?.dryRun,
      limit: req.body?.limit
    });
    audit(req, user, 'notification_control.campaign_send', {
      target: req.params.id,
      dryRun: !!req.body?.dryRun,
      processed: result.processed,
      remaining: result.remaining
    });
    res.json(result);
  }));

  router.post('/campaigns/:id/send-in-app', authRequired, handler(async (req, res, user) => {
    const result = await notificationControlService.sendInAppCampaign(req.params.id, {
      dryRun: !!req.body?.dryRun,
      limit: req.body?.limit
    });
    audit(req, user, 'notification_control.campaign_send_in_app', {
      target: req.params.id,
      dryRun: !!req.body?.dryRun,
      processed: result.processed,
      remaining: result.remaining
    });
    res.json(result);
  }));

  router.post('/campaigns/:id/send-email', authRequired, handler(async (req, res, user) => {
    const result = await notificationControlService.sendEmailCampaign(req.params.id, {
      dryRun: !!req.body?.dryRun,
      limit: req.body?.limit
    });
    audit(req, user, 'notification_control.campaign_send_email', {
      target: req.params.id,
      dryRun: !!req.body?.dryRun,
      processed: result.processed,
      remaining: result.remaining
    });
    res.json(result);
  }));

  router.post('/campaigns/:id/send-sms', authRequired, handler(async (req, res, user) => {
    const result = await notificationControlService.sendSmsCampaign(req.params.id, {
      dryRun: !!req.body?.dryRun,
      limit: req.body?.limit
    });
    audit(req, user, 'notification_control.campaign_send_sms', {
      target: req.params.id,
      dryRun: !!req.body?.dryRun,
      processed: result.processed,
      remaining: result.remaining
    });
    res.json(result);
  }));

  router.post('/campaigns/:id/cancel', authRequired, handler(async (req, res, user) => {
    const result = await notificationControlService.cancelCampaign(req.params.id);
    audit(req, user, 'notification_control.campaign_cancelled', { target: req.params.id });
    res.json(result);
  }));

  router.get('/campaigns/:id/stats', authRequired, handler(async (req, res) => {
    res.json(await notificationControlService.getDeliveryStats(req.params.id));
  }));

  router.get('/deliveries', authRequired, handler(async (req, res) => {
    res.json({
      rows: await notificationControlService.listDeliveries({
        campaignId: req.query.campaignId,
        status: req.query.status,
        workspaceId: req.query.workspaceId,
        channel: req.query.channel,
        limit: req.query.limit
      })
    });
  }));

  router.post('/deliveries/:id/retry', authRequired, handler(async (req, res, user) => {
    const result = await notificationControlService.retryDelivery(req.params.id, { dryRun: !!req.body?.dryRun });
    audit(req, user, 'notification_control.delivery_retry', {
      target: req.params.id,
      dryRun: !!req.body?.dryRun,
      status: result.delivery?.status || null
    });
    res.json(result);
  }));

  router.post('/deliveries/:id/retry-in-app', authRequired, handler(async (req, res, user) => {
    const result = await notificationControlService.retryInAppDelivery(req.params.id, { dryRun: !!req.body?.dryRun });
    audit(req, user, 'notification_control.delivery_retry_in_app', {
      target: req.params.id,
      dryRun: !!req.body?.dryRun,
      status: result.delivery?.status || null
    });
    res.json(result);
  }));

  router.post('/deliveries/:id/retry-email', authRequired, handler(async (req, res, user) => {
    const result = await notificationControlService.retryEmailDelivery(req.params.id, { dryRun: !!req.body?.dryRun });
    audit(req, user, 'notification_control.delivery_retry_email', {
      target: req.params.id,
      dryRun: !!req.body?.dryRun,
      status: result.delivery?.status || null
    });
    res.json(result);
  }));

  router.post('/deliveries/:id/retry-sms', authRequired, handler(async (req, res, user) => {
    const result = await notificationControlService.retrySmsDelivery(req.params.id, { dryRun: !!req.body?.dryRun });
    audit(req, user, 'notification_control.delivery_retry_sms', {
      target: req.params.id,
      dryRun: !!req.body?.dryRun,
      status: result.delivery?.status || null
    });
    res.json(result);
  }));

  router.get('/automation-rules', authRequired, handler(async (req, res) => {
    res.json(await notificationControlService.listAutomationRules({ limit: req.query.limit }));
  }));

  router.post('/automation-rules', authRequired, handler(async (req, res, user) => {
    const row = await notificationControlService.createAutomationRule(req.body || {}, user.id || user.sub || null);
    audit(req, user, 'notification_control.automation_rule_created', { target: row.id });
    res.json({ ok: true, row });
  }));

  router.patch('/automation-rules', authRequired, handler(async (req, res, user) => {
    const ruleId = req.body?.id || req.query.id;
    const row = await notificationControlService.updateAutomationRule(ruleId, req.body || {}, user.id || user.sub || null);
    audit(req, user, 'notification_control.automation_rule_updated', { target: row.id });
    res.json({ ok: true, row });
  }));

  router.delete('/automation-rules', authRequired, handler(async (req, res, user) => {
    const ruleId = req.body?.id || req.query.id;
    const result = await notificationControlService.deleteAutomationRule(ruleId);
    audit(req, user, 'notification_control.automation_rule_deleted', { target: ruleId });
    res.json(result);
  }));

  router.patch('/automation-rules/:id', authRequired, handler(async (req, res, user) => {
    const row = await notificationControlService.updateAutomationRule(req.params.id, req.body || {}, user.id || user.sub || null);
    audit(req, user, 'notification_control.automation_rule_updated', { target: row.id });
    res.json({ ok: true, row });
  }));

  router.delete('/automation-rules/:id', authRequired, handler(async (req, res, user) => {
    const result = await notificationControlService.deleteAutomationRule(req.params.id);
    audit(req, user, 'notification_control.automation_rule_deleted', { target: req.params.id });
    res.json(result);
  }));

  router.post('/automation-rules/:id/test', authRequired, handler(async (req, res, user) => {
    const result = await notificationControlService.testAutomationRule(req.params.id);
    audit(req, user, 'notification_control.automation_rule_tested', {
      target: req.params.id,
      status: result.run?.status || null
    });
    res.json(result);
  }));

  router.get('/templates', authRequired, handler(async (_req, res) => {
    res.json({ rows: await notificationControlService.listTemplates() });
  }));

  router.post('/templates', authRequired, handler(async (req, res, user) => {
    const row = await notificationControlService.createTemplate(req.body || {}, user.id || user.sub || null);
    audit(req, user, 'notification_control.template_created', { target: row.id });
    res.json({ ok: true, row });
  }));

  return router;
}

module.exports = {
  createNotificationControlRouter
};
