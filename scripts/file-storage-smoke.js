#!/usr/bin/env node
'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const Database = require('better-sqlite3');

const runId = `file_storage_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
const port = 4500 + Math.floor(Math.random() * 100);
const sqlitePath = path.join(os.tmpdir(), `${runId}.sqlite`);
const uploadsDir = path.join(os.tmpdir(), `${runId}_uploads`);
const encryptionKey = crypto.randomBytes(32).toString('hex');

const ids = {
  workspaceId: `ws_${runId}`,
  adminId: `admin_${runId}`,
  channelId: `class_${runId}`
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
  body,
  expectedStatus = 200,
  extraHeaders = {},
  parseJson = true
} = {}) {
  const headers = { ...extraHeaders };
  if (cookieHeader(jar)) headers.Cookie = cookieHeader(jar);
  if (json !== undefined) headers['Content-Type'] = 'application/json';
  if (!route.startsWith('/api/auth/') && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && jar.csrf_token) {
    headers['X-CSRF-Token'] = jar.csrf_token;
  }

  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers,
    body: json !== undefined ? JSON.stringify(json) : body
  });
  parseSetCookie(jar, response);

  const text = await response.text();
  const data = !parseJson
    ? text
    : (() => {
        try {
          return text ? JSON.parse(text) : null;
        } catch (_err) {
          return { raw: text };
        }
      })();

  assert.strictEqual(
    response.status,
    expectedStatus,
    `${method} ${route} => expected ${expectedStatus}, got ${response.status}: ${JSON.stringify(data)}`
  );
  return { response, data };
}

async function api(baseUrl, jar, method, route, options = {}) {
  const { data } = await request(baseUrl, jar, method, route, options);
  return data;
}

function seedSqlite(dbPath) {
  const db = new Database(dbPath);
  db.pragma('foreign_keys = ON');

  safeAlterSqlite(db, `ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0;`);
  safeAlterSqlite(db, `ALTER TABLE users ADD COLUMN temp_login_started_at INTEGER;`);
  safeAlterSqlite(db, `ALTER TABLE users ADD COLUMN native_language TEXT NOT NULL DEFAULT 'en';`);
  safeAlterSqlite(db, `ALTER TABLE users ADD COLUMN native_language_confirmed INTEGER NOT NULL DEFAULT 0;`);
  safeAlterSqlite(db, `ALTER TABLE users ADD COLUMN avatar_url TEXT;`);

  db.prepare(`
    INSERT INTO workspaces (id, name, status, admin_email, created_at)
    VALUES (?, ?, 'approved', ?, datetime('now'))
  `).run(ids.workspaceId, 'File Storage Smoke', `admin.${runId}@example.com`);

  db.prepare(`
    INSERT INTO users
    (id, workspace_id, first_name, last_name, name, email, username, password_hash, role, status, native_language, native_language_confirmed, created_at)
    VALUES (?, ?, 'File', 'Admin', 'File Admin', ?, ?, ?, 'school_admin', 'active', 'en', 1, datetime('now'))
  `).run(ids.adminId, ids.workspaceId, `admin.${runId}@example.com`, `admin_${runId}`, hashPassword('Secret123!'));

  db.prepare(`
    INSERT INTO channels (id, workspace_id, name, topic, members, unread, category, created_at)
    VALUES (?, ?, 'File Class', '', 1, 0, 'classes', datetime('now'))
  `).run(ids.channelId, ids.workspaceId);
  db.prepare('INSERT INTO channel_members (channel_id, user_id) VALUES (?, ?)').run(ids.channelId, ids.adminId);

  db.prepare(`
    INSERT INTO platform_settings (key, value, updated_at)
    VALUES ('workspace_policy_version_default', '2026-04-24', datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run();

  db.prepare(`
    INSERT INTO workspace_onboarding (id, workspace_id, status, current_step, completed_at, created_at, updated_at, completed_by_user_id)
    VALUES (?, ?, 'completed', 'launch_checklist', datetime('now'), datetime('now'), datetime('now'), ?)
    ON CONFLICT(workspace_id) DO UPDATE SET
      status = 'completed',
      current_step = 'launch_checklist',
      completed_at = datetime('now'),
      updated_at = datetime('now'),
      completed_by_user_id = excluded.completed_by_user_id
  `).run(`ob_${crypto.randomUUID()}`, ids.workspaceId, ids.adminId);

  db.close();
}

function withDb(fn) {
  const db = new Database(sqlitePath);
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

function latestFileRow() {
  return withDb((db) => db.prepare(`
    SELECT file_id AS fileId,
           file_name AS fileName,
           url,
           storage_key AS storageKey,
           checksum,
           storage_mode AS storageMode,
           encryption_iv AS encryptionIv,
           encryption_tag AS encryptionTag,
           permissions
    FROM files_registry
    ORDER BY created_at DESC
    LIMIT 1
  `).get() || null);
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
      FILE_STORAGE_ENCRYPTION_ENABLED: 'true',
      FILE_STORAGE_ENCRYPTION_KEY: encryptionKey,
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

async function login(baseUrl) {
  const jar = {};
  await api(baseUrl, jar, 'GET', '/api/auth/csrf');
  await api(baseUrl, jar, 'POST', '/api/auth/login', {
    json: { email: `admin.${runId}@example.com`, password: 'Secret123!' }
  });
  return jar;
}

async function acceptPolicy(baseUrl, jar) {
  const policy = await api(baseUrl, jar, 'GET', `/api/workspaces/${encodeURIComponent(ids.workspaceId)}/policy`);
  const version = String(policy?.document?.version || '').trim();
  await api(baseUrl, jar, 'POST', `/api/workspaces/${encodeURIComponent(ids.workspaceId)}/policy/accept`, {
    json: { version }
  });
}

async function uploadFile(baseUrl, jar, fileName, content, type = 'text/plain') {
  const body = new FormData();
  body.append('files', new Blob([content], { type }), fileName);
  const { data } = await request(baseUrl, jar, 'POST', '/api/uploads', { body });
  assert.ok(Array.isArray(data?.files) && data.files.length === 1, 'upload should return one file');
  return data.files[0];
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

    const jar = await login(baseUrl);
    await acceptPolicy(baseUrl, jar);

    const plaintext = `Sensitive school file ${runId}`;
    const firstUpload = await uploadFile(baseUrl, jar, 'secure-note.txt', plaintext);
    const secondUpload = await uploadFile(baseUrl, jar, 'secure-note.txt', plaintext);

    assert.equal(firstUpload.checksum, secondUpload.checksum, 'dedupe should keep same checksum');
    assert.equal(firstUpload.storageKey, secondUpload.storageKey, 'dedupe should reuse the same storage key');
    assert.equal(firstUpload.storageMode, 'encrypted', 'private school uploads should be encrypted when enabled');

    await api(baseUrl, jar, 'POST', `/api/channels/${encodeURIComponent(ids.channelId)}/messages`, {
      json: {
        text: 'Encrypted attachment',
        attachments: [firstUpload]
      },
      expectedStatus: 201
    });

    const row = latestFileRow();
    assert.ok(row?.storageKey, 'registry should store a storage key');
    assert.ok(row?.checksum, 'registry should store a checksum');
    assert.equal(row.storageMode, 'encrypted', 'registry should mark encrypted storage mode');
    assert.ok(row.encryptionIv && row.encryptionTag, 'registry should store AES-GCM metadata');

    const objectPath = path.join(uploadsDir, 'managed', ...String(row.storageKey || '').split('/'));
    const rawStored = fs.readFileSync(objectPath);
    assert.ok(rawStored.length > 0, 'encrypted object should exist on disk');
    assert.equal(rawStored.includes(Buffer.from(plaintext)), false, 'encrypted object must not contain plaintext bytes');

    const downloaded = await request(baseUrl, jar, 'GET', row.url, {
      expectedStatus: 200,
      parseJson: false
    });
    assert.equal(downloaded.data, plaintext, 'download path should decrypt and return original content');

    console.log('[file-storage-smoke] passed');
  } finally {
    await stopServer(child);
    fs.rmSync(uploadsDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error('[file-storage-smoke] failed:', err && err.stack ? err.stack : err);
  process.exit(1);
});
