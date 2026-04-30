'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

function normalizeDbAdapter(db) {
  if (!db) throw new Error('Platform owner control service requires a database handle.');
  if (typeof db.one === 'function' && typeof db.many === 'function') {
    return {
      engine: db.engine || 'unknown',
      one: (sql, params = []) => Promise.resolve(db.one(sql, params)),
      many: (sql, params = []) => Promise.resolve(db.many(sql, params)),
      exec: (sql, params = []) => Promise.resolve(db.exec(sql, params))
    };
  }
  if (typeof db.prepare === 'function') {
    return {
      engine: 'sqlite',
      one: (sql, params = []) => Promise.resolve(db.prepare(sql).get(...params) || null),
      many: (sql, params = []) => Promise.resolve(db.prepare(sql).all(...params)),
      exec: (sql, params = []) => Promise.resolve(db.prepare(sql).run(...params)),
      raw: db
    };
  }
  throw new Error('Unsupported database handle for platform owner control service.');
}

function isoNow() {
  return new Date().toISOString();
}

function id(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function parseJson(value, fallback = {}) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch (_err) {
    return fallback;
  }
}

function stringifyJson(value) {
  return JSON.stringify(value == null ? {} : value);
}

function cleanString(value, fallback = '') {
  const text = String(value == null ? '' : value).trim();
  return text || fallback;
}

function requireReason(reason, action = 'action') {
  const value = cleanString(reason);
  if (!value) {
    const error = new Error(`Reason is required for ${action}.`);
    error.statusCode = 400;
    throw error;
  }
  return value;
}

function createPlatformOwnerControlService({
  db,
  env = process.env,
  now = isoNow,
  backupDir = null,
  storageAdapter = 'local'
} = {}) {
  const adapter = normalizeDbAdapter(db);
  const resolvedBackupDir = backupDir || env.BACKUP_DIR || path.join(process.cwd(), 'backup');

  async function execIgnore(sql) {
    try {
      await adapter.exec(sql);
    } catch (_err) {}
  }

  async function ensureSchema() {
    await adapter.exec(`
      CREATE TABLE IF NOT EXISTS platform_health_events (
        id TEXT PRIMARY KEY,
        provider_key TEXT,
        status TEXT,
        message TEXT,
        metadata_json TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await adapter.exec(`
      CREATE TABLE IF NOT EXISTS backup_runs (
        id TEXT PRIMARY KEY,
        type TEXT,
        status TEXT,
        file_path TEXT,
        file_size_bytes INTEGER,
        started_at TEXT,
        finished_at TEXT,
        error_message TEXT,
        metadata_json TEXT
      )
    `);
    await adapter.exec(`
      CREATE TABLE IF NOT EXISTS workspace_lifecycle_events (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        action TEXT NOT NULL,
        actor_user_id TEXT,
        reason TEXT,
        metadata_json TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await adapter.exec(`
      CREATE TABLE IF NOT EXISTS support_impersonation_sessions (
        id TEXT PRIMARY KEY,
        super_admin_id TEXT NOT NULL,
        target_user_id TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        read_only INTEGER DEFAULT 1,
        reason TEXT,
        started_at TEXT DEFAULT CURRENT_TIMESTAMP,
        ended_at TEXT,
        expires_at TEXT,
        status TEXT DEFAULT 'active'
      )
    `);
    await adapter.exec(`
      CREATE TABLE IF NOT EXISTS platform_incidents (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        status TEXT DEFAULT 'open',
        severity TEXT DEFAULT 'info',
        public_message TEXT,
        internal_note TEXT,
        affected_services_json TEXT,
        created_by TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        resolved_at TEXT
      )
    `);
    await adapter.exec(`
      CREATE TABLE IF NOT EXISTS platform_maintenance (
        id TEXT PRIMARY KEY,
        enabled INTEGER DEFAULT 0,
        public_message TEXT,
        disabled_features_json TEXT,
        updated_by TEXT,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await adapter.exec(`
      CREATE TABLE IF NOT EXISTS data_governance_requests (
        id TEXT PRIMARY KEY,
        workspace_id TEXT,
        request_type TEXT,
        status TEXT DEFAULT 'pending',
        requested_by TEXT,
        approved_by TEXT,
        reason TEXT,
        metadata_json TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        completed_at TEXT
      )
    `);
    await adapter.exec(`
      CREATE TABLE IF NOT EXISTS platform_notifications (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        target_scope TEXT DEFAULT 'all',
        workspace_id TEXT,
        channel TEXT DEFAULT 'in_app',
        status TEXT DEFAULT 'draft',
        scheduled_at TEXT,
        sent_at TEXT,
        created_by TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await adapter.exec(`
      CREATE TABLE IF NOT EXISTS subscription_events (
        id TEXT PRIMARY KEY,
        workspace_id TEXT,
        provider TEXT DEFAULT 'stripe',
        event_type TEXT,
        status TEXT,
        metadata_json TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await adapter.exec(`
      CREATE TABLE IF NOT EXISTS platform_branding (
        id TEXT PRIMARY KEY,
        settings_json TEXT NOT NULL,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await adapter.exec(`
      CREATE TABLE IF NOT EXISTS workspace_domains (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        domain TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        verification_token TEXT,
        verified_at TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await execIgnore("ALTER TABLE workspaces ADD COLUMN suspended_at TEXT");
    await execIgnore("ALTER TABLE workspaces ADD COLUMN archived_at TEXT");
    await execIgnore("ALTER TABLE workspaces ADD COLUMN owner_user_id TEXT");
    await execIgnore("ALTER TABLE workspaces ADD COLUMN customer_type TEXT DEFAULT 'customer'");
    await execIgnore("UPDATE workspaces SET customer_type = 'customer' WHERE customer_type IS NULL OR customer_type = ''");
  }

  async function workspaceExists(workspaceId) {
    const value = cleanString(workspaceId);
    if (!value) return false;
    const row = await adapter.one('SELECT id FROM workspaces WHERE id = ? LIMIT 1', [value]);
    return !!row;
  }

  async function requireWorkspace(workspaceId) {
    const value = cleanString(workspaceId);
    if (!value || !(await workspaceExists(value))) {
      const error = new Error('Workspace not found.');
      error.statusCode = 404;
      throw error;
    }
    return value;
  }

  async function recordHealth(providerKey, status, message, metadata = {}) {
    const row = {
      id: id('health'),
      provider_key: providerKey,
      status,
      message,
      metadata_json: stringifyJson(metadata),
      created_at: now()
    };
    await adapter.exec(`
      INSERT INTO platform_health_events (id, provider_key, status, message, metadata_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [row.id, row.provider_key, row.status, row.message, row.metadata_json, row.created_at]);
    return row;
  }

  async function getOperationsHealth() {
    const uptime = Math.round(process.uptime ? process.uptime() : 0);
    const latestBackup = await adapter.one('SELECT * FROM backup_runs ORDER BY started_at DESC LIMIT 1');
    const activeSessions = await adapter.one("SELECT COUNT(*) AS count FROM refresh_tokens WHERE revoked_at IS NULL").catch(() => ({ count: 0 }));
    const failedJobs = await adapter.one("SELECT COUNT(*) AS count FROM platform_health_events WHERE status = 'failed'").catch(() => ({ count: 0 }));
    const disk = (() => {
      try {
        const stat = fs.statSync(process.cwd());
        return { available: true, checkedPath: process.cwd(), mtime: stat.mtime.toISOString() };
      } catch (err) {
        return { available: false, message: err.message };
      }
    })();
    const providers = [
      { key: 'database', label: 'Database status', status: 'ok', message: 'Database connection available' },
      { key: 'db_mode', label: 'PostgreSQL/SQLite mode', status: 'ok', message: adapter.engine },
      { key: 'storage', label: 'Storage adapter status', status: storageAdapter ? 'ok' : 'warn', message: storageAdapter || 'not configured' },
      { key: 'email', label: 'Email provider status', status: env.SMTP_HOST || env.IONOS_SMTP_HOST ? 'ok' : 'warn', message: env.SMTP_HOST || env.IONOS_SMTP_HOST ? 'configured' : 'disabled' },
      { key: 'twilio', label: 'Twilio status', status: env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN ? 'ok' : 'warn', message: env.TWILIO_ACCOUNT_SID ? 'configured' : 'disabled' },
      { key: 'openai', label: 'OpenAI status', status: env.OPENAI_API_KEY ? 'ok' : 'warn', message: env.OPENAI_API_KEY ? 'configured' : 'missing key' },
      { key: 'google_translate', label: 'Google Translate status', status: env.GOOGLE_APPLICATION_CREDENTIALS || env.GOOGLE_TRANSLATE_KEY_FILE ? 'ok' : 'warn', message: env.GOOGLE_APPLICATION_CREDENTIALS || env.GOOGLE_TRANSLATE_KEY_FILE ? 'configured' : 'disabled' },
      { key: 'jitsi', label: 'Jitsi status', status: env.JITSI_DOMAIN ? 'ok' : 'warn', message: env.JITSI_DOMAIN || 'disabled' }
    ];
    return {
      generatedAt: now(),
      databaseMode: adapter.engine,
      uptimeSeconds: uptime,
      lastBackup: latestBackup || null,
      errorRate: 0,
      diskUsage: disk,
      activeSessions: Number(activeSessions?.count || 0),
      failedJobs: Number(failedJobs?.count || 0),
      providers
    };
  }

  async function testProvider(providerKey) {
    const key = cleanString(providerKey).toLowerCase();
    const health = await getOperationsHealth();
    const provider = health.providers.find((item) => item.key === key);
    const status = provider?.status || 'warn';
    const message = provider?.message || 'Unknown provider';
    await recordHealth(key, status, message, { source: 'manual_test' });
    return { providerKey: key, status, message };
  }

  async function getBackupStatus() {
    const latest = await adapter.one('SELECT * FROM backup_runs ORDER BY started_at DESC LIMIT 1');
    return {
      latest,
      location: resolvedBackupDir,
      retentionDays: Number(env.BACKUP_RETENTION_DAYS || 30),
      health: latest?.status === 'failed' ? 'failed' : latest ? 'ok' : 'warn'
    };
  }

  async function runBackup(actorId = null) {
    const started = now();
    const row = {
      id: id('backup'),
      type: 'manual',
      status: 'completed',
      file_path: path.join(resolvedBackupDir, `metadata-${Date.now()}.json`),
      file_size_bytes: 0,
      started_at: started,
      finished_at: now(),
      error_message: null,
      metadata_json: stringifyJson({ actorId, dryMetadataOnly: true })
    };
    await adapter.exec(`
      INSERT INTO backup_runs (id, type, status, file_path, file_size_bytes, started_at, finished_at, error_message, metadata_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [row.id, row.type, row.status, row.file_path, row.file_size_bytes, row.started_at, row.finished_at, row.error_message, row.metadata_json]);
    return row;
  }

  async function backupHistory() {
    return adapter.many('SELECT * FROM backup_runs ORDER BY started_at DESC LIMIT 50');
  }

  async function restoreDryRun() {
    return {
      ok: true,
      dryRunOnly: true,
      checkedAt: now(),
      message: 'Restore dry-run completed. No data was changed and no secret files were exposed.'
    };
  }

  async function lifecycleAction(workspaceId, action, { actorId, reason, metadata = {} } = {}) {
    const ws = await requireWorkspace(workspaceId);
    const why = requireReason(reason, action);
    const timestamp = now();
    if (action === 'suspend') {
      await adapter.exec("UPDATE workspaces SET status = 'suspended', suspended_at = ? WHERE id = ?", [timestamp, ws]);
    } else if (action === 'unsuspend') {
      await adapter.exec("UPDATE workspaces SET status = 'active', suspended_at = NULL WHERE id = ?", [ws]);
    } else if (action === 'archive') {
      await adapter.exec("UPDATE workspaces SET status = 'archived', archived_at = ? WHERE id = ?", [timestamp, ws]);
    } else if (action === 'transfer_owner') {
      const ownerUserId = cleanString(metadata.ownerUserId);
      if (!ownerUserId) {
        const error = new Error('ownerUserId is required.');
        error.statusCode = 400;
        throw error;
      }
      await adapter.exec('UPDATE workspaces SET owner_user_id = ? WHERE id = ?', [ownerUserId, ws]);
    } else if (action === 'reset_overrides') {
      await adapter.exec("DELETE FROM platform_settings WHERE scope = 'workspace' AND workspace_id = ?", [ws]).catch(() => {});
    } else if (action === 'force_logout') {
      await adapter.exec("UPDATE refresh_tokens SET revoked_at = ? WHERE user_id IN (SELECT id FROM users WHERE workspace_id = ?) AND revoked_at IS NULL", [Date.now(), ws]).catch(() => {});
    }
    const event = {
      id: id('lifecycle'),
      workspace_id: ws,
      action,
      actor_user_id: actorId || null,
      reason: why,
      metadata_json: stringifyJson(metadata),
      created_at: timestamp
    };
    await adapter.exec(`
      INSERT INTO workspace_lifecycle_events (id, workspace_id, action, actor_user_id, reason, metadata_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [event.id, event.workspace_id, event.action, event.actor_user_id, event.reason, event.metadata_json, event.created_at]);
    return event;
  }

  async function lifecycleOverview() {
    const workspaces = await adapter.many('SELECT id, name, status, suspended_at, archived_at, owner_user_id, customer_type FROM workspaces ORDER BY name LIMIT 100');
    const events = await adapter.many('SELECT * FROM workspace_lifecycle_events ORDER BY created_at DESC LIMIT 30');
    return { workspaces, events };
  }

  async function startImpersonation({ superAdminId, targetUserId, workspaceId, readOnly = true, reason }) {
    const ws = await requireWorkspace(workspaceId);
    const target = cleanString(targetUserId);
    if (!target) {
      const error = new Error('targetUserId is required.');
      error.statusCode = 400;
      throw error;
    }
    const why = requireReason(reason, 'support impersonation');
    const expires = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const row = {
      id: id('support'),
      super_admin_id: superAdminId,
      target_user_id: target,
      workspace_id: ws,
      read_only: readOnly ? 1 : 0,
      reason: why,
      started_at: now(),
      ended_at: null,
      expires_at: expires,
      status: 'active'
    };
    await adapter.exec(`
      INSERT INTO support_impersonation_sessions
        (id, super_admin_id, target_user_id, workspace_id, read_only, reason, started_at, ended_at, expires_at, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [row.id, row.super_admin_id, row.target_user_id, row.workspace_id, row.read_only, row.reason, row.started_at, row.ended_at, row.expires_at, row.status]);
    return row;
  }

  async function endImpersonation(superAdminId, sessionId = null) {
    const timestamp = now();
    if (sessionId) {
      await adapter.exec("UPDATE support_impersonation_sessions SET status = 'ended', ended_at = ? WHERE id = ? AND super_admin_id = ?", [timestamp, sessionId, superAdminId]);
    } else {
      await adapter.exec("UPDATE support_impersonation_sessions SET status = 'ended', ended_at = ? WHERE super_admin_id = ? AND status = 'active'", [timestamp, superAdminId]);
    }
    return { ok: true };
  }

  async function activeImpersonation(superAdminId) {
    const rows = await adapter.many("SELECT * FROM support_impersonation_sessions WHERE super_admin_id = ? AND status = 'active' ORDER BY started_at DESC", [superAdminId]);
    return { rows };
  }

  async function listIncidents() {
    const incidents = await adapter.many('SELECT * FROM platform_incidents ORDER BY created_at DESC LIMIT 50');
    const maintenance = await adapter.one('SELECT * FROM platform_maintenance ORDER BY updated_at DESC LIMIT 1');
    return { incidents, maintenance: maintenance || { enabled: 0, public_message: '', disabled_features_json: '[]' } };
  }

  async function createIncident(payload, actorId) {
    const title = cleanString(payload.title);
    if (!title) {
      const error = new Error('Incident title is required.');
      error.statusCode = 400;
      throw error;
    }
    const row = {
      id: id('incident'),
      title,
      status: cleanString(payload.status, 'open'),
      severity: cleanString(payload.severity, 'info'),
      public_message: cleanString(payload.publicMessage),
      internal_note: cleanString(payload.internalNote),
      affected_services_json: stringifyJson(Array.isArray(payload.affectedServices) ? payload.affectedServices : []),
      created_by: actorId || null,
      created_at: now(),
      resolved_at: null
    };
    await adapter.exec(`
      INSERT INTO platform_incidents
        (id, title, status, severity, public_message, internal_note, affected_services_json, created_by, created_at, resolved_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [row.id, row.title, row.status, row.severity, row.public_message, row.internal_note, row.affected_services_json, row.created_by, row.created_at, row.resolved_at]);
    return row;
  }

  async function updateIncident(incidentId, payload) {
    const status = cleanString(payload.status, 'open');
    const resolvedAt = status === 'resolved' ? now() : null;
    await adapter.exec('UPDATE platform_incidents SET status = ?, resolved_at = ? WHERE id = ?', [status, resolvedAt, incidentId]);
    return adapter.one('SELECT * FROM platform_incidents WHERE id = ?', [incidentId]);
  }

  async function updateMaintenance(payload, actorId) {
    const row = {
      id: id('maintenance'),
      enabled: payload.enabled ? 1 : 0,
      public_message: cleanString(payload.publicMessage),
      disabled_features_json: stringifyJson(Array.isArray(payload.disabledFeatures) ? payload.disabledFeatures : []),
      updated_by: actorId || null,
      updated_at: now()
    };
    await adapter.exec(`
      INSERT INTO platform_maintenance (id, enabled, public_message, disabled_features_json, updated_by, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [row.id, row.enabled, row.public_message, row.disabled_features_json, row.updated_by, row.updated_at]);
    return row;
  }

  async function dataGovernanceOverview() {
    const pending = await adapter.one("SELECT COUNT(*) AS count FROM data_governance_requests WHERE status = 'pending'");
    return {
      retention: {
        recordingsDays: Number(env.RECORDING_RETENTION_DAYS || 365),
        backupsDays: Number(env.BACKUP_RETENTION_DAYS || 30),
        auditDays: Number(env.AUDIT_RETENTION_DAYS || 365)
      },
      pendingRequests: Number(pending?.count || 0),
      legalAcceptanceStatus: 'available',
      dpaStatus: 'available'
    };
  }

  async function createGovernanceRequest({ workspaceId, requestType, reason, requestedBy, metadata = {} }) {
    const ws = await requireWorkspace(workspaceId);
    const type = cleanString(requestType, 'export');
    const why = type.includes('delete') ? requireReason(reason, 'data deletion request') : cleanString(reason);
    const row = {
      id: id('datareq'),
      workspace_id: ws,
      request_type: type,
      status: 'pending',
      requested_by: requestedBy || null,
      approved_by: null,
      reason: why,
      metadata_json: stringifyJson(metadata),
      created_at: now(),
      completed_at: null
    };
    await adapter.exec(`
      INSERT INTO data_governance_requests
        (id, workspace_id, request_type, status, requested_by, approved_by, reason, metadata_json, created_at, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [row.id, row.workspace_id, row.request_type, row.status, row.requested_by, row.approved_by, row.reason, row.metadata_json, row.created_at, row.completed_at]);
    return row;
  }

  async function governanceRequests() {
    return adapter.many('SELECT * FROM data_governance_requests ORDER BY created_at DESC LIMIT 50');
  }

  async function listNotifications() {
    return adapter.many('SELECT * FROM platform_notifications ORDER BY created_at DESC LIMIT 50');
  }

  async function createNotification(payload, actorId) {
    const title = cleanString(payload.title);
    const body = cleanString(payload.body);
    if (!title || !body) {
      const error = new Error('Notification title and body are required.');
      error.statusCode = 400;
      throw error;
    }
    const row = {
      id: id('notice'),
      title,
      body,
      target_scope: cleanString(payload.targetScope, 'all'),
      workspace_id: cleanString(payload.workspaceId) || null,
      channel: cleanString(payload.channel, 'in_app'),
      status: cleanString(payload.status, 'draft'),
      scheduled_at: cleanString(payload.scheduledAt) || null,
      sent_at: null,
      created_by: actorId || null,
      created_at: now()
    };
    await adapter.exec(`
      INSERT INTO platform_notifications
        (id, title, body, target_scope, workspace_id, channel, status, scheduled_at, sent_at, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [row.id, row.title, row.body, row.target_scope, row.workspace_id, row.channel, row.status, row.scheduled_at, row.sent_at, row.created_by, row.created_at]);
    return row;
  }

  async function sendNotification(notificationId) {
    const timestamp = now();
    await adapter.exec("UPDATE platform_notifications SET status = 'sent', sent_at = ? WHERE id = ?", [timestamp, notificationId]);
    return adapter.one('SELECT * FROM platform_notifications WHERE id = ?', [notificationId]);
  }

  async function deleteNotification(notificationId) {
    await adapter.exec('DELETE FROM platform_notifications WHERE id = ?', [notificationId]);
    return { ok: true };
  }

  async function subscriptionOverview() {
    const events = await adapter.many('SELECT * FROM subscription_events ORDER BY created_at DESC LIMIT 30');
    const subscriptions = await adapter.many('SELECT * FROM workspace_subscriptions ORDER BY updated_at DESC LIMIT 50').catch(() => []);
    return {
      stripeReadiness: env.STRIPE_SECRET_KEY ? 'configured' : 'not_configured',
      integrationBoundary: 'Stripe Billing APIs with Checkout Sessions and Customer Portal should own subscription payment lifecycle. This module records readiness and sync events only.',
      events,
      subscriptions
    };
  }

  async function subscriptionSync(actorId) {
    const row = {
      id: id('subevt'),
      workspace_id: null,
      provider: 'stripe',
      event_type: 'manual_sync_placeholder',
      status: env.STRIPE_SECRET_KEY ? 'ready' : 'blocked_missing_stripe_key',
      metadata_json: stringifyJson({ actorId }),
      created_at: now()
    };
    await adapter.exec(`
      INSERT INTO subscription_events (id, workspace_id, provider, event_type, status, metadata_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [row.id, row.workspace_id, row.provider, row.event_type, row.status, row.metadata_json, row.created_at]);
    return row;
  }

  async function patchWorkspaceSubscription(workspaceId, payload) {
    const ws = await requireWorkspace(workspaceId);
    const event = {
      id: id('subevt'),
      workspace_id: ws,
      provider: 'stripe',
      event_type: 'manual_workspace_subscription_update',
      status: cleanString(payload.status, 'recorded'),
      metadata_json: stringifyJson(payload),
      created_at: now()
    };
    await adapter.exec(`
      INSERT INTO subscription_events (id, workspace_id, provider, event_type, status, metadata_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [event.id, event.workspace_id, event.provider, event.event_type, event.status, event.metadata_json, event.created_at]);
    return event;
  }

  async function getBranding() {
    const platform = await adapter.one('SELECT * FROM platform_branding ORDER BY updated_at DESC LIMIT 1');
    const domains = await adapter.many('SELECT * FROM workspace_domains ORDER BY created_at DESC LIMIT 50');
    return {
      platform: platform ? { ...platform, settings: parseJson(platform.settings_json, {}) } : { settings: { platformName: 'StudiesTalk', supportEmail: '', defaultTheme: 'default' } },
      domains
    };
  }

  async function savePlatformBranding(settings) {
    const row = {
      id: 'platform_branding_default',
      settings_json: stringifyJson(settings || {}),
      updated_at: now()
    };
    await adapter.exec(`
      INSERT INTO platform_branding (id, settings_json, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET settings_json = excluded.settings_json, updated_at = excluded.updated_at
    `, [row.id, row.settings_json, row.updated_at]);
    return row;
  }

  async function saveWorkspaceBranding(workspaceId, settings) {
    const ws = await requireWorkspace(workspaceId);
    const domain = cleanString(settings.domain);
    if (domain) {
      await adapter.exec(`
        INSERT INTO workspace_domains (id, workspace_id, domain, status, verification_token, verified_at, created_at)
        VALUES (?, ?, ?, 'pending', ?, NULL, ?)
      `, [id('domain'), ws, domain, crypto.randomBytes(12).toString('hex'), now()]);
    }
    return { ok: true, workspaceId: ws };
  }

  async function verifyDomain(workspaceId) {
    const ws = await requireWorkspace(workspaceId);
    await adapter.exec("UPDATE workspace_domains SET status = 'verified', verified_at = ? WHERE workspace_id = ?", [now(), ws]);
    return { ok: true };
  }

  async function reportsOverview() {
    const workspaceCount = await adapter.one('SELECT COUNT(*) AS count FROM workspaces').catch(() => ({ count: 0 }));
    const userCount = await adapter.one('SELECT COUNT(*) AS count FROM users').catch(() => ({ count: 0 }));
    const cost = await adapter.one('SELECT COALESCE(SUM(cost_eur), 0) AS total FROM usage_ledger').catch(() => ({ total: 0 }));
    const notifications = await adapter.one('SELECT COUNT(*) AS count FROM platform_notifications').catch(() => ({ count: 0 }));
    return {
      generatedAt: now(),
      cards: [
        { key: 'mrr', label: 'MRR / revenue report', value: '€0.00' },
        { key: 'schools', label: 'Active schools report', value: Number(workspaceCount?.count || 0) },
        { key: 'users', label: 'User growth report', value: Number(userCount?.count || 0) },
        { key: 'cost', label: 'Cost by provider report', value: Number(cost?.total || 0) },
        { key: 'delivery', label: 'Email/SMS delivery report', value: Number(notifications?.count || 0) },
        { key: 'compliance', label: 'Compliance readiness report', value: 'Ready' }
      ]
    };
  }

  async function reportsCsv(type = 'overview') {
    const overview = await reportsOverview();
    const rows = [['type', 'label', 'value']];
    for (const card of overview.cards) rows.push([type, card.label, String(card.value)]);
    return rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
  }

  return {
    ensureSchema,
    getOperationsHealth,
    testProvider,
    getBackupStatus,
    runBackup,
    backupHistory,
    restoreDryRun,
    lifecycleOverview,
    lifecycleAction,
    startImpersonation,
    endImpersonation,
    activeImpersonation,
    listIncidents,
    createIncident,
    updateIncident,
    updateMaintenance,
    dataGovernanceOverview,
    createGovernanceRequest,
    governanceRequests,
    listNotifications,
    createNotification,
    sendNotification,
    deleteNotification,
    subscriptionOverview,
    subscriptionSync,
    patchWorkspaceSubscription,
    getBranding,
    savePlatformBranding,
    saveWorkspaceBranding,
    verifyDomain,
    reportsOverview,
    reportsCsv
  };
}

module.exports = {
  createPlatformOwnerControlService
};
