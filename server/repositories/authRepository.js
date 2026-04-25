'use strict';

const { normalizeEngine } = require('../../db/helpers');

function createAuthRepository({ engine = 'sqlite', sqliteDb } = {}) {
  const normalizedEngine = normalizeEngine(engine);
  if (normalizedEngine === 'postgres') return createPostgresAuthRepository();
  if (!sqliteDb) throw new Error('sqliteDb is required for the SQLite auth repository');
  return createSqliteAuthRepository(sqliteDb);
}

function createSqliteAuthRepository(sqliteDb) {
  return {
    engine: 'sqlite',

    getActiveRefreshToken({ id, userId, tokenHash }) {
      return sqliteDb.prepare(`
        SELECT *
        FROM refresh_tokens
        WHERE id = ? AND user_id = ? AND token_hash = ? AND revoked_at IS NULL
        LIMIT 1
      `).get(id, userId, tokenHash) || null;
    },

    insertRefreshToken(record) {
      sqliteDb.prepare(`
        INSERT INTO refresh_tokens (id, user_id, token_hash, created_at, issued_at, expires_at, revoked_at, replaced_by, ip, user_agent)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        record.id,
        record.userId,
        record.tokenHash,
        record.createdAt,
        record.issuedAt,
        record.expiresAt,
        record.revokedAt || null,
        record.replacedBy || null,
        record.ip || null,
        record.userAgent || null
      );
      return { ok: true };
    },

    insertRefreshTokenIfMissing(record) {
      sqliteDb.prepare(`
        INSERT OR IGNORE INTO refresh_tokens (id, user_id, token_hash, created_at, issued_at, expires_at, revoked_at, replaced_by, ip, user_agent)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        record.id,
        record.userId,
        record.tokenHash,
        record.createdAt,
        record.issuedAt,
        record.expiresAt,
        record.revokedAt || null,
        record.replacedBy || null,
        record.ip || null,
        record.userAgent || null
      );
      return { ok: true };
    },

    revokeRefreshToken(id, revokedAt, replacedBy = null) {
      sqliteDb.prepare(`
        UPDATE refresh_tokens
        SET revoked_at = ?, replaced_by = COALESCE(?, replaced_by)
        WHERE id = ?
      `).run(revokedAt, replacedBy, id);
      return { ok: true };
    },

    revokeAllRefreshTokensForUser(userId, revokedAt) {
      sqliteDb.prepare(`
        UPDATE refresh_tokens
        SET revoked_at = ?
        WHERE user_id = ? AND revoked_at IS NULL
      `).run(revokedAt, userId);
      return { ok: true };
    },

    revokeAndReplaceRefreshToken({ existingId, revokedAt, replacedBy, newToken }) {
      sqliteDb.transaction(() => {
        sqliteDb.prepare(`
          UPDATE refresh_tokens
          SET revoked_at = ?, replaced_by = ?
          WHERE id = ?
        `).run(revokedAt, replacedBy, existingId);
        sqliteDb.prepare(`
          INSERT INTO refresh_tokens (id, user_id, token_hash, created_at, issued_at, expires_at, revoked_at, replaced_by, ip, user_agent)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          newToken.id,
          newToken.userId,
          newToken.tokenHash,
          newToken.createdAt,
          newToken.issuedAt,
          newToken.expiresAt,
          newToken.revokedAt || null,
          newToken.replacedBy || null,
          newToken.ip || null,
          newToken.userAgent || null
        );
      })();
      return { ok: true };
    },

    revokeAccessToken({ jti, userId = null, revokedAt, expiresAt }) {
      sqliteDb.prepare(`
        INSERT OR REPLACE INTO revoked_access_tokens (jti, user_id, revoked_at, expires_at)
        VALUES (?, ?, ?, ?)
      `).run(jti, userId, revokedAt, expiresAt);
      return { ok: true };
    },

    isAccessTokenRevoked(jti) {
      return !!sqliteDb.prepare('SELECT jti FROM revoked_access_tokens WHERE jti = ?').get(jti);
    },

    writeLoginAttempt({ id, createdAt, identifier, success, userId = null, workspaceId = null, ip = null, userAgent = null }) {
      sqliteDb.prepare(`
        INSERT INTO login_attempts (id, created_at, identifier, success, user_id, workspace_id, ip, user_agent)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, createdAt, identifier, success ? 1 : 0, userId, workspaceId, ip, userAgent);
      return { ok: true };
    },

    writeSecurityEvent({ id, createdAt, workspaceId = null, actorUserId = null, targetUserId = null, type, severity = 'info', ip = null, userAgent = null, payload = null }) {
      sqliteDb.prepare(`
        INSERT INTO security_events (id, created_at, workspace_id, actor_user_id, target_user_id, type, severity, ip, user_agent, payload)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, createdAt, workspaceId, actorUserId, targetUserId, type, severity, ip, userAgent, payload);
      return { ok: true };
    },

    createPasswordReset({ tokenHash, userId, workspaceId = null, createdAt, expiresAt }) {
      sqliteDb.prepare(`
        INSERT INTO password_resets (token, user_id, workspace_id, created_at, expires_at, used, used_at)
        VALUES (?, ?, ?, ?, ?, 0, NULL)
      `).run(tokenHash, userId, workspaceId, createdAt, expiresAt);
      return { ok: true };
    },

    deletePasswordResetByHash(tokenHash) {
      sqliteDb.prepare('DELETE FROM password_resets WHERE token = ?').run(tokenHash);
      return { ok: true };
    },

    getPasswordResetByHash(tokenHash) {
      return sqliteDb.prepare(`
        SELECT token, user_id AS userId, workspace_id AS workspaceId, created_at AS createdAt,
               expires_at AS expiresAt, used
        FROM password_resets
        WHERE token = ?
      `).get(String(tokenHash || '').trim()) || null;
    },

    getLegacyPasswordReset(token) {
      return sqliteDb.prepare(`
        SELECT token, user_id AS userId, workspace_id AS workspaceId, created_at AS createdAt,
               expires_at AS expiresAt, used
        FROM password_resets
        WHERE token = ?
      `).get(String(token || '').trim()) || null;
    },

    listSecuritySessions({ query = '', limit = 50 }) {
      const normalizedQuery = String(query || '').trim().toLowerCase();
      if (normalizedQuery) {
        return sqliteDb.prepare(`
          SELECT rt.*,
                 u.email AS email,
                 u.role AS role,
                 u.workspace_id AS workspaceId
          FROM refresh_tokens rt
          LEFT JOIN users u ON u.id = rt.user_id
          WHERE lower(COALESCE(u.email, '')) LIKE ?
          ORDER BY rt.created_at DESC
          LIMIT ?
        `).all(`%${normalizedQuery}%`, limit);
      }
      return sqliteDb.prepare(`
        SELECT rt.*,
               u.email AS email,
               u.role AS role,
               u.workspace_id AS workspaceId
        FROM refresh_tokens rt
        LEFT JOIN users u ON u.id = rt.user_id
        ORDER BY rt.created_at DESC
        LIMIT ?
      `).all(limit);
    },

    listSecurityEvents({ query = '', type = '', limit = 50 }) {
      const normalizedQuery = String(query || '').trim().toLowerCase();
      const normalizedType = String(type || '').trim();
      if (normalizedQuery) {
        const params = [`%${normalizedQuery}%`, `%${normalizedQuery}%`, `%${normalizedQuery}%`];
        if (normalizedType) params.push(normalizedType);
        params.push(limit);
        return sqliteDb.prepare(`
          SELECT e.*,
                 au.email AS actorEmail,
                 tu.email AS targetEmail
          FROM security_events e
          LEFT JOIN users au ON au.id = e.actor_user_id
          LEFT JOIN users tu ON tu.id = e.target_user_id
          WHERE (lower(e.type) LIKE ? OR lower(COALESCE(au.email,'')) LIKE ? OR lower(COALESCE(tu.email,'')) LIKE ?)
          ${normalizedType ? 'AND e.type = ?' : ''}
          ORDER BY e.created_at DESC
          LIMIT ?
        `).all(...params);
      }
      const params = [];
      if (normalizedType) params.push(normalizedType);
      params.push(limit);
      return sqliteDb.prepare(`
        SELECT e.*,
               au.email AS actorEmail,
               tu.email AS targetEmail
        FROM security_events e
        LEFT JOIN users au ON au.id = e.actor_user_id
        LEFT JOIN users tu ON tu.id = e.target_user_id
        ${normalizedType ? 'WHERE e.type = ?' : ''}
        ORDER BY e.created_at DESC
        LIMIT ?
      `).all(...params);
    },

    getSecurityOverview({ since }) {
      const failed24h = Number(sqliteDb.prepare(`
        SELECT COUNT(*) AS n
        FROM login_attempts
        WHERE success = 0 AND created_at >= ?
      `).get(since)?.n || 0);
      const success24h = Number(sqliteDb.prepare(`
        SELECT COUNT(*) AS n
        FROM login_attempts
        WHERE success = 1 AND created_at >= ?
      `).get(since)?.n || 0);
      const passwordChanges24h = Number(sqliteDb.prepare(`
        SELECT COUNT(*) AS n
        FROM security_events
        WHERE type = 'security.password_changed' AND created_at >= ?
      `).get(since)?.n || 0);
      return { failed24h, success24h, passwordChanges24h };
    },

    listTopAttacks({ since, limit = 20 }) {
      return sqliteDb.prepare(`
        SELECT LOWER(identifier) AS identifier,
               COUNT(*) AS failedCount,
               MAX(created_at) AS lastSeen
        FROM login_attempts
        WHERE success = 0 AND created_at >= ?
        GROUP BY LOWER(identifier)
        ORDER BY failedCount DESC
        LIMIT ?
      `).all(since, limit);
    },

    listFailedByIp({ since, limit = 50 }) {
      return sqliteDb.prepare(`
        SELECT ip,
               COUNT(*) AS failedCount,
               MAX(created_at) AS lastSeen
        FROM login_attempts
        WHERE success = 0 AND created_at >= ? AND ip IS NOT NULL AND ip <> ''
        GROUP BY ip
        ORDER BY failedCount DESC
        LIMIT ?
      `).all(since, limit);
    },

    deleteUserAuthState(userId) {
      sqliteDb.transaction(() => {
        sqliteDb.prepare('DELETE FROM refresh_tokens WHERE user_id = ?').run(userId);
        sqliteDb.prepare('DELETE FROM revoked_access_tokens WHERE user_id = ?').run(userId);
        sqliteDb.prepare('DELETE FROM password_history WHERE user_id = ?').run(userId);
        sqliteDb.prepare('DELETE FROM password_resets WHERE user_id = ?').run(userId);
        sqliteDb.prepare('DELETE FROM login_attempts WHERE user_id = ?').run(userId);
        sqliteDb.prepare('DELETE FROM security_events WHERE actor_user_id = ? OR target_user_id = ?').run(userId, userId);
      })();
      return { ok: true };
    }
  };
}

function createPostgresAuthRepository() {
  const postgres = require('../../db/postgres');
  let securityEventsHasLegacyEventTypeColumn = null;

  async function hasLegacyEventTypeColumn() {
    if (securityEventsHasLegacyEventTypeColumn !== null) {
      return securityEventsHasLegacyEventTypeColumn;
    }
    const row = await postgres.one(`
      SELECT 1 AS present
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'security_events'
        AND column_name = 'event_type'
      LIMIT 1
    `);
    securityEventsHasLegacyEventTypeColumn = !!row;
    return securityEventsHasLegacyEventTypeColumn;
  }

  return {
    engine: 'postgres',

    async getActiveRefreshToken({ id, userId, tokenHash }) {
      return postgres.one(`
        SELECT *
        FROM refresh_tokens
        WHERE id = ? AND user_id = ? AND token_hash = ? AND revoked_at IS NULL
        LIMIT 1
      `, [id, userId, tokenHash]);
    },

    async insertRefreshToken(record) {
      await postgres.exec(`
        INSERT INTO refresh_tokens (id, user_id, token_hash, created_at, issued_at, expires_at, revoked_at, replaced_by, ip, user_agent)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        record.id,
        record.userId,
        record.tokenHash,
        record.createdAt,
        record.issuedAt,
        record.expiresAt,
        record.revokedAt || null,
        record.replacedBy || null,
        record.ip || null,
        record.userAgent || null
      ]);
      return { ok: true };
    },

    async insertRefreshTokenIfMissing(record) {
      await postgres.exec(`
        INSERT INTO refresh_tokens (id, user_id, token_hash, created_at, issued_at, expires_at, revoked_at, replaced_by, ip, user_agent)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT DO NOTHING
      `, [
        record.id,
        record.userId,
        record.tokenHash,
        record.createdAt,
        record.issuedAt,
        record.expiresAt,
        record.revokedAt || null,
        record.replacedBy || null,
        record.ip || null,
        record.userAgent || null
      ]);
      return { ok: true };
    },

    async revokeRefreshToken(id, revokedAt, replacedBy = null) {
      await postgres.exec(`
        UPDATE refresh_tokens
        SET revoked_at = ?, replaced_by = COALESCE(?, replaced_by)
        WHERE id = ?
      `, [revokedAt, replacedBy, id]);
      return { ok: true };
    },

    async revokeAllRefreshTokensForUser(userId, revokedAt) {
      await postgres.exec(`
        UPDATE refresh_tokens
        SET revoked_at = ?
        WHERE user_id = ? AND revoked_at IS NULL
      `, [revokedAt, userId]);
      return { ok: true };
    },

    async revokeAndReplaceRefreshToken({ existingId, revokedAt, replacedBy, newToken }) {
      await postgres.transaction(async (tx) => {
        await tx.exec(`
          UPDATE refresh_tokens
          SET revoked_at = ?, replaced_by = ?
          WHERE id = ?
        `, [revokedAt, replacedBy, existingId]);
        await tx.exec(`
          INSERT INTO refresh_tokens (id, user_id, token_hash, created_at, issued_at, expires_at, revoked_at, replaced_by, ip, user_agent)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          newToken.id,
          newToken.userId,
          newToken.tokenHash,
          newToken.createdAt,
          newToken.issuedAt,
          newToken.expiresAt,
          newToken.revokedAt || null,
          newToken.replacedBy || null,
          newToken.ip || null,
          newToken.userAgent || null
        ]);
      });
      return { ok: true };
    },

    async revokeAccessToken({ jti, userId = null, revokedAt, expiresAt }) {
      await postgres.exec(`
        INSERT INTO revoked_access_tokens (jti, user_id, revoked_at, expires_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT (jti) DO UPDATE SET
          user_id = EXCLUDED.user_id,
          revoked_at = EXCLUDED.revoked_at,
          expires_at = EXCLUDED.expires_at
      `, [jti, userId, revokedAt, expiresAt]);
      return { ok: true };
    },

    async isAccessTokenRevoked(jti) {
      return !!(await postgres.one('SELECT jti FROM revoked_access_tokens WHERE jti = ?', [jti]));
    },

    async writeLoginAttempt({ id, createdAt, identifier, success, userId = null, workspaceId = null, ip = null, userAgent = null }) {
      await postgres.exec(`
        INSERT INTO login_attempts (id, created_at, identifier, success, user_id, workspace_id, ip, user_agent)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [id, createdAt, identifier, success, userId, workspaceId, ip, userAgent]);
      return { ok: true };
    },

    async writeSecurityEvent({ id, createdAt, workspaceId = null, actorUserId = null, targetUserId = null, type, severity = 'info', ip = null, userAgent = null, payload = null }) {
      if (await hasLegacyEventTypeColumn()) {
        await postgres.exec(`
          INSERT INTO security_events (id, created_at, workspace_id, actor_user_id, target_user_id, type, event_type, severity, ip, user_agent, payload)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [id, createdAt, workspaceId, actorUserId, targetUserId, type, type, severity, ip, userAgent, payload]);
      } else {
        await postgres.exec(`
          INSERT INTO security_events (id, created_at, workspace_id, actor_user_id, target_user_id, type, severity, ip, user_agent, payload)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [id, createdAt, workspaceId, actorUserId, targetUserId, type, severity, ip, userAgent, payload]);
      }
      return { ok: true };
    },

    async createPasswordReset({ tokenHash, userId, workspaceId = null, createdAt, expiresAt }) {
      await postgres.exec(`
        INSERT INTO password_resets (token, user_id, workspace_id, created_at, expires_at, used, used_at)
        VALUES (?, ?, ?, ?, ?, false, NULL)
      `, [tokenHash, userId, workspaceId, createdAt, expiresAt]);
      return { ok: true };
    },

    async deletePasswordResetByHash(tokenHash) {
      await postgres.exec('DELETE FROM password_resets WHERE token = ?', [tokenHash]);
      return { ok: true };
    },

    async getPasswordResetByHash(tokenHash) {
      return postgres.one(`
        SELECT token, user_id AS "userId", workspace_id AS "workspaceId", created_at AS "createdAt",
               expires_at AS "expiresAt", used
        FROM password_resets
        WHERE token = ?
      `, [String(tokenHash || '').trim()]);
    },

    async getLegacyPasswordReset(token) {
      return postgres.one(`
        SELECT token, user_id AS "userId", workspace_id AS "workspaceId", created_at AS "createdAt",
               expires_at AS "expiresAt", used
        FROM password_resets
        WHERE token = ?
      `, [String(token || '').trim()]);
    },

    async listSecuritySessions({ query = '', limit = 50 }) {
      const normalizedQuery = String(query || '').trim().toLowerCase();
      if (normalizedQuery) {
        return postgres.many(`
          SELECT rt.*,
                 u.email AS email,
                 u.role AS role,
                 u.workspace_id AS "workspaceId"
          FROM refresh_tokens rt
          LEFT JOIN users u ON u.id = rt.user_id
          WHERE lower(COALESCE(u.email::text, '')) LIKE ?
          ORDER BY rt.created_at DESC
          LIMIT ?
        `, [`%${normalizedQuery}%`, limit]);
      }
      return postgres.many(`
        SELECT rt.*,
               u.email AS email,
               u.role AS role,
               u.workspace_id AS "workspaceId"
        FROM refresh_tokens rt
        LEFT JOIN users u ON u.id = rt.user_id
        ORDER BY rt.created_at DESC
        LIMIT ?
      `, [limit]);
    },

    async listSecurityEvents({ query = '', type = '', limit = 50 }) {
      const normalizedQuery = String(query || '').trim().toLowerCase();
      const normalizedType = String(type || '').trim();
      if (normalizedQuery) {
        const params = [`%${normalizedQuery}%`, `%${normalizedQuery}%`, `%${normalizedQuery}%`];
        if (normalizedType) params.push(normalizedType);
        params.push(limit);
        return postgres.many(`
          SELECT e.*,
                 au.email AS "actorEmail",
                 tu.email AS "targetEmail"
          FROM security_events e
          LEFT JOIN users au ON au.id = e.actor_user_id
          LEFT JOIN users tu ON tu.id = e.target_user_id
          WHERE (lower(e.type) LIKE ? OR lower(COALESCE(au.email::text,'')) LIKE ? OR lower(COALESCE(tu.email::text,'')) LIKE ?)
          ${normalizedType ? 'AND e.type = ?' : ''}
          ORDER BY e.created_at DESC
          LIMIT ?
        `, params);
      }
      const params = [];
      if (normalizedType) params.push(normalizedType);
      params.push(limit);
      return postgres.many(`
        SELECT e.*,
               au.email AS "actorEmail",
               tu.email AS "targetEmail"
        FROM security_events e
        LEFT JOIN users au ON au.id = e.actor_user_id
        LEFT JOIN users tu ON tu.id = e.target_user_id
        ${normalizedType ? 'WHERE e.type = ?' : ''}
        ORDER BY e.created_at DESC
        LIMIT ?
      `, params);
    },

    async getSecurityOverview({ since }) {
      const failedRow = await postgres.one(`
        SELECT COUNT(*)::int AS n
        FROM login_attempts
        WHERE success = false AND created_at >= ?
      `, [since]);
      const successRow = await postgres.one(`
        SELECT COUNT(*)::int AS n
        FROM login_attempts
        WHERE success = true AND created_at >= ?
      `, [since]);
      const passwordRow = await postgres.one(`
        SELECT COUNT(*)::int AS n
        FROM security_events
        WHERE type = 'security.password_changed' AND created_at >= ?
      `, [since]);
      return {
        failed24h: Number(failedRow?.n || 0),
        success24h: Number(successRow?.n || 0),
        passwordChanges24h: Number(passwordRow?.n || 0)
      };
    },

    async listTopAttacks({ since, limit = 20 }) {
      return postgres.many(`
        SELECT LOWER(identifier) AS identifier,
               COUNT(*)::int AS "failedCount",
               MAX(created_at) AS "lastSeen"
        FROM login_attempts
        WHERE success = false AND created_at >= ?
        GROUP BY LOWER(identifier)
        ORDER BY "failedCount" DESC
        LIMIT ?
      `, [since, limit]);
    },

    async listFailedByIp({ since, limit = 50 }) {
      return postgres.many(`
        SELECT ip,
               COUNT(*)::int AS "failedCount",
               MAX(created_at) AS "lastSeen"
        FROM login_attempts
        WHERE success = false AND created_at >= ? AND ip IS NOT NULL AND ip <> ''
        GROUP BY ip
        ORDER BY "failedCount" DESC
        LIMIT ?
      `, [since, limit]);
    },

    async deleteUserAuthState(userId) {
      await postgres.transaction(async (tx) => {
        await tx.exec('DELETE FROM refresh_tokens WHERE user_id = ?', [userId]);
        await tx.exec('DELETE FROM revoked_access_tokens WHERE user_id = ?', [userId]);
        await tx.exec('DELETE FROM password_history WHERE user_id = ?', [userId]);
        await tx.exec('DELETE FROM password_resets WHERE user_id = ?', [userId]);
        await tx.exec('DELETE FROM login_attempts WHERE user_id = ?', [userId]);
        await tx.exec('DELETE FROM security_events WHERE actor_user_id = ? OR target_user_id = ?', [userId, userId]);
      });
      return { ok: true };
    }
  };
}

module.exports = {
  createAuthRepository
};
