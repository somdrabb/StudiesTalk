'use strict';

const crypto = require('crypto');

function makeRequestId() {
  return crypto.randomUUID ? crypto.randomUUID() : `req_${crypto.randomBytes(12).toString('hex')}`;
}

function createRequestContextMiddleware({ observability = null } = {}) {
  return function requestContextMiddleware(req, res, next) {
    const incomingId = String(req.headers['x-request-id'] || '').trim();
    req.id = incomingId || req.id || makeRequestId();
    res.setHeader('X-Request-Id', req.id);
    const startedAt = Date.now();

    res.on('finish', () => {
      if (!observability || typeof observability.recordRequest !== 'function') return;
      const user = req.auth || null;
      const ctx = req.ctx || {};
      observability.recordRequest({
        requestId: req.id,
        method: req.method,
        path: req.originalUrl || req.url || '',
        status: res.statusCode,
        durationMs: Date.now() - startedAt,
        actorUserId: user?.sub || user?.id || ctx.userId || null,
        role: user?.role || ctx.role || null,
        workspaceId: user?.workspaceId || user?.workspace_id || ctx.workspaceId || null,
        ip: req.ip || req.socket?.remoteAddress || null,
        userAgent: req.get?.('user-agent') || ''
      });
    });

    next();
  };
}

module.exports = {
  createRequestContextMiddleware
};
