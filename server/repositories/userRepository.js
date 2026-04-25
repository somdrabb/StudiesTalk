'use strict';

const { normalizeEngine } = require('../../db/helpers');

function createUserRepository({ engine = 'sqlite', sqliteDb } = {}) {
  const normalizedEngine = normalizeEngine(engine);
  if (normalizedEngine === 'postgres') return createPostgresUserRepository();
  if (!sqliteDb) throw new Error('sqliteDb is required for the SQLite user repository');
  return createSqliteUserRepository(sqliteDb);
}

function createSqliteUserRepository(sqliteDb) {
  function generateUsername(workspaceId, firstName, lastName) {
    const ws = workspaceId || 'default';
    const ln = String(lastName || '').trim();
    const fn = String(firstName || '').trim();
    let base = ln.toLowerCase().replace(/[^a-z0-9]+/g, '');
    if (!base) base = 'user';
    const existsStmt = sqliteDb.prepare('SELECT 1 FROM users WHERE workspace_id = ? AND username = ?');
    let candidate = `@${base}`;
    if (!existsStmt.get(ws, candidate)) return candidate;
    if (fn) {
      candidate = `@${fn[0].toLowerCase()}${base}`;
      if (!existsStmt.get(ws, candidate)) return candidate;
    }
    let i = 1;
    while (true) {
      candidate = `@${base}${i}`;
      if (!existsStmt.get(ws, candidate)) return candidate;
      i += 1;
    }
  }

  return {
    engine: 'sqlite',

    findAuthUserByIdentifier(identifier) {
      const normalized = String(identifier || '').trim().toLowerCase();
      if (!normalized) return null;
      if (normalized.includes('@')) {
        return sqliteDb.prepare(`
          SELECT id,
                 workspace_id AS workspaceId,
                 first_name,
                 last_name,
                 name,
                 username,
                 avatar_url AS avatarUrl,
                 password_hash,
                 role,
                 status,
                 course_start AS courseStart,
                 course_end AS courseEnd,
                 email,
                 native_language AS nativeLanguage,
                 native_language_confirmed AS nativeLanguageConfirmed,
                 must_change_password,
                 temp_login_started_at
          FROM users
          WHERE lower(email) = ?
          LIMIT 1
        `).get(normalized) || null;
      }
      return sqliteDb.prepare(`
        SELECT id,
               workspace_id AS workspaceId,
               first_name,
               last_name,
               name,
               username,
               avatar_url AS avatarUrl,
               password_hash,
               role,
               status,
               course_start AS courseStart,
               course_end AS courseEnd,
               email,
               native_language AS nativeLanguage,
               native_language_confirmed AS nativeLanguageConfirmed,
               must_change_password,
               temp_login_started_at
        FROM users
        WHERE lower(username) = ?
        LIMIT 1
      `).get(normalized) || null;
    },

    listAdminUsers(workspaceId = 'all') {
      const ws = String(workspaceId || 'all');
      const params = ws === 'all' ? [] : [ws];
      return sqliteDb.prepare(`
        SELECT id, name, email, username, role, status, workspace_id AS workspaceId
        FROM users
        ${ws === 'all' ? '' : 'WHERE workspace_id = ?'}
        ORDER BY name
        LIMIT 2000
      `).all(...params);
    },

    getUserById(userId) {
      return sqliteDb.prepare(`
        SELECT id, name, email, username, role, status, workspace_id AS workspaceId
        FROM users
        WHERE id = ?
      `).get(userId) || null;
    },

    findUserByEmailGlobal(email) {
      const normalized = String(email || '').trim().toLowerCase();
      if (!normalized) return null;
      return sqliteDb.prepare(`
        SELECT id, name, email, username, role, status, workspace_id AS workspaceId
        FROM users
        WHERE lower(email) = ?
        LIMIT 1
      `).get(normalized) || null;
    },

    findPasswordResetUserByEmail(email) {
      const normalized = String(email || '').trim().toLowerCase();
      if (!normalized) return null;
      return sqliteDb.prepare(`
        SELECT id, workspace_id AS workspaceId, email, role, first_name, last_name, name
        FROM users
        WHERE lower(email) = ?
        LIMIT 1
      `).get(normalized) || null;
    },

    getPasswordResetUserById(userId) {
      return sqliteDb.prepare(`
        SELECT id, workspace_id AS workspaceId, email, first_name, last_name, name
        FROM users
        WHERE id = ?
        LIMIT 1
      `).get(userId) || null;
    },

    findWorkspaceUserByEmail(workspaceId, email) {
      return sqliteDb.prepare(`
        SELECT id FROM users WHERE workspace_id = ? AND lower(email) = lower(?) LIMIT 1
      `).get(workspaceId, email) || null;
    },

    findWorkspaceUserByPhone({ workspaceId, phone, phoneNumber, phoneCountry, alternatePhoneNumber }) {
      return sqliteDb.prepare(`
        SELECT id
        FROM users
        WHERE workspace_id = ?
          AND (
            phone = ?
             OR phone_number = ?
             OR (phone_country = ? AND phone_number IN (?, ?))
          )
        LIMIT 1
      `).get(workspaceId, phone, phoneNumber, phoneCountry || '', phoneNumber, alternatePhoneNumber) || null;
    },

    findWorkspaceUserByDateOfBirth({ workspaceId, dateOfBirth }) {
      return sqliteDb.prepare(`
        SELECT id
        FROM users
        WHERE workspace_id = ?
          AND date_of_birth = ?
        LIMIT 1
      `).get(workspaceId, dateOfBirth) || null;
    },

    findWorkspaceUserByNameDob({ workspaceId, firstName, lastName, dateOfBirth }) {
      return sqliteDb.prepare(`
        SELECT id
        FROM users
        WHERE workspace_id = ?
          AND lower(first_name) = lower(?)
          AND lower(last_name) = lower(?)
          AND date_of_birth = ?
        LIMIT 1
      `).get(workspaceId, firstName, lastName, dateOfBirth) || null;
    },

    findWorkspaceUserDuplicateForInvite({ workspaceId, email, phone = '', phoneNumber = '', phoneCountry = '', alternatePhoneNumber = '', firstName = '', lastName = '', dateOfBirth = '' }) {
      if (email && this.findWorkspaceUserByEmail(workspaceId, email)) {
        return { field: 'email' };
      }
      if (phone || phoneNumber) {
        const phoneRow = this.findWorkspaceUserByPhone({
          workspaceId,
          phone,
          phoneNumber,
          phoneCountry,
          alternatePhoneNumber
        });
        if (phoneRow) return { field: 'phone' };
      }
      if (dateOfBirth) {
        const dobRow = this.findWorkspaceUserByDateOfBirth({ workspaceId, dateOfBirth });
        if (dobRow) return { field: 'dateOfBirth' };
      }
      if (firstName && lastName && dateOfBirth) {
        const nameRow = this.findWorkspaceUserByNameDob({ workspaceId, firstName, lastName, dateOfBirth });
        if (nameRow) return { field: 'nameDob' };
      }
      return null;
    },

    getUserAuthProfile(userId) {
      return sqliteDb.prepare(`
        SELECT id,
               email,
               name,
               role,
               workspace_id AS workspaceId,
               avatar_url AS avatarUrl
        FROM users
        WHERE id = ?
        LIMIT 1
      `).get(userId) || null;
    },

    generateUsername,

    completeInviteRegistration({ user, classId = null, autoJoinToolChannelNames = [], usedAt, token }) {
      const tx = sqliteDb.transaction(() => {
        const entries = Object.entries(user).filter(([, value]) => value !== undefined);
        const names = entries.map(([key]) => key);
        const placeholders = names.map(() => '?').join(',');
        const values = entries.map(([, value]) => value);
        sqliteDb.prepare(`INSERT INTO users (${names.join(',')}) VALUES (${placeholders})`).run(...values);
        sqliteDb.prepare(`
          INSERT OR IGNORE INTO workspace_members (workspace_id, user_id, role)
          VALUES (?, ?, ?)
        `).run(user.workspace_id, user.id, user.role);

        const insertMember = sqliteDb.prepare('INSERT OR IGNORE INTO channel_members (channel_id, user_id) VALUES (?, ?)');
        const clubRows = sqliteDb.prepare(`
          SELECT id FROM channels WHERE workspace_id = ? AND lower(category) = 'clubs'
        `).all(user.workspace_id);
        clubRows.forEach((row) => insertMember.run(row.id, user.id));

        if (autoJoinToolChannelNames.length) {
          const placeholdersTools = autoJoinToolChannelNames.map(() => '?').join(', ');
          const toolRows = sqliteDb.prepare(`
            SELECT id
            FROM channels
            WHERE workspace_id = ?
              AND lower(category) = 'tools'
              AND lower(name) IN (${placeholdersTools})
          `).all(user.workspace_id, ...autoJoinToolChannelNames);
          toolRows.forEach((row) => insertMember.run(row.id, user.id));
        }
        if (classId) insertMember.run(classId, user.id);

        sqliteDb.prepare('UPDATE registration_links SET used = 1, used_at = ? WHERE token = ?').run(usedAt, token);
        return { userId: user.id, workspaceId: user.workspace_id };
      });
      return tx();
    },

    updatePasswordAfterReset({ userId, passwordHash, changedAt, historyId, historyCreatedAt, tokenHash, legacyToken = null }) {
      sqliteDb.transaction(() => {
        sqliteDb.prepare(`
          UPDATE users
          SET password_hash = ?,
              must_change_password = 0,
              temp_login_started_at = NULL,
              password_changed_at = ?
          WHERE id = ?
        `).run(passwordHash, changedAt, userId);
        sqliteDb.prepare(`
          INSERT INTO password_history (id, user_id, password_hash, created_at)
          VALUES (?, ?, ?, ?)
        `).run(historyId, userId, passwordHash, historyCreatedAt);
        const params = [changedAt, tokenHash];
        let whereClause = 'token = ?';
        if (legacyToken && legacyToken !== tokenHash) {
          whereClause = '(token = ? OR token = ?)';
          params.push(legacyToken);
        }
        sqliteDb.prepare(`UPDATE password_resets SET used = 1, used_at = ? WHERE ${whereClause}`).run(...params);
      })();
      return { ok: true };
    },

    getUserNativeLanguage(userId) {
      const row = sqliteDb.prepare(`
        SELECT native_language AS lang
        FROM users
        WHERE id = ?
        LIMIT 1
      `).get(userId);
      return String(row?.lang || 'en');
    },

    updateUserCultureLanguages(userId, { cultureReadLang = null, cultureWriteLang = null } = {}) {
      sqliteDb.prepare(`
        UPDATE users
        SET culture_read_lang = COALESCE(?, culture_read_lang),
            culture_write_lang = COALESCE(?, culture_write_lang)
        WHERE id = ?
      `).run(cultureReadLang, cultureWriteLang, userId);
      return { ok: true };
    },

    getWorkspaceScopedUser(workspaceId, userId) {
      return sqliteDb.prepare(`
        SELECT id, name, email, username, role, status, course_level AS courseLevel, workspace_id AS workspaceId
        FROM users
        WHERE workspace_id = ? AND id = ?
        LIMIT 1
      `).get(workspaceId, userId) || null;
    },

    updateUserRoleStatus(userId, role, status) {
      const existing = sqliteDb.prepare(`
        SELECT id, workspace_id AS workspaceId, role, status
        FROM users
        WHERE id = ?
      `).get(userId);
      if (!existing) return null;
      sqliteDb.prepare('UPDATE users SET role = ?, status = ? WHERE id = ?').run(role, status, userId);
      return { ...existing, role, status };
    },

    countUsers() {
      return Number(sqliteDb.prepare('SELECT COUNT(*) AS c FROM users').get()?.c || 0);
    },

    getAssignedStudentRowsForTeacher(workspaceId, teacherUserId) {
      return sqliteDb.prepare(`
        SELECT DISTINCT
          u.id,
          u.name,
          u.email,
          u.username,
          u.role,
          u.status,
          u.course_level AS courseLevel
        FROM channel_members teacher_cm
        JOIN channels c ON c.id = teacher_cm.channel_id
        JOIN channel_members student_cm ON student_cm.channel_id = c.id
        JOIN users u ON u.id = student_cm.user_id
        WHERE teacher_cm.user_id = ?
          AND c.workspace_id = ?
          AND u.workspace_id = ?
          AND lower(COALESCE(c.category, '')) IN ('class', 'classes')
          AND lower(COALESCE(u.role, '')) = 'student'
        ORDER BY lower(COALESCE(u.name, u.username, u.email, u.id)) ASC
      `).all(teacherUserId, workspaceId, workspaceId);
    },

    deleteUserMembershipRecords(userId) {
      const existing = sqliteDb.prepare('SELECT id, workspace_id AS workspaceId FROM users WHERE id = ?').get(userId);
      if (!existing) return null;
      sqliteDb.transaction(() => {
        sqliteDb.prepare('DELETE FROM channel_members WHERE user_id = ?').run(userId);
        sqliteDb.prepare('DELETE FROM workspace_members WHERE user_id = ?').run(userId);
        sqliteDb.prepare('DELETE FROM dm_members WHERE user_id = ?').run(userId);
        sqliteDb.prepare('DELETE FROM users WHERE id = ?').run(userId);
      })();
      return existing.workspaceId || null;
    }
  };
}

function createPostgresUserRepository() {
  const postgres = require('../../db/postgres');
  async function generateUsername(workspaceId, firstName, lastName) {
    const ws = workspaceId || 'default';
    const ln = String(lastName || '').trim();
    const fn = String(firstName || '').trim();
    let base = ln.toLowerCase().replace(/[^a-z0-9]+/g, '');
    if (!base) base = 'user';
    async function exists(candidate) {
      return !!(await postgres.one('SELECT 1 FROM users WHERE workspace_id = ? AND username = ?', [ws, candidate]));
    }
    let candidate = `@${base}`;
    if (!(await exists(candidate))) return candidate;
    if (fn) {
      candidate = `@${fn[0].toLowerCase()}${base}`;
      if (!(await exists(candidate))) return candidate;
    }
    let i = 1;
    while (true) {
      candidate = `@${base}${i}`;
      if (!(await exists(candidate))) return candidate;
      i += 1;
    }
  }
  return {
    engine: 'postgres',

    async findAuthUserByIdentifier(identifier) {
      const normalized = String(identifier || '').trim().toLowerCase();
      if (!normalized) return null;
      if (normalized.includes('@')) {
        return postgres.one(`
          SELECT id,
                 workspace_id AS "workspaceId",
                 first_name,
                 last_name,
                 name,
                 username,
                 avatar_url AS "avatarUrl",
                 password_hash,
                 role,
                 status,
                 course_start AS "courseStart",
                 course_end AS "courseEnd",
                 email,
                 native_language AS "nativeLanguage",
                 native_language_confirmed AS "nativeLanguageConfirmed",
                 must_change_password,
                 temp_login_started_at
          FROM users
          WHERE lower(email::text) = ?
          LIMIT 1
        `, [normalized]);
      }
      return postgres.one(`
        SELECT id,
               workspace_id AS "workspaceId",
               first_name,
               last_name,
               name,
               username,
               avatar_url AS "avatarUrl",
               password_hash,
               role,
               status,
               course_start AS "courseStart",
               course_end AS "courseEnd",
               email,
               native_language AS "nativeLanguage",
               native_language_confirmed AS "nativeLanguageConfirmed",
               must_change_password,
               temp_login_started_at
        FROM users
        WHERE lower(username) = ?
        LIMIT 1
      `, [normalized]);
    },

    async listAdminUsers(workspaceId = 'all') {
      const ws = String(workspaceId || 'all');
      const params = ws === 'all' ? [] : [ws];
      return postgres.many(`
        SELECT id, name, email, username, role, status, workspace_id AS "workspaceId"
        FROM users
        ${ws === 'all' ? '' : 'WHERE workspace_id = ?'}
        ORDER BY name
        LIMIT 2000
      `, params);
    },

    async getUserById(userId) {
      return postgres.one(`
        SELECT id, name, email, username, role, status, workspace_id AS "workspaceId"
        FROM users
        WHERE id = ?
      `, [userId]);
    },

    async findUserByEmailGlobal(email) {
      const normalized = String(email || '').trim().toLowerCase();
      if (!normalized) return null;
      return postgres.one(`
        SELECT id, name, email, username, role, status, workspace_id AS "workspaceId"
        FROM users
        WHERE lower(email::text) = ?
        LIMIT 1
      `, [normalized]);
    },

    async findPasswordResetUserByEmail(email) {
      const normalized = String(email || '').trim().toLowerCase();
      if (!normalized) return null;
      return postgres.one(`
        SELECT id, workspace_id AS "workspaceId", email, role, first_name, last_name, name
        FROM users
        WHERE lower(email::text) = ?
        LIMIT 1
      `, [normalized]);
    },

    async getPasswordResetUserById(userId) {
      return postgres.one(`
        SELECT id, workspace_id AS "workspaceId", email, first_name, last_name, name
        FROM users
        WHERE id = ?
        LIMIT 1
      `, [userId]);
    },

    async findWorkspaceUserByEmail(workspaceId, email) {
      return postgres.one('SELECT id FROM users WHERE workspace_id = ? AND lower(email::text) = lower(?) LIMIT 1', [workspaceId, email]);
    },

    async findWorkspaceUserByPhone({ workspaceId, phone, phoneNumber, phoneCountry, alternatePhoneNumber }) {
      return postgres.one(`
        SELECT id
        FROM users
        WHERE workspace_id = ?
          AND (
            phone = ?
             OR phone_number = ?
             OR (phone_country = ? AND phone_number IN (?, ?))
          )
        LIMIT 1
      `, [workspaceId, phone, phoneNumber, phoneCountry || '', phoneNumber, alternatePhoneNumber]);
    },

    async findWorkspaceUserByDateOfBirth({ workspaceId, dateOfBirth }) {
      return postgres.one(`
        SELECT id
        FROM users
        WHERE workspace_id = ?
          AND date_of_birth = ?
        LIMIT 1
      `, [workspaceId, dateOfBirth]);
    },

    async findWorkspaceUserByNameDob({ workspaceId, firstName, lastName, dateOfBirth }) {
      return postgres.one(`
        SELECT id
        FROM users
        WHERE workspace_id = ?
          AND lower(first_name) = lower(?)
          AND lower(last_name) = lower(?)
          AND date_of_birth = ?
        LIMIT 1
      `, [workspaceId, firstName, lastName, dateOfBirth]);
    },

    async findWorkspaceUserDuplicateForInvite({ workspaceId, email, phone = '', phoneNumber = '', phoneCountry = '', alternatePhoneNumber = '', firstName = '', lastName = '', dateOfBirth = '' }) {
      if (email && await this.findWorkspaceUserByEmail(workspaceId, email)) return { field: 'email' };
      if (phone || phoneNumber) {
        const phoneRow = await this.findWorkspaceUserByPhone({
          workspaceId,
          phone,
          phoneNumber,
          phoneCountry,
          alternatePhoneNumber
        });
        if (phoneRow) return { field: 'phone' };
      }
      if (dateOfBirth) {
        const dobRow = await this.findWorkspaceUserByDateOfBirth({ workspaceId, dateOfBirth });
        if (dobRow) return { field: 'dateOfBirth' };
      }
      if (firstName && lastName && dateOfBirth) {
        const nameRow = await this.findWorkspaceUserByNameDob({ workspaceId, firstName, lastName, dateOfBirth });
        if (nameRow) return { field: 'nameDob' };
      }
      return null;
    },

    async getUserAuthProfile(userId) {
      return postgres.one(`
        SELECT id,
               email,
               name,
               role,
               workspace_id AS "workspaceId",
               avatar_url AS "avatarUrl"
        FROM users
        WHERE id = ?
        LIMIT 1
      `, [userId]);
    },

    generateUsername,

    async completeInviteRegistration({ user, classId = null, autoJoinToolChannelNames = [], usedAt, token }) {
      return postgres.transaction(async (tx) => {
        await tx.exec(`
          INSERT INTO users (
            id, workspace_id, first_name, last_name, name, username, email, password_hash, role, status,
            course_start, course_end, course_level, salutation, gender, date_of_birth, phone, phone_verified,
            phone_country, phone_number, native_language, learning_goal, available_days,
            emergency_contact_name, emergency_contact_phone, emergency_contact_relation
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          user.id,
          user.workspace_id,
          user.first_name,
          user.last_name,
          user.name,
          user.username,
          user.email,
          user.password_hash,
          user.role,
          user.status,
          user.course_start || null,
          user.course_end || null,
          user.course_level || null,
          user.salutation || '',
          user.gender || '',
          user.date_of_birth || null,
          user.phone || '',
          !!user.phone_verified,
          user.phone_country || '',
          user.phone_number || '',
          user.native_language || '',
          user.learning_goal || '',
          user.available_days || '',
          user.emergency_contact_name || '',
          user.emergency_contact_phone || '',
          user.emergency_contact_relation || ''
        ]);
        await tx.exec(`
          INSERT INTO workspace_members (workspace_id, user_id, role)
          VALUES (?, ?, ?)
          ON CONFLICT DO NOTHING
        `, [user.workspace_id, user.id, user.role]);

        const clubRows = await tx.many("SELECT id FROM channels WHERE workspace_id = ? AND lower(category) = 'clubs'", [user.workspace_id]);
        for (const row of clubRows) {
          await tx.exec('INSERT INTO channel_members (channel_id, user_id) VALUES (?, ?) ON CONFLICT DO NOTHING', [row.id, user.id]);
        }
        if (autoJoinToolChannelNames.length) {
          const toolRows = await tx.many(`
            SELECT id
            FROM channels
            WHERE workspace_id = ?
              AND lower(category) = 'tools'
              AND lower(name) = ANY(?::text[])
          `, [user.workspace_id, autoJoinToolChannelNames]);
          for (const row of toolRows) {
            await tx.exec('INSERT INTO channel_members (channel_id, user_id) VALUES (?, ?) ON CONFLICT DO NOTHING', [row.id, user.id]);
          }
        }
        if (classId) {
          await tx.exec('INSERT INTO channel_members (channel_id, user_id) VALUES (?, ?) ON CONFLICT DO NOTHING', [classId, user.id]);
        }
        await tx.exec('UPDATE registration_links SET used = true, used_at = ? WHERE token = ?', [usedAt, token]);
        return { userId: user.id, workspaceId: user.workspace_id };
      });
    },

    async updatePasswordAfterReset({ userId, passwordHash, changedAt, historyId, historyCreatedAt, tokenHash, legacyToken = null }) {
      await postgres.transaction(async (tx) => {
        await tx.exec(`
          UPDATE users
          SET password_hash = ?,
              must_change_password = false,
              temp_login_started_at = NULL,
              password_changed_at = ?
          WHERE id = ?
        `, [passwordHash, changedAt, userId]);
        await tx.exec(`
          INSERT INTO password_history (id, user_id, password_hash, created_at)
          VALUES (?, ?, ?, ?)
        `, [historyId, userId, passwordHash, historyCreatedAt]);
        const params = [changedAt, tokenHash];
        let whereClause = 'token = ?';
        if (legacyToken && legacyToken !== tokenHash) {
          whereClause = '(token = ? OR token = ?)';
          params.push(legacyToken);
        }
        await tx.exec(`UPDATE password_resets SET used = true, used_at = ? WHERE ${whereClause}`, params);
      });
      return { ok: true };
    },

    async getUserNativeLanguage(userId) {
      const row = await postgres.one(`
        SELECT native_language AS lang
        FROM users
        WHERE id = ?
        LIMIT 1
      `, [userId]);
      return String(row?.lang || 'en');
    },

    async updateUserCultureLanguages(userId, { cultureReadLang = null, cultureWriteLang = null } = {}) {
      await postgres.exec(`
        UPDATE users
        SET culture_read_lang = COALESCE(?, culture_read_lang),
            culture_write_lang = COALESCE(?, culture_write_lang)
        WHERE id = ?
      `, [cultureReadLang, cultureWriteLang, userId]);
      return { ok: true };
    },

    async getWorkspaceScopedUser(workspaceId, userId) {
      return postgres.one(`
        SELECT id, name, email, username, role, status, course_level AS "courseLevel", workspace_id AS "workspaceId"
        FROM users
        WHERE workspace_id = ? AND id = ?
        LIMIT 1
      `, [workspaceId, userId]);
    },

    async updateUserRoleStatus(userId, role, status) {
      const existing = await postgres.one(`
        SELECT id, workspace_id AS "workspaceId", role, status
        FROM users
        WHERE id = ?
      `, [userId]);
      if (!existing) return null;
      await postgres.exec('UPDATE users SET role = ?, status = ? WHERE id = ?', [role, status, userId]);
      return { ...existing, role, status };
    },

    async countUsers() {
      const row = await postgres.one('SELECT COUNT(*)::int AS c FROM users');
      return Number(row?.c || 0);
    },

    async getAssignedStudentRowsForTeacher(workspaceId, teacherUserId) {
      return postgres.many(`
        SELECT DISTINCT
          u.id,
          u.name,
          u.email,
          u.username,
          u.role,
          u.status,
          u.course_level AS "courseLevel"
        FROM channel_members teacher_cm
        JOIN channels c ON c.id = teacher_cm.channel_id
        JOIN channel_members student_cm ON student_cm.channel_id = c.id
        JOIN users u ON u.id = student_cm.user_id
        WHERE teacher_cm.user_id = ?
          AND c.workspace_id = ?
          AND u.workspace_id = ?
          AND lower(COALESCE(c.category, '')) IN ('class', 'classes')
          AND lower(COALESCE(u.role, '')) = 'student'
        ORDER BY lower(COALESCE(u.name, u.username, u.email, u.id)) ASC
      `, [teacherUserId, workspaceId, workspaceId]);
    },

    async deleteUserMembershipRecords(userId) {
      const existing = await postgres.one('SELECT id, workspace_id AS "workspaceId" FROM users WHERE id = ?', [userId]);
      if (!existing) return null;
      await postgres.transaction(async (tx) => {
        await tx.exec('DELETE FROM channel_members WHERE user_id = ?', [userId]);
        await tx.exec('DELETE FROM workspace_members WHERE user_id = ?', [userId]);
        await tx.exec('DELETE FROM dm_members WHERE user_id = ?', [userId]);
        await tx.exec('DELETE FROM users WHERE id = ?', [userId]);
      });
      return existing.workspaceId || null;
    }
  };
}

module.exports = {
  createUserRepository
};
