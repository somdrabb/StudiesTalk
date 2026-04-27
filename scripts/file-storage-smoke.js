#!/usr/bin/env node
'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const Database = require('better-sqlite3');
const { createS3CompatibleStorageAdapter } = require('../server/services/storage/s3CompatibleStorage.adapter');

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

function countRegistryRowsByStorageKey(storageKey) {
  return withDb((db) => {
    const row = db.prepare(`
      SELECT COUNT(*) AS c
      FROM files_registry
      WHERE storage_key = ?
    `).get(String(storageKey || '').trim());
    return Number(row?.c || 0);
  });
}

function deleteTempRegistryRowsByStorageKey(storageKey) {
  return withDb((db) => db.prepare(`
    DELETE FROM files_registry
    WHERE storage_key = ?
      AND purpose = 'upload_temp'
      AND (channel_id IS NULL OR channel_id = '')
      AND (message_id IS NULL OR message_id = '')
  `).run(String(storageKey || '').trim()));
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

function createMockResponse({ status = 200, headers = {}, bodyText = '', bodyBuffer = null } = {}) {
  const headerMap = new Map(Object.entries(headers).map(([key, value]) => [String(key).toLowerCase(), String(value)]));
  const payload = bodyBuffer !== null ? Buffer.from(bodyBuffer) : Buffer.from(String(bodyText || ''), 'utf8');
  return {
    status,
    headers: {
      get(name) {
        return headerMap.get(String(name || '').toLowerCase()) || null;
      }
    },
    async text() {
      return payload.toString('utf8');
    },
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(payload);
        controller.close();
      }
    })
  };
}

async function runS3AdapterMockTest() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `s3-adapter-${runId}-`));
  const sampleFile = path.join(tempDir, 'sample.txt');
  fs.writeFileSync(sampleFile, 'mock object body', 'utf8');

  const calls = [];
  const objectBytes = Buffer.from('mock object body', 'utf8');
  const metadataText = JSON.stringify({ ok: true });
  const fetchImpl = async (url, options = {}) => {
    const href = String(url);
    calls.push({
      method: String(options.method || 'GET'),
      url: href,
      headers: { ...(options.headers || {}) }
    });

    if (href.includes('missing-object')) {
      return createMockResponse({ status: 404 });
    }
    if (String(options.method) === 'HEAD') {
      return createMockResponse({
        status: 200,
        headers: {
          'content-length': String(objectBytes.length),
          'last-modified': new Date('2026-04-27T12:00:00Z').toUTCString(),
          etag: '"etag-1"',
          'content-type': 'text/plain'
        }
      });
    }
    if (String(options.method) === 'PUT') {
      return createMockResponse({ status: 200 });
    }
    if (String(options.method) === 'DELETE') {
      return createMockResponse({ status: 204 });
    }
    if (href.endsWith('/docs/note.txt')) {
      return createMockResponse({
        status: 200,
        headers: { 'content-type': 'text/plain' },
        bodyText: metadataText
      });
    }
    return createMockResponse({
      status: 200,
      headers: {
        'content-length': String(objectBytes.length),
        'content-type': 'text/plain'
      },
      bodyBuffer: objectBytes
    });
  };

  try {
    const adapter = createS3CompatibleStorageAdapter({
      endpoint: 'https://example-account.r2.cloudflarestorage.com',
      region: 'auto',
      bucket: 'studiestalk-test',
      accessKeyId: 'key-id',
      secretAccessKey: 'secret-key',
      forcePathStyle: true,
      fetchImpl,
      now: () => new Date('2026-04-27T12:00:00Z')
    });

    assert.equal(await adapter.exists('docs/sample.txt'), true, 'exists should succeed on 200 HEAD');
    assert.equal(await adapter.exists('missing-object.txt'), false, 'exists should return false on 404');

    await adapter.putFile({ key: 'docs/sample.txt', sourcePath: sampleFile });
    await adapter.putText({ key: 'docs/note.txt', text: metadataText });

    const stat = await adapter.stat('docs/sample.txt');
    assert.equal(stat.size, objectBytes.length, 'stat should expose object size');
    assert.equal(stat.contentType, 'text/plain', 'stat should expose content type');

    const downloadedText = await adapter.getText('docs/note.txt');
    assert.equal(downloadedText, metadataText, 'getText should read object text');

    const stream = adapter.createReadStream('docs/sample.txt');
    const chunks = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }
    assert.equal(Buffer.concat(chunks).toString('utf8'), objectBytes.toString('utf8'), 'createReadStream should stream object bytes');

    await adapter.delete('docs/sample.txt');

    const authCalls = calls.filter((call) => call.headers.authorization || call.headers.Authorization);
    assert.ok(authCalls.length >= 5, 'signed requests should include authorization headers');
    assert.ok(authCalls.every((call) => String(call.headers.authorization || call.headers.Authorization).startsWith('AWS4-HMAC-SHA256 ')), 'authorization headers should use SigV4');

    console.log('[file-storage-smoke] s3 adapter mock passed');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
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
  body.append('channelId', ids.channelId);
  const { data } = await request(baseUrl, jar, 'POST', '/api/uploads', { body });
  assert.ok(Array.isArray(data?.files) && data.files.length === 1, 'upload should return one file');
  return data.files[0];
}

async function main() {
  await runS3AdapterMockTest();
  if (String(process.env.FILE_STORAGE_SMOKE_MODE || '').trim().toLowerCase() === 'adapter-only') {
    console.log('[file-storage-smoke] adapter-only mode passed');
    return;
  }

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
    assert.ok(countRegistryRowsByStorageKey(firstUpload.storageKey) >= 1, 'upload route should register temporary DB metadata');

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
    assert.equal(fs.existsSync(`${objectPath}.meta.json`), false, 'managed upload metadata should stay in DB, not sidecar files');

    deleteTempRegistryRowsByStorageKey(firstUpload.storageKey);
    const recoveredUpload = await uploadFile(baseUrl, jar, 'secure-note.txt', plaintext);
    assert.equal(recoveredUpload.checksum, firstUpload.checksum, 'recovery upload should preserve plaintext checksum');
    assert.equal(recoveredUpload.storageMode, 'encrypted', 'recovery upload should stay encrypted');
    assert.notEqual(recoveredUpload.storageKey, firstUpload.storageKey, 'metadata-missing recovery should generate a fresh storage key instead of crashing');
    assert.ok(countRegistryRowsByStorageKey(recoveredUpload.storageKey) >= 1, 'recovery upload should recreate DB metadata');

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
