#!/usr/bin/env node
'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const Database = require('better-sqlite3');

const runId = `admin_route_iso_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
const port = 4840 + Math.floor(Math.random() * 100);
const sqlitePath = path.join(os.tmpdir(), `${runId}.sqlite`);
const uploadsDir = path.join(os.tmpdir(), `${runId}_uploads`);
const baseUrl = `http://127.0.0.1:${port}`;

const ids = {
  workspaceA: `ws_a_${runId}`,
  workspaceB: `ws_b_${runId}`,
  superAdmin: `super_${runId}`,
  schoolAdmin: `school_admin_${runId}`,
  teacher: `teacher_${runId}`,
  student: `student_${runId}`
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  await sleep(500);
}

async function waitForServer() {
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

function parseSetCookie(jar, response) {
  const setCookie = response.headers.getSetCookie ? response.headers.getSetCookie() : [];
  for (const header of setCookie) {
    const first = String(header || '').split(';')[0];
    const eq = first.indexOf('=');
    if (eq > 0) jar[first.slice(0, eq).trim()] = first.slice(eq + 1).trim();
  }
}

function cookieHeader(jar) {
  return Object.entries(jar)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${key}=${value}`)
    .join('; ');
}

async function api(jar, method, route, { json, expectedStatus = 200, expectedStatuses = null, csrf = true } = {}) {
  const headers = {};
  if (cookieHeader(jar)) headers.Cookie = cookieHeader(jar);
  if (json !== undefined) headers['Content-Type'] = 'application/json';
  if (csrf && !route.startsWith('/api/auth/') && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && jar.csrf_token) {
    headers['X-CSRF-Token'] = jar.csrf_token;
  }
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers,
    body: json !== undefined ? JSON.stringify(json) : undefined
  });
  parseSetCookie(jar, response);
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch (_err) {
    payload = { raw: text };
  }
  if (Array.isArray(expectedStatuses)) {
    assert.ok(expectedStatuses.includes(response.status), `${method} ${route} got ${response.status}: ${JSON.stringify(payload)}`);
  } else {
    assert.strictEqual(response.status, expectedStatus, `${method} ${route} got ${response.status}: ${JSON.stringify(payload)}`);
  }
  return payload;
}

function startServer() {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: 'development',
      HOST: '127.0.0.1',
      PORT: String(port),
      DB_ENGINE: 'sqlite',
      DB_PATH: sqlitePath,
      UPLOADS_DIR: uploadsDir,
      EMAIL_PROVIDER: 'disabled',
      BILLING_DB_ENGINE: 'sqlite',
      TASKS_DB_ENGINE: 'sqlite',
      ATTENDANCE_DB_ENGINE: 'sqlite',
      CHANNELS_DB_ENGINE: 'sqlite',
      MESSAGES_DB_ENGINE: 'sqlite'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.stdout.on('data', (chunk) => process.stdout.write(chunk));
  child.stderr.on('data', (chunk) => process.stderr.write(chunk));
  return child;
}

function seedSqlite() {
  const db = new Database(sqlitePath);
  db.pragma('foreign_keys = ON');
  const passwordHash = hashPassword('Secret123!');
  const insertWorkspace = db.prepare('INSERT INTO workspaces (id, name, status, admin_email, created_at) VALUES (?, ?, ?, ?, datetime(\'now\'))');
  insertWorkspace.run(ids.workspaceA, 'Admin Route A', 'approved', `admin.a.${runId}@example.com`);
  insertWorkspace.run(ids.workspaceB, 'Admin Route B', 'approved', `admin.b.${runId}@example.com`);
  const insertUser = db.prepare(`
    INSERT INTO users
      (id, workspace_id, first_name, last_name, name, email, username, password_hash, role, status, native_language, native_language_confirmed, created_at)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 'en', 1, datetime('now'))
  `);
  insertUser.run(ids.superAdmin, ids.workspaceA, 'Super', 'Admin', 'Super Admin', `super.${runId}@example.com`, `super_${runId}`, passwordHash, 'super_admin');
  insertUser.run(ids.schoolAdmin, ids.workspaceA, 'School', 'Admin', 'School Admin', `school.admin.${runId}@example.com`, `school_admin_${runId}`, passwordHash, 'school_admin');
  insertUser.run(ids.teacher, ids.workspaceA, 'Teacher', 'User', 'Teacher User', `teacher.${runId}@example.com`, `teacher_${runId}`, passwordHash, 'teacher');
  insertUser.run(ids.student, ids.workspaceA, 'Student', 'User', 'Student User', `student.${runId}@example.com`, `student_${runId}`, passwordHash, 'student');
  db.close();
}

async function login(email) {
  const jar = {};
  await api(jar, 'GET', '/api/auth/csrf');
  const payload = await api(jar, 'POST', '/api/auth/login', {
    json: { email, password: 'Secret123!' },
    expectedStatuses: [200, 202]
  });
  return { jar, payload };
}

async function loginSuperAdminWithMfa() {
  const { jar, payload } = await login(`super.${runId}@example.com`);
  assert.strictEqual(payload?.mfaRequired, true, 'super_admin should require MFA before owner routes');
  const setup = await api(jar, 'POST', '/api/auth/mfa/setup/start', {
    json: { mfaToken: payload.mfaToken }
  });
  await api(jar, 'POST', '/api/auth/mfa/verify', {
    json: { mfaToken: payload.mfaToken, code: generateTotpCode(setup.secret) }
  });
  return jar;
}

async function main() {
  fs.rmSync(uploadsDir, { recursive: true, force: true });
  if (fs.existsSync(sqlitePath)) fs.unlinkSync(sqlitePath);
  let child = startServer();
  try {
    await waitForServer();
    await stopServer(child);
    seedSqlite();
    child = startServer();
    await waitForServer();

    const { jar: schoolAdminJar } = await login(`school.admin.${runId}@example.com`);
    const { jar: teacherJar } = await login(`teacher.${runId}@example.com`);
    const { jar: studentJar } = await login(`student.${runId}@example.com`);
    const superJar = await loginSuperAdminWithMfa();

    await api(schoolAdminJar, 'GET', '/api/admin/operations/health', { expectedStatus: 403 });
    await api(schoolAdminJar, 'GET', `/api/admin/billing/${encodeURIComponent(ids.workspaceB)}`, { expectedStatus: 403 });
    await api(teacherJar, 'GET', '/api/admin/users', { expectedStatus: 403 });
    await api(studentJar, 'GET', '/api/admin/users', { expectedStatus: 403 });

    await api(superJar, 'PATCH', `/api/admin/platform-control/workspaces/${encodeURIComponent(ids.workspaceB)}`, {
      json: { settings: { features: { adminRouteIsolationSmoke: true } } },
      csrf: false,
      expectedStatus: 403
    });

    await api(superJar, 'PATCH', `/api/admin/platform-control/workspaces/${encodeURIComponent(ids.workspaceB)}`, {
      json: { settings: { features: { adminRouteIsolationSmoke: true } } }
    });

    await sleep(400);
    const db = new Database(sqlitePath, { readonly: true });
    try {
      const auditRow = db.prepare(`
        SELECT id, action, workspace_id AS workspaceId, user_id AS userId
        FROM audit_logs
        WHERE action = 'platform_control.workspace.update'
          AND workspace_id = ?
          AND user_id = ?
        ORDER BY at DESC
        LIMIT 1
      `).get(ids.workspaceB, ids.superAdmin);
      assert.ok(auditRow, 'super_admin cross-workspace platform control update should create an audit log');
    } finally {
      db.close();
    }

    console.log('[admin-route-isolation-smoke] passed');
  } finally {
    await stopServer(child);
    try { fs.unlinkSync(sqlitePath); } catch (_err) {}
    fs.rmSync(uploadsDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error('[admin-route-isolation-smoke] failed:', err && err.stack ? err.stack : err);
  process.exit(1);
});
