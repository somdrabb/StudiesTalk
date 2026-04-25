#!/usr/bin/env node
'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const Database = require('better-sqlite3');

const runId = `live_controls_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
const port = 4600 + Math.floor(Math.random() * 100);
const sqlitePath = path.join(os.tmpdir(), `${runId}.sqlite`);
const uploadsDir = path.join(os.tmpdir(), `${runId}_uploads`);

const ids = {
  workspaceId: `ws_${runId}`,
  otherWorkspaceId: `ws_other_${runId}`,
  teacherId: `teacher_${runId}`,
  adminId: `admin_${runId}`,
  studentAId: `student_a_${runId}`,
  studentBId: `student_b_${runId}`,
  outsiderId: `outsider_${runId}`,
  classId: `class_${runId}`,
  sessionId: `ls_${runId}`
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

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  await sleep(500);
}

async function waitForServer(baseUrl) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 30000) {
    try {
      const res = await fetch(`${baseUrl}/`);
      if (res.status >= 200 || res.status === 404) return;
    } catch (_err) {}
    await sleep(400);
  }
  throw new Error('Server did not become ready in time');
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

async function request(baseUrl, jar, method, route, {
  json,
  expectedStatus = 200
} = {}) {
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
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (_err) {
    data = { raw: text };
  }

  assert.strictEqual(
    response.status,
    expectedStatus,
    `${method} ${route} => expected ${expectedStatus}, got ${response.status}: ${JSON.stringify(data)}`
  );
  return data;
}

async function api(baseUrl, jar, method, route, options = {}) {
  return request(baseUrl, jar, method, route, options);
}

function seedSqlite(dbPath) {
  const db = new Database(dbPath);
  db.pragma('foreign_keys = ON');

  safeAlterSqlite(db, `ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0;`);
  safeAlterSqlite(db, `ALTER TABLE users ADD COLUMN temp_login_started_at INTEGER;`);
  safeAlterSqlite(db, `ALTER TABLE users ADD COLUMN native_language TEXT NOT NULL DEFAULT 'en';`);
  safeAlterSqlite(db, `ALTER TABLE users ADD COLUMN native_language_confirmed INTEGER NOT NULL DEFAULT 0;`);

  db.prepare(`INSERT INTO workspaces (id, name, status, admin_email, created_at) VALUES (?, ?, 'approved', ?, datetime('now'))`)
    .run(ids.workspaceId, 'Live Controls Workspace', `teacher.${runId}@example.com`);
  db.prepare(`INSERT INTO workspaces (id, name, status, admin_email, created_at) VALUES (?, ?, 'approved', ?, datetime('now'))`)
    .run(ids.otherWorkspaceId, 'Other Workspace', `outsider.${runId}@example.com`);

  const insertUser = db.prepare(`
    INSERT INTO users
    (id, workspace_id, first_name, last_name, name, email, username, password_hash, role, status, native_language, native_language_confirmed, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 'en', 1, datetime('now'))
  `);
  const passwordHash = hashPassword('Secret123!');
  insertUser.run(ids.teacherId, ids.workspaceId, 'Teacher', 'Smoke', 'Teacher Smoke', `teacher.${runId}@example.com`, `teacher_${runId}`, passwordHash, 'teacher');
  insertUser.run(ids.adminId, ids.workspaceId, 'Admin', 'Smoke', 'Admin Smoke', `admin.${runId}@example.com`, `admin_${runId}`, passwordHash, 'school_admin');
  insertUser.run(ids.studentAId, ids.workspaceId, 'Student', 'A', 'Student A', `student.a.${runId}@example.com`, `student_a_${runId}`, passwordHash, 'student');
  insertUser.run(ids.studentBId, ids.workspaceId, 'Student', 'B', 'Student B', `student.b.${runId}@example.com`, `student_b_${runId}`, passwordHash, 'student');
  insertUser.run(ids.outsiderId, ids.otherWorkspaceId, 'Outside', 'User', 'Outside User', `outsider.${runId}@example.com`, `outsider_${runId}`, passwordHash, 'student');

  db.prepare(`
    INSERT INTO channels (id, workspace_id, name, topic, members, unread, category, created_at)
    VALUES (?, ?, 'A1 Live Class', '', 4, 0, 'classes', datetime('now'))
  `).run(ids.classId, ids.workspaceId);

  const memberStmt = db.prepare('INSERT INTO channel_members (channel_id, user_id) VALUES (?, ?)');
  [ids.teacherId, ids.adminId, ids.studentAId, ids.studentBId].forEach((userId) => memberStmt.run(ids.classId, userId));

  db.prepare(`
    INSERT INTO platform_settings (key, value, updated_at)
    VALUES ('workspace_policy_version_default', '2026-04-26', datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run();

  const onboardingStmt = db.prepare(`
    INSERT INTO workspace_onboarding (id, workspace_id, status, current_step, completed_at, created_at, updated_at, completed_by_user_id)
    VALUES (?, ?, 'completed', 'launch_checklist', datetime('now'), datetime('now'), datetime('now'), ?)
    ON CONFLICT(workspace_id) DO UPDATE SET
      status = 'completed',
      current_step = 'launch_checklist',
      completed_at = datetime('now'),
      updated_at = datetime('now'),
      completed_by_user_id = excluded.completed_by_user_id
  `);
  onboardingStmt.run(`ob_${crypto.randomUUID()}`, ids.workspaceId, ids.teacherId);
  onboardingStmt.run(`ob_${crypto.randomUUID()}`, ids.otherWorkspaceId, ids.outsiderId);

  db.prepare(`
    INSERT INTO live_sessions (
      id, workspace_id, channel_id, title, date, start_time, end_time, meeting_url,
      meeting_pass, student_notes, status, autopost_mode, audience, created_by, created_at, updated_at, invited_user_ids
    ) VALUES (?, ?, ?, 'Production Controls Class', '2099-01-10', '10:00', '11:00', ?, '', '', 'scheduled', 'channel', NULL, ?, datetime('now'), datetime('now'), '')
  `).run(ids.sessionId, ids.workspaceId, ids.classId, `https://meet.jit.si/${ids.sessionId}`, ids.teacherId);

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

async function login(baseUrl, email) {
  const jar = {};
  await api(baseUrl, jar, 'GET', '/api/auth/csrf');
  await api(baseUrl, jar, 'POST', '/api/auth/login', {
    json: { email, password: 'Secret123!' }
  });
  return jar;
}

async function acceptPolicy(baseUrl, jar, workspaceId) {
  const policy = await api(baseUrl, jar, 'GET', `/api/workspaces/${encodeURIComponent(workspaceId)}/policy`);
  const version = String(policy?.document?.version || '').trim();
  await api(baseUrl, jar, 'POST', `/api/workspaces/${encodeURIComponent(workspaceId)}/policy/accept`, {
    json: { version }
  });
}

async function main() {
  if (fs.existsSync(sqlitePath)) fs.unlinkSync(sqlitePath);
  fs.rmSync(uploadsDir, { recursive: true, force: true });

  let child = startServer();
  try {
    const baseUrl = `http://127.0.0.1:${port}`;
    await waitForServer(baseUrl);
    await stopServer(child);

    seedSqlite(sqlitePath);
    child = startServer();
    await waitForServer(baseUrl);

    const teacherJar = await login(baseUrl, `teacher.${runId}@example.com`);
    const adminJar = await login(baseUrl, `admin.${runId}@example.com`);
    const studentAJar = await login(baseUrl, `student.a.${runId}@example.com`);
    const studentBJar = await login(baseUrl, `student.b.${runId}@example.com`);
    const outsiderJar = await login(baseUrl, `outsider.${runId}@example.com`);

    await acceptPolicy(baseUrl, teacherJar, ids.workspaceId);
    await acceptPolicy(baseUrl, adminJar, ids.workspaceId);
    await acceptPolicy(baseUrl, studentAJar, ids.workspaceId);
    await acceptPolicy(baseUrl, studentBJar, ids.workspaceId);
    await acceptPolicy(baseUrl, outsiderJar, ids.otherWorkspaceId);

    const requestA = await api(baseUrl, studentAJar, 'POST', `/api/live-sessions/${encodeURIComponent(ids.sessionId)}/request-join`, {
      expectedStatus: 202
    });
    assert.strictEqual(requestA.status, 'pending', 'student A should enter pending waiting room state');

    const pendingJoin = await api(baseUrl, studentAJar, 'POST', `/api/live-sessions/${encodeURIComponent(ids.sessionId)}/join`, {
      expectedStatus: 403
    });
    assert.strictEqual(pendingJoin.code, 'live_waiting_room_pending', 'pending student should be blocked from join');

    const teacherState0 = await api(baseUrl, teacherJar, 'GET', `/api/live-sessions/${encodeURIComponent(ids.sessionId)}/state`);
    assert.strictEqual(teacherState0.liveControls.pendingParticipants.length, 1, 'teacher should see one pending participant');

    await api(baseUrl, teacherJar, 'POST', `/api/live-sessions/${encodeURIComponent(ids.sessionId)}/participants/${encodeURIComponent(ids.studentAId)}/approve`);

    const joinedA = await api(baseUrl, studentAJar, 'POST', `/api/live-sessions/${encodeURIComponent(ids.sessionId)}/join`);
    assert.strictEqual(joinedA.ok, true, 'approved student should join');
    assert.strictEqual(joinedA.liveControls.self.status, 'joined', 'approved student should move to joined');

    await api(baseUrl, studentBJar, 'POST', `/api/live-sessions/${encodeURIComponent(ids.sessionId)}/request-join`, {
      expectedStatus: 202
    });
    await api(baseUrl, teacherJar, 'POST', `/api/live-sessions/${encodeURIComponent(ids.sessionId)}/participants/${encodeURIComponent(ids.studentBId)}/deny`);

    const deniedJoin = await api(baseUrl, studentBJar, 'POST', `/api/live-sessions/${encodeURIComponent(ids.sessionId)}/join`, {
      expectedStatus: 403
    });
    assert.strictEqual(deniedJoin.code, 'live_join_denied', 'denied student should not join');

    await api(baseUrl, studentAJar, 'POST', `/api/live-sessions/${encodeURIComponent(ids.sessionId)}/participants/${encodeURIComponent(ids.studentBId)}/approve`, {
      expectedStatus: 403
    });

    const crossTenant = await api(baseUrl, outsiderJar, 'POST', `/api/live-sessions/${encodeURIComponent(ids.sessionId)}/request-join`, {
      expectedStatus: 403
    });
    assert.strictEqual(crossTenant.code, 'tenant_forbidden', 'cross-tenant join request should be denied');

    await api(baseUrl, studentAJar, 'POST', `/api/live-sessions/${encodeURIComponent(ids.sessionId)}/hand/raise`);
    const teacherState1 = await api(baseUrl, teacherJar, 'GET', `/api/live-sessions/${encodeURIComponent(ids.sessionId)}/state`);
    assert.strictEqual(teacherState1.liveControls.raisedHands.length, 1, 'teacher should see one raised hand');
    assert.strictEqual(teacherState1.liveControls.raisedHands[0].userId, ids.studentAId, 'raised hand should belong to student A');

    await api(baseUrl, teacherJar, 'POST', `/api/live-sessions/${encodeURIComponent(ids.sessionId)}/hand/lower`, {
      json: { userId: ids.studentAId }
    });
    const teacherState2 = await api(baseUrl, teacherJar, 'GET', `/api/live-sessions/${encodeURIComponent(ids.sessionId)}/state`);
    assert.strictEqual(teacherState2.liveControls.raisedHands.length, 0, 'teacher should be able to lower raised hand');

    const adminJoin = await api(baseUrl, adminJar, 'POST', `/api/live-sessions/${encodeURIComponent(ids.sessionId)}/join`);
    assert.strictEqual(adminJoin.ok, true, 'same-workspace admin should bypass waiting room');

    console.log('[live-class-controls-smoke] passed');
  } finally {
    await stopServer(child);
    fs.rmSync(uploadsDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error('[live-class-controls-smoke] failed:', err && err.stack ? err.stack : err);
  process.exit(1);
});
