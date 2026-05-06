'use strict';

const express = require('express');

function createPlatformControlRouter({
  platformControlService,
  authRequired,
  requireSuperAdmin,
  db = null,
  auditAction = null
} = {}) {
  if (!platformControlService) throw new Error('createPlatformControlRouter requires platformControlService.');
  if (typeof authRequired !== 'function') throw new Error('createPlatformControlRouter requires authRequired.');
  if (typeof requireSuperAdmin !== 'function') throw new Error('createPlatformControlRouter requires requireSuperAdmin.');

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

  function ensureWorkspaceExists(workspaceId) {
    if (!workspaceId || !db || typeof db.prepare !== 'function') return true;
    const row = db.prepare('SELECT id FROM workspaces WHERE id = ? LIMIT 1').get(String(workspaceId).trim());
    return !!row;
  }

  router.get('/global', authRequired, async (req, res) => {
    const user = resolveSuperAdmin(req, res);
    if (!user) return;
    try {
      const data = await platformControlService.getGlobalSettings();
      return res.json(data);
    } catch (error) {
      return res.status(error.statusCode || 500).json({ error: error.message || 'Failed to load global settings' });
    }
  });

  router.patch('/global', authRequired, async (req, res) => {
    const user = resolveSuperAdmin(req, res);
    if (!user) return;
    try {
      const row = await platformControlService.updateGlobalSettings(req.body?.settings || req.body || {});
      audit(req, user, 'platform_control.global.update', { target: row.id });
      return res.json({ ok: true, row });
    } catch (error) {
      return res.status(error.statusCode || 400).json({ error: error.message || 'Failed to update global settings' });
    }
  });

  router.post('/global/reset', authRequired, async (req, res) => {
    const user = resolveSuperAdmin(req, res);
    if (!user) return;
    try {
      const row = await platformControlService.resetGlobalSettingsToDefaults();
      audit(req, user, 'platform_control.global.reset', { target: row.id });
      return res.json({ ok: true, row });
    } catch (error) {
      return res.status(error.statusCode || 500).json({ error: error.message || 'Failed to reset global settings' });
    }
  });

  router.get('/workspaces/:workspaceId', authRequired, async (req, res) => {
    const user = resolveSuperAdmin(req, res);
    if (!user) return;
    const workspaceId = String(req.params.workspaceId || '').trim();
    if (!workspaceId) return res.status(400).json({ error: 'workspaceId required' });
    if (!ensureWorkspaceExists(workspaceId)) return res.status(404).json({ error: 'Workspace not found' });
    try {
      const data = await platformControlService.getWorkspaceSettings(workspaceId);
      return res.json(data);
    } catch (error) {
      return res.status(error.statusCode || 500).json({ error: error.message || 'Failed to load workspace override' });
    }
  });

  router.patch('/workspaces/:workspaceId', authRequired, async (req, res) => {
    const user = resolveSuperAdmin(req, res);
    if (!user) return;
    const workspaceId = String(req.params.workspaceId || '').trim();
    if (!workspaceId) return res.status(400).json({ error: 'workspaceId required' });
    if (!ensureWorkspaceExists(workspaceId)) return res.status(404).json({ error: 'Workspace not found' });
    try {
      const row = await platformControlService.updateWorkspaceSettings(workspaceId, req.body?.settings || req.body || {});
      audit(req, user, 'platform_control.workspace.update', { workspaceId, target: row.id });
      return res.json({ ok: true, row });
    } catch (error) {
      return res.status(error.statusCode || 400).json({ error: error.message || 'Failed to update workspace override' });
    }
  });

  router.delete('/workspaces/:workspaceId', authRequired, async (req, res) => {
    const user = resolveSuperAdmin(req, res);
    if (!user) return;
    const workspaceId = String(req.params.workspaceId || '').trim();
    if (!workspaceId) return res.status(400).json({ error: 'workspaceId required' });
    try {
      const result = await platformControlService.resetWorkspaceOverride(workspaceId);
      audit(req, user, 'platform_control.workspace.reset', { workspaceId, target: workspaceId });
      return res.json(result);
    } catch (error) {
      return res.status(error.statusCode || 500).json({ error: error.message || 'Failed to reset workspace override' });
    }
  });

  router.get('/effective/:workspaceId', authRequired, async (req, res) => {
    const user = resolveSuperAdmin(req, res);
    if (!user) return;
    const workspaceId = String(req.params.workspaceId || '').trim();
    if (!workspaceId) return res.status(400).json({ error: 'workspaceId required' });
    if (!ensureWorkspaceExists(workspaceId)) return res.status(404).json({ error: 'Workspace not found' });
    try {
      const settings = await platformControlService.getEffectiveSettings(workspaceId);
      return res.json({ workspaceId, settings });
    } catch (error) {
      return res.status(error.statusCode || 500).json({ error: error.message || 'Failed to load effective settings' });
    }
  });

  router.get('/features/:workspaceId', authRequired, async (req, res) => {
    const user = resolveSuperAdmin(req, res);
    if (!user) return;
    const workspaceId = String(req.params.workspaceId || '').trim();
    if (!workspaceId) return res.status(400).json({ error: 'workspaceId required' });
    if (!ensureWorkspaceExists(workspaceId)) return res.status(404).json({ error: 'Workspace not found' });
    try {
      const settings = await platformControlService.getEffectiveSettings(workspaceId);
      return res.json({ workspaceId, features: settings.features || {} });
    } catch (error) {
      return res.status(error.statusCode || 500).json({ error: error.message || 'Failed to load features' });
    }
  });

  router.get('/providers/:workspaceId', authRequired, async (req, res) => {
    const user = resolveSuperAdmin(req, res);
    if (!user) return;
    const workspaceId = String(req.params.workspaceId || '').trim();
    if (!workspaceId) return res.status(400).json({ error: 'workspaceId required' });
    if (!ensureWorkspaceExists(workspaceId)) return res.status(404).json({ error: 'Workspace not found' });
    try {
      const settings = await platformControlService.getEffectiveSettings(workspaceId);
      return res.json({ workspaceId, providerLimits: settings.providerLimits || {} });
    } catch (error) {
      return res.status(error.statusCode || 500).json({ error: error.message || 'Failed to load provider limits' });
    }
  });

  router.get('/subscription-plans', authRequired, async (req, res) => {
    const user = resolveSuperAdmin(req, res);
    if (!user) return;
    try {
      const global = await platformControlService.getGlobalSettings();
      return res.json({
        defaultPlan: global.settings?.subscriptions?.defaultPlan || null,
        trialDays: global.settings?.subscriptions?.trialDays || null,
        autoSuspendOnFailedPayment: !!global.settings?.subscriptions?.autoSuspendOnFailedPayment,
        plans: global.settings?.subscriptions?.plans || {}
      });
    } catch (error) {
      return res.status(error.statusCode || 500).json({ error: error.message || 'Failed to load subscription plans' });
    }
  });

  return router;
}

module.exports = {
  createPlatformControlRouter
};
