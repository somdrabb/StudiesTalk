'use strict';

const crypto = require('crypto');
const nodemailer = require('nodemailer');
const twilio = require('twilio');
const jwt = require('jsonwebtoken');
const { Translate } = require('@google-cloud/translate').v2;
const { createS3CompatibleStorageAdapter } = require('./storage/s3CompatibleStorage.adapter');

const DEFAULT_ENVIRONMENT = 'production';

const PROVIDER_DEFINITIONS = {
  openai: {
    label: 'OpenAI',
    fields: [
      { keyName: 'OPENAI_API_KEY', label: 'API key', secret: true },
      { keyName: 'OPENAI_REALTIME_MODEL', label: 'Realtime model', secret: false },
      { keyName: 'OPENAI_REALTIME_URL', label: 'Realtime URL', secret: false }
    ]
  },
  twilio: {
    label: 'Twilio SMS',
    fields: [
      { keyName: 'TWILIO_ACCOUNT_SID', label: 'Account SID', secret: true },
      { keyName: 'TWILIO_AUTH_TOKEN', label: 'Auth token', secret: true },
      { keyName: 'TWILIO_PHONE_NUMBER', label: 'Phone number', secret: true },
      { keyName: 'TWILIO_VERIFY_SERVICE_SID', label: 'Verify service SID', secret: true }
    ]
  },
  email: {
    label: 'Email / SMTP',
    fields: [
      { keyName: 'IONOS_SMTP_HOST', label: 'SMTP host', secret: false },
      { keyName: 'IONOS_SMTP_PORT', label: 'SMTP port', secret: false },
      { keyName: 'IONOS_SMTP_SECURE', label: 'SMTP secure', secret: false },
      { keyName: 'IONOS_SMTP_USER', label: 'SMTP user', secret: true },
      { keyName: 'IONOS_SMTP_PASS', label: 'SMTP password', secret: true },
      { keyName: 'EMAIL_FROM', label: 'Email from', secret: false }
    ]
  },
  google: {
    label: 'Google Cloud',
    fields: [
      { keyName: 'GOOGLE_TRANSLATE_KEY_JSON', label: 'Translate key JSON', secret: true },
      { keyName: 'GOOGLE_APPLICATION_CREDENTIALS', label: 'Credentials path', secret: false }
    ]
  },
  jitsi: {
    label: 'Jitsi / Live class',
    fields: [
      { keyName: 'JITSI_DOMAIN', label: 'Domain', secret: false },
      { keyName: 'JITSI_APP_ID', label: 'App ID', secret: true },
      { keyName: 'JITSI_APP_SECRET', label: 'App secret', secret: true },
      { keyName: 'JITSI_JWT_AUDIENCE', label: 'JWT audience', secret: false },
      { keyName: 'JITSI_JWT_ISSUER', label: 'JWT issuer', secret: false },
      { keyName: 'JITSI_JWT_SUBJECT', label: 'JWT subject', secret: false }
    ]
  },
  storage: {
    label: 'Storage S3/R2',
    fields: [
      { keyName: 'FILE_STORAGE_ADAPTER', label: 'Storage adapter', secret: false },
      { keyName: 'S3_ENDPOINT', label: 'S3 endpoint', secret: false },
      { keyName: 'S3_REGION', label: 'S3 region', secret: false },
      { keyName: 'S3_BUCKET', label: 'Bucket', secret: false },
      { keyName: 'S3_ACCESS_KEY_ID', label: 'Access key ID', secret: true },
      { keyName: 'S3_SECRET_ACCESS_KEY', label: 'Secret access key', secret: true },
      { keyName: 'S3_PUBLIC_BASE_URL', label: 'Public base URL', secret: false }
    ]
  },
  analytics: {
    label: 'Analytics',
    fields: [
      { keyName: 'ANALYTICS_API_KEY', label: 'Analytics API key', secret: true },
      { keyName: 'ANALYTICS_WRITE_KEY', label: 'Analytics write key', secret: true }
    ]
  },
  stripe: {
    label: 'Stripe',
    fields: [
      { keyName: 'STRIPE_PUBLIC_KEY', label: 'Public key', secret: false },
      { keyName: 'STRIPE_SECRET_KEY', label: 'Secret key', secret: true },
      { keyName: 'STRIPE_WEBHOOK_SECRET', label: 'Webhook secret', secret: true },
      { keyName: 'STRIPE_PRICE_STARTER', label: 'Starter price ID', secret: false },
      { keyName: 'STRIPE_PRICE_PRO', label: 'Pro price ID', secret: false },
      { keyName: 'STRIPE_PRICE_ENTERPRISE', label: 'Enterprise price ID', secret: false }
    ]
  },
  paypal: {
    label: 'PayPal',
    fields: [
      { keyName: 'PAYPAL_CLIENT_ID', label: 'Client ID', secret: false },
      { keyName: 'PAYPAL_CLIENT_SECRET', label: 'Client secret', secret: true },
      { keyName: 'PAYPAL_WEBHOOK_ID', label: 'Webhook ID', secret: true },
      { keyName: 'PAYPAL_MODE', label: 'Mode', secret: false }
    ]
  },
  mollie: {
    label: 'Mollie',
    fields: [
      { keyName: 'MOLLIE_API_KEY', label: 'API key', secret: true },
      { keyName: 'MOLLIE_WEBHOOK_SECRET', label: 'Webhook secret', secret: true },
      { keyName: 'MOLLIE_PROFILE_ID', label: 'Profile ID', secret: false }
    ]
  }
};

function nowIso() {
  return new Date().toISOString();
}

function normalizeProvider(provider = '') {
  return String(provider || '').trim().toLowerCase();
}

function normalizeKeyName(keyName = '') {
  return String(keyName || '').trim();
}

function normalizeEnvironment(environment = DEFAULT_ENVIRONMENT) {
  return String(environment || DEFAULT_ENVIRONMENT).trim().toLowerCase() || DEFAULT_ENVIRONMENT;
}

function getProviderDefinition(provider = '') {
  return PROVIDER_DEFINITIONS[normalizeProvider(provider)] || null;
}

function isSupportedProviderKey(provider = '', keyName = '') {
  const definition = getProviderDefinition(provider);
  if (!definition) return false;
  return definition.fields.some((field) => field.keyName === normalizeKeyName(keyName));
}

function sha256Hex(value = '') {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

function deriveMasterKeyBuffer(masterKey = '') {
  const raw = String(masterKey || '').trim();
  if (!raw) return null;
  if (/^[a-f0-9]{64}$/i.test(raw)) {
    return Buffer.from(raw, 'hex');
  }
  return crypto.createHash('sha256').update(raw, 'utf8').digest();
}

function maskSecret(plain = '') {
  const value = String(plain || '');
  if (!value) return '';
  if (value.length <= 8) return `${value[0] || '*'}***${value[value.length - 1] || '*'}`;
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function createPlatformSecretsService({
  db,
  masterKey = '',
  env = process.env,
  now = nowIso,
  writeAudit = null
} = {}) {
  if (!db) {
    throw new Error('Platform secrets service requires a database handle.');
  }

  const masterKeyBuffer = deriveMasterKeyBuffer(masterKey);

  function isEnabled() {
    return Boolean(masterKeyBuffer);
  }

  function assertWritable() {
    if (!masterKeyBuffer) {
      const error = new Error('Secrets management is disabled because PLATFORM_SECRETS_MASTER_KEY is missing.');
      error.statusCode = 503;
      error.code = 'PLATFORM_SECRETS_DISABLED';
      throw error;
    }
  }

  function encryptSecret(plain) {
    assertWritable();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', masterKeyBuffer, iv);
    const encryptedValue = Buffer.concat([
      cipher.update(String(plain || ''), 'utf8'),
      cipher.final()
    ]);
    const authTag = cipher.getAuthTag();
    return {
      encryptedValue: encryptedValue.toString('base64'),
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex')
    };
  }

  function decryptSecret(record = null) {
    if (!record || !record.encrypted_value || !record.iv || !record.auth_tag) {
      return '';
    }
    if (!masterKeyBuffer) {
      const error = new Error('Secrets management is disabled because PLATFORM_SECRETS_MASTER_KEY is missing.');
      error.statusCode = 503;
      error.code = 'PLATFORM_SECRETS_DISABLED';
      throw error;
    }
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      masterKeyBuffer,
      Buffer.from(String(record.iv), 'hex')
    );
    decipher.setAuthTag(Buffer.from(String(record.auth_tag), 'hex'));
    const plain = Buffer.concat([
      decipher.update(Buffer.from(String(record.encrypted_value), 'base64')),
      decipher.final()
    ]);
    return plain.toString('utf8');
  }

  function serializeRecord(record = null, { source = 'db' } = {}) {
    if (!record) return null;
    return {
      id: record.id,
      provider: record.provider,
      keyName: record.key_name,
      maskedValue: record.masked_value || '',
      enabled: Number(record.enabled || 0) === 1,
      environment: record.environment || DEFAULT_ENVIRONMENT,
      lastTestStatus: record.last_test_status || '',
      lastTestMessage: record.last_test_message || '',
      lastTestedAt: record.last_tested_at || null,
      rotatedAt: record.rotated_at || null,
      updatedAt: record.updated_at || null,
      updatedBy: record.updated_by || null,
      source
    };
  }

  function buildEnvFallbackRecord(provider, keyName, environment) {
    const plain = String(env[keyName] || '').trim();
    if (!plain) return null;
    return {
      id: `env_${normalizeProvider(provider)}_${keyName}_${environment}`,
      provider: normalizeProvider(provider),
      key_name: keyName,
      masked_value: maskSecret(plain),
      enabled: 1,
      environment,
      last_test_status: '',
      last_test_message: '',
      last_tested_at: null,
      rotated_at: null,
      updated_at: null,
      updated_by: null
    };
  }

  function getFieldDefinition(provider, keyName) {
    const definition = getProviderDefinition(provider);
    if (!definition) return null;
    return definition.fields.find((field) => field.keyName === normalizeKeyName(keyName)) || null;
  }

  function getSecret(provider, keyName, environment = DEFAULT_ENVIRONMENT) {
    const normalizedProvider = normalizeProvider(provider);
    const normalizedKeyName = normalizeKeyName(keyName);
    const normalizedEnvironment = normalizeEnvironment(environment);
    return db.prepare(`
      SELECT *
      FROM platform_secrets
      WHERE provider = ?
        AND key_name = ?
        AND environment = ?
      LIMIT 1
    `).get(normalizedProvider, normalizedKeyName, normalizedEnvironment) || null;
  }

  function getSecretValue(provider, keyName, environment = DEFAULT_ENVIRONMENT) {
    const record = getSecret(provider, keyName, environment);
    if (record && Number(record.enabled || 0) === 1) {
      return decryptSecret(record);
    }
    return String(env[normalizeKeyName(keyName)] || '').trim();
  }

  function getSecretSource(provider, keyName, environment = DEFAULT_ENVIRONMENT) {
    const record = getSecret(provider, keyName, environment);
    if (record && Number(record.enabled || 0) === 1) {
      return 'db';
    }
    const fallbackKey = normalizeKeyName(keyName);
    return String(env[fallbackKey] || '').trim() ? 'env' : 'unset';
  }

  function getRuntimeSecret(provider, keyName, envName, environment = DEFAULT_ENVIRONMENT) {
    const fallbackKey = normalizeKeyName(envName || keyName);
    const record = getSecret(provider, keyName, environment);
    if (record && Number(record.enabled || 0) === 1) {
      return decryptSecret(record);
    }
    return String(env[fallbackKey] || '').trim();
  }

  function resolveGoogleCredentialSource(environment = DEFAULT_ENVIRONMENT) {
    const normalizedEnvironment = normalizeEnvironment(environment);
    const jsonDbRecord = getSecret('google', 'GOOGLE_TRANSLATE_KEY_JSON', normalizedEnvironment);
    const jsonDbValue = jsonDbRecord && masterKeyBuffer && Number(jsonDbRecord.enabled || 0) === 1
      ? decryptSecret(jsonDbRecord)
      : '';
    if (String(jsonDbValue || '').trim()) {
      return {
        source: 'db_json',
        keyName: 'GOOGLE_TRANSLATE_KEY_JSON',
        value: String(jsonDbValue || '').trim(),
        ignorePath: true
      };
    }
    const jsonEnvValue = String(env.GOOGLE_TRANSLATE_KEY_JSON || '').trim();
    if (jsonEnvValue) {
      return {
        source: 'env_json',
        keyName: 'GOOGLE_TRANSLATE_KEY_JSON',
        value: jsonEnvValue,
        ignorePath: true
      };
    }
    const pathDbRecord = getSecret('google', 'GOOGLE_APPLICATION_CREDENTIALS', normalizedEnvironment);
    const pathDbValue = pathDbRecord && masterKeyBuffer && Number(pathDbRecord.enabled || 0) === 1
      ? decryptSecret(pathDbRecord)
      : '';
    if (String(pathDbValue || '').trim()) {
      return {
        source: 'db_path',
        keyName: 'GOOGLE_APPLICATION_CREDENTIALS',
        value: String(pathDbValue || '').trim(),
        ignorePath: false
      };
    }
    const pathEnvValue = String(env.GOOGLE_APPLICATION_CREDENTIALS || '').trim();
    if (pathEnvValue) {
      return {
        source: 'env_path',
        keyName: 'GOOGLE_APPLICATION_CREDENTIALS',
        value: pathEnvValue,
        ignorePath: false
      };
    }
    return {
      source: 'unset',
      keyName: '',
      value: '',
      ignorePath: false
    };
  }

  function serializeGoogleEffectiveSource(environment = DEFAULT_ENVIRONMENT) {
    const resolved = resolveGoogleCredentialSource(environment);
    return {
      source: resolved.source,
      keyName: resolved.keyName,
      ignorePath: Boolean(resolved.ignorePath)
    };
  }

  function auditSecretAction({
    provider,
    keyName,
    environment = DEFAULT_ENVIRONMENT,
    action,
    actor = {},
    ipAddress = '',
    userAgent = ''
  }) {
    const row = {
      id: `sec_audit_${crypto.randomBytes(12).toString('hex')}`,
      provider: normalizeProvider(provider),
      keyName: normalizeKeyName(keyName),
      environment: normalizeEnvironment(environment),
      action: String(action || '').trim(),
      actorUserId: actor?.id || actor?.userId || null,
      ipAddress: String(ipAddress || '').trim() || null,
      userAgent: String(userAgent || '').trim() || null,
      createdAt: now()
    };
    db.prepare(`
      INSERT INTO platform_secret_audit (
        id, provider, key_name, environment, action,
        actor_user_id, ip_address, user_agent, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      row.id,
      row.provider,
      row.keyName,
      row.environment,
      row.action,
      row.actorUserId,
      row.ipAddress,
      row.userAgent,
      row.createdAt
    );
    if (typeof writeAudit === 'function') {
      writeAudit(`platform_secret.${row.action}`, {
        target: `${row.provider}:${row.keyName}`,
        meta: { provider: row.provider, keyName: row.keyName, environment: row.environment },
        user: actor
      });
    }
  }

  function upsertSecret({
    provider,
    keyName,
    value,
    environment = DEFAULT_ENVIRONMENT,
    actor = {},
    enabled = true,
    ipAddress = '',
    userAgent = '',
    rotatedAt = null
  }) {
    assertWritable();
    const normalizedProvider = normalizeProvider(provider);
    const normalizedKeyName = normalizeKeyName(keyName);
    const normalizedEnvironment = normalizeEnvironment(environment);
    if (!isSupportedProviderKey(normalizedProvider, normalizedKeyName)) {
      const error = new Error('Unsupported provider key.');
      error.statusCode = 400;
      throw error;
    }
    const plain = String(value ?? '').trim();
    if (!plain) {
      const error = new Error('Secret value is required.');
      error.statusCode = 400;
      throw error;
    }
    const existing = getSecret(normalizedProvider, normalizedKeyName, normalizedEnvironment);
    const encrypted = encryptSecret(plain);
    const recordId = existing?.id || `sec_${crypto.randomBytes(12).toString('hex')}`;
    const timestamp = now();
    db.prepare(`
      INSERT INTO platform_secrets (
        id, provider, key_name, encrypted_value, iv, auth_tag,
        value_hash, masked_value, enabled, environment,
        rotated_at, updated_by, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(provider, key_name, environment) DO UPDATE SET
        encrypted_value = excluded.encrypted_value,
        iv = excluded.iv,
        auth_tag = excluded.auth_tag,
        value_hash = excluded.value_hash,
        masked_value = excluded.masked_value,
        enabled = excluded.enabled,
        rotated_at = COALESCE(excluded.rotated_at, platform_secrets.rotated_at),
        updated_by = excluded.updated_by,
        updated_at = excluded.updated_at
    `).run(
      recordId,
      normalizedProvider,
      normalizedKeyName,
      encrypted.encryptedValue,
      encrypted.iv,
      encrypted.authTag,
      sha256Hex(plain),
      maskSecret(plain),
      enabled ? 1 : 0,
      normalizedEnvironment,
      rotatedAt || null,
      actor?.id || actor?.userId || null,
      existing?.created_at || timestamp,
      timestamp
    );
    auditSecretAction({
      provider: normalizedProvider,
      keyName: normalizedKeyName,
      environment: normalizedEnvironment,
      action: existing ? 'updated' : 'created',
      actor,
      ipAddress,
      userAgent
    });
    return serializeRecord(getSecret(normalizedProvider, normalizedKeyName, normalizedEnvironment));
  }

  function rotateSecret({
    provider,
    keyName,
    value,
    environment = DEFAULT_ENVIRONMENT,
    actor = {},
    ipAddress = '',
    userAgent = ''
  }) {
    const record = upsertSecret({
      provider,
      keyName,
      value,
      environment,
      actor,
      ipAddress,
      userAgent,
      rotatedAt: now()
    });
    auditSecretAction({
      provider,
      keyName,
      environment,
      action: 'rotated',
      actor,
      ipAddress,
      userAgent
    });
    return record;
  }

  function deleteSecret({
    provider,
    keyName,
    environment = DEFAULT_ENVIRONMENT,
    actor = {},
    ipAddress = '',
    userAgent = ''
  }) {
    assertWritable();
    const normalizedProvider = normalizeProvider(provider);
    const normalizedKeyName = normalizeKeyName(keyName);
    const normalizedEnvironment = normalizeEnvironment(environment);
    const result = db.prepare(`
      DELETE FROM platform_secrets
      WHERE provider = ?
        AND key_name = ?
        AND environment = ?
    `).run(normalizedProvider, normalizedKeyName, normalizedEnvironment);
    auditSecretAction({
      provider: normalizedProvider,
      keyName: normalizedKeyName,
      environment: normalizedEnvironment,
      action: 'deleted',
      actor,
      ipAddress,
      userAgent
    });
    const fallbackValue = String(env[normalizedKeyName] || '').trim();
    const response = { ok: true, deleted: Number(result.changes || 0) };
    if (fallbackValue) {
      response.envFallbackExists = true;
      response.message = `Deleted DB value. Env fallback still exists in .env. Remove ${normalizedKeyName} from .env to fully clear it.`;
    }
    return response;
  }

  function listSecrets({ environment = DEFAULT_ENVIRONMENT } = {}) {
    const normalizedEnvironment = normalizeEnvironment(environment);
    const rows = db.prepare(`
      SELECT *
      FROM platform_secrets
      WHERE environment = ?
      ORDER BY provider ASC, key_name ASC
    `).all(normalizedEnvironment);
    const rowsByKey = new Map(
      rows.map((row) => [`${row.provider}:${row.key_name}:${row.environment}`, row])
    );
    return Object.entries(PROVIDER_DEFINITIONS).map(([provider, definition]) => {
      let secrets = definition.fields.map((field) => {
        const key = `${provider}:${field.keyName}:${normalizedEnvironment}`;
        const row = rowsByKey.get(key);
        if (row) {
          const displayValue = !field.secret && masterKeyBuffer && Number(row.enabled || 0) === 1
            ? decryptSecret(row)
            : '';
          return {
            ...serializeRecord(row, { source: 'db' }),
            label: field.label,
            secret: field.secret,
            displayValue
          };
        }
        const envRecord = buildEnvFallbackRecord(provider, field.keyName, normalizedEnvironment);
        const envPlain = String(env[field.keyName] || '').trim();
        return {
          provider,
          keyName: field.keyName,
          label: field.label,
          secret: field.secret,
          maskedValue: envRecord?.masked_value || '',
          displayValue: !field.secret ? envPlain : '',
          enabled: Boolean(envRecord),
          environment: normalizedEnvironment,
          lastTestStatus: '',
          lastTestMessage: '',
          lastTestedAt: null,
          rotatedAt: null,
            updatedAt: null,
            updatedBy: null,
            source: envRecord ? 'env' : 'unset'
          };
      });
      if (provider === 'google') {
        const effectiveSource = resolveGoogleCredentialSource(normalizedEnvironment);
        const hasJsonOverride = effectiveSource.source === 'db_json' || effectiveSource.source === 'env_json';
        secrets = secrets.map((entry) => {
          if (entry.keyName !== 'GOOGLE_APPLICATION_CREDENTIALS') return entry;
          const next = { ...entry, deprecated: true };
          if (hasJsonOverride) {
            next.enabled = false;
            next.source = 'ignored';
            next.maskedValue = 'Ignored because JSON key is configured';
            next.displayValue = '';
            next.ignored = true;
            next.ignoredReason = 'Ignored because JSON key is configured';
            next.hideInput = true;
          }
          return next;
        });
      }
      return {
        provider,
        label: definition.label,
        environment: normalizedEnvironment,
        enabled: secrets.some((entry) => entry.enabled),
        effectiveSource: provider === 'google' ? serializeGoogleEffectiveSource(normalizedEnvironment) : null,
        secrets
      };
    });
  }

  function normalizeBooleanSetting(value) {
    const normalized = String(value || '').trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'yes';
  }

  async function testProvider(provider, environment = DEFAULT_ENVIRONMENT, {
    actor = {},
    ipAddress = '',
    userAgent = ''
  } = {}) {
    const normalizedProvider = normalizeProvider(provider);
    const normalizedEnvironment = normalizeEnvironment(environment);
    const startedAt = now();
    let status = 'ok';
    let message = 'Configuration looks valid.';

    if (!getProviderDefinition(normalizedProvider)) {
      const error = new Error('Unknown provider');
      error.statusCode = 404;
      throw error;
    }

    try {
      if (normalizedProvider === 'openai') {
        const apiKey = getRuntimeSecret('openai', 'OPENAI_API_KEY', 'OPENAI_API_KEY', normalizedEnvironment);
        const url = getRuntimeSecret('openai', 'OPENAI_REALTIME_URL', 'OPENAI_REALTIME_URL', normalizedEnvironment);
        const model = getRuntimeSecret('openai', 'OPENAI_REALTIME_MODEL', 'OPENAI_REALTIME_MODEL', normalizedEnvironment);
        if (!apiKey) throw new Error('OPENAI_API_KEY is missing.');
        if (!url) throw new Error('OPENAI_REALTIME_URL is missing.');
        if (!model) throw new Error('OPENAI_REALTIME_MODEL is missing.');
      } else if (normalizedProvider === 'twilio') {
        const sid = getRuntimeSecret('twilio', 'TWILIO_ACCOUNT_SID', 'TWILIO_ACCOUNT_SID', normalizedEnvironment);
        const token = getRuntimeSecret('twilio', 'TWILIO_AUTH_TOKEN', 'TWILIO_AUTH_TOKEN', normalizedEnvironment);
        const phone = getRuntimeSecret('twilio', 'TWILIO_PHONE_NUMBER', 'TWILIO_PHONE_NUMBER', normalizedEnvironment);
        if (!sid || !token || !phone) throw new Error('Twilio credentials are incomplete.');
        twilio(sid, token);
      } else if (normalizedProvider === 'email') {
        const host = getRuntimeSecret('email', 'IONOS_SMTP_HOST', 'IONOS_SMTP_HOST', normalizedEnvironment);
        const port = Number(getRuntimeSecret('email', 'IONOS_SMTP_PORT', 'IONOS_SMTP_PORT', normalizedEnvironment) || 0);
        const secure = normalizeBooleanSetting(getRuntimeSecret('email', 'IONOS_SMTP_SECURE', 'IONOS_SMTP_SECURE', normalizedEnvironment));
        const user = getRuntimeSecret('email', 'IONOS_SMTP_USER', 'IONOS_SMTP_USER', normalizedEnvironment);
        const pass = getRuntimeSecret('email', 'IONOS_SMTP_PASS', 'IONOS_SMTP_PASS', normalizedEnvironment);
        if (!host || !port || !user || !pass) throw new Error('SMTP configuration is incomplete.');
        const transporter = nodemailer.createTransport({ host, port, secure, auth: { user, pass } });
        await transporter.verify();
      } else if (normalizedProvider === 'google') {
        const effective = resolveGoogleCredentialSource(normalizedEnvironment);
        if (!effective.value) throw new Error('Google Translate credentials are missing.');
        if (effective.source === 'db_json' || effective.source === 'env_json') {
          const parsed = JSON.parse(effective.value);
          if (!parsed.client_email || !parsed.private_key) {
            throw new Error('Google Translate key JSON is incomplete.');
          }
          new Translate({ credentials: parsed });
          message = `Google Translate credentials valid (${effective.source}).`;
        } else if (effective.source === 'db_path' || effective.source === 'env_path') {
          new Translate({ keyFilename: effective.value });
          message = `Google Translate credentials valid (${effective.source}).`;
        }
      } else if (normalizedProvider === 'jitsi') {
        const domain = getRuntimeSecret('jitsi', 'JITSI_DOMAIN', 'JITSI_DOMAIN', normalizedEnvironment);
        const appId = getRuntimeSecret('jitsi', 'JITSI_APP_ID', 'JITSI_APP_ID', normalizedEnvironment);
        const appSecret = getRuntimeSecret('jitsi', 'JITSI_APP_SECRET', 'JITSI_APP_SECRET', normalizedEnvironment);
        const audience = getRuntimeSecret('jitsi', 'JITSI_JWT_AUDIENCE', 'JITSI_JWT_AUDIENCE', normalizedEnvironment) || 'jitsi';
        const subject = getRuntimeSecret('jitsi', 'JITSI_JWT_SUBJECT', 'JITSI_JWT_SUBJECT', normalizedEnvironment) || domain;
        const issuer = getRuntimeSecret('jitsi', 'JITSI_JWT_ISSUER', 'JITSI_JWT_ISSUER', normalizedEnvironment) || appId;
        if (!domain) throw new Error('JITSI_DOMAIN is missing.');
        if (appId && appSecret) {
          jwt.sign({ aud: audience, iss: issuer, sub: subject, room: '*' }, appSecret);
        }
      } else if (normalizedProvider === 'storage') {
        const adapter = getRuntimeSecret('storage', 'FILE_STORAGE_ADAPTER', 'FILE_STORAGE_ADAPTER', normalizedEnvironment);
        if (!adapter) throw new Error('FILE_STORAGE_ADAPTER is missing.');
        if (['s3', 's3_compatible', 'r2'].includes(String(adapter).trim().toLowerCase())) {
          createS3CompatibleStorageAdapter({
            endpoint: getRuntimeSecret('storage', 'S3_ENDPOINT', 'S3_ENDPOINT', normalizedEnvironment),
            region: getRuntimeSecret('storage', 'S3_REGION', 'S3_REGION', normalizedEnvironment),
            bucket: getRuntimeSecret('storage', 'S3_BUCKET', 'S3_BUCKET', normalizedEnvironment),
            accessKeyId: getRuntimeSecret('storage', 'S3_ACCESS_KEY_ID', 'S3_ACCESS_KEY_ID', normalizedEnvironment),
            secretAccessKey: getRuntimeSecret('storage', 'S3_SECRET_ACCESS_KEY', 'S3_SECRET_ACCESS_KEY', normalizedEnvironment),
            providerName: adapter
          });
        }
      } else if (normalizedProvider === 'analytics') {
        const analyticsKey =
          getRuntimeSecret('analytics', 'ANALYTICS_API_KEY', 'ANALYTICS_API_KEY', normalizedEnvironment) ||
          getRuntimeSecret('analytics', 'ANALYTICS_WRITE_KEY', 'ANALYTICS_WRITE_KEY', normalizedEnvironment);
        if (!analyticsKey) throw new Error('Analytics credentials are missing.');
      }
    } catch (error) {
      status = 'failed';
      message = error?.message || 'Provider test failed.';
    }

    db.prepare(`
      UPDATE platform_secrets
      SET last_test_status = ?,
          last_test_message = ?,
          last_tested_at = ?,
          updated_at = updated_at
      WHERE provider = ?
        AND environment = ?
    `).run(status, message, startedAt, normalizedProvider, normalizedEnvironment);

    auditSecretAction({
      provider: normalizedProvider,
      keyName: '*',
      environment: normalizedEnvironment,
      action: 'tested',
      actor,
      ipAddress,
      userAgent
    });

    return {
      provider: normalizedProvider,
      environment: normalizedEnvironment,
      status,
      message,
      testedAt: startedAt,
      effectiveSource: normalizedProvider === 'google'
        ? resolveGoogleCredentialSource(normalizedEnvironment).source
        : null
    };
  }

  return {
    isEnabled,
    encryptSecret,
    decryptSecret,
    maskSecret,
    upsertSecret,
    listSecrets,
    getSecret,
    getSecretValue,
    getSecretSource,
    getRuntimeSecret,
    resolveGoogleCredentialSource,
    serializeGoogleEffectiveSource,
    rotateSecret,
    deleteSecret,
    testProvider,
    providerDefinitions: PROVIDER_DEFINITIONS
  };
}

module.exports = {
  createPlatformSecretsService,
  PROVIDER_DEFINITIONS,
  maskSecret
};
