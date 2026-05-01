'use strict';

const crypto = require('crypto');

const PROVIDERS = {
  stripe: {
    label: 'Stripe',
    publicFields: ['STRIPE_PUBLIC_KEY', 'STRIPE_PRICE_STARTER', 'STRIPE_PRICE_PRO', 'STRIPE_PRICE_ENTERPRISE'],
    secretFields: ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'],
    aliases: { publicKey: 'STRIPE_PUBLIC_KEY', secretKey: 'STRIPE_SECRET_KEY', webhookSecret: 'STRIPE_WEBHOOK_SECRET' }
  },
  paypal: {
    label: 'PayPal',
    publicFields: ['PAYPAL_CLIENT_ID', 'PAYPAL_MODE'],
    secretFields: ['PAYPAL_CLIENT_SECRET', 'PAYPAL_WEBHOOK_ID'],
    aliases: { clientId: 'PAYPAL_CLIENT_ID', clientSecret: 'PAYPAL_CLIENT_SECRET', webhookSecret: 'PAYPAL_WEBHOOK_ID', mode: 'PAYPAL_MODE' }
  },
  mollie: {
    label: 'Mollie',
    publicFields: ['MOLLIE_PROFILE_ID'],
    secretFields: ['MOLLIE_API_KEY', 'MOLLIE_WEBHOOK_SECRET'],
    aliases: { secretKey: 'MOLLIE_API_KEY', webhookSecret: 'MOLLIE_WEBHOOK_SECRET', publicKey: 'MOLLIE_PROFILE_ID' }
  }
};

function nowIso() {
  return new Date().toISOString();
}

function clean(value) {
  return String(value == null ? '' : value).trim();
}

function assertProvider(provider) {
  const key = clean(provider).toLowerCase();
  if (!PROVIDERS[key]) {
    const error = new Error('Unsupported payment provider.');
    error.statusCode = 400;
    throw error;
  }
  return key;
}

function id(prefix) {
  return `${prefix}_${crypto.randomBytes(12).toString('hex')}`;
}

function createPaymentGatewaySecretsService({ db, platformSecretsService, env = process.env, now = nowIso } = {}) {
  if (!db) throw new Error('Payment gateway service requires db.');
  if (!platformSecretsService) throw new Error('Payment gateway service requires platformSecretsService.');

  function ensureSchema() {
    db.prepare(`
      CREATE TABLE IF NOT EXISTS payment_gateway_events (
        id TEXT PRIMARY KEY,
        provider TEXT,
        event_type TEXT NOT NULL,
        status TEXT,
        message TEXT,
        actor_user_id TEXT,
        ip TEXT,
        user_agent TEXT,
        created_at TEXT NOT NULL
      )
    `).run();
    db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_payment_gateway_events_provider_created
      ON payment_gateway_events(provider, created_at)
    `).run();
  }

  function recordEvent({ provider = '', eventType, status = 'ok', message = '', actor = {}, ip = '', userAgent = '' } = {}) {
    ensureSchema();
    const row = {
      id: id('pgw_evt'),
      provider: provider ? assertProvider(provider) : '',
      event_type: clean(eventType),
      status: clean(status),
      message: clean(message).slice(0, 500),
      actor_user_id: actor?.id || actor?.sub || actor?.userId || null,
      ip: clean(ip) || null,
      user_agent: clean(userAgent) || null,
      created_at: now()
    };
    db.prepare(`
      INSERT INTO payment_gateway_events (id, provider, event_type, status, message, actor_user_id, ip, user_agent, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(row.id, row.provider, row.event_type, row.status, row.message, row.actor_user_id, row.ip, row.user_agent, row.created_at);
    return row;
  }

  function getEnv(environment = 'test') {
    return clean(environment) || 'test';
  }

  function getSetting(keyName) {
    try {
      return db.prepare('SELECT value FROM platform_settings WHERE key = ?').get(keyName)?.value || '';
    } catch (_err) {
      return '';
    }
  }

  function setSetting(keyName, value) {
    const ts = now();
    db.prepare(`
      INSERT INTO platform_settings (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(keyName, String(value || ''), ts);
  }

  function listProvider(provider, environment) {
    const definition = PROVIDERS[provider];
    const secretRows = platformSecretsService.listSecrets({ environment });
    const secretProvider = secretRows.find((entry) => entry.provider === provider) || { secrets: [] };
    const byKey = new Map((secretProvider.secrets || []).map((entry) => [entry.keyName, entry]));
    const fields = [...definition.publicFields, ...definition.secretFields].map((keyName) => {
      const row = byKey.get(keyName) || {};
      return {
        keyName,
        configured: !!(row.enabled || row.source === 'env' || row.source === 'db'),
        maskedValue: row.maskedValue || '',
        source: row.source || 'unset',
        secret: definition.secretFields.includes(keyName),
        lastTestStatus: row.lastTestStatus || '',
        lastTestAt: row.lastTestedAt || null
      };
    });
    const enabled = clean(getSetting(`payment.gateway.${provider}.enabled`)) === 'true';
    const mode = clean(getSetting(`payment.gateway.${provider}.mode`)) || clean(platformSecretsService.getRuntimeSecret(provider, definition.aliases.mode || '', definition.aliases.mode || '', environment)) || 'test';
    const activeProvider = clean(getSetting('PAYMENT_ACTIVE_PROVIDER')) || clean(env.PAYMENT_ACTIVE_PROVIDER) || 'stripe';
    const webhookField = definition.secretFields.find((key) => /WEBHOOK/.test(key));
    const webhookRow = webhookField ? byKey.get(webhookField) : null;
    const lastTest = fields.find((field) => field.lastTestAt);
    return {
      provider,
      label: definition.label,
      enabled,
      mode,
      active: activeProvider === provider,
      fields,
      configuredFields: fields.filter((field) => field.configured).map((field) => field.keyName),
      webhookConfigured: !!webhookRow?.enabled || webhookRow?.source === 'env' || webhookRow?.source === 'db',
      webhookLastReceivedAt: latestEvent(provider, 'webhook_received')?.created_at || null,
      lastTestStatus: lastTest?.lastTestStatus || latestEvent(provider, 'tested')?.status || '',
      lastTestAt: lastTest?.lastTestAt || latestEvent(provider, 'tested')?.created_at || null
    };
  }

  function latestEvent(provider, eventType = '') {
    ensureSchema();
    const p = clean(provider).toLowerCase();
    if (eventType) {
      return db.prepare('SELECT * FROM payment_gateway_events WHERE provider = ? AND event_type = ? ORDER BY created_at DESC LIMIT 1').get(p, eventType) || null;
    }
    return db.prepare('SELECT * FROM payment_gateway_events WHERE provider = ? ORDER BY created_at DESC LIMIT 1').get(p) || null;
  }

  function listProviders({ environment = 'test' } = {}) {
    ensureSchema();
    const envName = getEnv(environment);
    const activeProvider = clean(getSetting('PAYMENT_ACTIVE_PROVIDER')) || clean(env.PAYMENT_ACTIVE_PROVIDER) || 'stripe';
    const events = listEvents({ limit: 50 });
    return {
      environment: envName,
      activeProvider,
      providers: Object.keys(PROVIDERS).map((provider) => listProvider(provider, envName)),
      webhookHealth: {
        stripe: listProvider('stripe', envName).webhookConfigured ? 'configured' : 'not_configured',
        paypal: listProvider('paypal', envName).webhookConfigured ? 'configured' : 'not_configured',
        mollie: listProvider('mollie', envName).webhookConfigured ? 'configured' : 'not_configured',
        lastWebhookReceivedAt: events.find((event) => event.event_type === 'webhook_received')?.created_at || null,
        lastFailedWebhook: events.find((event) => event.event_type.includes('webhook') && event.status === 'failed') || null,
        signatureVerificationStatus: 'configured / not configured / not tested'
      }
    };
  }

  function resolveKey(provider, aliasOrKey) {
    const p = assertProvider(provider);
    const definition = PROVIDERS[p];
    const raw = clean(aliasOrKey);
    const keyName = definition.aliases[raw] || raw;
    if (![...definition.publicFields, ...definition.secretFields].includes(keyName)) {
      const error = new Error('Unsupported provider key.');
      error.statusCode = 400;
      throw error;
    }
    return keyName;
  }

  function saveProvider(provider, body = {}, context = {}) {
    const p = assertProvider(provider);
    const environment = getEnv(body.environment || body.mode || context.environment || 'test');
    const enabled = body.enabled !== undefined ? !!body.enabled : undefined;
    const mode = clean(body.mode);
    if (mode && !['test', 'live'].includes(mode)) {
      const error = new Error('mode must be test or live.');
      error.statusCode = 400;
      throw error;
    }
    if (enabled !== undefined) setSetting(`payment.gateway.${p}.enabled`, enabled ? 'true' : 'false');
    if (mode) setSetting(`payment.gateway.${p}.mode`, mode);
    const definition = PROVIDERS[p];
    for (const [alias, keyName] of Object.entries(definition.aliases)) {
      if (!Object.prototype.hasOwnProperty.call(body, alias)) continue;
      const value = clean(body[alias]);
      if (!value) continue;
      platformSecretsService.upsertSecret({ provider: p, keyName, value, environment, actor: context.actor, ipAddress: context.ip, userAgent: context.userAgent });
    }
    for (const keyName of [...definition.publicFields, ...definition.secretFields]) {
      if (!Object.prototype.hasOwnProperty.call(body, keyName)) continue;
      const value = clean(body[keyName]);
      if (!value) continue;
      platformSecretsService.upsertSecret({ provider: p, keyName, value, environment, actor: context.actor, ipAddress: context.ip, userAgent: context.userAgent });
    }
    recordEvent({ provider: p, eventType: 'saved', status: 'ok', message: 'Provider config saved.', ...context });
    return listProvider(p, environment);
  }

  async function testProvider(provider, context = {}) {
    const p = assertProvider(provider);
    const environment = getEnv(context.environment || 'test');
    let status = 'ok';
    let message = 'Configured.';
    try {
      if (p === 'stripe') {
        const key = platformSecretsService.getRuntimeSecret('stripe', 'STRIPE_SECRET_KEY', 'STRIPE_SECRET_KEY', environment);
        if (!key) throw new Error('Stripe secret key is missing.');
        try {
          const Stripe = require('stripe');
          if (String(env.PAYMENT_GATEWAY_SKIP_NETWORK_TEST || '').toLowerCase() === 'true') {
            message = 'Stripe SDK available; live API test skipped.';
          } else {
          const stripe = new Stripe(key);
          await stripe.customers.list({ limit: 1 });
          message = 'Stripe connection ok.';
          }
        } catch (err) {
          if (err?.type || err?.raw) throw err;
          message = 'Stripe SDK available; live API test skipped.';
        }
      } else if (p === 'paypal') {
        const clientId = platformSecretsService.getRuntimeSecret('paypal', 'PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_ID', environment);
        const secret = platformSecretsService.getRuntimeSecret('paypal', 'PAYPAL_CLIENT_SECRET', 'PAYPAL_CLIENT_SECRET', environment);
        if (!clientId || !secret) throw new Error('PayPal client credentials are incomplete.');
        message = 'PayPal configured; SDK missing or not installed.';
      } else if (p === 'mollie') {
        const key = platformSecretsService.getRuntimeSecret('mollie', 'MOLLIE_API_KEY', 'MOLLIE_API_KEY', environment);
        if (!key) throw new Error('Mollie API key is missing.');
        message = 'Mollie configured; SDK missing or not installed.';
      }
    } catch (err) {
      status = 'failed';
      message = err?.message || 'Provider test failed.';
    }
    recordEvent({ provider: p, eventType: 'tested', status, message, ...context });
    return { provider: p, status, message, testedAt: now() };
  }

  function rotate(provider, { keyName, value }, context = {}) {
    const p = assertProvider(provider);
    const key = resolveKey(p, keyName);
    const v = clean(value);
    if (!v) {
      const error = new Error('New secret value is required.');
      error.statusCode = 400;
      throw error;
    }
    const environment = getEnv(context.environment || 'test');
    const record = platformSecretsService.rotateSecret({ provider: p, keyName: key, value: v, environment, actor: context.actor, ipAddress: context.ip, userAgent: context.userAgent });
    recordEvent({ provider: p, eventType: 'rotated', status: 'ok', message: `${key} rotated.`, ...context });
    return record;
  }

  function remove(provider, keyName, context = {}) {
    const p = assertProvider(provider);
    const key = resolveKey(p, keyName);
    const environment = getEnv(context.environment || 'test');
    const result = platformSecretsService.deleteSecret({ provider: p, keyName: key, environment, actor: context.actor, ipAddress: context.ip, userAgent: context.userAgent });
    recordEvent({ provider: p, eventType: 'deleted', status: 'ok', message: `${key} deleted.`, ...context });
    return result;
  }

  function setActiveProvider(provider, context = {}) {
    const p = assertProvider(provider);
    setSetting('PAYMENT_ACTIVE_PROVIDER', p);
    recordEvent({ provider: p, eventType: 'active_provider_changed', status: 'ok', message: `Active provider set to ${p}.`, ...context });
    return { activeProvider: p };
  }

  function listEvents({ limit = 100 } = {}) {
    ensureSchema();
    return db.prepare('SELECT * FROM payment_gateway_events ORDER BY created_at DESC LIMIT ?').all(Math.max(1, Math.min(500, Number(limit) || 100)));
  }

  return {
    ensureSchema,
    listProviders,
    saveProvider,
    testProvider,
    rotate,
    deleteSecret: remove,
    setActiveProvider,
    listEvents,
    providers: PROVIDERS
  };
}

module.exports = {
  createPaymentGatewaySecretsService,
  PROVIDERS
};
