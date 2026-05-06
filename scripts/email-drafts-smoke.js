#!/usr/bin/env node
'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const Database = require('better-sqlite3');

const runId = `email_drafts_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
const sqlitePath = path.join(os.tmpdir(), `${runId}.sqlite`);
const uploadsDir = path.join(os.tmpdir(), `${runId}_uploads`);
const backupDir = path.join(os.tmpdir(), `${runId}_backup`);
const basePort = 5190 + Math.floor(Math.random() * 60);

const ids = {
  workspaceA: `ws_a_${runId}`,
  workspaceB: `ws_b_${runId}`,
  adminA: `admin_a_${runId}`,
  adminB: `admin_b_${runId}`,
  teacherA: `teacher_a_${runId}`
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
    insertWorkspace.run(ids.workspaceA, 'Draft Smoke A', `admin.a.${runId}@example.com`);
    insertWorkspace.run(ids.workspaceB, 'Draft Smoke B', `admin.b.${runId}@example.com`);

    const insertUser = db.prepare(`
      INSERT OR REPLACE INTO users
      (id, workspace_id, first_name, last_name, name, email, username, password_hash, role, status, native_language, native_language_confirmed, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 'en', 1, datetime('now'))
    `);
    insertUser.run(ids.adminA, ids.workspaceA, 'Admin', 'A', 'Admin A', `admin.a.${runId}@example.com`, `admin_a_${runId}`, passwordHash, 'school_admin');
    insertUser.run(ids.adminB, ids.workspaceB, 'Admin', 'B', 'Admin B', `admin.b.${runId}@example.com`, `admin_b_${runId}`, passwordHash, 'school_admin');
    insertUser.run(ids.teacherA, ids.workspaceA, 'Teacher', 'A', 'Teacher A', `teacher.a.${runId}@example.com`, `teacher_a_${runId}`, passwordHash, 'teacher');

    db.prepare(`
      INSERT INTO platform_settings (key, value, updated_at)
      VALUES ('workspace_policy_version_default', '2026-04-23', datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run();
    const acceptPolicy = db.prepare(`
      INSERT INTO policy_acceptances (id, workspace_id, user_id, version, accepted_at)
      VALUES (?, ?, ?, '2026-04-23', datetime('now'))
    `);
    [ids.adminA, ids.adminB, ids.teacherA].forEach((userId) => {
      const workspaceId = userId === ids.adminB ? ids.workspaceB : ids.workspaceA;
      acceptPolicy.run(`pa_${userId}`, workspaceId, userId);
    });
    const onboard = db.prepare(`
      INSERT INTO workspace_onboarding (id, workspace_id, status, current_step, completed_at, created_at, updated_at, completed_by_user_id)
      VALUES (?, ?, 'completed', 'launch_checklist', datetime('now'), datetime('now'), datetime('now'), ?)
    `);
    onboard.run(`ob_${ids.workspaceA}`, ids.workspaceA, ids.adminA);
    onboard.run(`ob_${ids.workspaceB}`, ids.workspaceB, ids.adminB);

    db.prepare(`
      INSERT INTO email_drafts (
        id, workspace_id, author_user_id, to_email, subject, body, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'draft', datetime('now'), datetime('now'))
    `).run(`foreign_draft_${runId}`, ids.workspaceB, ids.adminB, `other.${runId}@example.com`, 'Foreign draft', 'Do not leak');
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
    const teacherAJar = await login(baseUrl, `teacher.a.${runId}@example.com`);

    await request(baseUrl, adminAJar, 'POST', '/api/admin/email/drafts', {
      json: { toEmail: `student.${runId}@example.com`, subject: 'Draft subject', body: 'Draft body' },
      includeCsrf: false,
      expectedStatuses: [403, 419]
    });

    const created = await request(baseUrl, adminAJar, 'POST', '/api/admin/email/drafts', {
      json: { toEmail: `student.${runId}@example.com`, subject: 'Draft subject', body: 'Draft body', signature: 'School signature' },
      expectedStatus: 201
    });
    const draftId = created.draft.id;
    assert.ok(draftId, 'create should return draft id');

    const list = await request(baseUrl, adminAJar, 'GET', '/api/admin/email/drafts');
    assert.ok(list.drafts.some((draft) => draft.id === draftId), 'draft should appear in Drafts');
    assert.ok(list.drafts.every((draft) => draft.workspace_id === ids.workspaceA), 'draft list must be workspace scoped');
    assert.ok(!JSON.stringify(list).includes('smtp-secret-must-not-leak'), 'draft list must not expose SMTP secrets');

    const loaded = await request(baseUrl, adminAJar, 'GET', `/api/admin/email/drafts/${draftId}`);
    assert.strictEqual(loaded.draft.subject, 'Draft subject');
    assert.strictEqual(loaded.draft.body, 'Draft body');
    assert.deepStrictEqual(loaded.draft.toEmail, [`student.${runId}@example.com`]);

    await request(baseUrl, adminAJar, 'PATCH', `/api/admin/email/drafts/${draftId}`, {
      json: { toEmail: `student.${runId}@example.com`, subject: 'Updated subject', body: 'Updated body' },
      includeCsrf: false,
      expectedStatuses: [403, 419]
    });
    const updated = await request(baseUrl, adminAJar, 'PATCH', `/api/admin/email/drafts/${draftId}`, {
      json: { toEmail: `student.${runId}@example.com`, subject: 'Updated subject', body: 'Updated body' }
    });
    assert.strictEqual(updated.draft.body, 'Updated body', 'PATCH should persist body changes');

    await request(baseUrl, teacherAJar, 'GET', '/api/admin/email/drafts', { expectedStatus: 403 });
    await request(baseUrl, adminAJar, 'GET', `/api/admin/email/drafts/foreign_draft_${runId}`, { expectedStatus: 404 });

    const disposable = await request(baseUrl, adminAJar, 'POST', '/api/admin/email/drafts', {
      json: { subject: 'Delete me', body: 'Temporary draft' },
      expectedStatus: 201
    });
    await request(baseUrl, adminAJar, 'DELETE', `/api/admin/email/drafts/${disposable.draft.id}`, {
      includeCsrf: false,
      expectedStatuses: [403, 419]
    });
    await request(baseUrl, adminAJar, 'DELETE', `/api/admin/email/drafts/${disposable.draft.id}`);
    const afterDelete = await request(baseUrl, adminAJar, 'GET', '/api/admin/email/drafts');
    assert.ok(!afterDelete.drafts.some((draft) => draft.id === disposable.draft.id), 'deleted draft should leave Drafts');

    const sendDraft = await request(baseUrl, adminAJar, 'POST', '/api/admin/email/drafts', {
      json: { toEmail: `sent.${runId}@example.com`, subject: 'Send draft', body: 'Send this draft' },
      expectedStatus: 201
    });
    await request(baseUrl, adminAJar, 'POST', `/api/admin/email/drafts/${sendDraft.draft.id}/send`, {
      includeCsrf: false,
      expectedStatuses: [403, 419]
    });
    const sent = await request(baseUrl, adminAJar, 'POST', `/api/admin/email/drafts/${sendDraft.draft.id}/send`, {
      json: { toEmail: `sent.${runId}@example.com`, subject: 'Send draft', body: 'Send this draft' }
    });
    assert.strictEqual(sent.sent, true, 'send endpoint should report sent');
    const afterSend = await request(baseUrl, adminAJar, 'GET', '/api/admin/email/drafts');
    assert.ok(!afterSend.drafts.some((draft) => draft.id === sendDraft.draft.id), 'sent draft should leave Drafts');

    const db = new Database(sqlitePath);
    try {
      const row = db.prepare('SELECT status, sent_at FROM email_drafts WHERE id = ?').get(sendDraft.draft.id);
      assert.strictEqual(row.status, 'sent');
      assert.ok(row.sent_at, 'sent draft should have sent_at');
      const log = db.prepare('SELECT status, to_email, subject FROM workspace_email_logs WHERE workspace_id = ? AND subject = ?').get(ids.workspaceA, 'Send draft');
      assert.ok(log, 'sent draft should create sent email log');
      assert.strictEqual(log.status, 'sent');
    } finally {
      db.close();
    }

    console.log('[email-drafts-smoke] passed');
  } finally {
    await stopServer(child);
  }
}

main().catch((error) => {
  console.error('[email-drafts-smoke] failed:', error?.stack || error?.message || error);
  process.exit(1);
});
