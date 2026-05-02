#!/usr/bin/env node
'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const Database = require('better-sqlite3');

const runId = `prod_ready_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
const port = 4950 + Math.floor(Math.random() * 200);
const baseUrl = `http://127.0.0.1:${port}`;
const tempRoot = path.join(os.tmpdir(), runId);
const sqlitePath = path.join(tempRoot, 'runtime.sqlite');
const uploadsDir = path.join(tempRoot, 'uploads');
const backupDir = path.join(tempRoot, 'backup');
const opsDir = path.join(tempRoot, 'ops');
const csrfToken = `csrf_${runId}`;

const ids = {
  workspaceId: `ws_${runId}`,
  superAdminId: `super_${runId}`
};

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

function base32Decode(value = '') {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const cleaned = String(value || '').replace(/=+$/g, '').replace(/\s+/g, '').toUpperCase();
  let bits = '';
  for (const char of cleaned) {
    const idx = alphabet.indexOf(char);
    if (idx >= 0) bits += idx.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

function generateTotpCode(secret, step = Math.floor(Date.now() / 30000)) {
  const key = base32Decode(secret);
  const counter = Buffer.alloc(8);
  counter.writeUInt32BE(Math.floor(step / 0x100000000), 0);
  counter.writeUInt32BE(step >>> 0, 4);
  const hmac = crypto.createHmac('sha1', key).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const binary = ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String((binary >>> 0) % 1000000).padStart(6, '0');
}

function checkEnvValidation() {
  const invalid = spawnSync(process.execPath, ['-e', "require('./server/env')"], {
    cwd: process.cwd(),
    env: {
      PATH: process.env.PATH,
      NODE_ENV: 'production',
      APP_BASE_URL: 'http://example.com',
      JWT_ACCESS_SECRET: '',
      JWT_REFRESH_SECRET: '',
      COOKIE_SECURE: 'false',
      DB_ENGINE: 'sqlite',
      DB_PATH: 'relative.sqlite'
    },
    encoding: 'utf8'
  });
  assert.notStrictEqual(invalid.status, 0, 'invalid production env should fail validation');
  assert.match(`${invalid.stderr}${invalid.stdout}`, /Production configuration invalid|JWT_ACCESS_SECRET|https/i);

  const valid = spawnSync(process.execPath, ['-e', "const env=require('./server/env'); console.log(JSON.stringify(env.ENV_VALIDATION.summary))"], {
    cwd: process.cwd(),
    env: {
      PATH: process.env.PATH,
      NODE_ENV: 'production',
      APP_BASE_URL: 'https://app.example.com',
      JWT_ACCESS_SECRET: 'prod_access_secret_'.padEnd(72, 'a'),
      JWT_REFRESH_SECRET: 'prod_refresh_secret_'.padEnd(72, 'b'),
      COOKIE_SECURE: 'true',
      DB_ENGINE: 'postgres',
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/studiestalk',
      PLATFORM_SECRETS_MASTER_KEY: 'prod_platform_secret_'.padEnd(72, 'c'),
      STRIPE_SECRET_KEY: 'sk_test_production_smoke',
      STRIPE_WEBHOOK_SECRET: 'whsec_production_smoke',
      STRIPE_PUBLIC_KEY: 'pk_test_production_smoke',
      SENTRY_DSN: '',
      JITSI_DOMAIN: 'video.example.com'
    },
    encoding: 'utf8'
  });
  assert.strictEqual(valid.status, 0, `valid production env should pass: ${valid.stderr || valid.stdout}`);
  assert.match(valid.stdout, /"stripeConfigured":true/);
}

async function waitForServer() {
  const startedAt = Date.now();
  let lastError = '';
  while (Date.now() - startedAt < 30000) {
    try {
      const ok = await new Promise((resolve) => {
        const req = http.get(`${baseUrl}/health`, { headers: { 'x-forwarded-proto': 'https' } }, (res) => {
          res.resume();
          resolve(res.statusCode >= 200 && res.statusCode < 500);
        });
        req.setTimeout(1000, () => {
          req.destroy(new Error('timeout'));
        });
        req.on('error', (err) => {
          lastError = err?.message || String(err);
          resolve(false);
        });
      });
      if (ok) return;
    } catch (err) {
      lastError = err?.message || String(err);
    }
    await wait(300);
  }
  throw new Error(`Server did not become ready${lastError ? `: ${lastError}` : ''}`);
}

function seedDatabase() {
  const db = new Database(sqlitePath);
  const passwordHash = hashPassword('Passw0rd!');
  const userColumns = new Set(db.prepare('PRAGMA table_info(users)').all().map((row) => String(row.name || '')));
  const ensureColumn = (name, sql) => {
    if (!userColumns.has(name)) {
      db.exec(sql);
      userColumns.add(name);
    }
  };
  ensureColumn('must_change_password', 'ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0');
  ensureColumn('temp_login_started_at', 'ALTER TABLE users ADD COLUMN temp_login_started_at INTEGER');
  ensureColumn('native_language', "ALTER TABLE users ADD COLUMN native_language TEXT DEFAULT 'en'");
  ensureColumn('native_language_confirmed', 'ALTER TABLE users ADD COLUMN native_language_confirmed INTEGER DEFAULT 1');
  db.prepare(`
    INSERT INTO workspaces (id, name, status, admin_email, created_at)
    VALUES (?, 'Production Smoke Workspace', 'approved', 'super@example.com', datetime('now'))
  `).run(ids.workspaceId);
  db.prepare(`
    INSERT INTO users
      (id, workspace_id, first_name, last_name, name, email, username, password_hash, role, status, native_language, native_language_confirmed, created_at)
    VALUES (?, ?, 'Super', 'Admin', 'Super Admin', 'super@example.com', 'prod_ready_super', ?, 'super_admin', 'active', 'en', 1, datetime('now'))
  `).run(ids.superAdminId, ids.workspaceId, passwordHash);
  db.close();
}

async function request(method, route, { token = '', body, expectedStatus = 200, csrf = true } = {}) {
  const headers = { Cookie: `csrf_token=${csrfToken}`, 'x-forwarded-proto': 'https' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (csrf && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) headers['x-csrf-token'] = csrfToken;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const payload = body !== undefined ? JSON.stringify(body) : '';
  if (payload) headers['Content-Length'] = Buffer.byteLength(payload);
  const { statusCode, text } = await new Promise((resolve, reject) => {
    const req = http.request(`${baseUrl}${route}`, { method, headers }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({ statusCode: res.statusCode, text: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.setTimeout(5000, () => req.destroy(new Error(`${method} ${route} timed out`)));
    if (payload) req.write(payload);
    req.end();
  });
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (_err) {
    data = { raw: text };
  }
  assert.strictEqual(statusCode, expectedStatus, `${method} ${route} expected ${expectedStatus}, got ${statusCode}: ${text}`);
  return data;
}

async function loginSuperAdmin() {
  const payload = await request('POST', '/api/auth/login', {
    body: { email: 'super@example.com', password: 'Passw0rd!' },
    expectedStatus: 202
  });
  assert.ok(payload?.mfaRequired && payload?.mfaToken, 'super admin should require MFA setup/verification');
  const setup = await request('POST', '/api/auth/mfa/setup/start', { body: { mfaToken: payload.mfaToken } });
  const verified = await request('POST', '/api/auth/mfa/verify', {
    body: { mfaToken: payload.mfaToken, code: generateTotpCode(setup.secret) }
  });
  assert.ok(verified?.accessToken, 'MFA verification should return an access token');
  return verified.accessToken;
}

async function main() {
  checkEnvValidation();
  fs.mkdirSync(tempRoot, { recursive: true });
  fs.mkdirSync(uploadsDir, { recursive: true });
  fs.mkdirSync(backupDir, { recursive: true });
  fs.mkdirSync(opsDir, { recursive: true });

  const child = spawn(process.execPath, ['server.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: 'development',
      PORT: String(port),
      HOST: '127.0.0.1',
      APP_BASE_URL: baseUrl,
      COOKIE_SECURE: 'false',
      JWT_ACCESS_SECRET: 'prod_readiness_access_secret_'.padEnd(72, 'a'),
      JWT_REFRESH_SECRET: 'prod_readiness_refresh_secret_'.padEnd(72, 'b'),
      DB_ENGINE: 'sqlite',
      DATABASE_URL: '',
      DB_PATH: sqlitePath,
      BILLING_DB_ENGINE: 'sqlite',
      TASKS_DB_ENGINE: 'sqlite',
      ATTENDANCE_DB_ENGINE: 'sqlite',
      EMAIL_PROVIDER: 'disabled',
      PLATFORM_SECRETS_MASTER_KEY: 'prod_platform_secret_'.padEnd(72, 'c'),
      STRIPE_SECRET_KEY: 'sk_test_production_smoke',
      STRIPE_WEBHOOK_SECRET: 'whsec_production_smoke',
      STRIPE_PUBLIC_KEY: 'pk_test_production_smoke',
      STRIPE_PRICE_STARTER: 'price_starter_smoke',
      JITSI_DOMAIN: 'video.example.com',
      UPLOADS_DIR: uploadsDir,
      DB_BACKUP_DIR: backupDir,
      OPS_EVIDENCE_DIR: opsDir
    },
    stdio: 'inherit'
  });

  try {
    await waitForServer();
    seedDatabase();

    const health = await request('GET', '/health');
    assert.strictEqual(health.ok, true);

    const deep = await request('GET', '/health/deep');
    assert.strictEqual(deep.ok, true);
    assert.strictEqual(deep.providers?.stripe?.ok, true);
    const deepText = JSON.stringify(deep);
    assert.ok(!deepText.includes('sk_test_production_smoke'), 'deep health must not expose Stripe secret key');
    assert.ok(!deepText.includes('whsec_production_smoke'), 'deep health must not expose Stripe webhook secret');

    const token = await loginSuperAdmin();
    const me = await request('GET', '/api/admin/me', { token });
    assert.strictEqual(me.role, 'super_admin');

    const stripeStatus = await request('GET', '/api/admin/billing/stripe/status', { token });
    assert.strictEqual(stripeStatus.configured, true);
    assert.strictEqual(stripeStatus.publicKeyConfigured, true);
    assert.strictEqual(stripeStatus.webhookConfigured, true);
    assert.ok(!JSON.stringify(stripeStatus).includes('sk_test_production_smoke'), 'Stripe status must not expose secrets');

    console.log('[production-readiness-smoke] passed');
  } finally {
    child.kill('SIGTERM');
    await wait(300);
  }
}

main().catch((err) => {
  console.error('[production-readiness-smoke] failed:', err?.message || err);
  process.exit(1);
});
