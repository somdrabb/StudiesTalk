'use strict';

const express = require('express');

function createAdminPaymentGatewaysRouter({ service, authRequired, requireSuperAdmin, auditAction = null } = {}) {
  if (!service) throw new Error('Payment gateways router requires service.');
  const router = express.Router();
  router.use(express.json({ limit: '1mb' }));

  function context(req, user) {
    return {
      actor: user,
      ip: req.ip || '',
      userAgent: req.get('user-agent') || '',
      environment: req.body?.environment || req.query?.environment || req.body?.mode || 'test'
    };
  }

  function audit(req, user, action, meta = {}) {
    if (typeof auditAction === 'function') {
      auditAction(action, req, { user, target: meta.target || null, meta });
    }
  }

  function guard(handler) {
    return async (req, res) => {
      if (!req.auth) {
        if (typeof authRequired === 'function') return authRequired(req, res, () => guard(handler)(req, res));
        return res.status(401).json({ error: 'Not authenticated' });
      }
      const user = requireSuperAdmin(req, res);
      if (!user) return;
      try {
        await handler(req, res, user);
      } catch (err) {
        res.status(err.statusCode || 500).json({ error: err.message || 'Payment gateway request failed' });
      }
    };
  }

  router.get('/', guard(async (req, res) => {
    res.json(service.listProviders({ environment: req.query.environment || 'test' }));
  }));

  router.get('/events', guard(async (_req, res) => {
    res.json({ rows: service.listEvents({ limit: 100 }) });
  }));

  router.post('/active-provider', guard(async (req, res, user) => {
    const result = service.setActiveProvider(req.body?.provider, context(req, user));
    audit(req, user, 'payment_gateway.active_provider_changed', { target: result.activeProvider, provider: result.activeProvider });
    res.json(result);
  }));

  router.post('/:provider/test', guard(async (req, res, user) => {
    const result = await service.testProvider(req.params.provider, context(req, user));
    audit(req, user, 'payment_gateway.tested', { target: req.params.provider, provider: req.params.provider, status: result.status });
    res.json(result);
  }));

  router.post('/:provider/rotate', guard(async (req, res, user) => {
    const result = service.rotate(req.params.provider, req.body || {}, context(req, user));
    audit(req, user, 'payment_gateway.secret_rotated', { target: `${req.params.provider}:${req.body?.keyName || ''}`, provider: req.params.provider, keyName: req.body?.keyName });
    res.json(result);
  }));

  router.post('/:provider', guard(async (req, res, user) => {
    const result = service.saveProvider(req.params.provider, req.body || {}, context(req, user));
    audit(req, user, 'payment_gateway.saved', { target: req.params.provider, provider: req.params.provider });
    res.json(result);
  }));

  router.delete('/:provider/:keyName', guard(async (req, res, user) => {
    const result = service.deleteSecret(req.params.provider, req.params.keyName, context(req, user));
    audit(req, user, 'payment_gateway.secret_deleted', { target: `${req.params.provider}:${req.params.keyName}`, provider: req.params.provider, keyName: req.params.keyName });
    res.json(result);
  }));

  return router;
}

module.exports = {
  createAdminPaymentGatewaysRouter
};
