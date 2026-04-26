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

const ENV = require('../server/env');

const runId = `attendance_tracking_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
const port = 3900 + Math.floor(Math.random() * 200);
const csrfToken = `csrf_${runId}`;
const sqlitePath = path.join(os.tmpdir(), `${runId}.sqlite`);
  const uploadsDir = path.join(os.tmpdir(), `${runId}_uploads`);
const todayIso = new Date().toISOString().slice(0, 10);

const ids = {
  workspaceId: `ws_${runId}`,
  workspaceBId: `ws_b_${runId}`,
  teacherId: `teacher_${runId}`,
  adminId: `admin_${runId}`,
  superAdminId: `super_${runId}`,
  studentId: `student_${runId}`,
  lateStudentId: `late_student_${runId}`,
  otherStudentId: `other_student_${runId}`,
  classChannelId: `class_${runId}`,
  workspaceBTeacherId: `teacher_b_${runId}`,
  workspaceBStudentId: `student_b_${runId}`,
  workspaceBClassId: `class_b_${runId}`
};

function authToken(user) {
  return jwt.sign(
    {
      jti: `at_${crypto.randomBytes(8).toString('hex')}`,
      sub: user.id,
      role: String(user.role || '').toLowerCase(),
      workspaceId: user.workspaceId,
      email: user.email,
      name: user.name
    },
    ENV.JWT_ACCESS_SECRET,
    { expiresIn: '15m' }
  );
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

function seedSqlite(dbPath) {
  const db = new Database(dbPath);
  db.pragma('foreign_keys = ON');

  db.prepare(`INSERT INTO workspaces (id, name, created_at) VALUES (?, ?, datetime('now'))`).run(ids.workspaceId, 'Attendance Workspace');
  db.prepare(`INSERT INTO workspaces (id, name, created_at) VALUES (?, ?, datetime('now'))`).run(ids.workspaceBId, 'Attendance Workspace B');

  const insertUser = db.prepare(`
    INSERT INTO users
    (id, workspace_id, first_name, last_name, name, email, username, role, status, date_of_birth, native_language, native_language_confirmed, created_at)
    VALUES (?, ?, '', '', ?, ?, ?, ?, 'active', ?, 'en', 1, datetime('now'))
  `);
  insertUser.run(ids.teacherId, ids.workspaceId, 'Teacher Smoke', `teacher.${runId}@example.com`, `teacher_${runId}`, 'teacher', '1980-01-01');
  insertUser.run(ids.adminId, ids.workspaceId, 'Admin Smoke', `admin.${runId}@example.com`, `admin_${runId}`, 'school_admin', '1981-01-01');
  insertUser.run(ids.superAdminId, ids.workspaceId, 'Super Smoke', `super.${runId}@example.com`, `super_${runId}`, 'super_admin', '1982-01-01');
  insertUser.run(ids.studentId, ids.workspaceId, 'Student Smoke', `student.${runId}@example.com`, `student_${runId}`, 'student', '2006-05-14');
  insertUser.run(ids.lateStudentId, ids.workspaceId, 'Late Student', `late.${runId}@example.com`, `late_${runId}`, 'student', '2005-04-09');
  insertUser.run(ids.otherStudentId, ids.workspaceId, 'Other Student', `other.${runId}@example.com`, `other_${runId}`, 'student', '2005-08-21');
  insertUser.run(ids.workspaceBTeacherId, ids.workspaceBId, 'Teacher B', `teacherb.${runId}@example.com`, `teacherb_${runId}`, 'teacher', '1980-02-02');
  insertUser.run(ids.workspaceBStudentId, ids.workspaceBId, 'Student B', `studentb.${runId}@example.com`, `studentb_${runId}`, 'student', '2007-06-22');

  db.prepare(`INSERT INTO channels (id, workspace_id, name, topic, category, created_at) VALUES (?, ?, ?, '', 'classes', datetime('now'))`)
    .run(ids.classChannelId, ids.workspaceId, 'A1 Attendance');
  db.prepare(`INSERT INTO channels (id, workspace_id, name, topic, category, created_at) VALUES (?, ?, ?, '', 'classes', datetime('now'))`)
    .run(ids.workspaceBClassId, ids.workspaceBId, 'B1 Attendance');

  const addMember = db.prepare(`INSERT INTO channel_members (channel_id, user_id) VALUES (?, ?)`);
  [ids.teacherId, ids.adminId, ids.studentId, ids.lateStudentId, ids.otherStudentId].forEach((userId) => addMember.run(ids.classChannelId, userId));
  [ids.workspaceBTeacherId, ids.workspaceBStudentId].forEach((userId) => addMember.run(ids.workspaceBClassId, userId));

  db.prepare(`
    INSERT INTO platform_settings (key, value, updated_at)
    VALUES ('workspace_policy_version_default', '2026-04-23', datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run();

  const acceptPolicy = db.prepare(`
    INSERT INTO policy_acceptances (id, workspace_id, user_id, version, accepted_at)
    VALUES (?, ?, ?, '2026-04-23', datetime('now'))
  `);
  [
    ids.teacherId,
    ids.adminId,
    ids.studentId,
    ids.lateStudentId,
    ids.otherStudentId,
    ids.workspaceBTeacherId,
    ids.workspaceBStudentId
  ].forEach((userId) => {
    const workspaceId = userId.includes('_b_') || userId === ids.workspaceBTeacherId || userId === ids.workspaceBStudentId
      ? ids.workspaceBId
      : ids.workspaceId;
    acceptPolicy.run(`pa_${userId}`, workspaceId, userId);
  });

  db.prepare(`
    INSERT INTO workspace_onboarding (id, workspace_id, status, current_step, completed_at, created_at, updated_at, completed_by_user_id)
    VALUES (?, ?, 'completed', 'launch_checklist', datetime('now'), datetime('now'), datetime('now'), ?)
  `).run(`ob_${ids.workspaceId}`, ids.workspaceId, ids.adminId);
  db.prepare(`
    INSERT INTO workspace_onboarding (id, workspace_id, status, current_step, completed_at, created_at, updated_at, completed_by_user_id)
    VALUES (?, ?, 'completed', 'launch_checklist', datetime('now'), datetime('now'), datetime('now'), ?)
  `).run(`ob_${ids.workspaceBId}`, ids.workspaceBId, ids.workspaceBTeacherId);

  db.close();
}

async function request(baseUrl, method, route, token, {
  body,
  json,
  expectedStatus = 200,
  expectedStatuses = null,
  parseJson = true
} = {}) {
  const headers = {
    Authorization: `Bearer ${token}`,
    Cookie: `csrf_token=${csrfToken}`
  };
  let payloadBody = body;
  if (json !== undefined) {
    headers['Content-Type'] = 'application/json';
    payloadBody = JSON.stringify(json);
  }
  if (method !== 'GET') {
    headers['x-csrf-token'] = csrfToken;
  }

  const res = await fetch(`${baseUrl}${route}`, {
    method,
    headers,
    body: payloadBody
  });
  const text = await res.text();
  let data = text;
  if (parseJson) {
    try {
      data = text ? JSON.parse(text) : null;
    } catch (_err) {
      data = { raw: text };
    }
  }

  if (Array.isArray(expectedStatuses)) {
    assert.ok(expectedStatuses.includes(res.status), `${method} ${route} => expected one of ${expectedStatuses.join(', ')}, got ${res.status}: ${JSON.stringify(data)}`);
  } else {
    assert.strictEqual(res.status, expectedStatus, `${method} ${route} => expected ${expectedStatus}, got ${res.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

async function guestRequest(baseUrl, method, route, {
  json,
  expectedStatus = 200,
  expectedStatuses = null,
  parseJson = true,
  csrfTokenValue = csrfToken
} = {}) {
  const headers = {
    Cookie: `csrf_token=${csrfTokenValue}`
  };
  let payloadBody = undefined;
  if (json !== undefined) {
    headers['Content-Type'] = 'application/json';
    headers['x-csrf-token'] = csrfTokenValue;
    payloadBody = JSON.stringify(json);
  }
  const res = await fetch(`${baseUrl}${route}`, {
    method,
    headers,
    body: payloadBody
  });
  const text = await res.text();
  let data = text;
  if (parseJson) {
    try {
      data = text ? JSON.parse(text) : null;
    } catch (_err) {
      data = { raw: text };
    }
  }
  if (Array.isArray(expectedStatuses)) {
    assert.ok(expectedStatuses.includes(res.status), `${method} ${route} => expected one of ${expectedStatuses.join(', ')}, got ${res.status}: ${JSON.stringify(data)}`);
  } else {
    assert.strictEqual(res.status, expectedStatus, `${method} ${route} => expected ${expectedStatus}, got ${res.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

function getDb() {
  return new Database(sqlitePath, { readonly: true });
}

async function main() {
  if (fs.existsSync(sqlitePath)) fs.unlinkSync(sqlitePath);
  fs.rmSync(uploadsDir, { recursive: true, force: true });

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
      UPLOADS_DIR: uploadsDir
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.stdout.on('data', (chunk) => process.stdout.write(chunk));
  child.stderr.on('data', (chunk) => process.stderr.write(chunk));

  try {
    const baseUrl = `http://127.0.0.1:${port}`;
    await waitForServer(baseUrl);
    child.kill('SIGTERM');
    await sleep(400);

    seedSqlite(sqlitePath);

    const server = spawn(process.execPath, ['server.js'], {
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
        UPLOADS_DIR: uploadsDir
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    server.stdout.on('data', (chunk) => process.stdout.write(chunk));
    server.stderr.on('data', (chunk) => process.stderr.write(chunk));

    try {
      await waitForServer(baseUrl);

      const teacherToken = authToken({ id: ids.teacherId, role: 'teacher', workspaceId: ids.workspaceId, email: `teacher.${runId}@example.com`, name: 'Teacher Smoke' });
      const adminToken = authToken({ id: ids.adminId, role: 'school_admin', workspaceId: ids.workspaceId, email: `admin.${runId}@example.com`, name: 'Admin Smoke' });
      const superToken = authToken({ id: ids.superAdminId, role: 'super_admin', workspaceId: ids.workspaceId, email: `super.${runId}@example.com`, name: 'Super Smoke' });
      const studentToken = authToken({ id: ids.studentId, role: 'student', workspaceId: ids.workspaceId, email: `student.${runId}@example.com`, name: 'Student Smoke' });
      const lateStudentToken = authToken({ id: ids.lateStudentId, role: 'student', workspaceId: ids.workspaceId, email: `late.${runId}@example.com`, name: 'Late Student' });
      const studentBToken = authToken({ id: ids.workspaceBStudentId, role: 'student', workspaceId: ids.workspaceBId, email: `studentb.${runId}@example.com`, name: 'Student B' });

      const teacherLoad = await request(baseUrl, 'GET', `/api/classes/${encodeURIComponent(ids.classChannelId)}/attendance?date=2099-01-10`, teacherToken);
      assert.ok(Array.isArray(teacherLoad.records), 'teacher should load attendance');

      const codePayload = await request(baseUrl, 'POST', `/api/classes/${encodeURIComponent(ids.classChannelId)}/attendance/session-code`, teacherToken, {
        json: { date: '2099-01-10', start_time: '23:59', grace_period_minutes: 10, expires_minutes: 15 }
      });
      assert.ok(codePayload.code, 'teacher should receive attendance code');
      assert.ok(String(codePayload.checkInPath || '').includes(`/attendance/check-in?code=${encodeURIComponent(codePayload.code)}`), 'teacher should receive attendance deep-link payload');
      assert.ok(String(codePayload.qrDataUrl || '').startsWith('data:image/png;base64,'), 'teacher should receive scannable QR image payload');

      const studentCheckIn = await request(baseUrl, 'POST', `/api/attendance/check-in`, studentToken, {
        json: { channelId: ids.classChannelId, sessionId: codePayload.sessionId, code: codePayload.code }
      });
      assert.strictEqual(studentCheckIn.status, 'present');

      await request(baseUrl, 'POST', `/api/attendance/check-in`, teacherToken, {
        json: { channelId: ids.classChannelId, sessionId: codePayload.sessionId, code: codePayload.code },
        expectedStatus: 403
      }).then((payload) => {
        assert.strictEqual(payload.error, 'Forbidden');
      });

      const publicMeta = await guestRequest(baseUrl, 'GET', `/api/attendance/check-in/public?code=${encodeURIComponent(codePayload.code)}&channelId=${encodeURIComponent(ids.classChannelId)}&sessionId=${encodeURIComponent(codePayload.sessionId)}`);
      assert.strictEqual(publicMeta.className, 'A1 Attendance');
      assert.strictEqual(publicMeta.status, 'open');

      await request(baseUrl, 'POST', `/api/attendance/check-in`, studentToken, {
        json: { channelId: ids.classChannelId, sessionId: codePayload.sessionId, code: codePayload.code },
        expectedStatus: 409
      });

      const guestCodePayload = await request(baseUrl, 'POST', `/api/classes/${encodeURIComponent(ids.classChannelId)}/attendance/session-code`, teacherToken, {
        json: { date: '2099-01-11', start_time: '09:00', grace_period_minutes: 10, expires_minutes: 15 }
      });
      const guestCheckIn = await guestRequest(baseUrl, 'POST', `/api/attendance/check-in/guest`, {
        json: {
          channelId: ids.classChannelId,
          sessionId: guestCodePayload.sessionId,
          code: guestCodePayload.code,
          identifier: `other.${runId}@example.com`,
          dateOfBirth: '2005-08-21'
        }
      });
      assert.strictEqual(guestCheckIn.status, 'present');

      await guestRequest(baseUrl, 'POST', `/api/attendance/check-in/guest`, {
        json: {
          channelId: ids.classChannelId,
          sessionId: guestCodePayload.sessionId,
          code: guestCodePayload.code,
          identifier: `other.${runId}@example.com`,
          dateOfBirth: '2005-08-21'
        },
        expectedStatus: 409
      }).then((payload) => {
        assert.strictEqual(payload.error, 'You are already checked in.');
      });

      const guestVerifyPayload = await request(baseUrl, 'POST', `/api/classes/${encodeURIComponent(ids.classChannelId)}/attendance/session-code`, teacherToken, {
        json: { date: '2099-01-12', start_time: '09:00', grace_period_minutes: 10, expires_minutes: 15 }
      });
      await guestRequest(baseUrl, 'POST', `/api/attendance/check-in/guest`, {
        json: {
          channelId: ids.classChannelId,
          sessionId: guestVerifyPayload.sessionId,
          code: guestVerifyPayload.code,
          identifier: `student.${runId}@example.com`,
          dateOfBirth: '2000-01-01'
        },
        expectedStatus: 403
      }).then((payload) => {
        assert.strictEqual(payload.error, 'We could not verify your student details.');
      });

      await guestRequest(baseUrl, 'POST', `/api/attendance/check-in/guest`, {
        json: {
          channelId: ids.classChannelId,
          sessionId: guestVerifyPayload.sessionId,
          code: guestVerifyPayload.code,
          identifier: `studentb.${runId}@example.com`,
          dateOfBirth: '2007-06-22'
        },
        expectedStatus: 403
      }).then((payload) => {
        assert.strictEqual(payload.error, 'We could not verify your student details.');
      });

      const lateCode = await request(baseUrl, 'POST', `/api/classes/${encodeURIComponent(ids.classChannelId)}/attendance/session-code`, teacherToken, {
        json: { date: todayIso, start_time: '00:00', grace_period_minutes: 0, expires_minutes: 15 }
      });
      const lateCheckIn = await request(baseUrl, 'POST', `/api/attendance/check-in`, lateStudentToken, {
        json: { channelId: ids.classChannelId, sessionId: lateCode.sessionId, code: lateCode.code }
      });
      assert.strictEqual(lateCheckIn.status, 'late');

      const studentCannotMark = await request(baseUrl, 'POST', `/api/classes/${encodeURIComponent(ids.classChannelId)}/attendance/records/${encodeURIComponent(ids.otherStudentId)}`, studentToken, {
        json: { date: '2099-01-10', status: 'absent' },
        expectedStatus: 403
      });
      assert.strictEqual(studentCannotMark.error, 'Forbidden');

      const excused = await request(baseUrl, 'POST', `/api/classes/${encodeURIComponent(ids.classChannelId)}/attendance/records/${encodeURIComponent(ids.otherStudentId)}`, adminToken, {
        json: { date: '2099-01-10', status: 'excused', note: 'Medical note pending' }
      });
      assert.strictEqual(excused.ok, true);

      const form = new FormData();
      form.append('file', new Blob(['medical certificate'], { type: 'application/pdf' }), 'medical-note.pdf');
      form.append('date', '2099-01-10');
      form.append('sessionId', excused.sessionId);
      form.append('status', 'excused');
      form.append('note', 'Medical note uploaded');
      const certUpload = await request(baseUrl, 'POST', `/api/classes/${encodeURIComponent(ids.classChannelId)}/attendance/records/${encodeURIComponent(ids.otherStudentId)}/certificate`, adminToken, {
        body: form
      });
      assert.ok(certUpload.file?.fileId, 'certificate upload should return file metadata');

      const db = getDb();
      const certRow = db.prepare(`SELECT certificate_file_id AS fileId FROM attendance_records WHERE session_id = ? AND student_user_id = ?`).get(excused.sessionId, ids.otherStudentId);
      assert.strictEqual(certRow.fileId, certUpload.file.fileId);
      const fileRow = db.prepare(`SELECT file_id, storage_key, checksum, purpose FROM files_registry WHERE file_id = ?`).get(certUpload.file.fileId);
      assert.strictEqual(fileRow.purpose, 'attendance_certificate');
      assert.ok(String(fileRow.storage_key || '').trim(), 'certificate file should be metadata-backed');
      assert.ok(String(fileRow.checksum || '').trim(), 'certificate file should store checksum only');
      db.close();

      await request(baseUrl, 'GET', `/api/classes/${encodeURIComponent(ids.workspaceBClassId)}/attendance/report`, teacherToken, {
        expectedStatus: 403
      }).then((payload) => {
        assert.strictEqual(payload.code, 'tenant_forbidden');
      });

      await request(baseUrl, 'POST', `/api/attendance/check-in`, studentBToken, {
        json: { channelId: ids.classChannelId, sessionId: codePayload.sessionId, code: codePayload.code },
        expectedStatus: 403
      }).then((payload) => {
        assert.strictEqual(payload.code, 'tenant_forbidden');
      });

      const expiredGuestPayload = await request(baseUrl, 'POST', `/api/classes/${encodeURIComponent(ids.classChannelId)}/attendance/session-code`, teacherToken, {
        json: { date: '2099-01-13', start_time: '09:00', grace_period_minutes: 10, expires_minutes: 1 }
      });
      {
        const dbWrite = new Database(sqlitePath);
        dbWrite.prepare(`UPDATE attendance_sessions SET checkin_code_expires_at = datetime('now', '-5 minutes') WHERE id = ?`).run(expiredGuestPayload.sessionId);
        dbWrite.close();
      }
      await guestRequest(baseUrl, 'POST', `/api/attendance/check-in/guest`, {
        json: {
          channelId: ids.classChannelId,
          sessionId: expiredGuestPayload.sessionId,
          code: expiredGuestPayload.code,
          identifier: `student.${runId}@example.com`,
          dateOfBirth: '2006-05-14'
        },
        expectedStatus: 400
      }).then((payload) => {
        assert.strictEqual(payload.error, 'This check-in link is invalid or expired.');
      });

      let guestRateLimited = null;
      const brutePayload = await request(baseUrl, 'POST', `/api/classes/${encodeURIComponent(ids.classChannelId)}/attendance/session-code`, teacherToken, {
        json: { date: '2099-01-14', start_time: '09:00', grace_period_minutes: 10, expires_minutes: 15 }
      });
      for (let i = 0; i < 7; i += 1) {
        const payload = await guestRequest(baseUrl, 'POST', `/api/attendance/check-in/guest`, {
          json: {
            channelId: ids.classChannelId,
            sessionId: brutePayload.sessionId,
            code: brutePayload.code,
            identifier: `student.${runId}@example.com`,
            dateOfBirth: '2000-01-01'
          },
          expectedStatuses: [403, 429]
        });
        if (payload?.code === 'rate_limited') {
          guestRateLimited = payload;
          break;
        }
      }
      assert.deepStrictEqual(guestRateLimited, {
        error: 'Too many requests. Please try again later.',
        code: 'rate_limited'
      });

      await request(baseUrl, 'GET', `/api/classes/${encodeURIComponent(ids.classChannelId)}/attendance`, superToken, {
        expectedStatus: 403
      }).then((payload) => {
        assert.strictEqual(payload.code, 'tenant_forbidden');
      });

      const report = await request(baseUrl, 'GET', `/api/classes/${encodeURIComponent(ids.classChannelId)}/attendance/report`, teacherToken);
      assert.ok(report.report?.totals, 'report endpoint should return totals');
      assert.ok(Array.isArray(report.report?.byStudent), 'report endpoint should return byStudent');
      assert.ok(report.report.totals.present >= 1, 'report should count present');
      assert.ok(report.report.totals.late >= 1, 'report should count late');
      assert.ok(report.report.totals.excused >= 1, 'report should count excused');

      const csv = await request(baseUrl, 'GET', `/api/classes/${encodeURIComponent(ids.classChannelId)}/attendance/report.csv`, teacherToken, {
        parseJson: false
      });
      assert.ok(String(csv).includes('sessionDate,studentName,studentEmail,status'), 'report csv should include header');

      console.log('[attendance-tracking-smoke] passed');
    } finally {
      server.kill('SIGTERM');
      await sleep(400);
    }
  } finally {
    child.kill('SIGTERM');
    fs.rmSync(uploadsDir, { recursive: true, force: true });
    if (fs.existsSync(sqlitePath)) fs.unlinkSync(sqlitePath);
  }
}

main().catch((err) => {
  console.error('[attendance-tracking-smoke] failed:', err && err.stack ? err.stack : err);
  process.exit(1);
});
