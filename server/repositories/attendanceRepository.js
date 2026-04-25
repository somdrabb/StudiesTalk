'use strict';

const { normalizeEngine } = require('../../db/helpers');

function nowSqlTimestamp() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

function buildSqlInPlaceholders(count) {
  return Array.from({ length: count }, () => '?').join(',');
}

function normalizeSessionRow(row) {
  if (!row) return null;
  return {
    ...row,
    locked_by: row.locked_by || null
  };
}

function createAttendanceRepository({ engine = 'sqlite', sqliteDb } = {}) {
  const normalizedEngine = normalizeEngine(engine);
  if (normalizedEngine === 'postgres') {
    return createPostgresAttendanceRepository();
  }
  if (!sqliteDb) {
    throw new Error('sqliteDb is required for the SQLite attendance repository');
  }
  return createSqliteAttendanceRepository(sqliteDb);
}

function createSqliteAttendanceRepository(sqliteDb) {
  return {
    engine: 'sqlite',

    async getOrCreateAttendanceSession({ idFactory, workspaceId, channelId, sessionDate, createdByUserId }) {
      const existing = sqliteDb.prepare(`
        SELECT *
        FROM attendance_sessions
        WHERE workspace_id = ? AND channel_id = ? AND session_date = ?
        LIMIT 1
      `).get(workspaceId, channelId, sessionDate);
      if (existing) return normalizeSessionRow(existing);

      const id = idFactory('asess');
      sqliteDb.prepare(`
        INSERT INTO attendance_sessions (id, workspace_id, channel_id, session_date, created_by_user_id)
        VALUES (?, ?, ?, ?, ?)
      `).run(id, workspaceId, channelId, sessionDate, createdByUserId || null);

      return normalizeSessionRow(
        sqliteDb.prepare(`SELECT * FROM attendance_sessions WHERE id = ? LIMIT 1`).get(id)
      );
    },

    async listAttendanceStatuses({ workspaceId, sessionId }) {
      return sqliteDb.prepare(`
        SELECT student_user_id, status
        FROM attendance_records
        WHERE workspace_id = ? AND session_id = ?
      `).all(workspaceId, sessionId);
    },

    async upsertAttendanceRecords({ idFactory, workspaceId, sessionId, channelId, records, markedByUserId }) {
      const insertStmt = sqliteDb.prepare(`
        INSERT INTO attendance_records
          (id, workspace_id, session_id, channel_id, student_user_id, status, marked_by_user_id, marked_at)
        VALUES
          (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(session_id, student_user_id) DO UPDATE SET
          status = excluded.status,
          marked_by_user_id = excluded.marked_by_user_id,
          marked_at = excluded.marked_at
      `);

      sqliteDb.transaction(() => {
        for (const row of records) {
          insertStmt.run(
            idFactory('arec'),
            workspaceId,
            sessionId,
            channelId,
            row.student_user_id,
            row.status,
            markedByUserId || null,
            nowSqlTimestamp()
          );
        }
      })();
    },

    async hasAttendanceNotification({ sessionId, studentUserId, type }) {
      const row = sqliteDb.prepare(`
        SELECT 1
        FROM attendance_notifications
        WHERE session_id = ? AND student_user_id = ? AND type = ?
        LIMIT 1
      `).get(sessionId, studentUserId, type);
      return !!row;
    },

    async createAttendanceNotification({ idFactory, workspaceId, sessionId, channelId, studentUserId, type }) {
      sqliteDb.prepare(`
        INSERT INTO attendance_notifications (id, workspace_id, session_id, channel_id, student_user_id, type)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(idFactory('anotif'), workspaceId, sessionId, channelId, studentUserId, type);
    },

    async listStudentAttendance({ workspaceId, studentId, limit }) {
      return sqliteDb.prepare(`
        SELECT ar.status, s.session_date, c.name AS class_name, ar.channel_id
        FROM attendance_records ar
        JOIN attendance_sessions s ON s.id = ar.session_id
        JOIN channels c ON c.id = ar.channel_id
        WHERE ar.workspace_id = ? AND ar.student_user_id = ?
        ORDER BY s.session_date DESC, ar.marked_at DESC, ar.id DESC
        LIMIT ?
      `).all(workspaceId, studentId, limit);
    },

    async getStudentAttendanceSummary({ workspaceId, studentId, classIds = [], limit = 50 }) {
      const filters = ['ar.workspace_id = ?', 'ar.student_user_id = ?'];
      const params = [workspaceId, studentId];
      if (classIds.length) {
        filters.push(`ar.channel_id IN (${buildSqlInPlaceholders(classIds.length)})`);
        params.push(...classIds);
      }

      const rows = sqliteDb.prepare(`
        SELECT ar.status, s.session_date AS sessionDate, c.name AS className, ar.channel_id AS channelId
        FROM attendance_records ar
        JOIN attendance_sessions s ON s.id = ar.session_id
        JOIN channels c ON c.id = ar.channel_id
        WHERE ${filters.join(' AND ')}
        ORDER BY s.session_date DESC, ar.marked_at DESC, ar.id DESC
        LIMIT ?
      `).all(...params, limit);

      const present = rows.filter((row) => String(row.status || '').toLowerCase() === 'present').length;
      const total = rows.length;
      const absent = Math.max(0, total - present);
      const attendanceRate = total ? Math.round((present / total) * 100) : 0;
      return {
        total,
        present,
        absent,
        attendanceRate,
        recent: rows.slice(0, 10)
      };
    },

    async reassignChannelAttendance({ targetChannelId, duplicateChannelId }) {
      sqliteDb.transaction(() => {
        sqliteDb.prepare('UPDATE attendance_sessions SET channel_id = ? WHERE channel_id = ?').run(targetChannelId, duplicateChannelId);
        sqliteDb.prepare('UPDATE attendance_records SET channel_id = ? WHERE channel_id = ?').run(targetChannelId, duplicateChannelId);
        sqliteDb.prepare('UPDATE attendance_notifications SET channel_id = ? WHERE channel_id = ?').run(targetChannelId, duplicateChannelId);
      })();
    },

    async deleteChannelAttendanceData(channelId) {
      sqliteDb.transaction(() => {
        sqliteDb.prepare('DELETE FROM attendance_notifications WHERE channel_id = ?').run(channelId);
        sqliteDb.prepare('DELETE FROM attendance_records WHERE channel_id = ?').run(channelId);
        sqliteDb.prepare('DELETE FROM attendance_sessions WHERE channel_id = ?').run(channelId);
      })();
    }
  };
}

function createPostgresAttendanceRepository() {
  const postgres = require('../../db/postgres');

  return {
    engine: 'postgres',

    async getOrCreateAttendanceSession({ idFactory, workspaceId, channelId, sessionDate, createdByUserId }) {
      const existing = await postgres.queryOne(`
        SELECT *
        FROM attendance_sessions
        WHERE workspace_id = ? AND channel_id = ? AND session_date = ?
        LIMIT 1
      `, [workspaceId, channelId, sessionDate]);
      if (existing) return normalizeSessionRow(existing);

      const id = idFactory('asess');
      await postgres.execute(`
        INSERT INTO attendance_sessions (id, workspace_id, channel_id, session_date, created_by_user_id)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT (channel_id, session_date) DO NOTHING
      `, [id, workspaceId, channelId, sessionDate, createdByUserId || null]);

      return normalizeSessionRow(await postgres.queryOne(`
        SELECT *
        FROM attendance_sessions
        WHERE workspace_id = ? AND channel_id = ? AND session_date = ?
        LIMIT 1
      `, [workspaceId, channelId, sessionDate]));
    },

    async listAttendanceStatuses({ workspaceId, sessionId }) {
      return postgres.queryMany(`
        SELECT student_user_id, status
        FROM attendance_records
        WHERE workspace_id = ? AND session_id = ?
      `, [workspaceId, sessionId]);
    },

    async upsertAttendanceRecords({ idFactory, workspaceId, sessionId, channelId, records, markedByUserId }) {
      const markedAt = nowSqlTimestamp();
      await postgres.transaction(async (tx) => {
        for (const row of records) {
          await tx.execute(`
            INSERT INTO attendance_records
              (id, workspace_id, session_id, channel_id, student_user_id, status, marked_by_user_id, marked_at)
            VALUES
              (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(session_id, student_user_id) DO UPDATE SET
              status = EXCLUDED.status,
              marked_by_user_id = EXCLUDED.marked_by_user_id,
              marked_at = EXCLUDED.marked_at
          `, [
            idFactory('arec'),
            workspaceId,
            sessionId,
            channelId,
            row.student_user_id,
            row.status,
            markedByUserId || null,
            markedAt
          ]);
        }
      });
    },

    async hasAttendanceNotification({ sessionId, studentUserId, type }) {
      const row = await postgres.queryOne(`
        SELECT 1
        FROM attendance_notifications
        WHERE session_id = ? AND student_user_id = ? AND type = ?
        LIMIT 1
      `, [sessionId, studentUserId, type]);
      return !!row;
    },

    async createAttendanceNotification({ idFactory, workspaceId, sessionId, channelId, studentUserId, type }) {
      await postgres.execute(`
        INSERT INTO attendance_notifications (id, workspace_id, session_id, channel_id, student_user_id, type)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT (session_id, student_user_id, type) DO NOTHING
      `, [idFactory('anotif'), workspaceId, sessionId, channelId, studentUserId, type]);
    },

    async listStudentAttendance({ workspaceId, studentId, limit }) {
      return postgres.queryMany(`
        SELECT ar.status, s.session_date, c.name AS class_name, ar.channel_id
        FROM attendance_records ar
        JOIN attendance_sessions s ON s.id = ar.session_id
        JOIN channels c ON c.id = ar.channel_id
        WHERE ar.workspace_id = ? AND ar.student_user_id = ?
        ORDER BY s.session_date DESC, ar.marked_at DESC, ar.id DESC
        LIMIT ?
      `, [workspaceId, studentId, limit]);
    },

    async getStudentAttendanceSummary({ workspaceId, studentId, classIds = [], limit = 50 }) {
      const filters = ['ar.workspace_id = ?', 'ar.student_user_id = ?'];
      const params = [workspaceId, studentId];
      if (classIds.length) {
        filters.push(`ar.channel_id IN (${buildSqlInPlaceholders(classIds.length)})`);
        params.push(...classIds);
      }

      const rows = await postgres.queryMany(`
        SELECT ar.status, s.session_date AS "sessionDate", c.name AS "className", ar.channel_id AS "channelId"
        FROM attendance_records ar
        JOIN attendance_sessions s ON s.id = ar.session_id
        JOIN channels c ON c.id = ar.channel_id
        WHERE ${filters.join(' AND ')}
        ORDER BY s.session_date DESC, ar.marked_at DESC, ar.id DESC
        LIMIT ?
      `, [...params, limit]);

      const present = rows.filter((row) => String(row.status || '').toLowerCase() === 'present').length;
      const total = rows.length;
      const absent = Math.max(0, total - present);
      const attendanceRate = total ? Math.round((present / total) * 100) : 0;
      return {
        total,
        present,
        absent,
        attendanceRate,
        recent: rows.slice(0, 10)
      };
    },

    async reassignChannelAttendance({ targetChannelId, duplicateChannelId }) {
      await postgres.transaction(async (tx) => {
        await tx.execute('UPDATE attendance_sessions SET channel_id = ? WHERE channel_id = ?', [targetChannelId, duplicateChannelId]);
        await tx.execute('UPDATE attendance_records SET channel_id = ? WHERE channel_id = ?', [targetChannelId, duplicateChannelId]);
        await tx.execute('UPDATE attendance_notifications SET channel_id = ? WHERE channel_id = ?', [targetChannelId, duplicateChannelId]);
      });
    },

    async deleteChannelAttendanceData(channelId) {
      await postgres.transaction(async (tx) => {
        await tx.execute('DELETE FROM attendance_notifications WHERE channel_id = ?', [channelId]);
        await tx.execute('DELETE FROM attendance_records WHERE channel_id = ?', [channelId]);
        await tx.execute('DELETE FROM attendance_sessions WHERE channel_id = ?', [channelId]);
      });
    }
  };
}

module.exports = {
  createAttendanceRepository
};
