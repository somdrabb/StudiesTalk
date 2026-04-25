'use strict';

const crypto = require('crypto');
const { normalizeEngine } = require('../../db/helpers');

function createAuditRepository({ engine = 'sqlite', sqliteDb } = {}) {
  const normalizedEngine = normalizeEngine(engine);
  if (normalizedEngine === 'postgres') {
    return createPostgresAuditRepository();
  }
  if (!sqliteDb) {
    throw new Error('sqliteDb is required for the SQLite audit repository');
  }
  return createSqliteAuditRepository(sqliteDb);
}

function createSqliteAuditRepository(sqliteDb) {
  return {
    engine: 'sqlite',

    async writeAuditLog({ id = crypto.randomUUID(), at, userId, role, workspaceId, action, target, metaJson, ip, userAgent }) {
      sqliteDb.prepare(`
        INSERT INTO audit_logs (id, at, user_id, role, workspace_id, action, target, meta_json, ip, user_agent)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, at, userId || null, role || null, workspaceId || null, action, target || null, metaJson || null, ip || null, userAgent || '');
      return { id };
    },

    async writeLegacyAuditLog({ workspaceId = null, actor = null, action = '', target = '', payloadJson = null, createdAt }) {
      sqliteDb.prepare(`
        INSERT INTO audit_log (workspace_id, actor, action, target, payload_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(workspaceId, actor, action, target, payloadJson, createdAt);
    },

    async listLegacyAudit({ workspaceId = 'all', limit = 500 }) {
      const ws = String(workspaceId || 'all');
      const params = ws === 'all' ? [limit] : [ws, limit];
      return sqliteDb.prepare(`
        SELECT
          id,
          workspace_id AS workspaceId,
          actor,
          action,
          target,
          payload_json AS payloadJson,
          created_at AS createdAt
        FROM audit_log
        ${ws === 'all' ? '' : 'WHERE workspace_id = ?'}
        ORDER BY created_at DESC
        LIMIT ?
      `).all(...params);
    },

    async listRecentLegacyAudit(limit = 15) {
      return sqliteDb.prepare(`
        SELECT workspace_id AS workspaceId, actor, action, target, created_at AS createdAt
        FROM audit_log
        ORDER BY created_at DESC
        LIMIT ?
      `).all(limit);
    }
  };
}

function createPostgresAuditRepository() {
  const postgres = require('../../db/postgres');
  return {
    engine: 'postgres',

    async writeAuditLog({ id = crypto.randomUUID(), at, userId, role, workspaceId, action, target, metaJson, ip, userAgent }) {
      await postgres.exec(`
        INSERT INTO audit_logs (id, at, user_id, role, workspace_id, action, target, meta_json, ip, user_agent)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [id, at, userId || null, role || null, workspaceId || null, action, target || null, metaJson || null, ip || null, userAgent || '']);
      return { id };
    },

    async writeLegacyAuditLog({ workspaceId = null, actor = null, action = '', target = '', payloadJson = null, createdAt }) {
      await postgres.exec(`
        INSERT INTO audit_log (workspace_id, actor, action, target, payload_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [workspaceId, actor, action, target, payloadJson, createdAt]);
    },

    async listLegacyAudit({ workspaceId = 'all', limit = 500 }) {
      const ws = String(workspaceId || 'all');
      const params = ws === 'all' ? [limit] : [ws, limit];
      return postgres.many(`
        SELECT
          id,
          workspace_id AS "workspaceId",
          actor,
          action,
          target,
          payload_json AS "payloadJson",
          created_at AS "createdAt"
        FROM audit_log
        ${ws === 'all' ? '' : 'WHERE workspace_id = ?'}
        ORDER BY created_at DESC
        LIMIT ?
      `, params);
    },

    async listRecentLegacyAudit(limit = 15) {
      return postgres.many(`
        SELECT workspace_id AS "workspaceId", actor, action, target, created_at AS "createdAt"
        FROM audit_log
        ORDER BY created_at DESC
        LIMIT ?
      `, [limit]);
    }
  };
}

module.exports = {
  createAuditRepository
};
