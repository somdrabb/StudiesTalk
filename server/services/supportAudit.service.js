'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DEFAULT_OPS_DIR = path.join(process.cwd(), 'storage', 'ops');
const MAX_READ_LINES = 2000;

function nowIso() {
  return new Date().toISOString();
}

function eventId(prefix) {
  return `${prefix}_${crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(12).toString('hex')}`;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function cleanString(value, fallback = '') {
  const text = String(value == null ? '' : value).trim();
  return text || fallback;
}

function normalizeDbAdapter(db) {
  if (!db) return null;
  if (typeof db.one === 'function' && typeof db.many === 'function') {
    return {
      one: (sql, params = []) => Promise.resolve(db.one(sql, params)),
      many: (sql, params = []) => Promise.resolve(db.many(sql, params)),
      exec: (sql, params = []) => Promise.resolve(db.exec(sql, params))
    };
  }
  if (typeof db.prepare === 'function') {
    return {
      one: (sql, params = []) => Promise.resolve(db.prepare(sql).get(...params) || null),
      many: (sql, params = []) => Promise.resolve(db.prepare(sql).all(...params)),
      exec: (sql, params = []) => Promise.resolve(db.prepare(sql).run(...params))
    };
  }
  return null;
}

function sanitizeRecord(input) {
  if (input == null) return input;
  if (Array.isArray(input)) return input.map(sanitizeRecord);
  if (typeof input === 'object') {
    const output = {};
    for (const [key, value] of Object.entries(input)) {
      if (/password|secret|token|authorization|cookie|key/i.test(key)) {
        output[key] = '[redacted]';
      } else {
        output[key] = sanitizeRecord(value);
      }
    }
    return output;
  }
  return input;
}

function createSupportAuditService({ db = null, opsDir = process.env.OPS_EVIDENCE_DIR || DEFAULT_OPS_DIR } = {}) {
  const adapter = normalizeDbAdapter(db);
  const files = {
    sessions: path.join(opsDir, 'support-sessions.jsonl'),
    access: path.join(opsDir, 'support-access-events.jsonl')
  };

  function appendJsonl(filePath, row) {
    ensureDir(path.dirname(filePath));
    fs.appendFileSync(filePath, `${JSON.stringify(sanitizeRecord(row))}\n`);
  }

  function readJsonl(filePath, limit = 100) {
    if (!fs.existsSync(filePath)) return [];
    const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter(Boolean);
    return lines
      .slice(-Math.min(MAX_READ_LINES, Math.max(1, Number(limit) || 100)))
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch (_err) {
          return null;
        }
      })
      .filter(Boolean)
      .reverse();
  }

  function normalizeSession(row = {}, req = null, overrides = {}) {
    return {
      id: cleanString(row.id || overrides.id || eventId('support')),
      workspace_id: cleanString(row.workspace_id || row.workspaceId || overrides.workspaceId),
      actor_user_id: cleanString(row.actor_user_id || row.super_admin_id || row.actorUserId || overrides.actorUserId),
      actor_role: cleanString(row.actor_role || overrides.actorRole, 'super_admin'),
      reason: cleanString(row.reason || overrides.reason),
      started_at: cleanString(row.started_at || row.startedAt || overrides.startedAt, nowIso()),
      ended_at: cleanString(row.ended_at || row.endedAt || overrides.endedAt),
      expires_at: cleanString(row.expires_at || row.expiresAt || overrides.expiresAt),
      active: Boolean(overrides.active ?? row.active ?? row.status === 'active'),
      mode: 'read_only',
      ip: cleanString(row.ip || overrides.ip || req?.ip),
      user_agent: cleanString(row.user_agent || row.userAgent || overrides.userAgent || req?.headers?.['user-agent'])
    };
  }

  function logSupportSessionStart(row = {}, req = null, user = null) {
    const record = normalizeSession(row, req, {
      actorUserId: user?.id || user?.sub || row.super_admin_id,
      actorRole: user?.role || 'super_admin',
      active: true
    });
    appendJsonl(files.sessions, record);
    return record;
  }

  function logSupportSessionEnd(row = {}, req = null, user = null) {
    const record = normalizeSession(row, req, {
      actorUserId: user?.id || user?.sub || row.super_admin_id,
      actorRole: user?.role || 'super_admin',
      endedAt: row.ended_at || nowIso(),
      active: false
    });
    appendJsonl(files.sessions, record);
    return record;
  }

  function logSupportAccess({
    sessionId,
    actorUserId,
    workspaceId,
    resourceType,
    resourceId,
    action = 'view',
    timestamp = nowIso()
  } = {}) {
    if (!sessionId || !actorUserId || !workspaceId || !resourceType) return null;
    const row = {
      id: eventId('support_access'),
      session_id: cleanString(sessionId),
      actor_user_id: cleanString(actorUserId),
      workspace_id: cleanString(workspaceId),
      resource_type: cleanString(resourceType),
      resource_id: cleanString(resourceId, 'unknown'),
      action: cleanString(action, 'view'),
      timestamp
    };
    appendJsonl(files.access, row);
    return row;
  }

  async function getActiveSessionForActor(actorUserId) {
    if (!adapter || !actorUserId) return null;
    const row = await adapter.one(
      "SELECT * FROM support_impersonation_sessions WHERE super_admin_id = ? AND status = 'active' ORDER BY started_at DESC LIMIT 1",
      [actorUserId]
    );
    if (!row) return null;
    const expiresAt = row.expires_at ? Date.parse(row.expires_at) : 0;
    if (expiresAt && expiresAt <= Date.now()) {
      const endedAt = nowIso();
      await adapter.exec("UPDATE support_impersonation_sessions SET status = 'ended', ended_at = ? WHERE id = ?", [endedAt, row.id]);
      const ended = { ...row, status: 'ended', ended_at: endedAt };
      logSupportSessionEnd(ended, null, { id: row.super_admin_id, role: 'super_admin' });
      return null;
    }
    return row;
  }

  function getSupportSessions(limit = 100) {
    const rows = readJsonl(files.sessions, limit);
    const latestById = new Map();
    for (const row of [...rows].reverse()) latestById.set(row.id, row);
    const history = Array.from(latestById.values()).sort((a, b) => String(b.started_at || '').localeCompare(String(a.started_at || '')));
    return {
      rows: history,
      active: history.filter((row) => row.active),
      history
    };
  }

  function getSupportAccessEvents(limit = 100) {
    return { rows: readJsonl(files.access, limit) };
  }

  function getWorkspaceSupportAccessLog(workspaceId, { days = 30, limit = 200 } = {}) {
    const normalizedWorkspaceId = cleanString(workspaceId);
    const cutoff = Date.now() - Math.max(1, Number(days) || 30) * 24 * 60 * 60 * 1000;
    const sessions = getSupportSessions(limit).history.filter((row) => {
      const started = Date.parse(row.started_at || '') || 0;
      return row.workspace_id === normalizedWorkspaceId && started >= cutoff;
    });
    const sessionIds = new Set(sessions.map((row) => row.id));
    const accessEvents = getSupportAccessEvents(limit).rows.filter((row) => {
      const timestamp = Date.parse(row.timestamp || '') || 0;
      return row.workspace_id === normalizedWorkspaceId && timestamp >= cutoff && (!row.session_id || sessionIds.has(row.session_id));
    });
    const dataTypes = [...new Set(accessEvents.map((row) => row.resource_type).filter(Boolean))].sort();
    return {
      sessions,
      accessEvents,
      summary: {
        sessionCount: sessions.length,
        accessEventCount: accessEvents.length,
        dataTypes
      }
    };
  }

  function exportAudit({ format = 'json', limit = 500 } = {}) {
    const sessions = getSupportSessions(limit).history;
    const accessEvents = getSupportAccessEvents(limit).rows;
    if (String(format).toLowerCase() === 'csv') {
      const rows = [['kind', 'id', 'session_id', 'workspace_id', 'actor_user_id', 'resource_type', 'resource_id', 'timestamp', 'reason']];
      sessions.forEach((row) => rows.push(['session', row.id, row.id, row.workspace_id, row.actor_user_id, '', '', row.started_at, row.reason]));
      accessEvents.forEach((row) => rows.push(['access', row.id, row.session_id, row.workspace_id, row.actor_user_id, row.resource_type, row.resource_id, row.timestamp, '']));
      return rows.map((row) => row.map((cell) => `"${String(cell == null ? '' : cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    }
    return { sessions, accessEvents };
  }

  return {
    logSupportSessionStart,
    logSupportSessionEnd,
    logSupportAccess,
    getActiveSessionForActor,
    getSupportSessions,
    getSupportAccessEvents,
    getWorkspaceSupportAccessLog,
    exportAudit
  };
}

module.exports = {
  createSupportAuditService
};
