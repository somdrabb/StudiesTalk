#!/usr/bin/env node
'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const Database = require('better-sqlite3');

const runId = `email_important_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
const sqlitePath = path.join(os.tmpdir(), `${runId}.sqlite`);
const uploadsDir = path.join(os.tmpdir(), `${runId}_uploads`);
const backupDir = path.join(os.tmpdir(), `${runId}_backup`);
const basePort = 5120 + Math.floor(Math.random() * 70);

const ids = {
  workspaceA: `ws_a_${runId}`,
  workspaceB: `ws_b_${runId}`,
  adminA: `admin_a_${runId}`,
  adminB: `admin_b_${runId}`
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
    const insertWorkspace = db.prepare(`
      INSERT OR REPLACE INTO workspaces (id, name, status, admin_email, created_at)
      VALUES (?, ?, 'approved', ?, datetime('now'))
    `);
    insertWorkspace.run(ids.workspaceA, 'Important Smoke A', `admin.a.${runId}@example.com`);
    insertWorkspace.run(ids.workspaceB, 'Important Smoke B', `admin.b.${runId}@example.com`);

    const insertUser = db.prepare(`
      INSERT OR REPLACE INTO users
      (id, workspace_id, first_name, last_name, name, email, username, password_hash, role, status, native_language, native_language_confirmed, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'school_admin', 'active', 'en', 1, datetime('now'))
    `);
    insertUser.run(ids.adminA, ids.workspaceA, 'Admin', 'A', 'Admin A', `admin.a.${runId}@example.com`, `admin_a_${runId}`, passwordHash);
    insertUser.run(ids.adminB, ids.workspaceB, 'Admin', 'B', 'Admin B', `admin.b.${runId}@example.com`, `admin_b_${runId}`, passwordHash);

    db.prepare(`
      INSERT INTO platform_settings (key, value, updated_at)
      VALUES ('workspace_policy_version_default', '2026-04-23', datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run();
    const acceptPolicy = db.prepare(`
      INSERT INTO policy_acceptances (id, workspace_id, user_id, version, accepted_at)
      VALUES (?, ?, ?, '2026-04-23', datetime('now'))
    `);
    acceptPolicy.run(`pa_${ids.adminA}`, ids.workspaceA, ids.adminA);
    acceptPolicy.run(`pa_${ids.adminB}`, ids.workspaceB, ids.adminB);
    const onboard = db.prepare(`
      INSERT INTO workspace_onboarding (id, workspace_id, status, current_step, completed_at, created_at, updated_at, completed_by_user_id)
      VALUES (?, ?, 'completed', 'launch_checklist', datetime('now'), datetime('now'), datetime('now'), ?)
    `);
    onboard.run(`ob_${ids.workspaceA}`, ids.workspaceA, ids.adminA);
    onboard.run(`ob_${ids.workspaceB}`, ids.workspaceB, ids.adminB);

    const insertMail = db.prepare(`
      INSERT INTO inbound_emails (
        workspace_id, message_id, sender, recipient, subject, text_body, html_body,
        folder, attachments_json, received_at, is_read, mailbox_type, visibility_scope,
        direction, spam_status, is_important
      ) VALUES (?, ?, ?, ?, ?, ?, '', 'inbox', '', datetime('now'), 0, 'workspace', 'workspace', 'inbound', 'clean', ?)
    `);
    insertMail.run(ids.workspaceA, `a_mail_${runId}`, 'sender@example.com', `admin.a.${runId}@example.com`, 'Own A', 'Hello school', 0);
    insertMail.run(ids.workspaceA, `a_seed_important_${runId}`, 'important@example.com', `admin.a.${runId}@example.com`, 'Seed Important A', 'Important already', 1);
    insertMail.run(ids.workspaceB, `b_mail_${runId}`, 'sender-b@example.com', `admin.b.${runId}@example.com`, 'Own B', 'Other school', 0);
    insertMail.run(ids.workspaceB, `b_important_${runId}`, 'important-b@example.com', `admin.b.${runId}@example.com`, 'Seed Important B', 'Foreign important', 1);
  } finally {
    db.close();
  }
}

async function login(baseUrl, email) {
  const jar = {};
  const data = await request(baseUrl, jar, 'POST', '/api/auth/login', {
    json: { email, password: 'Secret123!' }
  });
  assert.ok(data?.accessToken || jar.refresh_token, 'login should establish a session');
  assert.ok(jar.csrf_token, 'login should set csrf token');
  return jar;
}

function getMailIds() {
  const db = new Database(sqlitePath);
  try {
    const rows = db.prepare('SELECT id, message_id FROM inbound_emails').all();
    return Object.fromEntries(rows.map((row) => [row.message_id, row.id]));
  } finally {
    db.close();
  }
}

async function main() {
  await bootstrapSchema();
  seedData();
  const child = startServer();
  const baseUrl = `http://127.0.0.1:${basePort}`;
  await waitForServer(baseUrl);

  try {
    const adminAJar = await login(baseUrl, `admin.a.${runId}@example.com`);
    const idsByMessage = getMailIds();
    const ownId = idsByMessage[`a_mail_${runId}`];
    const foreignId = idsByMessage[`b_mail_${runId}`];

    await request(baseUrl, adminAJar, 'POST', `/api/admin/inbox/${ownId}/important`, {
      json: {},
      includeCsrf: false,
      expectedStatuses: [403, 419]
    });

    await request(baseUrl, adminAJar, 'POST', `/api/admin/inbox/${ownId}/important`, { json: {} });
    const importantList = await request(baseUrl, adminAJar, 'GET', '/api/admin/inbox/important');
    assert.ok(importantList.rows.some((row) => row.id === ownId), 'marked email should appear in Important folder');
    assert.ok(importantList.rows.every((row) => row.workspace_id === ids.workspaceA), 'important endpoint must stay workspace scoped');
    assert.ok(!JSON.stringify(importantList).includes('smtp-secret-must-not-leak'), 'important endpoint must not expose SMTP secrets');

    const inbox = await request(baseUrl, adminAJar, 'GET', '/api/admin/inbox?folder=inbox');
    assert.ok(inbox.rows.some((row) => row.id === ownId), 'important email should remain in Inbox');

    await request(baseUrl, adminAJar, 'DELETE', `/api/admin/inbox/${ownId}/important`);
    const afterUnmark = await request(baseUrl, adminAJar, 'GET', '/api/admin/inbox/important');
    assert.ok(!afterUnmark.rows.some((row) => row.id === ownId), 'unmarked email should leave Important folder');

    await request(baseUrl, adminAJar, 'POST', `/api/admin/inbox/${foreignId}/important`, {
      json: {},
      expectedStatuses: [403, 404]
    });

    console.log('[email-important-smoke] passed');
  } finally {
    await stopServer(child);
  }
}

main().catch((error) => {
  console.error('[email-important-smoke] failed:', error?.stack || error?.message || error);
  process.exit(1);
});
