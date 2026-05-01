#!/usr/bin/env node
'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const express = require('express');
const Database = require('better-sqlite3');
const { createObservabilityService } = require('../server/services/observability.service');
const { createPlatformOwnerControlService } = require('../server/services/platformOwnerControl.service');
const { createPlatformOwnerControlRouter } = require('../server/routes/platformOwnerControl.routes');
const { backupSqlite, buildBackupPath, recordBackupEvent } = require('./sqlite-backup-utils');

const runId = `ops_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
const tempRoot = path.join(os.tmpdir(), runId);
const sqlitePath = path.join(tempRoot, 'app.sqlite');
const backupDir = path.join(tempRoot, 'backup');
const opsDir = path.join(tempRoot, 'ops');
fs.mkdirSync(tempRoot, { recursive: true });
process.env.OPS_EVIDENCE_DIR = opsDir;

function createSchema(db) {
  db.exec(`
    CREATE TABLE workspaces (id TEXT PRIMARY KEY, name TEXT, status TEXT);
    CREATE TABLE users (id TEXT PRIMARY KEY, workspace_id TEXT, email TEXT, role TEXT);
    CREATE TABLE channels (id TEXT PRIMARY KEY, workspace_id TEXT, name TEXT);
    CREATE TABLE messages (id TEXT PRIMARY KEY, channel_id TEXT, body TEXT);
    CREATE TABLE refresh_tokens (id TEXT PRIMARY KEY, user_id TEXT, revoked_at INTEGER);
    CREATE TABLE platform_settings (key TEXT PRIMARY KEY, value TEXT);
  `);
  db.prepare('INSERT INTO workspaces (id, name, status) VALUES (?, ?, ?)').run('ws_ops', 'Ops School', 'active');
  db.prepare('INSERT INTO users (id, workspace_id, email, role) VALUES (?, ?, ?, ?)').run('super_ops', 'ws_ops', 'super@example.com', 'super_admin');
  db.prepare('INSERT INTO channels (id, workspace_id, name) VALUES (?, ?, ?)').run('ch_ops', 'ws_ops', 'General');
  db.prepare('INSERT INTO messages (id, channel_id, body) VALUES (?, ?, ?)').run('msg_ops', 'ch_ops', 'hello');
}

async function startApp(service) {
  const app = express();
  app.use(express.json());
  app.get('/health/deep', (_req, res) => {
    res.json({
      ok: true,
      database: { ok: true },
      providers: { email: { status: 'disabled' }, ai: { status: 'missing_key' } },
      nodeVersion: process.version,
      uptimeSeconds: Math.round(process.uptime())
    });
  });
  app.use((req, _res, next) => {
    const role = String(req.headers['x-role'] || '').trim();
    if (role) {
      req.auth = { id: role === 'super_admin' ? 'super_ops' : 'admin_ops', role, superAdmin: role === 'super_admin', mfaVerified: role === 'super_admin', workspaceId: 'ws_ops' };
    }
    next();
  });
  app.use('/api/admin', createPlatformOwnerControlRouter({
    service,
    authRequired(req, res, next) {
      if (!req.auth) return res.status(401).json({ error: 'unauthorized' });
      return next();
    },
    requireSuperAdmin(req, res) {
      if (req.auth?.role !== 'super_admin' || !req.auth?.mfaVerified) {
        res.status(403).json({ error: 'forbidden' });
        return null;
      }
      return req.auth;
    },
    auditAction() {}
  }));
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      resolve({ server, baseUrl: `http://127.0.0.1:${server.address().port}` });
    });
  });
}

async function request(baseUrl, role, method, route, expectedStatus = 200) {
  const response = await fetch(`${baseUrl}${route}`, { method, headers: role ? { 'x-role': role } : {} });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  assert.strictEqual(response.status, expectedStatus, `${method} ${route} expected ${expectedStatus}, got ${response.status}: ${text}`);
  return data;
}

async function main() {
  const db = new Database(sqlitePath);
  createSchema(db);
  db.close();

  const runtimeDb = new Database(sqlitePath);
  const observability = createObservabilityService({ opsDir, env: { NODE_ENV: 'test' } });
  observability.recordRequest({ method: 'GET', path: '/api/admin/broken', status: 500, durationMs: 2, actorUserId: 'super_ops', role: 'super_admin', workspaceId: 'ws_ops' });
  observability.recordJobEvent({ type: 'provider_check', status: 'failed', target: 'email', error: 'disabled' });
  recordBackupEvent({ type: 'verify', status: 'completed', filePath: sqlitePath, actor: 'smoke' });

  const backupPath = buildBackupPath({ backupDir, label: 'ops-smoke' });
  const backup = await backupSqlite({ sourceDbPath: sqlitePath, backupPath, label: 'ops-smoke' });
  observability.recordBackupEvent({ type: 'backup', status: 'completed', filePath: backup.backupPath, sizeBytes: backup.sizeBytes, checksum: backup.checksum, actor: 'smoke' });

  const before = fs.statSync(sqlitePath).mtimeMs;
  const restore = spawnSync(process.execPath, [path.join(process.cwd(), 'scripts', 'restore-test-sqlite.js')], {
    cwd: process.cwd(),
    env: { ...process.env, DB_PATH: sqlitePath, DB_BACKUP_DIR: backupDir, OPS_EVIDENCE_DIR: opsDir },
    encoding: 'utf8'
  });
  assert.strictEqual(restore.status, 0, restore.stderr || restore.stdout);
  const after = fs.statSync(sqlitePath).mtimeMs;
  assert.strictEqual(after, before, 'restore-test must not overwrite the real DB');

  const service = createPlatformOwnerControlService({
    db: runtimeDb,
    env: { NODE_ENV: 'test', OPENAI_API_KEY: 'sk-secret-should-not-leak' },
    backupDir,
    storageAdapter: 'local',
    observability
  });
  await service.ensureSchema();
  const { server, baseUrl } = await startApp(service);
  try {
    const health = await request(baseUrl, null, 'GET', '/health/deep');
    const healthText = JSON.stringify(health);
    assert.ok(health.ok, 'health should be ok');
    assert.ok(!healthText.includes('sk-secret-should-not-leak'), 'health must not expose secrets');

    await request(baseUrl, 'school_admin', 'GET', '/api/admin/backups/evidence', 403);
    const evidence = await request(baseUrl, 'super_admin', 'GET', '/api/admin/backups/evidence');
    assert.ok(Array.isArray(evidence.events), 'backup evidence should return events');
    assert.ok(evidence.events.some((event) => event.type === 'restore_test'), 'restore-test event should be present');

    const summary = await request(baseUrl, 'super_admin', 'GET', '/api/admin/operations/logs/summary');
    assert.ok(summary.totalRequests >= 1, 'logs summary should include request totals');
    assert.ok(Array.isArray(summary.latestErrors), 'logs summary should include latest errors');

    const jobs = await request(baseUrl, 'super_admin', 'GET', '/api/admin/operations/jobs');
    assert.ok(Array.isArray(jobs.rows), 'jobs endpoint should return rows');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    runtimeDb.close();
  }

  console.log('[ops-hardening-smoke] passed');
}

main().catch((err) => {
  console.error('[ops-hardening-smoke] failed:', err?.message || err);
  process.exit(1);
});
