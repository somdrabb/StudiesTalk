'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const DEFAULT_OPS_DIR = path.join(process.cwd(), 'storage', 'ops');
const MAX_READ_LINES = 1000;

function nowIso() {
  return new Date().toISOString();
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function eventId(prefix) {
  return `${prefix}_${crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(12).toString('hex')}`;
}

function redact(value) {
  if (value == null) return value;
  const text = String(value);
  return text
    .replace(/(password|secret|token|authorization|cookie|dsn|smtp|twilio|openai)[^,\s"}]*/gi, '$1[redacted]')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]');
}

function sanitize(input) {
  if (input == null) return input;
  if (Array.isArray(input)) return input.map(sanitize);
  if (typeof input === 'object') {
    const output = {};
    for (const [key, value] of Object.entries(input)) {
      if (/password|secret|token|authorization|cookie|dsn|key/i.test(key)) {
        output[key] = '[redacted]';
      } else {
        output[key] = sanitize(value);
      }
    }
    return output;
  }
  if (typeof input === 'string') return redact(input);
  return input;
}

function createObservabilityService({ opsDir = DEFAULT_OPS_DIR, env = process.env } = {}) {
  const files = {
    requests: path.join(opsDir, 'request-events.jsonl'),
    backups: path.join(opsDir, 'backup-events.jsonl'),
    incidents: path.join(opsDir, 'incident-events.jsonl'),
    jobs: path.join(opsDir, 'job-events.jsonl')
  };

  function appendJsonl(filePath, event) {
    ensureDir(path.dirname(filePath));
    fs.appendFileSync(filePath, `${JSON.stringify(sanitize(event))}\n`);
  }

  function readJsonl(filePath, limit = 100) {
    if (!fs.existsSync(filePath)) return [];
    const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter(Boolean);
    return lines.slice(-Math.min(MAX_READ_LINES, Math.max(1, Number(limit) || 100))).map((line) => {
      try {
        return JSON.parse(line);
      } catch (_err) {
        return null;
      }
    }).filter(Boolean).reverse();
  }

  function recordRequest(event = {}) {
    appendJsonl(files.requests, {
      id: event.id || event.requestId || eventId('reqevt'),
      timestamp: event.timestamp || nowIso(),
      requestId: event.requestId || event.id || null,
      method: event.method || '',
      path: event.path || '',
      status: Number(event.status || 0),
      durationMs: Number(event.durationMs || 0),
      actorUserId: event.actorUserId || null,
      role: event.role || null,
      workspaceId: event.workspaceId || null,
      ip: event.ip || null,
      userAgent: event.userAgent || '',
      error: event.error || null
    });
  }

  function recordBackupEvent(event = {}) {
    appendJsonl(files.backups, {
      id: event.id || eventId(event.type || 'backup'),
      type: event.type || 'backup',
      status: event.status || 'unknown',
      startedAt: event.startedAt || nowIso(),
      finishedAt: event.finishedAt || nowIso(),
      durationMs: Number(event.durationMs || 0),
      filePath: event.filePath || event.backupPath || null,
      backupId: event.backupId || null,
      sizeBytes: Number(event.sizeBytes || 0),
      checksum: event.checksum || null,
      actor: event.actor || null,
      error: event.error || null
    });
  }

  function recordIncidentEvent(event = {}) {
    appendJsonl(files.incidents, {
      id: event.id || eventId('incidentevt'),
      type: event.type || 'incident',
      timestamp: event.timestamp || nowIso(),
      actor: event.actor || null,
      customerImpact: event.customerImpact || event.customer_impact || '',
      publicMessage: event.publicMessage || event.public_message || '',
      affectedServices: Array.isArray(event.affectedServices) ? event.affectedServices : [],
      status: event.status || '',
      incidentId: event.incidentId || null
    });
  }

  function recordJobEvent(event = {}) {
    appendJsonl(files.jobs, {
      id: event.id || eventId('job'),
      type: event.type || 'job',
      status: event.status || 'unknown',
      startedAt: event.startedAt || nowIso(),
      finishedAt: event.finishedAt || null,
      durationMs: Number(event.durationMs || 0),
      actor: event.actor || null,
      target: event.target || null,
      error: event.error || null
    });
  }

  function getBackupEvidence(limit = 100) {
    const events = readJsonl(files.backups, limit);
    const byType = (type) => events.find((event) => event.type === type) || null;
    return {
      events,
      latestBackup: byType('backup'),
      latestVerification: byType('verify'),
      latestRestoreDryRun: byType('restore_dry_run'),
      latestRestoreTest: byType('restore_test'),
      failed: events.filter((event) => event.status === 'failed')
    };
  }

  function getJobs(limit = 100) {
    return { rows: readJsonl(files.jobs, limit) };
  }

  function getLogsSummary(limit = 50) {
    const requests = readJsonl(files.requests, 1000).reverse();
    const jobs = readJsonl(files.jobs, 200);
    const incidents = readJsonl(files.incidents, 200);
    const totalRequests = requests.length;
    const fourXx = requests.filter((event) => event.status >= 400 && event.status < 500).length;
    const fiveXx = requests.filter((event) => event.status >= 500).length;
    return {
      generatedAt: nowIso(),
      totalRequests,
      fourXxCount: fourXx,
      fiveXxCount: fiveXx,
      latestErrors: requests.filter((event) => event.status >= 500 || event.error).slice(-limit).reverse(),
      failedAdminActions: requests.filter((event) => String(event.path || '').startsWith('/api/admin') && event.status >= 400).slice(-limit).reverse(),
      failedAuthAttempts: requests.filter((event) => String(event.path || '').includes('/api/auth/login') && event.status >= 400).slice(-limit).reverse(),
      failedProviderChecks: jobs.filter((event) => String(event.type || '').includes('provider') && event.status === 'failed').slice(0, limit),
      latestIncidents: incidents.slice(0, Math.min(10, limit))
    };
  }

  function getRuntimeSummary() {
    return {
      appVersion: env.npm_package_version || '1.0.0',
      nodeVersion: process.version,
      uptimeSeconds: Math.round(process.uptime ? process.uptime() : 0),
      environment: env.NODE_ENV || 'development',
      hostname: os.hostname()
    };
  }

  return {
    files,
    recordRequest,
    recordBackupEvent,
    recordIncidentEvent,
    recordJobEvent,
    getBackupEvidence,
    getJobs,
    getLogsSummary,
    getRuntimeSummary,
    readJsonl
  };
}

module.exports = {
  createObservabilityService,
  DEFAULT_OPS_DIR
};
