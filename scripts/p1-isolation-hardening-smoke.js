#!/usr/bin/env node
'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const Database = require('better-sqlite3');

const runId = `p1_iso_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
const port = 4630 + Math.floor(Math.random() * 100);
const sqlitePath = path.join(os.tmpdir(), `${runId}.sqlite`);
const uploadsDir = path.join(os.tmpdir(), `${runId}_uploads`);
const baseUrl = `http://127.0.0.1:${port}`;

const ids = {
  workspaceA: `ws_a_${runId}`,
  workspaceB: `ws_b_${runId}`,
  adminA: `admin_a_${runId}`,
  teacherA: `teacher_a_${runId}`,
  studentA: `student_a_${runId}`,
  studentA2: `student_a2_${runId}`,
  adminB: `admin_b_${runId}`,
  teacherB: `teacher_b_${runId}`,
  studentB: `student_b_${runId}`,
  classA: `class_a_${runId}`,
  classB: `class_b_${runId}`,
  calendarA: `cal_a_${runId}`,
  calendarB: `cal_b_${runId}`,
  sessionA: `att_sess_a_${runId}`
};

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
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
    .run(ids.workspaceA, 'P1 School A', `admin.a.${runId}@example.com`);
  db.prepare(`INSERT INTO workspaces (id, name, status, admin_email, created_at) VALUES (?, ?, 'approved', ?, datetime('now'))`)
    .run(ids.workspaceB, 'P1 School B', `admin.b.${runId}@example.com`);

  [
    { id: ids.adminA, workspaceId: ids.workspaceA, email: `admin.a.${runId}@example.com`, role: 'school_admin', name: 'Admin A' },
    { id: ids.teacherA, workspaceId: ids.workspaceA, email: `teacher.a.${runId}@example.com`, role: 'teacher', name: 'Teacher A' },
    { id: ids.studentA, workspaceId: ids.workspaceA, email: `student.a.${runId}@example.com`, role: 'student', name: 'Student A' },
    { id: ids.studentA2, workspaceId: ids.workspaceA, email: `student.a2.${runId}@example.com`, role: 'student', name: 'Student A Two' },
    { id: ids.adminB, workspaceId: ids.workspaceB, email: `admin.b.${runId}@example.com`, role: 'school_admin', name: 'Admin B' },
    { id: ids.teacherB, workspaceId: ids.workspaceB, email: `teacher.b.${runId}@example.com`, role: 'teacher', name: 'Teacher B' },
    { id: ids.studentB, workspaceId: ids.workspaceB, email: `student.b.${runId}@example.com`, role: 'student', name: 'Student B' }
  ].forEach((user) => insertUser(db, { ...user, passwordHash }));

  db.prepare(`INSERT INTO channels (id, workspace_id, name, topic, members, unread, category) VALUES (?, ?, ?, '', 2, 0, 'classes')`)
    .run(ids.classA, ids.workspaceA, 'P1 Class A');
  db.prepare(`INSERT INTO channels (id, workspace_id, name, topic, members, unread, category) VALUES (?, ?, ?, '', 2, 0, 'classes')`)
    .run(ids.classB, ids.workspaceB, 'P1 Class B');
  [ids.adminA, ids.teacherA, ids.studentA].forEach((userId) => db.prepare(`INSERT INTO channel_members (channel_id, user_id) VALUES (?, ?)`).run(ids.classA, userId));
  [ids.adminB, ids.teacherB, ids.studentB].forEach((userId) => db.prepare(`INSERT INTO channel_members (channel_id, user_id) VALUES (?, ?)`).run(ids.classB, userId));

  db.prepare(`
    INSERT INTO calendar_events
      (id, workspace_id, source_type, source_id, visibility_scope, target_type, target_id, title, description, notes, date, event_date, start_time, end_time, all_day, meet_link, details_url, assignee_id, created_by, remind_min, color, repeat_json, done, created_at, updated_at)
    VALUES
      (?, ?, 'manual', '', 'workspace', 'school', '', ?, '', '', date('now'), date('now'), '10:00', '11:00', 0, '', '', '', ?, 0, '#1a73e8', '', 0, datetime('now'), datetime('now'))
  `).run(ids.calendarA, ids.workspaceA, 'Workspace A event', ids.adminA);
  db.prepare(`
    INSERT INTO calendar_events
      (id, workspace_id, source_type, source_id, visibility_scope, target_type, target_id, title, description, notes, date, event_date, start_time, end_time, all_day, meet_link, details_url, assignee_id, created_by, remind_min, color, repeat_json, done, created_at, updated_at)
    VALUES
      (?, ?, 'manual', '', 'workspace', 'school', '', ?, '', '', date('now'), date('now'), '10:00', '11:00', 0, '', '', '', ?, 0, '#1a73e8', '', 0, datetime('now'), datetime('now'))
  `).run(ids.calendarB, ids.workspaceB, 'Workspace B private event', ids.adminB);

  db.prepare(`INSERT INTO knowledge_items (id, workspace_id, title, body, visibility, tags, updated_at) VALUES (?, ?, ?, ?, 'public', '', datetime('now'))`)
    .run(`ka_${runId}`, ids.workspaceA, 'Workspace A handbook', 'Alpha-only policy');
  db.prepare(`INSERT INTO knowledge_items (id, workspace_id, title, body, visibility, tags, updated_at) VALUES (?, ?, ?, ?, 'public', '', datetime('now'))`)
    .run(`kb_${runId}`, ids.workspaceB, 'Workspace B handbook', 'Beta secret policy');

  db.prepare(`INSERT INTO attendance_sessions (id, workspace_id, channel_id, session_date, created_by_user_id) VALUES (?, ?, ?, date('now'), ?)`)
    .run(ids.sessionA, ids.workspaceA, ids.classA, ids.teacherA);
  db.prepare(`
    INSERT INTO attendance_records (id, workspace_id, session_id, channel_id, student_user_id, status, marked_by_user_id, marked_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'present', ?, datetime('now'), datetime('now'))
  `).run(`ar_${runId}`, ids.workspaceA, ids.sessionA, ids.classA, ids.studentA, ids.teacherA);

  db.close();
}

async function login(email) {
  const jar = {};
  await api(jar, 'GET', '/api/auth/csrf');
  await api(jar, 'POST', '/api/auth/login', {
    json: { email, password: 'Secret123!' },
    expectedStatuses: [200, 202]
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

function assertFrontendHardeningSources() {
  const app = fs.readFileSync(path.join(process.cwd(), 'public/app.js'), 'utf8');
  assert.ok(app.includes('localStorage.clear()'), 'logout should clear localStorage');
  assert.ok(app.includes('sessionStorage.clear()'), 'logout should clear sessionStorage');
  const analytics = fs.readFileSync(path.join(process.cwd(), 'public/analytics/analytics.js'), 'utf8');
  assert.ok(analytics.includes('${DASHBOARD_SUMMARY_CACHE_PREFIX}:${userId}:${workspaceId}:${role'), 'analytics cache key should include role');
  const admin = fs.readFileSync(path.join(process.cwd(), 'admin/admin.js'), 'utf8');
  assert.ok(!/localStorage\.setItem\([^)]*access[_-]?token/i.test(admin), 'admin access token must not be stored in localStorage');
  assert.ok(!admin.includes('STORAGE_ACCESS_TOKEN'), 'legacy admin token storage constant should be removed');
}

async function main() {
  assertFrontendHardeningSources();
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
    const studentA2Jar = await login(`student.a2.${runId}@example.com`);
    await acceptWorkspacePolicy(adminAJar, ids.workspaceA);
    await acceptWorkspacePolicy(teacherAJar, ids.workspaceA);
    await acceptWorkspacePolicy(studentAJar, ids.workspaceA);
    await acceptWorkspacePolicy(studentA2Jar, ids.workspaceA);

    await api({}, 'GET', '/api/calendar/events', { expectedStatus: 401 });
    const calendar = await api(adminAJar, 'GET', `/api/calendar/events?workspaceId=${encodeURIComponent(ids.workspaceB)}`);
    assert.ok(calendar.every((event) => event.workspaceId === ids.workspaceA), 'calendar must ignore foreign query workspaceId');
    await api(adminAJar, 'PATCH', `/api/calendar/events/${encodeURIComponent(ids.calendarB)}`, {
      json: { title: 'Cross workspace edit' },
      expectedStatus: 403
    });
    await api(adminAJar, 'POST', '/api/calendar/events', {
      json: { title: 'Bad assignee', date: '2026-05-03', assigneeId: ids.studentB },
      expectedStatus: 403
    });

    await api({}, 'GET', '/api/knowledge/search?q=policy', { expectedStatus: 401 });
    const knowledge = await api(studentAJar, 'GET', '/api/knowledge/search?q=policy');
    const serializedKnowledge = JSON.stringify(knowledge);
    assert.ok(serializedKnowledge.includes('Alpha-only policy'), 'own workspace knowledge should be returned');
    assert.ok(!serializedKnowledge.includes('Beta secret policy'), 'foreign workspace knowledge must not leak');

    await api(studentA2Jar, 'GET', `/api/channels/${encodeURIComponent(ids.classA)}/culture-pref`, { expectedStatus: 403 });
    await api(studentA2Jar, 'POST', '/api/culture/prefs', {
      json: { channelId: ids.classA, readLanguage: 'de' },
      expectedStatus: 403
    });

    await api(teacherAJar, 'GET', `/api/classes/${encodeURIComponent(ids.classB)}/attendance/report.csv`, { expectedStatus: 403 });
    await api(teacherAJar, 'GET', `/api/classes/${encodeURIComponent(ids.classA)}/attendance/report.csv?studentId=${encodeURIComponent(ids.studentB)}`, { expectedStatus: 403 });

    await api({}, 'GET', '/api/events', { expectedStatus: 401 });

    console.log('[p1-isolation-hardening-smoke] passed');
  } finally {
    await stopServer(child);
    fs.rmSync(uploadsDir, { recursive: true, force: true });
    if (fs.existsSync(sqlitePath)) fs.unlinkSync(sqlitePath);
  }
}

main().catch((err) => {
  console.error('[p1-isolation-hardening-smoke] failed:', err && err.stack ? err.stack : err);
  process.exit(1);
});
