#!/usr/bin/env node
'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const Database = require('better-sqlite3');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const ENV = require('../server/env');

const engine = String(process.argv[2] || 'sqlite').trim().toLowerCase();
if (!['sqlite', 'postgres'].includes(engine)) {
  console.error('Usage: node scripts/runtime-domain-smoke.js [sqlite|postgres]');
  process.exit(1);
}

const runId = `runtime_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
const port = 3800 + Math.floor(Math.random() * 200);
const csrfToken = `csrf_${runId}`;
const sqlitePath = path.join(os.tmpdir(), `${runId}.sqlite`);

const ids = {
  workspaceId: `ws_${runId}`,
  superAdminId: `super_${runId}`,
  adminId: `admin_${runId}`,
  teacherId: `teacher_${runId}`,
  studentId: `student_${runId}`,
  classChannelId: `class_${runId}`
};

function authToken(user) {
  return jwt.sign(
    {
      jti: `at_${crypto.randomBytes(8).toString('hex')}`,
      sub: user.id,
      role: String(user.role || '').toLowerCase(),
      workspaceId: user.workspaceId,
      email: user.email,
      name: user.name,
      superAdmin: user.superAdmin ? 1 : 0
    },
    ENV.JWT_ACCESS_SECRET,
    { expiresIn: '15m' }
  );
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function createSqliteSeed(dbPath) {
  const db = new Database(dbPath);
  db.pragma('foreign_keys = ON');

  db.prepare(`
    INSERT INTO workspaces (id, name, status, admin_email, created_at)
    VALUES (?, ?, 'approved', ?, datetime('now'))
  `).run(ids.workspaceId, 'Runtime Rehearsal Workspace', `admin.${runId}@example.com`);

  const userStmt = db.prepare(`
    INSERT INTO users
    (id, workspace_id, first_name, last_name, name, email, username, role, status, native_language, native_language_confirmed, created_at)
    VALUES (?, ?, '', '', ?, ?, ?, ?, 'active', 'en', 1, datetime('now'))
  `);
  userStmt.run(ids.superAdminId, ids.workspaceId, 'Super Admin', `super.${runId}@example.com`, `super_${runId}`, 'super_admin');
  userStmt.run(ids.adminId, ids.workspaceId, 'School Admin', `admin.${runId}@example.com`, `admin_${runId}`, 'school_admin');
  userStmt.run(ids.teacherId, ids.workspaceId, 'Teacher User', `teacher.${runId}@example.com`, `teacher_${runId}`, 'teacher');
  userStmt.run(ids.studentId, ids.workspaceId, 'Student User', `student.${runId}@example.com`, `student_${runId}`, 'student');

  db.prepare(`
    INSERT INTO channels (id, workspace_id, name, topic, members, unread, category, created_at)
    VALUES (?, ?, ?, '', 3, 0, 'classes', datetime('now'))
  `).run(ids.classChannelId, ids.workspaceId, 'Runtime Class');

  const memberStmt = db.prepare(`
    INSERT INTO channel_members (channel_id, user_id)
    VALUES (?, ?)
  `);
  memberStmt.run(ids.classChannelId, ids.adminId);
  memberStmt.run(ids.classChannelId, ids.teacherId);
  memberStmt.run(ids.classChannelId, ids.studentId);
  db.close();
}

async function canConnectPostgres(config) {
  const pool = new Pool(config);
  try {
    await pool.query('select 1');
    return true;
  } catch (_err) {
    return false;
  } finally {
    await pool.end().catch(() => {});
  }
}

async function resolvePostgresConfig() {
  const candidates = [];
  if (ENV.DATABASE_URL) {
    candidates.push({
      connectionString: ENV.DATABASE_URL,
      ssl: ENV.PGSSL ? { rejectUnauthorized: false } : undefined
    });
  }
  candidates.push({
    host: ENV.PGHOST,
    port: ENV.PGPORT ? Number(ENV.PGPORT) : undefined,
    database: ENV.PGDATABASE,
    user: ENV.PGUSER,
    password: ENV.PGPASSWORD,
    ssl: ENV.PGSSL ? { rejectUnauthorized: false } : undefined
  });
  candidates.push({
    host: 'localhost',
    port: 5432,
    database: 'postgres',
    user: process.env.USER,
    ssl: undefined
  });

  for (const candidate of candidates) {
    if (await canConnectPostgres(candidate)) return candidate;
  }
  throw new Error('No working local PostgreSQL connection config was found for runtime rehearsal');
}

async function applyPostgresSchema(pool) {
  const schemaDir = path.join(process.cwd(), 'db', 'schema', 'pg');
  if (fs.existsSync(schemaDir)) {
    const files = fs.readdirSync(schemaDir).filter((name) => /^\d+_.*\.sql$/i.test(name)).sort();
    for (const file of files) {
      await pool.query(fs.readFileSync(path.join(schemaDir, file), 'utf8'));
    }
    return;
  }
  await pool.query(fs.readFileSync(path.join(process.cwd(), 'db', 'schema', 'postgres-core.sql'), 'utf8'));
}

async function seedPostgres(pool) {
  await applyPostgresSchema(pool);

  await pool.query(`DELETE FROM reply_reaction_users WHERE reply_id IN (SELECT id FROM replies WHERE message_id IN (SELECT id FROM messages WHERE channel_id = $1))`, [ids.classChannelId]);
  await pool.query(`DELETE FROM reply_reactions WHERE reply_id IN (SELECT id FROM replies WHERE message_id IN (SELECT id FROM messages WHERE channel_id = $1))`, [ids.classChannelId]);
  await pool.query(`DELETE FROM replies WHERE message_id IN (SELECT id FROM messages WHERE channel_id = $1)`, [ids.classChannelId]);
  await pool.query(`DELETE FROM message_reaction_users WHERE message_id IN (SELECT id FROM messages WHERE channel_id = $1)`, [ids.classChannelId]);
  await pool.query(`DELETE FROM message_reactions WHERE message_id IN (SELECT id FROM messages WHERE channel_id = $1)`, [ids.classChannelId]);
  await pool.query(`DELETE FROM files_registry WHERE channel_id = $1`, [ids.classChannelId]);
  await pool.query(`DELETE FROM messages WHERE channel_id = $1`, [ids.classChannelId]);
  await pool.query(`DELETE FROM channel_members WHERE channel_id = $1`, [ids.classChannelId]);
  await pool.query(`DELETE FROM channels WHERE id = $1`, [ids.classChannelId]);
  await pool.query(`DELETE FROM users WHERE id IN ($1, $2, $3, $4)`, [ids.superAdminId, ids.adminId, ids.teacherId, ids.studentId]);
  await pool.query(`DELETE FROM workspaces WHERE id = $1`, [ids.workspaceId]);

  await pool.query(`
    INSERT INTO workspaces (id, name, status, admin_email)
    VALUES ($1, $2, 'approved', $3)
  `, [ids.workspaceId, 'Runtime Rehearsal Workspace', `admin.${runId}@example.com`]);

  await pool.query(`
    INSERT INTO users (id, workspace_id, name, email, username, role, status)
    VALUES
      ($1, $5, 'Super Admin', $6, $10, 'super_admin', 'active'),
      ($2, $5, 'School Admin', $7, $11, 'school_admin', 'active'),
      ($3, $5, 'Teacher User', $8, $12, 'teacher', 'active'),
      ($4, $5, 'Student User', $9, $13, 'student', 'active')
  `, [
    ids.superAdminId,
    ids.adminId,
    ids.teacherId,
    ids.studentId,
    ids.workspaceId,
    `super.${runId}@example.com`,
    `admin.${runId}@example.com`,
    `teacher.${runId}@example.com`,
    `student.${runId}@example.com`,
    `super_${runId}`,
    `admin_${runId}`,
    `teacher_${runId}`,
    `student_${runId}`
  ]);

  await pool.query(`
    INSERT INTO channels (id, workspace_id, name, topic, members, unread, category)
    VALUES ($1, $2, 'Runtime Class', '', 3, 0, 'classes')
  `, [ids.classChannelId, ids.workspaceId]);

  await pool.query(`
    INSERT INTO channel_members (channel_id, user_id)
    VALUES
      ($1, $2),
      ($1, $3),
      ($1, $4)
  `, [ids.classChannelId, ids.adminId, ids.teacherId, ids.studentId]);
}

async function api(baseUrl, method, route, token, body, extraHeaders = {}) {
  const headers = {
    Authorization: `Bearer ${token}`
  };
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(String(method || '').toUpperCase())) {
    headers['x-csrf-token'] = csrfToken;
  }
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(`${baseUrl}${route}`, {
    method,
    headers: {
      ...headers,
      ...extraHeaders,
      Cookie: `csrf_token=${csrfToken}`
    },
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (_err) {
    json = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`${method} ${route} failed: ${res.status} ${JSON.stringify(json)}`);
  }
  return json;
}

async function main() {
  if (fs.existsSync(sqlitePath)) fs.unlinkSync(sqlitePath);
  const pgConfig = engine === 'postgres' ? await resolvePostgresConfig() : null;

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
      CHANNELS_DB_ENGINE: engine,
      MESSAGES_DB_ENGINE: engine,
      DATABASE_URL: pgConfig?.connectionString || '',
      PGHOST: pgConfig?.host || '',
      PGPORT: pgConfig?.port ? String(pgConfig.port) : '',
      PGDATABASE: pgConfig?.database || '',
      PGUSER: pgConfig?.user || '',
      PGPASSWORD: pgConfig?.password || '',
      PGSSL: pgConfig?.ssl ? 'true' : 'false'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  child.stdout.on('data', (chunk) => process.stdout.write(chunk));
  child.stderr.on('data', (chunk) => process.stderr.write(chunk));

  try {
    const baseUrl = `http://127.0.0.1:${port}`;
    await waitForServer(baseUrl);
    createSqliteSeed(sqlitePath);

    let pgPool = null;
    if (engine === 'postgres') {
      pgPool = new Pool(pgConfig);
      await seedPostgres(pgPool);
    }

    const superToken = authToken({
      id: ids.superAdminId,
      role: 'super_admin',
      workspaceId: ids.workspaceId,
      email: `super.${runId}@example.com`,
      name: 'Super Admin',
      superAdmin: true
    });
    const adminToken = authToken({
      id: ids.adminId,
      role: 'school_admin',
      workspaceId: ids.workspaceId,
      email: `admin.${runId}@example.com`,
      name: 'School Admin'
    });

    const overview = await api(baseUrl, 'GET', '/api/admin/overview', superToken, undefined, { 'x-super-admin': '1' });
    assert.ok(Number(overview.schools || 0) >= 1, 'overview should include school count');

    const users = await api(baseUrl, 'GET', `/api/admin/users?workspaceId=${ids.workspaceId}`, superToken, undefined, { 'x-super-admin': '1' });
    assert.ok(Array.isArray(users) && users.length >= 4, 'admin users list should return seeded users');

    const workspaces = await api(baseUrl, 'GET', '/api/admin/workspaces', superToken, undefined, { 'x-super-admin': '1' });
    assert.ok(Array.isArray(workspaces) && workspaces.some((row) => row.id === ids.workspaceId), 'workspaces should include seeded workspace');

    await api(baseUrl, 'PUT', `/api/admin/workspace-settings/${ids.workspaceId}`, superToken, { settings: { locale: 'en', smoke: true } }, { 'x-super-admin': '1' });
    const settings = await api(baseUrl, 'GET', `/api/admin/workspace-settings/${ids.workspaceId}`, superToken, undefined, { 'x-super-admin': '1' });
    assert.equal(settings.settings.locale, 'en');

    const approvedMissing = await api(baseUrl, 'GET', '/api/admin/approved-requests-missing-workspace', superToken, undefined, { 'x-super-admin': '1' });
    assert.ok(Array.isArray(approvedMissing), 'approved requests response should stay array-shaped');

    const channelsBefore = await api(baseUrl, 'GET', `/api/channels?workspaceId=${ids.workspaceId}`, adminToken);
    assert.ok(Array.isArray(channelsBefore), 'channels list should be an array');

    const createdChannel = await api(baseUrl, 'POST', '/api/channels', adminToken, {
      name: 'Runtime Board',
      workspaceId: ids.workspaceId,
      category: 'classes',
      memberIds: [ids.adminId, ids.teacherId]
    });
    assert.ok(createdChannel.id, 'channel creation should return id');

    const patchedChannel = await api(baseUrl, 'PATCH', `/api/channels/${createdChannel.id}`, adminToken, {
      topic: 'updated topic',
      unread: 2
    });
    assert.equal(patchedChannel.topic, 'updated topic');

    const members = await api(baseUrl, 'GET', `/api/channels/${createdChannel.id}/members`, adminToken);
    assert.ok(Array.isArray(members.members), 'channel members response shape should stay stable');

    await api(baseUrl, 'POST', `/api/channels/${createdChannel.id}/members`, adminToken, { userId: ids.studentId });
    const membersAfterAdd = await api(baseUrl, 'GET', `/api/channels/${createdChannel.id}/members`, adminToken);
    assert.ok(membersAfterAdd.members.includes(ids.studentId), 'student should be added to channel');

    const message = await api(baseUrl, 'POST', `/api/channels/${createdChannel.id}/messages`, adminToken, {
      author: 'School Admin',
      initials: 'SA',
      text: 'Hello runtime rehearsal'
    });
    assert.ok(message.id, 'message create should return id');

    const messages = await api(baseUrl, 'GET', `/api/channels/${createdChannel.id}/messages`, adminToken);
    assert.ok(Array.isArray(messages) && messages.some((row) => row.id === message.id), 'message should appear in list');

    const edited = await api(baseUrl, 'PATCH', `/api/messages/${message.id}`, adminToken, {
      author: 'School Admin',
      text: 'Edited runtime rehearsal'
    });
    assert.equal(edited.text, 'Edited runtime rehearsal');

    const reply = await api(baseUrl, 'POST', `/api/channels/${createdChannel.id}/messages/${message.id}/replies`, adminToken, {
      author: 'School Admin',
      initials: 'SA',
      text: 'Reply runtime rehearsal'
    });
    assert.ok(reply.id, 'reply create should return id');

    const messageReactions = await api(baseUrl, 'POST', `/api/messages/${message.id}/reactions`, adminToken, {
      emoji: '👍',
      userId: ids.adminId
    });
    assert.ok(Array.isArray(messageReactions.reactions), 'message reactions should stay array-shaped');

    const replyReactions = await api(baseUrl, 'POST', `/api/replies/${reply.id}/reactions`, adminToken, {
      emoji: '✅',
      userId: ids.adminId
    });
    assert.ok(Array.isArray(replyReactions.reactions), 'reply reactions should stay array-shaped');

    await api(baseUrl, 'DELETE', `/api/channels/${createdChannel.id}/members`, adminToken, { userId: ids.studentId });
    await api(baseUrl, 'DELETE', `/api/messages/${message.id}`, adminToken, { author: 'School Admin' });
    await api(baseUrl, 'DELETE', `/api/channels/${createdChannel.id}`, adminToken);

    const auditRows = await api(baseUrl, 'GET', `/api/admin/audit?workspaceId=${ids.workspaceId}`, superToken, undefined, { 'x-super-admin': '1' });
    assert.ok(Array.isArray(auditRows), 'audit response should stay array-shaped');

    if (pgPool) await pgPool.end();
    console.log(`[runtime-domain-smoke] ${engine} rehearsal passed`);
  } finally {
    child.kill('SIGTERM');
    await sleep(500);
  }
}

main().catch((err) => {
  console.error('[runtime-domain-smoke] failed:', err && err.stack ? err.stack : err);
  process.exit(1);
});
