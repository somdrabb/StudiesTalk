#!/usr/bin/env node
'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const Database = require('better-sqlite3');
const jwt = require('jsonwebtoken');

const { createBillingRepository } = require('../server/repositories/billingRepository');
const { createOnboardingRepository } = require('../server/repositories/onboardingRepository');
const ENV = require('../server/env');

const runId = `onboarding_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
const dbPath = path.join(os.tmpdir(), `${runId}.sqlite`);

function setupSchema(db) {
  db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      school_code TEXT,
      status TEXT DEFAULT 'approved',
      admin_email TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      first_name TEXT NOT NULL DEFAULT '',
      last_name TEXT NOT NULL DEFAULT '',
      name TEXT,
      username TEXT,
      email TEXT,
      password_hash TEXT,
      role TEXT,
      status TEXT DEFAULT 'active',
      native_language TEXT DEFAULT 'en',
      native_language_confirmed INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE channels (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      name TEXT NOT NULL,
      category TEXT DEFAULT 'classes'
    );

    CREATE TABLE announcements (
      id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL
    );

    CREATE TABLE live_sessions (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL
    );

    CREATE TABLE homework_items (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL
    );

    CREATE TABLE tasks (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL
    );

    CREATE TABLE workspace_profile (
      workspace_id TEXT PRIMARY KEY,
      street TEXT DEFAULT '',
      house_number TEXT DEFAULT '',
      postal_code TEXT DEFAULT '',
      city TEXT DEFAULT '',
      state TEXT DEFAULT '',
      country TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      website TEXT DEFAULT '',
      opening_hours_json TEXT DEFAULT '',
      registration_details TEXT DEFAULT ''
    );

    CREATE TABLE workspace_settings_admin (
      workspace_id TEXT PRIMARY KEY,
      settings_json TEXT NOT NULL DEFAULT '{}',
      updated_at INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE workspace_email_settings (
      workspace_id TEXT PRIMARY KEY,
      enabled INTEGER NOT NULL DEFAULT 0,
      brand_school_name TEXT DEFAULT '',
      reply_to_email TEXT DEFAULT '',
      signature_html TEXT DEFAULT '',
      subject_prefix TEXT DEFAULT ''
    );

    CREATE TABLE workspace_billing (
      workspace_id TEXT PRIMARY KEY,
      plan TEXT NOT NULL,
      status TEXT NOT NULL,
      currency TEXT NOT NULL,
      monthly_price_cents INTEGER NOT NULL DEFAULT 0,
      billing_email TEXT,
      invoice_contact_name TEXT,
      readiness_acknowledged_at TEXT,
      readiness_acknowledged_by_user_id TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE ai_budget_settings (
      id TEXT PRIMARY KEY,
      workspace_id TEXT,
      monthly_limit_eur REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT '',
      UNIQUE (workspace_id)
    );

    CREATE TABLE workspace_onboarding (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'not_started',
      current_step TEXT DEFAULT 'welcome',
      started_at TEXT,
      completed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      started_by_user_id TEXT,
      completed_by_user_id TEXT
    );

    CREATE TABLE workspace_onboarding_steps (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      step_key TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      completed_at TEXT,
      completed_by_user_id TEXT,
      meta_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (workspace_id, step_key)
    );

    CREATE TABLE workspace_onboarding_events (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      user_id TEXT,
      event_type TEXT NOT NULL,
      step_key TEXT,
      payload_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );

    CREATE TABLE workspace_activation_metrics (
      workspace_id TEXT PRIMARY KEY,
      teachers_count INTEGER NOT NULL DEFAULT 0,
      students_count INTEGER NOT NULL DEFAULT 0,
      classes_count INTEGER NOT NULL DEFAULT 0,
      channels_count INTEGER NOT NULL DEFAULT 0,
      live_sessions_count INTEGER NOT NULL DEFAULT 0,
      homework_count INTEGER NOT NULL DEFAULT 0,
      announcements_count INTEGER NOT NULL DEFAULT 0,
      ai_enabled INTEGER NOT NULL DEFAULT 0,
      billing_ready INTEGER NOT NULL DEFAULT 0,
      activation_score INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );
  `);
}

function insertBaseWorkspace(db, workspaceId, adminId) {
  db.prepare(`
    INSERT INTO workspaces (id, name, school_code, status, admin_email, created_at)
    VALUES (?, ?, ?, 'approved', ?, datetime('now'))
  `).run(workspaceId, 'Onboarding Smoke School', `SC-${workspaceId.slice(0, 8)}`, 'admin@example.com');

  db.prepare(`
    INSERT INTO users (id, workspace_id, first_name, last_name, name, username, email, role, status)
    VALUES (?, ?, 'School', 'Admin', ?, ?, ?, 'school_admin', 'active')
  `).run(adminId, workspaceId, 'School Admin', 'school_admin', 'admin@example.com');
}

function seedLegacyWorkspaceEvidence(db, workspaceId, { teacherId, studentId, classId, liveId, homeworkId, announcementId }) {
  db.prepare(`
    INSERT INTO workspace_profile (workspace_id, street, house_number, postal_code, city, state, country, phone, website, opening_hours_json, registration_details)
    VALUES (?, 'Legacystrasse', '5A', '10115', 'Berlin', 'Berlin', 'DE', '+49 30 555', 'https://legacy.example.com', ?, 'Registry HRB 123456')
  `).run(workspaceId, JSON.stringify({ timezone: 'Europe/Berlin', text: 'Mon-Fri 09:00-18:00', details: { days: [{ day: 'Monday', label: 'Monday', open: '09:00', close: '18:00' }] } }));
  db.prepare(`
    INSERT INTO workspace_settings_admin (workspace_id, settings_json, updated_at)
    VALUES (?, ?, 0)
    ON CONFLICT(workspace_id) DO UPDATE SET settings_json = excluded.settings_json, updated_at = excluded.updated_at
  `).run(workspaceId, JSON.stringify({ timezone: 'Europe/Berlin' }));
  db.prepare(`
    INSERT INTO workspace_email_settings (workspace_id, enabled, reply_to_email, brand_school_name)
    VALUES (?, 1, 'contact@legacy.example.com', 'Legacy School')
  `).run(workspaceId);
  db.prepare(`
    INSERT INTO users (id, workspace_id, first_name, last_name, name, username, email, role, status)
    VALUES
    (?, ?, 'Teacher', 'Legacy', 'Teacher Legacy', 'teacher_legacy', 'teacher.legacy@example.com', 'teacher', 'active'),
    (?, ?, 'Student', 'Legacy', 'Student Legacy', 'student_legacy', 'student.legacy@example.com', 'student', 'active')
  `).run(teacherId, workspaceId, studentId, workspaceId);
  db.prepare(`
    INSERT INTO channels (id, workspace_id, name, category)
    VALUES (?, ?, 'Legacy A1', 'classes')
  `).run(classId, workspaceId);
  const liveSessionColumns = new Set(db.prepare(`PRAGMA table_info(live_sessions)`).all().map((row) => String(row.name || '')));
  if (liveSessionColumns.has('channel_id')) {
    db.prepare(`
      INSERT INTO live_sessions (id, workspace_id, channel_id, title, date, start_time, end_time, meeting_url, status)
      VALUES (?, ?, ?, 'Legacy Live Class', '2026-04-23', '09:00', '10:00', 'https://meet.example.com/legacy-live', 'scheduled')
    `).run(liveId, workspaceId, classId);
  } else {
    db.prepare(`
      INSERT INTO live_sessions (id, workspace_id)
      VALUES (?, ?)
    `).run(liveId, workspaceId);
  }
  const homeworkColumns = new Set(db.prepare(`PRAGMA table_info(homework_items)`).all().map((row) => String(row.name || '')));
  if (homeworkColumns.has('class_channel_id')) {
    db.prepare(`
      INSERT INTO homework_items (id, workspace_id, class_channel_id, title)
      VALUES (?, ?, ?, 'Legacy homework')
    `).run(homeworkId, workspaceId, classId);
  } else {
    db.prepare(`
      INSERT INTO homework_items (id, workspace_id)
      VALUES (?, ?)
    `).run(homeworkId, workspaceId);
  }
  const announcementColumns = new Set(db.prepare(`PRAGMA table_info(announcements)`).all().map((row) => String(row.name || '')));
  if (announcementColumns.has('workspace_id')) {
    db.prepare(`
      INSERT INTO announcements (id, channel_id, workspace_id, title, status, priority, content)
      VALUES (?, ?, ?, 'Legacy announcement', 'published', 'normal', 'Legacy school already configured')
    `).run(announcementId, classId, workspaceId);
  } else {
    db.prepare(`
      INSERT INTO announcements (id, channel_id)
      VALUES (?, ?)
    `).run(announcementId, classId);
  }
}

function authToken(user) {
  return jwt.sign(
    {
      jti: `at_${crypto.randomBytes(8).toString('hex')}`,
      sub: user.id,
      role: String(user.role || '').toLowerCase(),
      workspaceId: user.workspaceId,
      email: user.email,
      name: user.name,
      superAdmin: !!user.superAdmin
    },
    ENV.JWT_ACCESS_SECRET,
    { expiresIn: '15m' }
  );
}

async function sleep(ms) {
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
  throw new Error('Onboarding smoke server did not become ready in time');
}

async function api(baseUrl, method, route, token, body, { expectStatus = 200 } = {}) {
  const csrfToken = `csrf_${runId}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    Cookie: `csrf_token=${csrfToken}`
  };
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(String(method || '').toUpperCase())) {
    headers['x-csrf-token'] = csrfToken;
  }
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(`${baseUrl}${route}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch (_err) {
    payload = { raw: text };
  }
  if (res.status !== expectStatus) {
    throw new Error(`${method} ${route} expected ${expectStatus} got ${res.status} ${JSON.stringify(payload)}`);
  }
  return payload;
}

function getPolicyAcceptanceRow(dbPath, workspaceId, userId, version) {
  const db = new Database(dbPath, { readonly: true });
  try {
    return db.prepare(`
      SELECT workspace_id AS workspaceId, user_id AS userId, version, accepted_at AS acceptedAt
      FROM policy_acceptances
      WHERE workspace_id = ? AND user_id = ? AND version = ?
      LIMIT 1
    `).get(workspaceId, userId, version) || null;
  } finally {
    db.close();
  }
}

async function acceptCurrentWorkspacePolicy(baseUrl, dbPath, workspaceId, userId, token) {
  const policy = await api(baseUrl, 'GET', `/api/workspaces/${encodeURIComponent(workspaceId)}/policy`, token);
  const version = String(policy?.document?.version || '').trim();
  assert.ok(version, `workspace ${workspaceId} should expose a current policy version`);
  assert.strictEqual(policy?.policyGate?.required, true, 'policy gate should remain active before acceptance');
  const accepted = await api(
    baseUrl,
    'POST',
    `/api/workspaces/${encodeURIComponent(workspaceId)}/policy/accept`,
    token,
    { version }
  );
  assert.strictEqual(accepted?.ok, true, 'policy acceptance should succeed');
  assert.ok(
    getPolicyAcceptanceRow(dbPath, workspaceId, userId, version),
    `acceptance row should exist for ${workspaceId}/${userId}/${version}`
  );
  return version;
}

async function runServerGateSmoke() {
  const port = 3900 + Math.floor(Math.random() * 200);
  const baseUrl = `http://127.0.0.1:${port}`;
  const httpDbPath = path.join(os.tmpdir(), `${runId}.http.sqlite`);
  if (fs.existsSync(httpDbPath)) fs.unlinkSync(httpDbPath);

  const child = spawn(process.execPath, ['server.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: 'development',
      PORT: String(port),
      DB_PATH: httpDbPath
    },
    stdio: 'ignore'
  });

  const workspaceId = `http_ws_${runId}`;
  const adminId = `http_admin_${runId}`;
  const superAdminId = `http_super_${runId}`;
  const teacherId = `http_teacher_${runId}`;
  const studentId = `http_student_${runId}`;
  const classId = `http_class_${runId}`;
  const legacyWorkspaceId = `legacy_ws_${runId}`;
  const legacyAdminId = `legacy_admin_${runId}`;
  const legacyTeacherId = `legacy_teacher_${runId}`;
  const legacyStudentId = `legacy_student_${runId}`;
  const legacyClassId = `legacy_class_${runId}`;
  const policyVersion = '2026-04-23';
  const token = authToken({
    id: adminId,
    role: 'school_admin',
    workspaceId,
    email: 'admin@example.com',
    name: 'School Admin'
  });
  const superToken = authToken({
    id: superAdminId,
    role: 'super_admin',
    workspaceId,
    email: 'super@example.com',
    name: 'Super Admin',
    superAdmin: true
  });
  const legacyToken = authToken({
    id: legacyAdminId,
    role: 'school_admin',
    workspaceId: legacyWorkspaceId,
    email: 'legacy-admin@example.com',
    name: 'Legacy Admin'
  });

  try {
    await waitForServer(baseUrl);
    const db = new Database(httpDbPath);
    try {
      insertBaseWorkspace(db, workspaceId, adminId);
      insertBaseWorkspace(db, legacyWorkspaceId, legacyAdminId);
      db.prepare(`
        INSERT INTO workspace_billing (workspace_id, plan, status, currency, monthly_price_cents, billing_email, updated_at)
        VALUES (?, 'free', 'active', 'EUR', 0, 'admin@example.com', datetime('now'))
      `).run(workspaceId);
	      db.prepare(`
	        INSERT INTO workspace_billing (workspace_id, plan, status, currency, monthly_price_cents, billing_email, updated_at)
	        VALUES (?, 'free', 'active', 'EUR', 0, 'legacy-admin@example.com', datetime('now'))
	      `).run(legacyWorkspaceId);
	      db.prepare(`
	        INSERT INTO platform_settings (key, value, updated_at)
	        VALUES ('workspace_policy_version_default', ?, datetime('now'))
	        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
	      `).run(policyVersion);
	      seedLegacyWorkspaceEvidence(db, legacyWorkspaceId, {
	        teacherId: legacyTeacherId,
	        studentId: legacyStudentId,
        classId: legacyClassId,
        liveId: `legacy_live_${runId}`,
        homeworkId: `legacy_homework_${runId}`,
        announcementId: `legacy_announcement_${runId}`
      });
    } finally {
      db.close();
    }

    const onboarding = await api(baseUrl, 'GET', `/api/workspaces/${encodeURIComponent(workspaceId)}/onboarding`, token);
    assert.strictEqual(onboarding?.onboarding?.workspaceId, workspaceId, 'canonical onboarding route should work under the gate');
    assert.strictEqual(onboarding?.onboarding?.visibility?.shouldAutoOpen, true, 'new school should auto-open onboarding on first login');
    assert.strictEqual(onboarding?.onboarding?.summary?.workspace?.slug, workspaceId, 'onboarding summary should expose workspace slug');
    assert.strictEqual(onboarding?.onboarding?.summary?.workspace?.schoolCode?.startsWith('SC-'), true, 'onboarding summary should expose school code when available');

    const persistedCurrentStep = await api(
      baseUrl,
      'PATCH',
      `/api/workspaces/${encodeURIComponent(workspaceId)}/onboarding/steps/welcome`,
      token,
      { currentStep: 'staff_setup', meta: { source: 'smoke-current-step' } }
    );
    assert.strictEqual(persistedCurrentStep?.onboarding?.currentStep, 'staff_setup', 'current step should persist without spoofing completion');
    const reloadedCurrentStep = await api(baseUrl, 'GET', `/api/workspaces/${encodeURIComponent(workspaceId)}/onboarding`, token);
    assert.strictEqual(reloadedCurrentStep?.onboarding?.currentStep, 'staff_setup', 'current step should survive a fresh read');

	    const blocked = await api(
	      baseUrl,
	      'GET',
	      `/api/analytics/school-overview?workspaceId=${encodeURIComponent(workspaceId)}`,
      token,
      undefined,
      { expectStatus: 403 }
	    );
	    assert.strictEqual(blocked?.code, 'onboarding_required', 'unrelated API should be server-blocked until onboarding completes');

    const seen = await api(
      baseUrl,
      'PATCH',
      `/api/workspaces/${encodeURIComponent(workspaceId)}/onboarding`,
      token,
      { action: 'acknowledge_auto_open', meta: { source: 'smoke-auto-open' } }
    );
    assert.strictEqual(seen?.onboarding?.visibility?.shouldAutoOpen, false, 'auto-open should only trigger once');

	    const superUnblocked = await api(
	      baseUrl,
	      'GET',
	      `/api/analytics/school-overview?workspaceId=${encodeURIComponent(workspaceId)}`,
	      superToken
	    );
	    assert(superUnblocked?.summary, 'super admin should not be blocked by onboarding');
	    await acceptCurrentWorkspacePolicy(baseUrl, httpDbPath, workspaceId, adminId, token);
	    const protectedAfterAcceptance = await api(
	      baseUrl,
	      'GET',
	      `/api/analytics/school-overview?workspaceId=${encodeURIComponent(workspaceId)}`,
	      token
	    );
	    assert(protectedAfterAcceptance?.summary, 'protected workspace API should reopen after policy acceptance');

	    const legacyOnboarding = await api(baseUrl, 'GET', `/api/workspaces/${encodeURIComponent(legacyWorkspaceId)}/onboarding`, legacyToken);
    assert.strictEqual(legacyOnboarding?.onboarding?.visibility?.shouldAutoOpen, false, 'existing school should not auto-open onboarding');
    assert.strictEqual(legacyOnboarding?.onboarding?.visibility?.hasLegacySetupEvidence, true, 'existing school should suppress auto-open because setup evidence exists');
    assert.strictEqual(legacyOnboarding?.onboarding?.summary?.profile?.city, 'Berlin', 'legacy onboarding summary should expose real school profile fields');
    assert.strictEqual(legacyOnboarding?.onboarding?.summary?.communication?.schoolEmailConfigured, true, 'legacy onboarding summary should expose communication readiness');
	    const legacyUnblocked = await api(
	      baseUrl,
	      'GET',
	      `/api/analytics/school-overview?workspaceId=${encodeURIComponent(legacyWorkspaceId)}`,
	      legacyToken,
	      undefined,
	      { expectStatus: 403 }
	    );
	    assert.strictEqual(legacyUnblocked?.code, 'policy_acceptance_required', 'existing school should also hand off to the policy gate');
	    await acceptCurrentWorkspacePolicy(baseUrl, httpDbPath, legacyWorkspaceId, legacyAdminId, legacyToken);
	    const legacyAccepted = await api(
	      baseUrl,
	      'GET',
	      `/api/analytics/school-overview?workspaceId=${encodeURIComponent(legacyWorkspaceId)}`,
	      legacyToken
	    );
	    assert(legacyAccepted?.summary, 'existing school should regain normal app access after policy acceptance');

    const wrongWorkspace = await api(
      baseUrl,
      'GET',
      `/api/workspaces/${encodeURIComponent(`wrong_${workspaceId}`)}/onboarding`,
      token,
      undefined,
      { expectStatus: 403 }
    );
    assert.strictEqual(wrongWorkspace?.error, 'Wrong workspace', 'workspace scoping should be enforced');

    const emailSettings = await api(baseUrl, 'GET', `/api/workspaces/${encodeURIComponent(workspaceId)}/email-settings`, token);
    assert.strictEqual(emailSettings?.workspace_id, workspaceId, 'email settings should remain allowlisted during onboarding');

    const invalidProfile = await api(baseUrl, 'PATCH', `/api/workspaces/${encodeURIComponent(workspaceId)}/profile`, token, {
      website: 'not-a-valid-url',
      phone: '###'
    }, { expectStatus: 400 });
    assert.strictEqual(typeof invalidProfile?.error, 'string', 'invalid school profile input should be rejected cleanly');

    const invalidBilling = await api(baseUrl, 'PATCH', `/api/workspaces/${encodeURIComponent(workspaceId)}/billing-profile`, token, {
      billingEmail: 'not-an-email'
    }, { expectStatus: 400 });
    assert.strictEqual(typeof invalidBilling?.error, 'string', 'invalid billing input should be rejected cleanly');

    const profile = await api(baseUrl, 'PATCH', `/api/workspaces/${encodeURIComponent(workspaceId)}/profile`, token, {
      workspaceName: 'HTTP Onboarding School',
      street: 'Schoolstrasse 1',
      houseNumber: '18',
      postalCode: '10437',
      city: 'Berlin',
      state: 'Berlin',
      country: 'DE',
      phone: '+49 30 123456',
      website: 'https://school.example.com',
      openingHours: 'Mon-Fri 09:00-18:00',
      openingHoursDetails: { days: [{ day: 'Monday', label: 'Monday', open: '09:00', close: '18:00' }] },
      registrationDetails: 'Registry HRB 9000'
    });
    assert.strictEqual(profile?.workspaceId, workspaceId, 'profile route should remain gate-allowed');

    const savedEmailSettings = await api(baseUrl, 'POST', `/api/workspaces/${encodeURIComponent(workspaceId)}/email-settings`, token, {
      enabled: true,
      brand_school_name: 'HTTP Onboarding School',
      reply_to_email: 'contact@school.example.com',
      subject_prefix: '[StudiesTalk]',
      manual_body_text: 'School launch communication is configured.'
    });
    assert.strictEqual(savedEmailSettings?.ok, true, 'email settings should be writable during onboarding');

    const billingProfile = await api(baseUrl, 'PATCH', `/api/workspaces/${encodeURIComponent(workspaceId)}/billing-profile`, token, {
      billingEmail: 'billing@school.example.com',
      invoiceContactName: 'Finance Lead',
      acknowledgeReadiness: true
    });
    assert.strictEqual(billingProfile?.billing?.invoiceContactName, 'Finance Lead', 'billing profile should be writable during onboarding');
    const afterProfileSummary = await api(baseUrl, 'GET', `/api/workspaces/${encodeURIComponent(workspaceId)}/onboarding`, token);
    assert.strictEqual(afterProfileSummary?.onboarding?.summary?.profile?.houseNumber, '18', 'summary should expose address details after profile save');
    assert.strictEqual(afterProfileSummary?.onboarding?.summary?.profile?.registrationDetails, 'Registry HRB 9000', 'summary should expose legal details after profile save');

    await api(baseUrl, 'POST', `/api/onboarding/${encodeURIComponent(workspaceId)}/steps/welcome/complete`, token, {});
    const falseComplete = await api(
      baseUrl,
      'POST',
      `/api/onboarding/${encodeURIComponent(workspaceId)}/steps/live_class_setup/complete`,
      token,
      {},
      { expectStatus: 400 }
    );
    assert.strictEqual(falseComplete?.code, 'onboarding_evidence_required', 'required steps should not complete without evidence');

    const blockedActivation = await api(
      baseUrl,
      'POST',
      `/api/workspaces/${encodeURIComponent(workspaceId)}/onboarding/activate`,
      token,
      {},
      { expectStatus: 400 }
    );
    assert.strictEqual(blockedActivation?.error, 'Workspace is not activation-ready', 'activation should still be rejected without real evidence');

    const seeded = new Database(httpDbPath);
    try {
      seeded.prepare(`
        INSERT INTO workspace_settings_admin (workspace_id, settings_json, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(workspace_id) DO UPDATE SET settings_json = excluded.settings_json, updated_at = excluded.updated_at
      `).run(workspaceId, JSON.stringify({ timezone: 'Europe/Berlin' }), Date.now());
      seeded.prepare(`
        INSERT INTO ai_budget_settings (id, workspace_id, monthly_limit_eur, created_at, updated_at)
        VALUES (?, ?, 30, datetime('now'), datetime('now'))
      `).run(`ai_budget_${workspaceId}`, workspaceId);
    } finally {
      seeded.close();
    }

    const createdTeacher = await api(baseUrl, 'POST', '/api/users', token, {
      workspaceId,
      firstName: 'Teacher',
      lastName: 'One',
      email: 'teacher@example.com',
      password: 'Secret123!',
      role: 'teacher',
      idempotencyKey: `teacher-${runId}`
    }, { expectStatus: 201 });
    const replayTeacher = await api(baseUrl, 'POST', '/api/users', token, {
      workspaceId,
      firstName: 'Teacher',
      lastName: 'One',
      email: 'teacher@example.com',
      password: 'Secret123!',
      role: 'teacher',
      idempotencyKey: `teacher-${runId}`
    });
    assert.strictEqual(replayTeacher?.id, createdTeacher?.id, 'teacher creation should be idempotent when retried');

    const createdStudent = await api(baseUrl, 'POST', '/api/users', token, {
      workspaceId,
      firstName: 'Student',
      lastName: 'One',
      email: 'student@example.com',
      password: 'Secret123!',
      role: 'student',
      idempotencyKey: `student-${runId}`
    }, { expectStatus: 201 });
    const replayStudent = await api(baseUrl, 'POST', '/api/users', token, {
      workspaceId,
      firstName: 'Student',
      lastName: 'One',
      email: 'student@example.com',
      password: 'Secret123!',
      role: 'student',
      idempotencyKey: `student-${runId}`
    });
    assert.strictEqual(replayStudent?.id, createdStudent?.id, 'student creation should be idempotent when retried');

    const createdClass = await api(baseUrl, 'POST', '/api/channels', token, {
      workspaceId,
      name: 'A1 Morning',
      category: 'classes',
      idempotencyKey: `class-${runId}`
    }, { expectStatus: 201 });
    const replayClass = await api(baseUrl, 'POST', '/api/channels', token, {
      workspaceId,
      name: 'A1 Morning',
      category: 'classes',
      idempotencyKey: `class-${runId}`
    });
    assert.strictEqual(replayClass?.id, createdClass?.id, 'class creation should be idempotent when retried');

    const createdLive = await api(baseUrl, 'POST', '/api/live-sessions', token, {
      workspaceId,
      channelId: createdClass.id,
      title: 'First Live Class',
      date: '2026-04-23',
      start_time: '09:00',
      end_time: '10:00',
      idempotencyKey: `live-${runId}`
    }, { expectStatus: 201 });
    const replayLive = await api(baseUrl, 'POST', '/api/live-sessions', token, {
      workspaceId,
      channelId: createdClass.id,
      title: 'First Live Class',
      date: '2026-04-23',
      start_time: '09:00',
      end_time: '10:00',
      idempotencyKey: `live-${runId}`
    });
    assert.strictEqual(replayLive?.id, createdLive?.id, 'live session creation should be idempotent when retried');

    const channelsPayload = await api(baseUrl, 'GET', `/api/channels?workspaceId=${encodeURIComponent(workspaceId)}`, token);
    const homeworkChannel = channelsPayload.find((channel) => String(channel.category || '').toLowerCase() === 'homework');
    const announcementsChannel = channelsPayload.find((channel) => String(channel.name || '').toLowerCase() === 'announcements');
    assert(homeworkChannel?.id, 'class creation should provision a homework channel');
    assert(announcementsChannel?.id, 'workspace should keep an announcements channel available during onboarding');

    const createdHomework = await api(baseUrl, 'POST', `/api/homework/channels/${encodeURIComponent(homeworkChannel.id)}/items`, token, {
      title: 'Welcome homework',
      description: 'Introduce yourself',
      dueDate: '2026-04-24',
      idempotencyKey: `homework-${runId}`
    }, { expectStatus: 201 });
    const replayHomework = await api(baseUrl, 'POST', `/api/homework/channels/${encodeURIComponent(homeworkChannel.id)}/items`, token, {
      title: 'Welcome homework',
      description: 'Introduce yourself',
      dueDate: '2026-04-24',
      idempotencyKey: `homework-${runId}`
    });
    assert.strictEqual(replayHomework?.item?.id, createdHomework?.item?.id, 'homework creation should be idempotent when retried');

    const seededAfterApi = new Database(httpDbPath);
    try {
      const teacherCountAfterReplay = seededAfterApi.prepare(`SELECT COUNT(*) AS c FROM users WHERE workspace_id = ? AND lower(email) = 'teacher@example.com'`).get(workspaceId).c;
      const classCountAfterReplay = seededAfterApi.prepare(`SELECT COUNT(*) AS c FROM channels WHERE workspace_id = ? AND lower(name) = 'a1 morning' AND lower(category) = 'classes'`).get(workspaceId).c;
      const liveCountAfterReplay = seededAfterApi.prepare(`SELECT COUNT(*) AS c FROM live_sessions WHERE workspace_id = ? AND title = 'First Live Class'`).get(workspaceId).c;
      const homeworkCountAfterReplay = seededAfterApi.prepare(`SELECT COUNT(*) AS c FROM homework_items WHERE workspace_id = ? AND title = 'Welcome homework'`).get(workspaceId).c;
      const blockedActivationEvents = seededAfterApi.prepare(`SELECT COUNT(*) AS c FROM workspace_onboarding_events WHERE workspace_id = ? AND event_type = 'onboarding_activation_blocked'`).get(workspaceId).c;
      assert.strictEqual(teacherCountAfterReplay, 1, 'teacher retry should not create duplicates');
      assert.strictEqual(classCountAfterReplay, 1, 'class retry should not create duplicates');
      assert.strictEqual(liveCountAfterReplay, 1, 'live session retry should not create duplicates');
      assert.strictEqual(homeworkCountAfterReplay, 1, 'homework retry should not create duplicates');
      assert(blockedActivationEvents >= 1, 'blocked activation should produce an audit event');
    } finally {
      seededAfterApi.close();
    }

    await api(baseUrl, 'POST', `/api/channels/${encodeURIComponent(announcementsChannel.id)}/announcements`, token, {
      title: 'Welcome announcement',
      content: 'School is ready for launch'
    }, { expectStatus: 201 });

    await api(baseUrl, 'POST', `/api/onboarding/${encodeURIComponent(workspaceId)}/steps/staff_setup/complete`, token, {});
    const afterSetupSummary = await api(baseUrl, 'GET', `/api/workspaces/${encodeURIComponent(workspaceId)}/onboarding`, token);
    assert.strictEqual(afterSetupSummary?.onboarding?.summary?.billing?.billingEmail, 'billing@school.example.com', 'summary should expose billing contact details');
    assert.strictEqual(afterSetupSummary?.onboarding?.summary?.communication?.replyToEmail, 'contact@school.example.com', 'summary should expose school sender details');
    await api(baseUrl, 'POST', `/api/onboarding/${encodeURIComponent(workspaceId)}/steps/academic_structure/complete`, token, {});
    await api(baseUrl, 'POST', `/api/onboarding/${encodeURIComponent(workspaceId)}/steps/student_setup/complete`, token, {});
    await api(baseUrl, 'POST', `/api/onboarding/${encodeURIComponent(workspaceId)}/steps/live_class_setup/complete`, token, {});

    const ready = await api(baseUrl, 'GET', `/api/workspaces/${encodeURIComponent(workspaceId)}/onboarding`, token);
    assert.strictEqual(ready?.onboarding?.activationReady, true, 'workspace should become activation-ready before activation');

    const deferred = await api(
      baseUrl,
      'PATCH',
      `/api/workspaces/${encodeURIComponent(workspaceId)}/onboarding`,
      token,
      { action: 'defer', meta: { source: 'smoke-defer' } }
    );
    assert.strictEqual(deferred?.onboarding?.status, 'skipped', 'defer should mark onboarding as skipped/do-later');
    assert.strictEqual(deferred?.onboarding?.activationReady, true, 'defer should not spoof activation metrics');
    assert.strictEqual(deferred?.onboarding?.visibility?.canResume, true, 'deferred onboarding should remain resumable');
	    const afterDefer = await api(
	      baseUrl,
	      'GET',
	      `/api/analytics/school-overview?workspaceId=${encodeURIComponent(workspaceId)}`,
	      token
	    );
	    assert(afterDefer?.summary, 'protected workspace API should stay available after policy acceptance, even when onboarding is deferred');

	    const resumed = await api(
	      baseUrl,
      'PATCH',
      `/api/workspaces/${encodeURIComponent(workspaceId)}/onboarding`,
      token,
      { action: 'resume', meta: { source: 'smoke-resume' } }
    );
    assert.strictEqual(resumed?.onboarding?.status, 'in_progress', 'resume should reopen deferred onboarding without completing it');

    const activated = await api(baseUrl, 'POST', `/api/workspaces/${encodeURIComponent(workspaceId)}/onboarding/activate`, token, {});
    assert.strictEqual(activated?.onboarding?.status, 'completed', 'activation route should complete onboarding');
    assert.strictEqual(activated?.onboarding?.visibility?.canResume, false, 'completed onboarding should no longer be resumable');

	    const unblocked = await api(
	      baseUrl,
	      'GET',
	      `/api/analytics/school-overview?workspaceId=${encodeURIComponent(workspaceId)}`,
	      token
	    );
	    assert(unblocked?.summary, 'protected workspace API should remain available after onboarding completion and policy acceptance');
  } finally {
    child.kill('SIGTERM');
    await Promise.race([
      new Promise((resolve) => child.once('exit', resolve)),
      sleep(3000).then(() => {
        try {
          child.kill('SIGKILL');
        } catch (_err) {}
      })
    ]);
    fs.rmSync(httpDbPath, { force: true });
  }
}

async function main() {
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  const db = new Database(dbPath);
  try {
    setupSchema(db);

    const workspaceId = `ws_${runId}`;
    const adminId = `admin_${runId}`;
    insertBaseWorkspace(db, workspaceId, adminId);

    const billingRepository = createBillingRepository({ engine: 'sqlite', sqliteDb: db });
    const onboardingRepository = createOnboardingRepository({ engine: 'sqlite', sqliteDb: db });

    await billingRepository.ensureWorkspaceBilling({ workspaceId, billingEmail: 'admin@example.com' });
    await onboardingRepository.ensureWorkspaceOnboarding({
      workspaceId,
      createdBy: adminId,
      requestId: `req_${runId}`,
      now: new Date().toISOString()
    });

    const initial = await onboardingRepository.getWorkspaceOnboarding(workspaceId);
    assert(initial, 'onboarding row should be created during provisioning');
    assert.strictEqual(initial.workspaceId, workspaceId, 'workspace onboarding should match workspace id');
    assert.strictEqual(initial.items.length, 11, 'expected 11 onboarding steps');
    assert.strictEqual(initial.visibility?.shouldAutoOpen, true, 'new workspace should auto-open onboarding before first exposure');
    assert.strictEqual(initial.summary?.workspace?.slug, workspaceId, 'repository summary should expose workspace slug');

    const seen = await onboardingRepository.acknowledgeAutoOpenSeen(workspaceId, adminId, { source: 'repo-smoke' });
    assert.strictEqual(seen.visibility?.shouldAutoOpen, false, 'auto-open should be suppressed after first exposure');

    const saved = await onboardingRepository.saveOnboardingStep(
      workspaceId,
      'school_profile',
      { status: 'in_progress', currentStep: 'staff_setup', meta: { source: 'smoke' } },
      adminId
    );
    assert.strictEqual(saved.currentStep, 'staff_setup', 'step save should advance current step');
    const reloadedSaved = await onboardingRepository.getWorkspaceOnboarding(workspaceId);
    assert.strictEqual(reloadedSaved.currentStep, 'staff_setup', 'current step should persist in repository state');

    const deferred = await onboardingRepository.deferWorkspaceOnboarding(workspaceId, adminId, { source: 'repo-defer' });
    assert.strictEqual(deferred.status, 'skipped', 'workspace defer should set skipped status');
    assert.strictEqual(deferred.visibility?.canResume, true, 'deferred onboarding should remain resumable');
    const resumed = await onboardingRepository.resumeWorkspaceOnboarding(workspaceId, adminId, { source: 'repo-resume' });
    assert.strictEqual(resumed.status, 'in_progress', 'resume should restore in-progress onboarding');

    let requiredSkipRejected = false;
    try {
      await onboardingRepository.skipOnboardingStep(workspaceId, 'school_profile', adminId, { source: 'skip-test' });
    } catch (error) {
      requiredSkipRejected = error?.code === 'required_step_cannot_be_skipped';
    }
    assert(requiredSkipRejected, 'required steps should not be skippable');

    db.prepare(`
      INSERT INTO workspace_profile (workspace_id, street, house_number, postal_code, city, state, country, phone, website, opening_hours_json, registration_details)
      VALUES (?, 'Schoolstrasse', '18', '10437', 'Berlin', 'Berlin', 'DE', '+49 30 555', 'https://school.example.com', ?, 'Registry HRB 9000')
    `).run(workspaceId, JSON.stringify({ timezone: 'Europe/Berlin', text: 'Mon-Fri 09:00-18:00', details: { days: [{ day: 'Monday', label: 'Monday', open: '09:00', close: '18:00' }] } }));
    db.prepare(`
      INSERT INTO workspace_settings_admin (workspace_id, settings_json, updated_at)
      VALUES (?, ?, 0)
    `).run(workspaceId, JSON.stringify({ timezone: 'Europe/Berlin' }));
    db.prepare(`
      INSERT INTO workspace_email_settings (workspace_id, enabled, reply_to_email, brand_school_name)
      VALUES (?, 1, 'contact@school.example.com', 'Onboarding Smoke School')
    `).run(workspaceId);

    const completedProfile = await onboardingRepository.completeOnboardingStep(workspaceId, 'school_profile', adminId, { source: 'smoke-complete' });
    const profileStep = completedProfile.items.find((item) => item.id === 'school_profile');
    assert(profileStep?.completed, 'school profile step should complete');
    assert.strictEqual(completedProfile.summary?.profile?.registrationDetails, 'Registry HRB 9000', 'repository summary should expose legal details after profile save');

    db.prepare(`
      INSERT INTO users (id, workspace_id, first_name, last_name, name, username, email, role, status)
      VALUES
      (?, ?, 'Teacher', 'One', 'Teacher One', 'teacher_one', 'teacher@example.com', 'teacher', 'active'),
      (?, ?, 'Student', 'One', 'Student One', 'student_one', 'student@example.com', 'student', 'active')
    `).run(`teacher_${runId}`, workspaceId, `student_${runId}`, workspaceId);
    db.prepare(`
      INSERT INTO channels (id, workspace_id, name, category)
      VALUES (?, ?, 'A1 Morning', 'classes')
    `).run(`class_${runId}`, workspaceId);
    db.prepare(`
      INSERT INTO live_sessions (id, workspace_id)
      VALUES (?, ?)
    `).run(`live_${runId}`, workspaceId);
    db.prepare(`
      INSERT INTO homework_items (id, workspace_id)
      VALUES (?, ?)
    `).run(`homework_${runId}`, workspaceId);
    db.prepare(`
      INSERT INTO ai_budget_settings (id, workspace_id, monthly_limit_eur, created_at, updated_at)
      VALUES (?, ?, 25, datetime('now'), datetime('now'))
    `).run(`ai_budget_${workspaceId}`, workspaceId);
    await billingRepository.updateWorkspaceBillingProfile({
      workspaceId,
      billingEmail: 'billing@school.example.com',
      invoiceContactName: 'Finance Lead',
      acknowledgeReadiness: true,
      userId: adminId
    });
    db.prepare(`
      INSERT INTO announcements (id, channel_id)
      VALUES (?, ?)
    `).run(`announcement_${runId}`, `class_${runId}`);

    const activation = await onboardingRepository.refreshActivationMetrics(workspaceId);
    assert.strictEqual(activation.teachersCount, 1, 'teacher metric should update');
    assert.strictEqual(activation.studentsCount, 1, 'student metric should update');
    assert.strictEqual(activation.classesCount, 1, 'class metric should update');
    assert.strictEqual(activation.liveSessionsCount, 1, 'live session metric should update');
    assert(activation.activationScore > 0, 'activation score should increase after evidence is present');

    await onboardingRepository.completeOnboardingStep(workspaceId, 'welcome', adminId);
    await onboardingRepository.completeOnboardingStep(workspaceId, 'staff_setup', adminId);
    await onboardingRepository.completeOnboardingStep(workspaceId, 'academic_structure', adminId);
    await onboardingRepository.completeOnboardingStep(workspaceId, 'student_setup', adminId);
    await onboardingRepository.completeOnboardingStep(workspaceId, 'live_class_setup', adminId);

    const ready = await onboardingRepository.getWorkspaceOnboarding(workspaceId);
    assert.strictEqual(ready.activationReady, true, 'workspace should become activation-ready');

    const final = await onboardingRepository.completeWorkspaceOnboarding(workspaceId, adminId);
    assert.strictEqual(final.status, 'completed', 'workspace onboarding should complete');
    assert(final.completedAt, 'workspace onboarding should stamp completedAt');
    assert.strictEqual(final.visibility?.shouldAutoOpen, false, 'completed onboarding should never auto-open again');
    assert.strictEqual(final.visibility?.canResume, false, 'completed onboarding should not remain resumable');

    const legacyWorkspaceId = `legacy_${runId}`;
    const legacyAdminId = `legacy_admin_${runId}`;
    insertBaseWorkspace(db, legacyWorkspaceId, legacyAdminId);
    await billingRepository.ensureWorkspaceBilling({ workspaceId: legacyWorkspaceId, billingEmail: 'legacy-admin@example.com' });
    seedLegacyWorkspaceEvidence(db, legacyWorkspaceId, {
      teacherId: `legacy_teacher_${runId}`,
      studentId: `legacy_student_${runId}`,
      classId: `legacy_class_${runId}`,
      liveId: `legacy_live_${runId}`,
      homeworkId: `legacy_homework_${runId}`,
      announcementId: `legacy_announcement_${runId}`
    });
    await onboardingRepository.ensureWorkspaceOnboarding({
      workspaceId: legacyWorkspaceId,
      createdBy: legacyAdminId,
      requestId: `legacy_req_${runId}`,
      now: new Date().toISOString()
    });
    const legacy = await onboardingRepository.getWorkspaceOnboarding(legacyWorkspaceId);
    assert.strictEqual(legacy.visibility?.shouldAutoOpen, false, 'legacy workspace evidence should suppress auto-open');
    assert.strictEqual(legacy.visibility?.hasLegacySetupEvidence, true, 'legacy visibility should surface evidence suppression');
    assert.strictEqual(legacy.summary?.profile?.registrationDetails, 'Registry HRB 123456', 'repository summary should expose legal details');
    assert.strictEqual(legacy.summary?.communication?.schoolEmailConfigured, true, 'repository summary should expose communication readiness');

    const uiHtml = fs.readFileSync(path.join(process.cwd(), 'public', 'index.html'), 'utf8');
    const uiCss = fs.readFileSync(path.join(process.cwd(), 'public', 'styles.refactor.css'), 'utf8');
    const uiApp = fs.readFileSync(path.join(process.cwd(), 'public', 'app.js'), 'utf8');
    assert(uiHtml.includes('onboardingWorkspaceContext'), 'onboarding shell contract should remain in index.html');
    assert(uiHtml.includes('adminResumeSetupBtn'), 'settings should keep a persistent resume setup entry point');
    assert(uiHtml.includes('onboardingSummarySection'), 'onboarding summary mount should exist in index.html');
    assert(uiCss.includes('html[data-theme="dark"]'), 'onboarding theme should use the real dark theme selector');
    assert(uiCss.includes('--onboarding-shell-bg'), 'onboarding theme tokens should be defined in CSS variables');
    assert(uiApp.includes('renderOnboardingSummarySection'), 'app should render onboarding summary cards');
    assert(uiApp.includes('formatOnboardingUiError'), 'guided onboarding should format recoverable validation errors inline');

    await runServerGateSmoke();

    console.log(`[onboarding-smoke] ok workspace=${workspaceId} score=${activation.activationScore}`);
  } finally {
    db.close();
    fs.rmSync(dbPath, { force: true });
  }
}

main().catch((error) => {
  console.error('[onboarding-smoke] failed:', error.message);
  process.exitCode = 1;
});
