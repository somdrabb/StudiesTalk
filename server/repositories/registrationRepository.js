'use strict';

const { normalizeEngine } = require('../../db/helpers');

function createRegistrationRepository({ engine = 'sqlite', sqliteDb } = {}) {
  const normalizedEngine = normalizeEngine(engine);
  if (normalizedEngine === 'postgres') return createPostgresRegistrationRepository();
  if (!sqliteDb) throw new Error('sqliteDb is required for the SQLite registration repository');
  return createSqliteRegistrationRepository(sqliteDb);
}

function createSqliteRegistrationRepository(sqliteDb) {
  return {
    engine: 'sqlite',

    getSession(sessionId) {
      return sqliteDb.prepare('SELECT * FROM registration_sessions WHERE session_id = ?').get(sessionId) || null;
    },

    ensureSession({ sessionId, now }) {
      let row = this.getSession(sessionId);
      if (!row) {
        sqliteDb.prepare(`
          INSERT INTO registration_sessions(session_id, step, created_at, last_updated)
          VALUES (?, ?, ?, ?)
        `).run(sessionId, 'info', now, now);
        row = this.getSession(sessionId);
      }
      return row;
    },

    updateSession(sessionId, updates = {}) {
      const entries = Object.entries(updates).filter(([, value]) => value !== undefined);
      if (!entries.length) return { ok: true };
      const fields = entries.map(([key]) => `${key} = ?`);
      const values = entries.map(([, value]) => value);
      values.push(sessionId);
      sqliteDb.prepare(`UPDATE registration_sessions SET ${fields.join(', ')} WHERE session_id = ?`).run(...values);
      return { ok: true };
    },

    upsertOtp({ email, code, expiresAt }) {
      sqliteDb.prepare(`
        INSERT INTO register_otps(email, code, expires_at)
        VALUES (?, ?, ?)
        ON CONFLICT(email) DO UPDATE SET code = excluded.code, expires_at = excluded.expires_at
      `).run(email, code, expiresAt);
      return { ok: true };
    },

    getOtp(email) {
      return sqliteDb.prepare('SELECT code, expires_at FROM register_otps WHERE email = ? LIMIT 1').get(email) || null;
    },

    deleteOtp(email) {
      sqliteDb.prepare('DELETE FROM register_otps WHERE email = ?').run(email);
      return { ok: true };
    },

    createInvite(payload) {
      sqliteDb.prepare(`
        INSERT INTO registration_links (
          token, workspace_id, channel_id, role, email, course_level, course_start, course_end,
          first_name, last_name, salutation, date_of_birth, phone_country, phone_number,
          native_language, learning_goal, available_days, emergency_contact_name,
          emergency_contact_phone, emergency_contact_relation, created_by_user_id,
          created_at, expires_at, used, used_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        payload.token,
        payload.workspace_id,
        payload.channel_id || null,
        payload.role,
        payload.email,
        payload.course_level || null,
        payload.course_start || null,
        payload.course_end || null,
        payload.first_name || null,
        payload.last_name || null,
        payload.salutation || '',
        payload.date_of_birth || null,
        payload.phone_country || '',
        payload.phone_number || '',
        payload.native_language || '',
        payload.learning_goal || '',
        payload.available_days || '',
        payload.emergency_contact_name || '',
        payload.emergency_contact_phone || '',
        payload.emergency_contact_relation || '',
        payload.created_by_user_id || null,
        payload.created_at,
        payload.expires_at,
        payload.used ? 1 : 0,
        payload.used_at || null
      );
      return { ok: true };
    },

    getInvite(token) {
      return sqliteDb.prepare('SELECT * FROM registration_links WHERE token = ?').get(token) || null;
    },

    getInviteForComplete(token) {
      return sqliteDb.prepare(`
        SELECT token, workspace_id AS workspaceId, channel_id AS classId, role, email,
               course_level AS courseLevel, course_start AS linkCourseStart, course_end AS linkCourseEnd,
               expires_at AS expiresAt, used,
               first_name AS linkFirstName, last_name AS linkLastName,
               salutation AS linkSalutation, date_of_birth AS linkDateOfBirth,
               phone_country AS linkPhoneCountry, phone_number AS linkPhoneNumber,
               native_language AS linkNativeLanguage, learning_goal AS linkLearningGoal,
               available_days AS linkAvailableDays, emergency_contact_name AS linkEmergencyName,
               emergency_contact_phone AS linkEmergencyPhone, emergency_contact_relation AS linkEmergencyRelation
        FROM registration_links WHERE token = ?
      `).get(token) || null;
    },

    getInviteInfo(token) {
      return sqliteDb.prepare(`
        SELECT rl.workspace_id AS workspaceId,
               rl.role AS role,
               rl.expires_at AS expiresAt,
               w.name AS workspaceName
        FROM registration_links rl
        LEFT JOIN workspaces w ON w.id = rl.workspace_id
        WHERE rl.token = ?
      `).get(token) || null;
    },

    markInviteUsed({ token, usedAt }) {
      sqliteDb.prepare('UPDATE registration_links SET used = 1, used_at = ? WHERE token = ?').run(usedAt, token);
      return { ok: true };
    }
  };
}

function createPostgresRegistrationRepository() {
  const postgres = require('../../db/postgres');
  return {
    engine: 'postgres',

    async getSession(sessionId) {
      return postgres.one('SELECT * FROM registration_sessions WHERE session_id = ?', [sessionId]);
    },

    async ensureSession({ sessionId, now }) {
      await postgres.exec(`
        INSERT INTO registration_sessions(session_id, step, created_at, last_updated)
        VALUES (?, ?, ?, ?)
        ON CONFLICT (session_id) DO NOTHING
      `, [sessionId, 'info', now, now]);
      return this.getSession(sessionId);
    },

    async updateSession(sessionId, updates = {}) {
      const entries = Object.entries(updates).filter(([, value]) => value !== undefined);
      if (!entries.length) return { ok: true };
      const fields = entries.map(([key]) => `${key} = ?`);
      const values = entries.map(([key, value]) => {
        if (key === 'email_verified' || key === 'mobile_verified') return !!value;
        return value;
      });
      values.push(sessionId);
      await postgres.exec(`UPDATE registration_sessions SET ${fields.join(', ')} WHERE session_id = ?`, values);
      return { ok: true };
    },

    async upsertOtp({ email, code, expiresAt, createdAt }) {
      await postgres.exec(`
        INSERT INTO register_otps(email, code, expires_at, created_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(email) DO UPDATE SET code = EXCLUDED.code, expires_at = EXCLUDED.expires_at
      `, [email, code, expiresAt, createdAt || Date.now()]);
      return { ok: true };
    },

    async getOtp(email) {
      return postgres.one('SELECT code, expires_at FROM register_otps WHERE email = ? LIMIT 1', [email]);
    },

    async deleteOtp(email) {
      await postgres.exec('DELETE FROM register_otps WHERE email = ?', [email]);
      return { ok: true };
    },

    async createInvite(payload) {
      await postgres.exec(`
        INSERT INTO registration_links (
          token, workspace_id, channel_id, role, email, course_level, course_start, course_end,
          first_name, last_name, salutation, date_of_birth, phone_country, phone_number,
          native_language, learning_goal, available_days, emergency_contact_name,
          emergency_contact_phone, emergency_contact_relation, created_by_user_id,
          created_at, expires_at, used, used_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        payload.token,
        payload.workspace_id,
        payload.channel_id || null,
        payload.role,
        payload.email,
        payload.course_level || null,
        payload.course_start || null,
        payload.course_end || null,
        payload.first_name || null,
        payload.last_name || null,
        payload.salutation || '',
        payload.date_of_birth || null,
        payload.phone_country || '',
        payload.phone_number || '',
        payload.native_language || '',
        payload.learning_goal || '',
        payload.available_days || '',
        payload.emergency_contact_name || '',
        payload.emergency_contact_phone || '',
        payload.emergency_contact_relation || '',
        payload.created_by_user_id || null,
        payload.created_at,
        payload.expires_at,
        !!payload.used,
        payload.used_at || null
      ]);
      return { ok: true };
    },

    async getInvite(token) {
      return postgres.one('SELECT * FROM registration_links WHERE token = ?', [token]);
    },

    async getInviteForComplete(token) {
      return postgres.one(`
        SELECT token, workspace_id AS "workspaceId", channel_id AS "classId", role, email,
               course_level AS "courseLevel", course_start AS "linkCourseStart", course_end AS "linkCourseEnd",
               expires_at AS "expiresAt", used,
               first_name AS "linkFirstName", last_name AS "linkLastName",
               salutation AS "linkSalutation", date_of_birth AS "linkDateOfBirth",
               phone_country AS "linkPhoneCountry", phone_number AS "linkPhoneNumber",
               native_language AS "linkNativeLanguage", learning_goal AS "linkLearningGoal",
               available_days AS "linkAvailableDays", emergency_contact_name AS "linkEmergencyName",
               emergency_contact_phone AS "linkEmergencyPhone", emergency_contact_relation AS "linkEmergencyRelation"
        FROM registration_links WHERE token = ?
      `, [token]);
    },

    async getInviteInfo(token) {
      return postgres.one(`
        SELECT rl.workspace_id AS "workspaceId",
               rl.role AS role,
               rl.expires_at AS "expiresAt",
               w.name AS "workspaceName"
        FROM registration_links rl
        LEFT JOIN workspaces w ON w.id = rl.workspace_id
        WHERE rl.token = ?
      `, [token]);
    },

    async markInviteUsed({ token, usedAt }) {
      await postgres.exec('UPDATE registration_links SET used = true, used_at = ? WHERE token = ?', [usedAt, token]);
      return { ok: true };
    }
  };
}

module.exports = {
  createRegistrationRepository
};
