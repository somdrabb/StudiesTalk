#!/usr/bin/env node
'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const Database = require('better-sqlite3');

const runId = `auth_reset_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
const port = 4200 + Math.floor(Math.random() * 100);
const sqlitePath = path.join(os.tmpdir(), `${runId}.sqlite`);

const ids = {
  workspaceId: `ws_${runId}`,
  adminId: `admin_${runId}`
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

function seedSqlite(dbPath, passwordHash) {
  const db = new Database(dbPath);
  db.pragma('foreign_keys = ON');

  safeAlterSqlite(db, `ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0;`);
  safeAlterSqlite(db, `ALTER TABLE users ADD COLUMN temp_login_started_at INTEGER;`);
  safeAlterSqlite(db, `ALTER TABLE users ADD COLUMN native_language TEXT NOT NULL DEFAULT 'en';`);
  safeAlterSqlite(db, `ALTER TABLE users ADD COLUMN native_language_confirmed INTEGER NOT NULL DEFAULT 0;`);
  safeAlterSqlite(db, `ALTER TABLE users ADD COLUMN password_changed_at TEXT;`);

  db.prepare(`
    INSERT INTO workspaces (id, name, status, admin_email, created_at)
    VALUES (?, ?, 'approved', ?, datetime('now'))
  `).run(ids.workspaceId, 'Auth Reset Smoke', `admin.${runId}@example.com`);

  db.prepare(`
    INSERT INTO users
    (id, workspace_id, first_name, last_name, name, email, username, password_hash, role, status, native_language, native_language_confirmed, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 'en', 1, datetime('now'))
  `).run(
    ids.adminId,
    ids.workspaceId,
    'Smoke',
    'Admin',
    'Smoke Admin',
    `admin.${runId}@example.com`,
    `admin_${runId}`,
    passwordHash,
    'school_admin'
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
      EMAIL_FROM_EMAIL: 'no-reply@example.com'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  child.stdout.on('data', (chunk) => process.stdout.write(chunk));
  child.stderr.on('data', (chunk) => process.stderr.write(chunk));
  return child;
}

function latestResetToken() {
  const db = new Database(sqlitePath, { readonly: true });
  const row = db.prepare(`
    SELECT token
    FROM password_resets
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT 1
  `).get(ids.adminId);
  db.close();
  return row?.token || null;
}

async function main() {
  if (fs.existsSync(sqlitePath)) fs.unlinkSync(sqlitePath);

  const originalPassword = 'AdminPass1!';
  const resetPassword = 'AdminReset2!';
  const passwordHash = hashPassword(originalPassword);

  let child = startServer();

  try {
    const baseUrl = `http://127.0.0.1:${port}`;
    await waitForServer(baseUrl);
    await stopServer(child);

    seedSqlite(sqlitePath, passwordHash);

    child = startServer();
    await waitForServer(baseUrl);

    const jar = {};
    await api(baseUrl, jar, 'GET', '/api/auth/csrf');

    const login = await api(baseUrl, jar, 'POST', '/api/auth/login', {
      json: { email: `admin.${runId}@example.com`, password: originalPassword }
    });
    assert.equal(login.user.role, 'school_admin');
    const accessToken = login.accessToken;

    const me = await api(baseUrl, jar, 'GET', '/api/auth/me', { accessToken });
    assert.equal(me.user.id, ids.adminId);

    const refreshed = await api(baseUrl, jar, 'POST', '/api/auth/refresh');
    assert.ok(refreshed.accessToken, 'refresh should return a new access token');

    await api(baseUrl, jar, 'POST', '/api/auth/logout', {
      accessToken: refreshed.accessToken
    });
    await api(baseUrl, jar, 'POST', '/api/auth/refresh', { expectedStatus: 401 });

    await api(baseUrl, jar, 'POST', '/api/auth/forgot-password', {
      json: { email: `admin.${runId}@example.com` }
    });

    const resetToken = latestResetToken();
    assert.ok(resetToken, 'forgot-password should create a password reset token');

    await api(baseUrl, jar, 'POST', '/api/auth/reset-password/complete', {
      json: { token: resetToken, password: resetPassword }
    });

    await api(baseUrl, jar, 'POST', '/api/auth/login', {
      json: { email: `admin.${runId}@example.com`, password: originalPassword },
      expectedStatus: 401
    });

    const loginAfterReset = await api(baseUrl, jar, 'POST', '/api/auth/login', {
      json: { email: `admin.${runId}@example.com`, password: resetPassword }
    });
    assert.equal(loginAfterReset.user.userId, ids.adminId);

    console.log('[auth-session-password-reset-smoke] passed');
  } finally {
    await stopServer(child);
  }
}

main().catch((err) => {
  console.error('[auth-session-password-reset-smoke] failed:', err && err.stack ? err.stack : err);
  process.exit(1);
});
