#!/usr/bin/env node
'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { Pool } = require('pg');

const ENV = require('../server/env');

const runId = `pg_full_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
const port = 4300 + Math.floor(Math.random() * 100);
const sqlitePath = path.join(os.tmpdir(), `${runId}.sqlite`);

const ids = {
  workspaceId: `ws_${runId}`,
  extraWorkspaceId: `ws_extra_${runId}`,
  superAdminId: `super_${runId}`,
  adminId: `admin_${runId}`,
  teacherId: `teacher_${runId}`,
  studentId: `student_${runId}`,
  classChannelId: `class_${runId}`,
  reviewWorkspaceId: `review-smoke-school-${runId.replace(/_/g, '-')}`.slice(0, 40)
};

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
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

async function api(baseUrl, jar, method, route, { json, accessToken, expectedStatus = 200, extraHeaders } = {}) {
  const headers = { ...(extraHeaders || {}) };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (cookieHeader(jar)) headers.Cookie = cookieHeader(jar);
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && !route.startsWith('/api/auth/')) {
    headers['x-csrf-token'] = jar.csrf_token || '';
  }
  if (json !== undefined) headers['Content-Type'] = 'application/json';

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

  for (const candidate of candidates) {
    if (await canConnectPostgres(candidate)) return candidate;
  }
  throw new Error('No working PostgreSQL connection config found');
}

async function applyPostgresSchema(pool) {
  const schemaDir = path.join(process.cwd(), 'db', 'schema', 'pg');
  const files = fs.readdirSync(schemaDir).filter((name) => /^\d+_.*\.sql$/i.test(name)).sort();
  for (const file of files) {
    await pool.query(fs.readFileSync(path.join(schemaDir, file), 'utf8'));
  }
}

async function seedPostgres(pool, passwords) {
  await applyPostgresSchema(pool);

  await pool.query('BEGIN');
  try {
    await pool.query(`DELETE FROM reply_reaction_users WHERE reply_id IN (SELECT id FROM replies WHERE message_id IN (SELECT id FROM messages WHERE channel_id = $1))`, [ids.classChannelId]);
    await pool.query(`DELETE FROM reply_reactions WHERE reply_id IN (SELECT id FROM replies WHERE message_id IN (SELECT id FROM messages WHERE channel_id = $1))`, [ids.classChannelId]);
    await pool.query(`DELETE FROM replies WHERE message_id IN (SELECT id FROM messages WHERE channel_id = $1)`, [ids.classChannelId]);
    await pool.query(`DELETE FROM message_reaction_users WHERE message_id IN (SELECT id FROM messages WHERE channel_id = $1)`, [ids.classChannelId]);
    await pool.query(`DELETE FROM message_reactions WHERE message_id IN (SELECT id FROM messages WHERE channel_id = $1)`, [ids.classChannelId]);
    await pool.query(`DELETE FROM task_comments WHERE task_id IN (SELECT id FROM tasks WHERE workspace_id = $1)`, [ids.workspaceId]);
    await pool.query(`DELETE FROM task_reactions WHERE workspace_id = $1`, [ids.workspaceId]);
    await pool.query(`DELETE FROM tasks WHERE workspace_id = $1`, [ids.workspaceId]);
    await pool.query(`DELETE FROM channel_members WHERE channel_id = $1`, [ids.classChannelId]);
    await pool.query(`DELETE FROM channels WHERE id = $1`, [ids.classChannelId]);
    await pool.query(`DELETE FROM password_resets WHERE user_id IN ($1, $2, $3, $4)`, [ids.superAdminId, ids.adminId, ids.teacherId, ids.studentId]);
    await pool.query(`DELETE FROM registration_links WHERE email IN ($1, $2)`, [`invite.${runId}@example.com`, `student.${runId}@example.com`]);
    await pool.query(`DELETE FROM registration_review_requests WHERE email = $1`, [`request.${runId}@example.com`]);
    await pool.query(`DELETE FROM school_requests WHERE admin_email = $1`, [`public.${runId}@example.com`]);
    await pool.query(`DELETE FROM invoices WHERE workspace_id IN ($1, $2)`, [ids.workspaceId, ids.extraWorkspaceId]);
    await pool.query(`DELETE FROM payments WHERE workspace_id IN ($1, $2)`, [ids.workspaceId, ids.extraWorkspaceId]);
    await pool.query(`DELETE FROM workspace_settings_admin WHERE workspace_id IN ($1, $2)`, [ids.workspaceId, ids.extraWorkspaceId]);
    await pool.query(`DELETE FROM workspace_billing WHERE workspace_id IN ($1, $2)`, [ids.workspaceId, ids.extraWorkspaceId]);
    await pool.query(`DELETE FROM workspace_members WHERE workspace_id IN ($1, $2)`, [ids.workspaceId, ids.extraWorkspaceId]);
    await pool.query(`DELETE FROM refresh_tokens WHERE user_id IN ($1, $2, $3, $4)`, [ids.superAdminId, ids.adminId, ids.teacherId, ids.studentId]);
    await pool.query(`DELETE FROM revoked_access_tokens WHERE user_id IN ($1, $2, $3, $4)`, [ids.superAdminId, ids.adminId, ids.teacherId, ids.studentId]);
    await pool.query(`DELETE FROM login_attempts WHERE user_id IN ($1, $2, $3, $4)`, [ids.superAdminId, ids.adminId, ids.teacherId, ids.studentId]);
    await pool.query(`DELETE FROM security_events WHERE actor_user_id IN ($1, $2, $3, $4) OR target_user_id IN ($1, $2, $3, $4)`, [ids.superAdminId, ids.adminId, ids.teacherId, ids.studentId]);
    await pool.query(`DELETE FROM audit_logs WHERE user_id IN ($1, $2, $3, $4)`, [ids.superAdminId, ids.adminId, ids.teacherId, ids.studentId]);
    await pool.query(`DELETE FROM audit_log WHERE actor IN ($1, $2, $3, $4)`, [ids.superAdminId, ids.adminId, ids.teacherId, ids.studentId]);
    await pool.query(`DELETE FROM users WHERE id IN ($1, $2, $3, $4)`, [ids.superAdminId, ids.adminId, ids.teacherId, ids.studentId]);
    await pool.query(`DELETE FROM workspaces WHERE id IN ($1, $2, $3)`, [ids.workspaceId, ids.extraWorkspaceId, ids.reviewWorkspaceId]);

    await pool.query(`
      INSERT INTO workspaces (id, name, status, admin_email)
      VALUES
        ($1, $2, 'approved', $3),
        ($4, $5, 'approved', $6)
    `, [
      ids.workspaceId,
      'Postgres Full Smoke Workspace',
      `admin.${runId}@example.com`,
      ids.extraWorkspaceId,
      'Extra Workspace',
      `extra.${runId}@example.com`
    ]);

    await pool.query(`
      INSERT INTO users (id, workspace_id, first_name, last_name, name, email, username, password_hash, role, status, native_language, native_language_confirmed)
      VALUES
        ($1, $5, 'Super', 'Admin', 'Super Admin', $6, $10, $14, 'super_admin', 'active', 'en', true),
        ($2, $5, 'School', 'Admin', 'School Admin', $7, $11, $15, 'school_admin', 'active', 'en', true),
        ($3, $5, 'Teacher', 'User', 'Teacher User', $8, $12, $16, 'teacher', 'active', 'en', true),
        ($4, $5, 'Student', 'User', 'Student User', $9, $13, $17, 'student', 'active', 'en', true)
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
      `student_${runId}`,
      passwords.superAdmin,
      passwords.admin,
      passwords.teacher,
      passwords.student
    ]);

    await pool.query(`
      INSERT INTO workspace_members (workspace_id, user_id, role)
      VALUES
        ($1, $2, 'super_admin'),
        ($1, $3, 'school_admin'),
        ($1, $4, 'teacher'),
        ($1, $5, 'student')
      ON CONFLICT DO NOTHING
    `, [ids.workspaceId, ids.superAdminId, ids.adminId, ids.teacherId, ids.studentId]);

    await pool.query(`
      INSERT INTO channels (id, workspace_id, name, topic, members, unread, category)
      VALUES ($1, $2, 'Full Smoke Class', '', 3, 0, 'classes')
    `, [ids.classChannelId, ids.workspaceId]);

    await pool.query(`
      INSERT INTO channel_members (channel_id, user_id)
      VALUES
        ($1, $2),
        ($1, $3),
        ($1, $4)
      ON CONFLICT DO NOTHING
    `, [ids.classChannelId, ids.adminId, ids.teacherId, ids.studentId]);

    await pool.query(`
      INSERT INTO workspace_billing (workspace_id, plan, status, currency, monthly_price_cents, billing_email)
      VALUES ($1, 'free', 'active', 'EUR', 0, $2)
      ON CONFLICT (workspace_id) DO NOTHING
    `, [ids.workspaceId, `admin.${runId}@example.com`]);

    await pool.query('COMMIT');
  } catch (error) {
    await pool.query('ROLLBACK');
    throw error;
  }
}

function startServer() {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: 'development',
      PORT: String(port),
      DB_ENGINE: 'postgres',
      DB_PATH: sqlitePath,
      BILLING_DB_ENGINE: 'postgres',
      TASKS_DB_ENGINE: 'postgres',
      ATTENDANCE_DB_ENGINE: 'postgres',
      CHANNELS_DB_ENGINE: 'postgres',
      MESSAGES_DB_ENGINE: 'postgres',
      EMAIL_PROVIDER: 'disabled',
      EMAIL_FROM_EMAIL: 'no-reply@example.com'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  child.stdout.on('data', (chunk) => process.stdout.write(chunk));
  child.stderr.on('data', (chunk) => process.stderr.write(chunk));
  return child;
}

async function main() {
  if (fs.existsSync(sqlitePath)) fs.unlinkSync(sqlitePath);

  const passwords = {
    superAdmin: hashPassword('SuperPass1!'),
    admin: hashPassword('AdminPass1!'),
    teacher: hashPassword('TeacherPass1!'),
    student: hashPassword('StudentPass1!')
  };

  const pgConfig = await resolvePostgresConfig();
  const pool = new Pool(pgConfig);
  let child = null;

  try {
    await seedPostgres(pool, passwords);

    child = startServer();
    const baseUrl = `http://127.0.0.1:${port}`;
    await waitForServer(baseUrl);

    const superJar = {};
    const adminJar = {};

    await api(baseUrl, superJar, 'GET', '/api/auth/csrf');
    await api(baseUrl, adminJar, 'GET', '/api/auth/csrf');

    const superLogin = await api(baseUrl, superJar, 'POST', '/api/auth/login', {
      json: { email: `super.${runId}@example.com`, password: 'SuperPass1!' }
    });
    const superToken = superLogin.accessToken;
    assert.equal(superLogin.user.role, 'super_admin');

    const adminLogin = await api(baseUrl, adminJar, 'POST', '/api/auth/login', {
      json: { email: `admin.${runId}@example.com`, password: 'AdminPass1!' }
    });
    const adminToken = adminLogin.accessToken;
    assert.equal(adminLogin.user.role, 'school_admin');

    const me = await api(baseUrl, adminJar, 'GET', '/api/auth/me', { accessToken: adminToken });
    assert.equal(me.user.id, ids.adminId);

    const refreshed = await api(baseUrl, adminJar, 'POST', '/api/auth/refresh');
    const refreshedAdminToken = refreshed.accessToken;
    assert.ok(refreshedAdminToken);

    await api(baseUrl, adminJar, 'POST', '/api/auth/logout', { accessToken: refreshedAdminToken });
    await api(baseUrl, adminJar, 'POST', '/api/auth/refresh', { expectedStatus: 401 });

    const overview = await api(baseUrl, superJar, 'GET', '/api/admin/overview', {
      accessToken: superToken
    });
    assert.ok(Number(overview.schools) >= 1);

    await api(baseUrl, superJar, 'POST', '/api/admin/workspaces/upsert', {
      accessToken: superToken,
      json: { id: ids.extraWorkspaceId, name: 'Extra Workspace Updated', schoolCode: 'EXTRA', status: 'approved' }
    });
    const workspaces = await api(baseUrl, superJar, 'GET', '/api/admin/workspaces', {
      accessToken: superToken
    });
    assert.ok(Array.isArray(workspaces) && workspaces.some((row) => row.id === ids.extraWorkspaceId));

    const settingsBefore = await api(baseUrl, superJar, 'GET', `/api/admin/workspace-settings/${ids.workspaceId}`, {
      accessToken: superToken
    });
    assert.ok(settingsBefore.workspaceId === ids.workspaceId);
    await api(baseUrl, superJar, 'PUT', `/api/admin/workspace-settings/${ids.workspaceId}`, {
      accessToken: superToken,
      json: { settings: { locale: 'en', smoke: true } }
    });

    await api(baseUrl, superJar, 'POST', '/api/register/request-review', {
      json: {
        email: `request.${runId}@example.com`,
        form: {
          schoolName: `Review Smoke School ${runId}`,
          schoolEmail: `request.${runId}@example.com`,
          schoolPhone: '+491234567890',
          contactPerson: 'Review Admin'
        }
      }
    });
    const schoolRequests = await api(baseUrl, superJar, 'GET', '/api/admin/school-requests?status=pending', {
      accessToken: superToken
    });
    assert.ok(Array.isArray(schoolRequests) && schoolRequests.some((row) => row.email === `request.${runId}@example.com`));
    const reviewRequest = schoolRequests.find((row) => row.email === `request.${runId}@example.com`);
    await api(baseUrl, superJar, 'POST', `/api/admin/school-requests/${reviewRequest.id}/approve`, {
      accessToken: superToken
    });
    const createdWorkspace = await api(baseUrl, superJar, 'POST', `/api/admin/school-requests/${reviewRequest.id}/create-workspace`, {
      accessToken: superToken
    });
    assert.equal(createdWorkspace.workspaceId, ids.reviewWorkspaceId);
    assert.equal(createdWorkspace.adminEmail, `request.${runId}@example.com`);

    const requestCounts = await api(baseUrl, superJar, 'GET', '/api/admin/requests/counts', {
      accessToken: superToken
    });
    assert.ok(Object.prototype.hasOwnProperty.call(requestCounts, 'pending'));

    const publicRequest = await api(baseUrl, superJar, 'POST', '/api/schools/request', {
      json: {
        schoolName: 'Public School Smoke',
        adminEmail: `public.${runId}@example.com`,
        password: 'PublicPass1!'
      },
      expectedStatus: 201
    });
    assert.ok(publicRequest.id);

    const invite = await api(baseUrl, superJar, 'POST', '/api/register/send-link', {
      accessToken: superToken,
      json: {
        workspaceId: ids.workspaceId,
        channelId: ids.classChannelId,
        role: 'student',
        email: `invite.${runId}@example.com`,
        firstName: 'Invite',
        lastName: 'Student',
        dateOfBirth: '2000-01-01'
      }
    });
    assert.ok(invite.token);
    const inviteInfo = await api(baseUrl, superJar, 'GET', `/api/register/link/${invite.token}`);
    assert.equal(inviteInfo.email, `invite.${runId}@example.com`);
    const completeInvite = await api(baseUrl, superJar, 'POST', '/api/register/complete', {
      json: {
        token: invite.token,
        firstName: 'Invite',
        lastName: 'Student',
        dateOfBirth: '2000-01-01',
        password: 'InvitePass1!'
      }
    });
    assert.ok(completeInvite.userId);
    assert.equal(completeInvite.workspaceId, ids.workspaceId);

    await api(baseUrl, superJar, 'POST', '/api/auth/forgot-password', {
      json: { email: `teacher.${runId}@example.com` }
    });
    const resetRow = await pool.query(`
      SELECT token
      FROM password_resets
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    `, [ids.teacherId]);
    assert.ok(resetRow.rows[0]?.token);
    await api(baseUrl, superJar, 'POST', '/api/auth/reset-password/complete', {
      json: { token: resetRow.rows[0].token, password: 'TeacherNew1!' }
    });

    const createdInvoice = await api(baseUrl, superJar, 'POST', '/api/admin/invoices', {
      accessToken: superToken,
      json: {
        workspaceId: ids.workspaceId,
        studentUserId: ids.studentId,
        amountCents: 3100,
        currency: 'EUR',
        description: 'Full PG smoke invoice'
      }
    });
    assert.ok(createdInvoice.id);

    const billing = await api(baseUrl, superJar, 'GET', `/api/admin/billing/${ids.workspaceId}`, {
      accessToken: superToken
    });
    assert.ok(Array.isArray(billing.invoices) && billing.invoices.some((row) => row.id === createdInvoice.id));

    const markPaid = await api(baseUrl, superJar, 'POST', `/api/admin/invoices/${createdInvoice.id}/mark-paid`, {
      accessToken: superToken,
      json: {}
    });
    assert.ok(markPaid.paymentId);

    const taskResponse = await api(baseUrl, adminJar, 'POST', '/api/tasks', {
      accessToken: adminToken,
      json: {
        channelId: ids.classChannelId,
        title: 'PG full smoke task',
        description: 'Task body',
        priority: 'medium'
      }
    });
    const task = taskResponse.task || taskResponse;
    assert.ok(task.id);
    const taskCommentResponse = await api(baseUrl, adminJar, 'POST', `/api/tasks/${task.id}/comments`, {
      accessToken: adminToken,
      json: { body: 'Task comment' }
    });
    const taskComment = taskCommentResponse.comment || taskCommentResponse;
    assert.ok(taskComment.id);

    const createdChannel = await api(baseUrl, adminJar, 'POST', '/api/channels', {
      accessToken: adminToken,
      json: {
        name: 'Postgres Full Smoke Channel',
        workspaceId: ids.workspaceId,
        category: 'classes',
        memberIds: [ids.adminId, ids.teacherId]
      },
      expectedStatus: 201
    });
    assert.ok(createdChannel.id);

    await api(baseUrl, adminJar, 'POST', `/api/channels/${createdChannel.id}/members`, {
      accessToken: adminToken,
      json: { userId: ids.studentId }
    });

    const message = await api(baseUrl, adminJar, 'POST', `/api/channels/${createdChannel.id}/messages`, {
      accessToken: adminToken,
      json: {
        author: 'School Admin',
        initials: 'SA',
        text: 'Postgres full smoke message'
      },
      expectedStatus: 201
    });
    assert.ok(message.id);

    const reply = await api(baseUrl, adminJar, 'POST', `/api/channels/${createdChannel.id}/messages/${message.id}/replies`, {
      accessToken: adminToken,
      json: {
        author: 'School Admin',
        initials: 'SA',
        text: 'Reply text'
      },
      expectedStatus: 201
    });
    assert.ok(reply.id);

    const reaction = await api(baseUrl, adminJar, 'POST', `/api/messages/${message.id}/reactions`, {
      accessToken: adminToken,
      json: { emoji: '👍', userId: ids.adminId }
    });
    assert.ok(Array.isArray(reaction.reactions));

    const messages = await api(baseUrl, adminJar, 'GET', `/api/channels/${createdChannel.id}/messages`, {
      accessToken: adminToken
    });
    assert.ok(Array.isArray(messages) && messages.some((row) => row.id === message.id));

    const audit = await api(baseUrl, superJar, 'GET', '/api/admin/audit', {
      accessToken: superToken
    });
    assert.ok(Array.isArray(audit) && audit.length >= 1);

    console.log('[full-postgres-cutover-smoke] passed');
  } finally {
    await stopServer(child);
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[full-postgres-cutover-smoke] failed:', err && err.stack ? err.stack : err);
  process.exit(1);
});
