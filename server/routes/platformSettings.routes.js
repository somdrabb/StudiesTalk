'use strict';

const express = require('express');

const PLATFORM_SETTINGS_KEY = 'platform_admin_config';

function getDefaultPlatformSettings() {
  return {
    defaults: {
      ai_budget: 5,
      max_users: 50
    },
    limits: {
      sms_per_day: 100,
      monthly_cost_alert_eur: 250,
      hard_monthly_cap_eur: 500
    },
    ai: {
      provider: 'openai',
      enabled: true,
      realtime_enabled: true
    },
    communication: {
      email_enabled: true,
      sms_enabled: true,
      default_sender_name: 'StudiesTalk',
      default_reply_to: ''
    },
    storage: {
      default_adapter: 'local',
      max_upload_mb: 25,
      retention_days: 365
    },
    security: {
      session_timeout_min: 30,
      audit_retention_days: 365,
      require_admin_2fa: false
    },
    features: {
      ai: true,
      sms: true,
      recording: true,
      beta: false
    }
  };
}

function toNumberOrFallback(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizePlatformSettings(settings = {}) {
  const defaults = getDefaultPlatformSettings();
  const source = settings && typeof settings === 'object' ? settings : {};
  return {
    defaults: {
      ai_budget: Math.max(0, toNumberOrFallback(source.defaults?.ai_budget, defaults.defaults.ai_budget)),
      max_users: Math.max(1, Math.round(toNumberOrFallback(source.defaults?.max_users, defaults.defaults.max_users)))
    },
    limits: {
      sms_per_day: Math.max(0, Math.round(toNumberOrFallback(source.limits?.sms_per_day, defaults.limits.sms_per_day))),
      monthly_cost_alert_eur: Math.max(0, toNumberOrFallback(source.limits?.monthly_cost_alert_eur, defaults.limits.monthly_cost_alert_eur)),
      hard_monthly_cap_eur: Math.max(0, toNumberOrFallback(source.limits?.hard_monthly_cap_eur, defaults.limits.hard_monthly_cap_eur))
    },
    ai: {
      provider: String(source.ai?.provider || defaults.ai.provider),
      enabled: !!source.ai?.enabled,
      realtime_enabled: !!source.ai?.realtime_enabled
    },
    communication: {
      email_enabled: source.communication?.email_enabled !== false,
      sms_enabled: source.communication?.sms_enabled !== false,
      default_sender_name: String(source.communication?.default_sender_name || defaults.communication.default_sender_name),
      default_reply_to: String(source.communication?.default_reply_to || '')
    },
    storage: {
      default_adapter: String(source.storage?.default_adapter || defaults.storage.default_adapter),
      max_upload_mb: Math.max(1, Math.round(toNumberOrFallback(source.storage?.max_upload_mb, defaults.storage.max_upload_mb))),
      retention_days: Math.max(0, Math.round(toNumberOrFallback(source.storage?.retention_days, defaults.storage.retention_days)))
    },
    security: {
      session_timeout_min: Math.max(5, Math.round(toNumberOrFallback(source.security?.session_timeout_min, defaults.security.session_timeout_min))),
      audit_retention_days: Math.max(0, Math.round(toNumberOrFallback(source.security?.audit_retention_days, defaults.security.audit_retention_days))),
      require_admin_2fa: !!source.security?.require_admin_2fa
    },
    features: {
      ai: source.features?.ai !== false,
      sms: source.features?.sms !== false,
      recording: source.features?.recording !== false,
      beta: !!source.features?.beta
    }
  };
}

function createPlatformSettingsRouter({
  authRequired,
  requireSuperAdmin,
  getPlatformSetting,
  setPlatformSetting,
  auditAction = null
} = {}) {
  if (typeof authRequired !== 'function') throw new Error('createPlatformSettingsRouter requires authRequired.');
  if (typeof requireSuperAdmin !== 'function') throw new Error('createPlatformSettingsRouter requires requireSuperAdmin.');
  if (typeof getPlatformSetting !== 'function') throw new Error('createPlatformSettingsRouter requires getPlatformSetting.');
  if (typeof setPlatformSetting !== 'function') throw new Error('createPlatformSettingsRouter requires setPlatformSetting.');

  const router = express.Router();
  router.use(express.json());

  function resolveSuperAdmin(req, res) {
    const user = requireSuperAdmin(req, res);
    return user || null;
  }

  function audit(req, user, action, meta = {}) {
    if (typeof auditAction === 'function') {
      auditAction(action, req, { user, workspaceId: null, target: PLATFORM_SETTINGS_KEY, meta });
    }
  }

  router.get('/', authRequired, (req, res) => {
    const user = resolveSuperAdmin(req, res);
    if (!user) return;
    try {
      const raw = getPlatformSetting(PLATFORM_SETTINGS_KEY, null);
      const parsed = raw ? JSON.parse(raw) : {};
      return res.json({ key: PLATFORM_SETTINGS_KEY, settings: normalizePlatformSettings(parsed) });
    } catch (error) {
      return res.status(500).json({ error: 'Failed to load platform settings' });
    }
  });

  router.put('/', authRequired, (req, res) => {
    const user = resolveSuperAdmin(req, res);
    if (!user) return;
    try {
      const settings = normalizePlatformSettings(req.body?.settings || {});
      setPlatformSetting(PLATFORM_SETTINGS_KEY, JSON.stringify(settings));
      audit(req, user, 'platform.settings.update', { settings });
      return res.json({ ok: true, key: PLATFORM_SETTINGS_KEY, settings });
    } catch (error) {
      return res.status(400).json({ error: error.message || 'Failed to save platform settings' });
    }
  });

  return router;
}

module.exports = {
  createPlatformSettingsRouter,
  normalizePlatformSettings,
  getDefaultPlatformSettings
};
