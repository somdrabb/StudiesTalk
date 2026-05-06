'use strict';

const express = require('express');
const crypto = require('crypto');

function createAdminAiBudgetRouter({
  db,
  aiBudgetService,
  authRequired,
  requireAdmin,
  requireSuperAdmin,
  setPlatformSetting
} = {}) {
  if (!db) throw new Error('createAdminAiBudgetRouter requires db.');
  if (!aiBudgetService) throw new Error('createAdminAiBudgetRouter requires aiBudgetService.');
  if (typeof authRequired !== 'function') throw new Error('createAdminAiBudgetRouter requires authRequired middleware.');
  if (typeof requireAdmin !== 'function') throw new Error('createAdminAiBudgetRouter requires requireAdmin middleware.');
  if (typeof requireSuperAdmin !== 'function') throw new Error('createAdminAiBudgetRouter requires requireSuperAdmin middleware.');
  if (typeof setPlatformSetting !== 'function') throw new Error('createAdminAiBudgetRouter requires setPlatformSetting.');

  const router = express.Router();
  router.use(express.json());

  function resolveWorkspaceId(req) {
    return String(req.params.id || req.query.workspaceId || req.body?.workspaceId || req.auth?.workspaceId || '').trim();
  }

  router.get('/', authRequired, requireAdmin, (req, res) => {
    const workspaceId = resolveWorkspaceId(req);
    if (!workspaceId) return res.status(400).json({ error: 'workspaceId required' });

    aiBudgetService.getWorkspaceBudgetSummary(workspaceId)
      .then((summary) => res.json(summary))
      .catch((err) => {
        console.error('Failed to fetch workspace AI budget', err);
        res.status(500).json({ error: 'Failed to fetch AI budget' });
      });
  });

  router.get('/default', authRequired, (req, res) => {
    const user = requireSuperAdmin(req, res);
    if (!user) return;

    aiBudgetService.getWorkspaceBudgetSummary(null)
      .then((summary) => {
        res.json({
          monthly_limit_eur: summary.monthly_limit_eur,
          monthly_cap_eur: summary.monthly_cap_eur,
          updated_at: summary.updated_at
        });
      })
      .catch((err) => {
        console.error('Failed to fetch default AI budget', err);
        res.status(500).json({ error: 'Failed to fetch default AI budget' });
      });
  });

  router.post('/default', authRequired, (req, res) => {
    const user = requireSuperAdmin(req, res);
    if (!user) return;

    const amount = Number(req.body?.amount ?? req.body?.monthly_limit_eur ?? req.body?.monthly_cap_eur);
    if (!Number.isFinite(amount) || amount < 0) {
      return res.status(400).json({ error: 'amount must be a non-negative number' });
    }

    const now = new Date().toISOString();
    try {
      db.prepare(`
        INSERT INTO ai_budget_settings (id, workspace_id, monthly_limit_eur, created_at, updated_at)
        VALUES ('default', NULL, ?, ?, ?)
        ON CONFLICT(workspace_id) DO UPDATE SET
          monthly_limit_eur = excluded.monthly_limit_eur,
          updated_at = excluded.updated_at
      `).run(amount, now, now);
      setPlatformSetting('ai_default_monthly_cap_eur', String(amount));
      return res.json({ success: true, amount });
    } catch (err) {
      console.error('Failed to save default AI budget', err);
      return res.status(500).json({ error: 'Failed to save default AI budget' });
    }
  });

  router.post('/workspace/:id', authRequired, requireAdmin, (req, res) => {
    const workspaceId = resolveWorkspaceId(req);
    if (!workspaceId) return res.status(400).json({ error: 'workspaceId required' });

    const amount = Number(req.body?.amount ?? req.body?.monthly_limit_eur ?? req.body?.monthly_cap_eur);
    if (!Number.isFinite(amount) || amount < 0) {
      return res.status(400).json({ error: 'amount must be a non-negative number' });
    }

    const now = new Date().toISOString();
    try {
      db.prepare(`
        INSERT INTO ai_budget_settings (id, workspace_id, monthly_limit_eur, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(workspace_id) DO UPDATE SET
          monthly_limit_eur = excluded.monthly_limit_eur,
          updated_at = excluded.updated_at
      `).run(crypto.randomUUID(), workspaceId, amount, now, now);
      return res.json({ success: true, workspaceId, amount });
    } catch (err) {
      console.error('Failed to save workspace AI budget', err);
      return res.status(500).json({ error: 'Failed to save workspace AI budget' });
    }
  });

  router.post('/', authRequired, requireAdmin, (req, res) => {
    const workspaceId = resolveWorkspaceId(req);
    if (!workspaceId) return res.status(400).json({ error: 'workspaceId required' });

    const amount = Number(req.body?.amount ?? req.body?.monthly_limit_eur ?? req.body?.monthly_cap_eur);
    if (!Number.isFinite(amount) || amount < 0) {
      return res.status(400).json({ error: 'amount must be a non-negative number' });
    }

    const now = new Date().toISOString();
    try {
      db.prepare(`
        INSERT INTO ai_budget_settings (id, workspace_id, monthly_limit_eur, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(workspace_id) DO UPDATE SET
          monthly_limit_eur = excluded.monthly_limit_eur,
          updated_at = excluded.updated_at
      `).run(crypto.randomUUID(), workspaceId, amount, now, now);
      return aiBudgetService.getWorkspaceBudgetSummary(workspaceId)
        .then((summary) => res.json(summary))
        .catch((err) => {
          console.error('Failed to fetch updated workspace AI budget', err);
          res.status(500).json({ error: 'Failed to fetch updated AI budget' });
        });
    } catch (err) {
      console.error('Failed to save workspace AI budget', err);
      return res.status(500).json({ error: 'Failed to save workspace AI budget' });
    }
  });

  router.get('/workspace/:id/usage', authRequired, requireAdmin, (req, res) => {
    const workspaceId = resolveWorkspaceId(req);
    if (!workspaceId) return res.status(400).json({ error: 'workspaceId required' });

    aiBudgetService.getWorkspaceUsage(workspaceId)
      .then((used) => res.json({ used, workspaceId }))
      .catch((err) => {
        console.error('Failed to fetch workspace AI usage', err);
        res.status(500).json({ error: 'Failed to fetch workspace AI usage' });
      });
  });

  router.post('/reset', authRequired, requireAdmin, (req, res) => {
    const workspaceId = resolveWorkspaceId(req);
    if (!workspaceId) return res.status(400).json({ error: 'workspaceId required' });

    try {
      db.prepare('DELETE FROM ai_usage_ledger WHERE workspace_id = ?').run(workspaceId);
      return res.json({ ok: true, workspaceId });
    } catch (err) {
      console.error('Failed to reset workspace AI usage', err);
      return res.status(500).json({ error: 'Failed to reset workspace AI usage' });
    }
  });

  return router;
}

module.exports = {
  createAdminAiBudgetRouter
};
