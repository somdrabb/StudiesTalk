#!/usr/bin/env node
'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const Database = require('better-sqlite3');

const runId = `email_control_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
const sqlitePath = path.join(os.tmpdir(), `${runId}.sqlite`);
const uploadsDir = path.join(os.tmpdir(), `${runId}_uploads`);
const backupDir = path.join(os.tmpdir(), `${runId}_backup`);
const basePort = 4740 + Math.floor(Math.random() * 90);

const ids = {
  workspaceId: `ws_${runId}`,
  superAdminId: `super_${runId}`,
  schoolAdminId: `school_${runId}`
};

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
    if (idx < 0) continue;
    bits += idx.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(baseUrl) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 30000) {
    try {
      const res = await fetch(`${baseUrl}/`);
      if (res.status >= 200 || res.status === 404) return;
    } catch (_err) {}
    await sleep(300);
  }
  throw new Error('Server did not become ready in time');
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  await sleep(700);
}

function parseSetCookie(jar, response) {
  const setCookie = response.headers.getSetCookie ? response.headers.getSetCookie() : [];
  for (const header of setCookie) {
    const first = String(header || '').split(';')[0];
    const eq = first.indexOf('=');
    if (eq <= 0) continue;
    jar[first.slice(0, eq).trim()] = first.slice(eq + 1).trim();
  }
}

function cookieHeader(jar) {
  return Object.entries(jar)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${key}=${value}`)
    .join('; ');
}

async function request(baseUrl, jar, method, route, {
  json,
  expectedStatus = 200,
  expectedStatuses = null,
  parseJson = true
} = {}) {
  const headers = {};
  if (cookieHeader(jar)) headers.Cookie = cookieHeader(jar);
  if (json !== undefined) headers['Content-Type'] = 'application/json';
  if (!route.startsWith('/api/auth/') && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && jar.csrf_token) {
    headers['X-CSRF-Token'] = jar.csrf_token;
  }

  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers,
    body: json !== undefined ? JSON.stringify(json) : undefined
  });
  parseSetCookie(jar, response);

  const text = await response.text();
  const data = parseJson
    ? (() => {
        try {
          return text ? JSON.parse(text) : null;
        } catch (_err) {
          return { raw: text };
        }
      })()
    : text;

  if (expectedStatuses) {
    assert.ok(
      expectedStatuses.includes(response.status),
      `${method} ${route} => expected one of ${expectedStatuses.join(', ')}, got ${response.status}: ${JSON.stringify(data)}`
    );
  } else {
    assert.strictEqual(
      response.status,
      expectedStatus,
      `${method} ${route} => expected ${expectedStatus}, got ${response.status}: ${JSON.stringify(data)}`
    );
  }

  return { response, data };
}

async function api(baseUrl, jar, method, route, options = {}) {
  const { data } = await request(baseUrl, jar, method, route, options);
  return data;
}

function startServer() {
  const env = {
    ...process.env,
    NODE_ENV: 'development',
    HOST: '127.0.0.1',
    PORT: String(basePort),
    DB_ENGINE: 'sqlite',
    DB_PATH: sqlitePath,
    BILLING_DB_ENGINE: 'sqlite',
    TASKS_DB_ENGINE: 'sqlite',
    ATTENDANCE_DB_ENGINE: 'sqlite',
    CHANNELS_DB_ENGINE: 'sqlite',
    MESSAGES_DB_ENGINE: 'sqlite',
    UPLOADS_DIR: uploadsDir,
    DB_BACKUP_DIR: backupDir,
    EMAIL_PROVIDER: 'disabled',
    EMAIL_FROM_EMAIL: 'no-reply@example.com',
    EMAIL_FROM_NAME: 'StudiesTalk Test'
  };
  const child = spawn(process.execPath, ['server.js'], {
    cwd: process.cwd(),
    env,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.stdout.on('data', (chunk) => process.stdout.write(chunk));
  child.stderr.on('data', (chunk) => process.stderr.write(chunk));
  return child;
}

function seedUsers() {
  const db = new Database(sqlitePath);
  try {
    const passwordHash = hashPassword('Secret123!');
    db.prepare(`
      INSERT OR REPLACE INTO workspaces (id, name, status, admin_email, created_at)
      VALUES (?, ?, 'approved', ?, datetime('now'))
    `).run(ids.workspaceId, 'Email Smoke School', `super.${runId}@example.com`);

    const insertUser = db.prepare(`
      INSERT OR REPLACE INTO users
      (id, workspace_id, first_name, last_name, name, email, username, password_hash, role, status, native_language, native_language_confirmed, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 'en', 1, datetime('now'))
    `);

    insertUser.run(
      ids.superAdminId,
      ids.workspaceId,
      'Super',
      'Admin',
      'Super Admin',
      `super.${runId}@example.com`,
      `super_${runId}`,
      passwordHash,
      'super_admin'
    );
    insertUser.run(
      ids.schoolAdminId,
      ids.workspaceId,
      'School',
      'Admin',
      'School Admin',
      `school.${runId}@example.com`,
      `school_${runId}`,
      passwordHash,
      'school_admin'
    );
  } finally {
    db.close();
  }
}

async function login(baseUrl, email) {
  const jar = {};
  const { response, data: loginResult } = await request(baseUrl, jar, 'POST', '/api/auth/login', {
    json: { email, password: 'Secret123!' },
    expectedStatuses: [200, 202]
  });
  if (response.status === 202 || loginResult?.mfaRequired) {
    assert.ok(loginResult?.mfaToken, 'MFA login should return an MFA token');
    const setup = await api(baseUrl, jar, 'POST', '/api/auth/mfa/setup/start', {
      json: { mfaToken: loginResult.mfaToken }
    });
    assert.ok(setup?.secret, 'MFA setup should return a TOTP secret');
    const verified = await api(baseUrl, jar, 'POST', '/api/auth/mfa/verify', {
      json: { mfaToken: loginResult.mfaToken, code: generateTotpCode(setup.secret) }
    });
    assert.ok(verified?.accessToken || jar.refresh_token, 'MFA verification should establish a session');
    return jar;
  }
  assert.ok(loginResult?.accessToken || jar.refresh_token, 'login should establish a session');
  return jar;
}

async function bootstrapSchema() {
  fs.mkdirSync(uploadsDir, { recursive: true });
  fs.mkdirSync(backupDir, { recursive: true });
  const child = startServer();
  await waitForServer(`http://127.0.0.1:${basePort}`);
  await stopServer(child);
}

function insertFailedLog() {
  const db = new Database(sqlitePath);
  try {
    const id = `elog_failed_${crypto.randomBytes(4).toString('hex')}`;
    db.prepare(`
      INSERT INTO workspace_email_logs (
        id, workspace_id, sent_by_user_id, to_email, from_email, subject,
        body_text, body_html, type, status, error_message, direction, provider_key, metadata_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'test', 'failed', ?, 'outbound', 'disabled', ?, datetime('now'))
    `).run(
      id,
      ids.workspaceId,
      ids.superAdminId,
      'failed@example.com',
      'owner@example.com',
      'Broken message',
      'Broken',
      '<div>Broken</div>',
      'Synthetic failure',
      JSON.stringify({ mode: 'owner' })
    );
    return id;
  } finally {
    db.close();
  }
}

async function main() {
  await bootstrapSchema();
  seedUsers();

  const child = startServer();
  const baseUrl = `http://127.0.0.1:${basePort}`;
  await waitForServer(baseUrl);

  try {
    const superJar = await login(baseUrl, `super.${runId}@example.com`);
    const schoolJar = await login(baseUrl, `school.${runId}@example.com`);

    const overview = await api(baseUrl, superJar, 'GET', `/api/admin/email-control/overview?workspaceId=${encodeURIComponent(ids.workspaceId)}`);
    assert.strictEqual(typeof overview.inboxCount, 'number', 'overview should return inbox count');

    await request(baseUrl, schoolJar, 'GET', '/api/admin/email-control/overview', {
      expectedStatus: 403
    });

    const ownerSettings = await api(baseUrl, superJar, 'POST', '/api/admin/email-control/owner', {
      json: {
        owner_enabled: 1,
        owner_name: 'Platform Owner',
        owner_email: 'owner@example.com',
        owner_subject_prefix: '[Owner]',
        owner_signature: 'Kind regards,\nOwner'
      }
    });
    assert.strictEqual(ownerSettings.ok, true, 'owner settings should save');

    const workspaceSettings = await api(baseUrl, superJar, 'POST', '/api/admin/email-control/workspace', {
      json: {
        workspaceId: ids.workspaceId,
        workspace_email_enabled: 1,
        workspace_email: 'school-admin@example.com',
        workspace_sender_name: 'Smoke School',
        workspace_subject_prefix: '[School]',
        workspace_signature: 'School signature',
        use_owner_fallback: 1
      }
    });
    assert.strictEqual(workspaceSettings.ok, true, 'workspace settings should save');

    const testSend = await api(baseUrl, superJar, 'POST', '/api/admin/email-control/test-send', {
      json: {
        mode: 'owner',
        workspaceId: ids.workspaceId,
        to: 'recipient@example.com',
        subject: 'Smoke test',
        message: 'Hello from smoke'
      }
    });
    assert.strictEqual(testSend.ok, true, 'test send should succeed');
    assert.strictEqual(testSend.mock, true, 'disabled provider should report mock mode');
    assert.ok(testSend.logId, 'test send should create a log row');

    const settings = await api(baseUrl, superJar, 'GET', `/api/admin/email-control/settings?workspaceId=${encodeURIComponent(ids.workspaceId)}`);
    assert.ok(settings.ownerSettings, 'settings should include owner settings');
    assert.ok(settings.workspaceSettings, 'settings should include workspace settings');
    assert.ok(settings.lastTestResult, 'settings should expose last test result');
    assert.ok(!JSON.stringify(settings).includes('IONOS_SMTP_PASS'), 'settings response must not expose SMTP secrets');

    const failedLogId = insertFailedLog();

    const failedLogs = await api(baseUrl, superJar, 'GET', `/api/admin/email-control/logs?workspaceId=${encodeURIComponent(ids.workspaceId)}&status=failed&limit=20`);
    assert.ok(Array.isArray(failedLogs.logs) && failedLogs.logs.some((row) => row.id === failedLogId), 'failed filter should include failed email log');

    await request(baseUrl, schoolJar, 'POST', `/api/admin/email-control/logs/${encodeURIComponent(failedLogId)}/retry`, {
      json: {},
      expectedStatus: 403
    });

    const updatedOverview = await api(baseUrl, superJar, 'GET', `/api/admin/email-control/overview?workspaceId=${encodeURIComponent(ids.workspaceId)}`);
    assert.ok(updatedOverview.sentCount >= 1, 'overview should include sent count after test send');
    assert.ok(updatedOverview.failedCount >= 1, 'overview should include failed count after failed log insert');

    console.log('[email-control-smoke] passed');
  } finally {
    await stopServer(child);
  }
}

main().catch((error) => {
  console.error('[email-control-smoke] failed:', error?.stack || error?.message || error);
  process.exit(1);
});
