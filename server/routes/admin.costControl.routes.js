'use strict';

const express = require('express');

function createAdminCostControlRouter({
  costControlService,
  authRequired,
  requireSuperAdmin,
  auditAction = null,
  db = null
} = {}) {
  if (!costControlService) throw new Error('createAdminCostControlRouter requires costControlService.');
  if (typeof authRequired !== 'function') throw new Error('createAdminCostControlRouter requires authRequired.');
  if (typeof requireSuperAdmin !== 'function') throw new Error('createAdminCostControlRouter requires requireSuperAdmin.');

  const router = express.Router();
  router.use(express.json());

  function resolveSuperAdmin(req, res) {
    const user = requireSuperAdmin(req, res);
    return user || null;
  }

  function audit(req, user, action, meta = {}) {
    if (typeof auditAction === 'function') {
      auditAction(action, req, { user, workspaceId: meta.workspaceId || null, target: meta.target || null, meta });
    }
  }

  async function ensureWorkspaceExists(workspaceId) {
    if (!workspaceId || !db || typeof db.prepare !== 'function') return true;
    const row = db.prepare('SELECT id FROM workspaces WHERE id = ? LIMIT 1').get(String(workspaceId).trim());
    return !!row;
  }

  router.get('/overview', authRequired, async (req, res) => {
    const user = resolveSuperAdmin(req, res);
    if (!user) return;
    try {
      const period = req.query.period || 'monthly';
      const overview = await costControlService.getDashboardOverview({ period });
      return res.json(overview);
    } catch (error) {
      return res.status(error.statusCode || 500).json({ error: error.message || 'Failed to load cost overview' });
    }
  });

  router.get('/workspaces/:workspaceId/summary', authRequired, async (req, res) => {
    const user = resolveSuperAdmin(req, res);
    if (!user) return;
    const workspaceId = String(req.params.workspaceId || '').trim();
    if (!workspaceId) return res.status(400).json({ error: 'workspaceId required' });
    try {
      const summary = await costControlService.getWorkspaceCostBreakdown({
        workspaceId,
        period: req.query.period || 'monthly'
      });
      return res.json(summary);
    } catch (error) {
      return res.status(error.statusCode || 500).json({ error: error.message || 'Failed to load workspace summary' });
    }
  });

  router.get('/providers/:providerKey/summary', authRequired, async (req, res) => {
    const user = resolveSuperAdmin(req, res);
    if (!user) return;
    const providerKey = String(req.params.providerKey || '').trim();
    if (!providerKey) return res.status(400).json({ error: 'providerKey required' });
    try {
      const summary = await costControlService.getProviderCostBreakdown({
        providerKey,
        period: req.query.period || 'monthly'
      });
      return res.json(summary);
    } catch (error) {
      return res.status(error.statusCode || 500).json({ error: error.message || 'Failed to load provider summary' });
    }
  });

  router.get('/limits', authRequired, async (req, res) => {
    const user = resolveSuperAdmin(req, res);
    if (!user) return;
    try {
      const workspaceId = req.query.workspaceId != null ? String(req.query.workspaceId) : null;
      const providerKey = req.query.providerKey != null ? String(req.query.providerKey) : null;
      const rows = await costControlService.listProviderLimits({ workspaceId, providerKey });
      return res.json({ rows });
    } catch (error) {
      return res.status(error.statusCode || 500).json({ error: error.message || 'Failed to load limits' });
    }
  });

  router.post('/limits', authRequired, async (req, res) => {
    const user = resolveSuperAdmin(req, res);
    if (!user) return;
    try {
      const workspaceIdRaw = req.body?.workspaceId;
      const workspaceId = workspaceIdRaw === 'platform' || workspaceIdRaw === '' || workspaceIdRaw == null
        ? null
        : String(workspaceIdRaw).trim();
      if (workspaceId && !(await ensureWorkspaceExists(workspaceId))) {
        return res.status(404).json({ error: 'Workspace not found' });
      }
      const row = await costControlService.setWorkspaceProviderLimit({
        workspaceId,
        providerKey: req.body?.providerKey,
        period: req.body?.period || 'monthly',
        hardLimitEur: req.body?.hardLimitEur ?? null,
        softLimitEur: req.body?.softLimitEur ?? null,
        unitLimit: req.body?.unitLimit ?? null,
        enabled: req.body?.enabled !== false && req.body?.enabled !== 0
      });
      audit(req, user, 'cost_control.limit_saved', {
        workspaceId,
        providerKey: row?.provider_key,
        target: row?.id,
        period: row?.period
      });
      return res.json({ ok: true, row });
    } catch (error) {
      return res.status(error.statusCode || 500).json({ error: error.message || 'Failed to save limit' });
    }
  });

  router.delete('/limits/:id', authRequired, async (req, res) => {
    const user = resolveSuperAdmin(req, res);
    if (!user) return;
    try {
      const result = await costControlService.deleteProviderLimit(req.params.id);
      audit(req, user, 'cost_control.limit_deleted', {
        target: req.params.id
      });
      return res.json(result);
    } catch (error) {
      return res.status(error.statusCode || 500).json({ error: error.message || 'Failed to delete limit' });
    }
  });

  router.get('/alerts', authRequired, async (req, res) => {
    const user = resolveSuperAdmin(req, res);
    if (!user) return;
    try {
      const acknowledged = req.query.acknowledged === 'true' ? true : req.query.acknowledged === 'false' ? false : null;
      const result = await costControlService.listAlerts({ acknowledged, limit: req.query.limit || 100 });
      return res.json(result);
    } catch (error) {
      return res.status(error.statusCode || 500).json({ error: error.message || 'Failed to load alerts' });
    }
  });

  router.post('/alerts/:id/acknowledge', authRequired, async (req, res) => {
    const user = resolveSuperAdmin(req, res);
    if (!user) return;
    try {
      const result = await costControlService.acknowledgeAlert(req.params.id);
      audit(req, user, 'cost_control.alert_acknowledged', { target: req.params.id });
      return res.json(result);
    } catch (error) {
      return res.status(error.statusCode || 500).json({ error: error.message || 'Failed to acknowledge alert' });
    }
  });

  router.get('/export.csv', authRequired, async (req, res) => {
    const user = resolveSuperAdmin(req, res);
    if (!user) return;
    try {
      const csv = await costControlService.exportUsageCsv({ period: req.query.period || 'monthly' });
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="cost-control-${String(req.query.period || 'monthly')}.csv"`);
      return res.send(csv);
    } catch (error) {
      return res.status(error.statusCode || 500).json({ error: error.message || 'Failed to export CSV' });
    }
  });

  return router;
}

module.exports = {
  createAdminCostControlRouter
};
