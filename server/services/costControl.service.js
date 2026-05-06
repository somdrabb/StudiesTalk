'use strict';

const crypto = require('crypto');
const defaultDb = require('../../db');

const DEFAULT_PROVIDER_SEEDS = [
  { provider_key: 'openai', display_name: 'OpenAI', category: 'ai', unit_name: 'tokens', default_unit_cost_eur: 0 },
  { provider_key: 'twilio', display_name: 'Twilio', category: 'messaging', unit_name: 'sms', default_unit_cost_eur: 0 },
  { provider_key: 'google_translate', display_name: 'Google Translate', category: 'translation', unit_name: 'characters', default_unit_cost_eur: 0 },
  { provider_key: 'ionos_email', display_name: 'IONOS Email', category: 'email', unit_name: 'email', default_unit_cost_eur: 0 },
  { provider_key: 'storage', display_name: 'Storage', category: 'storage', unit_name: 'bytes', default_unit_cost_eur: 0 },
  { provider_key: 'jitsi', display_name: 'Jitsi', category: 'live_class', unit_name: 'minutes', default_unit_cost_eur: 0 },
  { provider_key: 'custom', display_name: 'Custom', category: 'custom', unit_name: 'units', default_unit_cost_eur: 0 }
];

function nowDate() {
  return new Date();
}

function normalizeDbAdapter(db) {
  if (!db) throw new Error('Cost control service requires a database handle.');

  if (typeof db.one === 'function' && typeof db.many === 'function') {
    return {
      engine: db.engine || 'unknown',
      one(sql, params = []) {
        return Promise.resolve(db.one(sql, params));
      },
      many(sql, params = []) {
        return Promise.resolve(db.many(sql, params));
      },
      exec(sql, params = []) {
        return Promise.resolve(db.exec(sql, params));
      }
    };
  }

  if (typeof db.prepare === 'function') {
    return {
      engine: 'sqlite',
      one(sql, params = []) {
        return Promise.resolve(db.prepare(sql).get(...params) || null);
      },
      many(sql, params = []) {
        return Promise.resolve(db.prepare(sql).all(...params));
      },
      exec(sql, params = []) {
        return Promise.resolve(db.prepare(sql).run(...params));
      }
    };
  }

  throw new Error('Unsupported database handle for cost control service.');
}

function normalizePeriod(period = 'monthly') {
  const value = String(period || 'monthly').trim().toLowerCase();
  if (!['daily', 'monthly', 'yearly'].includes(value)) {
    const error = new Error('Invalid period');
    error.statusCode = 400;
    throw error;
  }
  return value;
}

function periodRange(period = 'monthly', now = nowDate()) {
  const date = now instanceof Date ? now : new Date(now);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  let start;
  let end;
  if (period === 'daily') {
    start = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
    end = new Date(Date.UTC(year, month, day + 1, 0, 0, 0, 0));
  } else if (period === 'yearly') {
    start = new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0));
    end = new Date(Date.UTC(year + 1, 0, 1, 0, 0, 0, 0));
  } else {
    start = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
    end = new Date(Date.UTC(year, month + 1, 1, 0, 0, 0, 0));
  }
  return {
    startIso: start.toISOString(),
    endIso: end.toISOString()
  };
}

function sumNumber(rows = [], key) {
  return rows.reduce((total, row) => total + (Number(row?.[key] || 0) || 0), 0);
}

function toFiniteNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function parseJsonSafe(value, fallback = null) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch (_err) {
    return fallback;
  }
}

function uniqueId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function isoNow(now = nowDate()) {
  const date = now instanceof Date ? now : new Date(now);
  return date.toISOString();
}

function mapLimitRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    workspace_id: row.workspace_id == null ? null : String(row.workspace_id),
    provider_key: String(row.provider_key || ''),
    period: String(row.period || 'monthly'),
    hard_limit_eur: row.hard_limit_eur == null ? null : Number(row.hard_limit_eur),
    soft_limit_eur: row.soft_limit_eur == null ? null : Number(row.soft_limit_eur),
    unit_limit: row.unit_limit == null ? null : Number(row.unit_limit),
    enabled: Number(row.enabled || 0) === 1,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null
  };
}

function mapAlertRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    workspace_id: row.workspace_id == null ? null : String(row.workspace_id),
    provider_key: row.provider_key || null,
    alert_type: String(row.alert_type || ''),
    period: String(row.period || ''),
    threshold_eur: row.threshold_eur == null ? null : Number(row.threshold_eur),
    current_cost_eur: row.current_cost_eur == null ? null : Number(row.current_cost_eur),
    acknowledged: Number(row.acknowledged || 0) === 1,
    created_at: row.created_at || null
  };
}

function createCostControlService({
  db = defaultDb,
  now = nowDate
} = {}) {
  const adapter = normalizeDbAdapter(db);

  async function seedProviderCatalog() {
    const timestamp = isoNow(now());
    for (const provider of DEFAULT_PROVIDER_SEEDS) {
      await adapter.exec(`
        INSERT INTO provider_catalog (id, provider_key, display_name, category, unit_name, default_unit_cost_eur, active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
        ON CONFLICT(provider_key) DO UPDATE SET
          display_name = excluded.display_name,
          category = excluded.category,
          unit_name = excluded.unit_name,
          default_unit_cost_eur = excluded.default_unit_cost_eur,
          updated_at = excluded.updated_at
      `, [
        provider.provider_key,
        provider.provider_key,
        provider.display_name,
        provider.category,
        provider.unit_name,
        provider.default_unit_cost_eur,
        timestamp,
        timestamp
      ]);
    }
  }

  async function listProviders() {
    return adapter.many(`
      SELECT id, provider_key, display_name, category, unit_name, default_unit_cost_eur, active, created_at, updated_at
      FROM provider_catalog
      WHERE active = 1
      ORDER BY display_name ASC
    `);
  }

  async function getProvider(providerKey) {
    const normalized = String(providerKey || '').trim().toLowerCase();
    if (!normalized) return null;
    return adapter.one(`
      SELECT id, provider_key, display_name, category, unit_name, default_unit_cost_eur, active, created_at, updated_at
      FROM provider_catalog
      WHERE provider_key = ?
      LIMIT 1
    `, [normalized]);
  }

  async function ensureProvider(providerKey) {
    const row = await getProvider(providerKey);
    if (!row) {
      const error = new Error(`Unknown provider: ${providerKey}`);
      error.statusCode = 400;
      throw error;
    }
    return row;
  }

  async function recordUsage({
    workspaceId,
    providerKey,
    featureKey = '',
    units = 0,
    unitName = '',
    unitCostEur = 0,
    costEur = 0,
    metadata = null
  }) {
    const normalizedWorkspaceId = String(workspaceId || '').trim();
    if (!normalizedWorkspaceId) {
      const error = new Error('workspaceId is required');
      error.statusCode = 400;
      throw error;
    }
    const provider = await ensureProvider(providerKey);
    const createdAt = isoNow(now());
    const row = {
      id: uniqueId('usage'),
      workspace_id: normalizedWorkspaceId,
      provider_key: provider.provider_key,
      feature_key: String(featureKey || '').trim() || null,
      units: toFiniteNumber(units, 0),
      unit_name: String(unitName || provider.unit_name || '').trim() || null,
      unit_cost_eur: toFiniteNumber(unitCostEur, 0),
      cost_eur: toFiniteNumber(costEur, 0),
      metadata_json: metadata ? JSON.stringify(metadata) : null,
      created_at: createdAt
    };
    await adapter.exec(`
      INSERT INTO usage_ledger
      (id, workspace_id, provider_key, feature_key, units, unit_name, unit_cost_eur, cost_eur, metadata_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      row.id,
      row.workspace_id,
      row.provider_key,
      row.feature_key,
      row.units,
      row.unit_name,
      row.unit_cost_eur,
      row.cost_eur,
      row.metadata_json,
      row.created_at
    ]);
    return {
      ...row,
      metadata: metadata || null
    };
  }

  async function getUsageSummary({ workspaceId = null, providerKey = null, period = 'monthly' } = {}) {
    const normalizedPeriod = normalizePeriod(period);
    const { startIso, endIso } = periodRange(normalizedPeriod, now());
    const clauses = ['created_at >= ?', 'created_at < ?'];
    const params = [startIso, endIso];

    if (workspaceId) {
      clauses.push('workspace_id = ?');
      params.push(String(workspaceId).trim());
    }
    if (providerKey) {
      clauses.push('provider_key = ?');
      params.push(String(providerKey).trim().toLowerCase());
    }

    const row = await adapter.one(`
      SELECT
        COALESCE(SUM(cost_eur), 0) AS total_cost_eur,
        COALESCE(SUM(units), 0) AS total_units,
        COUNT(*) AS row_count
      FROM usage_ledger
      WHERE ${clauses.join(' AND ')}
    `, params);

    return {
      period: normalizedPeriod,
      workspace_id: workspaceId ? String(workspaceId).trim() : null,
      provider_key: providerKey ? String(providerKey).trim().toLowerCase() : null,
      total_cost_eur: toFiniteNumber(row?.total_cost_eur, 0),
      total_units: toFiniteNumber(row?.total_units, 0),
      row_count: Number(row?.row_count || 0),
      start_at: startIso,
      end_at: endIso
    };
  }

  async function getWorkspaceProviderLimit({ workspaceId = null, providerKey, period = 'monthly' } = {}) {
    const normalizedPeriod = normalizePeriod(period);
    const provider = await ensureProvider(providerKey);
    const normalizedWorkspaceId = String(workspaceId || '').trim() || null;

    if (normalizedWorkspaceId) {
      const row = await adapter.one(`
        SELECT *
        FROM workspace_provider_limits
        WHERE workspace_id = ?
          AND provider_key = ?
          AND period = ?
        LIMIT 1
      `, [normalizedWorkspaceId, provider.provider_key, normalizedPeriod]);
      if (row) {
        return {
          ...mapLimitRow(row),
          source: 'workspace'
        };
      }
    }

    const platformDefault = await adapter.one(`
      SELECT *
      FROM workspace_provider_limits
      WHERE workspace_id IS NULL
        AND provider_key = ?
        AND period = ?
      LIMIT 1
    `, [provider.provider_key, normalizedPeriod]);
    if (platformDefault) {
      return {
        ...mapLimitRow(platformDefault),
        source: 'platform'
      };
    }

    if (provider.provider_key === 'openai' && normalizedPeriod === 'monthly') {
      const legacyRow = normalizedWorkspaceId
        ? await adapter.one(`
            SELECT id, workspace_id, monthly_limit_eur, created_at, updated_at
            FROM ai_budget_settings
            WHERE workspace_id = ?
            LIMIT 1
          `, [normalizedWorkspaceId])
        : null;
      if (legacyRow && Number.isFinite(Number(legacyRow.monthly_limit_eur))) {
        return {
          id: legacyRow.id,
          workspace_id: normalizedWorkspaceId,
          provider_key: 'openai',
          period: 'monthly',
          hard_limit_eur: Number(legacyRow.monthly_limit_eur),
          soft_limit_eur: null,
          unit_limit: null,
          enabled: true,
          created_at: legacyRow.created_at || null,
          updated_at: legacyRow.updated_at || null,
          source: 'legacy_ai_budget'
        };
      }
      const legacyDefault = await adapter.one(`
        SELECT id, workspace_id, monthly_limit_eur, created_at, updated_at
        FROM ai_budget_settings
        WHERE workspace_id IS NULL
        LIMIT 1
      `);
      if (legacyDefault && Number.isFinite(Number(legacyDefault.monthly_limit_eur))) {
        return {
          id: legacyDefault.id,
          workspace_id: null,
          provider_key: 'openai',
          period: 'monthly',
          hard_limit_eur: Number(legacyDefault.monthly_limit_eur),
          soft_limit_eur: null,
          unit_limit: null,
          enabled: true,
          created_at: legacyDefault.created_at || null,
          updated_at: legacyDefault.updated_at || null,
          source: 'legacy_ai_budget'
        };
      }
    }

    return null;
  }

  async function setWorkspaceProviderLimit({
    workspaceId = null,
    providerKey,
    period = 'monthly',
    hardLimitEur = null,
    softLimitEur = null,
    unitLimit = null,
    enabled = true
  }) {
    const normalizedPeriod = normalizePeriod(period);
    const provider = await ensureProvider(providerKey);
    const normalizedWorkspaceId = String(workspaceId || '').trim() || null;
    const nowIso = isoNow(now());
    const rowId = normalizedWorkspaceId
      ? `${normalizedWorkspaceId}_${provider.provider_key}_${normalizedPeriod}`
      : `platform_${provider.provider_key}_${normalizedPeriod}`;
    await adapter.exec(`
      INSERT INTO workspace_provider_limits
      (id, workspace_id, provider_key, period, hard_limit_eur, soft_limit_eur, unit_limit, enabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        hard_limit_eur = excluded.hard_limit_eur,
        soft_limit_eur = excluded.soft_limit_eur,
        unit_limit = excluded.unit_limit,
        workspace_id = excluded.workspace_id,
        provider_key = excluded.provider_key,
        period = excluded.period,
        enabled = excluded.enabled,
        updated_at = excluded.updated_at
    `, [
      rowId,
      normalizedWorkspaceId,
      provider.provider_key,
      normalizedPeriod,
      hardLimitEur == null ? null : Number(hardLimitEur),
      softLimitEur == null ? null : Number(softLimitEur),
      unitLimit == null ? null : Number(unitLimit),
      enabled ? 1 : 0,
      nowIso,
      nowIso
    ]);
    return getWorkspaceProviderLimit({
      workspaceId: normalizedWorkspaceId,
      providerKey: provider.provider_key,
      period: normalizedPeriod
    });
  }

  async function createAlert({ workspaceId = null, providerKey = null, alertType, period, thresholdEur = null, currentCostEur = null }) {
    await adapter.exec(`
      INSERT INTO cost_alerts
      (id, workspace_id, provider_key, alert_type, period, threshold_eur, current_cost_eur, acknowledged, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)
    `, [
      uniqueId('alert'),
      workspaceId ? String(workspaceId).trim() : null,
      providerKey ? String(providerKey).trim().toLowerCase() : null,
      String(alertType || '').trim().toLowerCase(),
      normalizePeriod(period),
      thresholdEur == null ? null : Number(thresholdEur),
      currentCostEur == null ? null : Number(currentCostEur),
      isoNow(now())
    ]);
  }

  async function canUseProvider({ workspaceId, providerKey, estimatedCostEur = 0, period = 'monthly' }) {
    const normalizedWorkspaceId = String(workspaceId || '').trim();
    if (!normalizedWorkspaceId) {
      const error = new Error('workspaceId is required');
      error.statusCode = 400;
      throw error;
    }
    const normalizedEstimatedCost = Math.max(0, Number(estimatedCostEur || 0));
    const limit = await getWorkspaceProviderLimit({ workspaceId: normalizedWorkspaceId, providerKey, period });
    const usage = await getUsageSummary({ workspaceId: normalizedWorkspaceId, providerKey, period });
    if (!limit || !limit.enabled) {
      return {
        allowed: true,
        provider_key: String(providerKey).trim().toLowerCase(),
        workspace_id: normalizedWorkspaceId,
        period: normalizePeriod(period),
        used: usage.total_cost_eur,
        limit: null,
        estimated_cost_eur: normalizedEstimatedCost,
        soft_limit_eur: null,
        hard_limit_eur: null,
        alert_created: false
      };
    }

    const projectedCost = usage.total_cost_eur + normalizedEstimatedCost;
    const hardLimit = limit.hard_limit_eur == null ? null : Number(limit.hard_limit_eur);
    const softLimit = limit.soft_limit_eur == null ? null : Number(limit.soft_limit_eur);
    const blocked = hardLimit != null && projectedCost >= hardLimit;
    let alertCreated = false;

    if (softLimit != null && usage.total_cost_eur >= softLimit) {
      await createAlert({
        workspaceId: normalizedWorkspaceId,
        providerKey,
        alertType: 'soft_limit',
        period,
        thresholdEur: softLimit,
        currentCostEur: usage.total_cost_eur
      });
      alertCreated = true;
    }

    if (blocked) {
      await createAlert({
        workspaceId: normalizedWorkspaceId,
        providerKey,
        alertType: 'hard_limit',
        period,
        thresholdEur: hardLimit,
        currentCostEur: projectedCost
      });
      alertCreated = true;
    }

    return {
      allowed: !blocked,
      provider_key: String(providerKey).trim().toLowerCase(),
      workspace_id: normalizedWorkspaceId,
      period: normalizePeriod(period),
      used: usage.total_cost_eur,
      limit: hardLimit,
      estimated_cost_eur: normalizedEstimatedCost,
      projected_cost_eur: projectedCost,
      soft_limit_eur: softLimit,
      hard_limit_eur: hardLimit,
      alert_created: alertCreated
    };
  }

  async function enforceProviderLimit({ workspaceId, providerKey, estimatedCostEur = 0, period = 'monthly' }) {
    const check = await canUseProvider({ workspaceId, providerKey, estimatedCostEur, period });
    if (!check.allowed) {
      const error = new Error('Provider budget exceeded');
      error.statusCode = 402;
      error.payload = {
        error: 'Provider budget exceeded',
        providerKey: check.provider_key,
        workspaceId: check.workspace_id,
        used: check.used,
        limit: check.limit,
        estimatedCostEur: check.estimated_cost_eur
      };
      throw error;
    }
    return check;
  }

  async function getWorkspaceCostBreakdown({ workspaceId, period = 'monthly' }) {
    const normalizedWorkspaceId = String(workspaceId || '').trim();
    const normalizedPeriod = normalizePeriod(period);
    const { startIso, endIso } = periodRange(normalizedPeriod, now());
    const rows = await adapter.many(`
      SELECT
        provider_key,
        COALESCE(SUM(cost_eur), 0) AS total_cost_eur,
        COALESCE(SUM(units), 0) AS total_units,
        COUNT(*) AS row_count
      FROM usage_ledger
      WHERE workspace_id = ?
        AND created_at >= ?
        AND created_at < ?
      GROUP BY provider_key
      ORDER BY total_cost_eur DESC, provider_key ASC
    `, [normalizedWorkspaceId, startIso, endIso]);
    return {
      workspace_id: normalizedWorkspaceId,
      period: normalizedPeriod,
      total_cost_eur: sumNumber(rows, 'total_cost_eur'),
      providers: rows.map((row) => ({
        provider_key: row.provider_key,
        total_cost_eur: toFiniteNumber(row.total_cost_eur, 0),
        total_units: toFiniteNumber(row.total_units, 0),
        row_count: Number(row.row_count || 0)
      }))
    };
  }

  async function getProviderCostBreakdown({ providerKey, period = 'monthly' }) {
    const provider = await ensureProvider(providerKey);
    const normalizedPeriod = normalizePeriod(period);
    const { startIso, endIso } = periodRange(normalizedPeriod, now());
    const rows = await adapter.many(`
      SELECT
        workspace_id,
        COALESCE(SUM(cost_eur), 0) AS total_cost_eur,
        COALESCE(SUM(units), 0) AS total_units,
        COUNT(*) AS row_count
      FROM usage_ledger
      WHERE provider_key = ?
        AND created_at >= ?
        AND created_at < ?
      GROUP BY workspace_id
      ORDER BY total_cost_eur DESC, workspace_id ASC
    `, [provider.provider_key, startIso, endIso]);
    return {
      provider_key: provider.provider_key,
      period: normalizedPeriod,
      total_cost_eur: sumNumber(rows, 'total_cost_eur'),
      workspaces: rows.map((row) => ({
        workspace_id: row.workspace_id,
        total_cost_eur: toFiniteNumber(row.total_cost_eur, 0),
        total_units: toFiniteNumber(row.total_units, 0),
        row_count: Number(row.row_count || 0)
      }))
    };
  }

  async function getPlatformUsageSummary({ period = 'monthly' } = {}) {
    const normalizedPeriod = normalizePeriod(period);
    const { startIso, endIso } = periodRange(normalizedPeriod, now());
    const [providerRows, workspaceRows, totals] = await Promise.all([
      adapter.many(`
        SELECT provider_key, COALESCE(SUM(cost_eur), 0) AS total_cost_eur, COALESCE(SUM(units), 0) AS total_units
        FROM usage_ledger
        WHERE created_at >= ? AND created_at < ?
        GROUP BY provider_key
        ORDER BY total_cost_eur DESC, provider_key ASC
      `, [startIso, endIso]),
      adapter.many(`
        SELECT workspace_id, COALESCE(SUM(cost_eur), 0) AS total_cost_eur
        FROM usage_ledger
        WHERE created_at >= ? AND created_at < ?
        GROUP BY workspace_id
        ORDER BY total_cost_eur DESC, workspace_id ASC
      `, [startIso, endIso]),
      adapter.one(`
        SELECT COALESCE(SUM(cost_eur), 0) AS total_cost_eur, COALESCE(SUM(units), 0) AS total_units, COUNT(*) AS row_count
        FROM usage_ledger
        WHERE created_at >= ? AND created_at < ?
      `, [startIso, endIso])
    ]);
    return {
      period: normalizedPeriod,
      total_cost_eur: toFiniteNumber(totals?.total_cost_eur, 0),
      total_units: toFiniteNumber(totals?.total_units, 0),
      row_count: Number(totals?.row_count || 0),
      providers: providerRows.map((row) => ({
        provider_key: row.provider_key,
        total_cost_eur: toFiniteNumber(row.total_cost_eur, 0),
        total_units: toFiniteNumber(row.total_units, 0)
      })),
      workspaces: workspaceRows.map((row) => ({
        workspace_id: row.workspace_id,
        total_cost_eur: toFiniteNumber(row.total_cost_eur, 0)
      }))
    };
  }

  async function getDashboardOverview({ period = 'monthly' } = {}) {
    const [daily, monthly, yearly, selected, alerts, providers] = await Promise.all([
      getPlatformUsageSummary({ period: 'daily' }),
      getPlatformUsageSummary({ period: 'monthly' }),
      getPlatformUsageSummary({ period: 'yearly' }),
      getPlatformUsageSummary({ period }),
      listAlerts({ acknowledged: false, limit: 20 }),
      listProviders()
    ]);

    const providerMap = new Map(providers.map((provider) => [provider.provider_key, provider]));
    const providerBreakdown = providers.map((provider) => {
      const dailyRow = daily.providers.find((row) => row.provider_key === provider.provider_key);
      const monthlyRow = monthly.providers.find((row) => row.provider_key === provider.provider_key);
      const yearlyRow = yearly.providers.find((row) => row.provider_key === provider.provider_key);
      return {
        provider_key: provider.provider_key,
        display_name: provider.display_name,
        category: provider.category || '',
        today_cost_eur: toFiniteNumber(dailyRow?.total_cost_eur, 0),
        monthly_cost_eur: toFiniteNumber(monthlyRow?.total_cost_eur, 0),
        yearly_cost_eur: toFiniteNumber(yearlyRow?.total_cost_eur, 0)
      };
    });

    return {
      period: normalizePeriod(period),
      totals: {
        today_cost_eur: daily.total_cost_eur,
        monthly_cost_eur: monthly.total_cost_eur,
        yearly_cost_eur: yearly.total_cost_eur
      },
      top_providers: selected.providers.slice(0, 5).map((row) => ({
        provider_key: row.provider_key,
        display_name: providerMap.get(row.provider_key)?.display_name || row.provider_key,
        total_cost_eur: row.total_cost_eur
      })),
      top_workspaces: selected.workspaces.slice(0, 5),
      active_alerts: alerts.rows,
      provider_breakdown: providerBreakdown
    };
  }

  async function listProviderLimits({ workspaceId = null, providerKey = null } = {}) {
    const clauses = ['1 = 1'];
    const params = [];
    if (workspaceId === null || workspaceId === undefined || workspaceId === '') {
      // no filter
    } else if (String(workspaceId).trim().toLowerCase() === 'platform') {
      clauses.push('workspace_id IS NULL');
    } else {
      clauses.push('workspace_id = ?');
      params.push(String(workspaceId).trim());
    }
    if (providerKey) {
      clauses.push('provider_key = ?');
      params.push(String(providerKey).trim().toLowerCase());
    }
    const rows = await adapter.many(`
      SELECT *
      FROM workspace_provider_limits
      WHERE ${clauses.join(' AND ')}
      ORDER BY
        CASE WHEN workspace_id IS NULL THEN 0 ELSE 1 END ASC,
        workspace_id ASC,
        provider_key ASC,
        period ASC
    `, params);
    return rows.map(mapLimitRow);
  }

  async function deleteProviderLimit(id) {
    const normalizedId = String(id || '').trim();
    if (!normalizedId) {
      const error = new Error('id is required');
      error.statusCode = 400;
      throw error;
    }
    await adapter.exec(`DELETE FROM workspace_provider_limits WHERE id = ?`, [normalizedId]);
    return { ok: true, id: normalizedId };
  }

  async function listAlerts({ acknowledged = null, limit = 100 } = {}) {
    const clauses = ['1 = 1'];
    const params = [];
    if (acknowledged !== null && acknowledged !== undefined) {
      clauses.push('acknowledged = ?');
      params.push(acknowledged ? 1 : 0);
    }
    const rows = await adapter.many(`
      SELECT *
      FROM cost_alerts
      WHERE ${clauses.join(' AND ')}
      ORDER BY acknowledged ASC, created_at DESC
      LIMIT ?
    `, [...params, Math.max(1, Number(limit || 100))]);
    return {
      rows: rows.map(mapAlertRow)
    };
  }

  async function acknowledgeAlert(id) {
    const normalizedId = String(id || '').trim();
    if (!normalizedId) {
      const error = new Error('id is required');
      error.statusCode = 400;
      throw error;
    }
    await adapter.exec(`UPDATE cost_alerts SET acknowledged = 1 WHERE id = ?`, [normalizedId]);
    return { ok: true, id: normalizedId };
  }

  async function exportUsageCsv({ period = 'monthly' } = {}) {
    const normalizedPeriod = normalizePeriod(period);
    const { startIso, endIso } = periodRange(normalizedPeriod, now());
    const rows = await adapter.many(`
      SELECT workspace_id, provider_key, COALESCE(SUM(units), 0) AS total_units, COALESCE(SUM(cost_eur), 0) AS total_cost_eur
      FROM usage_ledger
      WHERE created_at >= ? AND created_at < ?
      GROUP BY workspace_id, provider_key
      ORDER BY workspace_id ASC, provider_key ASC
    `, [startIso, endIso]);
    const lines = [
      'workspace_id,provider_key,total_units,total_cost_eur'
    ];
    for (const row of rows) {
      lines.push([
        row.workspace_id,
        row.provider_key,
        toFiniteNumber(row.total_units, 0),
        toFiniteNumber(row.total_cost_eur, 0).toFixed(6)
      ].join(','));
    }
    return lines.join('\n');
  }

  return {
    seedProviderCatalog,
    listProviders,
    getProvider,
    recordUsage,
    getUsageSummary,
    getPlatformUsageSummary,
    getWorkspaceProviderLimit,
    setWorkspaceProviderLimit,
    canUseProvider,
    enforceProviderLimit,
    getDashboardOverview,
    getWorkspaceCostBreakdown,
    getProviderCostBreakdown,
    listProviderLimits,
    deleteProviderLimit,
    listAlerts,
    acknowledgeAlert,
    exportUsageCsv
  };
}

module.exports = {
  createCostControlService,
  normalizePeriod,
  periodRange,
  DEFAULT_PROVIDER_SEEDS
};
