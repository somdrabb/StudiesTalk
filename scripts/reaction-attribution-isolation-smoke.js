#!/usr/bin/env node
'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const Database = require('better-sqlite3');

const runId = `reaction_iso_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
const port = 4720 + Math.floor(Math.random() * 100);
const sqlitePath = path.join(os.tmpdir(), `${runId}.sqlite`);
const uploadsDir = path.join(os.tmpdir(), `${runId}_uploads`);
const baseUrl = `http://127.0.0.1:${port}`;

const ids = {
  workspaceA: `ws_a_${runId}`,
  workspaceB: `ws_b_${runId}`,
  studentA: `student_a_${runId}`,
  studentA2: `student_a2_${runId}`,
  studentB: `student_b_${runId}`,
  classA: `class_a_${runId}`,
  classB: `class_b_${runId}`,
  msgA: `msg_a_${runId}`,
  msgB: `msg_b_${runId}`,
  replyA: `reply_a_${runId}`,
  dmA: `dm_a_${runId}`,
  dmB: `dm_b_${runId}`,
  dmMsgA: `dm_msg_a_${runId}`,
  dmMsgB: `dm_msg_b_${runId}`,
  dmReplyA: `dm_reply_a_${runId}`
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
    .run(ids.workspaceA, 'Reaction School A', `student.a.${runId}@example.com`);
  db.prepare(`INSERT INTO workspaces (id, name, status, admin_email, created_at) VALUES (?, ?, 'approved', ?, datetime('now'))`)
    .run(ids.workspaceB, 'Reaction School B', `student.b.${runId}@example.com`);

  [
    { id: ids.studentA, workspaceId: ids.workspaceA, email: `student.a.${runId}@example.com`, role: 'student', name: 'Student A' },
    { id: ids.studentA2, workspaceId: ids.workspaceA, email: `student.a2.${runId}@example.com`, role: 'student', name: 'Student A Two' },
    { id: ids.studentB, workspaceId: ids.workspaceB, email: `student.b.${runId}@example.com`, role: 'student', name: 'Student B' }
  ].forEach((user) => insertUser(db, { ...user, passwordHash }));

  const channelStmt = db.prepare(`INSERT INTO channels (id, workspace_id, name, topic, members, unread, category) VALUES (?, ?, ?, '', 2, 0, 'classes')`);
  channelStmt.run(ids.classA, ids.workspaceA, 'Reaction Class A');
  channelStmt.run(ids.classB, ids.workspaceB, 'Reaction Class B');
  const memberStmt = db.prepare(`INSERT INTO channel_members (channel_id, user_id) VALUES (?, ?)`);
  [ids.studentA, ids.studentA2].forEach((userId) => memberStmt.run(ids.classA, userId));
  memberStmt.run(ids.classB, ids.studentB);

  const msgStmt = db.prepare(`
    INSERT INTO messages (id, channel_id, author, initials, avatar_url, time, text, alt, created_at, original_language)
    VALUES (?, ?, ?, ?, NULL, ?, ?, 0, ?, 'en')
  `);
  msgStmt.run(ids.msgA, ids.classA, 'Student A', 'SA', '10:00', 'Workspace A message', new Date().toISOString());
  msgStmt.run(ids.msgB, ids.classB, 'Student B', 'SB', '10:01', 'Workspace B message', new Date().toISOString());
  db.prepare(`
    INSERT INTO replies (id, message_id, author, initials, avatar_url, time, text, created_at)
    VALUES (?, ?, 'Student A', 'SA', NULL, '10:02', 'Workspace A reply', ?)
  `).run(ids.replyA, ids.msgA, new Date().toISOString());

  db.prepare(`INSERT INTO dms (id, name, initials, online, created_by) VALUES (?, ?, ?, 0, ?)`)
    .run(ids.dmA, 'DM A', 'DA', ids.studentA);
  db.prepare(`INSERT INTO dms (id, name, initials, online, created_by) VALUES (?, ?, ?, 0, ?)`)
    .run(ids.dmB, 'DM B', 'DB', ids.studentB);
  [ids.studentA, ids.studentA2].forEach((userId) => db.prepare(`INSERT INTO dm_members (dm_id, user_id) VALUES (?, ?)`).run(ids.dmA, userId));
  db.prepare(`INSERT INTO dm_members (dm_id, user_id) VALUES (?, ?)`).run(ids.dmB, ids.studentB);
  db.prepare(`INSERT INTO dm_messages (id, dm_id, author, initials, time, text) VALUES (?, ?, 'Student A', 'SA', '10:03', 'DM A message')`)
    .run(ids.dmMsgA, ids.dmA);
  db.prepare(`INSERT INTO dm_messages (id, dm_id, author, initials, time, text) VALUES (?, ?, 'Student B', 'SB', '10:04', 'DM B message')`)
    .run(ids.dmMsgB, ids.dmB);
  db.prepare(`
    INSERT INTO dm_replies (id, dm_message_id, author, initials, avatar_url, time, text, created_at)
    VALUES (?, ?, 'Student A', 'SA', NULL, '10:05', 'DM reply A', ?)
  `).run(ids.dmReplyA, ids.dmMsgA, new Date().toISOString());

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

function openDbReadonly() {
  return new Database(sqlitePath, { readonly: true, fileMustExist: true });
}

function reactionUsers(table, idColumn, idValue, emoji) {
  const db = openDbReadonly();
  try {
    return db.prepare(`SELECT user_id FROM ${table} WHERE ${idColumn} = ? AND emoji = ? ORDER BY user_id`).all(idValue, emoji).map((row) => row.user_id);
  } finally {
    db.close();
  }
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

    const studentAJar = await login(`student.a.${runId}@example.com`);
    const studentA2Jar = await login(`student.a2.${runId}@example.com`);
    await acceptWorkspacePolicy(studentAJar, ids.workspaceA);
    await acceptWorkspacePolicy(studentA2Jar, ids.workspaceA);

    const anonymousJar = {};
    await api(anonymousJar, 'GET', '/api/auth/csrf');
    await api(anonymousJar, 'POST', `/api/messages/${encodeURIComponent(ids.msgA)}/reactions`, {
      json: { emoji: '👍' },
      expectedStatus: 401
    });

    await api(studentA2Jar, 'POST', `/api/messages/${encodeURIComponent(ids.msgA)}/reactions`, {
      json: { emoji: '👍' }
    });
    assert.deepStrictEqual(reactionUsers('message_reaction_users', 'message_id', ids.msgA, '👍'), [ids.studentA2]);

    await api(studentAJar, 'POST', `/api/messages/${encodeURIComponent(ids.msgA)}/reactions`, {
      json: { emoji: '👍', userId: ids.studentA2 }
    });
    assert.deepStrictEqual(reactionUsers('message_reaction_users', 'message_id', ids.msgA, '👍'), [ids.studentA, ids.studentA2].sort());

    await api(studentAJar, 'POST', `/api/messages/${encodeURIComponent(ids.msgA)}/reactions`, {
      json: { emoji: '👍', userId: ids.studentA2 }
    });
    assert.deepStrictEqual(reactionUsers('message_reaction_users', 'message_id', ids.msgA, '👍'), [ids.studentA2], 'body.userId must not remove another user reaction');

    await api(studentAJar, 'POST', `/api/messages/${encodeURIComponent(ids.msgB)}/reactions`, {
      json: { emoji: '🔥', userId: ids.studentB },
      expectedStatus: 403
    });
    assert.deepStrictEqual(reactionUsers('message_reaction_users', 'message_id', ids.msgB, '🔥'), []);

    await api(studentAJar, 'POST', `/api/replies/${encodeURIComponent(ids.replyA)}/reactions`, {
      json: { emoji: '✅', userId: ids.studentA2 }
    });
    assert.deepStrictEqual(reactionUsers('reply_reaction_users', 'reply_id', ids.replyA, '✅'), [ids.studentA]);

    await api(studentAJar, 'POST', `/api/dms/${encodeURIComponent(ids.dmB)}/messages/${encodeURIComponent(ids.dmMsgB)}/reactions`, {
      json: { emoji: '👀', userId: ids.studentB },
      expectedStatus: 403
    });
    assert.deepStrictEqual(reactionUsers('dm_message_reaction_users', 'message_id', ids.dmMsgB, '👀'), []);

    await api(studentA2Jar, 'POST', `/api/dms/${encodeURIComponent(ids.dmA)}/messages/${encodeURIComponent(ids.dmMsgA)}/reactions`, {
      json: { emoji: '💬' }
    });
    await api(studentAJar, 'POST', `/api/dms/${encodeURIComponent(ids.dmA)}/messages/${encodeURIComponent(ids.dmMsgA)}/reactions`, {
      json: { emoji: '💬', userId: ids.studentA2 }
    });
    assert.deepStrictEqual(reactionUsers('dm_message_reaction_users', 'message_id', ids.dmMsgA, '💬'), [ids.studentA, ids.studentA2].sort());
    await api(studentAJar, 'POST', `/api/dms/${encodeURIComponent(ids.dmA)}/messages/${encodeURIComponent(ids.dmMsgA)}/reactions`, {
      json: { emoji: '💬', userId: ids.studentA2 }
    });
    assert.deepStrictEqual(reactionUsers('dm_message_reaction_users', 'message_id', ids.dmMsgA, '💬'), [ids.studentA2], 'body.userId must not remove another DM reaction');

    await api(studentAJar, 'POST', `/api/dm-replies/${encodeURIComponent(ids.dmReplyA)}/reactions`, {
      json: { emoji: '↩️', userId: ids.studentA2 }
    });
    assert.deepStrictEqual(reactionUsers('dm_reply_reaction_users', 'reply_id', ids.dmReplyA, '↩️'), [ids.studentA]);

    console.log('[reaction-attribution-isolation-smoke] passed');
  } finally {
    await stopServer(child);
    fs.rmSync(uploadsDir, { recursive: true, force: true });
    if (fs.existsSync(sqlitePath)) fs.unlinkSync(sqlitePath);
  }
}

main().catch((err) => {
  console.error('[reaction-attribution-isolation-smoke] failed:', err && err.stack ? err.stack : err);
  process.exit(1);
});
