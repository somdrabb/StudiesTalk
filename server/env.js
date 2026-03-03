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
  return v && String(v).trim() ? v : fallback;
}

function bool(name, fallback = false) {
  const v = process.env[name];
  if (v === undefined) return fallback;
  const normalized = String(v).toLowerCase();
  return normalized === 'true' || normalized === '1';
}

function int(name, fallback) {
  const v = process.env[name];
  if (v === undefined) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

const NODE_ENV = optional('NODE_ENV', 'development');
const IS_PROD = NODE_ENV === 'production';
const PORT = int('PORT', 3000);

const FALLBACK_JWT_ACCESS_SECRET =
  optional('JWT_ACCESS_SECRET', '') || optional('JWT_SECRET', '');
const JWT_ACCESS_SECRET =
  FALLBACK_JWT_ACCESS_SECRET ||
  (!IS_PROD ? 'dev_access_secret_change_me' : required('JWT_ACCESS_SECRET'));
const JWT_REFRESH_SECRET = IS_PROD
  ? required('JWT_REFRESH_SECRET')
  : optional('JWT_REFRESH_SECRET', 'dev_refresh_secret_change_me');

const BASE_URL = IS_PROD
  ? required('BASE_URL')
  : optional('BASE_URL', `http://localhost:${PORT}`);

const COOKIE_SECURE = bool('COOKIE_SECURE', IS_PROD);

const EMAIL_FROM = optional('EMAIL_FROM', 'WorkNest <no-reply@localhost>');
const SMTP_HOST = optional('SMTP_HOST', '');
const SMTP_PORT = int('SMTP_PORT', 587);
const SMTP_SECURE = bool('SMTP_SECURE', false);
const SMTP_USER = optional('SMTP_USER', '');
const SMTP_PASS = optional('SMTP_PASS', '');

const TWILIO_ACCOUNT_SID = optional('TWILIO_ACCOUNT_SID', '');
const TWILIO_AUTH_TOKEN = optional('TWILIO_AUTH_TOKEN', '');
const TWILIO_PHONE_NUMBER = optional('TWILIO_PHONE_NUMBER', '');
const TWILIO_VERIFY_SERVICE_SID = optional('TWILIO_VERIFY_SERVICE_SID', '');
const MOBILE_OTP_PROXY_URL = optional('MOBILE_OTP_PROXY_URL', '');
const DB_PATH = optional('DB_PATH', 'worknest.db');
const UPLOADS_DIR = optional('UPLOADS_DIR', 'uploads');
const FFMPEG_MODE = optional('FFMPEG_MODE', 'auto').trim().toLowerCase();
const FFMPEG_PATH = optional('FFMPEG_PATH', '');
const FFMPEG_STRICT = bool('FFMPEG_STRICT', false);
const OPENAI_API_KEY = optional('OPENAI_API_KEY', '');
const OPENAI_REALTIME_MODEL = optional('OPENAI_REALTIME_MODEL', 'gpt-4o-mini');
const OPENAI_REALTIME_URL = optional(
  'OPENAI_REALTIME_URL',
  'https://api.openai.com/realtime/client_secrets'
);
const OPENAI_REALTIME_VOICE = optional('OPENAI_REALTIME_VOICE', 'alloy');
const AI_INPUT_TOKEN_RATE_EUR = optional('AI_INPUT_TOKEN_RATE_EUR', '0.000015');
const AI_OUTPUT_TOKEN_RATE_EUR = optional('AI_OUTPUT_TOKEN_RATE_EUR', '0.00002');
const AI_TIME_RATE_EUR_PER_SECOND = optional('AI_TIME_RATE_EUR_PER_SECOND', '0.000166');
const AI_IDLE_TIMEOUT_SECONDS = optional('AI_IDLE_TIMEOUT_SECONDS', '45');
const AI_CLEANUP_SWEEP_SECONDS = optional('AI_CLEANUP_SWEEP_SECONDS', '30');

module.exports = {
  NODE_ENV,
  IS_PROD,
  PORT,
  BASE_URL,
  JWT_ACCESS_SECRET,
  JWT_REFRESH_SECRET,
  COOKIE_SECURE,
  EMAIL_FROM,
  SMTP_HOST,
  SMTP_PORT,
  SMTP_SECURE,
  SMTP_USER,
  SMTP_PASS,
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_PHONE_NUMBER,
  TWILIO_VERIFY_SERVICE_SID,
  MOBILE_OTP_PROXY_URL,
  DB_PATH,
  UPLOADS_DIR,
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
  AI_CLEANUP_SWEEP_SECONDS
};
