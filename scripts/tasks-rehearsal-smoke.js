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
  console.error('Usage: node scripts/tasks-rehearsal-smoke.js [sqlite|postgres]');
  process.exit(1);
}

if (typeof fetch !== 'function') {
  console.error('Global fetch is not available in this Node runtime.');
  process.exit(1);
}

const runId = `smoke_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
const port = 3400 + Math.floor(Math.random() * 200);
const csrfToken = `csrf_${runId}`;
const sqlitePath = path.join(os.tmpdir(), `${runId}.sqlite`);

const ids = {
  workspaceId: `ws_${runId}`,
  teacherId: `teacher_${runId}`,
  studentId: `student_${runId}`,
  classChannelId: `class_${runId}`,
  homeworkChannelId: `hw_${runId}`,
  taskChannelId: `task_${runId}`
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
    } catch (_err) {
      // retry
    }
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
  `).run(ids.workspaceId, 'Tasks Rehearsal Workspace');

  const userStmt = db.prepare(`
    INSERT INTO users
    (id, workspace_id, first_name, last_name, name, email, username, role, status, native_language, native_language_confirmed, created_at)
    VALUES (?, ?, '', '', ?, ?, ?, ?, 'active', 'en', 1, datetime('now'))
  `);
  userStmt.run(ids.teacherId, ids.workspaceId, 'Teacher Smoke', `teacher.${runId}@example.com`, `teacher_${runId}`, 'teacher');
  userStmt.run(ids.studentId, ids.workspaceId, 'Student Smoke', `student.${runId}@example.com`, `student_${runId}`, 'student');

  const channelStmt = db.prepare(`
    INSERT INTO channels (id, workspace_id, name, topic, category, created_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
  `);
  channelStmt.run(ids.classChannelId, ids.workspaceId, 'A1 Smoke Class', '', 'classes');
  channelStmt.run(ids.homeworkChannelId, ids.workspaceId, 'A1 Smoke Homework', `homework_for:${ids.classChannelId}`, 'homework');
  channelStmt.run(ids.taskChannelId, ids.workspaceId, 'Teachers Task', 'Teacher task list', 'tasks');

  const memberStmt = db.prepare(`
    INSERT INTO channel_members (channel_id, user_id)
    VALUES (?, ?)
  `);
  memberStmt.run(ids.classChannelId, ids.teacherId);
  memberStmt.run(ids.classChannelId, ids.studentId);
  memberStmt.run(ids.homeworkChannelId, ids.teacherId);
  memberStmt.run(ids.homeworkChannelId, ids.studentId);

  db.close();
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

  await pool.query(`DELETE FROM task_reactions WHERE workspace_id = $1`, [ids.workspaceId]);
  await pool.query(`DELETE FROM task_comments WHERE workspace_id = $1`, [ids.workspaceId]);
  await pool.query(`DELETE FROM homework_submission_comments WHERE workspace_id = $1`, [ids.workspaceId]);
  await pool.query(`DELETE FROM homework_submission_files WHERE workspace_id = $1`, [ids.workspaceId]);
  await pool.query(`DELETE FROM homework_submissions WHERE workspace_id = $1`, [ids.workspaceId]);
  await pool.query(`DELETE FROM homework_item_files WHERE workspace_id = $1`, [ids.workspaceId]);
  await pool.query(`DELETE FROM homework_completions WHERE homework_id IN (SELECT id FROM homework_items WHERE workspace_id = $1)`, [ids.workspaceId]);
  await pool.query(`DELETE FROM homework_items WHERE workspace_id = $1`, [ids.workspaceId]);
  await pool.query(`DELETE FROM tasks WHERE workspace_id = $1`, [ids.workspaceId]);
  await pool.query(`DELETE FROM files_registry WHERE workspace_id = $1`, [ids.workspaceId]);
  await pool.query(`DELETE FROM channel_members WHERE channel_id IN ($1, $2, $3)`, [ids.classChannelId, ids.homeworkChannelId, ids.taskChannelId]);
  await pool.query(`DELETE FROM channels WHERE id IN ($1, $2, $3)`, [ids.classChannelId, ids.homeworkChannelId, ids.taskChannelId]);
  await pool.query(`DELETE FROM users WHERE id IN ($1, $2)`, [ids.teacherId, ids.studentId]);
  await pool.query(`DELETE FROM workspaces WHERE id = $1`, [ids.workspaceId]);

  await pool.query(`
    INSERT INTO workspaces (id, name)
    VALUES ($1, $2)
  `, [ids.workspaceId, 'Tasks Rehearsal Workspace']);

  await pool.query(`
    INSERT INTO users (id, workspace_id, name, email, username, role, status)
    VALUES
      ($1, $3, $5, $7, $9, 'teacher', 'active'),
      ($2, $4, $6, $8, $10, 'student', 'active')
  `, [
    ids.teacherId,
    ids.studentId,
    ids.workspaceId,
    ids.workspaceId,
    'Teacher Smoke',
    'Student Smoke',
    `teacher.${runId}@example.com`,
    `student.${runId}@example.com`,
    `teacher_${runId}`,
    `student_${runId}`
  ]);

  await pool.query(`
    INSERT INTO channels (id, workspace_id, name, topic, category)
    VALUES
      ($1, $4, 'A1 Smoke Class', '', 'classes'),
      ($2, $4, 'A1 Smoke Homework', $5, 'homework'),
      ($3, $4, 'Teachers Task', 'Teacher task list', 'tasks')
  `, [ids.classChannelId, ids.homeworkChannelId, ids.taskChannelId, ids.workspaceId, `homework_for:${ids.classChannelId}`]);

  await pool.query(`
    INSERT INTO channel_members (channel_id, user_id)
    VALUES
      ($1, $3),
      ($1, $4),
      ($2, $3),
      ($2, $4)
  `, [ids.classChannelId, ids.homeworkChannelId, ids.teacherId, ids.studentId]);
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
    if (await canConnectPostgres(candidate)) {
      return candidate;
    }
  }
  throw new Error('No working local PostgreSQL connection config was found for the rehearsal');
}

async function api(baseUrl, method, route, token, body) {
  const headers = { Authorization: `Bearer ${token}` };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    headers['x-csrf-token'] = csrfToken;
  }
  const res = await fetch(`${baseUrl}${route}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    redirect: 'manual',
    headers: {
      ...headers,
      Cookie: `csrf_token=${csrfToken}`
    }
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
      TASKS_DB_ENGINE: engine,
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
    const studentToken = authToken({
      id: ids.studentId,
      role: 'student',
      workspaceId: ids.workspaceId,
      email: `student.${runId}@example.com`,
      name: 'Student Smoke'
    });

    const tasksList0 = await api(baseUrl, 'GET', `/api/tasks?channelId=${encodeURIComponent(ids.taskChannelId)}`, teacherToken);
    assert(Array.isArray(tasksList0.tasks), 'tasks list should return an array');

    const createdTask = await api(baseUrl, 'POST', '/api/tasks', teacherToken, {
      channelId: ids.taskChannelId,
      title: 'Prepare lesson pack',
      description: 'Create worksheets',
      priority: 'high'
    });
    assert(createdTask.task && createdTask.task.id, 'task create should return task');

    const updatedTask = await api(baseUrl, 'PATCH', `/api/tasks/${encodeURIComponent(createdTask.task.id)}`, teacherToken, {
      status: 'doing',
      assignedTo: ids.teacherId
    });
    assert.strictEqual(updatedTask.task.status, 'doing');
    assert.strictEqual(updatedTask.task.assignedTo, ids.teacherId);

    const taskComment = await api(baseUrl, 'POST', `/api/tasks/${encodeURIComponent(createdTask.task.id)}/comments`, teacherToken, {
      body: 'Started drafting.'
    });
    assert(taskComment.comment && taskComment.comment.id, 'task comment should return comment');

    const taskComments = await api(baseUrl, 'GET', `/api/tasks/${encodeURIComponent(createdTask.task.id)}/comments`, teacherToken);
    assert(Array.isArray(taskComments.comments) && taskComments.comments.length === 1);

    const toggledReaction = await api(baseUrl, 'POST', '/api/task-reactions/toggle', teacherToken, {
      targetType: 'task',
      targetId: createdTask.task.id,
      emoji: '👍'
    });
    assert.strictEqual(typeof toggledReaction.on, 'boolean');

    const board0 = await api(baseUrl, 'GET', `/api/homework/channels/${encodeURIComponent(ids.homeworkChannelId)}/board`, teacherToken);
    assert(Array.isArray(board0.items), 'homework board should return items');

    const createdItem = await api(baseUrl, 'POST', `/api/homework/channels/${encodeURIComponent(ids.homeworkChannelId)}/items`, teacherToken, {
      title: 'Worksheet 1',
      description: 'Complete pages 1-2',
      dueDate: '2099-01-01',
      files: [
        {
          url: `https://example.com/${runId}/worksheet.pdf`,
          fileName: 'worksheet.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 1234
        }
      ]
    });
    assert(createdItem.item && createdItem.item.id, 'homework create should return item');

    await api(baseUrl, 'PATCH', `/api/homework/items/${encodeURIComponent(createdItem.item.id)}`, teacherToken, {
      title: 'Worksheet 1 archived',
      isArchived: true
    });
    const boardAfterArchive = await api(baseUrl, 'GET', `/api/homework/channels/${encodeURIComponent(ids.homeworkChannelId)}/board`, teacherToken);
    assert(!boardAfterArchive.items.find((item) => item.id === createdItem.item.id), 'archived item should disappear from board');

    const submitItem = await api(baseUrl, 'POST', `/api/homework/channels/${encodeURIComponent(ids.homeworkChannelId)}/items`, teacherToken, {
      title: 'Essay Assignment',
      description: 'Write 150 words',
      dueDate: '2099-01-02',
      files: [
        {
          url: `https://example.com/${runId}/prompt.pdf`,
          fileName: 'prompt.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 2222
        }
      ]
    });
    assert(submitItem.item && submitItem.item.id, 'second homework item should be created');

    const submission = await api(baseUrl, 'POST', `/api/homework/items/${encodeURIComponent(submitItem.item.id)}/submissions`, studentToken, {
      status: 'submitted',
      submissionText: 'My answer',
      files: [
        {
          url: `https://example.com/${runId}/submission.docx`,
          fileName: 'submission.docx',
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          sizeBytes: 3333
        }
      ]
    });
    assert(submission.submission && submission.submission.id, 'submission flow should return submission');

    const reviewed = await api(baseUrl, 'POST', `/api/homework/submissions/${encodeURIComponent(submission.submission.id)}/review`, teacherToken, {
      status: 'reviewed',
      feedbackText: 'Good work',
      gradeValue: 'A'
    });
    assert(reviewed.submission && reviewed.submission.status === 'reviewed', 'review should return reviewed submission');

    const commented = await api(baseUrl, 'POST', `/api/homework/submissions/${encodeURIComponent(submission.submission.id)}/comments`, studentToken, {
      commentText: 'Thanks'
    });
    assert(commented.submission && Array.isArray(commented.submission.comments), 'student comment should be reflected');

    const deleted = await api(baseUrl, 'DELETE', `/api/homework/items/${encodeURIComponent(submitItem.item.id)}`, teacherToken, {});
    assert.strictEqual(deleted.ok, true);

    console.log(`[Smoke] ${engine} rehearsal passed`);

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
