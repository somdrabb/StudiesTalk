'use strict';

const { normalizeEngine } = require('../../db/helpers');

function slugifyChannelId(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'channel';
}

function createWorkspaceRepository({ engine = 'sqlite', sqliteDb } = {}) {
  const normalizedEngine = normalizeEngine(engine);
  if (normalizedEngine === 'postgres') return createPostgresWorkspaceRepository();
  if (!sqliteDb) throw new Error('sqliteDb is required for the SQLite workspace repository');
  return createSqliteWorkspaceRepository(sqliteDb);
}

function parseSettingsJson(row) {
  if (!row?.settingsJson) return {};
  return JSON.parse(row.settingsJson);
}

function createSqliteWorkspaceRepository(sqliteDb) {
  function listIds() {
    return sqliteDb.prepare('SELECT id FROM workspaces').all().map((row) => String(row.id || ''));
  }

  return {
    engine: 'sqlite',

    getWorkspaceName(workspaceId) {
      const row = sqliteDb.prepare('SELECT name FROM workspaces WHERE id = ?').get(workspaceId);
      return row?.name || '';
    },

    getWorkspaceBasic(workspaceId) {
      return sqliteDb.prepare(`
        SELECT id, name, logo_url AS logoUrl, admin_email AS adminEmail, school_code AS schoolCode, status
        FROM workspaces
        WHERE id = ?
      `).get(workspaceId) || null;
    },

    listWorkspaceIds() {
      return listIds();
    },

    countWorkspaces() {
      return sqliteDb.prepare('SELECT COUNT(*) AS c FROM workspaces').get().c || 0;
    },

    listAdminWorkspaces() {
      return sqliteDb.prepare(`
        SELECT id, name, school_code AS schoolCode, status, admin_email AS adminEmail
        FROM workspaces
        ORDER BY name
      `).all();
    },

    workspaceExists(workspaceId) {
      return !!sqliteDb.prepare('SELECT 1 FROM workspaces WHERE id = ?').get(workspaceId);
    },

    upsertWorkspace({ id, name, schoolCode = null, status = 'active' }) {
      const existing = sqliteDb.prepare('SELECT id FROM workspaces WHERE id = ?').get(id);
      if (existing) {
        sqliteDb.prepare(`
          UPDATE workspaces
          SET name = ?, school_code = COALESCE(?, school_code), status = ?
          WHERE id = ?
        `).run(name, schoolCode, status, id);
      } else {
        sqliteDb.prepare(`
          INSERT INTO workspaces (id, name, school_code, status)
          VALUES (?, ?, ?, ?)
        `).run(id, name, schoolCode, status);
      }
      return { id, existed: !!existing };
    },

    createApprovedWorkspaceWithAdmin({ workspace, admin, defaultChannels = [] }) {
      const result = sqliteDb.transaction(() => {
        sqliteDb.prepare(`
          INSERT INTO workspaces (id, name, school_code, status, admin_email, approved_at, approved_by, created_at)
          VALUES (?, ?, ?, 'approved', ?, ?, ?, ?)
        `).run(
          workspace.id,
          workspace.name,
          workspace.schoolCode || null,
          workspace.adminEmail,
          workspace.approvedAt,
          workspace.approvedBy,
          workspace.createdAt
        );

        const existingUser = sqliteDb.prepare(`
          SELECT id FROM users WHERE lower(email) = lower(?) AND workspace_id = ? LIMIT 1
        `).get(admin.email, workspace.id);
        let adminId = existingUser?.id || admin.id;
        if (existingUser) {
          sqliteDb.prepare(`
            UPDATE users
            SET role='school_admin',
                status='active',
                workspace_id=?,
                password_hash=?,
                must_change_password=1,
                temp_login_started_at=?
            WHERE id=?
          `).run(workspace.id, admin.passwordHash, admin.tempLoginStartedAt, adminId);
        } else {
          sqliteDb.prepare(`
            INSERT INTO users
             (id, workspace_id, first_name, last_name, name, username, email, password_hash, role, status, created_at, must_change_password, temp_login_started_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'school_admin', 'active', ?, 1, ?)
          `).run(
            adminId,
            workspace.id,
            admin.firstName,
            admin.lastName,
            admin.name,
            admin.username,
            admin.email,
            admin.passwordHash,
            workspace.createdAt,
            admin.tempLoginStartedAt
          );
        }
        sqliteDb.prepare(`
          INSERT OR IGNORE INTO workspace_members (workspace_id, user_id, role)
          VALUES (?, ?, 'school_admin')
        `).run(workspace.id, adminId);

        const insertChannel = sqliteDb.prepare(`
          INSERT OR IGNORE INTO channels (id, name, topic, members, unread, workspace_id, category)
          VALUES (?, ?, ?, 1, 0, ?, ?)
        `);
        const insertMember = sqliteDb.prepare('INSERT OR IGNORE INTO channel_members (channel_id, user_id) VALUES (?, ?)');
        for (const channel of defaultChannels) {
          let channelId = channel.id || slugifyChannelId(channel.name);
          let suffix = 1;
          const baseId = channelId;
          while (sqliteDb.prepare('SELECT 1 FROM channels WHERE id = ?').get(channelId)) {
            channelId = `${baseId}-${suffix++}`;
          }
          insertChannel.run(channelId, channel.name, channel.topic || '', workspace.id, channel.category || 'classes');
          insertMember.run(channelId, adminId);
        }
        return { workspaceId: workspace.id, adminId, existingUser: !!existingUser };
      })();
      return result;
    },

    getWorkspaceSettings(workspaceId) {
      const row = sqliteDb.prepare(`
        SELECT settings_json AS settingsJson
        FROM workspace_settings_admin
        WHERE workspace_id = ?
      `).get(workspaceId);
      return parseSettingsJson(row);
    },

    saveWorkspaceSettings({ workspaceId, settings, updatedAt }) {
      sqliteDb.prepare(`
        INSERT INTO workspace_settings_admin (workspace_id, settings_json, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(workspace_id) DO UPDATE SET
          settings_json = excluded.settings_json,
          updated_at = excluded.updated_at
      `).run(workspaceId, JSON.stringify(settings || {}), updatedAt);
    },

    getClassMeta(workspaceId, channelId) {
      return sqliteDb.prepare(`
        SELECT * FROM workspace_class_meta WHERE workspace_id = ? AND channel_id = ? LIMIT 1
      `).get(workspaceId, channelId) || null;
    },

    upsertClassMeta(workspaceId, channelId, payload) {
      sqliteDb.prepare(`
        INSERT INTO workspace_class_meta (workspace_id, channel_id, start_date, end_date, status, capacity, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(workspace_id, channel_id) DO UPDATE SET
          start_date = excluded.start_date,
          end_date = excluded.end_date,
          status = excluded.status,
          capacity = excluded.capacity,
          updated_at = datetime('now')
      `).run(
        workspaceId,
        channelId,
        payload.start_date || null,
        payload.end_date || null,
        payload.status || 'private',
        payload.capacity != null ? Number(payload.capacity) : 0
      );
    },

    countChannelMembers(channelId) {
      const rows = sqliteDb.prepare(`
        SELECT u.role,
               COALESCE(u.name, u.username, u.email, '') AS display_name
        FROM channel_members cm
        LEFT JOIN users u ON u.id = cm.user_id
        WHERE cm.channel_id = ?
      `).all(channelId);
      const students = rows.filter((u) => String(u.role || '').toLowerCase().includes('student'));
      const teacherRows = rows.filter((u) => String(u.role || '').toLowerCase().includes('teacher'));
      const teacherNames = teacherRows.map((u) => String(u.display_name || '').trim()).filter(Boolean);
      return {
        totalStudents: students.length,
        totalTeachers: teacherRows.length,
        teacherNames
      };
    },

    deleteWorkspaceCascade(workspaceId) {
      const channelIds = sqliteDb.prepare('SELECT id FROM channels WHERE workspace_id = ?').all(workspaceId).map((row) => row.id);
      const userIds = sqliteDb.prepare('SELECT id FROM users WHERE workspace_id = ?').all(workspaceId).map((row) => row.id);
      const channelPlaceholders = channelIds.length ? channelIds.map(() => '?').join(',') : '';
      const userPlaceholders = userIds.length ? userIds.map(() => '?').join(',') : '';
      const tx = sqliteDb.transaction(() => {
        if (channelIds.length) {
          const messageIdQuery = `SELECT id FROM messages WHERE channel_id IN (${channelPlaceholders})`;
          const replyIdQuery = `SELECT id FROM replies WHERE message_id IN (${messageIdQuery})`;
          sqliteDb.prepare(`DELETE FROM message_reaction_users WHERE message_id IN (${messageIdQuery})`).run(...channelIds);
          sqliteDb.prepare(`DELETE FROM message_reactions WHERE message_id IN (${messageIdQuery})`).run(...channelIds);
          sqliteDb.prepare(`DELETE FROM reply_reaction_users WHERE reply_id IN (${replyIdQuery})`).run(...channelIds);
          sqliteDb.prepare(`DELETE FROM reply_reactions WHERE reply_id IN (${replyIdQuery})`).run(...channelIds);
          sqliteDb.prepare(`DELETE FROM replies WHERE message_id IN (${messageIdQuery})`).run(...channelIds);
          sqliteDb.prepare(`DELETE FROM messages WHERE channel_id IN (${channelPlaceholders})`).run(...channelIds);
          sqliteDb.prepare(`DELETE FROM channel_members WHERE channel_id IN (${channelPlaceholders})`).run(...channelIds);
        }

        sqliteDb.prepare('DELETE FROM channels WHERE workspace_id = ?').run(workspaceId);
        sqliteDb.prepare('DELETE FROM workspace_members WHERE workspace_id = ?').run(workspaceId);
        sqliteDb.prepare('DELETE FROM calendar_events WHERE workspace_id = ?').run(workspaceId);

        if (userIds.length) {
          sqliteDb.prepare(`DELETE FROM dm_members WHERE user_id IN (${userPlaceholders})`).run(...userIds);
          const dmIds = sqliteDb.prepare(`SELECT id FROM dms WHERE created_by IN (${userPlaceholders})`).all(...userIds).map((row) => row.id);
          if (dmIds.length) {
            const dmPlaceholders = dmIds.map(() => '?').join(',');
            const dmMsgQuery = `SELECT id FROM dm_messages WHERE dm_id IN (${dmPlaceholders})`;
            const dmReplyQuery = `SELECT id FROM dm_replies WHERE dm_message_id IN (${dmMsgQuery})`;
            sqliteDb.prepare(`DELETE FROM dm_reply_reaction_users WHERE reply_id IN (${dmReplyQuery})`).run(...dmIds);
            sqliteDb.prepare(`DELETE FROM dm_reply_reactions WHERE reply_id IN (${dmReplyQuery})`).run(...dmIds);
            sqliteDb.prepare(`DELETE FROM dm_replies WHERE dm_message_id IN (${dmMsgQuery})`).run(...dmIds);
            sqliteDb.prepare(`DELETE FROM dm_message_reaction_users WHERE message_id IN (${dmMsgQuery})`).run(...dmIds);
            sqliteDb.prepare(`DELETE FROM dm_message_reactions WHERE message_id IN (${dmMsgQuery})`).run(...dmIds);
            sqliteDb.prepare(`DELETE FROM dm_messages WHERE dm_id IN (${dmPlaceholders})`).run(...dmIds);
            sqliteDb.prepare(`DELETE FROM dm_members WHERE dm_id IN (${dmPlaceholders})`).run(...dmIds);
            sqliteDb.prepare(`DELETE FROM dms WHERE id IN (${dmPlaceholders})`).run(...dmIds);
          }
          sqliteDb.prepare(`DELETE FROM channel_members WHERE user_id IN (${userPlaceholders})`).run(...userIds);
          sqliteDb.prepare(`DELETE FROM users WHERE id IN (${userPlaceholders})`).run(...userIds);
        }

        sqliteDb.prepare('DELETE FROM workspaces WHERE id = ?').run(workspaceId);
      });
      tx();
      return { ok: true };
    }
  };
}

function createPostgresWorkspaceRepository() {
  const postgres = require('../../db/postgres');
  async function listIds() {
    const rows = await postgres.many('SELECT id FROM workspaces');
    return rows.map((row) => String(row.id || ''));
  }
  return {
    engine: 'postgres',

    async getWorkspaceName(workspaceId) {
      const row = await postgres.one('SELECT name FROM workspaces WHERE id = ?', [workspaceId]);
      return row?.name || '';
    },
    async getWorkspaceBasic(workspaceId) {
      return postgres.one(`
        SELECT id, name, logo_url AS "logoUrl", admin_email AS "adminEmail", school_code AS "schoolCode", status
        FROM workspaces WHERE id = ?
      `, [workspaceId]);
    },
    async listWorkspaceIds() {
      return listIds();
    },
    async countWorkspaces() {
      const row = await postgres.one('SELECT COUNT(*)::int AS c FROM workspaces');
      return row?.c || 0;
    },
    async listAdminWorkspaces() {
      return postgres.many(`
        SELECT id, name, school_code AS "schoolCode", status, admin_email AS "adminEmail"
        FROM workspaces
        ORDER BY name
      `);
    },
    async workspaceExists(workspaceId) {
      return !!(await postgres.one('SELECT 1 FROM workspaces WHERE id = ?', [workspaceId]));
    },
    async upsertWorkspace({ id, name, schoolCode = null, status = 'active' }) {
      const existing = await postgres.one('SELECT id FROM workspaces WHERE id = ?', [id]);
      if (existing) {
        await postgres.exec(`
          UPDATE workspaces
          SET name = ?, school_code = COALESCE(?, school_code), status = ?
          WHERE id = ?
        `, [name, schoolCode, status, id]);
      } else {
        await postgres.exec(`
          INSERT INTO workspaces (id, name, school_code, status)
          VALUES (?, ?, ?, ?)
        `, [id, name, schoolCode, status]);
      }
      return { id, existed: !!existing };
    },
    async createApprovedWorkspaceWithAdmin({ workspace, admin, defaultChannels = [] }) {
      return postgres.transaction(async (tx) => {
        await tx.exec(`
          INSERT INTO workspaces (id, name, school_code, status, admin_email, approved_at, approved_by, created_at)
          VALUES (?, ?, ?, 'approved', ?, ?, ?, ?)
        `, [
          workspace.id,
          workspace.name,
          workspace.schoolCode || null,
          workspace.adminEmail,
          workspace.approvedAt,
          workspace.approvedBy,
          workspace.createdAt
        ]);

        const existingUser = await tx.one(`
          SELECT id FROM users WHERE lower(email::text) = lower(?) AND workspace_id = ? LIMIT 1
        `, [admin.email, workspace.id]);
        const adminId = existingUser?.id || admin.id;
        if (existingUser) {
          await tx.exec(`
            UPDATE users
            SET role='school_admin',
                status='active',
                workspace_id=?,
                password_hash=?,
                must_change_password=true,
                temp_login_started_at=?
            WHERE id=?
          `, [workspace.id, admin.passwordHash, admin.tempLoginStartedAt, adminId]);
        } else {
          await tx.exec(`
            INSERT INTO users
             (id, workspace_id, first_name, last_name, name, username, email, password_hash, role, status, created_at, must_change_password, temp_login_started_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'school_admin', 'active', ?, true, ?)
          `, [
            adminId,
            workspace.id,
            admin.firstName,
            admin.lastName,
            admin.name,
            admin.username,
            admin.email,
            admin.passwordHash,
            workspace.createdAt,
            admin.tempLoginStartedAt
          ]);
        }
        await tx.exec(`
          INSERT INTO workspace_members (workspace_id, user_id, role)
          VALUES (?, ?, 'school_admin')
          ON CONFLICT DO NOTHING
        `, [workspace.id, adminId]);

        for (const channel of defaultChannels) {
          let channelId = channel.id || slugifyChannelId(channel.name);
          let suffix = 1;
          const baseId = channelId;
          while (await tx.one('SELECT 1 FROM channels WHERE id = ?', [channelId])) {
            channelId = `${baseId}-${suffix++}`;
          }
          await tx.exec(`
            INSERT INTO channels (id, name, topic, members, unread, workspace_id, category)
            VALUES (?, ?, ?, 1, 0, ?, ?)
            ON CONFLICT DO NOTHING
          `, [channelId, channel.name, channel.topic || '', workspace.id, channel.category || 'classes']);
          await tx.exec(`
            INSERT INTO channel_members (channel_id, user_id)
            VALUES (?, ?)
            ON CONFLICT DO NOTHING
          `, [channelId, adminId]);
        }
        return { workspaceId: workspace.id, adminId, existingUser: !!existingUser };
      });
    },
    async getWorkspaceSettings(workspaceId) {
      const row = await postgres.one(`
        SELECT settings_json AS "settingsJson"
        FROM workspace_settings_admin
        WHERE workspace_id = ?
      `, [workspaceId]);
      return parseSettingsJson(row);
    },
    async saveWorkspaceSettings({ workspaceId, settings, updatedAt }) {
      await postgres.exec(`
        INSERT INTO workspace_settings_admin (workspace_id, settings_json, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(workspace_id) DO UPDATE SET
          settings_json = EXCLUDED.settings_json,
          updated_at = EXCLUDED.updated_at
      `, [workspaceId, JSON.stringify(settings || {}), updatedAt]);
    },
    async getClassMeta(workspaceId, channelId) {
      return postgres.one('SELECT * FROM workspace_class_meta WHERE workspace_id = ? AND channel_id = ? LIMIT 1', [workspaceId, channelId]);
    },
    async upsertClassMeta(workspaceId, channelId, payload) {
      await postgres.exec(`
        INSERT INTO workspace_class_meta (workspace_id, channel_id, start_date, end_date, status, capacity, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(workspace_id, channel_id) DO UPDATE SET
          start_date = EXCLUDED.start_date,
          end_date = EXCLUDED.end_date,
          status = EXCLUDED.status,
          capacity = EXCLUDED.capacity,
          updated_at = CURRENT_TIMESTAMP
      `, [workspaceId, channelId, payload.start_date || null, payload.end_date || null, payload.status || 'private', payload.capacity != null ? Number(payload.capacity) : 0]);
    },
    async countChannelMembers(channelId) {
      const rows = await postgres.many(`
        SELECT u.role,
               COALESCE(u.name, u.username, u.email::text, '') AS display_name
        FROM channel_members cm
        LEFT JOIN users u ON u.id = cm.user_id
        WHERE cm.channel_id = ?
      `, [channelId]);
      const students = rows.filter((u) => String(u.role || '').toLowerCase().includes('student'));
      const teacherRows = rows.filter((u) => String(u.role || '').toLowerCase().includes('teacher'));
      const teacherNames = teacherRows.map((u) => String(u.display_name || '').trim()).filter(Boolean);
      return { totalStudents: students.length, totalTeachers: teacherRows.length, teacherNames };
    },
    async deleteWorkspaceCascade() {
      throw new Error('Workspace delete cascade is not implemented for postgres yet');
    }
  };
}

module.exports = {
  createWorkspaceRepository
};
