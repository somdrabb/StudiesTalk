'use strict';

const defaultDb = require('../../db');

function nowDate() {
  return new Date();
}

function monthRangeUtc(now = nowDate()) {
  const value = now instanceof Date ? now : new Date(now);
  const start = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1, 0, 0, 0, 0));
  const next = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, 1, 0, 0, 0, 0));
  return {
    startIso: start.toISOString(),
    nextIso: next.toISOString()
  };
}

function normalizeDbAdapter(db) {
  if (!db) throw new Error('AI budget service requires a database handle.');

  if (typeof db.one === 'function') {
    return {
      one(sql, params = []) {
        return Promise.resolve(db.one(sql, params));
      },
      exec(sql, params = []) {
        return Promise.resolve(typeof db.exec === 'function' ? db.exec(sql, params) : null);
      }
    };
  }

  if (typeof db.prepare === 'function') {
    return {
      one(sql, params = []) {
        return Promise.resolve(db.prepare(sql).get(...params) || null);
      },
      exec(sql, params = []) {
        const result = db.prepare(sql).run(...params);
        return Promise.resolve(result);
      }
    };
  }

  throw new Error('Unsupported database handle for AI budget service.');
}

function createAiBudgetService({
  db = defaultDb,
  defaultBudgetEur = 5,
  now = nowDate
} = {}) {
  const adapter = normalizeDbAdapter(db);

  async function getDefaultBudget() {
    const row = await adapter.one(`
      SELECT monthly_limit_eur
      FROM ai_budget_settings
      WHERE workspace_id IS NULL
      ORDER BY COALESCE(updated_at, created_at) DESC, id DESC
      LIMIT 1
    `);
    const value = Number(row?.monthly_limit_eur);
    return Number.isFinite(value) && value >= 0 ? value : defaultBudgetEur;
  }

  async function getWorkspaceBudget(workspaceId) {
    const normalizedWorkspaceId = String(workspaceId || '').trim();
    if (!normalizedWorkspaceId) {
      return getDefaultBudget();
    }

    const override = await adapter.one(`
      SELECT monthly_limit_eur
      FROM ai_budget_settings
      WHERE workspace_id = ?
      LIMIT 1
    `, [normalizedWorkspaceId]);

    if (override && Number.isFinite(Number(override.monthly_limit_eur))) {
      return Math.max(0, Number(override.monthly_limit_eur));
    }

    return getDefaultBudget();
  }

  async function getWorkspaceUsage(workspaceId) {
    const normalizedWorkspaceId = String(workspaceId || '').trim();
    if (!normalizedWorkspaceId) return 0;

    const { startIso, nextIso } = monthRangeUtc(now());
    const row = await adapter.one(`
      SELECT COALESCE(SUM(cost_eur), 0) AS total
      FROM ai_usage_ledger
      WHERE workspace_id = ?
        AND created_at >= ?
        AND created_at < ?
    `, [normalizedWorkspaceId, startIso, nextIso]);

    const total = Number(row?.total || 0);
    return Number.isFinite(total) && total >= 0 ? total : 0;
  }

  async function canUseAI(workspaceId) {
    const limit = await getWorkspaceBudget(workspaceId);
    const used = await getWorkspaceUsage(workspaceId);
    const left = Math.max(0, limit - used);
    return {
      allowed: limit > 0 ? used < limit : false,
      blocked: limit > 0 ? used >= limit : true,
      used,
      limit,
      left
    };
  }

  async function getWorkspaceBudgetSummary(workspaceId) {
    const normalizedWorkspaceId = String(workspaceId || '').trim();
    const defaultLimit = await getDefaultBudget();
    const budgetRow = normalizedWorkspaceId
      ? await adapter.one(`
          SELECT monthly_limit_eur, updated_at
          FROM ai_budget_settings
          WHERE workspace_id = ?
          LIMIT 1
        `, [normalizedWorkspaceId])
      : await adapter.one(`
          SELECT monthly_limit_eur, updated_at
          FROM ai_budget_settings
          WHERE workspace_id IS NULL
          ORDER BY COALESCE(updated_at, created_at) DESC, id DESC
          LIMIT 1
        `);
    const usage = await canUseAI(normalizedWorkspaceId);
    return {
      workspace_id: normalizedWorkspaceId || null,
      monthly_limit_eur: usage.limit,
      monthly_cap_eur: usage.limit,
      used_eur: usage.used,
      left_eur: usage.left,
      blocked: usage.blocked,
      allowed: usage.allowed,
      default_monthly_limit_eur: defaultLimit,
      default_monthly_cap_eur: defaultLimit,
      updated_at: budgetRow?.updated_at || null
    };
  }

  return {
    getDefaultBudget,
    getWorkspaceBudget,
    getWorkspaceUsage,
    canUseAI,
    getWorkspaceBudgetSummary
  };
}

module.exports = {
  createAiBudgetService
};
