#!/usr/bin/env node
'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const Database = require('better-sqlite3');

const runId = `tenant_iso_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
const port = 4400 + Math.floor(Math.random() * 100);
const sqlitePath = path.join(os.tmpdir(), `${runId}.sqlite`);
const uploadsDir = path.join(os.tmpdir(), `${runId}_uploads`);

const ids = {
  workspaceA: `ws_a_${runId}`,
  workspaceB: `ws_b_${runId}`,
  studentA: `student_a_${runId}`,
  teacherA: `teacher_a_${runId}`,
  adminA: `admin_a_${runId}`,
  studentB: `student_b_${runId}`,
  teacherB: `teacher_b_${runId}`,
  superAdmin: `super_${runId}`,
  channelA: `class_a_${runId}`,
  channelB: `class_b_${runId}`,
  homeworkA: `hw_a_${runId}`,
  homeworkB: `hw_b_${runId}`,
  homeworkItemA: `hwi_a_${runId}`,
  homeworkItemB: `hwi_b_${runId}`,
  messageA: `msg_a_${runId}`,
  messageB: `msg_b_${runId}`,
  dmB: `dm_b_${runId}`
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
    await sleep(500);
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
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${key}=${value}`)
    .join('; ');
}

async function api(baseUrl, jar, method, route, { json, expectedStatus = 200 } = {}) {
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

  if (response.status !== expectedStatus) {
    throw new Error(`${method} ${route} failed: expected=${expectedStatus} actual=${response.status} payload=${JSON.stringify(data)}`);
  }

  return data;
}

function insertUser(db, { id, workspaceId, email, role, passwordHash, name, phone, dateOfBirth }) {
  db.prepare(`
    INSERT INTO users
    (id, workspace_id, first_name, last_name, name, email, username, password_hash, role, status, phone, phone_country, phone_number, date_of_birth, native_language, native_language_confirmed, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, '+1', ?, ?, 'en', 1, datetime('now'))
  `).run(
    id,
    workspaceId,
    name.split(' ')[0],
    name.split(' ').slice(1).join(' ') || 'User',
    name,
    email,
    `${role}_${id}`.slice(0, 50),
    passwordHash,
    role,
    phone,
    String(phone || '').replace(/^\+1/, ''),
    dateOfBirth
  );
}

function seedSqlite(dbPath) {
  const db = new Database(dbPath);
  db.pragma('foreign_keys = ON');

  safeAlterSqlite(db, `ALTER TABLE users ADD COLUMN phone TEXT NOT NULL DEFAULT '';`);
  safeAlterSqlite(db, `ALTER TABLE users ADD COLUMN phone_country TEXT NOT NULL DEFAULT '';`);
  safeAlterSqlite(db, `ALTER TABLE users ADD COLUMN phone_number TEXT NOT NULL DEFAULT '';`);
  safeAlterSqlite(db, `ALTER TABLE users ADD COLUMN date_of_birth TEXT;`);
  safeAlterSqlite(db, `ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0;`);
  safeAlterSqlite(db, `ALTER TABLE users ADD COLUMN temp_login_started_at INTEGER;`);
  safeAlterSqlite(db, `ALTER TABLE users ADD COLUMN native_language TEXT NOT NULL DEFAULT 'en';`);
  safeAlterSqlite(db, `ALTER TABLE users ADD COLUMN native_language_confirmed INTEGER NOT NULL DEFAULT 0;`);

  db.prepare(`INSERT INTO workspaces (id, name, status, admin_email, created_at) VALUES (?, ?, 'approved', ?, datetime('now'))`)
    .run(ids.workspaceA, 'Workspace A', `admin.a.${runId}@example.com`);
  db.prepare(`INSERT INTO workspaces (id, name, status, admin_email, created_at) VALUES (?, ?, 'approved', ?, datetime('now'))`)
    .run(ids.workspaceB, 'Workspace B', `admin.b.${runId}@example.com`);
  const passwordHash = hashPassword('Secret123!');
  insertUser(db, {
    id: ids.studentA,
    workspaceId: ids.workspaceA,
    email: `student.a.${runId}@example.com`,
    role: 'student',
    passwordHash,
    name: 'Student A',
    phone: '+15550000001',
    dateOfBirth: '2004-01-01'
  });
  insertUser(db, {
    id: ids.teacherA,
    workspaceId: ids.workspaceA,
    email: `teacher.a.${runId}@example.com`,
    role: 'teacher',
    passwordHash,
    name: 'Teacher A',
    phone: '+15550000002',
    dateOfBirth: '1994-01-01'
  });
  insertUser(db, {
    id: ids.adminA,
    workspaceId: ids.workspaceA,
    email: `admin.a.${runId}@example.com`,
    role: 'school_admin',
    passwordHash,
    name: 'Admin A',
    phone: '+15550000003',
    dateOfBirth: '1984-01-01'
  });
  insertUser(db, {
    id: ids.studentB,
    workspaceId: ids.workspaceB,
    email: `student.b.${runId}@example.com`,
    role: 'student',
    passwordHash,
    name: 'Student B',
    phone: '+15550000004',
    dateOfBirth: '2004-02-02'
  });
  insertUser(db, {
    id: ids.teacherB,
    workspaceId: ids.workspaceB,
    email: `teacher.b.${runId}@example.com`,
    role: 'teacher',
    passwordHash,
    name: 'Teacher B',
    phone: '+15550000005',
    dateOfBirth: '1994-02-02'
  });
  insertUser(db, {
    id: ids.superAdmin,
    workspaceId: 'default',
    email: `super.${runId}@example.com`,
    role: 'super_admin',
    passwordHash,
    name: 'Super Admin',
    phone: '+15550000006',
    dateOfBirth: '1974-01-01'
  });

  db.prepare(`INSERT INTO channels (id, name, topic, members, unread, category, workspace_id) VALUES (?, ?, ?, 2, 0, 'classes', ?)`)
    .run(ids.channelA, 'Class A', '', ids.workspaceA);
  db.prepare(`INSERT INTO channels (id, name, topic, members, unread, category, workspace_id) VALUES (?, ?, ?, 2, 0, 'classes', ?)`)
    .run(ids.channelB, 'Class B', '', ids.workspaceB);
  db.prepare(`INSERT INTO channels (id, name, topic, members, unread, category, workspace_id) VALUES (?, ?, ?, 2, 0, 'homework', ?)`)
    .run(ids.homeworkA, 'Homework A', `homework_for:${ids.channelA}`, ids.workspaceA);
  db.prepare(`INSERT INTO channels (id, name, topic, members, unread, category, workspace_id) VALUES (?, ?, ?, 2, 0, 'homework', ?)`)
    .run(ids.homeworkB, 'Homework B', `homework_for:${ids.channelB}`, ids.workspaceB);

  const memberStmt = db.prepare('INSERT INTO channel_members (channel_id, user_id) VALUES (?, ?)');
  [ids.studentA, ids.teacherA, ids.adminA].forEach((userId) => {
    memberStmt.run(ids.channelA, userId);
    memberStmt.run(ids.homeworkA, userId);
  });
  [ids.studentB, ids.teacherB].forEach((userId) => {
    memberStmt.run(ids.channelB, userId);
    memberStmt.run(ids.homeworkB, userId);
  });

  db.prepare(`
    INSERT INTO messages (id, channel_id, author, initials, avatar_url, time, text, alt, created_at, original_language)
    VALUES (?, ?, ?, 'A', NULL, '10:00', ?, 0, datetime('now'), 'en')
  `).run(ids.messageA, ids.channelA, 'Teacher A', 'Workspace A message');
  db.prepare(`
    INSERT INTO messages (id, channel_id, author, initials, avatar_url, time, text, alt, created_at, original_language)
    VALUES (?, ?, ?, 'B', NULL, '10:00', ?, 0, datetime('now'), 'en')
  `).run(ids.messageB, ids.channelB, 'Teacher B', 'Workspace B message');

  db.prepare(`
    INSERT INTO homework_items
    (id, workspace_id, class_channel_id, title, description, due_date, is_locked, is_archived, created_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, datetime('now'))
  `).run(ids.homeworkItemA, ids.workspaceA, ids.channelA, 'Homework A', 'A desc', '2099-01-01', ids.teacherA);
  db.prepare(`
    INSERT INTO homework_items
    (id, workspace_id, class_channel_id, title, description, due_date, is_locked, is_archived, created_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, datetime('now'))
  `).run(ids.homeworkItemB, ids.workspaceB, ids.channelB, 'Homework B', 'B desc', '2099-01-01', ids.teacherB);

  db.prepare(`
    INSERT INTO dms (id, name, initials, online, created_by)
    VALUES (?, ?, 'DB', 0, ?)
  `).run(ids.dmB, 'Workspace B DM', ids.teacherB);
  db.prepare('INSERT INTO dm_members (dm_id, user_id) VALUES (?, ?)').run(ids.dmB, ids.teacherB);
  db.prepare('INSERT INTO dm_members (dm_id, user_id) VALUES (?, ?)').run(ids.dmB, ids.studentB);
  db.prepare(`
    INSERT INTO dm_messages (id, dm_id, author, initials, time, text)
    VALUES (?, ?, 'Teacher B', 'TB', '11:00', 'Workspace B private DM')
  `).run(`dm_msg_${runId}`, ids.dmB);

  fs.mkdirSync(uploadsDir, { recursive: true });
  fs.writeFileSync(path.join(uploadsDir, `file_a_${runId}.txt`), 'workspace a file');
  fs.writeFileSync(path.join(uploadsDir, `file_b_${runId}.txt`), 'workspace b file');

  db.prepare(`
    INSERT INTO files_registry
    (file_id, workspace_id, channel_id, message_id, uploader_id, purpose, file_name, mime, size_bytes, url, pinned, deleted, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'media', ?, 'text/plain', 16, ?, 0, 0, datetime('now'), datetime('now'))
  `).run(`file_a_${runId}`, ids.workspaceA, ids.channelA, ids.messageA, ids.teacherA, `file_a_${runId}.txt`, `/uploads/file_a_${runId}.txt`);
  db.prepare(`
    INSERT INTO files_registry
    (file_id, workspace_id, channel_id, message_id, uploader_id, purpose, file_name, mime, size_bytes, url, pinned, deleted, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'media', ?, 'text/plain', 16, ?, 0, 0, datetime('now'), datetime('now'))
  `).run(`file_b_${runId}`, ids.workspaceB, ids.channelB, ids.messageB, ids.teacherB, `file_b_${runId}.txt`, `/uploads/file_b_${runId}.txt`);

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

async function acceptWorkspacePolicy(baseUrl, jar, workspaceId) {
  const policy = await api(baseUrl, jar, 'GET', `/api/workspaces/${encodeURIComponent(workspaceId)}/policy`);
  const version = String(policy?.document?.version || '').trim();
  if (!version) {
    throw new Error(`Missing policy version for workspace ${workspaceId}`);
  }
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

    const studentAJar = await login(baseUrl, `student.a.${runId}@example.com`);
    const teacherAJar = await login(baseUrl, `teacher.a.${runId}@example.com`);
    const adminAJar = await login(baseUrl, `admin.a.${runId}@example.com`);
    const superJar = await login(baseUrl, `super.${runId}@example.com`);

    await acceptWorkspacePolicy(baseUrl, studentAJar, ids.workspaceA);
    await acceptWorkspacePolicy(baseUrl, teacherAJar, ids.workspaceA);
    await acceptWorkspacePolicy(baseUrl, adminAJar, ids.workspaceA);

    const sameWorkspaceChannels = await api(baseUrl, studentAJar, 'GET', `/api/channels?workspaceId=${encodeURIComponent(ids.workspaceA)}`);
    assert.ok(Array.isArray(sameWorkspaceChannels), 'same-workspace channel list should work');

    const sameWorkspaceMessages = await api(baseUrl, studentAJar, 'GET', `/api/channels/${ids.channelA}/messages`);
    assert.ok(Array.isArray(sameWorkspaceMessages), 'same-workspace message read should work');

    const sameWorkspaceHomework = await api(baseUrl, studentAJar, 'GET', `/api/homework/channels/${ids.homeworkA}/board`);
    assert.ok(Array.isArray(sameWorkspaceHomework.items), 'same-workspace homework board should work');

    await api(baseUrl, studentAJar, 'GET', `/api/channels?workspaceId=${encodeURIComponent(ids.workspaceB)}`, { expectedStatus: 403 })
      .then((body) => assert.equal(body.code, 'tenant_forbidden'));
    await api(baseUrl, studentAJar, 'GET', `/api/channels/${ids.channelB}/messages`, { expectedStatus: 403 })
      .then((body) => assert.equal(body.code, 'tenant_forbidden'));
    await api(baseUrl, studentAJar, 'GET', `/api/homework/channels/${ids.homeworkB}/board`, { expectedStatus: 403 })
      .then((body) => assert.equal(body.code, 'tenant_forbidden'));

    await api(baseUrl, studentAJar, 'GET', `/uploads/file_b_${runId}.txt`, { expectedStatus: 403 })
      .then((body) => assert.equal(body.code, 'tenant_forbidden'));
    const fileAResponse = await fetch(`${baseUrl}/uploads/file_a_${runId}.txt`, {
      headers: { Cookie: cookieHeader(studentAJar) }
    });
    assert.equal(fileAResponse.status, 200, 'same-workspace file download should work');

    const sameWorkspaceFileStats = await api(
      baseUrl,
      studentAJar,
      'POST',
      '/api/file-stats/increment',
      { json: { fileUrl: `/uploads/file_a_${runId}.txt`, type: 'view', fileName: `file_a_${runId}.txt`, workspaceId: ids.workspaceA } }
    );
    assert.equal(Number(sameWorkspaceFileStats.views || 0), 1, 'same-workspace file stat increment should work');

    const fetchedFileStats = await api(
      baseUrl,
      studentAJar,
      'GET',
      `/api/file-stats?workspaceId=${encodeURIComponent(ids.workspaceA)}&url=${encodeURIComponent(`/uploads/file_a_${runId}.txt`)}`
    );
    assert.equal(Number(fetchedFileStats?.stats?.[`/uploads/file_a_${runId}.txt`]?.views || 0), 1, 'same-workspace file stats should be readable');

    await api(baseUrl, studentAJar, 'POST', '/api/file-events', {
      json: {
        fileId: `file_a_${runId}`,
        fileUrl: `/uploads/file_a_${runId}.txt`,
        eventType: 'view',
        workspaceId: ids.workspaceA
      }
    });
    await api(baseUrl, studentAJar, 'POST', '/api/file-events', {
      json: {
        fileId: `file_a_${runId}`,
        fileUrl: `/uploads/file_a_${runId}.txt`,
        eventType: 'download',
        workspaceId: ids.workspaceA
      }
    });
    const analytics = await api(
      baseUrl,
      adminAJar,
      'GET',
      `/api/analytics/files?workspaceId=${encodeURIComponent(ids.workspaceA)}`
    );
    const totalsByType = Object.fromEntries((analytics.totalsByType || []).map((row) => [row.type, Number(row.count || 0)]));
    assert.ok(totalsByType.view >= 1, 'same-workspace file analytics should include view events');
    assert.ok(totalsByType.download >= 1, 'same-workspace file analytics should include download events');

    await api(baseUrl, studentAJar, 'GET', `/api/file-stats?workspaceId=${encodeURIComponent(ids.workspaceB)}&url=${encodeURIComponent(`/uploads/file_a_${runId}.txt`)}`, { expectedStatus: 403 })
      .then((body) => assert.equal(body.code, 'tenant_forbidden'));
    await api(baseUrl, studentAJar, 'POST', '/api/file-stats/increment', {
      expectedStatus: 403,
      json: { fileUrl: `/uploads/file_a_${runId}.txt`, type: 'download', workspaceId: ids.workspaceB }
    }).then((body) => assert.equal(body.code, 'tenant_forbidden'));
    await api(baseUrl, studentAJar, 'POST', '/api/file-events', {
      expectedStatus: 403,
      json: { fileId: `file_a_${runId}`, eventType: 'view', workspaceId: ids.workspaceB }
    }).then((body) => assert.equal(body.code, 'tenant_forbidden'));
    await api(baseUrl, adminAJar, 'GET', `/api/analytics/files?workspaceId=${encodeURIComponent(ids.workspaceB)}`, { expectedStatus: 403 })
      .then((body) => assert.equal(body.code, 'tenant_forbidden'));
    await api(baseUrl, studentAJar, 'GET', `/api/file-stats?url=${encodeURIComponent(`/uploads/file_b_${runId}.txt`)}`, { expectedStatus: 403 })
      .then((body) => assert.equal(body.code, 'tenant_forbidden'));
    await api(baseUrl, studentAJar, 'POST', '/api/file-stats/increment', {
      expectedStatus: 403,
      json: { fileUrl: `/uploads/file_b_${runId}.txt`, type: 'view' }
    }).then((body) => assert.equal(body.code, 'tenant_forbidden'));
    await api(baseUrl, studentAJar, 'POST', '/api/file-events', {
      expectedStatus: 403,
      json: { fileId: `file_b_${runId}`, eventType: 'download' }
    }).then((body) => assert.equal(body.code, 'tenant_forbidden'));

    await api(baseUrl, studentAJar, 'GET', '/api/admin/workspaces', { expectedStatus: 403 });
    await api(baseUrl, teacherAJar, 'GET', '/api/admin/workspaces', { expectedStatus: 403 });

    await api(baseUrl, superJar, 'GET', `/api/channels/${ids.channelB}/messages`, { expectedStatus: 403 })
      .then((body) => assert.equal(body.code, 'tenant_forbidden'));
    await api(baseUrl, superJar, 'GET', `/api/dms/${ids.dmB}/messages`, { expectedStatus: 403 })
      .then((body) => assert.equal(body.code, 'tenant_forbidden'));

    console.log('[tenant-isolation-smoke] passed');
  } finally {
    await stopServer(child);
    fs.rmSync(uploadsDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error('[tenant-isolation-smoke] failed:', err && err.stack ? err.stack : err);
  process.exit(1);
});
