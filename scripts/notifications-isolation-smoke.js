'use strict';

const assert = require('assert');
const Database = require('better-sqlite3');
const { createNotificationService } = require('../server/services/notification.service');

async function main() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL
    );
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      role TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
    );
  `);
  db.prepare(`INSERT INTO workspaces (id, name) VALUES (?, ?), (?, ?)`).run('school_a', 'School A', 'school_b', 'School B');
  db.prepare(`INSERT INTO users (id, workspace_id, role, name) VALUES (?, ?, ?, ?)`).run('admin_a', 'school_a', 'school_admin', 'Admin A');
  db.prepare(`INSERT INTO users (id, workspace_id, role, name) VALUES (?, ?, ?, ?)`).run('student_a', 'school_a', 'student', 'Student A');
  db.prepare(`INSERT INTO users (id, workspace_id, role, name) VALUES (?, ?, ?, ?)`).run('teacher_a', 'school_a', 'teacher', 'Teacher A');
  db.prepare(`INSERT INTO users (id, workspace_id, role, name) VALUES (?, ?, ?, ?)`).run('teacher_b', 'school_b', 'teacher', 'Teacher B');

  const notifications = createNotificationService({ db });
  await notifications.ensureSchema();

  await notifications.createNotification({
    id: 'school_a_public',
    workspaceId: 'school_a',
    type: 'system',
    title: 'School A public',
    message: 'Visible in School A'
  });
  await notifications.createNotification({
    id: 'school_b_public',
    workspaceId: 'school_b',
    type: 'system',
    title: 'School B public',
    message: 'Visible in School B'
  });
  await notifications.createNotification({
    id: 'teacher_only_a',
    workspaceId: 'school_a',
    recipientRole: 'teacher',
    type: 'teacher',
    title: 'Teacher only',
    message: 'Only teachers in School A'
  });
  await notifications.createNotification({
    id: 'student_direct_a',
    workspaceId: 'school_a',
    recipientUserId: 'student_a',
    type: 'homework',
    title: 'Student homework',
    message: 'Only Student A'
  });
  await notifications.createNotification({
    id: 'teacher_b_direct',
    workspaceId: 'school_b',
    recipientUserId: 'teacher_b',
    type: 'mention',
    title: 'Teacher B mention',
    message: 'Only Teacher B'
  });

  const adminA = await notifications.listNotifications({
    workspaceId: 'school_a',
    userId: 'admin_a',
    role: 'school_admin'
  });
  assert(adminA.some((n) => n.id === 'school_a_public'), 'school A admin should see school A public notifications');
  assert(!adminA.some((n) => n.id === 'school_b_public'), 'school A admin must not see school B notifications');

  const studentA = await notifications.listNotifications({
    workspaceId: 'school_a',
    userId: 'student_a',
    role: 'student'
  });
  assert(studentA.some((n) => n.id === 'student_direct_a'), 'student should see direct notifications');
  assert(!studentA.some((n) => n.id === 'teacher_only_a'), 'student must not see teacher-only notifications');

  const crossRead = await notifications.markNotificationRead({
    workspaceId: 'school_a',
    userId: 'teacher_a',
    role: 'teacher',
    notificationId: 'teacher_b_direct'
  });
  assert.strictEqual(crossRead, null, 'teacher must not mark another school notification as read');

  const readAll = await notifications.markAllNotificationsRead({
    workspaceId: 'school_a',
    userId: 'teacher_a',
    role: 'teacher'
  });
  assert(readAll.updated >= 1, 'read-all should update visible school A notifications');
  const schoolBStillUnread = db.prepare(`SELECT is_read FROM notifications WHERE id = ?`).get('teacher_b_direct');
  assert.strictEqual(Number(schoolBStillUnread.is_read), 0, 'read-all must not update another workspace');

  const crossDetail = await notifications.getNotification({
    workspaceId: 'school_a',
    userId: 'teacher_a',
    role: 'teacher',
    notificationId: 'teacher_b_direct'
  });
  assert.strictEqual(crossDetail, null, 'notification detail lookup must reject cross-tenant access');

  db.close();
  console.log('notifications isolation smoke passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
