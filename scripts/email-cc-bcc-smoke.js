#!/usr/bin/env node
'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const Database = require('better-sqlite3');

const runId = `email_cc_bcc_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
const sqlitePath = path.join(os.tmpdir(), `${runId}.sqlite`);
const uploadsDir = path.join(os.tmpdir(), `${runId}_uploads`);
const backupDir = path.join(os.tmpdir(), `${runId}_backup`);
const basePort = 5720 + Math.floor(Math.random() * 80);

const ids = {
  workspaceA: `ws_a_${runId}`,
  workspaceB: `ws_b_${runId}`,
  adminA: `admin_a_${runId}`,
  teacherA: `teacher_a_${runId}`,
  studentA: `student_a_${runId}`,
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
    insertWorkspace.run(ids.workspaceA, 'CC BCC Smoke A', `admin.a.${runId}@example.com`);
    insertWorkspace.run(ids.workspaceB, 'CC BCC Smoke B', `admin.b.${runId}@example.com`);

    const insertUser = db.prepare(`
      INSERT OR REPLACE INTO users
      (id, workspace_id, first_name, last_name, name, email, username, password_hash, role, status, native_language, native_language_confirmed, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 'en', 1, datetime('now'))
    `);
    insertUser.run(ids.adminA, ids.workspaceA, 'Admin', 'A', 'Admin A', `admin.a.${runId}@example.com`, `admin_a_${runId}`, passwordHash, 'school_admin');
    insertUser.run(ids.teacherA, ids.workspaceA, 'Teacher', 'A', 'Teacher A', `teacher.a.${runId}@example.com`, `teacher_a_${runId}`, passwordHash, 'teacher');
    insertUser.run(ids.studentA, ids.workspaceA, 'Student', 'A', 'Student A', `student.a.${runId}@example.com`, `student_a_${runId}`, passwordHash, 'student');
    insertUser.run(ids.adminB, ids.workspaceB, 'Admin', 'B', 'Admin B', `admin.b.${runId}@example.com`, `admin_b_${runId}`, passwordHash, 'school_admin');

    db.prepare(`
      INSERT INTO platform_settings (key, value, updated_at)
      VALUES ('workspace_policy_version_default', '2026-04-23', datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run();
    const acceptPolicy = db.prepare(`
      INSERT INTO policy_acceptances (id, workspace_id, user_id, version, accepted_at)
      VALUES (?, ?, ?, '2026-04-23', datetime('now'))
    `);
    [ids.adminA, ids.teacherA, ids.studentA, ids.adminB].forEach((userId) => {
      const workspaceId = userId === ids.adminB ? ids.workspaceB : ids.workspaceA;
      acceptPolicy.run(`pa_${userId}`, workspaceId, userId);
    });
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
    const teacherAJar = await login(baseUrl, `teacher.a.${runId}@example.com`);
    const studentAJar = await login(baseUrl, `student.a.${runId}@example.com`);

    const toA = `to.a.${runId}@example.com`;
    const toB = `to.b.${runId}@example.com`;
    const ccA = `cc.a.${runId}@example.com`;
    const bccA = `bcc.a.${runId}@example.com`;

    await request(baseUrl, adminAJar, 'POST', `/api/workspaces/${encodeURIComponent(ids.workspaceA)}/email-settings/test`, {
      json: {
        toEmail: [toA, toB],
        cc: [ccA],
        bcc: [bccA],
        subject: 'CC BCC send',
        bodyText: 'CC BCC body'
      }
    });

    await request(baseUrl, adminAJar, 'POST', `/api/workspaces/${encodeURIComponent(ids.workspaceA)}/email-settings/test`, {
      json: { toEmail: toA, cc: 'bad-cc', subject: 'Invalid cc', bodyText: 'Body' },
      expectedStatus: 400
    });
    await request(baseUrl, adminAJar, 'POST', `/api/workspaces/${encodeURIComponent(ids.workspaceA)}/email-settings/test`, {
      json: { toEmail: toA, bcc: 'bad-bcc', subject: 'Invalid bcc', bodyText: 'Body' },
      expectedStatus: 400
    });
    await request(baseUrl, adminAJar, 'POST', `/api/workspaces/${encodeURIComponent(ids.workspaceA)}/email-settings/test`, {
      json: {
        toEmail: Array.from({ length: 51 }, (_, index) => `limit.${index}.${runId}@example.com`),
        subject: 'Limit',
        bodyText: 'Body'
      },
      expectedStatus: 400
    });
    await request(baseUrl, adminAJar, 'POST', `/api/workspaces/${encodeURIComponent(ids.workspaceB)}/email-settings/test`, {
      json: { toEmail: toA, subject: 'Foreign workspace', bodyText: 'Body', workspaceId: ids.workspaceA },
      expectedStatus: 403
    });
    await request(baseUrl, teacherAJar, 'POST', `/api/workspaces/${encodeURIComponent(ids.workspaceA)}/email-settings/test`, {
      json: { toEmail: toA, subject: 'Teacher blocked', bodyText: 'Body' },
      expectedStatus: 403
    });
    await request(baseUrl, studentAJar, 'POST', `/api/workspaces/${encodeURIComponent(ids.workspaceA)}/email-settings/test`, {
      json: { toEmail: toA, subject: 'Student blocked', bodyText: 'Body' },
      expectedStatus: 403
    });

    const draft = await request(baseUrl, adminAJar, 'POST', '/api/admin/email/drafts', {
      json: {
        toEmail: `${toA}, ${toB}`,
        cc: [ccA],
        bcc: [bccA],
        subject: 'CC BCC draft',
        body: 'Draft body'
      },
      expectedStatus: 201
    });
    assert.deepStrictEqual(draft.draft.cc, [ccA], 'draft create should return cc array');
    assert.deepStrictEqual(draft.draft.bcc, [bccA], 'draft create should return bcc array');

    const loadedDraft = await request(baseUrl, adminAJar, 'GET', `/api/admin/email/drafts/${draft.draft.id}`);
    assert.deepStrictEqual(loadedDraft.draft.toEmail, [toA, toB], 'draft restore should return To array');
    assert.deepStrictEqual(loadedDraft.draft.cc, [ccA], 'draft restore should return Cc array');
    assert.deepStrictEqual(loadedDraft.draft.bcc, [bccA], 'draft restore should return Bcc array');
    assert.ok(!JSON.stringify(loadedDraft).includes('smtp-secret-must-not-leak'), 'draft response must not expose SMTP secrets');

    await request(baseUrl, adminAJar, 'POST', `/api/admin/email/drafts/${draft.draft.id}/send`, {
      json: {
        toEmail: [toA, toB],
        cc: [ccA],
        bcc: [bccA],
        subject: 'CC BCC draft',
        body: 'Draft body'
      }
    });

    const db = new Database(sqlitePath);
    try {
      const sentLog = db.prepare('SELECT to_email, cc, bcc FROM workspace_email_logs WHERE workspace_id = ? AND subject = ?').get(ids.workspaceA, 'CC BCC send');
      assert.ok(sentLog, 'send should create sent log');
      assert.strictEqual(sentLog.to_email, `${toA}, ${toB}`);
      assert.strictEqual(sentLog.cc, ccA);
      assert.strictEqual(sentLog.bcc, bccA);

      const draftLog = db.prepare('SELECT to_email, cc, bcc FROM workspace_email_logs WHERE workspace_id = ? AND subject = ?').get(ids.workspaceA, 'CC BCC draft');
      assert.ok(draftLog, 'draft send should create sent log');
      assert.strictEqual(draftLog.cc, ccA);
      assert.strictEqual(draftLog.bcc, bccA);
    } finally {
      db.close();
    }

    console.log('[email-cc-bcc-smoke] passed');
  } finally {
    await stopServer(child);
  }
}

main().catch((error) => {
  console.error('[email-cc-bcc-smoke] failed:', error?.stack || error?.message || error);
  process.exit(1);
});
