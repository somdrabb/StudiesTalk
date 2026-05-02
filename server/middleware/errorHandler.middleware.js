'use strict';

function createErrorHandlerMiddleware({ logger = console, observability = null, isProd = false, serializeError = null, sentry = null } = {}) {
  return function errorHandlerMiddleware(err, req, res, next) {
    const errorPayload = typeof serializeError === 'function'
      ? serializeError(err, { includeStack: !isProd })
      : {
          name: err?.name || 'Error',
          message: err?.message || String(err || 'Internal server error'),
          stack: !isProd ? err?.stack : undefined
        };

    if (observability && typeof observability.recordRequest === 'function') {
      observability.recordRequest({
        requestId: req.id || null,
        method: req.method || '',
        path: req.originalUrl || req.url || '',
        status: 500,
        durationMs: 0,
        actorUserId: req.auth?.sub || req.auth?.id || req.ctx?.userId || null,
        role: req.auth?.role || req.ctx?.role || null,
        workspaceId: req.auth?.workspaceId || req.auth?.workspace_id || req.ctx?.workspaceId || null,
        ip: req.ip || null,
        userAgent: req.get?.('user-agent') || '',
        error: errorPayload
      });
    }

    if (logger && typeof logger.error === 'function') {
      logger.error('[ERROR]', {
        requestId: req.id || null,
        path: req.path,
        method: req.method,
        error: errorPayload
      });
    }

    if (sentry && typeof sentry.captureException === 'function') {
      sentry.captureException(err, {
        tags: {
          requestId: req.id || null,
          method: req.method || '',
          path: req.path || ''
        },
        user: req.auth?.id || req.auth?.sub ? { id: req.auth.id || req.auth.sub } : undefined,
        extra: {
          workspaceId: req.auth?.workspaceId || req.auth?.workspace_id || req.ctx?.workspaceId || null
        }
      });
    }

    if (res.headersSent) return next(err);
    return res.status(500).json({ error: 'Internal server error', requestId: req.id || null });
  };
}

module.exports = {
  createErrorHandlerMiddleware
};
