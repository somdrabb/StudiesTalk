#!/usr/bin/env node
'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const Database = require('better-sqlite3');

const runId = `email_recipients_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
const sqlitePath = path.join(os.tmpdir(), `${runId}.sqlite`);
const uploadsDir = path.join(os.tmpdir(), `${runId}_uploads`);
const backupDir = path.join(os.tmpdir(), `${runId}_backup`);
const basePort = 5640 + Math.floor(Math.random() * 80);

const ids = {
  workspaceA: `ws_a_${runId}`,
  adminA: `admin_a_${runId}`
};

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
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
  includeCsrf = true
} = {}) {
  const headers = {};
  if (cookieHeader(jar)) headers.Cookie = cookieHeader(jar);
  if (json !== undefined) headers['Content-Type'] = 'application/json';
  if (includeCsrf && !route.startsWith('/api/auth/') && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && jar.csrf_token) {
    headers['X-CSRF-Token'] = jar.csrf_token;
  }
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers,
    body: json !== undefined ? JSON.stringify(json) : undefined
  });
  parseSetCookie(jar, response);
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (_err) {
    data = { raw: text };
  }
  if (expectedStatuses) {
    assert.ok(
      expectedStatuses.includes(response.status),
      `${method} ${route} expected one of ${expectedStatuses.join(', ')}, got ${response.status}: ${JSON.stringify(data)}`
    );
  } else {
    assert.strictEqual(
      response.status,
      expectedStatus,
      `${method} ${route} expected ${expectedStatus}, got ${response.status}: ${JSON.stringify(data)}`
    );
  }
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
    EMAIL_FROM_NAME: 'StudiesTalk Test',
    IONOS_SMTP_PASS: 'smtp-secret-must-not-leak'
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

async function bootstrapSchema() {
  fs.mkdirSync(uploadsDir, { recursive: true });
  fs.mkdirSync(backupDir, { recursive: true });
  const child = startServer();
  await waitForServer(`http://127.0.0.1:${basePort}`);
  await stopServer(child);
}

function seedData() {
  const db = new Database(sqlitePath);
  try {
    const passwordHash = hashPassword('Secret123!');
    db.prepare(`
      INSERT OR REPLACE INTO workspaces (id, name, status, admin_email, created_at)
      VALUES (?, ?, 'approved', ?, datetime('now'))
    `).run(ids.workspaceA, 'Recipient Smoke A', `admin.a.${runId}@example.com`);

    db.prepare(`
      INSERT OR REPLACE INTO users
      (id, workspace_id, first_name, last_name, name, email, username, password_hash, role, status, native_language, native_language_confirmed, created_at)
      VALUES (?, ?, 'Admin', 'A', 'Admin A', ?, ?, ?, 'school_admin', 'active', 'en', 1, datetime('now'))
    `).run(ids.adminA, ids.workspaceA, `admin.a.${runId}@example.com`, `admin_a_${runId}`, passwordHash);

    db.prepare(`
      INSERT INTO platform_settings (key, value, updated_at)
      VALUES ('workspace_policy_version_default', '2026-04-23', datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run();
    db.prepare(`
      INSERT INTO policy_acceptances (id, workspace_id, user_id, version, accepted_at)
      VALUES (?, ?, ?, '2026-04-23', datetime('now'))
    `).run(`pa_${ids.adminA}`, ids.workspaceA, ids.adminA);
    db.prepare(`
      INSERT INTO workspace_onboarding (id, workspace_id, status, current_step, completed_at, created_at, updated_at, completed_by_user_id)
      VALUES (?, ?, 'completed', 'launch_checklist', datetime('now'), datetime('now'), datetime('now'), ?)
    `).run(`ob_${ids.workspaceA}`, ids.workspaceA, ids.adminA);
  } finally {
    db.close();
  }
}

async function login(baseUrl) {
  const jar = {};
  const data = await request(baseUrl, jar, 'POST', '/api/auth/login', {
    json: { email: `admin.a.${runId}@example.com`, password: 'Secret123!' }
  });
  assert.ok(data?.accessToken || jar.refresh_token, 'login should establish a session');
  assert.ok(jar.csrf_token, 'login should set csrf token');
  return jar;
}

async function main() {
  await bootstrapSchema();
  seedData();
  const child = startServer();
  const baseUrl = `http://127.0.0.1:${basePort}`;
  await waitForServer(baseUrl);

  try {
    const jar = await login(baseUrl);
    const toA = `to.a.${runId}@example.com`;
    const toB = `to.b.${runId}@example.com`;
    const ccA = `cc.a.${runId}@example.com`;
    const bccA = `bcc.a.${runId}@example.com`;

    const sentArrays = await request(baseUrl, jar, 'POST', `/api/workspaces/${encodeURIComponent(ids.workspaceA)}/email-settings/test`, {
      json: {
        toEmail: [toA, toB],
        cc: [ccA],
        bcc: [bccA],
        subject: 'Recipient arrays',
        bodyText: 'Hello arrays'
      }
    });
    assert.ok(sentArrays.ok !== false, 'send with recipient arrays should succeed');

    const sentComma = await request(baseUrl, jar, 'POST', `/api/workspaces/${encodeURIComponent(ids.workspaceA)}/email-settings/test`, {
      json: {
        toEmail: `${toA}, ${toB}; ${toA}`,
        subject: 'Recipient comma',
        bodyText: 'Hello comma'
      }
    });
    assert.ok(sentComma.ok !== false, 'send with comma-separated recipients should succeed');

    await request(baseUrl, jar, 'POST', `/api/workspaces/${encodeURIComponent(ids.workspaceA)}/email-settings/test`, {
      json: { toEmail: ['not-an-email'], subject: 'Invalid', bodyText: 'Invalid' },
      expectedStatus: 400
    });

    await request(baseUrl, jar, 'POST', `/api/workspaces/${encodeURIComponent(ids.workspaceA)}/email-settings/test`, {
      json: {
        toEmail: Array.from({ length: 51 }, (_, index) => `limit.${index}.${runId}@example.com`),
        subject: 'Too many',
        bodyText: 'Limit'
      },
      expectedStatus: 400
    });

    const draft = await request(baseUrl, jar, 'POST', '/api/admin/email/drafts', {
      json: {
        toEmail: [toA, toB, toA],
        cc: `${ccA}; ${ccA}`,
        bcc: [bccA],
        subject: 'Recipient draft',
        body: 'Draft body'
      },
      expectedStatus: 201
    });
    assert.deepStrictEqual(draft.draft.toEmail, [toA, toB], 'draft response should restore deduped To array');
    assert.deepStrictEqual(draft.draft.cc, [ccA], 'draft response should restore deduped Cc array');
    assert.deepStrictEqual(draft.draft.bcc, [bccA], 'draft response should restore Bcc array');

    const loaded = await request(baseUrl, jar, 'GET', `/api/admin/email/drafts/${draft.draft.id}`);
    assert.deepStrictEqual(loaded.draft.toEmail, [toA, toB], 'loaded draft should return To chips');
    assert.deepStrictEqual(loaded.draft.cc, [ccA], 'loaded draft should return Cc chips');
    assert.deepStrictEqual(loaded.draft.bcc, [bccA], 'loaded draft should return Bcc chips');
    assert.ok(!JSON.stringify(loaded).includes('smtp-secret-must-not-leak'), 'draft response must not expose SMTP secrets');

    const db = new Database(sqlitePath);
    try {
      const log = db.prepare('SELECT to_email, cc, bcc FROM workspace_email_logs WHERE subject = ?').get('Recipient arrays');
      assert.ok(log, 'send should create email log');
      assert.strictEqual(log.to_email, `${toA}, ${toB}`);
      assert.strictEqual(log.cc, ccA);
      assert.strictEqual(log.bcc, bccA);
    } finally {
      db.close();
    }

    console.log('[email-recipient-chips-smoke] passed');
  } finally {
    await stopServer(child);
  }
}

main().catch((error) => {
  console.error('[email-recipient-chips-smoke] failed:', error?.stack || error?.message || error);
  process.exit(1);
});
