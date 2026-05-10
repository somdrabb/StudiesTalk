'use strict';

const crypto = require('crypto');

const VALID_TYPES = new Set(['mention', 'homework', 'exam', 'class', 'teacher', 'system', 'attendance']);
const VALID_ROLES = new Set(['student', 'teacher', 'admin', 'school_admin']);
const VALID_PRIORITIES = new Set(['low', 'normal', 'high']);
const FILTER_TYPES = {
  mentions: 'mention',
  mention: 'mention',
  homework: 'homework',
  exams: 'exam',
  exam: 'exam',
  classes: 'class',
  class: 'class',
  teachers: 'teacher',
  teacher: 'teacher',
  system: 'system',
  attendance: 'attendance'
};

function makeNotificationId() {
  return `notif_${crypto.randomBytes(16).toString('hex')}`;
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeRole(role) {
  const normalized = String(role || '').trim().toLowerCase();
  return normalized || 'student';
}

function normalizeType(type) {
  const normalized = String(type || 'system').trim().toLowerCase();
  return VALID_TYPES.has(normalized) ? normalized : 'system';
}

function normalizePriority(priority) {
  const normalized = String(priority || 'normal').trim().toLowerCase();
  return VALID_PRIORITIES.has(normalized) ? normalized : 'normal';
}

function normalizeRecipientRole(role) {
  const normalized = String(role || '').trim().toLowerCase();
  return VALID_ROLES.has(normalized) ? normalized : null;
}

function normalizeLimit(limit) {
  const parsed = Number.parseInt(String(limit || ''), 10);
  if (!Number.isFinite(parsed)) return 50;
  return Math.max(1, Math.min(100, parsed));
}

function safeJson(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch (_err) {
    return null;
  }
}

function parseJson(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch (_err) {
    return null;
  }
}

function isPostgresDb(db) {
  return String(db?.engine || '').toLowerCase() === 'postgres';
}

function changesFromResult(result = {}) {
  return Number(result.changes ?? result.rowCount ?? 0);
}

async function maybeAwait(value) {
  return value && typeof value.then === 'function' ? value : Promise.resolve(value);
}

function createNotificationService({ db } = {}) {
  if (!db) throw new Error('db is required for notification service');
  const pg = isPostgresDb(db);
  const unreadSql = pg ? 'COALESCE(is_read, false) = false' : 'COALESCE(is_read, 0) = 0';
  const readValue = pg ? true : 1;
  const unreadValue = pg ? false : 0;

  async function many(sql, params = []) {
    if (typeof db.many === 'function') return maybeAwait(db.many(sql, params));
    if (typeof db.queryMany === 'function') return maybeAwait(db.queryMany(sql, params));
    if (typeof db.prepare === 'function') return db.prepare(sql).all(...params);
    throw new Error('Database adapter does not support many/queryMany');
  }

  async function one(sql, params = []) {
    if (typeof db.one === 'function') return maybeAwait(db.one(sql, params));
    if (typeof db.queryOne === 'function') return maybeAwait(db.queryOne(sql, params));
    if (typeof db.prepare === 'function') return db.prepare(sql).get(...params) || null;
    throw new Error('Database adapter does not support one/queryOne');
  }

  async function exec(sql, params = []) {
    if (typeof db.exec === 'function' && !isPostgresDb(db)) {
      if (params.length) return db.prepare(sql).run(...params);
      return db.exec(sql);
    }
    if (typeof db.execute === 'function') return maybeAwait(db.execute(sql, params));
    if (typeof db.exec === 'function') return maybeAwait(db.exec(sql, params));
    if (typeof db.prepare === 'function') return db.prepare(sql).run(...params);
    throw new Error('Database adapter does not support exec/execute');
  }

  async function ensureSchema() {
    if (isPostgresDb(db)) {
      await exec(`
        CREATE TABLE IF NOT EXISTS notifications (
          id TEXT PRIMARY KEY,
          workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
          recipient_user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
          recipient_role TEXT,
          actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
          type TEXT NOT NULL DEFAULT 'system',
          title TEXT NOT NULL,
          message TEXT NOT NULL DEFAULT '',
          entity_type TEXT,
          entity_id TEXT,
          action_url TEXT,
          is_read BOOLEAN NOT NULL DEFAULT false,
          priority TEXT NOT NULL DEFAULT 'normal',
          metadata JSONB,
          created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          read_at TIMESTAMPTZ,
          archived_at TIMESTAMPTZ,
          archived_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL
        )
      `);
      await exec(`CREATE INDEX IF NOT EXISTS idx_notifications_workspace_visible ON notifications(workspace_id, recipient_user_id, recipient_role, created_at DESC)`);
      await exec(`CREATE INDEX IF NOT EXISTS idx_notifications_workspace_type ON notifications(workspace_id, type, created_at DESC)`);
      await exec(`CREATE INDEX IF NOT EXISTS idx_notifications_workspace_unread ON notifications(workspace_id, is_read, created_at DESC)`);
      return;
    }

    await exec(`
      CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        recipient_user_id TEXT,
        recipient_role TEXT,
        actor_user_id TEXT,
        type TEXT NOT NULL DEFAULT 'system',
        title TEXT NOT NULL,
        message TEXT NOT NULL DEFAULT '',
        entity_type TEXT,
        entity_id TEXT,
        action_url TEXT,
        is_read INTEGER NOT NULL DEFAULT 0,
        priority TEXT NOT NULL DEFAULT 'normal',
        metadata TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        read_at TEXT,
        archived_at TEXT,
        archived_by_user_id TEXT,
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
        FOREIGN KEY (recipient_user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
      )
    `);
    await exec(`CREATE INDEX IF NOT EXISTS idx_notifications_workspace_visible ON notifications(workspace_id, recipient_user_id, recipient_role, created_at DESC)`);
    await exec(`CREATE INDEX IF NOT EXISTS idx_notifications_workspace_type ON notifications(workspace_id, type, created_at DESC)`);
    await exec(`CREATE INDEX IF NOT EXISTS idx_notifications_workspace_unread ON notifications(workspace_id, is_read, created_at DESC)`);
  }

  function buildVisibleWhere({ workspaceId, userId, role, includeFilter = true, filter = 'all', unreadOnly = false, cursor = null } = {}) {
    const normalizedFilter = String(filter || 'all').trim().toLowerCase();
    const params = [String(workspaceId || '').trim(), String(userId || '').trim(), normalizeRole(role)];
    const clauses = [
      'workspace_id = ?',
      'archived_at IS NULL',
      '(recipient_user_id = ? OR recipient_role = ? OR (recipient_user_id IS NULL AND recipient_role IS NULL))'
    ];
    if (includeFilter && normalizedFilter !== 'all') {
      const type = FILTER_TYPES[normalizedFilter] || '';
      if (type) {
        clauses.push('type = ?');
        params.push(type);
      }
    }
    if (unreadOnly) {
      clauses.push(unreadSql);
    }
    if (cursor) {
      clauses.push('created_at < ?');
      params.push(String(cursor));
    }
    return { where: clauses.join(' AND '), params };
  }

  function normalizeRow(row) {
    if (!row) return null;
    return {
      id: row.id,
      workspaceId: row.workspace_id || row.workspaceId,
      recipientUserId: row.recipient_user_id || row.recipientUserId || null,
      recipientRole: row.recipient_role || row.recipientRole || null,
      actorUserId: row.actor_user_id || row.actorUserId || null,
      type: normalizeType(row.type),
      title: row.title || '',
      message: row.message || '',
      entityType: row.entity_type || row.entityType || null,
      entityId: row.entity_id || row.entityId || null,
      actionUrl: row.action_url || row.actionUrl || null,
      isRead: !!Number(row.is_read ?? row.isRead ?? 0),
      priority: normalizePriority(row.priority),
      metadata: parseJson(row.metadata),
      createdAt: row.created_at || row.createdAt,
      updatedAt: row.updated_at || row.updatedAt,
      readAt: row.read_at || row.readAt || null
    };
  }

  async function listNotifications({ workspaceId, userId, role, filter = 'all', unreadOnly = false, limit = 50, cursor = null } = {}) {
    const normalizedWorkspaceId = String(workspaceId || '').trim();
    const normalizedUserId = String(userId || '').trim();
    if (!normalizedWorkspaceId || !normalizedUserId) return [];
    const { where, params } = buildVisibleWhere({
      workspaceId: normalizedWorkspaceId,
      userId: normalizedUserId,
      role,
      filter,
      unreadOnly,
      cursor
    });
    const rows = await many(`
      SELECT *
      FROM notifications
      WHERE ${where}
      ORDER BY created_at DESC, id DESC
      LIMIT ?
    `, [...params, normalizeLimit(limit)]);
    return rows.map(normalizeRow);
  }

  async function getNotification({ workspaceId, userId, role, notificationId } = {}) {
    const id = String(notificationId || '').trim();
    const normalizedWorkspaceId = String(workspaceId || '').trim();
    const normalizedUserId = String(userId || '').trim();
    if (!id || !normalizedWorkspaceId || !normalizedUserId) return null;
    const { where, params } = buildVisibleWhere({
      workspaceId: normalizedWorkspaceId,
      userId: normalizedUserId,
      role,
      includeFilter: false
    });
    const row = await one(`SELECT * FROM notifications WHERE id = ? AND ${where} LIMIT 1`, [id, ...params]);
    return normalizeRow(row);
  }

  async function getNotificationCounts({ workspaceId, userId, role } = {}) {
    const normalizedWorkspaceId = String(workspaceId || '').trim();
    const normalizedUserId = String(userId || '').trim();
    const empty = { all: 0, unread: 0, mentions: 0, homework: 0, exams: 0, classes: 0, teachers: 0, system: 0 };
    if (!normalizedWorkspaceId || !normalizedUserId) return empty;
    const { where, params } = buildVisibleWhere({
      workspaceId: normalizedWorkspaceId,
      userId: normalizedUserId,
      role,
      includeFilter: false
    });
    const row = await one(`
      SELECT
        COUNT(*) AS all_count,
        SUM(CASE WHEN ${unreadSql} THEN 1 ELSE 0 END) AS unread_count,
        SUM(CASE WHEN type = 'mention' THEN 1 ELSE 0 END) AS mention_count,
        SUM(CASE WHEN type = 'homework' THEN 1 ELSE 0 END) AS homework_count,
        SUM(CASE WHEN type = 'exam' THEN 1 ELSE 0 END) AS exam_count,
        SUM(CASE WHEN type = 'class' THEN 1 ELSE 0 END) AS class_count,
        SUM(CASE WHEN type = 'teacher' THEN 1 ELSE 0 END) AS teacher_count,
        SUM(CASE WHEN type = 'system' THEN 1 ELSE 0 END) AS system_count
      FROM notifications
      WHERE ${where}
    `, params);
    return {
      all: Number(row?.all_count || 0),
      unread: Number(row?.unread_count || 0),
      mentions: Number(row?.mention_count || 0),
      homework: Number(row?.homework_count || 0),
      exams: Number(row?.exam_count || 0),
      classes: Number(row?.class_count || 0),
      teachers: Number(row?.teacher_count || 0),
      system: Number(row?.system_count || 0)
    };
  }

  async function getUnreadCount({ workspaceId, userId, role } = {}) {
    const normalizedWorkspaceId = String(workspaceId || '').trim();
    const normalizedUserId = String(userId || '').trim();
    if (!normalizedWorkspaceId || !normalizedUserId) return 0;
    const { where, params } = buildVisibleWhere({
      workspaceId: normalizedWorkspaceId,
      userId: normalizedUserId,
      role,
      includeFilter: false
    });
    const row = await one(`
      SELECT COUNT(*) AS unread_count
      FROM notifications
      WHERE ${where}
        AND ${unreadSql}
    `, params);
    return Number(row?.unread_count || 0);
  }

  async function getNotificationInsights({ workspaceId, userId, role } = {}) {
    const normalizedWorkspaceId = String(workspaceId || '').trim();
    const normalizedUserId = String(userId || '').trim();
    const empty = { upcomingExams: 0, pendingHomework: 0, unreadMentions: 0, attendanceAlerts: 0 };
    if (!normalizedWorkspaceId || !normalizedUserId) return empty;
    const { where, params } = buildVisibleWhere({
      workspaceId: normalizedWorkspaceId,
      userId: normalizedUserId,
      role,
      includeFilter: false
    });
    const row = await one(`
      SELECT
        SUM(CASE WHEN type = 'exam' THEN 1 ELSE 0 END) AS upcoming_exams,
        SUM(CASE WHEN type = 'homework' AND ${unreadSql} THEN 1 ELSE 0 END) AS pending_homework,
        SUM(CASE WHEN type = 'mention' AND ${unreadSql} THEN 1 ELSE 0 END) AS unread_mentions,
        SUM(CASE WHEN type = 'attendance' AND ${unreadSql} THEN 1 ELSE 0 END) AS attendance_alerts
      FROM notifications
      WHERE ${where}
    `, params);
    return {
      upcomingExams: Number(row?.upcoming_exams || 0),
      pendingHomework: Number(row?.pending_homework || 0),
      unreadMentions: Number(row?.unread_mentions || 0),
      attendanceAlerts: Number(row?.attendance_alerts || 0)
    };
  }

  async function markNotificationRead({ workspaceId, userId, role, notificationId } = {}) {
    const id = String(notificationId || '').trim();
    if (!id) return null;
    const { where, params } = buildVisibleWhere({
      workspaceId,
      userId,
      role,
      includeFilter: false
    });
    const existing = await one(`SELECT * FROM notifications WHERE id = ? AND ${where} LIMIT 1`, [id, ...params]);
    if (!existing) return null;
    const updatedAt = nowIso();
    await exec(`
      UPDATE notifications
      SET is_read = ?,
          read_at = COALESCE(read_at, ?),
          updated_at = ?
      WHERE id = ? AND workspace_id = ?
    `, [readValue, updatedAt, updatedAt, id, String(workspaceId || '').trim()]);
    return normalizeRow({ ...existing, is_read: readValue, read_at: existing.read_at || updatedAt, updated_at: updatedAt });
  }

  async function markAllNotificationsRead({ workspaceId, userId, role } = {}) {
    const { where, params } = buildVisibleWhere({
      workspaceId,
      userId,
      role,
      includeFilter: false
    });
    const updatedAt = nowIso();
    const result = await exec(`
      UPDATE notifications
      SET is_read = ?,
          read_at = COALESCE(read_at, ?),
          updated_at = ?
      WHERE ${where}
        AND ${unreadSql}
    `, [readValue, updatedAt, updatedAt, ...params]);
    return { updated: changesFromResult(result) };
  }

  async function archiveNotification({ workspaceId, userId, role, notificationId } = {}) {
    const id = String(notificationId || '').trim();
    if (!id) return { found: false, archived: false };
    const { where, params } = buildVisibleWhere({
      workspaceId,
      userId,
      role,
      includeFilter: false
    });
    const existing = await one(`SELECT id FROM notifications WHERE id = ? AND ${where} LIMIT 1`, [id, ...params]);
    if (!existing) return { found: false, archived: false };
    const archivedAt = nowIso();
    const result = await exec(`
      UPDATE notifications
      SET archived_at = ?,
          archived_by_user_id = ?,
          updated_at = ?
      WHERE id = ? AND workspace_id = ?
    `, [archivedAt, String(userId || '').trim(), archivedAt, id, String(workspaceId || '').trim()]);
    return { found: true, archived: changesFromResult(result) > 0 };
  }

  async function createNotification(input = {}) {
    const workspaceId = String(input.workspaceId || '').trim();
    if (!workspaceId) throw new Error('workspaceId is required');
    const id = String(input.id || '').trim() || makeNotificationId();
    const now = input.createdAt || nowIso();
    await exec(`
      INSERT INTO notifications (
        id, workspace_id, recipient_user_id, recipient_role, actor_user_id,
        type, title, message, entity_type, entity_id, action_url,
        is_read, priority, metadata, created_at, updated_at, read_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id,
      workspaceId,
      input.recipientUserId ? String(input.recipientUserId) : null,
      normalizeRecipientRole(input.recipientRole),
      input.actorUserId ? String(input.actorUserId) : null,
      normalizeType(input.type),
      String(input.title || 'Notification').trim() || 'Notification',
      String(input.message || '').trim(),
      input.entityType ? String(input.entityType) : null,
      input.entityId ? String(input.entityId) : null,
      input.actionUrl ? String(input.actionUrl) : null,
      input.isRead ? readValue : unreadValue,
      normalizePriority(input.priority),
      safeJson(input.metadata),
      now,
      input.updatedAt || now,
      input.readAt || null
    ]);
    return normalizeRow({
      id,
      workspace_id: workspaceId,
      recipient_user_id: input.recipientUserId || null,
      recipient_role: normalizeRecipientRole(input.recipientRole),
      actor_user_id: input.actorUserId || null,
      type: normalizeType(input.type),
      title: String(input.title || 'Notification').trim() || 'Notification',
      message: String(input.message || '').trim(),
      entity_type: input.entityType || null,
      entity_id: input.entityId || null,
      action_url: input.actionUrl || null,
      is_read: input.isRead ? readValue : unreadValue,
      priority: normalizePriority(input.priority),
      metadata: safeJson(input.metadata),
      created_at: now,
      updated_at: input.updatedAt || now,
      read_at: input.readAt || null
    });
  }

  async function createBulkNotifications({ workspaceId, recipients = [], type, title, message, metadata, ...rest } = {}) {
    const created = [];
    for (const recipient of recipients) {
      created.push(await createNotification({
        ...rest,
        workspaceId,
        recipientUserId: recipient.userId || recipient.recipientUserId || null,
        recipientRole: recipient.role || recipient.recipientRole || null,
        type,
        title,
        message,
        metadata
      }));
    }
    return created;
  }

  return {
    ensureSchema,
    listNotifications,
    getNotification,
    getNotificationCounts,
    getUnreadCount,
    getNotificationInsights,
    markNotificationRead,
    markAllNotificationsRead,
    archiveNotification,
    createNotification,
    createBulkNotifications,
    _private: {
      buildVisibleWhere,
      normalizeRow
    }
  };
}

module.exports = {
  createNotificationService,
  FILTER_TYPES
};
