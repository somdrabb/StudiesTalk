'use strict';

require('dotenv').config();

function required(name) {
  const v = process.env[name];
  if (!v || !String(v).trim()) {
    throw new Error(`[ENV] Missing required env var: ${name}`);
  }
  return v;
}

function optional(name, fallback = '') {
  const v = process.env[name];
  return v && String(v).trim() ? String(v).trim() : fallback;
}

function optionalAny(names = [], fallback = '') {
  for (const name of names) {
    const value = optional(name, '');
    if (value) return value;
  }
  return fallback;
}

function bool(name, fallback = false) {
  const v = process.env[name];
  if (v === undefined) return fallback;
  const normalized = String(v).trim().toLowerCase();
  return normalized === 'true' || normalized === '1';
}

function int(name, fallback) {
  const v = process.env[name];
  if (v === undefined || String(v).trim() === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function hasNonEmpty(value) {
  return Boolean(value && String(value).trim());
}

function isLikelyDefaultSecret(value = '') {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return true;
  return normalized.includes('change_me') || normalized.includes('replace_with') || normalized.includes('dev_');
}

function isValidUrl(value = '') {
  try {
    const parsed = new URL(String(value || '').trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch (_err) {
    return false;
  }
}

function getUrlProtocol(value = '') {
  try {
    return new URL(String(value || '').trim()).protocol;
  } catch (_err) {
    return '';
  }
}

function isAbsolutePath(value = '') {
  const normalized = String(value || '').trim();
  if (!normalized) return false;
  return normalized.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(normalized);
}

const VALID_NODE_ENVS = new Set(['development', 'test', 'production']);
const VALID_DB_ENGINES = new Set(['sqlite', 'postgres', 'postgresql', 'pg']);

const NODE_ENV = optional('NODE_ENV', 'development').toLowerCase();
const IS_PROD = NODE_ENV === 'production';
const PORT = int('PORT', 3000);

const APP_BASE_URL = optionalAny(['APP_BASE_URL', 'BASE_URL'], !IS_PROD ? `http://localhost:${PORT}` : '');
const BASE_URL = APP_BASE_URL;

const FALLBACK_JWT_ACCESS_SECRET = optionalAny(['JWT_ACCESS_SECRET', 'JWT_SECRET'], '');
const JWT_ACCESS_SECRET =
  FALLBACK_JWT_ACCESS_SECRET ||
  (!IS_PROD ? 'dev_access_secret_change_me' : required('JWT_ACCESS_SECRET'));
const JWT_REFRESH_SECRET = IS_PROD
  ? required('JWT_REFRESH_SECRET')
  : optional('JWT_REFRESH_SECRET', 'dev_refresh_secret_change_me');

const COOKIE_SECURE = bool('COOKIE_SECURE', IS_PROD);

const EMAIL_PROVIDER = optional('EMAIL_PROVIDER', '');
const EMAIL_FROM = optional('EMAIL_FROM', 'StudiesTalk <no-reply@localhost>');
const EMAIL_FROM_EMAIL = optional('EMAIL_FROM_EMAIL', '');
const EMAIL_FROM_NAME = optional('EMAIL_FROM_NAME', 'StudiesTalk');

const SMTP_HOST = optional('SMTP_HOST', '');
const SMTP_PORT = int('SMTP_PORT', 587);
const SMTP_SECURE = bool('SMTP_SECURE', false);
const SMTP_USER = optional('SMTP_USER', '');
const SMTP_PASS = optional('SMTP_PASS', '');

const GMAIL_SMTP_USER = optional('GMAIL_SMTP_USER', '');
const GMAIL_SMTP_PASS = optional('GMAIL_SMTP_PASS', '');

const IONOS_SMTP_HOST = optional('IONOS_SMTP_HOST', '');
const IONOS_SMTP_PORT = int('IONOS_SMTP_PORT', 465);
const IONOS_SMTP_SECURE = bool('IONOS_SMTP_SECURE', true);
const IONOS_SMTP_USER = optional('IONOS_SMTP_USER', '');
const IONOS_SMTP_PASS = optional('IONOS_SMTP_PASS', '');
const IONOS_SMTP_FROM_NAME = optional('IONOS_SMTP_FROM_NAME', '');

const IONOS_IMAP_HOST = optional('IONOS_IMAP_HOST', '');
const IONOS_IMAP_PORT = int('IONOS_IMAP_PORT', 993);
const IONOS_IMAP_SECURE = bool('IONOS_IMAP_SECURE', true);
const IONOS_IMAP_USER = optional('IONOS_IMAP_USER', '');
const IONOS_IMAP_PASS = optional('IONOS_IMAP_PASS', '');

const TWILIO_ACCOUNT_SID = optional('TWILIO_ACCOUNT_SID', '');
const TWILIO_AUTH_TOKEN = optional('TWILIO_AUTH_TOKEN', '');
const TWILIO_PHONE_NUMBER = optional('TWILIO_PHONE_NUMBER', '');
const TWILIO_VERIFY_SERVICE_SID = optional('TWILIO_VERIFY_SERVICE_SID', '');
const MOBILE_OTP_PROXY_URL = optional('MOBILE_OTP_PROXY_URL', '');

const DB_ENGINE = optional('DB_ENGINE', 'sqlite').trim().toLowerCase();
const BILLING_DB_ENGINE = optional('BILLING_DB_ENGINE', 'sqlite').trim().toLowerCase();
const TASKS_DB_ENGINE = optional('TASKS_DB_ENGINE', 'sqlite').trim().toLowerCase();
const ATTENDANCE_DB_ENGINE = optional('ATTENDANCE_DB_ENGINE', 'sqlite').trim().toLowerCase();
const CHANNELS_DB_ENGINE = optional('CHANNELS_DB_ENGINE', 'sqlite').trim().toLowerCase();
const MESSAGES_DB_ENGINE = optional('MESSAGES_DB_ENGINE', 'sqlite').trim().toLowerCase();

const DB_PATH = optional('DB_PATH', 'storage/studiestalk.db');
const DATABASE_URL = optional('DATABASE_URL', '');
const PGHOST = optional('PGHOST', 'localhost');
const PGPORT = int('PGPORT', 5432);
const PGDATABASE = optional('PGDATABASE', 'studiestalk');
const PGUSER = optional('PGUSER', 'studiestalk_user');
const PGPASSWORD = optional('PGPASSWORD', '');
const PGSSL = bool('PGSSL', false);

const DB_BACKUP_DIR = optional('DB_BACKUP_DIR', 'backup');
const DB_BACKUP_INTERVAL_HOURS = int('DB_BACKUP_INTERVAL_HOURS', 24);
const DB_BACKUP_ON_START = bool('DB_BACKUP_ON_START', false);

const UPLOADS_DIR = optional('UPLOADS_DIR', 'uploads');
const UPLOAD_MAX_FILE_BYTES = int('UPLOAD_MAX_FILE_BYTES', 25 * 1024 * 1024);
const FILE_STORAGE_ADAPTER = optional('FILE_STORAGE_ADAPTER', 'local').trim().toLowerCase();
const FILE_STORAGE_LOCAL_ROOT = optional('FILE_STORAGE_LOCAL_ROOT', '');
const S3_ENDPOINT = optional('S3_ENDPOINT', '');
const S3_REGION = optional('S3_REGION', '');
const S3_BUCKET = optional('S3_BUCKET', '');
const S3_ACCESS_KEY_ID = optional('S3_ACCESS_KEY_ID', '');
const S3_SECRET_ACCESS_KEY = optional('S3_SECRET_ACCESS_KEY', '');
const S3_FORCE_PATH_STYLE = bool('S3_FORCE_PATH_STYLE', false);
const FILE_STORAGE_ENCRYPTION_ENABLED = bool('FILE_STORAGE_ENCRYPTION_ENABLED', false);
const FILE_STORAGE_ENCRYPTION_KEY = optional('FILE_STORAGE_ENCRYPTION_KEY', '');
const FILE_STORAGE_ENCRYPTION_KEY_ID = optional('FILE_STORAGE_ENCRYPTION_KEY_ID', 'file-key-v1');
const FILE_UPLOAD_IMAGE_MAX_BYTES = int('FILE_UPLOAD_IMAGE_MAX_BYTES', 10 * 1024 * 1024);
const FILE_UPLOAD_DOCUMENT_MAX_BYTES = int('FILE_UPLOAD_DOCUMENT_MAX_BYTES', 25 * 1024 * 1024);
const FILE_UPLOAD_AUDIO_MAX_BYTES = int('FILE_UPLOAD_AUDIO_MAX_BYTES', 50 * 1024 * 1024);
const FILE_UPLOAD_VIDEO_MAX_BYTES = int('FILE_UPLOAD_VIDEO_MAX_BYTES', 200 * 1024 * 1024);

const FFMPEG_MODE = optional('FFMPEG_MODE', 'auto').trim().toLowerCase();
const FFMPEG_PATH = optional('FFMPEG_PATH', '');
const FFMPEG_STRICT = bool('FFMPEG_STRICT', false);

const OPENAI_API_KEY = optional('OPENAI_API_KEY', '');
const OPENAI_REALTIME_MODEL = optional('OPENAI_REALTIME_MODEL', 'gpt-4o-mini-realtime-preview');
const OPENAI_REALTIME_URL = optional(
  'OPENAI_REALTIME_URL',
  'https://api.openai.com/v1/realtime/client_secrets'
);
const OPENAI_REALTIME_VOICE = optional('OPENAI_REALTIME_VOICE', 'alloy');
const AI_INPUT_TOKEN_RATE_EUR = optional('AI_INPUT_TOKEN_RATE_EUR', '0.000015');
const AI_OUTPUT_TOKEN_RATE_EUR = optional('AI_OUTPUT_TOKEN_RATE_EUR', '0.00002');
const AI_TIME_RATE_EUR_PER_SECOND = optional('AI_TIME_RATE_EUR_PER_SECOND', '0.000166');
const AI_IDLE_TIMEOUT_SECONDS = optional('AI_IDLE_TIMEOUT_SECONDS', '45');
const AI_CLEANUP_SWEEP_SECONDS = optional('AI_CLEANUP_SWEEP_SECONDS', '30');
const JITSI_DOMAIN = optional('JITSI_DOMAIN', '');
const JITSI_APP_ID = optional('JITSI_APP_ID', '');
const JITSI_APP_SECRET = optional('JITSI_APP_SECRET', '');
const JITSI_JWT_AUDIENCE = optionalAny(['JITSI_JWT_AUDIENCE', 'JITSI_AUDIENCE'], 'jitsi');
const JITSI_JWT_ISSUER = optional('JITSI_JWT_ISSUER', '');
const JITSI_JWT_SUBJECT = optional('JITSI_JWT_SUBJECT', '');

const validationWarnings = [];
const validationErrors = [];

function addWarning(message) {
  validationWarnings.push(String(message));
}

function addError(message) {
  validationErrors.push(String(message));
}

if (!VALID_NODE_ENVS.has(NODE_ENV)) {
  addWarning(`NODE_ENV=${NODE_ENV} is unusual. Expected one of development, test, production.`);
}

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  addError('PORT must be an integer between 1 and 65535.');
}

if (!hasNonEmpty(APP_BASE_URL)) {
  if (IS_PROD) addError('APP_BASE_URL (or BASE_URL) is required in production.');
} else if (!isValidUrl(APP_BASE_URL)) {
  if (IS_PROD) addError('APP_BASE_URL (or BASE_URL) must be a valid http/https URL.');
  else addWarning('APP_BASE_URL (or BASE_URL) is not a valid http/https URL. Development fallback may be safer.');
} else if (IS_PROD && getUrlProtocol(APP_BASE_URL) !== 'https:') {
  addError('APP_BASE_URL (or BASE_URL) must use https in production.');
}

if (!hasNonEmpty(JWT_ACCESS_SECRET) || isLikelyDefaultSecret(JWT_ACCESS_SECRET) || String(JWT_ACCESS_SECRET).length < 16) {
  if (IS_PROD) addError('JWT_ACCESS_SECRET must be set to a strong non-default value in production.');
  else addWarning('JWT_ACCESS_SECRET is using a development/default value.');
}

if (!hasNonEmpty(JWT_REFRESH_SECRET) || isLikelyDefaultSecret(JWT_REFRESH_SECRET) || String(JWT_REFRESH_SECRET).length < 16) {
  if (IS_PROD) addError('JWT_REFRESH_SECRET must be set to a strong non-default value in production.');
  else addWarning('JWT_REFRESH_SECRET is using a development/default value.');
}

if (!COOKIE_SECURE && IS_PROD) {
  addError('COOKIE_SECURE must be true in production.');
}

for (const [name, value] of Object.entries({
  DB_ENGINE,
  BILLING_DB_ENGINE,
  TASKS_DB_ENGINE,
  ATTENDANCE_DB_ENGINE,
  CHANNELS_DB_ENGINE,
  MESSAGES_DB_ENGINE
})) {
  if (!VALID_DB_ENGINES.has(value)) {
    addWarning(`${name}=${value} is not a recognized engine. Expected sqlite or postgres.`);
  }
}

if (DB_ENGINE === 'sqlite') {
  if (!hasNonEmpty(DB_PATH)) {
    addError('DB_PATH is required when DB_ENGINE=sqlite.');
  }
  if (IS_PROD) {
    addError('DB_ENGINE=sqlite is not allowed in production. Use PostgreSQL in production.');
    if (!isAbsolutePath(DB_PATH)) {
      addWarning('DB_PATH should be an absolute path on persistent disk in production.');
    }
  }
} else if (DB_ENGINE === 'postgres' || DB_ENGINE === 'postgresql' || DB_ENGINE === 'pg') {
  const hasPgConnectionString = hasNonEmpty(DATABASE_URL);
  const hasDiscretePgConfig = hasNonEmpty(PGHOST) && Number.isInteger(PGPORT) && hasNonEmpty(PGDATABASE) && hasNonEmpty(PGUSER);
  if (IS_PROD && !hasPgConnectionString) {
    addError('DATABASE_URL is required in production when DB_ENGINE=postgres.');
  }
  if (!hasPgConnectionString && !hasDiscretePgConfig) {
    if (IS_PROD) addError('PostgreSQL runtime requires DATABASE_URL or PGHOST/PGPORT/PGDATABASE/PGUSER.');
    else addWarning('PostgreSQL runtime is selected without a complete DATABASE_URL or PG* configuration.');
  }
  if (!hasPgConnectionString && !hasNonEmpty(PGPASSWORD)) {
    addWarning('PostgreSQL runtime is configured without PGPASSWORD. This is valid only if the server trusts local auth or envless auth.');
  }
}

if (!Number.isFinite(DB_BACKUP_INTERVAL_HOURS) || DB_BACKUP_INTERVAL_HOURS < 0) {
  addWarning('DB_BACKUP_INTERVAL_HOURS should be 0 or a positive number of hours.');
}

if (!hasNonEmpty(DB_BACKUP_DIR)) {
  addWarning('DB_BACKUP_DIR is empty. Falling back to backup/.');
} else if (IS_PROD && !isAbsolutePath(DB_BACKUP_DIR)) {
  addWarning('DB_BACKUP_DIR should be an absolute path on persistent disk in production.');
}

if (!Number.isFinite(UPLOAD_MAX_FILE_BYTES) || UPLOAD_MAX_FILE_BYTES < 1_000_000) {
  addWarning('UPLOAD_MAX_FILE_BYTES is invalid or very low. A safe minimum is 1 MB; current default is 25 MB.');
}
if (!['local', 's3', 's3_compatible', 'r2'].includes(FILE_STORAGE_ADAPTER)) {
  addWarning('FILE_STORAGE_ADAPTER is not recognized. Expected local or s3-compatible placeholder.');
}
if (FILE_STORAGE_ADAPTER === 'local' && IS_PROD) {
  const managedRoot = FILE_STORAGE_LOCAL_ROOT || UPLOADS_DIR;
  addWarning('FILE_STORAGE_ADAPTER=local in production is acceptable only for a first-school demo on persistent disk. Move to S3/R2 before paid customer usage.');
  if (!isAbsolutePath(managedRoot)) {
    addWarning('Local file storage should use an absolute persistent path in production (FILE_STORAGE_LOCAL_ROOT or UPLOADS_DIR).');
  }
}
if (['s3', 's3_compatible', 'r2'].includes(FILE_STORAGE_ADAPTER)) {
  for (const [name, value] of Object.entries({
    S3_ENDPOINT,
    S3_REGION,
    S3_BUCKET,
    S3_ACCESS_KEY_ID,
    S3_SECRET_ACCESS_KEY
  })) {
    if (!hasNonEmpty(value)) {
      if (IS_PROD) addError(`${name} is required when FILE_STORAGE_ADAPTER=${FILE_STORAGE_ADAPTER}.`);
      else addWarning(`${name} should be set when FILE_STORAGE_ADAPTER=${FILE_STORAGE_ADAPTER}.`);
    }
  }
  if (hasNonEmpty(S3_ENDPOINT) && !isValidUrl(S3_ENDPOINT)) {
    if (IS_PROD) addError('S3_ENDPOINT must be a valid http/https URL.');
    else addWarning('S3_ENDPOINT should be a valid http/https URL.');
  } else if (IS_PROD && hasNonEmpty(S3_ENDPOINT) && getUrlProtocol(S3_ENDPOINT) !== 'https:') {
    addError('S3_ENDPOINT must use https in production.');
  }
}
if (FILE_STORAGE_ENCRYPTION_ENABLED) {
  if (!/^[a-fA-F0-9]{64}$/.test(FILE_STORAGE_ENCRYPTION_KEY)) {
    if (IS_PROD) addError('FILE_STORAGE_ENCRYPTION_KEY must be a 64-character hex key when file encryption is enabled.');
    else addWarning('FILE_STORAGE_ENCRYPTION_KEY should be a 64-character hex key when file encryption is enabled.');
  }
}
for (const [name, value] of Object.entries({
  FILE_UPLOAD_IMAGE_MAX_BYTES,
  FILE_UPLOAD_DOCUMENT_MAX_BYTES,
  FILE_UPLOAD_AUDIO_MAX_BYTES,
  FILE_UPLOAD_VIDEO_MAX_BYTES
})) {
  if (!Number.isFinite(value) || value < 1_000_000) {
    addWarning(`${name} should be set to at least 1 MB.`);
  }
}

const normalizedEmailProvider = EMAIL_PROVIDER.trim().toLowerCase();
if (normalizedEmailProvider && normalizedEmailProvider !== 'disabled') {
  const hasSenderIdentity = hasNonEmpty(EMAIL_FROM_EMAIL) || hasNonEmpty(IONOS_SMTP_USER);
  if (!hasSenderIdentity) {
    addWarning('Email sending is enabled but EMAIL_FROM_EMAIL or IONOS_SMTP_USER is missing.');
  }

  if (normalizedEmailProvider === 'gmail') {
    if (!hasNonEmpty(GMAIL_SMTP_USER) || !hasNonEmpty(GMAIL_SMTP_PASS)) {
      addWarning('EMAIL_PROVIDER=gmail but GMAIL_SMTP_USER/GMAIL_SMTP_PASS is incomplete.');
    }
  }

  if (normalizedEmailProvider === 'ionos' || normalizedEmailProvider === 'smtp') {
    if (!hasNonEmpty(IONOS_SMTP_HOST) || !hasNonEmpty(IONOS_SMTP_USER) || !hasNonEmpty(IONOS_SMTP_PASS)) {
      addWarning('EMAIL_PROVIDER=smtp/ionos but IONOS SMTP settings are incomplete.');
    }
  }
}

if (hasNonEmpty(OPENAI_REALTIME_URL) && !hasNonEmpty(OPENAI_API_KEY)) {
  addWarning('OPENAI_REALTIME_URL is set but OPENAI_API_KEY is missing. AI realtime sessions will fail.');
}

const twilioFieldsPresent = [TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER].filter(hasNonEmpty).length;
if (twilioFieldsPresent > 0 && twilioFieldsPresent < 3) {
  addWarning('Twilio SMS config is partial. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER together.');
}
if (hasNonEmpty(TWILIO_VERIFY_SERVICE_SID) && !hasNonEmpty(TWILIO_ACCOUNT_SID)) {
  addWarning('TWILIO_VERIFY_SERVICE_SID is set without core Twilio credentials.');
}
if (hasNonEmpty(MOBILE_OTP_PROXY_URL) && !isValidUrl(MOBILE_OTP_PROXY_URL)) {
  addWarning('MOBILE_OTP_PROXY_URL is not a valid http/https URL.');
}

const jitsiJwtRequested =
  hasNonEmpty(JITSI_APP_ID) ||
  hasNonEmpty(JITSI_APP_SECRET) ||
  hasNonEmpty(JITSI_JWT_ISSUER) ||
  hasNonEmpty(JITSI_JWT_SUBJECT) ||
  Boolean(process.env.JITSI_JWT_AUDIENCE) ||
  Boolean(process.env.JITSI_AUDIENCE);
const jitsiPublicMeetJwtWarning =
  'meet.jit.si cannot be used for StudiesTalk JWT moderator auto-host. Use 8x8.vc JaaS or self-hosted Jitsi.';

if (String(JITSI_DOMAIN || '').trim() === 'meet.jit.si' && jitsiJwtRequested) {
  if (IS_PROD) addError(jitsiPublicMeetJwtWarning);
  else addWarning(jitsiPublicMeetJwtWarning);
}

const ENV_VALIDATION = {
  warnings: validationWarnings.slice(),
  errors: validationErrors.slice(),
  hasWarnings: validationWarnings.length > 0,
  hasErrors: validationErrors.length > 0,
  summary: {
    nodeEnv: NODE_ENV,
    isProd: IS_PROD,
    appBaseUrlConfigured: hasNonEmpty(APP_BASE_URL),
    cookieSecure: COOKIE_SECURE,
    dbEngine: DB_ENGINE,
    sqlitePathConfigured: hasNonEmpty(DB_PATH),
    postgresConfigured: hasNonEmpty(DATABASE_URL) || (hasNonEmpty(PGHOST) && hasNonEmpty(PGDATABASE) && hasNonEmpty(PGUSER)),
    emailProvider: normalizedEmailProvider || 'disabled',
    smtpConfigured:
      (normalizedEmailProvider === 'gmail' && hasNonEmpty(GMAIL_SMTP_USER) && hasNonEmpty(GMAIL_SMTP_PASS)) ||
      ((normalizedEmailProvider === 'smtp' || normalizedEmailProvider === 'ionos') &&
        hasNonEmpty(IONOS_SMTP_HOST) &&
        hasNonEmpty(IONOS_SMTP_USER) &&
        hasNonEmpty(IONOS_SMTP_PASS)),
    uploadsConfigured: hasNonEmpty(UPLOADS_DIR) && Number.isFinite(UPLOAD_MAX_FILE_BYTES) && UPLOAD_MAX_FILE_BYTES > 0,
    fileStorageAdapter: FILE_STORAGE_ADAPTER,
    s3Configured:
      hasNonEmpty(S3_ENDPOINT) &&
      hasNonEmpty(S3_REGION) &&
      hasNonEmpty(S3_BUCKET) &&
      hasNonEmpty(S3_ACCESS_KEY_ID) &&
      hasNonEmpty(S3_SECRET_ACCESS_KEY),
    fileStorageEncryptionEnabled: FILE_STORAGE_ENCRYPTION_ENABLED,
    openAiConfigured: hasNonEmpty(OPENAI_API_KEY),
    twilioConfigured: hasNonEmpty(TWILIO_ACCOUNT_SID) && hasNonEmpty(TWILIO_AUTH_TOKEN) && hasNonEmpty(TWILIO_PHONE_NUMBER)
    ,
    jitsiDomain: JITSI_DOMAIN || null,
    jitsiJwtConfigured: hasNonEmpty(JITSI_APP_ID) && hasNonEmpty(JITSI_APP_SECRET),
    jitsiJwtAudience: JITSI_JWT_AUDIENCE || null,
    jitsiJwtIssuer: JITSI_JWT_ISSUER || null,
    jitsiJwtSubject: JITSI_JWT_SUBJECT || null
  }
};

if (ENV_VALIDATION.hasErrors) {
  throw new Error(`[ENV] Production configuration invalid:\n- ${ENV_VALIDATION.errors.join('\n- ')}`);
}

module.exports = {
  NODE_ENV,
  IS_PROD,
  PORT,
  APP_BASE_URL,
  BASE_URL,
  JWT_ACCESS_SECRET,
  JWT_REFRESH_SECRET,
  COOKIE_SECURE,
  EMAIL_PROVIDER,
  EMAIL_FROM,
  EMAIL_FROM_EMAIL,
  EMAIL_FROM_NAME,
  SMTP_HOST,
  SMTP_PORT,
  SMTP_SECURE,
  SMTP_USER,
  SMTP_PASS,
  GMAIL_SMTP_USER,
  GMAIL_SMTP_PASS,
  IONOS_SMTP_HOST,
  IONOS_SMTP_PORT,
  IONOS_SMTP_SECURE,
  IONOS_SMTP_USER,
  IONOS_SMTP_PASS,
  IONOS_SMTP_FROM_NAME,
  IONOS_IMAP_HOST,
  IONOS_IMAP_PORT,
  IONOS_IMAP_SECURE,
  IONOS_IMAP_USER,
  IONOS_IMAP_PASS,
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_PHONE_NUMBER,
  TWILIO_VERIFY_SERVICE_SID,
  MOBILE_OTP_PROXY_URL,
  DB_ENGINE,
  BILLING_DB_ENGINE,
  TASKS_DB_ENGINE,
  ATTENDANCE_DB_ENGINE,
  CHANNELS_DB_ENGINE,
  MESSAGES_DB_ENGINE,
  DB_PATH,
  DATABASE_URL,
  PGHOST,
  PGPORT,
  PGDATABASE,
  PGUSER,
  PGPASSWORD,
  PGSSL,
  DB_BACKUP_DIR,
  DB_BACKUP_INTERVAL_HOURS,
  DB_BACKUP_ON_START,
  UPLOADS_DIR,
  UPLOAD_MAX_FILE_BYTES,
  FILE_STORAGE_ADAPTER,
  FILE_STORAGE_LOCAL_ROOT,
  S3_ENDPOINT,
  S3_REGION,
  S3_BUCKET,
  S3_ACCESS_KEY_ID,
  S3_SECRET_ACCESS_KEY,
  S3_FORCE_PATH_STYLE,
  FILE_STORAGE_ENCRYPTION_ENABLED,
  FILE_STORAGE_ENCRYPTION_KEY,
  FILE_STORAGE_ENCRYPTION_KEY_ID,
  FILE_UPLOAD_IMAGE_MAX_BYTES,
  FILE_UPLOAD_DOCUMENT_MAX_BYTES,
  FILE_UPLOAD_AUDIO_MAX_BYTES,
  FILE_UPLOAD_VIDEO_MAX_BYTES,
  FFMPEG_MODE,
  FFMPEG_PATH,
  FFMPEG_STRICT,
  OPENAI_API_KEY,
  OPENAI_REALTIME_MODEL,
  OPENAI_REALTIME_URL,
  OPENAI_REALTIME_VOICE,
  AI_INPUT_TOKEN_RATE_EUR,
  AI_OUTPUT_TOKEN_RATE_EUR,
  AI_TIME_RATE_EUR_PER_SECOND,
  AI_IDLE_TIMEOUT_SECONDS,
  AI_CLEANUP_SWEEP_SECONDS,
  JITSI_DOMAIN,
  JITSI_APP_ID,
  JITSI_APP_SECRET,
  JITSI_JWT_AUDIENCE,
  JITSI_JWT_ISSUER,
  JITSI_JWT_SUBJECT,
  ENV_VALIDATION
};
