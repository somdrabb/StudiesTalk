#!/usr/bin/env node
'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const Database = require('better-sqlite3');

const runId = `p0_iso_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
const port = 4520 + Math.floor(Math.random() * 100);
const sqlitePath = path.join(os.tmpdir(), `${runId}.sqlite`);
const uploadsDir = path.join(os.tmpdir(), `${runId}_uploads`);
const baseUrl = `http://127.0.0.1:${port}`;

const ids = {
  workspaceA: `ws_a_${runId}`,
  workspaceB: `ws_b_${runId}`,
  adminA: `admin_a_${runId}`,
  adminB: `admin_b_${runId}`,
  teacherA: `teacher_a_${runId}`,
  teacherB: `teacher_b_${runId}`,
  studentA: `student_a_${runId}`,
  studentA2: `student_a2_${runId}`,
  studentB: `student_b_${runId}`,
  classA: `class_a_${runId}`,
  classB: `class_b_${runId}`,
  msgTeacherA: `msg_teacher_a_${runId}`,
  msgStudentA: `msg_student_a_${runId}`,
  msgTeacherB: `msg_teacher_b_${runId}`,
  dmA: `dm_a_${runId}`,
  dmB: `dm_b_${runId}`,
  dmMsgB: `dm_msg_b_${runId}`,
  liveA: `live_a_${runId}`,
  liveB: `live_b_${runId}`
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
      BILLING_DB_ENGINE: 'sqlite',
      TASKS_DB_ENGINE: 'sqlite',
      ATTENDANCE_DB_ENGINE: 'sqlite',
      CHANNELS_DB_ENGINE: 'sqlite',
      MESSAGES_DB_ENGINE: 'sqlite',
      EMAIL_PROVIDER: 'disabled'
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
    .run(ids.workspaceA, 'P0 School A', `admin.a.${runId}@example.com`);
  db.prepare(`INSERT INTO workspaces (id, name, status, admin_email, created_at) VALUES (?, ?, 'approved', ?, datetime('now'))`)
    .run(ids.workspaceB, 'P0 School B', `admin.b.${runId}@example.com`);

  [
    { id: ids.adminA, workspaceId: ids.workspaceA, email: `admin.a.${runId}@example.com`, role: 'school_admin', name: 'Admin A' },
    { id: ids.adminB, workspaceId: ids.workspaceB, email: `admin.b.${runId}@example.com`, role: 'school_admin', name: 'Admin B' },
    { id: ids.teacherA, workspaceId: ids.workspaceA, email: `teacher.a.${runId}@example.com`, role: 'teacher', name: 'Teacher A' },
    { id: ids.teacherB, workspaceId: ids.workspaceB, email: `teacher.b.${runId}@example.com`, role: 'teacher', name: 'Teacher B' },
    { id: ids.studentA, workspaceId: ids.workspaceA, email: `student.a.${runId}@example.com`, role: 'student', name: 'Student A' },
    { id: ids.studentA2, workspaceId: ids.workspaceA, email: `student.a2.${runId}@example.com`, role: 'student', name: 'Student A Two' },
    { id: ids.studentB, workspaceId: ids.workspaceB, email: `student.b.${runId}@example.com`, role: 'student', name: 'Student B' }
  ].forEach((user) => insertUser(db, { ...user, passwordHash }));

  const channelStmt = db.prepare(`INSERT INTO channels (id, workspace_id, name, topic, members, unread, category) VALUES (?, ?, ?, '', 2, 0, 'classes')`);
  channelStmt.run(ids.classA, ids.workspaceA, 'P0 Class A');
  channelStmt.run(ids.classB, ids.workspaceB, 'P0 Class B');
  const memberStmt = db.prepare(`INSERT INTO channel_members (channel_id, user_id) VALUES (?, ?)`);
  [ids.adminA, ids.teacherA, ids.studentA].forEach((userId) => memberStmt.run(ids.classA, userId));
  [ids.adminB, ids.teacherB, ids.studentB].forEach((userId) => memberStmt.run(ids.classB, userId));

  const msgStmt = db.prepare(`
    INSERT INTO messages (id, channel_id, author, initials, avatar_url, time, text, alt, created_at, original_language)
    VALUES (?, ?, ?, ?, NULL, ?, ?, 0, ?, 'en')
  `);
  msgStmt.run(ids.msgTeacherA, ids.classA, 'Teacher A', 'TA', '10:00', 'Teacher-owned message', new Date().toISOString());
  msgStmt.run(ids.msgStudentA, ids.classA, 'Student A', 'SA', '10:01', 'Student-owned message', new Date().toISOString());
  msgStmt.run(ids.msgTeacherB, ids.classB, 'Teacher B', 'TB', '10:02', 'Foreign workspace message', new Date().toISOString());

  db.prepare(`INSERT INTO dms (id, name, initials, online, created_by) VALUES (?, ?, ?, 0, ?)`)
    .run(ids.dmA, 'DM A', 'DA', ids.teacherA);
  db.prepare(`INSERT INTO dms (id, name, initials, online, created_by) VALUES (?, ?, ?, 0, ?)`)
    .run(ids.dmB, 'DM B', 'DB', ids.teacherB);
  [ids.teacherA, ids.studentA].forEach((userId) => db.prepare(`INSERT INTO dm_members (dm_id, user_id) VALUES (?, ?)`).run(ids.dmA, userId));
  [ids.teacherB, ids.studentB].forEach((userId) => db.prepare(`INSERT INTO dm_members (dm_id, user_id) VALUES (?, ?)`).run(ids.dmB, userId));
  db.prepare(`INSERT INTO dm_messages (id, dm_id, author, initials, time, text) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(ids.dmMsgB, ids.dmB, 'Teacher B', 'TB', '10:03', 'Private DM from workspace B');

  const liveStmt = db.prepare(`
    INSERT INTO live_sessions (id, workspace_id, channel_id, title, date, start_time, end_time, meeting_url, created_by, audience)
    VALUES (?, ?, ?, ?, date('now'), '10:00', '11:00', 'https://meet.example.test', ?, 'class')
  `);
  liveStmt.run(ids.liveA, ids.workspaceA, ids.classA, 'Live A', ids.teacherA);
  liveStmt.run(ids.liveB, ids.workspaceB, ids.classB, 'Live B', ids.teacherB);
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
  if (version) {
    await api(jar, 'POST', `/api/workspaces/${encodeURIComponent(workspaceId)}/policy/accept`, {
      json: { version }
    });
  }
}

function assertNoTrustedFrontendHeaders() {
  const patterns = /x-user-id|x-workspace-id|x-user-role|x-role|x-admin|x-super-admin/i;
  for (const rel of ['public/app.js', 'public/calendar/calendar.js']) {
    const text = fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
    assert.ok(!patterns.test(text), `${rel} still sends a trusted identity/admin header`);
  }
}

async function main() {
  assertNoTrustedFrontendHeaders();
  fs.rmSync(uploadsDir, { recursive: true, force: true });
  if (fs.existsSync(sqlitePath)) fs.unlinkSync(sqlitePath);
  let child = startServer();
  try {
    await waitForServer();
    await stopServer(child);
    seedSqlite();
    child = startServer();
    await waitForServer();

    const studentAJar = await login(`student.a.${runId}@example.com`);
    const teacherAJar = await login(`teacher.a.${runId}@example.com`);
    const adminAJar = await login(`admin.a.${runId}@example.com`);
    await acceptWorkspacePolicy(studentAJar, ids.workspaceA);
    await acceptWorkspacePolicy(teacherAJar, ids.workspaceA);
    await acceptWorkspacePolicy(adminAJar, ids.workspaceA);

    await api({}, 'GET', '/api/dms', { expectedStatus: 401 });
    const dms = await api(studentAJar, 'GET', '/api/dms');
    assert.deepStrictEqual(dms.map((dm) => dm.id), [ids.dmA], 'DM list must only include participant threads');

    await api(teacherAJar, 'PATCH', `/api/messages/${encodeURIComponent(ids.msgStudentA)}`, {
      json: { text: 'teacher should not edit this', author: 'Teacher A' },
      expectedStatus: 403
    });
    await api(studentAJar, 'PATCH', `/api/messages/${encodeURIComponent(ids.msgTeacherA)}`, {
      json: { text: 'student should not edit this' },
      expectedStatus: 403
    });

    await api(studentAJar, 'POST', '/api/translate', {
      json: { messageId: ids.msgTeacherB, text: 'Foreign workspace message', sourceLang: 'en', targetLang: 'de' },
      expectedStatus: 403
    });
    await api(studentAJar, 'POST', '/api/translate', {
      json: { messageId: ids.dmMsgB, text: 'Private DM from workspace B', sourceLang: 'en', targetLang: 'de' },
      expectedStatus: 403
    });

    await api(teacherAJar, 'POST', `/api/live-sessions/${encodeURIComponent(ids.liveA)}/attendance`, {
      json: { records: [{ studentId: ids.studentB, status: 'present' }] },
      expectedStatus: 403
    });
    await api(teacherAJar, 'POST', `/api/live-sessions/${encodeURIComponent(ids.liveA)}/attendance`, {
      json: { records: [{ studentId: ids.studentA2, status: 'present' }] },
      expectedStatus: 403
    });
    await api(adminAJar, 'POST', `/api/live-sessions/${encodeURIComponent(ids.liveB)}/attendance`, {
      json: { records: [{ studentId: ids.studentB, status: 'present' }] },
      expectedStatus: 403
    });
    await api(teacherAJar, 'POST', `/api/live-sessions/${encodeURIComponent(ids.liveA)}/attendance`, {
      json: { records: [{ studentId: ids.studentA, status: 'present' }] }
    });

    console.log('[p0-isolation-fixes-smoke] passed');
  } finally {
    await stopServer(child);
    fs.rmSync(uploadsDir, { recursive: true, force: true });
    if (fs.existsSync(sqlitePath)) fs.unlinkSync(sqlitePath);
  }
}

main().catch((err) => {
  console.error('[p0-isolation-fixes-smoke] failed:', err && err.stack ? err.stack : err);
  process.exit(1);
});
