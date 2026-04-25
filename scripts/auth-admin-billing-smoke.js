#!/usr/bin/env node
'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const Database = require('better-sqlite3');

const runId = `auth_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
const port = 4000 + Math.floor(Math.random() * 200);
const sqlitePath = path.join(os.tmpdir(), `${runId}.sqlite`);

const ids = {
  workspaceId: `ws_${runId}`,
  superAdminId: `super_${runId}`,
  adminId: `admin_${runId}`,
  teacherId: `teacher_${runId}`,
  studentId: `student_${runId}`,
  requestId: `req_${runId}`
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

function seedSqlite(dbPath, passwords) {
  const db = new Database(dbPath);
  db.pragma('foreign_keys = ON');

  safeAlterSqlite(db, `ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0;`);
  safeAlterSqlite(db, `ALTER TABLE users ADD COLUMN temp_login_started_at INTEGER;`);
  safeAlterSqlite(db, `ALTER TABLE users ADD COLUMN native_language TEXT NOT NULL DEFAULT 'en';`);
  safeAlterSqlite(db, `ALTER TABLE users ADD COLUMN native_language_confirmed INTEGER NOT NULL DEFAULT 0;`);

  db.prepare(`
    INSERT INTO workspaces (id, name, status, admin_email, created_at)
    VALUES (?, ?, 'approved', ?, datetime('now'))
  `).run(ids.workspaceId, 'Auth Admin Billing Smoke', `admin.${runId}@example.com`);

  const userStmt = db.prepare(`
    INSERT INTO users
    (id, workspace_id, first_name, last_name, name, email, username, password_hash, role, status, native_language, native_language_confirmed, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 'en', 1, datetime('now'))
  `);

  userStmt.run(ids.superAdminId, 'default', 'Super', 'Admin', 'Super Admin', `super.${runId}@example.com`, `super_${runId}`, passwords.superAdmin, 'super_admin');
  userStmt.run(ids.adminId, ids.workspaceId, 'School', 'Admin', 'School Admin', `admin.${runId}@example.com`, `admin_${runId}`, passwords.admin, 'school_admin');
  userStmt.run(ids.teacherId, ids.workspaceId, 'Teacher', 'User', 'Teacher User', `teacher.${runId}@example.com`, `teacher_${runId}`, passwords.teacher, 'teacher');
  userStmt.run(ids.studentId, ids.workspaceId, 'Student', 'User', 'Student User', `student.${runId}@example.com`, `student_${runId}`, passwords.student, 'student');

  db.prepare(`
    INSERT INTO workspace_billing (workspace_id, plan, status, currency, monthly_price_cents, billing_email, updated_at)
    VALUES (?, 'free', 'active', 'EUR', 0, ?, ?)
  `).run(ids.workspaceId, `admin.${runId}@example.com`, new Date().toISOString());

  const requestInsert = db.prepare(`
    INSERT INTO registration_review_requests (email, payload, status, created_at)
    VALUES (?, ?, 'pending', ?)
  `).run(
    `request.${runId}@example.com`,
    JSON.stringify({
      schoolName: 'Smoke School',
      workspaceSlug: `smoke-${runId}`,
      contactPerson: 'Review User'
    }),
    Date.now()
  );

  db.close();
  return {
    requestId: String(requestInsert.lastInsertRowid)
  };
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
      BILLING_DB_ENGINE: 'sqlite',
      TASKS_DB_ENGINE: 'sqlite',
      ATTENDANCE_DB_ENGINE: 'sqlite',
      CHANNELS_DB_ENGINE: 'sqlite',
      MESSAGES_DB_ENGINE: 'sqlite'
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
    superAdmin: 'SuperPass1!',
    admin: 'AdminPass1!',
    teacher: 'TeacherPass1!',
    student: 'StudentPass1!'
  };
  const passwordHashes = {
    superAdmin: hashPassword(passwords.superAdmin),
    admin: hashPassword(passwords.admin),
    teacher: hashPassword(passwords.teacher),
    student: hashPassword(passwords.student)
  };

  let child = startServer();

  try {
    const baseUrl = `http://127.0.0.1:${port}`;
    await waitForServer(baseUrl);
    await stopServer(child);

    const seeded = seedSqlite(sqlitePath, passwordHashes);

    child = startServer();
    await waitForServer(baseUrl);

    const superJar = {};
    const adminJar = {};

    await api(baseUrl, superJar, 'GET', '/api/auth/csrf');
    await api(baseUrl, adminJar, 'GET', '/api/auth/csrf');

    const superLogin = await api(baseUrl, superJar, 'POST', '/api/auth/login', {
      json: { email: `super.${runId}@example.com`, password: passwords.superAdmin }
    });
    assert.equal(superLogin.user.role, 'super_admin');
    const superAccessToken = superLogin.accessToken;

    const adminLogin = await api(baseUrl, adminJar, 'POST', '/api/auth/login', {
      json: { email: `admin.${runId}@example.com`, password: passwords.admin }
    });
    assert.equal(adminLogin.user.role, 'school_admin');
    const adminAccessToken = adminLogin.accessToken;

    const meBeforeRefresh = await api(baseUrl, adminJar, 'GET', '/api/auth/me', {
      accessToken: adminAccessToken
    });
    assert.equal(meBeforeRefresh.user.id, ids.adminId);

    const refreshed = await api(baseUrl, adminJar, 'POST', '/api/auth/refresh', {
      expectedStatus: 200
    });
    assert.ok(refreshed.accessToken, 'refresh should return a new access token');
    const refreshedAdminAccessToken = refreshed.accessToken;

    const users = await api(baseUrl, superJar, 'GET', `/api/admin/users?workspaceId=${ids.workspaceId}`, {
      accessToken: superAccessToken
    });
    assert.ok(Array.isArray(users) && users.some((row) => row.id === ids.adminId), 'admin users page should include seeded users');

    const schoolRequests = await api(baseUrl, superJar, 'GET', '/api/admin/school-requests?status=pending', {
      accessToken: superAccessToken
    });
    assert.ok(Array.isArray(schoolRequests) && schoolRequests.some((row) => String(row.id) === seeded.requestId), 'school requests page should include seeded request');

    const createdInvoice = await api(baseUrl, superJar, 'POST', '/api/admin/invoices', {
      accessToken: superAccessToken,
      json: {
        workspaceId: ids.workspaceId,
        studentUserId: ids.studentId,
        amountCents: 2500,
        currency: 'EUR',
        description: 'Smoke invoice'
      }
    });
    assert.ok(createdInvoice.id, 'invoice creation should return id');

    const billingBeforePay = await api(baseUrl, superJar, 'GET', `/api/admin/billing/${ids.workspaceId}`, {
      accessToken: superAccessToken
    });
    assert.ok(Array.isArray(billingBeforePay.invoices) && billingBeforePay.invoices.some((row) => row.id === createdInvoice.id), 'billing list should include created invoice');

    const paidInvoice = await api(baseUrl, superJar, 'POST', `/api/admin/invoices/${createdInvoice.id}/mark-paid`, {
      accessToken: superAccessToken,
      json: {}
    });
    assert.ok(paidInvoice.paymentId, 'mark-paid should return paymentId');

    const billingAfterPay = await api(baseUrl, superJar, 'GET', `/api/admin/billing/${ids.workspaceId}`, {
      accessToken: superAccessToken
    });
    assert.ok(Array.isArray(billingAfterPay.payments) && billingAfterPay.payments.some((row) => row.id === paidInvoice.paymentId), 'billing list should include created payment');

    const createdChannel = await api(baseUrl, adminJar, 'POST', '/api/channels', {
      accessToken: refreshedAdminAccessToken,
      json: {
        name: 'Auth Smoke Channel',
        workspaceId: ids.workspaceId,
        category: 'classes',
        memberIds: [ids.adminId, ids.teacherId]
      },
      expectedStatus: 201
    });
    assert.ok(createdChannel.id, 'channel creation should return id');

    await api(baseUrl, adminJar, 'POST', `/api/channels/${createdChannel.id}/members`, {
      accessToken: refreshedAdminAccessToken,
      json: { userId: ids.studentId }
    });
    const members = await api(baseUrl, adminJar, 'GET', `/api/channels/${createdChannel.id}/members`, {
      accessToken: refreshedAdminAccessToken
    });
    assert.ok(Array.isArray(members.members) && members.members.includes(ids.studentId), 'channel members should include added student');

    const message = await api(baseUrl, adminJar, 'POST', `/api/channels/${createdChannel.id}/messages`, {
      accessToken: refreshedAdminAccessToken,
      json: {
        author: 'School Admin',
        initials: 'SA',
        text: 'Auth smoke message'
      },
      expectedStatus: 201
    });
    assert.ok(message.id, 'message create should return id');

    const editedMessage = await api(baseUrl, adminJar, 'PATCH', `/api/messages/${message.id}`, {
      accessToken: refreshedAdminAccessToken,
      json: { author: 'School Admin', text: 'Edited auth smoke message' }
    });
    assert.equal(editedMessage.text, 'Edited auth smoke message');

    const reply = await api(baseUrl, adminJar, 'POST', `/api/channels/${createdChannel.id}/messages/${message.id}/replies`, {
      accessToken: refreshedAdminAccessToken,
      json: {
        author: 'School Admin',
        initials: 'SA',
        text: 'Reply auth smoke'
      },
      expectedStatus: 201
    });
    assert.ok(reply.id, 'reply create should return id');

    const messageReactions = await api(baseUrl, adminJar, 'POST', `/api/messages/${message.id}/reactions`, {
      accessToken: refreshedAdminAccessToken,
      json: { emoji: '👍', userId: ids.adminId }
    });
    assert.ok(Array.isArray(messageReactions.reactions), 'message reactions response should stay array-shaped');

    const replyReactions = await api(baseUrl, adminJar, 'POST', `/api/replies/${reply.id}/reactions`, {
      accessToken: refreshedAdminAccessToken,
      json: { emoji: '✅', userId: ids.adminId }
    });
    assert.ok(Array.isArray(replyReactions.reactions), 'reply reactions response should stay array-shaped');

    const messages = await api(baseUrl, adminJar, 'GET', `/api/channels/${createdChannel.id}/messages`, {
      accessToken: refreshedAdminAccessToken
    });
    assert.ok(Array.isArray(messages) && messages.some((row) => row.id === message.id), 'message list should include created message');

    await api(baseUrl, adminJar, 'DELETE', `/api/channels/${createdChannel.id}/members`, {
      accessToken: refreshedAdminAccessToken,
      json: { userId: ids.studentId }
    });
    await api(baseUrl, adminJar, 'DELETE', `/api/messages/${message.id}`, {
      accessToken: refreshedAdminAccessToken,
      json: { author: 'School Admin' }
    });
    await api(baseUrl, adminJar, 'DELETE', `/api/channels/${createdChannel.id}`, {
      accessToken: refreshedAdminAccessToken
    });

    await api(baseUrl, adminJar, 'POST', '/api/auth/logout', {
      accessToken: refreshedAdminAccessToken
    });

    await api(baseUrl, adminJar, 'GET', '/api/auth/me', {
      accessToken: refreshedAdminAccessToken,
      expectedStatus: 401
    });
    await api(baseUrl, adminJar, 'POST', '/api/auth/refresh', {
      expectedStatus: 401
    });

    console.log('[auth-admin-billing-smoke] passed');
  } finally {
    await stopServer(child);
  }
}

main().catch((err) => {
  console.error('[auth-admin-billing-smoke] failed:', err && err.stack ? err.stack : err);
  process.exit(1);
});
