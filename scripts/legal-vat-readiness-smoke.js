#!/usr/bin/env node
'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const Database = require('better-sqlite3');
const { generateInvoiceNumber } = require('../server/services/invoiceNumber.service');

const runId = `legal_vat_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
const port = 4550 + Math.floor(Math.random() * 200);
const baseUrl = `http://127.0.0.1:${port}`;
const sqlitePath = path.join(os.tmpdir(), `${runId}.sqlite`);
const csrfToken = `csrf_${runId}`;

const ids = {
  workspaceId: `ws_${runId}`,
  superAdminId: `super_${runId}`,
  adminId: `admin_${runId}`
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
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
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

async function waitForServer() {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 30000) {
    try {
      const res = await fetch(`${baseUrl}/`);
      if (res.status >= 200 || res.status === 404) return;
    } catch (_err) {}
    await wait(300);
  }
  throw new Error('Server did not become ready');
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
    VALUES (?, 'Legal VAT Smoke Workspace', 'approved', 'super@example.com', datetime('now'))
  `).run(ids.workspaceId);
  const insertUser = db.prepare(`
    INSERT INTO users
      (id, workspace_id, first_name, last_name, name, email, username, password_hash, role, status, native_language, native_language_confirmed, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 'en', 1, datetime('now'))
  `);
  insertUser.run(ids.superAdminId, ids.workspaceId, 'Super', 'Admin', 'Super Admin', 'super@example.com', 'legal_vat_super', passwordHash, 'super_admin');
  insertUser.run(ids.adminId, ids.workspaceId, 'School', 'Admin', 'School Admin', 'admin@example.com', 'legal_vat_admin', passwordHash, 'school_admin');
  db.close();
}

async function request(method, route, { token = '', body, expectedStatus = 200, csrf = true } = {}) {
  const headers = { Cookie: `csrf_token=${csrfToken}` };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (csrf && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) headers['x-csrf-token'] = csrfToken;
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(`${baseUrl}${route}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (_err) {
    data = { raw: text };
  }
  assert.strictEqual(res.status, expectedStatus, `${method} ${route} expected ${expectedStatus}, got ${res.status}: ${text}`);
  return data;
}

async function login(email) {
  const payload = await request('POST', '/api/auth/login', {
    body: { email, password: 'Passw0rd!' },
    expectedStatus: email === 'super@example.com' ? 202 : 200
  });
  if (payload?.mfaRequired) {
    const setup = await request('POST', '/api/auth/mfa/setup/start', {
      body: { mfaToken: payload.mfaToken }
    });
    const verified = await request('POST', '/api/auth/mfa/verify', {
      body: { mfaToken: payload.mfaToken, code: generateTotpCode(setup.secret) }
    });
    assert.ok(verified?.accessToken, `Expected MFA access token for ${email}`);
    return verified.accessToken;
  }
  assert.ok(payload?.accessToken, `Expected access token for ${email}`);
  return payload.accessToken;
}

function countAuditRows(action) {
  const db = new Database(sqlitePath, { readonly: true });
  try {
    const row = db.prepare('SELECT COUNT(*) AS c FROM audit_logs WHERE action = ?').get(action);
    return Number(row?.c || 0);
  } finally {
    db.close();
  }
}

async function main() {
  if (fs.existsSync(sqlitePath)) fs.unlinkSync(sqlitePath);
  const child = spawn(process.execPath, ['server.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: 'development',
      PORT: String(port),
      DB_PATH: sqlitePath,
      DB_ENGINE: 'sqlite',
      BILLING_DB_ENGINE: 'sqlite',
      TASKS_DB_ENGINE: 'sqlite',
      ATTENDANCE_DB_ENGINE: 'sqlite',
      EMAIL_PROVIDER: 'disabled'
    },
    stdio: 'inherit'
  });

  try {
    await waitForServer();
    seedDatabase();
    const superToken = await login('super@example.com');
    const adminToken = await login('admin@example.com');

    const legalInitial = await request('GET', '/api/admin/legal-settings', { token: superToken });
    assert.ok(legalInitial.settings, 'legal settings should be readable');

    const billingSaved = await request('PATCH', `/api/admin/billing/${encodeURIComponent(ids.workspaceId)}/profile`, {
      token: superToken,
      body: {
        legalCompanyName: 'Legal VAT Smoke GmbH',
        billingContactName: 'Finance Owner',
        billingEmail: 'billing@example.com',
        billingAddressLine1: 'Example Str. 1',
        billingCity: 'Essen',
        billingPostalCode: '45127',
        billingCountry: 'DE',
        vatId: 'DE123456789',
        taxNumber: '123/456/789',
        invoiceLanguage: 'de',
        invoiceCurrency: 'EUR',
        reverseChargeApplicable: true
      }
    });
    assert.strictEqual(billingSaved.billing.vatId, 'DE123456789');
    assert.strictEqual(billingSaved.billing.billingCountry, 'DE');
    assert.strictEqual(billingSaved.billing.reverseChargeApplicable, true);

    const invoice = await request('POST', '/api/admin/invoices', {
      token: superToken,
      body: {
        workspaceId: ids.workspaceId,
        amountCents: 11900,
        currency: 'EUR',
        description: 'Readiness invoice',
        dueDate: '2026-05-31',
        vatRate: 19
      }
    });
    assert.match(invoice.invoiceNumber, /^ST-\d{4}-\d{6}$/);

    const billing = await request('GET', `/api/admin/billing/${encodeURIComponent(ids.workspaceId)}`, { token: superToken });
    assert.ok(billing.invoices.some((row) => row.id === invoice.id && row.invoiceNumber === invoice.invoiceNumber));
    const invoiceRow = billing.invoices.find((row) => row.id === invoice.id);
    assert.strictEqual(invoiceRow.buyerVatId, 'DE123456789');
    assert.ok(invoiceRow.description, 'existing invoice fields should remain available');

    const db = new Database(sqlitePath);
    try {
      assert.match(generateInvoiceNumber({ db }), /^ST-\d{4}-\d{6}$/);
    } finally {
      db.close();
    }

    await request('PUT', '/api/admin/legal-settings', {
      token: superToken,
      body: {
        company_name: 'StudiesTalk GmbH',
        operator_name: 'StudiesTalk Operator',
        legal_address: 'Example Str. 1, 45127 Essen',
        legal_email: 'legal@example.com',
        privacy_email: 'privacy@example.com',
        vat_id: 'DE123456789',
        tax_number: '123/456/789'
      }
    });

    const created = await request('POST', '/api/admin/legal-versions', {
      token: superToken,
      body: {
        document_type: 'ai_notice',
        locale: 'en',
        version: '2026.05',
        title: 'AI Notice',
        body: 'Configurable placeholder. Review with legal counsel before production use.'
      },
      expectedStatus: 201
    });
    const published = await request('POST', `/api/admin/legal-versions/${encodeURIComponent(created.version.id)}/publish`, {
      token: superToken,
      body: {}
    });
    assert.strictEqual(published.version.status, 'published');
    const versions = await request('GET', '/api/admin/legal-versions', { token: superToken });
    assert.ok(versions.versions.some((row) => row.id === created.version.id && row.is_active));

    const sub = await request('POST', '/api/admin/legal/subprocessors', {
      token: superToken,
      body: {
        provider_name: 'Stripe',
        service_type: 'Payments',
        data_location: 'EU/US',
        purpose: 'Subscription billing',
        legal_basis: 'Contract',
        dpa_available: true,
        privacy_url: 'https://stripe.com/privacy',
        active: true
      },
      expectedStatus: 201
    });
    assert.strictEqual(sub.row.provider_name, 'Stripe');
    const subUpdated = await request('PATCH', `/api/admin/legal/subprocessors/${encodeURIComponent(sub.row.id)}`, {
      token: superToken,
      body: { ...sub.row, provider_name: 'Stripe Payments', dpa_available: true }
    });
    assert.strictEqual(subUpdated.row.provider_name, 'Stripe Payments');
    await request('GET', '/api/admin/legal/subprocessors', { token: superToken });
    await request('DELETE', `/api/admin/legal/subprocessors/${encodeURIComponent(sub.row.id)}`, { token: superToken });

    await request('GET', '/api/admin/data-governance/retention', { token: adminToken, expectedStatus: 403 });
    await request('POST', '/api/admin/data-governance/retention', {
      token: superToken,
      csrf: false,
      body: { audit_log_retention_days: 365 },
      expectedStatus: 403
    });
    const retention = await request('POST', '/api/admin/data-governance/retention', {
      token: superToken,
      body: {
        audit_log_retention_days: 400,
        security_log_retention_days: 365,
        backup_retention_days: 30,
        file_retention_days: 365,
        deleted_user_retention_days: 30,
        learning_data_retention_months: 24,
        message_retention_days: 365,
        recording_retention_days: 90,
        email_log_retention_days: 180
      }
    });
    assert.strictEqual(retention.retention.audit_log_retention_days, 400);
    assert.ok(retention.coverage.some((row) => row.key === 'billing'));

    const secretProbe = JSON.stringify({ legalInitial, billingSaved, billing, retention });
    assert.ok(!secretProbe.includes('STRIPE_SECRET_KEY'));
    await wait(300);
    assert.ok(countAuditRows('legal_version.published') >= 1, 'legal publish audit row should exist');

    console.log('[legal-vat-readiness-smoke] passed');
  } finally {
    child.kill('SIGTERM');
    await wait(500);
    if (fs.existsSync(sqlitePath)) fs.unlinkSync(sqlitePath);
  }
}

main().catch((error) => {
  console.error('[legal-vat-readiness-smoke] failed:', error?.stack || error?.message || error);
  process.exit(1);
});
