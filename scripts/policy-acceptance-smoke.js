#!/usr/bin/env node
'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const Database = require('better-sqlite3');

const runId = `policy_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
const port = 4100 + Math.floor(Math.random() * 200);
const baseUrl = `http://127.0.0.1:${port}`;
const sqlitePath = path.join(os.tmpdir(), `${runId}.sqlite`);
const csrfToken = `csrf_${runId}`;
const policyVersionV1 = '2026-04-23';
const policyVersionV2 = '2026-05-01';

const ids = {
  workspaceId: `ws_${runId}`,
  newAdminWorkspaceId: `ws_new_admin_${runId}`,
  adminId: `admin_${runId}`,
  newAdminId: `admin_new_${runId}`,
  teacherId: `teacher_${runId}`,
  studentId: `student_${runId}`,
  superAdminId: `super_${runId}`,
  classChannelId: `class_${runId}`
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
  ensureColumn('avatar_url', `ALTER TABLE users ADD COLUMN avatar_url TEXT;`);
  ensureColumn('must_change_password', `ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0;`);
  ensureColumn('temp_login_started_at', `ALTER TABLE users ADD COLUMN temp_login_started_at INTEGER;`);
  ensureColumn('course_start', `ALTER TABLE users ADD COLUMN course_start TEXT;`);
  ensureColumn('course_end', `ALTER TABLE users ADD COLUMN course_end TEXT;`);

  db.prepare(`
    INSERT INTO workspaces (id, name, status, admin_email, created_at)
    VALUES (?, 'StudiesTalk Smoke School', 'approved', 'admin@example.com', datetime('now'))
  `).run(ids.workspaceId);
  db.prepare(`
    INSERT INTO workspaces (id, name, status, admin_email, created_at)
    VALUES (?, 'New Admin Smoke School', 'approved', 'admin.new@example.com', datetime('now'))
  `).run(ids.newAdminWorkspaceId);

  const insertUser = db.prepare(`
    INSERT INTO users
    (id, workspace_id, first_name, last_name, name, email, username, password_hash, role, status, native_language, native_language_confirmed, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 'en', 1, datetime('now'))
  `);
  insertUser.run(ids.adminId, ids.workspaceId, 'School', 'Admin', 'School Admin', 'admin@example.com', 'admin_smoke', passwordHash, 'school_admin');
  insertUser.run(ids.newAdminId, ids.newAdminWorkspaceId, 'New', 'Admin', 'New Admin', 'admin.new@example.com', 'admin_new_smoke', passwordHash, 'school_admin');
  insertUser.run(ids.teacherId, ids.workspaceId, 'Teacher', 'User', 'Teacher User', 'teacher@example.com', 'teacher_smoke', passwordHash, 'teacher');
  insertUser.run(ids.studentId, ids.workspaceId, 'Student', 'User', 'Student User', 'student@example.com', 'student_smoke', passwordHash, 'student');
  insertUser.run(ids.superAdminId, ids.workspaceId, 'Super', 'Admin', 'Super Admin', 'super@example.com', 'super_smoke', passwordHash, 'super_admin');

  db.prepare(`
    INSERT INTO channels (id, workspace_id, name, topic, members, unread, category, created_at)
    VALUES (?, ?, 'A1 Morning', 'Smoke channel', 3, 0, 'classes', datetime('now'))
  `).run(ids.classChannelId, ids.workspaceId);

  const addMember = db.prepare('INSERT INTO channel_members (channel_id, user_id) VALUES (?, ?)');
  addMember.run(ids.classChannelId, ids.adminId);
  addMember.run(ids.classChannelId, ids.teacherId);
  addMember.run(ids.classChannelId, ids.studentId);

  db.prepare(`
    INSERT INTO workspace_profile (workspace_id, street, house_number, postal_code, city, state, country, phone, website, updated_at)
    VALUES (?, 'Demo Street', '7', '47051', 'Duisburg', 'NRW', 'Germany', '+49 203 555', 'https://school.example.com', datetime('now'))
  `).run(ids.workspaceId);

  db.prepare(`
    INSERT INTO workspace_email_settings (workspace_id, enabled, reply_to_email, brand_school_name, updated_at)
    VALUES (?, 1, 'support@school.example.com', 'StudiesTalk Smoke School', datetime('now'))
  `).run(ids.workspaceId);

  db.prepare(`
    INSERT INTO platform_settings (key, value, updated_at)
    VALUES ('workspace_policy_version_default', ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(policyVersionV1);

  db.close();
}

function completeOnboardingDirectly(dbPath, workspaceId, adminId) {
  const db = new Database(dbPath);
  db.prepare(`
    INSERT INTO workspace_onboarding (id, workspace_id, status, current_step, completed_at, created_at, updated_at, completed_by_user_id)
    VALUES (?, ?, 'completed', 'launch_checklist', datetime('now'), datetime('now'), datetime('now'), ?)
    ON CONFLICT(workspace_id) DO UPDATE SET
      status = 'completed',
      current_step = 'launch_checklist',
      completed_at = datetime('now'),
      updated_at = datetime('now'),
      completed_by_user_id = excluded.completed_by_user_id
  `).run(`ob_${crypto.randomUUID()}`, workspaceId, adminId);
  db.close();
}

function setPolicyVersion(dbPath, version) {
  const db = new Database(dbPath);
  db.prepare(`
    INSERT INTO platform_settings (key, value, updated_at)
    VALUES ('workspace_policy_version_default', ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(version);
  db.close();
}

function getAcceptanceRow(dbPath, userId, version) {
  return getAcceptanceRowForWorkspace(dbPath, ids.workspaceId, userId, version);
}

function getAcceptanceRowForWorkspace(dbPath, workspaceId, userId, version) {
  const db = new Database(dbPath, { readonly: true });
  const row = db.prepare(`
    SELECT workspace_id AS workspaceId, user_id AS userId, version, accepted_at AS acceptedAt
    FROM policy_acceptances
    WHERE workspace_id = ? AND user_id = ? AND version = ?
    LIMIT 1
  `).get(workspaceId, userId, version) || null;
  db.close();
  return row;
}

async function request(method, route, { token = '', body, expectedStatus = 200 } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    headers['x-csrf-token'] = csrfToken;
  }
  const res = await fetch(`${baseUrl}${route}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    redirect: 'manual',
    credentials: 'omit',
    headers: {
      ...headers,
      Cookie: `csrf_token=${csrfToken}`
    }
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

    const newAdminToken = await login('admin.new@example.com');
    const newAdminMe = await request('GET', '/api/auth/me', { token: newAdminToken });
    assert.strictEqual(newAdminMe.user.workspaceId, ids.newAdminWorkspaceId);
    await request('GET', '/api/dms', { token: newAdminToken, expectedStatus: 403 }).then((payload) => {
      assert.strictEqual(payload.code, 'onboarding_required');
    });

    completeOnboardingDirectly(sqlitePath, ids.newAdminWorkspaceId, ids.newAdminId);
    await wait(3200);
    await request('GET', '/api/dms', { token: newAdminToken, expectedStatus: 403 }).then((payload) => {
      assert.strictEqual(payload.code, 'policy_acceptance_required');
    });

    const adminPolicy = await request('GET', `/api/workspaces/${ids.newAdminWorkspaceId}/policy`, { token: newAdminToken });
    assert.strictEqual(adminPolicy.document.version, policyVersionV1);
    assert.strictEqual(adminPolicy.policyGate.required, true);

    const adminAccepted = await request('POST', `/api/workspaces/${ids.newAdminWorkspaceId}/policy/accept`, {
      token: newAdminToken,
      body: { version: policyVersionV1 }
    });
    assert.strictEqual(adminAccepted.ok, true);
    assert.ok(
      getAcceptanceRowForWorkspace(sqlitePath, ids.newAdminWorkspaceId, ids.newAdminId, policyVersionV1),
      'new admin acceptance row should exist'
    );
    await request('GET', '/api/dms', { token: newAdminToken, expectedStatus: 200 });

    const teacherToken = await login('teacher@example.com');
    await request('GET', '/api/channels', { token: teacherToken, expectedStatus: 403 }).then((payload) => {
      assert.strictEqual(payload.code, 'policy_acceptance_required');
    });
    await request('POST', `/api/workspaces/${ids.workspaceId}/policy/accept`, {
      token: teacherToken,
      body: { version: policyVersionV1 }
    });
    assert.ok(getAcceptanceRow(sqlitePath, ids.teacherId, policyVersionV1), 'teacher acceptance row should exist');
    await request('GET', '/api/channels', { token: teacherToken, expectedStatus: 200 });

    const studentToken = await login('student@example.com');
    await request('GET', '/api/channels', { token: studentToken, expectedStatus: 403 }).then((payload) => {
      assert.strictEqual(payload.code, 'policy_acceptance_required');
    });
    await request('POST', `/api/workspaces/${ids.workspaceId}/policy/accept`, {
      token: studentToken,
      body: { version: policyVersionV1 }
    });
    await request('GET', '/api/channels', { token: studentToken, expectedStatus: 200 });

    const teacherMeAccepted = await request('GET', '/api/auth/me', { token: teacherToken });
    assert.strictEqual(teacherMeAccepted.user.policyGate.required, false);
    assert.strictEqual(teacherMeAccepted.user.policyGate.accepted, true);

    setPolicyVersion(sqlitePath, policyVersionV2);
    await wait(3200);
    await request('GET', '/api/channels', { token: teacherToken, expectedStatus: 403 }).then((payload) => {
      assert.strictEqual(payload.code, 'policy_acceptance_required');
    });
    const teacherPolicyV2 = await request('GET', `/api/workspaces/${ids.workspaceId}/policy`, { token: teacherToken });
    assert.strictEqual(teacherPolicyV2.document.version, policyVersionV2);
    await request('POST', `/api/workspaces/${ids.workspaceId}/policy/accept`, {
      token: teacherToken,
      body: { version: policyVersionV2 }
    });
    assert.ok(getAcceptanceRow(sqlitePath, ids.teacherId, policyVersionV2), 'teacher should re-accept changed version');

    await request('POST', '/api/auth/logout', {
      token: studentToken,
      body: {},
      expectedStatus: 200
    }).then((payload) => {
      assert.strictEqual(payload.ok, true);
    });

    const superToken = await login('super@example.com');
    const superMe = await request('GET', '/api/auth/me', { token: superToken });
    assert.strictEqual(superMe.user.policyGate.exempt, true);
    await request('GET', '/api/channels', { token: superToken, expectedStatus: 200 });

    console.log('policy-acceptance smoke passed');
  } finally {
    child.kill('SIGTERM');
    await wait(400);
    if (fs.existsSync(sqlitePath)) {
      fs.unlinkSync(sqlitePath);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
