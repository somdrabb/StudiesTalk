#!/usr/bin/env node
'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const Database = require('better-sqlite3');

const runId = `legal_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
const port = 4300 + Math.floor(Math.random() * 200);
const baseUrl = `http://127.0.0.1:${port}`;
const sqlitePath = path.join(os.tmpdir(), `${runId}.sqlite`);
const csrfToken = `csrf_${runId}`;

const ids = {
  workspaceId: `ws_${runId}`,
  superAdminId: `super_${runId}`,
  teacherId: `teacher_${runId}`
};

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(url) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 30000) {
    try {
      const res = await fetch(`${url}/`);
      if (res.status >= 200 || res.status === 404) return;
    } catch (_err) {}
    await wait(400);
  }
  throw new Error('Server did not become ready in time');
}

function seedDatabase(dbPath) {
  const db = new Database(dbPath);
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync('Passw0rd!', salt, 10000, 64, 'sha512').toString('hex');
  const passwordHash = `${salt}:${hash}`;
  const userColumns = new Set(db.prepare(`PRAGMA table_info(users)`).all().map((row) => String(row.name || '')));
  const ensureColumn = (name, sql) => {
    if (!userColumns.has(name)) {
      db.exec(sql);
      userColumns.add(name);
    }
  };
  ensureColumn('must_change_password', `ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0;`);
  ensureColumn('temp_login_started_at', `ALTER TABLE users ADD COLUMN temp_login_started_at INTEGER;`);
  ensureColumn('native_language', `ALTER TABLE users ADD COLUMN native_language TEXT DEFAULT 'en';`);
  ensureColumn('native_language_confirmed', `ALTER TABLE users ADD COLUMN native_language_confirmed INTEGER DEFAULT 1;`);

  db.prepare(`
    INSERT INTO workspaces (id, name, status, admin_email, created_at)
    VALUES (?, 'Legal Smoke Workspace', 'approved', 'super@example.com', datetime('now'))
  `).run(ids.workspaceId);

  const insertUser = db.prepare(`
    INSERT INTO users
      (id, workspace_id, first_name, last_name, name, email, username, password_hash, role, status, native_language, native_language_confirmed, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 'en', 1, datetime('now'))
  `);
  insertUser.run(ids.superAdminId, ids.workspaceId, 'Super', 'Admin', 'Super Admin', 'super@example.com', 'legal_super', passwordHash, 'super_admin');
  insertUser.run(ids.teacherId, ids.workspaceId, 'Teacher', 'User', 'Teacher User', 'teacher@example.com', 'legal_teacher', passwordHash, 'teacher');
  db.close();
}

async function request(method, route, { token = '', body, expectedStatus = 200 } = {}) {
  const headers = {
    Cookie: `csrf_token=${csrfToken}`
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    headers['x-csrf-token'] = csrfToken;
  }
  const res = await fetch(`${baseUrl}${route}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (_err) {
    json = { raw: text };
  }
  assert.strictEqual(res.status, expectedStatus, `${method} ${route} => ${res.status} ${JSON.stringify(json)}`);
  return json;
}

async function login(email) {
  const payload = await request('POST', '/api/auth/login', {
    body: { email, password: 'Passw0rd!' }
  });
  assert.ok(payload?.accessToken, `Expected access token for ${email}`);
  return payload.accessToken;
}

function getAcceptanceCount(dbPath) {
  const db = new Database(dbPath, { readonly: true });
  const row = db.prepare(`SELECT COUNT(*) AS c FROM legal_acceptances`).get();
  db.close();
  return Number(row?.c || 0);
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
      ATTENDANCE_DB_ENGINE: 'sqlite'
    },
    stdio: 'inherit'
  });

  try {
    await waitForServer(baseUrl);
    seedDatabase(sqlitePath);

    const superToken = await login('super@example.com');
    const teacherToken = await login('teacher@example.com');

    const initial = await request('GET', '/api/admin/legal-settings', { token: superToken });
    assert.ok(initial.settings, 'super_admin should read legal settings');

    const draftPayload = {
      company_name: 'StudiesTalk GmbH',
      operator_name: 'Md Golam Rabbani',
      legal_address: 'Example Street 1, 45127 Essen, Germany',
      legal_email: 'legal@studiestalk.example',
      privacy_email: 'privacy@studiestalk.example',
      support_email: 'support@studiestalk.example',
      hosting_provider: 'Hetzner',
      ai_provider: 'OpenAI',
      email_provider: 'SendGrid',
      storage_provider: 'AWS S3',
      recording_retention_days: 30,
      security_log_retention_days: 90,
      backup_retention_days: 14,
      learning_data_retention_months: 12,
      liability_text: 'Liability draft',
      sla_text: 'SLA draft',
      gdpr_dpa_text: 'DPA draft',
      ai_notice_text: 'AI notice draft',
      recording_notice_text: 'Recording notice draft',
      cookie_notice_text: 'Cookie notice draft'
    };

    const updated = await request('PUT', '/api/admin/legal-settings', {
      token: superToken,
      body: draftPayload
    });
    assert.strictEqual(updated.settings.company_name, 'StudiesTalk GmbH');

    await request('PUT', '/api/admin/legal-settings', {
      token: teacherToken,
      body: draftPayload,
      expectedStatus: 403
    });

    await request('GET', '/api/public/legal-settings', { expectedStatus: 404 });

    const docs = [
      ['privacy', '2026.04', 'Privacy Policy'],
      ['terms', '2026.04', 'Terms of Service'],
      ['impressum', '2026.04', 'Impressum'],
      ['cookies', '2026.04', 'Cookie Policy'],
      ['dpa', '2026.04', 'Data Processing Agreement']
    ];

    const createdDocs = [];
    for (const [documentType, version, title] of docs) {
      const created = await request('POST', '/api/admin/legal-versions', {
        token: superToken,
        body: {
          document_type: documentType,
          locale: documentType === 'impressum' ? 'de' : 'en',
          version,
          title,
          body: `${title}\n\nPublished legal smoke document.`
        },
        expectedStatus: 201
      });
      assert.strictEqual(created.version.document_type, documentType);
      createdDocs.push(created.version);
    }

    for (const item of createdDocs) {
      const published = await request('POST', `/api/admin/legal-versions/${encodeURIComponent(item.id)}/publish`, {
        token: superToken,
        body: {}
      });
      assert.strictEqual(published.version.is_active, true);
    }

    await request('POST', '/api/admin/legal-settings/publish', {
      token: superToken,
      body: {}
    });

    const publicSettings = await request('GET', '/api/public/legal-settings');
    assert.strictEqual(publicSettings.settings.company_name, 'StudiesTalk GmbH');

    const publicPrivacy = await request('GET', '/api/public/legal/privacy?locale=en');
    assert.strictEqual(publicPrivacy.document.documentType, 'privacy');
    assert.strictEqual(publicPrivacy.document.version, '2026.04');

    const publicDpa = await request('GET', '/api/public/legal/dpa?locale=en');
    assert.strictEqual(publicDpa.document.documentType, 'dpa');
    assert.strictEqual(publicDpa.document.version, '2026.04');

    const dpaPage = await request('GET', '/dpa');
    assert.ok(String(dpaPage.raw || '').includes('Data Processing Agreement'));

    const trustPage = await request('GET', '/trust');
    assert.ok(String(trustPage.raw || '').includes('StudiesTalk Trust &amp; Security'));

    const requiredBefore = await request('GET', '/api/legal/required-acceptance', { token: teacherToken });
    assert.ok(Array.isArray(requiredBefore.required));
    assert.strictEqual(requiredBefore.required.length, 3);

    for (const item of requiredBefore.required) {
      await request('POST', `/api/legal/${encodeURIComponent(item.documentType)}/accept`, {
        token: teacherToken,
        body: { locale: item.locale }
      });
    }

    assert.strictEqual(getAcceptanceCount(sqlitePath), 3);

    const requiredAfter = await request('GET', '/api/legal/required-acceptance', { token: teacherToken });
    assert.strictEqual(requiredAfter.required.length, 0);

    console.log('[legal-smoke] passed');
  } finally {
    child.kill('SIGTERM');
    await wait(500);
    if (fs.existsSync(sqlitePath)) fs.unlinkSync(sqlitePath);
  }
}

main().catch((error) => {
  console.error('[legal-smoke] failed:', error?.stack || error?.message || error);
  process.exit(1);
});
