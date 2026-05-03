#!/usr/bin/env node
'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const Database = require('better-sqlite3');

const runId = `analytics_backend_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
const port = 4450 + Math.floor(Math.random() * 100);
const sqlitePath = path.join(os.tmpdir(), `${runId}.sqlite`);
const uploadsDir = path.join(os.tmpdir(), `${runId}_uploads`);
const baseUrl = `http://127.0.0.1:${port}`;

const ids = {
  workspaceA: `ws_a_${runId}`,
  workspaceB: `ws_b_${runId}`,
  adminA: `admin_a_${runId}`,
  teacherA: `teacher_a_${runId}`,
  teacherA2: `teacher_a2_${runId}`,
  studentA: `student_a_${runId}`,
  studentA2: `student_a2_${runId}`,
  adminB: `admin_b_${runId}`,
  teacherB: `teacher_b_${runId}`,
  studentB: `student_b_${runId}`,
  classA: `class_a_${runId}`,
  classA2: `class_a2_${runId}`,
  classB: `class_b_${runId}`,
  homeworkA: `homework_a_${runId}`
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

async function api(jar, method, route, { json, expectedStatus = 200, expectedStatuses = null } = {}) {
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
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch (_err) {
    payload = { raw: text };
  }
  if (Array.isArray(expectedStatuses) && expectedStatuses.length) {
    assert.ok(
      expectedStatuses.includes(response.status),
      `${method} ${route} expected one of ${expectedStatuses.join(', ')}, got ${response.status}: ${JSON.stringify(payload)}`
    );
  } else {
    assert.strictEqual(
      response.status,
      expectedStatus,
      `${method} ${route} expected ${expectedStatus}, got ${response.status}: ${JSON.stringify(payload)}`
    );
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
      BILLING_DB_ENGINE: 'sqlite',
      TASKS_DB_ENGINE: 'sqlite',
      ATTENDANCE_DB_ENGINE: 'sqlite',
      CHANNELS_DB_ENGINE: 'sqlite',
      MESSAGES_DB_ENGINE: 'sqlite',
      EMAIL_PROVIDER: 'disabled',
      EMAIL_FROM_EMAIL: 'no-reply@example.com'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.stdout.on('data', (chunk) => process.stdout.write(chunk));
  child.stderr.on('data', (chunk) => process.stderr.write(chunk));
  return child;
}

function insertUser(db, { id, workspaceId, email, role, name, passwordHash }) {
  db.prepare(`
    INSERT INTO users
      (id, workspace_id, first_name, last_name, name, email, username, password_hash, role, status, native_language, native_language_confirmed, created_at)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 'en', 1, datetime('now'))
  `).run(id, workspaceId, name.split(' ')[0], name.split(' ').slice(1).join(' ') || 'User', name, email, `${role}_${id}`.slice(0, 48), passwordHash, role);
}

function seedSqlite() {
  const db = new Database(sqlitePath);
  db.pragma('foreign_keys = ON');
  const passwordHash = hashPassword('Secret123!');

  db.prepare(`INSERT INTO workspaces (id, name, status, admin_email, created_at) VALUES (?, ?, 'approved', ?, datetime('now'))`)
    .run(ids.workspaceA, 'Analytics School A', `admin.a.${runId}@example.com`);
  db.prepare(`INSERT INTO workspaces (id, name, status, admin_email, created_at) VALUES (?, ?, 'approved', ?, datetime('now'))`)
    .run(ids.workspaceB, 'Analytics School B', `admin.b.${runId}@example.com`);

  [
    { id: ids.adminA, workspaceId: ids.workspaceA, email: `admin.a.${runId}@example.com`, role: 'school_admin', name: 'Admin A' },
    { id: ids.teacherA, workspaceId: ids.workspaceA, email: `teacher.a.${runId}@example.com`, role: 'teacher', name: 'Teacher A' },
    { id: ids.teacherA2, workspaceId: ids.workspaceA, email: `teacher.a2.${runId}@example.com`, role: 'teacher', name: 'Teacher A Two' },
    { id: ids.studentA, workspaceId: ids.workspaceA, email: `student.a.${runId}@example.com`, role: 'student', name: 'Student A' },
    { id: ids.studentA2, workspaceId: ids.workspaceA, email: `student.a2.${runId}@example.com`, role: 'student', name: 'Student A Two' },
    { id: ids.adminB, workspaceId: ids.workspaceB, email: `admin.b.${runId}@example.com`, role: 'school_admin', name: 'Admin B' },
    { id: ids.teacherB, workspaceId: ids.workspaceB, email: `teacher.b.${runId}@example.com`, role: 'teacher', name: 'Teacher B' },
    { id: ids.studentB, workspaceId: ids.workspaceB, email: `student.b.${runId}@example.com`, role: 'student', name: 'Student B' }
  ].forEach((user) => insertUser(db, { ...user, passwordHash }));

  const channelStmt = db.prepare(`INSERT INTO channels (id, workspace_id, name, topic, members, unread, category) VALUES (?, ?, ?, ?, 2, 0, ?)`);
  channelStmt.run(ids.classA, ids.workspaceA, 'Class A', '', 'classes');
  channelStmt.run(ids.classA2, ids.workspaceA, 'Class A2', '', 'classes');
  channelStmt.run(ids.classB, ids.workspaceB, 'Class B', '', 'classes');
  channelStmt.run(ids.homeworkA, ids.workspaceA, 'Homework A', `homework_for:${ids.classA}`, 'homework');

  const memberStmt = db.prepare(`INSERT INTO channel_members (channel_id, user_id) VALUES (?, ?)`);
  [ids.teacherA, ids.studentA, ids.adminA].forEach((userId) => memberStmt.run(ids.classA, userId));
  [ids.teacherA2, ids.studentA2, ids.adminA].forEach((userId) => memberStmt.run(ids.classA2, userId));
  [ids.teacherB, ids.studentB, ids.adminB].forEach((userId) => memberStmt.run(ids.classB, userId));
  [ids.teacherA, ids.studentA].forEach((userId) => memberStmt.run(ids.homeworkA, userId));

  const msgStmt = db.prepare(`
    INSERT INTO messages (id, channel_id, author, initials, avatar_url, time, text, alt, created_at, original_language)
    VALUES (?, ?, ?, ?, NULL, ?, ?, 0, ?, 'en')
  `);
  msgStmt.run(`msg_1_${runId}`, ids.classA, 'Teacher A', 'TA', '10:00', 'Class A active', new Date().toISOString());
  msgStmt.run(`msg_2_${runId}`, ids.homeworkA, 'Teacher A', 'TA', '10:01', 'Homework active', new Date().toISOString());
  msgStmt.run(`msg_3_${runId}`, ids.classB, 'Teacher B', 'TB', '10:02', 'Class B private', new Date().toISOString());

  db.prepare(`
    INSERT INTO homework_items (id, workspace_id, class_channel_id, title, description, due_date, is_archived, created_by, created_at)
    VALUES (?, ?, ?, 'Homework', 'Desc', date('now', '+7 day'), 0, ?, datetime('now'))
  `).run(`hwi_${runId}`, ids.workspaceA, ids.classA, ids.teacherA);

  db.prepare(`
    INSERT INTO invoices (id, workspace_id, student_user_id, amount_cents, currency, description, status, due_date, created_at, paid_at)
    VALUES (?, ?, ?, 12000, 'EUR', 'Paid invoice', 'paid', date('now'), strftime('%s','now') * 1000, strftime('%s','now') * 1000)
  `).run(`inv_paid_${runId}`, ids.workspaceA, ids.studentA);
  db.prepare(`
    INSERT INTO invoices (id, workspace_id, student_user_id, amount_cents, currency, description, status, due_date, created_at)
    VALUES (?, ?, ?, 9000, 'EUR', 'Open invoice', 'open', date('now', '-1 day'), strftime('%s','now') * 1000)
  `).run(`inv_open_${runId}`, ids.workspaceA, ids.studentA2);
  db.prepare(`
    INSERT INTO payments (id, invoice_id, workspace_id, student_user_id, amount_cents, currency, provider, provider_ref, created_at)
    VALUES (?, ?, ?, ?, 12000, 'EUR', 'manual', 'smoke', strftime('%s','now') * 1000)
  `).run(`pay_${runId}`, `inv_paid_${runId}`, ids.workspaceA, ids.studentA);

  db.close();
}

async function login(email) {
  const jar = {};
  await api(jar, 'GET', '/api/auth/csrf');
  const payload = await api(jar, 'POST', '/api/auth/login', {
    json: { email, password: 'Secret123!' },
    expectedStatuses: [200, 202]
  });
  if (!payload?.mfaRequired) return jar;
  const setup = await api(jar, 'POST', '/api/auth/mfa/setup/start', {
    json: { mfaToken: payload.mfaToken }
  });
  await api(jar, 'POST', '/api/auth/mfa/verify', {
    json: { mfaToken: payload.mfaToken, code: generateTotpCode(setup.secret) }
  });
  return jar;
}

async function acceptWorkspacePolicy(jar, workspaceId) {
  const policy = await api(jar, 'GET', `/api/workspaces/${encodeURIComponent(workspaceId)}/policy`);
  const version = String(policy?.document?.version || '').trim();
  if (!version) throw new Error(`Missing policy version for ${workspaceId}`);
  await api(jar, 'POST', `/api/workspaces/${encodeURIComponent(workspaceId)}/policy/accept`, {
    json: { version }
  });
}

function assertSchoolFields(summary) {
  assert.ok(summary.payment && typeof summary.payment.monthlyRevenue === 'number', 'payment monthlyRevenue should exist');
  assert.ok(summary.billing && typeof summary.billing.pendingInvoices === 'number', 'billing pendingInvoices should exist');
  assert.ok(summary.trends && typeof summary.trends.messagesDelta === 'number', 'trends messagesDelta should exist');
  assert.ok(Array.isArray(summary.actionRequired), 'actionRequired should exist');
  assert.ok(summary.classHealth && typeof summary.classHealth.lowActivityClasses === 'number', 'classHealth should exist');
  assert.ok(summary.teacherPerformance && Array.isArray(summary.teacherPerformance.rows), 'teacherPerformance should exist');
  assert.ok(!JSON.stringify(summary).match(/STRIPE_SECRET|SMTP_PASS|TWILIO_AUTH|sk_live_|whsec_/), 'analytics response must not expose secrets');
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

    const adminAJar = await login(`admin.a.${runId}@example.com`);
    const teacherAJar = await login(`teacher.a.${runId}@example.com`);
    const studentAJar = await login(`student.a.${runId}@example.com`);
    await acceptWorkspacePolicy(adminAJar, ids.workspaceA);
    await acceptWorkspacePolicy(teacherAJar, ids.workspaceA);
    await acceptWorkspacePolicy(studentAJar, ids.workspaceA);

    const school = await api(adminAJar, 'GET', `/api/analytics/school-overview?workspaceId=${encodeURIComponent(ids.workspaceA)}&range=7d&tool=all`);
    assertSchoolFields(school.summary);
    assert.strictEqual(school.summary.workspaceId, ids.workspaceA);
    assert.ok(Number(school.summary.payment.monthlyRevenue) >= 120, 'monthly revenue should include paid payment');
    assert.ok(Number(school.summary.billing.pendingInvoices) >= 1, 'pending invoice count should be present');

    const filtered = await api(adminAJar, 'GET', `/api/analytics/school-overview?workspaceId=${encodeURIComponent(ids.workspaceA)}&classId=${encodeURIComponent(ids.classA)}&teacherId=${encodeURIComponent(ids.teacherA)}&tool=messages&range=30d`);
    assertSchoolFields(filtered.summary);

    await api(adminAJar, 'GET', `/api/analytics/school-overview?workspaceId=${encodeURIComponent(ids.workspaceB)}`, { expectedStatus: 403 });
    await api(adminAJar, 'GET', `/api/analytics/school-overview?workspaceId=${encodeURIComponent(ids.workspaceA)}&classId=${encodeURIComponent(ids.classB)}`, { expectedStatus: 403 });
    await api(adminAJar, 'GET', `/api/analytics/school-overview?workspaceId=${encodeURIComponent(ids.workspaceA)}&teacherId=${encodeURIComponent(ids.teacherB)}`, { expectedStatus: 403 });

    const teacher = await api(teacherAJar, 'GET', `/api/analytics/teacher-overview?workspaceId=${encodeURIComponent(ids.workspaceA)}&teacherId=${encodeURIComponent(ids.teacherA)}`);
    assert.strictEqual(teacher.summary.teacher.id, ids.teacherA);
    assert.ok(teacher.summary.classRowsSorted.every((row) => row.id === ids.classA), 'teacher should only see assigned classes');
    await api(teacherAJar, 'GET', `/api/analytics/teacher-overview?workspaceId=${encodeURIComponent(ids.workspaceA)}&teacherId=${encodeURIComponent(ids.teacherA2)}`, { expectedStatus: 403 });
    await api(teacherAJar, 'GET', `/api/analytics/teacher-overview?workspaceId=${encodeURIComponent(ids.workspaceA)}&classId=${encodeURIComponent(ids.classA2)}`, { expectedStatus: 403 });

    const student = await api(studentAJar, 'GET', `/api/analytics/student-overview?workspaceId=${encodeURIComponent(ids.workspaceA)}&studentId=${encodeURIComponent(ids.studentA)}`);
    assert.strictEqual(student.summary.student.id, ids.studentA);
    await api(studentAJar, 'GET', `/api/analytics/student-overview?workspaceId=${encodeURIComponent(ids.workspaceA)}&studentId=${encodeURIComponent(ids.studentA2)}`, { expectedStatus: 403 });
    await api(studentAJar, 'GET', `/api/analytics/student-overview?workspaceId=${encodeURIComponent(ids.workspaceB)}`, { expectedStatus: 403 });

    console.log('[analytics-backend-smoke] passed');
  } finally {
    await stopServer(child);
    fs.rmSync(uploadsDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error('[analytics-backend-smoke] failed:', err && err.stack ? err.stack : err);
  process.exit(1);
});
