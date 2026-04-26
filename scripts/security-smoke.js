#!/usr/bin/env node
'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const Database = require('better-sqlite3');

const runId = `security_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
const port = 4300 + Math.floor(Math.random() * 100);
const sqlitePath = path.join(os.tmpdir(), `${runId}.sqlite`);
const uploadsDir = path.join(os.tmpdir(), `${runId}_uploads`);
const baseUrl = `http://127.0.0.1:${port}`;

const ids = {
  workspaceId: `ws_${runId}`,
  onboardingWorkspaceId: `ws_onboarding_${runId}`,
  adminId: `admin_${runId}`,
  onboardingAdminId: `admin_onboarding_${runId}`,
  superAdminId: `super_${runId}`,
  teacherId: `teacher_${runId}`,
  studentId: `student_${runId}`,
  classChannelId: `class_${runId}`
};

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

function safeAlterSqlite(db, sql) {
  try {
    db.exec(sql);
  } catch (_err) {}
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(url) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 30000) {
    try {
      const res = await fetch(`${url}/`);
      if (res.status >= 200 || res.status === 404) return;
    } catch (_err) {}
    await sleep(300);
  }
  throw new Error('Server did not become ready in time');
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  await sleep(500);
}

function parseSetCookie(jar, response) {
  const setCookie = response.headers.getSetCookie ? response.headers.getSetCookie() : [];
  for (const header of setCookie) {
    const first = String(header || '').split(';')[0];
    const eq = first.indexOf('=');
    if (eq <= 0) continue;
    const name = first.slice(0, eq).trim();
    const value = first.slice(eq + 1).trim();
    jar[name] = value;
  }
}

function cookieHeader(jar) {
  return Object.entries(jar)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${key}=${value}`)
    .join('; ');
}

async function request(jar, method, route, {
  json,
  body,
  expectedStatus = 200,
  expectedStatuses = null,
  extraHeaders,
  parseJson = true
} = {}) {
  const headers = { ...(extraHeaders || {}) };
  if (cookieHeader(jar)) headers.Cookie = cookieHeader(jar);
  if (json !== undefined) headers['Content-Type'] = 'application/json';

  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers,
    body: json !== undefined ? JSON.stringify(json) : body
  });

  parseSetCookie(jar, response);

  const text = await response.text();
  let data = null;
  if (parseJson) {
    try {
      data = text ? JSON.parse(text) : null;
    } catch (_err) {
      data = { raw: text };
    }
  } else {
    data = text;
  }

  if (Array.isArray(expectedStatuses) && expectedStatuses.length) {
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

async function api(jar, method, route, options = {}) {
  const { data } = await request(jar, method, route, options);
  return data;
}

function seedSqlite(dbPath, passwordHash) {
  const db = new Database(dbPath);
  db.pragma('foreign_keys = ON');

  safeAlterSqlite(db, `ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0;`);
  safeAlterSqlite(db, `ALTER TABLE users ADD COLUMN temp_login_started_at INTEGER;`);
  safeAlterSqlite(db, `ALTER TABLE users ADD COLUMN native_language TEXT NOT NULL DEFAULT 'en';`);
  safeAlterSqlite(db, `ALTER TABLE users ADD COLUMN native_language_confirmed INTEGER NOT NULL DEFAULT 0;`);
  safeAlterSqlite(db, `ALTER TABLE users ADD COLUMN avatar_url TEXT;`);
  safeAlterSqlite(db, `ALTER TABLE users ADD COLUMN course_start TEXT;`);
  safeAlterSqlite(db, `ALTER TABLE users ADD COLUMN course_end TEXT;`);

  db.prepare(`
    INSERT INTO workspaces (id, name, status, admin_email, created_at)
    VALUES (?, ?, 'approved', ?, datetime('now'))
  `).run(ids.workspaceId, 'Security Smoke School', `admin.${runId}@example.com`);
  db.prepare(`
    INSERT INTO workspaces (id, name, status, admin_email, created_at)
    VALUES (?, ?, 'approved', ?, datetime('now'))
  `).run(ids.onboardingWorkspaceId, 'Onboarding Smoke School', `admin.onboarding.${runId}@example.com`);

  const insertUser = db.prepare(`
    INSERT INTO users
    (id, workspace_id, first_name, last_name, name, email, username, password_hash, role, status, native_language, native_language_confirmed, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 'en', 1, datetime('now'))
  `);

  insertUser.run(
    ids.adminId,
    ids.workspaceId,
    'Security',
    'Admin',
    'Security Admin',
    `admin.${runId}@example.com`,
    `admin_${runId}`,
    passwordHash,
    'school_admin'
  );
  insertUser.run(
    ids.onboardingAdminId,
    ids.onboardingWorkspaceId,
    'Onboarding',
    'Admin',
    'Onboarding Admin',
    `admin.onboarding.${runId}@example.com`,
    `admin_onboarding_${runId}`,
    passwordHash,
    'school_admin'
  );
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
    ids.teacherId,
    ids.workspaceId,
    'Teacher',
    'User',
    'Teacher User',
    `teacher.${runId}@example.com`,
    `teacher_${runId}`,
    passwordHash,
    'teacher'
  );
  insertUser.run(
    ids.studentId,
    ids.workspaceId,
    'Student',
    'User',
    'Student User',
    `student.${runId}@example.com`,
    `student_${runId}`,
    passwordHash,
    'student'
  );

  db.prepare(`
    INSERT INTO channels (id, workspace_id, name, topic, members, unread, category, created_at)
    VALUES (?, ?, 'A1 Morning', 'Smoke channel', 3, 0, 'classes', datetime('now'))
  `).run(ids.classChannelId, ids.workspaceId);

  const addMember = db.prepare('INSERT INTO channel_members (channel_id, user_id) VALUES (?, ?)');
  addMember.run(ids.classChannelId, ids.adminId);
  addMember.run(ids.classChannelId, ids.teacherId);
  addMember.run(ids.classChannelId, ids.studentId);

  db.prepare(`
    INSERT INTO platform_settings (key, value, updated_at)
    VALUES ('workspace_policy_version_default', '2026-04-24', datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run();

  db.prepare(`
    INSERT INTO workspace_onboarding (id, workspace_id, status, current_step, completed_at, created_at, updated_at, completed_by_user_id)
    VALUES (?, ?, 'completed', 'launch_checklist', datetime('now'), datetime('now'), datetime('now'), ?)
    ON CONFLICT(workspace_id) DO UPDATE SET
      status = 'completed',
      current_step = 'launch_checklist',
      completed_at = datetime('now'),
      updated_at = datetime('now'),
      completed_by_user_id = excluded.completed_by_user_id
  `).run(`ob_${crypto.randomUUID()}`, ids.workspaceId, ids.adminId);

  db.close();
}

function startServer() {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: 'development',
      PORT: String(port),
      DB_ENGINE: 'sqlite',
      DB_PATH: sqlitePath,
      BILLING_DB_ENGINE: 'sqlite',
      TASKS_DB_ENGINE: 'sqlite',
      ATTENDANCE_DB_ENGINE: 'sqlite',
      CHANNELS_DB_ENGINE: 'sqlite',
      MESSAGES_DB_ENGINE: 'sqlite',
      EMAIL_PROVIDER: 'disabled',
      EMAIL_FROM_EMAIL: 'no-reply@example.com',
      UPLOADS_DIR: uploadsDir
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  child.stdout.on('data', (chunk) => process.stdout.write(chunk));
  child.stderr.on('data', (chunk) => process.stderr.write(chunk));
  return child;
}

function getDb() {
  return new Database(sqlitePath, { readonly: true });
}

function countSecurityEvent(type) {
  const db = getDb();
  const row = db.prepare(`SELECT COUNT(*) AS n FROM security_events WHERE type = ?`).get(type);
  db.close();
  return Number(row?.n || 0);
}

async function login(email, password = 'AdminPass1!') {
  const jar = {};
  const payload = await api(jar, 'POST', '/api/auth/login', {
    json: { email, password }
  });
  assert.ok(payload?.accessToken, `Expected access token for ${email}`);
  return { jar, payload };
}

async function fetchCsrf(jar) {
  const payload = await api(jar, 'GET', '/api/auth/csrf');
  assert.ok(payload?.csrfToken, 'expected csrf token payload');
  assert.ok(jar.csrf_token, 'expected csrf cookie to be set');
  return payload.csrfToken;
}

async function main() {
  if (fs.existsSync(sqlitePath)) fs.unlinkSync(sqlitePath);
  fs.rmSync(uploadsDir, { recursive: true, force: true });

  const passwordHash = hashPassword('AdminPass1!');
  let child = startServer();

  try {
    await waitForServer(baseUrl);
    await stopServer(child);

    seedSqlite(sqlitePath, passwordHash);

    child = startServer();
    await waitForServer(baseUrl);

    const { jar: onboardingJar } = await login(`admin.onboarding.${runId}@example.com`);
    await api(onboardingJar, 'GET', '/api/dms', { expectedStatus: 403 }).then((payload) => {
      assert.strictEqual(payload.code, 'onboarding_required');
    });

    const { jar: adminJar } = await login(`admin.${runId}@example.com`);
    const csrfToken = await fetchCsrf(adminJar);
    await api(adminJar, 'GET', '/api/dms', { expectedStatus: 403 }).then((payload) => {
      assert.strictEqual(payload.code, 'policy_acceptance_required');
    });

    await api(adminJar, 'POST', `/api/workspaces/${ids.workspaceId}/policy/accept`, {
      json: { version: '2026-04-24' },
      expectedStatus: 403
    }).then((payload) => {
      assert.strictEqual(payload.error, 'CSRF blocked');
    });

    await api(adminJar, 'POST', `/api/workspaces/${ids.workspaceId}/policy/accept`, {
      json: { version: '2026-04-24' },
      expectedStatus: 200,
      extraHeaders: { 'x-csrf-token': csrfToken }
    }).then((payload) => {
      assert.strictEqual(payload.ok, true);
    });

    await api(adminJar, 'GET', '/api/dms', { expectedStatus: 200 });

    await api(adminJar, 'POST', '/api/auth/forgot-password', {
      json: { email: `admin.${runId}@example.com` },
      expectedStatus: 200,
      extraHeaders: { 'x-csrf-token': csrfToken }
    }).then((payload) => {
      assert.strictEqual(payload.ok, true);
    });

    const { jar: superJar } = await login(`super.${runId}@example.com`);
    await api(superJar, 'GET', '/api/channels', { expectedStatus: 200 });

    const dangerousBody = new FormData();
    dangerousBody.append('files', new Blob(['<script>alert(1)</script>'], { type: 'text/html' }), 'exploit.html');
    await request(adminJar, 'POST', '/api/uploads', {
      body: dangerousBody,
      expectedStatus: 400,
      extraHeaders: { 'x-csrf-token': csrfToken }
    }).then(({ data }) => {
      assert.strictEqual(data.error, 'Files of type .html are not allowed.');
    });

    let rateLimited = null;
    for (let i = 0; i < 12; i += 1) {
      const payload = await api({}, 'POST', '/api/auth/login', {
        json: { email: `admin.${runId}@example.com`, password: 'WrongPass1!' },
        expectedStatuses: [401, 429]
      });
      if (payload?.code === 'rate_limited') {
        rateLimited = payload;
        break;
      }
    }
    assert.deepStrictEqual(rateLimited, {
      error: 'Too many requests. Please try again later.',
      code: 'rate_limited'
    });

    await api(adminJar, 'POST', '/api/auth/logout', { expectedStatus: 200 }).then((payload) => {
      assert.strictEqual(payload.ok, true);
    });
    await api(adminJar, 'GET', '/api/auth/me', { expectedStatus: 401 });

    assert.ok(countSecurityEvent('security.csrf_rejected') >= 1, 'expected csrf rejection to be logged');
    assert.ok(countSecurityEvent('security.upload_rejected') >= 1, 'expected upload rejection to be logged');
    assert.ok(countSecurityEvent('security.login_rate_limited') >= 1, 'expected login rate limit to be logged');
    assert.ok(countSecurityEvent('security.onboarding_gate_blocked') >= 1, 'expected onboarding block to be logged');
    assert.ok(countSecurityEvent('security.policy_gate_blocked') >= 1, 'expected policy block to be logged');

    const dashboard = await api(superJar, 'GET', '/api/admin/security/dashboard?days=7&limit=100', {
      expectedStatus: 200
    });
    assert.ok(dashboard?.ok, 'expected dashboard payload');
    assert.ok(Number(dashboard?.summary?.csrfRejects || 0) >= 1, 'expected csrf rejects in summary');
    assert.ok(Number(dashboard?.summary?.uploadRejections || 0) >= 1, 'expected upload rejections in summary');
    assert.ok(Number(dashboard?.summary?.rateLimits || 0) >= 1, 'expected rate limits in summary');
    assert.ok(Number(dashboard?.summary?.passwordResetActivity || 0) >= 1, 'expected password reset activity in summary');
    assert.ok(Number(dashboard?.summary?.policyGateBlocks || 0) >= 1, 'expected policy gate blocks in summary');
    assert.ok(Number(dashboard?.summary?.onboardingGateBlocks || 0) >= 1, 'expected onboarding gate blocks in summary');
    assert.ok(Array.isArray(dashboard?.events), 'expected dashboard events array');

    const { data: exportCsv } = await request(superJar, 'GET', '/api/admin/security/events/export.csv?days=7&type=security.csrf_rejected', {
      expectedStatus: 200,
      parseJson: false
    });
    assert.ok(exportCsv.includes('createdAt,type,severity'), 'expected csv header');
    assert.ok(exportCsv.includes('security.csrf_rejected'), 'expected csv data row');

    console.log('[security-smoke] passed');
  } finally {
    await stopServer(child);
    fs.rmSync(uploadsDir, { recursive: true, force: true });
    if (fs.existsSync(sqlitePath)) fs.unlinkSync(sqlitePath);
  }
}

main().catch((err) => {
  console.error('[security-smoke] failed:', err && err.stack ? err.stack : err);
  process.exit(1);
});
