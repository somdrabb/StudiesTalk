#!/usr/bin/env node
'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const Database = require('better-sqlite3');

const runId = `email_attachments_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
const sqlitePath = path.join(os.tmpdir(), `${runId}.sqlite`);
const uploadsDir = path.join(os.tmpdir(), `${runId}_uploads`);
const backupDir = path.join(os.tmpdir(), `${runId}_backup`);
const basePort = 5560 + Math.floor(Math.random() * 80);

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
  form,
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
    body: json !== undefined ? JSON.stringify(json) : form
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

function makeUploadForm(name, content, type = 'application/octet-stream') {
  const form = new FormData();
  form.append('files', new Blob([content], { type }), name);
  return form;
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
    insertWorkspace.run(ids.workspaceA, 'Attachment Smoke A', `admin.a.${runId}@example.com`);
    insertWorkspace.run(ids.workspaceB, 'Attachment Smoke B', `admin.b.${runId}@example.com`);

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

async function main() {
  await bootstrapSchema();
  seedData();
  const child = startServer();
  const baseUrl = `http://127.0.0.1:${basePort}`;
  await waitForServer(baseUrl);

  try {
    const adminAJar = await login(baseUrl, `admin.a.${runId}@example.com`);
    const adminBJar = await login(baseUrl, `admin.b.${runId}@example.com`);

    await request(baseUrl, adminAJar, 'POST', '/api/admin/email/attachments', {
      form: makeUploadForm('contract.pdf', Buffer.from('%PDF smoke'), 'application/pdf'),
      includeCsrf: false,
      expectedStatuses: [403, 419]
    });

    const uploaded = await request(baseUrl, adminAJar, 'POST', '/api/admin/email/attachments', {
      form: makeUploadForm('contract.pdf', Buffer.from('%PDF smoke'), 'application/pdf'),
      expectedStatus: 201
    });
    assert.strictEqual(uploaded.attachments.length, 1, 'upload should return one attachment');
    const attachment = uploaded.attachments[0];
    assert.ok(attachment.id && attachment.name === 'contract.pdf', 'upload should return attachment metadata');

    const draft = await request(baseUrl, adminAJar, 'POST', '/api/admin/email/drafts', {
      json: {
        toEmail: `student.${runId}@example.com`,
        subject: 'Attachment draft',
        body: 'Please see attached.',
        attachmentIds: [attachment.id]
      },
      expectedStatus: 201
    });
    assert.strictEqual(draft.draft.attachments.length, 1, 'draft should keep attachment metadata');

    const sent = await request(baseUrl, adminAJar, 'POST', `/api/admin/email/drafts/${draft.draft.id}/send`, {
      json: {
        toEmail: `student.${runId}@example.com`,
        subject: 'Attachment draft',
        body: 'Please see attached.',
        attachmentIds: [attachment.id]
      }
    });
    assert.strictEqual(sent.sent, true, 'draft send with attachment should succeed');

    const db = new Database(sqlitePath);
    try {
      const sentDraft = db.prepare('SELECT status, attachments_json FROM email_drafts WHERE id = ?').get(draft.draft.id);
      assert.strictEqual(sentDraft.status, 'sent', 'sent draft should be marked sent');
      assert.ok(JSON.parse(sentDraft.attachments_json || '[]').length >= 1, 'sent draft should keep attachment metadata');
      const log = db.prepare(`
        SELECT id
        FROM workspace_email_logs
        WHERE workspace_id = ? AND subject = ?
        ORDER BY datetime(created_at) DESC
        LIMIT 1
      `).get(ids.workspaceA, 'Attachment draft');
      assert.ok(log, 'send should create email log');
    } finally {
      db.close();
    }

    const foreign = await request(baseUrl, adminBJar, 'POST', '/api/admin/email/attachments', {
      form: makeUploadForm('foreign.txt', Buffer.from('foreign'), 'text/plain'),
      expectedStatus: 201
    });
    await request(baseUrl, adminAJar, 'DELETE', `/api/admin/email/attachments/${foreign.attachments[0].id}`, {
      expectedStatus: 404
    });

    await request(baseUrl, adminAJar, 'POST', '/api/admin/email/attachments', {
      form: makeUploadForm('blocked.exe', Buffer.from('MZ'), 'application/octet-stream'),
      expectedStatus: 400
    });

    await request(baseUrl, adminAJar, 'POST', '/api/admin/email/attachments', {
      form: makeUploadForm('too-large.pdf', Buffer.alloc(10 * 1024 * 1024 + 1), 'application/pdf'),
      expectedStatus: 400
    });

    const disposable = await request(baseUrl, adminAJar, 'POST', '/api/admin/email/attachments', {
      form: makeUploadForm('remove-me.txt', Buffer.from('delete'), 'text/plain'),
      expectedStatus: 201
    });
    await request(baseUrl, adminAJar, 'DELETE', `/api/admin/email/attachments/${disposable.attachments[0].id}`);

    console.log('[email-attachments-smoke] passed');
  } finally {
    await stopServer(child);
  }
}

main().catch((error) => {
  console.error('[email-attachments-smoke] failed:', error?.stack || error?.message || error);
  process.exit(1);
});
