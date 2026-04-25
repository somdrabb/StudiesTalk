#!/usr/bin/env node
'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');

const argon2Available = (() => {
  try {
    require('argon2');
    return true;
  } catch (_err) {
    return false;
  }
})();

const runId = `account_security_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
const port = 4300 + Math.floor(Math.random() * 100);
const sqlitePath = path.join(os.tmpdir(), `${runId}.sqlite`);

const ids = {
  workspaceId: `ws_${runId}`,
  adminId: `admin_${runId}`,
  bcryptUserId: `bcrypt_${runId}`,
  existingUserId: `existing_${runId}`
};
const resetTokenOverride = `reset_${runId}_known_token`;

function hashLegacyPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

function sha256(text) {
  return crypto.createHash('sha256').update(String(text)).digest('hex');
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
  safeAlterSqlite(db, `ALTER TABLE users ADD COLUMN password_changed_at TEXT;`);

  db.prepare(`
    INSERT INTO workspaces (id, name, status, admin_email, created_at)
    VALUES (?, ?, 'approved', ?, datetime('now'))
  `).run(ids.workspaceId, 'Account Security Smoke', `admin.${runId}@example.com`);

  const insertUser = db.prepare(`
    INSERT INTO users
    (id, workspace_id, first_name, last_name, name, email, username, password_hash, role, status, phone, phone_country, phone_number, date_of_birth, native_language, native_language_confirmed, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, 'en', 1, datetime('now'))
  `);

  insertUser.run(
    ids.adminId,
    ids.workspaceId,
    'Smoke',
    'Admin',
    'Smoke Admin',
    `admin.${runId}@example.com`,
    `admin_${runId}`,
    hashLegacyPassword('AdminPass1!'),
    'school_admin',
    '+15551000101',
    '+1',
    '5551000101',
    '1980-04-15'
  );

  insertUser.run(
    ids.bcryptUserId,
    ids.workspaceId,
    'Legacy',
    'Bcrypt',
    'Legacy Bcrypt',
    `bcrypt.${runId}@example.com`,
    `bcrypt_${runId}`,
    bcrypt.hashSync('BcryptPass1!', 10),
    'teacher',
    '+15551000102',
    '+1',
    '5551000102',
    '1984-09-21'
  );

  insertUser.run(
    ids.existingUserId,
    ids.workspaceId,
    'Existing',
    'Student',
    'Existing Student',
    `existing.${runId}@example.com`,
    `existing_${runId}`,
    hashLegacyPassword('ExistingPass1!'),
    'student',
    '+15551234567',
    '+1',
    '5551234567',
    '2001-02-03'
  );

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
      BILLING_DB_ENGINE: 'sqlite',
      TASKS_DB_ENGINE: 'sqlite',
      ATTENDANCE_DB_ENGINE: 'sqlite',
      CHANNELS_DB_ENGINE: 'sqlite',
      MESSAGES_DB_ENGINE: 'sqlite',
      EMAIL_PROVIDER: 'disabled',
      EMAIL_FROM_EMAIL: 'no-reply@example.com',
      PASSWORD_RESET_TOKEN_OVERRIDE: resetTokenOverride
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  child.stdout.on('data', (chunk) => process.stdout.write(chunk));
  child.stderr.on('data', (chunk) => process.stderr.write(chunk));
  return child;
}

function withDb(fn) {
  const db = new Database(sqlitePath);
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

function latestResetRow() {
  return withDb((db) => {
    const row = db.prepare(`
      SELECT token, used
      FROM password_resets
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).get(ids.adminId);
    return row || null;
  });
}

function insertInvite({ token, email, phoneCountry = '', phoneNumber = '', dateOfBirth = '' }) {
  return withDb((db) => {
    db.prepare(`
      INSERT INTO registration_links (
        token, workspace_id, channel_id, role, email, first_name, last_name, date_of_birth,
        phone_country, phone_number, created_at, expires_at, used
      ) VALUES (?, ?, NULL, 'student', ?, 'Invite', 'User', ?, ?, ?, ?, ?, 0)
    `).run(
      token,
      ids.workspaceId,
      email,
      dateOfBirth || null,
      phoneCountry,
      phoneNumber,
      new Date().toISOString(),
      Date.now() + 3600 * 1000
    );
  });
}

function getPasswordHashByEmail(email) {
  return withDb((db) => {
    const row = db.prepare('SELECT password_hash FROM users WHERE lower(email) = lower(?) LIMIT 1').get(email);
    return row?.password_hash || '';
  });
}

async function main() {
  if (fs.existsSync(sqlitePath)) fs.unlinkSync(sqlitePath);

  let child = startServer();

  try {
    const baseUrl = `http://127.0.0.1:${port}`;
    await waitForServer(baseUrl);
    await stopServer(child);

    seedSqlite(sqlitePath);

    child = startServer();
    await waitForServer(baseUrl);

    const jar = {};
    await api(baseUrl, jar, 'GET', '/api/auth/csrf');

    const bcryptLogin = await api(baseUrl, jar, 'POST', '/api/auth/login', {
      json: { email: `bcrypt.${runId}@example.com`, password: 'BcryptPass1!' }
    });
    assert.equal(bcryptLogin.user.role, 'teacher');

    await api(baseUrl, jar, 'POST', '/api/auth/forgot-password', {
      json: { email: `admin.${runId}@example.com` }
    });

    const resetRow = latestResetRow();
    assert.ok(resetRow?.token, 'forgot-password should create a reset token record');
    assert.notEqual(resetRow.token, resetTokenOverride, 'forgot-password token must not be stored raw');
    assert.equal(resetRow.token, sha256(resetTokenOverride), 'forgot-password should store the token hash');

    const resetPassword = 'AdminReset22!';
    await api(baseUrl, jar, 'POST', '/api/auth/reset-password/complete', {
      json: { token: resetTokenOverride, password: resetPassword }
    });

    const usedResetRow = latestResetRow();
    assert.equal(Number(usedResetRow?.used || 0), 1, 'reset token should be marked used after completion');

    await api(baseUrl, jar, 'POST', '/api/auth/login', {
      json: { email: `admin.${runId}@example.com`, password: 'AdminPass1!' },
      expectedStatus: 401
    });

    const resetLogin = await api(baseUrl, jar, 'POST', '/api/auth/login', {
      json: { email: `admin.${runId}@example.com`, password: resetPassword }
    });
    assert.equal(resetLogin.user.userId, ids.adminId);

    const resetHash = getPasswordHashByEmail(`admin.${runId}@example.com`);
    assert.ok(resetHash, 'reset password should store a hash');
    assert.notEqual(resetHash, resetPassword, 'reset password must not be stored in plaintext');
    if (argon2Available) {
      assert.ok(resetHash.startsWith('$argon2id$'), 'reset password should use argon2id when available');
    }

    insertInvite({
      token: `dup_email_${runId}`,
      email: `existing.${runId}@example.com`,
      dateOfBirth: '2006-01-01'
    });
    const duplicateEmail = await api(baseUrl, jar, 'POST', '/api/register/complete', {
      expectedStatus: 409,
      json: {
        token: `dup_email_${runId}`,
        firstName: 'New',
        lastName: 'Student',
        dateOfBirth: '2006-01-01',
        password: 'RegisterPass1!'
      }
    });
    assert.equal(duplicateEmail.code, 'account_already_exists');
    assert.deepEqual(duplicateEmail.actions, ['login', 'forgot_password']);

    insertInvite({
      token: `dup_phone_${runId}`,
      email: `phone.${runId}@example.com`,
      phoneCountry: '+1',
      phoneNumber: '5551234567',
      dateOfBirth: '2006-02-02'
    });
    const duplicatePhone = await api(baseUrl, jar, 'POST', '/api/register/complete', {
      expectedStatus: 409,
      json: {
        token: `dup_phone_${runId}`,
        firstName: 'Phone',
        lastName: 'Clash',
        dateOfBirth: '2006-02-02',
        phoneCountry: '+1',
        phoneNumber: '5551234567',
        password: 'RegisterPass1!'
      }
    });
    assert.equal(duplicatePhone.code, 'account_already_exists');

    insertInvite({
      token: `dup_dob_${runId}`,
      email: `dob.${runId}@example.com`,
      dateOfBirth: '2001-02-03'
    });
    const duplicateDob = await api(baseUrl, jar, 'POST', '/api/register/complete', {
      expectedStatus: 409,
      json: {
        token: `dup_dob_${runId}`,
        firstName: 'Dob',
        lastName: 'Clash',
        dateOfBirth: '2001-02-03',
        password: 'RegisterPass1!'
      }
    });
    assert.equal(duplicateDob.code, 'account_already_exists');

    insertInvite({
      token: `safe_${runId}`,
      email: `fresh.${runId}@example.com`,
      phoneCountry: '+1',
      phoneNumber: '5554447788',
      dateOfBirth: '2004-07-08'
    });
    const safeRegistration = await api(baseUrl, jar, 'POST', '/api/register/complete', {
      json: {
        token: `safe_${runId}`,
        firstName: 'Fresh',
        lastName: 'User',
        dateOfBirth: '2004-07-08',
        phoneCountry: '+1',
        phoneNumber: '5554447788',
        password: 'RegisterPass1!'
      }
    });
    assert.equal(safeRegistration.ok, true);

    const registeredHash = getPasswordHashByEmail(`fresh.${runId}@example.com`);
    assert.ok(registeredHash, 'new registration should store a password hash');
    assert.notEqual(registeredHash, 'RegisterPass1!', 'registration password must not be stored in plaintext');
    if (argon2Available) {
      assert.ok(registeredHash.startsWith('$argon2id$'), 'registration password should use argon2id when available');
    }

    const freshLogin = await api(baseUrl, jar, 'POST', '/api/auth/login', {
      json: { email: `fresh.${runId}@example.com`, password: 'RegisterPass1!' }
    });
    assert.ok(freshLogin.accessToken, 'newly registered user should receive an access token');
    assert.equal(String(freshLogin?.user?.email || '').toLowerCase(), `fresh.${runId}@example.com`);

    console.log('[account-security-smoke] passed');
  } finally {
    await stopServer(child);
  }
}

main().catch((err) => {
  console.error('[account-security-smoke] failed:', err && err.stack ? err.stack : err);
  process.exit(1);
});
