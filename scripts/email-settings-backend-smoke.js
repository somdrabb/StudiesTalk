#!/usr/bin/env node
'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const Database = require('better-sqlite3');

const runId = `email_settings_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
const sqlitePath = path.join(os.tmpdir(), `${runId}.sqlite`);
const uploadsDir = path.join(os.tmpdir(), `${runId}_uploads`);
const backupDir = path.join(os.tmpdir(), `${runId}_backup`);
const basePort = 4920 + Math.floor(Math.random() * 70);

const ids = {
  workspaceId: `ws_${runId}`,
  foreignWorkspaceId: `ws_foreign_${runId}`,
  schoolAdminId: `school_${runId}`,
  teacherId: `teacher_${runId}`,
  studentId: `student_${runId}`
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
      `${method} ${route} => expected one of ${expectedStatuses.join(', ')}, got ${response.status}: ${JSON.stringify(data)}`
    );
  } else {
    assert.strictEqual(
      response.status,
      expectedStatus,
      `${method} ${route} => expected ${expectedStatus}, got ${response.status}: ${JSON.stringify(data)}`
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
    `).run(ids.workspaceId, 'Email Settings Smoke School', `admin.${runId}@example.com`);
    db.prepare(`
      INSERT OR REPLACE INTO workspaces (id, name, status, admin_email, created_at)
      VALUES (?, ?, 'approved', ?, datetime('now'))
    `).run(ids.foreignWorkspaceId, 'Foreign School', `foreign.${runId}@example.com`);

    const insertUser = db.prepare(`
      INSERT OR REPLACE INTO users
      (id, workspace_id, first_name, last_name, name, email, username, password_hash, role, status, native_language, native_language_confirmed, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 'en', 1, datetime('now'))
    `);
    insertUser.run(ids.schoolAdminId, ids.workspaceId, 'School', 'Admin', 'School Admin', `admin.${runId}@example.com`, `admin_${runId}`, passwordHash, 'school_admin');
    insertUser.run(ids.teacherId, ids.workspaceId, 'Teacher', 'User', 'Teacher User', `teacher.${runId}@example.com`, `teacher_${runId}`, passwordHash, 'teacher');
    insertUser.run(ids.studentId, ids.workspaceId, 'Student', 'User', 'Student User', `student.${runId}@example.com`, `student_${runId}`, passwordHash, 'student');

    db.prepare(`
      INSERT INTO platform_settings (key, value, updated_at)
      VALUES ('workspace_policy_version_default', '2026-04-23', datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run();
    const acceptPolicy = db.prepare(`
      INSERT INTO policy_acceptances (id, workspace_id, user_id, version, accepted_at)
      VALUES (?, ?, ?, '2026-04-23', datetime('now'))
    `);
    [ids.schoolAdminId, ids.teacherId, ids.studentId].forEach((userId) => {
      acceptPolicy.run(`pa_${userId}`, ids.workspaceId, userId);
    });
    db.prepare(`
      INSERT INTO workspace_onboarding (id, workspace_id, status, current_step, completed_at, created_at, updated_at, completed_by_user_id)
      VALUES (?, ?, 'completed', 'launch_checklist', datetime('now'), datetime('now'), datetime('now'), ?)
    `).run(`ob_${ids.workspaceId}`, ids.workspaceId, ids.schoolAdminId);
  } finally {
    db.close();
  }
}

async function login(baseUrl, email) {
  const jar = {};
  const data = await request(baseUrl, jar, 'POST', '/api/auth/login', {
    json: { email, password: 'Secret123!' },
    expectedStatus: 200
  });
  assert.ok(data?.accessToken || jar.refresh_token, 'login should establish a session');
  assert.ok(jar.csrf_token, 'login should set csrf_token cookie');
  return jar;
}

async function main() {
  await bootstrapSchema();
  seedData();

  const child = startServer();
  const baseUrl = `http://127.0.0.1:${basePort}`;
  await waitForServer(baseUrl);

  try {
    const adminJar = await login(baseUrl, `admin.${runId}@example.com`);
    const teacherJar = await login(baseUrl, `teacher.${runId}@example.com`);
    const studentJar = await login(baseUrl, `student.${runId}@example.com`);

    const initial = await request(baseUrl, adminJar, 'GET', '/api/workspace/email-settings');
    assert.strictEqual(initial.workspace_id, ids.workspaceId, 'GET should return the admin workspace');
    assert.ok(!JSON.stringify(initial).includes('smtp-secret-must-not-leak'), 'GET must not return SMTP secrets');

    const payload = {
      workspaceId: ids.foreignWorkspaceId,
      from_name: 'Smoke Sender',
      reply_to_email: 'reply@example.com',
      support_email: 'support@example.com',
      live_session_notifications_enabled: 1,
      registration_emails_enabled: 0,
      password_reset_emails_enabled: 1,
      invoice_payment_emails_enabled: 0,
      exam_course_reminder_emails_enabled: 1,
      signature: 'Kind regards,\nSmoke School'
    };

    await request(baseUrl, adminJar, 'PATCH', '/api/workspace/email-settings', {
      json: payload,
      includeCsrf: false,
      expectedStatuses: [403, 419]
    });

    await request(baseUrl, teacherJar, 'PATCH', '/api/workspace/email-settings', {
      json: payload,
      expectedStatus: 403
    });
    await request(baseUrl, studentJar, 'PATCH', '/api/workspace/email-settings', {
      json: payload,
      expectedStatus: 403
    });

    const saved = await request(baseUrl, adminJar, 'PATCH', '/api/workspace/email-settings', { json: payload });
    assert.strictEqual(saved.ok, true, 'school_admin PATCH should save');
    assert.strictEqual(saved.settings.workspace_id, ids.workspaceId, 'body workspaceId must be ignored');
    assert.ok(!JSON.stringify(saved).includes('smtp-secret-must-not-leak'), 'PATCH must not return SMTP secrets');

    const loaded = await request(baseUrl, adminJar, 'GET', '/api/workspace/email-settings');
    assert.strictEqual(loaded.from_name, 'Smoke Sender', 'from name should persist');
    assert.strictEqual(loaded.reply_to_email, 'reply@example.com', 'reply-to should persist');
    assert.strictEqual(loaded.support_email, 'support@example.com', 'support email should persist');
    assert.strictEqual(loaded.signature, 'Kind regards,\nSmoke School', 'signature should persist');
    assert.strictEqual(loaded.live_session_notifications_enabled, 1, 'live toggle should persist');
    assert.strictEqual(loaded.registration_emails_enabled, 0, 'registration toggle should persist');
    assert.strictEqual(loaded.password_reset_emails_enabled, 1, 'password toggle should persist');
    assert.strictEqual(loaded.invoice_payment_emails_enabled, 0, 'invoice toggle should persist');
    assert.strictEqual(loaded.exam_course_reminder_emails_enabled, 1, 'exam/course toggle should persist');

    const db = new Database(sqlitePath);
    try {
      const foreign = db.prepare('SELECT COUNT(*) AS count FROM workspace_email_settings WHERE workspace_id = ?').get(ids.foreignWorkspaceId);
      assert.strictEqual(foreign.count, 0, 'foreign workspaceId in body must not create/update foreign settings');
    } finally {
      db.close();
    }

    console.log('[email-settings-backend-smoke] passed');
  } finally {
    await stopServer(child);
  }
}

main().catch((error) => {
  console.error('[email-settings-backend-smoke] failed:', error?.stack || error?.message || error);
  process.exit(1);
});
