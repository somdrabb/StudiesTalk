'use strict';

const { normalizeEngine } = require('../../db/helpers');

function createChannelRepository({ engine = 'sqlite', sqliteDb } = {}) {
  const normalizedEngine = normalizeEngine(engine);
  if (normalizedEngine === 'postgres') return createPostgresChannelRepository();
  if (!sqliteDb) throw new Error('sqliteDb is required for the SQLite channel repository');
  return createSqliteChannelRepository(sqliteDb);
}

function normalizeChannelRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    topic: row.topic || '',
    members: Number(row.members || 0),
    unread: Number(row.unread || 0),
    category: row.category || 'classes',
    workspaceId: row.workspaceId || row.workspace_id || 'default',
    memberCount: Number(row.memberCount || row.member_count || row.members || 0)
  };
}

function slugifyChannelId(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'channel';
}

function listChannelsSql(includeGlobal, maxFn = 'GREATEST') {
  return `
    SELECT
      c.id,
      c.name,
      c.topic,
      c.members,
      c.unread,
      c.category,
      c.workspace_id AS workspaceId,
      ${maxFn}(
        COALESCE(cm.cnt, 0),
        COALESCE(wm.cnt, 0),
        COALESCE(uw.cnt, 0),
        COALESCE(c.members, 0)
      ) AS memberCount
    FROM channels c
    LEFT JOIN (
      SELECT channel_id, COUNT(*) AS cnt
      FROM channel_members
      GROUP BY channel_id
    ) cm ON cm.channel_id = c.id
    LEFT JOIN (
      SELECT workspace_id, COUNT(*) AS cnt
      FROM workspace_members
      GROUP BY workspace_id
    ) wm ON wm.workspace_id = c.workspace_id
    LEFT JOIN (
      SELECT workspace_id, COUNT(*) AS cnt
      FROM users
      GROUP BY workspace_id
    ) uw ON uw.workspace_id = c.workspace_id
    WHERE ${includeGlobal ? "c.workspace_id IN (?, 'all')" : 'c.workspace_id = ?'}
    ORDER BY lower(COALESCE(c.name, c.id)) ASC
  `;
}

function createSqliteChannelRepository(sqliteDb) {
  return {
    engine: 'sqlite',

    listChannels({ workspaceId, requestedWorkspaceId, includeGlobal = false }) {
      const targetWorkspaceId = requestedWorkspaceId ? workspaceId : workspaceId;
      const rows = sqliteDb.prepare(listChannelsSql(includeGlobal && !!requestedWorkspaceId, 'MAX')).all(targetWorkspaceId);
      return rows.map(normalizeChannelRow);
    },

    workspaceExists(workspaceId) {
      if (String(workspaceId || '').trim() === 'all') return true;
      return !!sqliteDb.prepare('SELECT 1 FROM workspaces WHERE id = ?').get(workspaceId);
    },

    channelIdExists(channelId) {
      return !!sqliteDb.prepare('SELECT 1 FROM channels WHERE id = ?').get(channelId);
    },

    createChannel({ id, name, topic, members, unread, workspaceId, category, memberIds = [] }) {
      const tx = sqliteDb.transaction(() => {
        sqliteDb.prepare(`
          INSERT INTO channels (id, name, topic, members, unread, workspace_id, category)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(id, name, topic, members, unread, workspaceId, category);

        if (memberIds.length) {
          const insertMember = sqliteDb.prepare(
            'INSERT OR IGNORE INTO channel_members (channel_id, user_id) VALUES (?, ?)'
          );
          memberIds.forEach((userId) => insertMember.run(id, userId));
        }
      });
      tx();
      return { id, name, topic, members, unread, workspaceId, category };
    },

    getChannelById(channelId) {
      return normalizeChannelRow(sqliteDb.prepare(`
        SELECT id, name, topic, members, unread, category, workspace_id AS workspaceId
        FROM channels
        WHERE id = ?
      `).get(channelId));
    },

    updateChannel(payload) {
      sqliteDb.prepare(`
        UPDATE channels
        SET name = ?, topic = ?, members = ?, unread = ?, category = ?
        WHERE id = ?
      `).run(payload.name, payload.topic, payload.members, payload.unread, payload.category, payload.id);
      return payload;
    },

    deleteChannel(channelId) {
      const result = sqliteDb.prepare('DELETE FROM channels WHERE id = ?').run(channelId);
      return !!result?.changes;
    },

    getChannelMembers(channelId) {
      return sqliteDb.prepare(`
        SELECT user_id
        FROM channel_members
        WHERE channel_id = ?
        ORDER BY user_id ASC
      `).all(channelId).map((row) => String(row.user_id || '')).filter(Boolean);
    },

    addChannelMember(channelId, userId) {
      sqliteDb.prepare('INSERT OR IGNORE INTO channel_members (channel_id, user_id) VALUES (?, ?)').run(channelId, userId);
      return { ok: true };
    },

    removeChannelMember(channelId, userId) {
      sqliteDb.prepare('DELETE FROM channel_members WHERE channel_id = ? AND user_id = ?').run(channelId, userId);
      return { ok: true };
    },

    findHomeworkChannelForClass(classChannelId) {
      const topic = `homework_for:${classChannelId}`;
      return sqliteDb.prepare(`
        SELECT id, name, topic, members, unread, category, workspace_id AS workspaceId
        FROM channels
        WHERE lower(category) = 'homework' AND topic = ?
        LIMIT 1
      `).get(topic) || null;
    },

    ensureHomeworkChannelForClass(classChannel) {
      if (!classChannel) return null;
      if (String(classChannel.category || '').toLowerCase() !== 'classes') return null;
      const className = String(classChannel.name || '').trim().toLowerCase();
      if (className === 'teachers' || String(classChannel.id || '').startsWith('teachers-')) return null;
      const workspaceId = classChannel.workspaceId || classChannel.workspace_id || 'default';
      const topic = `homework_for:${classChannel.id}`;
      let hw = sqliteDb.prepare(`
        SELECT id
        FROM channels
        WHERE workspace_id = ? AND lower(category) = 'homework' AND topic = ?
      `).get(workspaceId, topic);
      if (!hw) {
        const baseId = slugifyChannelId(`${classChannel.id}-homework`);
        let hwId = baseId;
        let suffix = 1;
        while (sqliteDb.prepare('SELECT 1 FROM channels WHERE id = ?').get(hwId)) {
          hwId = `${baseId}-${suffix++}`;
        }
        sqliteDb.prepare(`
          INSERT INTO channels (id, name, topic, members, unread, workspace_id, category)
          VALUES (?, ?, ?, 0, 0, ?, 'homework')
        `).run(hwId, `${classChannel.name} Homework`, topic, workspaceId);
        hw = { id: hwId };
      }
      const memberRows = sqliteDb.prepare('SELECT user_id FROM channel_members WHERE channel_id = ?').all(classChannel.id);
      const insertMember = sqliteDb.prepare('INSERT OR IGNORE INTO channel_members (channel_id, user_id) VALUES (?, ?)');
      memberRows.forEach((row) => insertMember.run(hw.id, row.user_id));
      return hw.id;
    }
  };
}

function createPostgresChannelRepository() {
  const postgres = require('../../db/postgres');
  return {
    engine: 'postgres',

    async listChannels({ workspaceId, requestedWorkspaceId, includeGlobal = false }) {
      const targetWorkspaceId = requestedWorkspaceId ? workspaceId : workspaceId;
      const rows = await postgres.many(listChannelsSql(includeGlobal && !!requestedWorkspaceId), [targetWorkspaceId]);
      return rows.map(normalizeChannelRow);
    },

    async workspaceExists(workspaceId) {
      if (String(workspaceId || '').trim() === 'all') return true;
      return !!(await postgres.one('SELECT 1 FROM workspaces WHERE id = ?', [workspaceId]));
    },

    async channelIdExists(channelId) {
      return !!(await postgres.one('SELECT 1 FROM channels WHERE id = ?', [channelId]));
    },

    async createChannel({ id, name, topic, members, unread, workspaceId, category, memberIds = [] }) {
      await postgres.transaction(async (tx) => {
        await tx.exec(`
          INSERT INTO channels (id, name, topic, members, unread, workspace_id, category)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [id, name, topic, members, unread, workspaceId, category]);

        for (const userId of memberIds) {
          await tx.exec(`
            INSERT INTO channel_members (channel_id, user_id)
            VALUES (?, ?)
            ON CONFLICT DO NOTHING
          `, [id, userId]);
        }
      });
      return { id, name, topic, members, unread, workspaceId, category };
    },

    async getChannelById(channelId) {
      return normalizeChannelRow(await postgres.one(`
        SELECT id, name, topic, members, unread, category, workspace_id AS "workspaceId"
        FROM channels
        WHERE id = ?
      `, [channelId]));
    },

    async updateChannel(payload) {
      await postgres.exec(`
        UPDATE channels
        SET name = ?, topic = ?, members = ?, unread = ?, category = ?
        WHERE id = ?
      `, [payload.name, payload.topic, payload.members, payload.unread, payload.category, payload.id]);
      return payload;
    },

    async deleteChannel(channelId) {
      const result = await postgres.exec('DELETE FROM channels WHERE id = ?', [channelId]);
      return Number(result.rowCount || 0) > 0;
    },

    async getChannelMembers(channelId) {
      const rows = await postgres.many(`
        SELECT user_id
        FROM channel_members
        WHERE channel_id = ?
        ORDER BY user_id ASC
      `, [channelId]);
      return rows.map((row) => String(row.user_id || '')).filter(Boolean);
    },

    async addChannelMember(channelId, userId) {
      await postgres.exec(`
        INSERT INTO channel_members (channel_id, user_id)
        VALUES (?, ?)
        ON CONFLICT DO NOTHING
      `, [channelId, userId]);
      return { ok: true };
    },

    async removeChannelMember(channelId, userId) {
      await postgres.exec('DELETE FROM channel_members WHERE channel_id = ? AND user_id = ?', [channelId, userId]);
      return { ok: true };
    },

    async findHomeworkChannelForClass(classChannelId) {
      const topic = `homework_for:${classChannelId}`;
      return postgres.one(`
        SELECT id, name, topic, members, unread, category, workspace_id AS "workspaceId"
        FROM channels
        WHERE lower(category) = 'homework' AND topic = ?
        LIMIT 1
      `, [topic]);
    },

    async ensureHomeworkChannelForClass(classChannel) {
      if (!classChannel) return null;
      if (String(classChannel.category || '').toLowerCase() !== 'classes') return null;
      const className = String(classChannel.name || '').trim().toLowerCase();
      if (className === 'teachers' || String(classChannel.id || '').startsWith('teachers-')) return null;
      const workspaceId = classChannel.workspaceId || classChannel.workspace_id || 'default';
      const topic = `homework_for:${classChannel.id}`;
      return postgres.transaction(async (tx) => {
        let hw = await tx.one(`
          SELECT id
          FROM channels
          WHERE workspace_id = ? AND lower(category) = 'homework' AND topic = ?
        `, [workspaceId, topic]);
        if (!hw) {
          const baseId = slugifyChannelId(`${classChannel.id}-homework`);
          let hwId = baseId;
          let suffix = 1;
          while (await tx.one('SELECT 1 FROM channels WHERE id = ?', [hwId])) {
            hwId = `${baseId}-${suffix++}`;
          }
          await tx.exec(`
            INSERT INTO channels (id, name, topic, members, unread, workspace_id, category)
            VALUES (?, ?, ?, 0, 0, ?, 'homework')
          `, [hwId, `${classChannel.name} Homework`, topic, workspaceId]);
          hw = { id: hwId };
        }
        const memberRows = await tx.many('SELECT user_id FROM channel_members WHERE channel_id = ?', [classChannel.id]);
        for (const row of memberRows) {
          await tx.exec(`
            INSERT INTO channel_members (channel_id, user_id)
            VALUES (?, ?)
            ON CONFLICT DO NOTHING
          `, [hw.id, row.user_id]);
        }
        return hw.id;
      });
    }
  };
}

module.exports = {
  createChannelRepository
};
