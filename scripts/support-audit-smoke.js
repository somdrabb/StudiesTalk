#!/usr/bin/env node
'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const Database = require('better-sqlite3');

const runId = `support_audit_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
const port = 4750 + Math.floor(Math.random() * 200);
const baseUrl = `http://127.0.0.1:${port}`;
const tempRoot = path.join(os.tmpdir(), runId);
const sqlitePath = path.join(tempRoot, 'support.sqlite');
const opsDir = path.join(tempRoot, 'ops');
const csrfToken = `csrf_${runId}`;

const ids = {
  workspaceId: `ws_${runId}`,
  superAdminId: `super_${runId}`,
  adminId: `admin_${runId}`,
  channelId: `ch_${runId}`,
  messageId: `msg_${runId}`
};

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

function base32Decode(value = '') {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const cleaned = String(value || '').replace(/=+$/g, '').replace(/\s+/g, '').toUpperCase();
  let bits = '';
  for (const char of cleaned) {
    const idx = alphabet.indexOf(char);
    if (idx >= 0) bits += idx.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

function generateTotpCode(secret, step = Math.floor(Date.now() / 30000)) {
  const key = base32Decode(secret);
  const counter = Buffer.alloc(8);
  counter.writeUInt32BE(Math.floor(step / 0x100000000), 0);
  counter.writeUInt32BE(step >>> 0, 4);
  const hmac = crypto.createHmac('sha1', key).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const binary = ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String((binary >>> 0) % 1000000).padStart(6, '0');
}

async function waitForServer() {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 30000) {
    try {
      const res = await fetch(`${baseUrl}/`);
      if (res.status >= 200 || res.status === 404) return;
    } catch (_err) {}
    await wait(300);
  }
  throw new Error('Server did not become ready');
}

function seedDatabase() {
  const db = new Database(sqlitePath);
  const passwordHash = hashPassword('Passw0rd!');
  const userColumns = new Set(db.prepare('PRAGMA table_info(users)').all().map((row) => String(row.name || '')));
  const ensureColumn = (name, sql) => {
    if (!userColumns.has(name)) {
      db.exec(sql);
      userColumns.add(name);
    }
  };
  ensureColumn('must_change_password', 'ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0');
  ensureColumn('temp_login_started_at', 'ALTER TABLE users ADD COLUMN temp_login_started_at INTEGER');
  ensureColumn('native_language', "ALTER TABLE users ADD COLUMN native_language TEXT DEFAULT 'en'");
  ensureColumn('native_language_confirmed', 'ALTER TABLE users ADD COLUMN native_language_confirmed INTEGER DEFAULT 1');

  db.prepare(`
    INSERT INTO workspaces (id, name, status, admin_email, created_at)
    VALUES (?, 'Support Audit Smoke Workspace', 'approved', 'admin@example.com', datetime('now'))
  `).run(ids.workspaceId);
  const insertUser = db.prepare(`
    INSERT INTO users
      (id, workspace_id, first_name, last_name, name, email, username, password_hash, role, status, native_language, native_language_confirmed, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 'en', 1, datetime('now'))
  `);
  insertUser.run(ids.superAdminId, ids.workspaceId, 'Super', 'Admin', 'Super Admin', 'super@example.com', 'support_super', passwordHash, 'super_admin');
  insertUser.run(ids.adminId, ids.workspaceId, 'School', 'Admin', 'School Admin', 'admin@example.com', 'support_admin', passwordHash, 'school_admin');
  db.prepare('INSERT INTO channels (id, workspace_id, name, topic) VALUES (?, ?, ?, ?)').run(ids.channelId, ids.workspaceId, 'Support Smoke', 'general');
  db.prepare('INSERT INTO channel_members (channel_id, user_id) VALUES (?, ?)').run(ids.channelId, ids.adminId);
  db.prepare("INSERT INTO messages (id, channel_id, author, initials, time, text, created_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))")
    .run(ids.messageId, ids.channelId, 'School Admin', 'SA', '10:00', 'support audit smoke');
  db.close();
}

async function request(method, route, { token = '', body, expectedStatus = 200, csrf = true } = {}) {
  const headers = { Cookie: `csrf_token=${csrfToken}` };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (csrf && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) headers['x-csrf-token'] = csrfToken;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${baseUrl}${route}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (_err) {
    data = { raw: text };
  }
  assert.strictEqual(res.status, expectedStatus, `${method} ${route} expected ${expectedStatus}, got ${res.status}: ${text}`);
  return data;
}

async function login(email) {
  const payload = await request('POST', '/api/auth/login', {
    body: { email, password: 'Passw0rd!' },
    expectedStatus: email === 'super@example.com' ? 202 : 200
  });
  if (payload?.mfaRequired) {
    const setup = await request('POST', '/api/auth/mfa/setup/start', { body: { mfaToken: payload.mfaToken } });
    const verified = await request('POST', '/api/auth/mfa/verify', {
      body: { mfaToken: payload.mfaToken, code: generateTotpCode(setup.secret) }
    });
    assert.ok(verified?.accessToken, `Expected MFA access token for ${email}`);
    return verified.accessToken;
  }
  assert.ok(payload?.accessToken, `Expected access token for ${email}`);
  return payload.accessToken;
}

function readJsonl(fileName) {
  const filePath = path.join(opsDir, fileName);
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

function expireSession(sessionId) {
  const db = new Database(sqlitePath);
  db.prepare("UPDATE support_impersonation_sessions SET expires_at = datetime('now', '-1 minute') WHERE id = ?").run(sessionId);
  db.close();
}

async function main() {
  fs.mkdirSync(tempRoot, { recursive: true });
  const child = spawn(process.execPath, ['server.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: 'development',
      PORT: String(port),
      DB_PATH: sqlitePath,
      DB_ENGINE: 'sqlite',
      BILLING_DB_ENGINE: 'sqlite',
      TASKS_DB_ENGINE: 'sqlite',
      ATTENDANCE_DB_ENGINE: 'sqlite',
      EMAIL_PROVIDER: 'disabled',
      OPS_EVIDENCE_DIR: opsDir
    },
    stdio: 'inherit'
  });

  try {
    await waitForServer();
    seedDatabase();
    const superToken = await login('super@example.com');
    const adminToken = await login('admin@example.com');

    await request('POST', '/api/admin/support/impersonation/start', {
      expectedStatus: 401,
      body: { workspaceId: ids.workspaceId, targetUserId: ids.adminId, reason: 'Need to inspect billing visibility' }
    });

    await request('POST', '/api/admin/support/impersonation/start', {
      token: superToken,
      expectedStatus: 400,
      body: { workspaceId: ids.workspaceId, targetUserId: ids.adminId, reason: 'short' }
    });

    await request('GET', '/api/admin/support/impersonation/active', {
      token: adminToken,
      expectedStatus: 403
    });

    const started = await request('POST', '/api/admin/support/impersonation/start', {
      token: superToken,
      body: {
        workspaceId: ids.workspaceId,
        targetUserId: ids.adminId,
        reason: 'Investigate customer support ticket'
      }
    });
    assert.ok(started.row?.id, 'support session should start');

    await request('PATCH', `/api/admin/billing/${encodeURIComponent(ids.workspaceId)}/profile`, {
      token: superToken,
      expectedStatus: 403,
      body: { vatId: 'DE999999999' }
    });

    await request('GET', `/api/admin/billing/${encodeURIComponent(ids.workspaceId)}`, { token: superToken });
    await request('GET', `/api/channels/${encodeURIComponent(ids.channelId)}/messages`, { token: superToken });
    await wait(200);

    const accessRows = readJsonl('support-access-events.jsonl');
    assert.ok(accessRows.some((row) => row.resource_type === 'billing' && row.workspace_id === ids.workspaceId), 'billing support access should be logged');
    assert.ok(accessRows.some((row) => row.resource_type === 'messages' && row.resource_id === ids.channelId), 'message support access should be logged');

    const customerLog = await request('GET', '/api/workspace/support-access-log', { token: adminToken });
    assert.ok(customerLog.summary.accessEventCount >= 1, 'customer support log should include access events');
    assert.ok(customerLog.sessions.some((row) => row.reason === 'Investigate customer support ticket'), 'customer support log should include reason');

    const exportPayload = await request('GET', '/api/admin/support/audit/export', { token: superToken });
    assert.ok(exportPayload.sessions.length >= 1, 'support audit export should include sessions');
    assert.ok(exportPayload.accessEvents.length >= 1, 'support audit export should include access events');

    expireSession(started.row.id);
    await request('GET', `/api/admin/billing/${encodeURIComponent(ids.workspaceId)}`, { token: superToken });
    await wait(200);
    const active = await request('GET', '/api/admin/support/impersonation/active', { token: superToken });
    assert.ok(!active.rows.some((row) => row.id === started.row.id), 'expired support session should auto-end');

    await request('GET', '/api/admin/support/audit/export', {
      token: adminToken,
      expectedStatus: 403
    });

    const sessionRows = readJsonl('support-sessions.jsonl');
    assert.ok(sessionRows.some((row) => row.id === started.row.id && row.active === true), 'session start evidence should be written');
    assert.ok(sessionRows.some((row) => row.id === started.row.id && row.active === false), 'session end evidence should be written');

    console.log('[support-audit-smoke] passed');
  } finally {
    child.kill('SIGTERM');
    await wait(300);
  }
}

main().catch((err) => {
  console.error('[support-audit-smoke] failed:', err?.message || err);
  process.exit(1);
});
