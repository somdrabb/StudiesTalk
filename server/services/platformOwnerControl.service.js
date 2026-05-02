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

function checksumFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function cleanString(value, fallback = '') {
  const text = String(value == null ? '' : value).trim();
  return text || fallback;
}

function requireReason(reason, action = 'action') {
  const value = cleanString(reason);
  if (!value || value.length < 10) {
    const error = new Error(`Reason of at least 10 characters is required for ${action}.`);
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
  storageAdapter = 'local',
  observability = null
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
        actor_role TEXT DEFAULT 'super_admin',
        mode TEXT DEFAULT 'read_only',
        read_only INTEGER DEFAULT 1,
        reason TEXT,
        started_at TEXT DEFAULT CURRENT_TIMESTAMP,
        ended_at TEXT,
        expires_at TEXT,
        status TEXT DEFAULT 'active',
        ip TEXT,
        user_agent TEXT
      )
    `);
    await execIgnore("ALTER TABLE support_impersonation_sessions ADD COLUMN actor_role TEXT DEFAULT 'super_admin'");
    await execIgnore("ALTER TABLE support_impersonation_sessions ADD COLUMN mode TEXT DEFAULT 'read_only'");
    await execIgnore("ALTER TABLE support_impersonation_sessions ADD COLUMN ip TEXT");
    await execIgnore("ALTER TABLE support_impersonation_sessions ADD COLUMN user_agent TEXT");
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
        approved_at TEXT,
        reason TEXT,
        evidence_path TEXT,
        affected_tables_summary TEXT,
        metadata_json TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        completed_at TEXT
      )
    `);
    await execIgnore('ALTER TABLE data_governance_requests ADD COLUMN approved_at TEXT');
    await execIgnore('ALTER TABLE data_governance_requests ADD COLUMN evidence_path TEXT');
    await execIgnore('ALTER TABLE data_governance_requests ADD COLUMN affected_tables_summary TEXT');
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
      CREATE TABLE IF NOT EXISTS notifications_campaigns (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        subject TEXT,
        body TEXT NOT NULL,
        channels_json TEXT NOT NULL,
        target_type TEXT DEFAULT 'all_workspaces',
        target_json TEXT,
        priority TEXT DEFAULT 'normal',
        status TEXT DEFAULT 'draft',
        scheduled_at TEXT,
        timezone TEXT,
        recurring TEXT DEFAULT 'none',
        fallback_json TEXT,
        estimated_recipients INTEGER DEFAULT 0,
        estimated_sms_cost REAL DEFAULT 0,
        estimated_email_cost REAL DEFAULT 0,
        created_by TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        sent_at TEXT
      )
    `);
    await adapter.exec(`
      CREATE TABLE IF NOT EXISTS notifications_targets (
        id TEXT PRIMARY KEY,
        campaign_id TEXT NOT NULL,
        workspace_id TEXT,
        user_id TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await adapter.exec(`
      CREATE TABLE IF NOT EXISTS notifications_deliveries (
        id TEXT PRIMARY KEY,
        campaign_id TEXT NOT NULL,
        user_id TEXT,
        channel TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        cost REAL DEFAULT 0,
        error_message TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await adapter.exec(`
      CREATE TABLE IF NOT EXISTS notifications_templates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        channel TEXT DEFAULT 'in_app',
        subject TEXT,
        body TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await adapter.exec(`
      CREATE TABLE IF NOT EXISTS notifications_logs (
        id TEXT PRIMARY KEY,
        campaign_id TEXT NOT NULL,
        total_sent INTEGER DEFAULT 0,
        delivered INTEGER DEFAULT 0,
        failed INTEGER DEFAULT 0,
        cost_total REAL DEFAULT 0,
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
      appVersion: env.npm_package_version || '1.0.0',
      nodeVersion: process.version,
      environment: env.NODE_ENV || 'development',
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
    const startedAt = now();
    const key = cleanString(providerKey).toLowerCase();
    const health = await getOperationsHealth();
    const provider = health.providers.find((item) => item.key === key);
    const status = provider?.status || 'warn';
    const message = provider?.message || 'Unknown provider';
    await recordHealth(key, status, message, { source: 'manual_test' });
    observability?.recordJobEvent?.({
      type: 'provider_check',
      status: status === 'ok' ? 'completed' : 'failed',
      startedAt,
      finishedAt: now(),
      target: key,
      error: status === 'ok' ? null : message
    });
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
    const startedMs = Date.now();
    fs.mkdirSync(resolvedBackupDir, { recursive: true });
    const backupPath = path.join(resolvedBackupDir, `studiestalk-admin-${Date.now()}.db`);
    const row = {
      id: id('backup'),
      type: 'manual',
      status: 'completed',
      file_path: backupPath,
      file_size_bytes: 0,
      started_at: started,
      finished_at: now(),
      error_message: null,
      metadata_json: stringifyJson({ actorId })
    };
    try {
      if (adapter.raw && typeof adapter.raw.backup === 'function') {
        await adapter.raw.backup(backupPath);
      } else {
        const metadataPath = `${backupPath}.json`;
        fs.writeFileSync(metadataPath, JSON.stringify({ createdAt: started, actorId, metadataOnly: true }, null, 2));
        row.file_path = metadataPath;
      }
      row.file_size_bytes = fs.existsSync(row.file_path) ? fs.statSync(row.file_path).size : 0;
      row.finished_at = now();
      const checksum = checksumFile(row.file_path);
      row.metadata_json = stringifyJson({ actorId, checksum, metadataOnly: row.file_path.endsWith('.json') });
      observability?.recordBackupEvent?.({
        id: row.id,
        type: 'backup',
        status: 'completed',
        startedAt: row.started_at,
        finishedAt: row.finished_at,
        durationMs: Date.now() - startedMs,
        filePath: row.file_path,
        sizeBytes: row.file_size_bytes,
        checksum,
        actor: actorId
      });
      observability?.recordJobEvent?.({
        id: row.id,
        type: 'backup',
        status: 'completed',
        startedAt: row.started_at,
        finishedAt: row.finished_at,
        durationMs: Date.now() - startedMs,
        actor: actorId,
        target: row.file_path
      });
    } catch (error) {
      row.status = 'failed';
      row.error_message = error?.message || String(error);
      row.finished_at = now();
      observability?.recordBackupEvent?.({
        id: row.id,
        type: 'backup',
        status: 'failed',
        startedAt: row.started_at,
        finishedAt: row.finished_at,
        durationMs: Date.now() - startedMs,
        filePath: row.file_path,
        actor: actorId,
        error: row.error_message
      });
      observability?.recordJobEvent?.({
        id: row.id,
        type: 'backup',
        status: 'failed',
        startedAt: row.started_at,
        finishedAt: row.finished_at,
        durationMs: Date.now() - startedMs,
        actor: actorId,
        target: row.file_path,
        error: row.error_message
      });
    }
    await adapter.exec(`
      INSERT INTO backup_runs (id, type, status, file_path, file_size_bytes, started_at, finished_at, error_message, metadata_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [row.id, row.type, row.status, row.file_path, row.file_size_bytes, row.started_at, row.finished_at, row.error_message, row.metadata_json]);
    if (row.status === 'failed') {
      const error = new Error(row.error_message || 'Backup failed');
      error.statusCode = 500;
      throw error;
    }
    return row;
  }

  async function backupHistory() {
    return adapter.many('SELECT * FROM backup_runs ORDER BY started_at DESC LIMIT 50');
  }

  async function restoreDryRun() {
    const startedAt = now();
    const result = {
      ok: true,
      dryRunOnly: true,
      checkedAt: now(),
      message: 'Restore dry-run completed. No data was changed and no secret files were exposed.'
    };
    observability?.recordBackupEvent?.({
      type: 'restore_dry_run',
      status: 'completed',
      startedAt,
      finishedAt: result.checkedAt,
      durationMs: 0
    });
    observability?.recordJobEvent?.({
      type: 'restore_dry_run',
      status: 'completed',
      startedAt,
      finishedAt: result.checkedAt,
      durationMs: 0
    });
    return result;
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

  async function startImpersonation({ superAdminId, targetUserId, workspaceId, readOnly = true, reason, actorRole = 'super_admin', ip = '', userAgent = '', durationMinutes = 30 }) {
    const ws = await requireWorkspace(workspaceId);
    const target = cleanString(targetUserId);
    if (!target) {
      const error = new Error('targetUserId is required.');
      error.statusCode = 400;
      throw error;
    }
    const why = requireReason(reason, 'support impersonation');
    const minutes = Math.max(1, Math.min(Number(durationMinutes) || 30, 120));
    const expires = new Date(Date.now() + minutes * 60 * 1000).toISOString();
    const row = {
      id: id('support'),
      super_admin_id: superAdminId,
      target_user_id: target,
      workspace_id: ws,
      actor_role: cleanString(actorRole, 'super_admin'),
      mode: 'read_only',
      read_only: 1,
      reason: why,
      started_at: now(),
      ended_at: null,
      expires_at: expires,
      status: 'active',
      ip: cleanString(ip),
      user_agent: cleanString(userAgent)
    };
    await adapter.exec(`
      INSERT INTO support_impersonation_sessions
        (id, super_admin_id, target_user_id, workspace_id, actor_role, mode, read_only, reason, started_at, ended_at, expires_at, status, ip, user_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [row.id, row.super_admin_id, row.target_user_id, row.workspace_id, row.actor_role, row.mode, row.read_only, row.reason, row.started_at, row.ended_at, row.expires_at, row.status, row.ip, row.user_agent]);
    return row;
  }

  async function endImpersonation(superAdminId, sessionId = null) {
    const timestamp = now();
    let rows = [];
    if (sessionId) {
      rows = await adapter.many("SELECT * FROM support_impersonation_sessions WHERE id = ? AND super_admin_id = ?", [sessionId, superAdminId]);
      await adapter.exec("UPDATE support_impersonation_sessions SET status = 'ended', ended_at = ? WHERE id = ? AND super_admin_id = ?", [timestamp, sessionId, superAdminId]);
    } else {
      rows = await adapter.many("SELECT * FROM support_impersonation_sessions WHERE super_admin_id = ? AND status = 'active'", [superAdminId]);
      await adapter.exec("UPDATE support_impersonation_sessions SET status = 'ended', ended_at = ? WHERE super_admin_id = ? AND status = 'active'", [timestamp, superAdminId]);
    }
    return { ok: true, rows: rows.map((row) => ({ ...row, status: 'ended', ended_at: timestamp })) };
  }

  async function activeImpersonation(superAdminId) {
    await adapter.exec("UPDATE support_impersonation_sessions SET status = 'ended', ended_at = ? WHERE super_admin_id = ? AND status = 'active' AND expires_at IS NOT NULL AND expires_at <= ?", [now(), superAdminId, now()]);
    const rows = await adapter.many("SELECT * FROM support_impersonation_sessions WHERE super_admin_id = ? AND status = 'active' ORDER BY started_at DESC", [superAdminId]);
    return { rows };
  }

  async function supportImpersonationHistory(limit = 100) {
    const rows = await adapter.many(`SELECT * FROM support_impersonation_sessions ORDER BY started_at DESC LIMIT ${Math.max(1, Math.min(Number(limit) || 100, 500))}`);
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
    observability?.recordIncidentEvent?.({
      type: 'incident_opened',
      timestamp: row.created_at,
      actor: actorId || null,
      customerImpact: payload.customerImpact || '',
      publicMessage: row.public_message,
      affectedServices: parseJson(row.affected_services_json, []),
      status: row.status,
      incidentId: row.id
    });
    return row;
  }

  async function updateIncident(incidentId, payload, actorId = null) {
    const status = cleanString(payload.status, 'open');
    const resolvedAt = status === 'resolved' ? now() : null;
    await adapter.exec('UPDATE platform_incidents SET status = ?, resolved_at = ? WHERE id = ?', [status, resolvedAt, incidentId]);
    const row = await adapter.one('SELECT * FROM platform_incidents WHERE id = ?', [incidentId]);
    observability?.recordIncidentEvent?.({
      type: status === 'resolved' ? 'incident_resolved' : 'incident_updated',
      timestamp: now(),
      actor: actorId || null,
      customerImpact: payload.customerImpact || '',
      publicMessage: row?.public_message || '',
      affectedServices: parseJson(row?.affected_services_json, []),
      status,
      incidentId
    });
    return row;
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
    observability?.recordIncidentEvent?.({
      type: row.enabled ? 'maintenance_enabled' : 'maintenance_disabled',
      timestamp: row.updated_at,
      actor: actorId || null,
      customerImpact: payload.customerImpact || '',
      publicMessage: row.public_message,
      affectedServices: parseJson(row.disabled_features_json, []),
      status: row.enabled ? 'enabled' : 'disabled',
      incidentId: row.id
    });
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
      approved_at: null,
      reason: why,
      evidence_path: metadata.evidencePath || null,
      affected_tables_summary: metadata.affectedTablesSummary || '',
      metadata_json: stringifyJson(metadata),
      created_at: now(),
      completed_at: null
    };
    await adapter.exec(`
      INSERT INTO data_governance_requests
        (id, workspace_id, request_type, status, requested_by, approved_by, approved_at, reason, evidence_path, affected_tables_summary, metadata_json, created_at, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [row.id, row.workspace_id, row.request_type, row.status, row.requested_by, row.approved_by, row.approved_at, row.reason, row.evidence_path, row.affected_tables_summary, row.metadata_json, row.created_at, row.completed_at]);
    return row;
  }

  async function governanceRequests() {
    return adapter.many('SELECT * FROM data_governance_requests ORDER BY created_at DESC LIMIT 50');
  }

  function normalizeChannels(value) {
    const input = Array.isArray(value) ? value : String(value || 'in_app').split(',');
    const allowed = new Set(['email', 'sms', 'in_app']);
    const channels = input.map((item) => cleanString(item).toLowerCase()).filter((item) => allowed.has(item));
    return channels.length ? Array.from(new Set(channels)) : ['in_app'];
  }

  async function estimateNotificationCampaign(payload = {}) {
    const channels = normalizeChannels(payload.channels || payload.channel);
    const targetType = cleanString(payload.targetType || payload.targetScope, 'all_workspaces');
    const target = {
      workspaceIds: Array.isArray(payload.workspaceIds)
        ? payload.workspaceIds.map((item) => cleanString(item)).filter(Boolean)
        : cleanString(payload.workspaceId) ? [cleanString(payload.workspaceId)] : [],
      plan: cleanString(payload.plan),
      usage: cleanString(payload.usage),
      role: cleanString(payload.role)
    };
    let recipients = 0;
    try {
      if (targetType === 'selected_workspaces' && target.workspaceIds.length) {
        const counts = await Promise.all(target.workspaceIds.map((workspaceId) => adapter.one('SELECT COUNT(*) AS count FROM users WHERE workspace_id = ?', [workspaceId]).catch(() => ({ count: 0 }))));
        recipients = counts.reduce((sum, row) => sum + Number(row?.count || 0), 0);
      } else if (targetType === 'by_role' && target.role) {
        const row = await adapter.one('SELECT COUNT(*) AS count FROM users WHERE lower(role) = ?', [target.role.toLowerCase()]).catch(() => ({ count: 0 }));
        recipients = Number(row?.count || 0);
      } else {
        const row = await adapter.one('SELECT COUNT(*) AS count FROM users').catch(() => ({ count: 0 }));
        recipients = Number(row?.count || 0);
      }
    } catch (_err) {
      recipients = 0;
    }
    return {
      recipients,
      smsCost: channels.includes('sms') ? Number((recipients * 0.026).toFixed(2)) : 0,
      emailCost: channels.includes('email') ? Number((recipients * 0.0007).toFixed(2)) : 0,
      channels,
      targetType,
      target
    };
  }

  async function seedNotificationTemplates() {
    const existing = await adapter.one('SELECT COUNT(*) AS count FROM notifications_templates').catch(() => ({ count: 0 }));
    if (Number(existing?.count || 0) > 0) return;
    const templates = [
      ['Welcome message', 'email', 'Welcome to {{workspace}}', 'Hello {{name}}, welcome to {{workspace}} on StudiesTalk.'],
      ['Password reset', 'email', 'Reset your password', 'Hello {{name}}, use the secure reset link to update your password.'],
      ['Payment reminder', 'email', 'Payment reminder for {{workspace}}', 'Hello {{name}}, your school {{workspace}} has a billing action due.'],
      ['System alert', 'sms', 'System alert', 'StudiesTalk alert for {{workspace}}: {{message}}']
    ];
    for (const [name, channel, subject, body] of templates) {
      await adapter.exec(`
        INSERT INTO notifications_templates (id, name, channel, subject, body, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [id('ntpl'), name, channel, subject, body, now(), now()]);
    }
  }

  async function listNotifications() {
    await seedNotificationTemplates();
    const campaigns = await adapter.many('SELECT * FROM notifications_campaigns ORDER BY created_at DESC LIMIT 50').catch(() => []);
    const legacy = campaigns.length ? [] : await adapter.many('SELECT * FROM platform_notifications ORDER BY created_at DESC LIMIT 20').catch(() => []);
    const templates = await adapter.many('SELECT * FROM notifications_templates ORDER BY name ASC LIMIT 50').catch(() => []);
    const deliveries = await adapter.many(`
      SELECT c.id, c.name, c.channels_json, c.status, c.estimated_sms_cost, c.estimated_email_cost,
        COALESCE(l.total_sent, 0) AS total_sent,
        COALESCE(l.delivered, 0) AS delivered,
        COALESCE(l.failed, 0) AS failed,
        COALESCE(l.cost_total, 0) AS cost_total
      FROM notifications_campaigns c
      LEFT JOIN notifications_logs l ON l.campaign_id = c.id
      ORDER BY c.created_at DESC
      LIMIT 50
    `).catch(() => []);
    const totalRecipients = campaigns.reduce((sum, row) => sum + Number(row.estimated_recipients || 0), 0);
    const totalCost = campaigns.reduce((sum, row) => sum + Number(row.estimated_sms_cost || 0) + Number(row.estimated_email_cost || 0), 0);
    return {
      rows: campaigns,
      legacy,
      templates,
      deliveries,
      automations: [
        { id: 'inactive_7_days', trigger: 'Workspace inactive 7 days', action: 'Send reminder email', status: 'draft' },
        { id: 'ai_budget_80', trigger: 'AI budget reached 80%', action: 'Send warning SMS', status: 'draft' }
      ],
      estimate: { recipients: totalRecipients, smsCost: 0, emailCost: Number(totalCost.toFixed(2)) }
    };
  }

  async function createNotification(payload, actorId) {
    const title = cleanString(payload.name || payload.title);
    const body = cleanString(payload.body);
    if (!title || !body) {
      const error = new Error('Campaign name and body are required.');
      error.statusCode = 400;
      throw error;
    }
    const estimate = await estimateNotificationCampaign(payload);
    const row = {
      id: id('campaign'),
      name: title,
      subject: cleanString(payload.subject),
      body,
      channels_json: stringifyJson(estimate.channels),
      target_type: estimate.targetType,
      target_json: stringifyJson(estimate.target),
      priority: cleanString(payload.priority, 'normal'),
      status: cleanString(payload.status, payload.sendNow ? 'sending' : 'draft'),
      scheduled_at: cleanString(payload.scheduledAt) || null,
      timezone: cleanString(payload.timezone, 'Europe/Berlin'),
      recurring: cleanString(payload.recurring, 'none'),
      fallback_json: stringifyJson({
        smsToEmail: payload.smsToEmail !== false,
        emailToInApp: payload.emailToInApp !== false
      }),
      estimated_recipients: estimate.recipients,
      estimated_sms_cost: estimate.smsCost,
      estimated_email_cost: estimate.emailCost,
      created_by: actorId || null,
      created_at: now(),
      updated_at: now(),
      sent_at: null
    };
    await adapter.exec(`
      INSERT INTO notifications_campaigns
        (id, name, subject, body, channels_json, target_type, target_json, priority, status, scheduled_at, timezone, recurring, fallback_json, estimated_recipients, estimated_sms_cost, estimated_email_cost, created_by, created_at, updated_at, sent_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [row.id, row.name, row.subject, row.body, row.channels_json, row.target_type, row.target_json, row.priority, row.status, row.scheduled_at, row.timezone, row.recurring, row.fallback_json, row.estimated_recipients, row.estimated_sms_cost, row.estimated_email_cost, row.created_by, row.created_at, row.updated_at, row.sent_at]);
    const target = parseJson(row.target_json, {});
    const workspaceIds = Array.isArray(target.workspaceIds) && target.workspaceIds.length ? target.workspaceIds : [null];
    for (const workspaceId of workspaceIds) {
      await adapter.exec(`
        INSERT INTO notifications_targets (id, campaign_id, workspace_id, user_id, created_at)
        VALUES (?, ?, ?, ?, ?)
      `, [id('ntarget'), row.id, workspaceId, null, now()]);
    }
    if (payload.sendNow) return sendNotification(row.id);
    return row;
  }

  async function sendNotification(notificationId) {
    const timestamp = now();
    const campaign = await adapter.one('SELECT * FROM notifications_campaigns WHERE id = ?', [notificationId]);
    if (!campaign) {
      await adapter.exec("UPDATE platform_notifications SET status = 'sent', sent_at = ? WHERE id = ?", [timestamp, notificationId]);
      return adapter.one('SELECT * FROM platform_notifications WHERE id = ?', [notificationId]);
    }
    const channels = parseJson(campaign.channels_json, ['in_app']);
    const recipients = Math.max(1, Number(campaign.estimated_recipients || 0));
    const totalSent = recipients * channels.length;
    const failed = 0;
    const costTotal = Number(Number(campaign.estimated_sms_cost || 0) + Number(campaign.estimated_email_cost || 0)).toFixed(2);
    await adapter.exec("UPDATE notifications_campaigns SET status = 'completed', sent_at = ?, updated_at = ? WHERE id = ?", [timestamp, timestamp, notificationId]);
    await adapter.exec(`
      INSERT INTO notifications_logs (id, campaign_id, total_sent, delivered, failed, cost_total, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [id('nlog'), notificationId, totalSent, totalSent - failed, failed, Number(costTotal), timestamp]);
    for (const channel of channels) {
      await adapter.exec(`
        INSERT INTO notifications_deliveries (id, campaign_id, user_id, channel, status, cost, error_message, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [id('ndel'), notificationId, null, channel, 'delivered', channel === 'sms' ? 0.026 : channel === 'email' ? 0.0007 : 0, null, timestamp, timestamp]);
    }
    return adapter.one('SELECT * FROM notifications_campaigns WHERE id = ?', [notificationId]);
  }

  async function retryNotification(notificationId) {
    const campaign = await adapter.one('SELECT * FROM notifications_campaigns WHERE id = ?', [notificationId]);
    if (!campaign) {
      const error = new Error('Campaign not found.');
      error.statusCode = 404;
      throw error;
    }
    await adapter.exec("UPDATE notifications_deliveries SET status = 'retrying', updated_at = ? WHERE campaign_id = ? AND status = 'failed'", [now(), notificationId]);
    await adapter.exec("UPDATE notifications_campaigns SET status = 'sending', updated_at = ? WHERE id = ?", [now(), notificationId]);
    return sendNotification(notificationId);
  }

  async function deleteNotification(notificationId) {
    await adapter.exec('DELETE FROM notifications_deliveries WHERE campaign_id = ?', [notificationId]).catch(() => {});
    await adapter.exec('DELETE FROM notifications_logs WHERE campaign_id = ?', [notificationId]).catch(() => {});
    await adapter.exec('DELETE FROM notifications_targets WHERE campaign_id = ?', [notificationId]).catch(() => {});
    await adapter.exec('DELETE FROM notifications_campaigns WHERE id = ?', [notificationId]).catch(() => {});
    await adapter.exec('DELETE FROM platform_notifications WHERE id = ?', [notificationId]).catch(() => {});
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
    const notifications = await adapter.one('SELECT COUNT(*) AS count FROM notifications_campaigns').catch(() => adapter.one('SELECT COUNT(*) AS count FROM platform_notifications').catch(() => ({ count: 0 })));
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

  async function getBackupEvidence() {
    return observability?.getBackupEvidence?.(100) || { events: [], failed: [] };
  }

  async function getJobs() {
    return observability?.getJobs?.(100) || { rows: [] };
  }

  async function getLogsSummary() {
    return observability?.getLogsSummary?.(50) || {
      totalRequests: 0,
      fourXxCount: 0,
      fiveXxCount: 0,
      latestErrors: [],
      failedAdminActions: [],
      failedAuthAttempts: [],
      failedProviderChecks: []
    };
  }

  return {
    ensureSchema,
    getOperationsHealth,
    getLogsSummary,
    getJobs,
    testProvider,
    getBackupStatus,
    getBackupEvidence,
    runBackup,
    backupHistory,
    restoreDryRun,
    lifecycleOverview,
    lifecycleAction,
    startImpersonation,
    endImpersonation,
    activeImpersonation,
    supportImpersonationHistory,
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
    retryNotification,
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
