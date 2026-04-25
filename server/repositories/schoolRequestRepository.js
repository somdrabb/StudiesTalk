'use strict';

const { normalizeEngine } = require('../../db/helpers');

function buildReviewWhere({ status = 'pending', query = '', cursor = null, sort = 'new' } = {}) {
  const whereParts = [];
  const params = [];

  const normalizedStatus = String(status || 'pending').toLowerCase();
  if (normalizedStatus !== 'all') {
    whereParts.push('status = ?');
    params.push(normalizedStatus);
  }

  const normalizedQuery = String(query || '').trim().toLowerCase();
  if (normalizedQuery) {
    whereParts.push('(LOWER(email) LIKE ? OR LOWER(payload) LIKE ?)');
    params.push(`%${normalizedQuery}%`, `%${normalizedQuery}%`);
  }

  if (cursor && Number.isFinite(cursor.createdAt) && Number.isFinite(cursor.id)) {
    const compare = String(sort || 'new').toLowerCase() === 'old' ? '>' : '<';
    whereParts.push(`(created_at ${compare} ? OR (created_at = ? AND id ${compare} ?))`);
    params.push(cursor.createdAt, cursor.createdAt, cursor.id);
  }

  return {
    whereClause: whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '',
    params
  };
}

function createSchoolRequestRepository({ engine = 'sqlite', sqliteDb } = {}) {
  const normalizedEngine = normalizeEngine(engine);
  if (normalizedEngine === 'postgres') return createPostgresSchoolRequestRepository();
  if (!sqliteDb) throw new Error('sqliteDb is required for the SQLite school request repository');
  return createSqliteSchoolRequestRepository(sqliteDb);
}

function createSqliteSchoolRequestRepository(sqliteDb) {
  return {
    engine: 'sqlite',

    createRegistrationReviewRequest({ id, email, payload, status = 'pending', createdAt }) {
      const result = sqliteDb.prepare(`
        INSERT INTO registration_review_requests (email, payload, status, created_at)
        VALUES (?, ?, ?, ?)
      `).run(email, payload, status, createdAt);
      return { id: result.lastInsertRowid != null ? String(result.lastInsertRowid) : String(id || '') };
    },

    findLatestRegistrationReviewRequestByEmail(email) {
      return sqliteDb.prepare(`
        SELECT id, status, created_at AS createdAt
        FROM registration_review_requests
        WHERE lower(email) = lower(?)
        ORDER BY created_at DESC
        LIMIT 1
      `).get(email) || null;
    },

    findPendingRegistrationReviewRequestByPhone(phone) {
      return sqliteDb.prepare(`
        SELECT id, status
        FROM registration_review_requests
        WHERE payload LIKE ?
        ORDER BY created_at DESC
        LIMIT 1
      `).get(`%${phone}%`) || null;
    },

    createPublicSchoolRequest({ id, schoolName, adminEmail, passwordHash, status = 'PENDING' }) {
      sqliteDb.prepare(`
        INSERT INTO school_requests (id, school_name, admin_email, password_hash, status)
        VALUES (?, ?, ?, ?, ?)
      `).run(id, schoolName, adminEmail, passwordHash, status);
      return { id };
    },

    publicSchoolRequestExistsByAdminEmail(adminEmail) {
      return !!sqliteDb.prepare('SELECT 1 FROM school_requests WHERE admin_email = ?').get(adminEmail);
    },

    listAdminSchoolRequests({ status = 'pending', query = '', sort = 'new', limit = 500 }) {
      const normalizedSort = String(sort || 'new').toLowerCase();
      const { whereClause, params } = buildReviewWhere({ status, query, sort });
      const orderClause = normalizedSort === 'old' ? 'created_at ASC' : 'created_at DESC';
      return sqliteDb.prepare(`
        SELECT
          id,
          email,
          status,
          payload,
          created_at AS createdAt,
          reviewed_by AS reviewedBy,
          reviewed_at AS reviewedAt,
          review_note AS reviewNote
        FROM registration_review_requests
        ${whereClause}
        ORDER BY ${orderClause}
        LIMIT ?
      `).all(...params, limit);
    },

    countRegistrationReviewRequests() {
      return sqliteDb.prepare(`
        SELECT status, COUNT(*) AS c
        FROM registration_review_requests
        GROUP BY status
      `).all();
    },

    listRegistrationReviewRequestsPage({ status = 'pending', search = '', sort = 'new', limit = 25, cursor = null }) {
      const normalizedSort = String(sort || 'new').toLowerCase();
      const { whereClause, params } = buildReviewWhere({ status, query: search, sort, cursor });
      const orderClause = normalizedSort === 'old' ? 'created_at ASC, id ASC' : 'created_at DESC, id DESC';
      return sqliteDb.prepare(`
        SELECT id, email, status, payload, created_at AS createdAt, reviewed_by AS reviewedBy,
               reviewed_at AS reviewedAt, review_note AS reviewNote
        FROM registration_review_requests
        ${whereClause}
        ORDER BY ${orderClause}
        LIMIT ?
      `).all(...params, limit + 1);
    },

    getRegistrationReviewRequestById(id) {
      return sqliteDb.prepare(`
        SELECT id, email, status, payload, created_at AS createdAt, reviewed_by AS reviewedBy,
               reviewed_at AS reviewedAt, review_note AS reviewNote
        FROM registration_review_requests
        WHERE id = ?
        LIMIT 1
      `).get(id) || null;
    },

    updateRegistrationReviewRequestStatus({ id, status, actorId, note = null, reviewedAt }) {
      sqliteDb.prepare(`
        UPDATE registration_review_requests
        SET status = ?, reviewed_by = ?, reviewed_at = ?, review_note = ?
        WHERE id = ?
      `).run(status, actorId, reviewedAt, note, id);
      return { ok: true };
    },

    listRegistrationReviewRequestsForExport({ status = 'pending', search = '', sort = 'new', limit = 1000 }) {
      const normalizedSort = String(sort || 'new').toLowerCase();
      const { whereClause, params } = buildReviewWhere({ status, query: search, sort });
      const orderClause = normalizedSort === 'old' ? 'created_at ASC, id ASC' : 'created_at DESC, id DESC';
      return sqliteDb.prepare(`
        SELECT id, email, status, payload, created_at AS createdAt, review_note AS reviewNote
        FROM registration_review_requests
        ${whereClause}
        ORDER BY ${orderClause}
        LIMIT ?
      `).all(...params, limit);
    },

    listRegistrationReviewRequestsByIds(ids) {
      if (!Array.isArray(ids) || !ids.length) return [];
      const placeholders = ids.map(() => '?').join(',');
      return sqliteDb.prepare(`
        SELECT id, email, status, payload, created_at AS createdAt, review_note AS reviewNote
        FROM registration_review_requests
        WHERE id IN (${placeholders})
        ORDER BY created_at DESC, id DESC
      `).all(...ids);
    },

    listApprovedRegistrationReviewRequests(limit = 300) {
      return sqliteDb.prepare(`
        SELECT id, email, payload, created_at AS createdAt, reviewed_at AS reviewedAt
        FROM registration_review_requests
        WHERE status = 'approved'
        ORDER BY reviewed_at DESC
        LIMIT ?
      `).all(limit);
    }
  };
}

function createPostgresSchoolRequestRepository() {
  const postgres = require('../../db/postgres');
  return {
    engine: 'postgres',

    async createRegistrationReviewRequest({ id, email, payload, status = 'pending', createdAt }) {
      const row = await postgres.one(`
        INSERT INTO registration_review_requests (id, email, payload, status, created_at)
        VALUES (?, ?, ?, ?, ?)
        RETURNING id
      `, [id, email, payload, status, createdAt]);
      return { id: String(row?.id || id || '') };
    },

    async findLatestRegistrationReviewRequestByEmail(email) {
      return postgres.one(`
        SELECT id, status, created_at AS "createdAt"
        FROM registration_review_requests
        WHERE lower(email) = lower(?)
        ORDER BY created_at DESC
        LIMIT 1
      `, [email]);
    },

    async findPendingRegistrationReviewRequestByPhone(phone) {
      return postgres.one(`
        SELECT id, status
        FROM registration_review_requests
        WHERE payload ILIKE ?
        ORDER BY created_at DESC
        LIMIT 1
      `, [`%${phone}%`]);
    },

    async createPublicSchoolRequest({ id, schoolName, adminEmail, passwordHash, status = 'PENDING' }) {
      await postgres.exec(`
        INSERT INTO school_requests (id, school_name, admin_email, password_hash, status)
        VALUES (?, ?, ?, ?, ?)
      `, [id, schoolName, adminEmail, passwordHash, status]);
      return { id };
    },

    async publicSchoolRequestExistsByAdminEmail(adminEmail) {
      return !!(await postgres.one('SELECT 1 FROM school_requests WHERE admin_email = ?', [adminEmail]));
    },

    async listAdminSchoolRequests({ status = 'pending', query = '', sort = 'new', limit = 500 }) {
      const normalizedSort = String(sort || 'new').toLowerCase();
      const { whereClause, params } = buildReviewWhere({ status, query, sort });
      const orderClause = normalizedSort === 'old' ? 'created_at ASC' : 'created_at DESC';
      return postgres.many(`
        SELECT
          id,
          email,
          status,
          payload,
          created_at AS "createdAt",
          reviewed_by AS "reviewedBy",
          reviewed_at AS "reviewedAt",
          review_note AS "reviewNote"
        FROM registration_review_requests
        ${whereClause}
        ORDER BY ${orderClause}
        LIMIT ?
      `, [...params, limit]);
    },

    async countRegistrationReviewRequests() {
      return postgres.many(`
        SELECT status, COUNT(*)::int AS c
        FROM registration_review_requests
        GROUP BY status
      `);
    },

    async listRegistrationReviewRequestsPage({ status = 'pending', search = '', sort = 'new', limit = 25, cursor = null }) {
      const normalizedSort = String(sort || 'new').toLowerCase();
      const { whereClause, params } = buildReviewWhere({ status, query: search, sort, cursor });
      const orderClause = normalizedSort === 'old' ? 'created_at ASC, id ASC' : 'created_at DESC, id DESC';
      return postgres.many(`
        SELECT id, email, status, payload, created_at AS "createdAt", reviewed_by AS "reviewedBy",
               reviewed_at AS "reviewedAt", review_note AS "reviewNote"
        FROM registration_review_requests
        ${whereClause}
        ORDER BY ${orderClause}
        LIMIT ?
      `, [...params, limit + 1]);
    },

    async getRegistrationReviewRequestById(id) {
      return postgres.one(`
        SELECT id, email, status, payload, created_at AS "createdAt", reviewed_by AS "reviewedBy",
               reviewed_at AS "reviewedAt", review_note AS "reviewNote"
        FROM registration_review_requests
        WHERE id = ?
        LIMIT 1
      `, [id]);
    },

    async updateRegistrationReviewRequestStatus({ id, status, actorId, note = null, reviewedAt }) {
      await postgres.exec(`
        UPDATE registration_review_requests
        SET status = ?, reviewed_by = ?, reviewed_at = ?, review_note = ?
        WHERE id = ?
      `, [status, actorId, reviewedAt, note, id]);
      return { ok: true };
    },

    async listRegistrationReviewRequestsForExport({ status = 'pending', search = '', sort = 'new', limit = 1000 }) {
      const normalizedSort = String(sort || 'new').toLowerCase();
      const { whereClause, params } = buildReviewWhere({ status, query: search, sort });
      const orderClause = normalizedSort === 'old' ? 'created_at ASC, id ASC' : 'created_at DESC, id DESC';
      return postgres.many(`
        SELECT id, email, status, payload, created_at AS "createdAt", review_note AS "reviewNote"
        FROM registration_review_requests
        ${whereClause}
        ORDER BY ${orderClause}
        LIMIT ?
      `, [...params, limit]);
    },

    async listRegistrationReviewRequestsByIds(ids) {
      if (!Array.isArray(ids) || !ids.length) return [];
      return postgres.many(`
        SELECT id, email, status, payload, created_at AS "createdAt", review_note AS "reviewNote"
        FROM registration_review_requests
        WHERE id = ANY(?::text[])
        ORDER BY created_at DESC, id DESC
      `, [ids]);
    },

    async listApprovedRegistrationReviewRequests(limit = 300) {
      return postgres.many(`
        SELECT id, email, payload, created_at AS "createdAt", reviewed_at AS "reviewedAt"
        FROM registration_review_requests
        WHERE status = 'approved'
        ORDER BY reviewed_at DESC
        LIMIT ?
      `, [limit]);
    }
  };
}

module.exports = {
  createSchoolRequestRepository
};
