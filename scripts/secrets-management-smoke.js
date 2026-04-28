#!/usr/bin/env node
'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const Database = require('better-sqlite3');
const { createPlatformSecretsService } = require('../server/services/platformSecrets.service');

const runId = `secrets_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
const sqlitePath = path.join(os.tmpdir(), `${runId}.sqlite`);
const uploadsDir = path.join(os.tmpdir(), `${runId}_uploads`);
const backupDir = path.join(os.tmpdir(), `${runId}_backup`);
const masterKey = crypto.randomBytes(32).toString('hex');
const basePort = 4650 + Math.floor(Math.random() * 80);

const ids = {
  workspaceId: `ws_${runId}`,
  superAdminId: `super_${runId}`,
  schoolAdminId: `school_${runId}`
};

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(baseUrl) {
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

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  await sleep(700);
}

function parseSetCookie(jar, response) {
  const setCookie = response.headers.getSetCookie ? response.headers.getSetCookie() : [];
  for (const header of setCookie) {
    const first = String(header || '').split(';')[0];
    const eq = first.indexOf('=');
    if (eq <= 0) continue;
    jar[first.slice(0, eq).trim()] = first.slice(eq + 1).trim();
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
  expectedStatuses = null,
  parseJson = true
} = {}) {
  const headers = {};
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
  const data = parseJson
    ? (() => {
        try {
          return text ? JSON.parse(text) : null;
        } catch (_err) {
          return { raw: text };
        }
      })()
    : text;

  if (expectedStatuses) {
    assert.ok(
      expectedStatuses.includes(response.status),
      `${method} ${route} => expected one of ${expectedStatuses.join(', ')}, got ${response.status}: ${JSON.stringify(data)}`
    );
  } else {
    assert.strictEqual(
      response.status,
      expectedStatus,
      `${method} ${route} => expected ${expectedStatus}, got ${response.status}: ${JSON.stringify(data)}`
    );
  }

  return { response, data };
}

async function api(baseUrl, jar, method, route, options = {}) {
  const { data } = await request(baseUrl, jar, method, route, options);
  return data;
}

function startServer({ port, includeMasterKey }) {
  const env = {
    ...process.env,
    NODE_ENV: 'development',
    HOST: '127.0.0.1',
    PORT: String(port),
    DB_ENGINE: 'sqlite',
    DB_PATH: sqlitePath,
    BILLING_DB_ENGINE: 'sqlite',
    TASKS_DB_ENGINE: 'sqlite',
    ATTENDANCE_DB_ENGINE: 'sqlite',
    CHANNELS_DB_ENGINE: 'sqlite',
    MESSAGES_DB_ENGINE: 'sqlite',
    UPLOADS_DIR: uploadsDir,
    DB_BACKUP_DIR: backupDir,
    EMAIL_PROVIDER: 'disabled',
    EMAIL_FROM_EMAIL: 'no-reply@example.com'
  };
  if (includeMasterKey) {
    env.PLATFORM_SECRETS_MASTER_KEY = masterKey;
  } else {
    delete env.PLATFORM_SECRETS_MASTER_KEY;
  }

  const child = spawn(process.execPath, ['server.js'], {
    cwd: process.cwd(),
    env,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  child.stdout.on('data', (chunk) => process.stdout.write(chunk));
  child.stderr.on('data', (chunk) => process.stderr.write(chunk));
  return child;
}

function seedUsers() {
  const db = new Database(sqlitePath);
  try {
    const passwordHash = hashPassword('Secret123!');
    db.prepare(`
      INSERT OR REPLACE INTO workspaces (id, name, status, admin_email, created_at)
      VALUES (?, ?, 'approved', ?, datetime('now'))
    `).run(ids.workspaceId, 'Secrets Smoke School', `super.${runId}@example.com`);

    const insertUser = db.prepare(`
      INSERT OR REPLACE INTO users
      (id, workspace_id, first_name, last_name, name, email, username, password_hash, role, status, native_language, native_language_confirmed, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 'en', 1, datetime('now'))
    `);

    insertUser.run(
      ids.superAdminId,
      ids.workspaceId,
      'Super',
      'Admin',
      'Super Admin',
      `super.${runId}@example.com`,
      `super_${runId}`,
      passwordHash,
      'super_admin'
    );
    insertUser.run(
      ids.schoolAdminId,
      ids.workspaceId,
      'School',
      'Admin',
      'School Admin',
      `school.${runId}@example.com`,
      `school_${runId}`,
      passwordHash,
      'school_admin'
    );
  } finally {
    db.close();
  }
}

function openServiceForAssertions() {
  const db = new Database(sqlitePath);
  const service = createPlatformSecretsService({
    db,
    masterKey,
    env: process.env
  });
  return { db, service };
}

function countSecretAuditRows() {
  const db = new Database(sqlitePath, { readonly: true });
  try {
    const row = db.prepare(`SELECT COUNT(*) AS c FROM platform_secret_audit`).get();
    return Number(row?.c || 0);
  } finally {
    db.close();
  }
}

function getSecretRow(provider, keyName) {
  const db = new Database(sqlitePath, { readonly: true });
  try {
    return db.prepare(`
      SELECT provider, key_name AS keyName, rotated_at AS rotatedAt, updated_at AS updatedAt
      FROM platform_secrets
      WHERE provider = ?
        AND key_name = ?
        AND environment = 'production'
      LIMIT 1
    `).get(provider, keyName) || null;
  } finally {
    db.close();
  }
}

async function login(baseUrl, email) {
  const jar = {};
  const login = await api(baseUrl, jar, 'POST', '/api/auth/login', {
    json: { email, password: 'Secret123!' }
  });
  assert.ok(login?.accessToken || jar.refresh_token, 'login should establish a session');
  return jar;
}

async function bootstrapSchema() {
  fs.mkdirSync(uploadsDir, { recursive: true });
  fs.mkdirSync(backupDir, { recursive: true });
  const child = startServer({ port: basePort, includeMasterKey: true });
  await waitForServer(`http://127.0.0.1:${basePort}`);
  await stopServer(child);
}

async function main() {
  await bootstrapSchema();
  seedUsers();

  const baseUrl = `http://127.0.0.1:${basePort}`;
  let child = startServer({ port: basePort, includeMasterKey: true });

  try {
    await waitForServer(baseUrl);

    const schoolJar = await login(baseUrl, `school.${runId}@example.com`);
    await request(baseUrl, schoolJar, 'GET', '/api/admin/secrets', {
      expectedStatuses: [401, 403]
    });

    const superJar = await login(baseUrl, `super.${runId}@example.com`);
    const listBefore = await api(baseUrl, superJar, 'GET', '/api/admin/secrets');
    assert.strictEqual(listBefore.enabled, true, 'master key should enable secrets management');

    const openAiKey = 'sk-secrets-smoke-1234567890abcd';
    const openAiUpdated = await api(baseUrl, superJar, 'PUT', '/api/admin/secrets/openai/OPENAI_API_KEY', {
      json: { value: openAiKey }
    });
    assert.ok(openAiUpdated.maskedValue, 'update should return masked value');
    assert.ok(!JSON.stringify(openAiUpdated).includes(openAiKey), 'raw secret must not be returned by update');

    const openAiProvider = await api(baseUrl, superJar, 'GET', '/api/admin/secrets/openai');
    const providerJson = JSON.stringify(openAiProvider);
    assert.ok(!providerJson.includes(openAiKey), 'GET provider response must not include raw secret');
    const apiKeyField = (openAiProvider?.provider?.secrets || []).find((entry) => entry.keyName === 'OPENAI_API_KEY');
    assert.ok(apiKeyField?.maskedValue, 'GET provider should include masked value');

    const { db, service } = openServiceForAssertions();
    try {
      assert.strictEqual(
        service.getSecretValue('openai', 'OPENAI_API_KEY', 'production'),
        openAiKey,
        'server-side decryption should recover the stored value'
      );
    } finally {
      db.close();
    }

    const rotated = await api(baseUrl, superJar, 'POST', '/api/admin/secrets/openai/OPENAI_API_KEY/rotate', {
      json: { value: 'sk-secrets-smoke-rotated-9999abcd' }
    });
    assert.ok(rotated.rotatedAt || getSecretRow('openai', 'OPENAI_API_KEY')?.rotatedAt, 'rotate should set rotated_at');

    const testResult = await api(baseUrl, superJar, 'POST', '/api/admin/secrets/openai/test');
    assert.strictEqual(testResult.provider, 'openai');
    assert.ok(['ok', 'failed'].includes(String(testResult.status || '')), 'test endpoint should return safe status');
    assert.ok(!JSON.stringify(testResult).includes('sk-secrets-smoke'), 'test result must not include secret value');

    const auditCountAfterWrites = countSecretAuditRows();
    assert.ok(auditCountAfterWrites >= 3, 'secret audit rows should be written for create/rotate/test');

    const deleted = await api(baseUrl, superJar, 'DELETE', '/api/admin/secrets/openai/OPENAI_API_KEY');
    assert.strictEqual(deleted.ok, true);
    assert.strictEqual(getSecretRow('openai', 'OPENAI_API_KEY'), null, 'delete should remove the secret row');

    await stopServer(child);

    child = startServer({ port: basePort + 1, includeMasterKey: false });
    const baseUrlNoMaster = `http://127.0.0.1:${basePort + 1}`;
    await waitForServer(baseUrlNoMaster);

    const superJarNoMaster = await login(baseUrlNoMaster, `super.${runId}@example.com`);
    const disabledList = await api(baseUrlNoMaster, superJarNoMaster, 'GET', '/api/admin/secrets');
    assert.strictEqual(disabledList.enabled, false, 'missing master key should disable secret writes');

    await request(baseUrlNoMaster, superJarNoMaster, 'PUT', '/api/admin/secrets/openai/OPENAI_API_KEY', {
      json: { value: 'sk-should-fail' },
      expectedStatus: 503
    });

    console.log('[secrets-management-smoke] passed');
  } finally {
    await stopServer(child);
    fs.rmSync(uploadsDir, { recursive: true, force: true });
    fs.rmSync(backupDir, { recursive: true, force: true });
    fs.rmSync(sqlitePath, { force: true });
  }
}

main().catch((error) => {
  console.error('[secrets-management-smoke] failed:', error?.stack || error?.message || error);
  process.exit(1);
});
