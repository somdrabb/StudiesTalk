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
  console.error('Usage: node scripts/attendance-rehearsal-smoke.js [sqlite|postgres]');
  process.exit(1);
}

const runId = `attendance_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
const port = 3600 + Math.floor(Math.random() * 200);
const csrfToken = `csrf_${runId}`;
const sqlitePath = path.join(os.tmpdir(), `${runId}.sqlite`);

const ids = {
  workspaceId: `ws_${runId}`,
  teacherId: `teacher_${runId}`,
  adminId: `admin_${runId}`,
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
      name: user.name
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
    INSERT INTO workspaces (id, name, created_at)
    VALUES (?, ?, datetime('now'))
  `).run(ids.workspaceId, 'Attendance Rehearsal Workspace');

  const userStmt = db.prepare(`
    INSERT INTO users
    (id, workspace_id, first_name, last_name, name, email, username, role, status, native_language, native_language_confirmed, created_at)
    VALUES (?, ?, '', '', ?, ?, ?, ?, 'active', 'en', 1, datetime('now'))
  `);
  userStmt.run(ids.teacherId, ids.workspaceId, 'Teacher Smoke', `teacher.${runId}@example.com`, `teacher_${runId}`, 'teacher');
  userStmt.run(ids.adminId, ids.workspaceId, 'Admin Smoke', `admin.${runId}@example.com`, `admin_${runId}`, 'school_admin');
  userStmt.run(ids.studentId, ids.workspaceId, 'Student Smoke', `student.${runId}@example.com`, `student_${runId}`, 'student');

  db.prepare(`
    INSERT INTO channels (id, workspace_id, name, topic, category, created_at)
    VALUES (?, ?, ?, '', 'classes', datetime('now'))
  `).run(ids.classChannelId, ids.workspaceId, 'A1 Attendance Class');

  const memberStmt = db.prepare(`
    INSERT INTO channel_members (channel_id, user_id)
    VALUES (?, ?)
  `);
  memberStmt.run(ids.classChannelId, ids.teacherId);
  memberStmt.run(ids.classChannelId, ids.adminId);
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
  throw new Error('No working local PostgreSQL connection config was found for attendance rehearsal');
}

async function applyPostgresSchema(pool) {
  const schemaDir = path.join(process.cwd(), 'db', 'schema', 'pg');
  if (fs.existsSync(schemaDir)) {
    const files = fs.readdirSync(schemaDir).filter((name) => /^\d+_.*\.sql$/i.test(name)).sort();
    for (const file of files) {
      const schemaSql = fs.readFileSync(path.join(schemaDir, file), 'utf8');
      await pool.query(schemaSql);
    }
    return;
  }
  const schemaSql = fs.readFileSync(path.join(process.cwd(), 'db/schema/postgres-core.sql'), 'utf8');
  await pool.query(schemaSql);
}

async function seedPostgres(pool) {
  await applyPostgresSchema(pool);

  await pool.query(`DELETE FROM attendance_notifications WHERE workspace_id = $1`, [ids.workspaceId]);
  await pool.query(`DELETE FROM attendance_records WHERE workspace_id = $1`, [ids.workspaceId]);
  await pool.query(`DELETE FROM attendance_sessions WHERE workspace_id = $1`, [ids.workspaceId]);
  await pool.query(`DELETE FROM channel_members WHERE channel_id = $1`, [ids.classChannelId]);
  await pool.query(`DELETE FROM channels WHERE id = $1`, [ids.classChannelId]);
  await pool.query(`DELETE FROM users WHERE id IN ($1, $2, $3)`, [ids.teacherId, ids.adminId, ids.studentId]);
  await pool.query(`DELETE FROM workspaces WHERE id = $1`, [ids.workspaceId]);

  await pool.query(`INSERT INTO workspaces (id, name) VALUES ($1, $2)`, [ids.workspaceId, 'Attendance Rehearsal Workspace']);
  await pool.query(`
    INSERT INTO users (id, workspace_id, name, email, username, role, status)
    VALUES
      ($1, $4, 'Teacher Smoke', $5, $8, 'teacher', 'active'),
      ($2, $4, 'Admin Smoke', $6, $9, 'school_admin', 'active'),
      ($3, $4, 'Student Smoke', $7, $10, 'student', 'active')
  `, [
    ids.teacherId,
    ids.adminId,
    ids.studentId,
    ids.workspaceId,
    `teacher.${runId}@example.com`,
    `admin.${runId}@example.com`,
    `student.${runId}@example.com`,
    `teacher_${runId}`,
    `admin_${runId}`,
    `student_${runId}`
  ]);
  await pool.query(`
    INSERT INTO channels (id, workspace_id, name, topic, category)
    VALUES ($1, $2, 'A1 Attendance Class', '', 'classes')
  `, [ids.classChannelId, ids.workspaceId]);
}

async function api(baseUrl, method, route, token, body) {
  const headers = { Authorization: `Bearer ${token}` };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    headers['x-csrf-token'] = csrfToken;
  }
  const res = await fetch(`${baseUrl}${route}`, {
    method,
    headers: {
      ...headers,
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
      ATTENDANCE_DB_ENGINE: engine,
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

    const teacherToken = authToken({
      id: ids.teacherId,
      role: 'teacher',
      workspaceId: ids.workspaceId,
      email: `teacher.${runId}@example.com`,
      name: 'Teacher Smoke'
    });
    const adminToken = authToken({
      id: ids.adminId,
      role: 'school_admin',
      workspaceId: ids.workspaceId,
      email: `admin.${runId}@example.com`,
      name: 'Admin Smoke'
    });

    const teacherList0 = await api(baseUrl, 'GET', `/api/classes/${encodeURIComponent(ids.classChannelId)}/attendance?date=2099-01-10`, teacherToken);
    assert(Array.isArray(teacherList0.records), 'teacher attendance list should return records');
    assert.strictEqual(teacherList0.records.length, 1, 'roster should include one student');

    const adminList0 = await api(baseUrl, 'GET', `/api/classes/${encodeURIComponent(ids.classChannelId)}/attendance?date=2099-01-10`, adminToken);
    assert(Array.isArray(adminList0.records), 'admin attendance list should return records');

    const savedPresent = await api(baseUrl, 'POST', `/api/classes/${encodeURIComponent(ids.classChannelId)}/attendance/save`, teacherToken, {
      date: '2099-01-10',
      send_absence_emails: false,
      records: [
        { student_user_id: ids.studentId, status: 'present' }
      ]
    });
    assert.strictEqual(savedPresent.ok, true);
    assert.strictEqual(savedPresent.absentees_count, 0);

    const afterPresent = await api(baseUrl, 'GET', `/api/classes/${encodeURIComponent(ids.classChannelId)}/attendance?date=2099-01-10`, teacherToken);
    assert.strictEqual(afterPresent.records[0].status, 'present');

    const savedAbsent = await api(baseUrl, 'POST', `/api/classes/${encodeURIComponent(ids.classChannelId)}/attendance/save`, teacherToken, {
      date: '2099-01-10',
      send_absence_emails: false,
      records: [
        { student_user_id: ids.studentId, status: 'absent' }
      ]
    });
    assert.strictEqual(savedAbsent.ok, true);
    assert.strictEqual(savedAbsent.absentees_count, 1);

    const afterAbsent = await api(baseUrl, 'GET', `/api/classes/${encodeURIComponent(ids.classChannelId)}/attendance?date=2099-01-10`, adminToken);
    assert.strictEqual(afterAbsent.records[0].status, 'absent');

    const savedSecondSession = await api(baseUrl, 'POST', `/api/classes/${encodeURIComponent(ids.classChannelId)}/attendance/save`, teacherToken, {
      date: '2099-01-11',
      send_absence_emails: false,
      records: [
        { student_user_id: ids.studentId, status: 'present' }
      ]
    });
    assert.strictEqual(savedSecondSession.ok, true);

    const studentHistory = await api(baseUrl, 'GET', `/api/students/${encodeURIComponent(ids.studentId)}/attendance?limit=10`, teacherToken);
    assert(Array.isArray(studentHistory.records), 'student history should return records');
    assert.strictEqual(studentHistory.records.length, 2, 'student history should include both sessions');

    const presentCount = studentHistory.records.filter((row) => row.status === 'present').length;
    const absentCount = studentHistory.records.filter((row) => row.status === 'absent').length;
    assert.strictEqual(presentCount, 1);
    assert.strictEqual(absentCount, 1);

    console.log(`[Smoke] ${engine} attendance rehearsal passed`);

    if (pgPool) await pgPool.end();
    child.kill('SIGTERM');
    await sleep(500);
  } catch (err) {
    child.kill('SIGTERM');
    throw err;
  }
}

main().catch((err) => {
  console.error('[Smoke] Failed:', err && err.stack ? err.stack : err);
  process.exit(1);
});
