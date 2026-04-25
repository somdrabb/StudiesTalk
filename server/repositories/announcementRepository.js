'use strict';

const { normalizeEngine } = require('../../db/helpers');

function normalizeAnnouncementRow(row, channelId, workspaceId) {
  return {
    id: row.id,
    channelId,
    workspaceId,
    title: row.title,
    status: row.status,
    priority: row.priority,
    content: row.content,
    author: row.author,
    createdAt: row.created_at || row.createdAt,
    readCount: Number(row.read_count ?? row.readCount ?? 0),
    readByUser: !!(row.read_by_user ?? row.readByUser)
  };
}

function createAnnouncementRepository({ engine = 'sqlite', sqliteDb } = {}) {
  const normalizedEngine = normalizeEngine(engine);
  if (normalizedEngine === 'postgres') return createPostgresAnnouncementRepository();
  if (!sqliteDb) throw new Error('sqliteDb is required for the SQLite announcement repository');
  return createSqliteAnnouncementRepository(sqliteDb);
}

function createSqliteAnnouncementRepository(sqliteDb) {
  return {
    engine: 'sqlite',

    async listAnnouncements({ channelId, workspaceId, userId }) {
      const rows = sqliteDb.prepare(`
        SELECT
          a.id,
          a.title,
          a.status,
          a.priority,
          a.content,
          a.author,
          a.created_at,
          a.read_count,
          EXISTS (
            SELECT 1
            FROM announcement_reads ar
            WHERE ar.announcement_id = a.id
              AND ar.user_id = ?
          ) AS read_by_user
        FROM announcements a
        WHERE channel_id = ?
        ORDER BY created_at ASC
      `).all(userId, channelId);
      return rows.map((row) => normalizeAnnouncementRow(row, channelId, workspaceId));
    },

    async createAnnouncement({ id, channelId, workspaceId, title, status, priority, content, author, createdAt }) {
      sqliteDb.prepare(`
        INSERT INTO announcements
        (id, channel_id, workspace_id, title, status, priority, content, author, created_at, read_count)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
      `).run(id, channelId, workspaceId, title, status, priority, content, author, createdAt);
      return {
        id,
        channelId,
        workspaceId,
        title,
        status,
        priority,
        content,
        author,
        createdAt,
        readByUser: false
      };
    },

    async getAnnouncementMeta(announcementId) {
      return sqliteDb.prepare(`
        SELECT id, channel_id AS channelId, read_count AS readCount
        FROM announcements
        WHERE id = ?
      `).get(announcementId) || null;
    },

    async markAnnouncementRead({ announcementId, userId, createdAt }) {
      const insertResult = sqliteDb.prepare(`
        INSERT OR IGNORE INTO announcement_reads (announcement_id, user_id, created_at)
        VALUES (?, ?, ?)
      `).run(announcementId, userId, createdAt);

      if (insertResult.changes > 0) {
        sqliteDb.prepare('UPDATE announcements SET read_count = read_count + 1 WHERE id = ?').run(announcementId);
      }

      const updated = await this.getAnnouncementMeta(announcementId);
      return {
        inserted: insertResult.changes > 0,
        announcement: updated
      };
    },

    async deleteAnnouncement({ announcementId, channelId }) {
      const existing = sqliteDb.prepare(`
        SELECT id, channel_id AS channelId
        FROM announcements
        WHERE id = ?
      `).get(announcementId);
      if (!existing) return { found: false, deleted: false, channelMismatch: false };
      if (String(existing.channelId) !== String(channelId)) {
        return { found: true, deleted: false, channelMismatch: true };
      }
      const result = sqliteDb.prepare('DELETE FROM announcements WHERE id = ?').run(announcementId);
      return { found: true, deleted: !!result?.changes, channelMismatch: false };
    }
  };
}

function createPostgresAnnouncementRepository() {
  const postgres = require('../../db/postgres');
  return {
    engine: 'postgres',

    async listAnnouncements({ channelId, workspaceId, userId }) {
      const rows = await postgres.many(`
        SELECT
          a.id,
          a.title,
          a.status,
          a.priority,
          a.content,
          a.author,
          a.created_at AS "createdAt",
          a.read_count AS "readCount",
          EXISTS (
            SELECT 1
            FROM announcement_reads ar
            WHERE ar.announcement_id = a.id
              AND ar.user_id = ?
          ) AS "readByUser"
        FROM announcements a
        WHERE channel_id = ?
        ORDER BY created_at ASC
      `, [userId, channelId]);
      return rows.map((row) => normalizeAnnouncementRow(row, channelId, workspaceId));
    },

    async createAnnouncement({ id, channelId, workspaceId, title, status, priority, content, author, createdAt }) {
      await postgres.exec(`
        INSERT INTO announcements
        (id, channel_id, workspace_id, title, status, priority, content, author, created_at, read_count)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
      `, [id, channelId, workspaceId, title, status, priority, content, author, createdAt]);
      return {
        id,
        channelId,
        workspaceId,
        title,
        status,
        priority,
        content,
        author,
        createdAt,
        readByUser: false
      };
    },

    async getAnnouncementMeta(announcementId) {
      return postgres.one(`
        SELECT id, channel_id AS "channelId", read_count AS "readCount"
        FROM announcements
        WHERE id = ?
      `, [announcementId]);
    },

    async markAnnouncementRead({ announcementId, userId, createdAt }) {
      const result = await postgres.exec(`
        INSERT INTO announcement_reads (announcement_id, user_id, created_at)
        VALUES (?, ?, ?)
        ON CONFLICT DO NOTHING
      `, [announcementId, userId, createdAt]);
      if (Number(result.rowCount || 0) > 0) {
        await postgres.exec('UPDATE announcements SET read_count = read_count + 1 WHERE id = ?', [announcementId]);
      }
      const updated = await this.getAnnouncementMeta(announcementId);
      return {
        inserted: Number(result.rowCount || 0) > 0,
        announcement: updated
      };
    },

    async deleteAnnouncement({ announcementId, channelId }) {
      const existing = await postgres.one(`
        SELECT id, channel_id AS "channelId"
        FROM announcements
        WHERE id = ?
      `, [announcementId]);
      if (!existing) return { found: false, deleted: false, channelMismatch: false };
      if (String(existing.channelId) !== String(channelId)) {
        return { found: true, deleted: false, channelMismatch: true };
      }
      const result = await postgres.exec('DELETE FROM announcements WHERE id = ?', [announcementId]);
      return { found: true, deleted: Number(result.rowCount || 0) > 0, channelMismatch: false };
    }
  };
}

module.exports = {
  createAnnouncementRepository
};
