'use strict';

const defaultDb = require('../../db');

const GLOBAL_SCOPE = 'global';
const WORKSPACE_SCOPE = 'workspace';
const GLOBAL_KEY = 'platform_control:global';
const GLOBAL_ID = 'platform_control_global';
const KNOWN_PROVIDERS = ['openai', 'twilio', 'googleTranslate', 'ionosEmail', 'storage', 'jitsi'];
const KNOWN_FEATURES = ['aiEnabled', 'smsEnabled', 'emailEnabled', 'liveClassesEnabled', 'recordingEnabled', 'analyticsEnabled', 'paymentsEnabled'];

function nowDate() {
  return new Date();
}

function normalizeDbAdapter(db) {
  if (!db) throw new Error('Platform control service requires a database handle.');

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
      },
      raw: db
    };
  }

  throw new Error('Unsupported database handle for platform control service.');
}

function isoNow(now = nowDate()) {
  const date = now instanceof Date ? now : new Date(now);
  return date.toISOString();
}

function clone(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return {};
  }
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function deepMerge(base, override) {
  if (Array.isArray(base) || Array.isArray(override)) {
    return clone(override);
  }
  const result = { ...(isPlainObject(base) ? base : {}) };
  const source = isPlainObject(override) ? override : {};
  for (const [key, value] of Object.entries(source)) {
    if (isPlainObject(value) && isPlainObject(result[key])) {
      result[key] = deepMerge(result[key], value);
    } else {
      result[key] = clone(value);
    }
  }
  return result;
}

function asNonNegativeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function asPositiveInt(value, fallback = 1) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : fallback;
}

function toStringArray(value, fallback = []) {
  if (!Array.isArray(value)) return [...fallback];
  return value
    .map((item) => String(item || '').trim().toLowerCase())
    .filter(Boolean);
}

function defaultSettings() {
  return {
    workspaceDefaults: {
      maxUsersPerWorkspace: 50,
      defaultAiBudgetEur: 5,
      defaultStorageGb: 5,
      defaultEmailDailyLimit: 500,
      defaultSmsDailyLimit: 50
    },
    features: {
      aiEnabled: true,
      smsEnabled: true,
      emailEnabled: true,
      liveClassesEnabled: true,
      recordingEnabled: false,
      analyticsEnabled: true,
      paymentsEnabled: false
    },
    costGovernance: {
      platformMonthlyBudgetEur: 100,
      workspaceMonthlyHardLimitEur: 20,
      workspaceMonthlySoftLimitEur: 15,
      alertThresholdPercent: 80,
      blockOnHardLimit: true
    },
    providerLimits: {
      openai: {
        monthlyLimitEur: 10,
        enabled: true
      },
      twilio: {
        dailySmsLimit: 50,
        monthlyLimitEur: 10,
        enabled: true
      },
      googleTranslate: {
        monthlyCharacterLimit: 500000,
        monthlyLimitEur: 10,
        enabled: true
      },
      ionosEmail: {
        dailyEmailLimit: 500,
        monthlyLimitEur: 5,
        enabled: true
      },
      storage: {
        maxGbPerWorkspace: 5,
        monthlyLimitEur: 5,
        enabled: true
      },
      jitsi: {
        monthlyLimitEur: 20,
        enabled: false
      }
    },
    ai: {
      provider: 'openai',
      enabled: true,
      realtimeEnabled: true,
      defaultModel: 'gpt-4o-mini',
      realtimeVoice: 'alloy',
      maxTokensPerRequest: 4000,
      maxSessionSeconds: 1800,
      idleTimeoutSeconds: 45,
      allowAiForNewWorkspaces: true
    },
    communication: {
      emailEnabled: true,
      smsEnabled: true,
      defaultSenderName: 'StudiesTalk',
      defaultReplyTo: '',
      maxOtpPerUserPerDay: 5,
      maxEmailsPerWorkspacePerDay: 500,
      useOwnerEmailFallback: true
    },
    storage: {
      defaultAdapter: 'local',
      uploadEnabled: true,
      maxFileMb: 25,
      maxVideoMb: 200,
      retentionDays: 365,
      allowedTypes: ['pdf', 'docx', 'png', 'jpg', 'jpeg', 'mp3', 'mp4']
    },
    security: {
      requireEmailVerification: true,
      maxLoginAttempts: 8,
      lockoutMinutes: 15,
      sessionTimeoutMinutes: 60,
      auditRetentionDays: 365,
      requireAdmin2fa: false,
      requireStrongPasswords: true,
      allowDevBypass: false
    },
    subscriptions: {
      defaultPlan: 'starter',
      trialDays: 14,
      autoSuspendOnFailedPayment: false,
      plans: {
        starter: {
          monthlyPriceEur: 49,
          maxUsers: 50,
          aiBudgetEur: 5,
          storageGb: 5
        },
        professional: {
          monthlyPriceEur: 149,
          maxUsers: 200,
          aiBudgetEur: 25,
          storageGb: 50
        },
        enterprise: {
          monthlyPriceEur: 499,
          maxUsers: 1000,
          aiBudgetEur: 100,
          storageGb: 250
        }
      }
    }
  };
}

function normalizeSettings(settings = {}) {
  const source = isPlainObject(settings) ? settings : {};
  const defaults = defaultSettings();
  const merged = deepMerge(defaults, source);
  const normalized = {
    workspaceDefaults: {
      maxUsersPerWorkspace: asPositiveInt(merged.workspaceDefaults?.maxUsersPerWorkspace, defaults.workspaceDefaults.maxUsersPerWorkspace),
      defaultAiBudgetEur: asNonNegativeNumber(merged.workspaceDefaults?.defaultAiBudgetEur, defaults.workspaceDefaults.defaultAiBudgetEur),
      defaultStorageGb: asNonNegativeNumber(merged.workspaceDefaults?.defaultStorageGb, defaults.workspaceDefaults.defaultStorageGb),
      defaultEmailDailyLimit: asPositiveInt(merged.workspaceDefaults?.defaultEmailDailyLimit, defaults.workspaceDefaults.defaultEmailDailyLimit),
      defaultSmsDailyLimit: asPositiveInt(merged.workspaceDefaults?.defaultSmsDailyLimit, defaults.workspaceDefaults.defaultSmsDailyLimit)
    },
    features: {},
    costGovernance: {
      platformMonthlyBudgetEur: asNonNegativeNumber(merged.costGovernance?.platformMonthlyBudgetEur, defaults.costGovernance.platformMonthlyBudgetEur),
      workspaceMonthlyHardLimitEur: asNonNegativeNumber(merged.costGovernance?.workspaceMonthlyHardLimitEur, defaults.costGovernance.workspaceMonthlyHardLimitEur),
      workspaceMonthlySoftLimitEur: asNonNegativeNumber(merged.costGovernance?.workspaceMonthlySoftLimitEur, defaults.costGovernance.workspaceMonthlySoftLimitEur),
      alertThresholdPercent: Math.min(100, Math.max(0, asNonNegativeNumber(merged.costGovernance?.alertThresholdPercent, defaults.costGovernance.alertThresholdPercent))),
      blockOnHardLimit: !!merged.costGovernance?.blockOnHardLimit
    },
    providerLimits: {},
    ai: {
      provider: String(merged.ai?.provider || defaults.ai.provider).trim() || defaults.ai.provider,
      enabled: merged.ai?.enabled !== undefined ? !!merged.ai.enabled : !!defaults.ai.enabled,
      realtimeEnabled: merged.ai?.realtimeEnabled !== undefined ? !!merged.ai.realtimeEnabled : !!defaults.ai.realtimeEnabled,
      defaultModel: String(merged.ai?.defaultModel || defaults.ai.defaultModel).trim(),
      realtimeVoice: String(merged.ai?.realtimeVoice || defaults.ai.realtimeVoice).trim(),
      maxTokensPerRequest: asPositiveInt(merged.ai?.maxTokensPerRequest, defaults.ai.maxTokensPerRequest),
      maxSessionSeconds: asPositiveInt(merged.ai?.maxSessionSeconds, defaults.ai.maxSessionSeconds),
      idleTimeoutSeconds: asPositiveInt(merged.ai?.idleTimeoutSeconds, defaults.ai.idleTimeoutSeconds),
      allowAiForNewWorkspaces: !!merged.ai?.allowAiForNewWorkspaces
    },
    communication: {
      emailEnabled: !!merged.communication?.emailEnabled,
      smsEnabled: !!merged.communication?.smsEnabled,
      defaultSenderName: String(merged.communication?.defaultSenderName || defaults.communication.defaultSenderName).trim(),
      defaultReplyTo: String(merged.communication?.defaultReplyTo || defaults.communication.defaultReplyTo).trim(),
      maxOtpPerUserPerDay: asPositiveInt(merged.communication?.maxOtpPerUserPerDay, defaults.communication.maxOtpPerUserPerDay),
      maxEmailsPerWorkspacePerDay: asPositiveInt(merged.communication?.maxEmailsPerWorkspacePerDay, defaults.communication.maxEmailsPerWorkspacePerDay),
      useOwnerEmailFallback: !!merged.communication?.useOwnerEmailFallback
    },
    storage: {
      defaultAdapter: String(merged.storage?.defaultAdapter || defaults.storage.defaultAdapter).trim() || defaults.storage.defaultAdapter,
      uploadEnabled: !!merged.storage?.uploadEnabled,
      maxFileMb: asPositiveInt(merged.storage?.maxFileMb, defaults.storage.maxFileMb),
      maxVideoMb: asPositiveInt(merged.storage?.maxVideoMb, defaults.storage.maxVideoMb),
      retentionDays: asPositiveInt(merged.storage?.retentionDays, defaults.storage.retentionDays),
      allowedTypes: toStringArray(merged.storage?.allowedTypes, defaults.storage.allowedTypes)
    },
    security: {
      requireEmailVerification: !!merged.security?.requireEmailVerification,
      maxLoginAttempts: asPositiveInt(merged.security?.maxLoginAttempts, defaults.security.maxLoginAttempts),
      lockoutMinutes: asPositiveInt(merged.security?.lockoutMinutes, defaults.security.lockoutMinutes),
      sessionTimeoutMinutes: asPositiveInt(merged.security?.sessionTimeoutMinutes, defaults.security.sessionTimeoutMinutes),
      auditRetentionDays: asPositiveInt(merged.security?.auditRetentionDays, defaults.security.auditRetentionDays),
      requireAdmin2fa: !!merged.security?.requireAdmin2fa,
      requireStrongPasswords: !!merged.security?.requireStrongPasswords,
      allowDevBypass: !!merged.security?.allowDevBypass
    },
    subscriptions: {
      defaultPlan: String(merged.subscriptions?.defaultPlan || defaults.subscriptions.defaultPlan).trim(),
      trialDays: asPositiveInt(merged.subscriptions?.trialDays, defaults.subscriptions.trialDays),
      autoSuspendOnFailedPayment: !!merged.subscriptions?.autoSuspendOnFailedPayment,
      plans: {}
    }
  };

  for (const featureKey of KNOWN_FEATURES) {
    normalized.features[featureKey] = !!merged.features?.[featureKey];
  }

  for (const providerKey of KNOWN_PROVIDERS) {
    const providerDefaults = defaults.providerLimits[providerKey] || {};
    const providerSource = merged.providerLimits?.[providerKey] || {};
    normalized.providerLimits[providerKey] = {
      ...providerDefaults,
      ...providerSource,
      enabled: providerSource.enabled !== undefined ? !!providerSource.enabled : !!providerDefaults.enabled
    };
    if (normalized.providerLimits[providerKey].monthlyLimitEur !== undefined) {
      normalized.providerLimits[providerKey].monthlyLimitEur = asNonNegativeNumber(
        normalized.providerLimits[providerKey].monthlyLimitEur,
        asNonNegativeNumber(providerDefaults.monthlyLimitEur, 0)
      );
    }
    if (normalized.providerLimits[providerKey].dailySmsLimit !== undefined) {
      normalized.providerLimits[providerKey].dailySmsLimit = asPositiveInt(
        normalized.providerLimits[providerKey].dailySmsLimit,
        asPositiveInt(providerDefaults.dailySmsLimit, 0)
      );
    }
    if (normalized.providerLimits[providerKey].monthlyCharacterLimit !== undefined) {
      normalized.providerLimits[providerKey].monthlyCharacterLimit = asPositiveInt(
        normalized.providerLimits[providerKey].monthlyCharacterLimit,
        asPositiveInt(providerDefaults.monthlyCharacterLimit, 0)
      );
    }
    if (normalized.providerLimits[providerKey].dailyEmailLimit !== undefined) {
      normalized.providerLimits[providerKey].dailyEmailLimit = asPositiveInt(
        normalized.providerLimits[providerKey].dailyEmailLimit,
        asPositiveInt(providerDefaults.dailyEmailLimit, 0)
      );
    }
    if (normalized.providerLimits[providerKey].maxGbPerWorkspace !== undefined) {
      normalized.providerLimits[providerKey].maxGbPerWorkspace = asNonNegativeNumber(
        normalized.providerLimits[providerKey].maxGbPerWorkspace,
        asNonNegativeNumber(providerDefaults.maxGbPerWorkspace, 0)
      );
    }
  }

  const plansSource = isPlainObject(merged.subscriptions?.plans) ? merged.subscriptions.plans : defaults.subscriptions.plans;
  for (const [planKey, plan] of Object.entries(plansSource)) {
    normalized.subscriptions.plans[planKey] = {
      monthlyPriceEur: asNonNegativeNumber(plan?.monthlyPriceEur, 0),
      maxUsers: asPositiveInt(plan?.maxUsers, 1),
      aiBudgetEur: asNonNegativeNumber(plan?.aiBudgetEur, 0),
      storageGb: asNonNegativeNumber(plan?.storageGb, 0)
    };
  }

  return normalized;
}

function validatePlatformSettings(settings = {}) {
  const normalized = normalizeSettings(settings);
  const errors = [];
  if (!KNOWN_FEATURES.every((key) => typeof normalized.features[key] === 'boolean')) {
    errors.push('features contains invalid values');
  }
  if (!Array.isArray(normalized.storage.allowedTypes) || !normalized.storage.allowedTypes.length) {
    errors.push('storage.allowedTypes must be a non-empty array');
  }
  for (const providerKey of Object.keys(normalized.providerLimits || {})) {
    if (!KNOWN_PROVIDERS.includes(providerKey)) {
      errors.push(`Unknown provider key: ${providerKey}`);
    }
  }
  for (const [planKey, plan] of Object.entries(normalized.subscriptions.plans || {})) {
    if (!planKey) errors.push('Subscription plans must use non-empty keys');
    ['monthlyPriceEur', 'maxUsers', 'aiBudgetEur', 'storageGb'].forEach((field) => {
      if (Number(plan[field]) < 0) {
        errors.push(`subscriptions.plans.${planKey}.${field} must be >= 0`);
      }
    });
  }
  if (errors.length) {
    const error = new Error(errors.join('; '));
    error.statusCode = 400;
    throw error;
  }
  return normalized;
}

function parseSettingsJson(value, fallback = {}) {
  if (!value) return clone(fallback);
  try {
    return JSON.parse(value);
  } catch {
    return clone(fallback);
  }
}

function mapRow(row) {
  if (!row) return null;
  return {
    key: row.key || row.id || null,
    id: row.id || row.key || null,
    scope: row.scope || GLOBAL_SCOPE,
    workspace_id: row.workspace_id || null,
    settings_json: row.settings_json || row.value || '{}',
    created_at: row.created_at || null,
    updated_at: row.updated_at || null
  };
}

function createPlatformControlService({
  db = defaultDb,
  now = nowDate
} = {}) {
  const adapter = normalizeDbAdapter(db);

  async function ensureSchema() {
    if (adapter.engine !== 'sqlite' || !adapter.raw) return;
    const raw = adapter.raw;
    raw.prepare(`
      CREATE TABLE IF NOT EXISTS platform_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      )
    `).run();
    const alters = [
      "ALTER TABLE platform_settings ADD COLUMN id TEXT DEFAULT ''",
      "ALTER TABLE platform_settings ADD COLUMN scope TEXT DEFAULT 'global'",
      "ALTER TABLE platform_settings ADD COLUMN workspace_id TEXT DEFAULT NULL",
      "ALTER TABLE platform_settings ADD COLUMN settings_json TEXT DEFAULT ''",
      "ALTER TABLE platform_settings ADD COLUMN created_at TEXT DEFAULT ''"
    ];
    for (const sql of alters) {
      try {
        raw.exec(sql);
      } catch (error) {
        if (!String(error?.message || '').toLowerCase().includes('duplicate column')) throw error;
      }
    }
    raw.prepare(`
      UPDATE platform_settings
      SET id = CASE WHEN COALESCE(id, '') = '' THEN key ELSE id END,
          settings_json = CASE WHEN COALESCE(settings_json, '') = '' THEN value ELSE settings_json END,
          created_at = CASE WHEN COALESCE(created_at, '') = '' THEN updated_at ELSE created_at END
      WHERE COALESCE(id, '') = ''
         OR COALESCE(settings_json, '') = ''
         OR COALESCE(created_at, '') = ''
    `).run();
    raw.prepare(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_settings_scope_workspace
      ON platform_settings(scope, workspace_id)
      WHERE id LIKE 'platform_control:%'
    `).run();
  }

  async function getRow(scope = GLOBAL_SCOPE, workspaceId = null) {
    const sql = `
      SELECT key, id, scope, workspace_id, settings_json, created_at, updated_at, value
      FROM platform_settings
      WHERE scope = ? AND ${scope === GLOBAL_SCOPE ? 'workspace_id IS NULL' : 'workspace_id = ?'}
      ORDER BY updated_at DESC
      LIMIT 1
    `;
    const params = scope === GLOBAL_SCOPE ? [GLOBAL_SCOPE] : [WORKSPACE_SCOPE, String(workspaceId || '').trim()];
    const row = await adapter.one(sql, params);
    return mapRow(row);
  }

  async function saveRow({ key, id, scope, workspaceId = null, settings }) {
    const timestamp = isoNow(now());
    const normalized = validatePlatformSettings(settings);
    const settingsJson = JSON.stringify(normalized);
    await adapter.exec(`
      INSERT INTO platform_settings (key, value, updated_at, id, scope, workspace_id, settings_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = excluded.updated_at,
        id = excluded.id,
        scope = excluded.scope,
        workspace_id = excluded.workspace_id,
        settings_json = excluded.settings_json
    `, [
      key,
      settingsJson,
      timestamp,
      id,
      scope,
      workspaceId,
      settingsJson,
      timestamp
    ]);
    return {
      id,
      key,
      scope,
      workspace_id: workspaceId,
      settings_json: settingsJson,
      created_at: timestamp,
      updated_at: timestamp,
      settings: normalized
    };
  }

  async function getGlobalSettings() {
    const row = await getRow(GLOBAL_SCOPE, null);
    const settings = row ? parseSettingsJson(row.settings_json, defaultSettings()) : defaultSettings();
    return {
      row,
      settings: normalizeSettings(settings)
    };
  }

  async function updateGlobalSettings(partialSettings = {}) {
    const current = await getGlobalSettings();
    const merged = deepMerge(current.settings, partialSettings);
    return saveRow({
      key: GLOBAL_KEY,
      id: GLOBAL_ID,
      scope: GLOBAL_SCOPE,
      workspaceId: null,
      settings: merged
    });
  }

  async function resetGlobalSettingsToDefaults() {
    return saveRow({
      key: GLOBAL_KEY,
      id: GLOBAL_ID,
      scope: GLOBAL_SCOPE,
      workspaceId: null,
      settings: defaultSettings()
    });
  }

  async function getWorkspaceSettings(workspaceId) {
    const normalizedWorkspaceId = String(workspaceId || '').trim();
    if (!normalizedWorkspaceId) {
      const error = new Error('workspaceId is required');
      error.statusCode = 400;
      throw error;
    }
    const row = await getRow(WORKSPACE_SCOPE, normalizedWorkspaceId);
    const settings = row ? parseSettingsJson(row.settings_json, {}) : {};
    return {
      row,
      workspaceId: normalizedWorkspaceId,
      settings
    };
  }

  async function updateWorkspaceSettings(workspaceId, partialSettings = {}) {
    const normalizedWorkspaceId = String(workspaceId || '').trim();
    if (!normalizedWorkspaceId) {
      const error = new Error('workspaceId is required');
      error.statusCode = 400;
      throw error;
    }
    const current = await getWorkspaceSettings(normalizedWorkspaceId);
    const merged = deepMerge(current.settings || {}, partialSettings);
    const global = await getGlobalSettings();
    validatePlatformSettings(deepMerge(global.settings, merged));
    const timestamp = isoNow(now());
    const settingsJson = JSON.stringify(merged);
    const key = `platform_control:workspace:${normalizedWorkspaceId}`;
    const id = `platform_control_workspace_${normalizedWorkspaceId}`;
    await adapter.exec(`
      INSERT INTO platform_settings (key, value, updated_at, id, scope, workspace_id, settings_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = excluded.updated_at,
        id = excluded.id,
        scope = excluded.scope,
        workspace_id = excluded.workspace_id,
        settings_json = excluded.settings_json
    `, [
      key,
      settingsJson,
      timestamp,
      id,
      WORKSPACE_SCOPE,
      normalizedWorkspaceId,
      settingsJson,
      timestamp
    ]);
    return {
      id,
      key,
      scope: WORKSPACE_SCOPE,
      workspace_id: normalizedWorkspaceId,
      settings_json: settingsJson,
      created_at: timestamp,
      updated_at: timestamp,
      settings: merged
    };
  }

  async function resetWorkspaceOverride(workspaceId) {
    const normalizedWorkspaceId = String(workspaceId || '').trim();
    if (!normalizedWorkspaceId) {
      const error = new Error('workspaceId is required');
      error.statusCode = 400;
      throw error;
    }
    await adapter.exec(`
      DELETE FROM platform_settings
      WHERE scope = ? AND workspace_id = ?
    `, [WORKSPACE_SCOPE, normalizedWorkspaceId]);
    return { ok: true, workspaceId: normalizedWorkspaceId };
  }

  async function getEffectiveSettings(workspaceId) {
    const global = await getGlobalSettings();
    if (!workspaceId) return global.settings;
    const workspace = await getWorkspaceSettings(workspaceId);
    return normalizeSettings(deepMerge(global.settings, workspace.settings || {}));
  }

  async function isFeatureEnabled(workspaceId, featureKey) {
    const key = String(featureKey || '').trim();
    if (!KNOWN_FEATURES.includes(key)) {
      const error = new Error(`Unknown feature key: ${key}`);
      error.statusCode = 400;
      throw error;
    }
    const effective = await getEffectiveSettings(workspaceId);
    return !!effective.features[key];
  }

  async function getProviderLimit(workspaceId, providerKey) {
    const key = String(providerKey || '').trim();
    if (!KNOWN_PROVIDERS.includes(key)) {
      const error = new Error(`Unknown provider key: ${key}`);
      error.statusCode = 400;
      throw error;
    }
    const effective = await getEffectiveSettings(workspaceId);
    return clone(effective.providerLimits[key] || {});
  }

  async function getSubscriptionPlan(planKey, workspaceId = null) {
    const effective = await getEffectiveSettings(workspaceId);
    const key = String(planKey || '').trim();
    return clone(effective.subscriptions?.plans?.[key] || null);
  }

  return {
    ensureSchema,
    getDefaultSettings: defaultSettings,
    getGlobalSettings,
    updateGlobalSettings,
    getWorkspaceSettings,
    updateWorkspaceSettings,
    getEffectiveSettings,
    validatePlatformSettings,
    resetGlobalSettingsToDefaults,
    resetWorkspaceOverride,
    isFeatureEnabled,
    getProviderLimit,
    getSubscriptionPlan,
    normalizeSettings
  };
}

module.exports = {
  createPlatformControlService,
  validatePlatformSettings,
  normalizePlatformSettings: normalizeSettings,
  getDefaultPlatformControlSettings: defaultSettings,
  KNOWN_PROVIDERS,
  KNOWN_FEATURES
};
