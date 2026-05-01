'use strict';

const express = require('express');

function createPlatformOwnerControlRouter({
  service,
  authRequired,
  requireSuperAdmin,
  auditAction = null
} = {}) {
  if (!service) throw new Error('createPlatformOwnerControlRouter requires service.');
  if (typeof authRequired !== 'function') throw new Error('createPlatformOwnerControlRouter requires authRequired.');
  if (typeof requireSuperAdmin !== 'function') throw new Error('createPlatformOwnerControlRouter requires requireSuperAdmin.');

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
        res.status(error.statusCode || 500).json({ error: error.message || 'Platform owner request failed' });
      }
    };
  }

  router.get('/operations/health', authRequired, handler(async (_req, res) => {
    res.json(await service.getOperationsHealth());
  }));

  router.get('/operations/logs/summary', authRequired, handler(async (_req, res) => {
    res.json(await service.getLogsSummary());
  }));

  router.get('/operations/jobs', authRequired, handler(async (_req, res) => {
    res.json(await service.getJobs());
  }));

  router.post('/operations/test-provider/:providerKey', authRequired, handler(async (req, res, user) => {
    const result = await service.testProvider(req.params.providerKey);
    audit(req, user, 'platform_owner.provider_tested', { target: req.params.providerKey, status: result.status });
    res.json(result);
  }));

  router.get('/backups/status', authRequired, handler(async (_req, res) => {
    res.json(await service.getBackupStatus());
  }));

  router.post('/backups/run', authRequired, handler(async (req, res, user) => {
    const row = await service.runBackup(user.id || user.sub || null);
    audit(req, user, 'platform_owner.backup_run', { target: row.id });
    res.json({ ok: true, row });
  }));

  router.get('/backups/history', authRequired, handler(async (_req, res) => {
    res.json({ rows: await service.backupHistory() });
  }));

  router.get('/backups/evidence', authRequired, handler(async (_req, res) => {
    res.json(await service.getBackupEvidence());
  }));

  router.post('/backups/restore-dry-run', authRequired, handler(async (req, res, user) => {
    const result = await service.restoreDryRun();
    audit(req, user, 'platform_owner.restore_dry_run', {});
    res.json(result);
  }));

  router.get('/workspaces/lifecycle', authRequired, handler(async (_req, res) => {
    res.json(await service.lifecycleOverview());
  }));

  const lifecycleActions = {
    suspend: 'suspend',
    unsuspend: 'unsuspend',
    archive: 'archive',
    'force-logout': 'force_logout',
    'transfer-owner': 'transfer_owner',
    'reset-overrides': 'reset_overrides'
  };

  for (const [routeAction, serviceAction] of Object.entries(lifecycleActions)) {
    router.post(`/workspaces/:workspaceId/${routeAction}`, authRequired, handler(async (req, res, user) => {
      const row = await service.lifecycleAction(req.params.workspaceId, serviceAction, {
        actorId: user.id || user.sub || null,
        reason: req.body?.reason,
        metadata: req.body || {}
      });
      audit(req, user, `platform_owner.workspace_${serviceAction}`, {
        workspaceId: req.params.workspaceId,
        target: row.id
      });
      res.json({ ok: true, row });
    }));
  }

  router.post('/support/impersonation/start', authRequired, handler(async (req, res, user) => {
    const row = await service.startImpersonation({
      superAdminId: user.id || user.sub || '',
      targetUserId: req.body?.targetUserId,
      workspaceId: req.body?.workspaceId,
      readOnly: req.body?.readOnly !== false,
      reason: req.body?.reason
    });
    audit(req, user, 'platform_owner.impersonation_started', {
      workspaceId: row.workspace_id,
      target: row.target_user_id,
      sessionId: row.id
    });
    res.json({ ok: true, row });
  }));

  router.post('/support/impersonation/end', authRequired, handler(async (req, res, user) => {
    const result = await service.endImpersonation(user.id || user.sub || '', req.body?.sessionId || null);
    audit(req, user, 'platform_owner.impersonation_ended', { target: req.body?.sessionId || 'active' });
    res.json(result);
  }));

  router.get('/support/impersonation/active', authRequired, handler(async (_req, res, user) => {
    res.json(await service.activeImpersonation(user.id || user.sub || ''));
  }));

  router.get('/incidents', authRequired, handler(async (_req, res) => {
    res.json(await service.listIncidents());
  }));

  router.post('/incidents', authRequired, handler(async (req, res, user) => {
    const row = await service.createIncident(req.body || {}, user.id || user.sub || null);
    audit(req, user, 'platform_owner.incident_created', { target: row.id });
    res.json({ ok: true, row });
  }));

  router.patch('/incidents/:id', authRequired, handler(async (req, res, user) => {
    const row = await service.updateIncident(req.params.id, req.body || {}, user.id || user.sub || null);
    audit(req, user, 'platform_owner.incident_updated', { target: req.params.id });
    res.json({ ok: true, row });
  }));

  router.post('/maintenance', authRequired, handler(async (req, res, user) => {
    const row = await service.updateMaintenance(req.body || {}, user.id || user.sub || null);
    audit(req, user, 'platform_owner.maintenance_updated', { target: row.id, enabled: !!row.enabled });
    res.json({ ok: true, row });
  }));

  router.get('/data-governance/overview', authRequired, handler(async (_req, res) => {
    res.json(await service.dataGovernanceOverview());
  }));

  router.post('/data-governance/export/:workspaceId', authRequired, handler(async (req, res, user) => {
    const row = await service.createGovernanceRequest({
      workspaceId: req.params.workspaceId,
      requestType: 'export',
      reason: req.body?.reason || 'Export requested by platform owner',
      requestedBy: user.id || user.sub || null,
      metadata: { format: req.body?.format || 'json' }
    });
    audit(req, user, 'platform_owner.data_export_requested', { workspaceId: row.workspace_id, target: row.id });
    res.json({ ok: true, row });
  }));

  router.post('/data-governance/delete-request', authRequired, handler(async (req, res, user) => {
    const row = await service.createGovernanceRequest({
      workspaceId: req.body?.workspaceId,
      requestType: 'delete',
      reason: req.body?.reason,
      requestedBy: user.id || user.sub || null,
      metadata: req.body || {}
    });
    audit(req, user, 'platform_owner.data_delete_requested', { workspaceId: row.workspace_id, target: row.id });
    res.json({ ok: true, row });
  }));

  router.get('/data-governance/delete-requests', authRequired, handler(async (_req, res) => {
    res.json({ rows: await service.governanceRequests() });
  }));

  router.get('/notifications', authRequired, handler(async (_req, res) => {
    res.json(await service.listNotifications());
  }));

  router.post('/notifications', authRequired, handler(async (req, res, user) => {
    const row = await service.createNotification(req.body || {}, user.id || user.sub || null);
    audit(req, user, 'platform_owner.notification_created', { target: row.id, workspaceId: row.workspace_id });
    res.json({ ok: true, row });
  }));

  router.post('/notifications/:id/send', authRequired, handler(async (req, res, user) => {
    const row = await service.sendNotification(req.params.id);
    audit(req, user, 'platform_owner.notification_sent', { target: req.params.id });
    res.json({ ok: true, row });
  }));

  router.post('/notifications/:id/retry', authRequired, handler(async (req, res, user) => {
    const row = await service.retryNotification(req.params.id);
    audit(req, user, 'platform_owner.notification_retry', { target: req.params.id });
    res.json({ ok: true, row });
  }));

  router.delete('/notifications/:id', authRequired, handler(async (req, res, user) => {
    const result = await service.deleteNotification(req.params.id);
    audit(req, user, 'platform_owner.notification_deleted', { target: req.params.id });
    res.json(result);
  }));

  router.get('/subscription-automation/overview', authRequired, handler(async (_req, res) => {
    res.json(await service.subscriptionOverview());
  }));

  router.post('/subscription-automation/sync', authRequired, handler(async (req, res, user) => {
    const row = await service.subscriptionSync(user.id || user.sub || null);
    audit(req, user, 'platform_owner.subscription_sync', { target: row.id });
    res.json({ ok: true, row });
  }));

  router.patch('/subscription-automation/workspaces/:workspaceId', authRequired, handler(async (req, res, user) => {
    const row = await service.patchWorkspaceSubscription(req.params.workspaceId, req.body || {});
    audit(req, user, 'platform_owner.subscription_workspace_updated', { workspaceId: req.params.workspaceId, target: row.id });
    res.json({ ok: true, row });
  }));

  router.get('/branding', authRequired, handler(async (_req, res) => {
    res.json(await service.getBranding());
  }));

  router.patch('/branding/platform', authRequired, handler(async (req, res, user) => {
    const row = await service.savePlatformBranding(req.body?.settings || req.body || {});
    audit(req, user, 'platform_owner.branding_platform_saved', { target: row.id });
    res.json({ ok: true, row });
  }));

  router.patch('/branding/workspaces/:workspaceId', authRequired, handler(async (req, res, user) => {
    const row = await service.saveWorkspaceBranding(req.params.workspaceId, req.body?.settings || req.body || {});
    audit(req, user, 'platform_owner.branding_workspace_saved', { workspaceId: req.params.workspaceId });
    res.json(row);
  }));

  router.post('/branding/domains/:workspaceId/verify', authRequired, handler(async (req, res, user) => {
    const result = await service.verifyDomain(req.params.workspaceId);
    audit(req, user, 'platform_owner.domain_verified', { workspaceId: req.params.workspaceId });
    res.json(result);
  }));

  router.get('/reports/overview', authRequired, handler(async (_req, res) => {
    res.json(await service.reportsOverview());
  }));

  router.get('/reports/export.csv', authRequired, handler(async (req, res) => {
    const csv = await service.reportsCsv(req.query.type || 'overview');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="platform-report-${String(req.query.type || 'overview')}.csv"`);
    res.send(csv);
  }));

  return router;
}

module.exports = {
  createPlatformOwnerControlRouter
};
