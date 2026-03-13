'use strict';

require('dotenv').config();
const ENV = require('./server/env');

const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const crypto = require('crypto');
const { spawn } = require('child_process');
const morgan = require('morgan');
const Database = require('better-sqlite3');
const { sendPlatformEmail, providerName } = require('./emailSender');
const bcrypt = require('bcryptjs');
const twilio = require('twilio');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const cors = require('cors');
const nodemailer = require('nodemailer');
const { getFfmpegCommand, isStrict } = require('./server/ffmpeg');
const liveRouter = require('./server/routes/live');
const liveScheduleRouter = require('./server/routes/liveSchedule');
const inboundEmailService = require('./server/services/inboundEmail.service');

const FFMPEG_CMD = (() => {
  try {
    const cmd = getFfmpegCommand(process.env);
    if (cmd) {
      console.log('[ffmpeg] Using:', cmd);
    } else {
      console.warn('[ffmpeg] Not available. Media conversion will be skipped.');
    }
    return cmd;
  } catch (e) {
    if (isStrict(process.env)) throw e;
    console.warn(String(e.message || e));
    return null;
  }
})();

const DB_PATH = String(ENV.DB_PATH || path.join(__dirname, 'worknest.db')).trim();
const UPLOADS_DIR = String(ENV.UPLOADS_DIR || path.join(__dirname, 'uploads')).trim();
const ATTACHMENTS_DIR = path.join(process.cwd(), 'storage', 'email_attachments');

const slideClientsBySession = new Map(); // sessionId -> Set(res)

function broadcastSse(sessionId, eventName, payload) {
  const set = slideClientsBySession.get(String(sessionId));
  if (!set) return;

  const msg = `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const res of set) {
    res.write(msg);
  }
}

// Ensure storage folders exist
try {
  const dbDir = path.dirname(DB_PATH);
  if (dbDir && dbDir !== '.' && !fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
} catch (e) {
  console.warn('[Storage] Could not ensure DB directory exists:', e.message);
}

try {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
} catch (e) {
  console.warn('[Storage] Could not ensure uploads directory exists:', e.message);
}
try {
  if (!fs.existsSync(ATTACHMENTS_DIR)) {
    fs.mkdirSync(ATTACHMENTS_DIR, { recursive: true });
  }
} catch (e) {
  console.warn('[Storage] Could not ensure attachments directory exists:', e.message);
}
// ---- Google Cloud Translate (Basic v2) ----
let googleTranslateClient = null;
try {
  const { Translate } = require('@google-cloud/translate').v2;

  const explicitKeyFilename =
    (process.env.GOOGLE_TRANSLATE_KEYFILE || '').trim() ||
    (process.env.GOOGLE_APPLICATION_CREDENTIALS || '').trim();
  const defaultKeyPath = path.join(__dirname, 'server', 'secrets', 'gcp-translate-key.json');
  const fallbackKeyFilename =
    !explicitKeyFilename && fs.existsSync(defaultKeyPath) ? defaultKeyPath : '';

  if (explicitKeyFilename || fallbackKeyFilename) {
    const selectedKeyFilename = explicitKeyFilename || fallbackKeyFilename;
    console.log('[Translate] Using key file:', selectedKeyFilename);
    googleTranslateClient = new Translate({ keyFilename: selectedKeyFilename });
  } else {
    console.log('[Translate] Using Application Default Credentials');
    googleTranslateClient = new Translate();
  }
} catch (e) {
  console.warn('[Translate] Google Translate not available:', e.message);
  googleTranslateClient = null;
}

const twilioEnabled =
  Boolean(ENV.TWILIO_ACCOUNT_SID && ENV.TWILIO_AUTH_TOKEN && ENV.TWILIO_PHONE_NUMBER);
const twilioClient = twilioEnabled
  ? twilio(ENV.TWILIO_ACCOUNT_SID, ENV.TWILIO_AUTH_TOKEN)
  : null;
if (!twilioEnabled) {
  console.warn('[Twilio] Missing credentials or phone number; SMS OTP disabled.');
}
const twilioVerifyServiceSid = String(ENV.TWILIO_VERIFY_SERVICE_SID || '').trim();
const MOBILE_OTP_PROXY_URL = String(ENV.MOBILE_OTP_PROXY_URL || '').trim();
const MOBILE_OTP_ENABLED = Boolean((twilioClient && twilioVerifyServiceSid) || MOBILE_OTP_PROXY_URL);

async function callMobileOtpProxy(path, payload) {
  if (!MOBILE_OTP_PROXY_URL) {
    throw new Error('Twilio credentials are not configured.');
  }
  const base = MOBILE_OTP_PROXY_URL.replace(/\/$/, '');
  const url = `${base}${path}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {})
  });
  let data = null;
  try {
    data = await response.json();
  } catch (_err) {
    data = null;
  }
  if (!response.ok) {
    const message = data?.error || `Proxy request failed with ${response.status}`;
    throw new Error(message);
  }
  return data;
}

const app = express();
app.set('trust proxy', 1);
app.use(cookieParser());
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
  })
);
const allowedOrigins = [
  'http://localhost:3000',
  'https://app.yourschool.com'
];
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true
  })
);
if (ENV.IS_PROD) {
  app.use((req, res, next) => {
    if ((req.headers['x-forwarded-proto'] || '').toLowerCase() !== 'https') {
      return res.redirect(`https://${req.headers.host}${req.url}`);
    }
    return next();
  });
}
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again later.' }
});
const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again later.' }
});
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false
});
const PORT = ENV.PORT;
const WS_UPLOADS_DIR = path.join(UPLOADS_DIR, 'workspaces');
const UPLOAD_DIR = UPLOADS_DIR;

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function uploadsPath(...parts) {
  return path.join(UPLOADS_DIR, ...parts.map((p) => String(p)));
}

function workspaceUploadsPath(workspaceId, ...parts) {
  return path.join(WS_UPLOADS_DIR, String(workspaceId), ...parts.map((p) => String(p)));
}

  ensureDir(UPLOADS_DIR);
  ensureDir(WS_UPLOADS_DIR);

  // open / create SQLite DB
  const db = new Database(DB_PATH);
  inboundEmailService.cleanupOrphanAttachments(db).catch((err) => {
    console.warn('[InboundEmail] Cleanup failed on startup', err?.message || err);
  });
  setInterval(() => {
    inboundEmailService.cleanupOrphanAttachments(db).catch((err) => {
      console.warn('[InboundEmail] Cleanup failed during interval', err?.message || err);
    });
  }, 4 * 60 * 60 * 1000);

const INLINE_PREVIEW_MIMES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp'
]);

function normalizeMimeType(value) {
  return String(value || '')
    .split(';')[0]
    .trim()
    .toLowerCase();
}

function parseAttachmentsForRow(row) {
  if (!row) return [];
  try {
    const parsed = JSON.parse(row.attachments_json || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn('[InboundEmail] Invalid attachments JSON', err?.message || err);
    return [];
  }
}

function parseEmailAddress(fromHeader = '') {
  const hint = String(fromHeader || '').trim();
  if (!hint) return '';
  const match = hint.match(/<([^>]+)>/);
  const raw = match ? match[1] : hint;
  return raw.replace(/^"+|"+$/g, '').trim();
}

function buildQuotedText(original = {}) {
  const dt = original.received_at
    ? new Date(original.received_at).toLocaleString()
    : '';
  const from = String(original.sender || '').trim();
  const subj = String(original.subject || '').trim() || '(no subject)';
  const body = String(original.text_body || '').trim();
  const quoted = body
    ? body
        .split('\n')
        .map((line) => `> ${line}`)
        .join('\n')
    : '';
  return `\n\nOn ${dt || 'Unknown Date'}, ${from || 'Sender'} wrote:\nSubject: ${subj}\n\n${quoted}\n`;
}

const transporter = nodemailer.createTransport({
  host: process.env.IONOS_SMTP_HOST,
  port: Number(process.env.IONOS_SMTP_PORT),
  secure: String(process.env.IONOS_SMTP_SECURE) === 'true',
  auth: {
    user: process.env.IONOS_SMTP_USER,
    pass: process.env.IONOS_SMTP_PASS
  }
});

transporter.verify((err) => {
  if (err) {
    console.error('[SMTP] verify failed:', err?.message || err);
  } else {
    console.log('[SMTP] verify OK');
  }
});

function findInboxAttachment(emailId, attachmentId) {
  if (!emailId || !attachmentId) return null;
  const row = db
    .prepare('SELECT attachments_json FROM inbound_emails WHERE id = ?')
    .get(emailId);
  if (!row) return null;
  const attachments = parseAttachmentsForRow(row);
  const attachment = attachments.find((item) => String(item.id || '') === attachmentId);
  if (!attachment) return null;
  return { row, attachment };
}

function resolveAttachmentFilePath(storedName) {
  if (!storedName) return null;
  const resolvedDir = path.resolve(ATTACHMENTS_DIR);
  const filePath = path.join(resolvedDir, storedName);
  const relativePath = path.relative(resolvedDir, filePath);
  if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    return null;
  }
  return filePath;
}

function streamAttachmentResponse(res, filePath, attachment, disposition = 'attachment') {
  if (!filePath || !attachment) return false;
  const filename = String(attachment.filename || 'attachment').replace(/["\\]/g, '');
  res.setHeader('Content-Type', attachment.contentType || 'application/octet-stream');
  res.setHeader('Content-Disposition', `${disposition}; filename="${filename}"`);
  const stream = fs.createReadStream(filePath);
  stream.on('error', (streamErr) => {
    console.error('[InboundEmail] Attachment stream failed', streamErr?.message || streamErr);
    if (!res.headersSent) {
      res.status(500).send('Unable to serve attachment');
    }
  });
  stream.pipe(res);
  return true;
}

// WAL is best for concurrent reads/writes
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');
function safeAlter(sql) {
  try {
    db.exec(sql);
  } catch (_err) {
    // ignore if column already exists
  }
}

function hasColumn(table, column) {
  try {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all();
    return cols.some((c) => String(c.name || "") === column);
  } catch (_err) {
    return false;
  }
}

function secId(prefix = 'sec') {
  return `${prefix}_${crypto.randomBytes(16).toString('hex')}`;
}

function logSecurityEvent({
  workspaceId = null,
  actorUserId = null,
  targetUserId = null,
  type,
  severity = 'info',
  ip = null,
  userAgent = null,
  payload = null
}) {
  try {
    db.prepare(`
      INSERT INTO security_events (id, created_at, workspace_id, actor_user_id, target_user_id, type, severity, ip, user_agent, payload)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      secId('evt'),
      Date.now(),
      workspaceId,
      actorUserId,
      targetUserId,
      type,
      severity,
      ip,
      userAgent,
      payload ? JSON.stringify(payload) : null
    );
  } catch (e) {
    console.warn('logSecurityEvent failed', e);
  }
}

function logLoginAttempt({ identifier, success, userId = null, workspaceId = null, ip = null, userAgent = null }) {
  try {
    db.prepare(`
      INSERT INTO login_attempts (id, created_at, identifier, success, user_id, workspace_id, ip, user_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(secId('la'), Date.now(), String(identifier || ''), success ? 1 : 0, userId, workspaceId, ip, userAgent);
  } catch (e) {
    console.warn('logLoginAttempt failed', e);
  }
}

function isBlockedIp(ip) {
  if (!ip) return false;
  const row = db.prepare(`SELECT ip FROM ip_blocklist WHERE ip = ?`).get(ip);
  return !!row;
}
db.exec(`
CREATE TABLE IF NOT EXISTS register_otps (
  email TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
`);
db.exec(`
CREATE TABLE IF NOT EXISTS registration_sessions (
  session_id TEXT PRIMARY KEY,
  step TEXT,
  email TEXT,
  phone TEXT,
  email_verified INTEGER DEFAULT 0,
  mobile_verified INTEGER DEFAULT 0,
  otp_sent_at INTEGER,
  created_at INTEGER NOT NULL,
  last_updated INTEGER NOT NULL
);
`);
db.exec(`
CREATE TABLE IF NOT EXISTS registration_review_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  payload TEXT,
  status TEXT DEFAULT 'pending',
  created_at INTEGER NOT NULL
);
`);
safeAlter(`ALTER TABLE registration_review_requests ADD COLUMN reviewed_by TEXT;`);
safeAlter(`ALTER TABLE registration_review_requests ADD COLUMN reviewed_at INTEGER;`);
safeAlter(`ALTER TABLE registration_review_requests ADD COLUMN review_note TEXT;`);
safeAlter(`ALTER TABLE users ADD COLUMN must_change_password INTEGER DEFAULT 0;`);
safeAlter(`ALTER TABLE users ADD COLUMN password_changed_at INTEGER;`);
safeAlter(`ALTER TABLE users ADD COLUMN temp_login_started_at INTEGER;`);
// ---------- ADMIN PORTAL TABLES ----------
db.exec(`
CREATE TABLE IF NOT EXISTS workspace_billing (
  workspace_id TEXT PRIMARY KEY,
  plan TEXT DEFAULT 'free',
  status TEXT DEFAULT 'active',
  currency TEXT DEFAULT 'EUR',
  monthly_price_cents INTEGER DEFAULT 0,
  billing_email TEXT,
  updated_at INTEGER NOT NULL
);
`);

db.exec(`
CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency TEXT DEFAULT 'EUR',
  description TEXT,
  status TEXT DEFAULT 'open', -- open|paid|void
  due_date TEXT,
  created_at INTEGER NOT NULL,
  paid_at INTEGER
);
`);

db.exec(`
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency TEXT DEFAULT 'EUR',
  provider TEXT DEFAULT 'manual', -- manual|stripe|paypal
  provider_ref TEXT,
  created_at INTEGER NOT NULL
);
`);

db.exec(`
CREATE TABLE IF NOT EXISTS workspace_settings_admin (
  workspace_id TEXT PRIMARY KEY,
  settings_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
`);

db.exec(`
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER,
  replaced_by TEXT,
  ip TEXT,
  user_agent TEXT
);
`);

safeAlter(`ALTER TABLE refresh_tokens ADD COLUMN created_at INTEGER NOT NULL DEFAULT 0;`);
try {
  db.prepare(
    `UPDATE refresh_tokens SET created_at = issued_at WHERE (created_at IS NULL OR created_at = 0) AND issued_at IS NOT NULL`
  ).run();
} catch (_err) {
  // ignore when issued_at is not available yet
}

db.exec(`
CREATE INDEX IF NOT EXISTS idx_refresh_user ON refresh_tokens(user_id);
`);
db.exec(`
CREATE INDEX IF NOT EXISTS idx_refresh_hash ON refresh_tokens(token_hash);
`);

db.exec(`
CREATE TABLE IF NOT EXISTS revoked_access_tokens (
  jti TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  revoked_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
`);

db.exec(`
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id TEXT,
  actor TEXT,
  action TEXT,
  target TEXT,
  payload_json TEXT,
  created_at INTEGER NOT NULL
);
`);

db.exec(`
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  at INTEGER NOT NULL,
  user_id TEXT,
  role TEXT,
  workspace_id TEXT,
  action TEXT NOT NULL,
  target TEXT,
  meta_json TEXT,
  ip TEXT,
  user_agent TEXT
);
`);

db.exec(`
CREATE INDEX IF NOT EXISTS idx_audit_at ON audit_logs(at);
`);

db.exec(`
CREATE INDEX IF NOT EXISTS idx_audit_workspace ON audit_logs(workspace_id);
`);

// =========================
// TASK CHANNELS (Aufgaben)
// =========================
db.exec(`
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,

  title TEXT NOT NULL,
  description TEXT,

  status TEXT NOT NULL DEFAULT 'open', -- open | doing | done
  priority TEXT NOT NULL DEFAULT 'normal', -- low | normal | high | urgent

  due_at INTEGER,         -- ms timestamp (optional)
  completed_at INTEGER,   -- ms timestamp (when done)

  created_by TEXT NOT NULL,
  assigned_to TEXT,       -- optional user id

  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
`);

db.exec(`
CREATE INDEX IF NOT EXISTS idx_tasks_workspace_channel ON tasks(workspace_id, channel_id);
`);
db.exec(`
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(workspace_id, channel_id, status);
`);
db.exec(`
CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(workspace_id, channel_id, due_at);
`);

db.exec(`
CREATE TABLE IF NOT EXISTS task_comments (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
`);

db.exec(`
CREATE INDEX IF NOT EXISTS idx_task_comments_task ON task_comments(task_id, created_at);
`);

db.exec(`
CREATE TABLE IF NOT EXISTS task_reactions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  target_type TEXT NOT NULL, -- task | comment
  target_id TEXT NOT NULL,
  emoji TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(target_type, target_id, emoji, user_id)
);
`);

db.exec(`
CREATE INDEX IF NOT EXISTS idx_task_reactions_target ON task_reactions(target_type, target_id);
`);
// ===== Registration invite links (student/teacher) =====
const BASE_URL = String(ENV.BASE_URL || '').trim();
const REG_LINK_EXPIRY_HOURS = Number(process.env.REG_LINK_EXPIRY_HOURS || 24);
const PASSWORD_RESET_EXPIRY_HOURS = Number(process.env.PASSWORD_RESET_EXPIRY_HOURS || 6);

function getBaseUrl(port) {
  if (BASE_URL) return BASE_URL;
  const fallbackPort = typeof port === 'number' ? port : ENV.PORT;
  return `http://localhost:${fallbackPort}`;
}

function nowMs() {
  return Date.now();
}

function makeInviteToken() {
  return crypto.randomBytes(24).toString('hex');
}

function makeResetToken() {
  return crypto.randomBytes(24).toString('hex');
}

function safeJsonParse(text, fallback) {
  try {
    return JSON.parse(text);
  } catch (err) {
    return fallback;
  }
}

const JWT_ACCESS_SECRET = ENV.JWT_ACCESS_SECRET;
const JWT_REFRESH_SECRET = ENV.JWT_REFRESH_SECRET;

const ACCESS_EXPIRES = process.env.JWT_ACCESS_EXPIRES || '15m';
const REFRESH_EXPIRES = process.env.JWT_REFRESH_EXPIRES || '30d';
const COOKIE_SECURE = ENV.COOKIE_SECURE;

function getAccessTokenFromRequest(req) {
  const header = String(req.headers?.authorization || '');
  if (header.startsWith('Bearer ')) {
    return header.slice(7).trim();
  }
  return req.cookies?.access_token || null;
}

function isAccessTokenRevoked(jti) {
  if (!jti) return true;
  const row = db
    .prepare('SELECT jti FROM revoked_access_tokens WHERE jti = ?')
    .get(jti);
  return Boolean(row);
}

function verifyAccessToken(token) {
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, JWT_ACCESS_SECRET);
    if (!decoded) return null;
    return {
      ...decoded,
      id: decoded.id || decoded.sub
    };
  } catch (_err) {
    return null;
  }
}

function requireAccessToken(req, res, next) {
  const token = getAccessTokenFromRequest(req);
  if (!token) return res.status(401).json({ error: 'Not authenticated' });

  const decoded = verifyAccessToken(token);
  if (!decoded) return res.status(401).json({ error: 'Token expired' });

  if (isAccessTokenRevoked(decoded.jti)) {
    return res.status(401).json({ error: 'Session revoked' });
  }

  req.auth = decoded;
  attachRequestContext(req);
  return next();
}

function buildRequestContext(req, user) {
  const resolvedUser = user || null;
  return {
    ip: req.ip || null,
    ua: req.get('user-agent') || '',
    at: Date.now(),
    userId: resolvedUser?.sub || resolvedUser?.id || null,
    role: resolvedUser?.role || null,
    workspaceId: resolvedUser?.workspaceId || resolvedUser?.workspace_id || null
  };
}

function attachRequestContext(req) {
  const user = req.auth || null;
  req.ctx = buildRequestContext(req, user);
}

function audit(action, req, { target = null, meta = null, workspaceId = null, user = null } = {}) {
  try {
    const ctxUser = user || req.auth || getAuthedUser(req);
    const ctx = user ? buildRequestContext(req, ctxUser) : req?.ctx || buildRequestContext(req, ctxUser);
    const userId = ctxUser?.sub || ctxUser?.id || ctx.userId;
    const role = ctxUser?.role || ctx.role;
    const workspace = workspaceId || ctxUser?.workspaceId || ctxUser?.workspace_id || ctx.workspaceId || null;
    db.prepare(`
      INSERT INTO audit_logs (id, at, user_id, role, workspace_id, action, target, meta_json, ip, user_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      crypto.randomUUID(),
      Date.now(),
      userId,
      role,
      workspace,
      action,
      target ? String(target) : null,
      meta ? JSON.stringify(meta) : null,
      ctx.ip,
      ctx.ua || ''
    );
  } catch (e) {
    console.warn('[audit] failed:', e?.message || e);
  }
}

function makeId(prefix = 't') {
  return `${prefix}_${crypto.randomBytes(16).toString('hex')}`;
}

function sha256(text) {
  return crypto.createHash('sha256').update(String(text)).digest('hex');
}

function signAccessToken(user) {
  const jti = makeId('at');
  const token = jwt.sign(
    {
      jti,
      sub: user.id,
      role: String(user.role || 'member').toLowerCase(),
      workspaceId: user.workspace_id || user.workspaceId || null,
      email: user.email || user.userId || null,
      name: user.name || `${user.first_name || ''} ${user.last_name || ''}`.trim() || null,
      superAdmin: String(user.role || '').toLowerCase() === 'super_admin',
    },
    JWT_ACCESS_SECRET,
    { expiresIn: ACCESS_EXPIRES }
  );
  return { token, jti };
}

function signRefreshToken(user) {
  const jti = makeId('rt');
  const token = jwt.sign(
    { jti, sub: user.id },
    JWT_REFRESH_SECRET,
    { expiresIn: REFRESH_EXPIRES }
  );
  return { token, jti };
}

function setAuthCookies(res, accessToken, refreshToken) {
  res.cookie('access_token', accessToken, {
    ...cookieOpts(),
    maxAge: 15 * 60 * 1000
  });

  res.cookie('refresh_token', refreshToken, {
    ...cookieOpts({ maxAge: 30 * 24 * 60 * 60 * 1000 }),
  });
}

function clearAuthCookies(res) {
  res.clearCookie('access_token', { path: '/' });
  res.clearCookie('refresh_token', { path: '/' });
}

function cookieOpts({ path = '/', maxAge } = {}) {
  const opts = {
    httpOnly: true,
    secure: ENV.COOKIE_SECURE,
    sameSite: 'lax',
    path
  };
  if (Number.isFinite(maxAge)) {
    opts.maxAge = maxAge;
  }
  return opts;
}

function ensureCsrfCookie(req, res) {
  const existing = req.cookies?.csrf_token;
  if (existing) return existing;

  const token = crypto.randomBytes(24).toString('hex');
  res.cookie('csrf_token', token, {
    httpOnly: false,
    secure: COOKIE_SECURE,
    sameSite: 'lax',
    path: '/',
  });
  return token;
}

function csrfRequired(req, res, next) {
  const method = String(req.method || '').toUpperCase();
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return next();
  if (req.path.startsWith('/api/auth/')) return next();

  const cookieToken = req.cookies?.csrf_token;
  const headerToken = req.headers['x-csrf-token'];

  if (!cookieToken || !headerToken || String(headerToken) !== String(cookieToken)) {
    return res.status(403).json({ error: 'CSRF blocked' });
  }
  next();
}

function authRequired(req, res, next) {
  return requireAccessToken(req, res, next);
}

const PERMS = {
  super_admin: ['*'],
  admin: [
    'workspace:read',
    'users:read',
    'users:write',
    'channels:read',
    'channels:write',
    'billing:read',
    'billing:write',
  ],
  school_admin: [
    'workspace:read',
    'workspace:write',
    'users:read',
    'users:write',
    'channels:read',
    'channels:write',
    'classes:read',
    'classes:write',
    'billing:read',
  ],
  teacher: ['channels:read', 'classes:read'],
  student: ['channels:read'],
  member: [],
};

function normalizeRoleName(role) {
  return String(role || 'member').trim().toLowerCase();
}

function hasPermission(role, perm) {
  const normalized = normalizeRoleName(role);
  const list = PERMS[normalized] || [];
  return list.includes('*') || list.includes(perm);
}

function requireRole(...allowed) {
  return (req, res, next) => {
    const role = normalizeRoleName(req.auth?.role);
    const allowList = allowed.map((r) => normalizeRoleName(r));
    const ok = allowList.includes(role) || !!req.auth?.superAdmin;
    if (!ok) return res.status(403).json({ error: 'Forbidden' });
    next();
  };
}

function requirePermission(perm) {
  return (req, res, next) => {
    const user = req.auth;
    if (!user) return res.status(401).json({ error: 'Not authenticated' });
    if (user.superAdmin) return next();
    if (!hasPermission(user.role, perm)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}

function requireWorkspaceAccess(getWorkspaceId) {
  return (req, res, next) => {
    const user = req.auth;
    if (!user) return res.status(401).json({ error: 'Not authenticated' });

    const workspaceId = getWorkspaceId(req);
    if (!workspaceId) return res.status(400).json({ error: 'workspaceId required' });

    if (user.superAdmin) return next();

    if (String(workspaceId) !== String(user.workspaceId)) {
      return res.status(403).json({ error: 'Workspace isolation: denied' });
    }

    next();
  };
}

function requireWorkspaceAccess(getWorkspaceId) {
  return (req, res, next) => {
    const role = String(req.auth?.role || '').toLowerCase();
    const isSuper = !!req.auth?.superAdmin || role === 'super_admin';
    const requestedWorkspaceId = getWorkspaceId(req);

    if (!requestedWorkspaceId) {
      return res.status(400).json({ error: 'workspaceId required' });
    }

    if (isSuper) {
      return next();
    }

    if (requestedWorkspaceId !== req.auth.workspaceId) {
      return res.status(403).json({ error: 'Workspace isolation: denied' });
    }

    next();
  };
}

function normalizeRegistrationEmail(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized.includes('@') ? normalized : '';
}

function isAdminUser(req) {
  const role = String(req.auth?.role || '').toLowerCase();
  return ['super_admin', 'admin', 'school_admin'].includes(role);
}

function requireAdmin(req, res, next) {
  if (!req.auth) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!isAdminUser(req)) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  return next();
}

const PLATFORM_SETTING_AI_DEFAULT_BUDGET_KEY = 'ai_default_monthly_cap_eur';

function getPlatformSetting(key, fallback = null) {
  if (!key) return fallback;
  const row = db
    .prepare('SELECT value FROM platform_settings WHERE key = ?')
    .get(String(key));
  if (!row) return fallback;
  return row.value;
}

function setPlatformSetting(key, value) {
  if (!key) return null;
  const now = Date.now();
  db.prepare(`
    INSERT INTO platform_settings (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at
  `).run(String(key), String(value), now);
  return { key: String(key), value: String(value), updated_at: now };
}

function getDefaultAiCapEur() {
  const raw = getPlatformSetting(PLATFORM_SETTING_AI_DEFAULT_BUDGET_KEY, '0');
  const v = Number(raw);
  return Number.isFinite(v) && v >= 0 ? v : 0;
}

function getWorkspaceAiCapEur(workspaceId) {
  const normalizedWorkspaceId = String(workspaceId || '').trim();
  if (!normalizedWorkspaceId) return getDefaultAiCapEur();
  const row = db
    .prepare('SELECT monthly_cap_eur FROM ai_budget_settings WHERE workspace_id = ?')
    .get(normalizedWorkspaceId);
  if (row && Number.isFinite(Number(row.monthly_cap_eur))) {
    return Math.max(0, Number(row.monthly_cap_eur));
  }
  return getDefaultAiCapEur();
}

function getWorkspaceAiUsedEurThisMonth(workspaceId) {
  const normalizedWorkspaceId = String(workspaceId || '').trim();
  if (!normalizedWorkspaceId) return 0;
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0));
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0));
  const row = db
    .prepare(`
      SELECT COALESCE(SUM(cost_eur), 0) AS used
      FROM ai_usage_ledger
      WHERE workspace_id = ?
        AND created_at >= ?
        AND created_at < ?
    `)
    .get(
      normalizedWorkspaceId,
      start.toISOString(),
      next.toISOString()
    );
  const used = Number(row?.used || 0);
  return Number.isFinite(used) && used >= 0 ? used : 0;
}

function getWorkspaceAiBudgetSummary(workspaceId) {
  const cap = getWorkspaceAiCapEur(workspaceId);
  const used = getWorkspaceAiUsedEurThisMonth(workspaceId);
  const left = Math.max(0, cap - used);
  const blocked = cap > 0 ? left <= 0 : true;
  return { cap_eur: cap, used_eur: used, left_eur: left, blocked };
}

function getAiBudgetSummary(workspaceId) {
  const settings = db
    .prepare('SELECT monthly_cap_eur, updated_at FROM ai_budget_settings WHERE workspace_id = ?')
    .get(workspaceId);
  const defaultCap = getDefaultAiCapEur();
  const summary = getWorkspaceAiBudgetSummary(workspaceId);
  return {
    workspace_id: workspaceId,
    monthly_cap_eur: summary.cap_eur,
    used_eur: summary.used_eur,
    left_eur: summary.left_eur,
    blocked: summary.blocked,
    updated_at: settings?.updated_at || null,
    default_monthly_cap_eur: defaultCap
  };
}

function recordAiUsage(workspaceId, userId, cost_eur, tokens_input = 0, tokens_output = 0) {
  const id = crypto.randomUUID();
  const created_at = new Date().toISOString();
  db.prepare(
    'INSERT INTO ai_usage_ledger (id, workspace_id, user_id, cost_eur, tokens_input, tokens_output, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(id, workspaceId, userId, cost_eur, tokens_input, tokens_output, created_at);
  return { id, workspace_id: workspaceId, user_id: userId, cost_eur, tokens_input, tokens_output, created_at };
}

function logAiUsage({ workspaceId, userId, costEur, tokensIn = null, tokensOut = null }) {
  db.prepare(`
    INSERT INTO ai_usage_ledger (id, workspace_id, user_id, cost_eur, tokens_input, tokens_output, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    secId('aiu'),
    String(workspaceId),
    String(userId),
    Number(costEur || 0),
    tokensIn == null ? null : Number(tokensIn),
    tokensOut == null ? null : Number(tokensOut),
    Date.now()
  );
}

function markConversationEnded(conversationId) {
  if (!conversationId) return;
  db.prepare(`
    UPDATE ai_conversations
    SET ended_at = ?
    WHERE id = ? AND ended_at IS NULL
  `).run(Date.now(), conversationId);
}

function getAuthWorkspaceId(req) {
  const val = req.auth?.workspaceId || req.auth?.workspace_id || null;
  return val != null ? String(val) : null;
}

function getAuthUserId(req) {
  const val = req.auth?.userId || req.auth?.user_id || req.auth?.id || req.auth?.sub || null;
  return val != null ? String(val) : null;
}

function getAuthRole(req) {
  return req.auth?.role || null;
}

function getAiTimeRate() {
  const rate = Number.parseFloat(ENV.AI_TIME_RATE_EUR_PER_SECOND || '0');
  return Number.isFinite(rate) && rate >= 0 ? rate : 0;
}

function computeRuntimeDelta(row, now = Date.now()) {
  const lastSeen = Number(row?.last_seen_at || row?.started_at || now);
  const deltaMs = Math.max(0, now - lastSeen);
  const deltaSec = Math.max(0, Math.min(60, Math.floor(deltaMs / 1000)));
  return { deltaSec, now };
}

function createAiRuntimeSessionRow(workspaceId, userId, conversationId = null) {
  const now = Date.now();
  const runtimeId = secId('airs');
  const normalizedConversationId = String(conversationId || '').trim() || null;
  db.prepare(`
    INSERT INTO ai_runtime_sessions (id, workspace_id, user_id, conversation_id, started_at, last_seen_at, seconds_accumulated, status)
    VALUES (?, ?, ?, ?, ?, ?, 0, 'active')
  `).run(runtimeId, workspaceId, userId, normalizedConversationId, now, now);
  return { id: runtimeId, started_at: now, conversation_id: normalizedConversationId };
}

function getActiveRuntimeSession(runtimeId, workspaceId, userId) {
  return db
    .prepare(
      `
        SELECT *
        FROM ai_runtime_sessions
        WHERE id = ? AND workspace_id = ? AND user_id = ? AND status = 'active'
      `
    )
    .get(runtimeId, workspaceId, userId);
}

function updateRuntimeSeconds(row, now = Date.now()) {
  const { deltaSec } = computeRuntimeDelta(row, now);
  const seconds = (Number(row?.seconds_accumulated) || 0) + deltaSec;
  db.prepare(`
    UPDATE ai_runtime_sessions
    SET last_seen_at = ?, seconds_accumulated = ?
    WHERE id = ?
  `).run(now, seconds, row.id);
  return { seconds, deltaSec };
}

function finalizeRuntimeSession({ runtimeId, reason }) {
  const row = db
    .prepare(`
      SELECT *
      FROM ai_runtime_sessions
      WHERE id = ? AND status = 'active'
    `)
    .get(runtimeId);
  if (!row) {
    return { ok: false, reason: 'not_found_or_already_ended' };
  }
  const now = Date.now();
  const deltaSec = Math.max(0, Math.min(60, Math.floor((now - row.last_seen_at) / 1000)));
  const seconds = (Number(row.seconds_accumulated) || 0) + deltaSec;
  const rate = getAiTimeRate();
  const costEur = Math.max(0, seconds * rate);
  db.prepare(`
    UPDATE ai_runtime_sessions
    SET last_seen_at = ?, seconds_accumulated = ?, ended_at = ?, status = 'ended', end_reason = ?
    WHERE id = ?
  `).run(now, seconds, now, String(reason || 'ended'), runtimeId);
  db.prepare(`
    INSERT INTO ai_usage_ledger (id, workspace_id, user_id, cost_eur, tokens_input, tokens_output, created_at)
    VALUES (?, ?, ?, ?, NULL, NULL, ?)
  `).run(secId('aiu'), row.workspace_id, row.user_id, costEur, now);
  if (row.conversation_id) {
    db.prepare(`
      UPDATE ai_conversations
      SET ended_at = COALESCE(ended_at, ?)
      WHERE id = ? AND workspace_id = ? AND user_id = ?
    `).run(now, row.conversation_id, row.workspace_id, row.user_id);
  }
  return { ok: true, seconds, cost_eur: costEur, conversation_id: row.conversation_id };
}

function getAiTokenRates() {
  const inputRate = Number.parseFloat(ENV.AI_INPUT_TOKEN_RATE_EUR) || 0;
  const outputRate = Number.parseFloat(ENV.AI_OUTPUT_TOKEN_RATE_EUR) || 0;
  return { inputRate, outputRate };
}

function calculateAiCost(inputTokens = 0, outputTokens = 0) {
  const { inputRate, outputRate } = getAiTokenRates();
  const inTokens = Number.isFinite(Number(inputTokens)) ? Number(inputTokens) : 0;
  const outTokens = Number.isFinite(Number(outputTokens)) ? Number(outputTokens) : 0;
  return Number((inTokens * inputRate + outTokens * outputRate).toFixed(6));
}

function sweepIdleAiSessions() {
  try {
    const idleMs = Number(ENV.AI_IDLE_TIMEOUT_SECONDS || 45) * 1000;
    const now = Date.now();
    const cutoff = now - idleMs;
    const stale = db
      .prepare(`
        SELECT id FROM ai_runtime_sessions
        WHERE status = 'active' AND last_seen_at < ?
        LIMIT 50
      `)
      .all(cutoff);
    for (const session of stale) {
      finalizeRuntimeSession({ runtimeId: session.id, reason: 'idle_timeout' });
    }
  } catch (e) {
    console.warn('[AI] idle sweep failed:', e?.message || e);
  }
}

function scheduleIdleRuntimeCleanup() {
  const intervalMs = Math.max(10000, Number(ENV.AI_CLEANUP_SWEEP_SECONDS || 30) * 1000);
  if (intervalMs <= 0) return;
  setInterval(() => {
    sweepIdleAiSessions();
  }, intervalMs);
  sweepIdleAiSessions();
}

async function createOpenAIRealtimeSession(options = {}) {
  if (!ENV.OPENAI_API_KEY) {
    throw new Error('OpenAI API key is not configured');
  }
  const { model, voice, instructions, metadata } = options;
  const payload = {
    model: model || ENV.OPENAI_REALTIME_MODEL,
    voice: voice || ENV.OPENAI_REALTIME_VOICE,
    instructions: instructions || undefined,
    metadata: metadata || undefined
  };
  const response = await fetch(ENV.OPENAI_REALTIME_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ENV.OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`OpenAI realtime session failed: ${response.status} ${text}`);
  }
  return response.json();
}

const REGISTRATION_SESSION_COOKIE = 'worknest_registration_session';
const REGISTRATION_SESSION_MAX_AGE = 1000 * 60 * 60 * 24 * 30;

function parseCookies(req) {
  const header = req.headers?.cookie;
  if (!header) return {};
  return header.split(';').reduce((acc, chunk) => {
    const [name, ...rest] = chunk.split('=');
    if (!name) return acc;
    acc[name.trim()] = decodeURIComponent((rest.join('=') || '').trim());
    return acc;
  }, {});
}

function getRegistrationSessionId(req, res) {
  const cookies = parseCookies(req);
  let sessionId = cookies[REGISTRATION_SESSION_COOKIE];
  if (!sessionId || !sessionId.trim()) {
    sessionId = crypto.randomBytes(16).toString('hex');
    if (res && typeof res.cookie === 'function') {
      res.cookie(REGISTRATION_SESSION_COOKIE, sessionId, {
        httpOnly: true,
        sameSite: 'lax',
        secure: ENV.COOKIE_SECURE,
        maxAge: REGISTRATION_SESSION_MAX_AGE
      });
    }
  }
  return sessionId;
}

function serializeRegistrationSession(row) {
  if (!row) return null;
  return {
    sessionId: row.session_id,
    step: row.step || 'info',
    email: row.email || '',
    phone: row.phone || '',
    email_verified: Boolean(row.email_verified),
    mobile_verified: Boolean(row.mobile_verified),
    otp_sent_at: row.otp_sent_at || null,
    created_at: row.created_at,
    last_updated: row.last_updated
  };
}

function loadRegistrationSessionById(sessionId) {
  if (!sessionId) return null;
  const row = db.prepare('SELECT * FROM registration_sessions WHERE session_id = ?').get(sessionId);
  return serializeRegistrationSession(row);
}

function ensureRegistrationSession(req, res) {
  const sessionId = getRegistrationSessionId(req, res);
  let row = db.prepare('SELECT * FROM registration_sessions WHERE session_id = ?').get(sessionId);
  if (!row) {
    const now = nowMs();
    db.prepare('INSERT INTO registration_sessions(session_id, step, created_at, last_updated) VALUES (?, ?, ?, ?)').run(sessionId, 'info', now, now);
    row = db.prepare('SELECT * FROM registration_sessions WHERE session_id = ?').get(sessionId);
  }
  return serializeRegistrationSession(row);
}

function updateRegistrationSessionRecord(sessionId, updates = {}) {
  if (!sessionId) return;
  const now = nowMs();
  const allowed = new Set(['step', 'email', 'phone', 'email_verified', 'mobile_verified', 'otp_sent_at', 'last_updated']);
  const sanitized = {};
  Object.entries(updates || {}).forEach(([key, value]) => {
    if (!allowed.has(key)) return;
    if (key === 'email_verified' || key === 'mobile_verified') {
      sanitized[key] = value ? 1 : 0;
    } else if (key === 'email' || key === 'phone') {
      sanitized[key] = String(value || '').trim();
    } else {
      sanitized[key] = value;
    }
  });
  sanitized.last_updated = now;
  const fields = [];
  const values = [];
  Object.entries(sanitized).forEach(([key, value]) => {
    fields.push(`${key} = ?`);
    values.push(value);
  });
  if (!fields.length) return;
  values.push(sessionId);
  db.prepare(`UPDATE registration_sessions SET ${fields.join(', ')} WHERE session_id = ?`).run(...values);
}

function getRegistrationSession(req, res) {
  const session = ensureRegistrationSession(req, res);
  if (!session) return null;
  return loadRegistrationSessionById(session.sessionId);
}

function generateOtpCode() {
  return String(Math.floor(Math.random() * 1000000)).padStart(6, '0');
}

async function sendRegistrationOtpEmail(email, code) {
  const subject = 'Verify your school registration';
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;background:#f8fafc;padding:24px;">
    <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;text-align:center;">
      <p style="font-size:16px;color:#0f172a;">Thanks for registering your school with StudisNest.</p>
      <p style="font-size:16px;color:#0f172a;">Use the OTP below to verify your email address.</p>
      <p style="font-size:32px;font-weight:700;letter-spacing:6px;margin:24px 0;color:#16a34a;">${escapeHtml(code)}</p>
      <p style="font-size:14px;color:#475569;">This code expires in 5 minutes.</p>
    </div>
  </div>`;
  const text = `Use this verification code to complete your registration: ${code}. It expires in 5 minutes.`;
  await sendPlatformEmail({ to: email, subject, html, text });
}

function getWorkspaceName(workspaceId) {
  const row = db.prepare('SELECT name FROM workspaces WHERE id = ?').get(workspaceId);
  return row?.name || 'School';
}

function buildSchoolDisplayName(schoolName = '') {
  const school = String(schoolName || '').trim();
  const platform = String(process.env.IONOS_SMTP_FROM_NAME || 'StudiesTalk').trim() || 'StudiesTalk';
  return school || platform;
}

function slugifyEmailSenderLabel(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

const AUTOMATED_EMAIL_SENDER_KEYWORDS = {
  welcome_email: 'welcome',
  invite_student_set_password: 'password',
  invite_teacher_set_password: 'password',
  password_reset: 'reset',
  live_session_invite: 'live-session',
  otp_2fa: 'otp',
  invoice_sent: 'invoice',
  payment_success: 'payment',
  course_end_reminder: 'reminder',
  new_course_offer: 'course',
  class_absence: 'absence',
  course_completion_congrats: 'completion',
  exam_registration_success: 'exam-registration',
  exam_date_notice: 'exam',
  registration_complete: 'registration',
  password_changed: 'password',
  automated: 'mail'
};

function buildAutomatedEmailSenderName(schoolName = '', templateKey = 'automated') {
  const schoolSlug = slugifyEmailSenderLabel(schoolName) || 'school';
  const keyword =
    slugifyEmailSenderLabel(AUTOMATED_EMAIL_SENDER_KEYWORDS[String(templateKey || '').trim()] || templateKey) || 'mail';
  return `noreply-${schoolSlug}-${keyword}`;
}

function getPlatformContactEmail() {
  return String(process.env.IONOS_SMTP_USER || 'info@studiestalk.com').trim();
}

function getInboundMailboxEmail() {
  return String(process.env.IONOS_IMAP_USER || process.env.IONOS_SMTP_USER || '').trim();
}

function normalizeEmailMessageId(value = '') {
  return String(value || '').trim();
}

function extractReferencedMessageIds(value = '') {
  const text = String(value || '').trim();
  if (!text) return [];
  const matches = text.match(/<[^>]+>/g);
  if (Array.isArray(matches) && matches.length) {
    return matches.map((entry) => normalizeEmailMessageId(entry)).filter(Boolean);
  }
  return text
    .split(/\s+/)
    .map((entry) => normalizeEmailMessageId(entry))
    .filter(Boolean);
}

function resolveWorkspaceContactEmail({ profileRow = {}, workspaceRow = {} } = {}) {
  const usePlatformEmail = Number(profileRow.use_platform_contact_email || 0) === 1;
  if (usePlatformEmail) {
    return getPlatformContactEmail();
  }
  return String(workspaceRow.admin_email || '').trim();
}

function findUserByEmail(email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return null;
  return db
    .prepare(
      'SELECT id, workspace_id AS workspaceId, email, first_name, last_name, name FROM users WHERE lower(email) = ? LIMIT 1'
    )
    .get(normalized);
}

function getResetToken(token) {
  return db
    .prepare(
      `SELECT token, user_id AS userId, workspace_id AS workspaceId, created_at AS createdAt,
              expires_at AS expiresAt, used
       FROM password_resets
       WHERE token = ?`
    )
    .get(String(token || '').trim());
}

async function sendPasswordResetEmail(user, token) {
  const link = `${getBaseUrl(PORT)}/reset-password?token=${encodeURIComponent(token)}`;
  const schoolName = getWorkspaceName(user.workspaceId);
  const supportEmail = getSupportEmailFallback();
  const recipientName =
    escapeHtml(user.name || `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email);
  const subject = `Reset Your Password – ${schoolName}`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;background:#f4f6f9;padding:24px;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;">

    <h2 style="margin-top:0;color:#111827;">
      Reset Your Password
    </h2>

    <p style="font-size:15px;color:#374151;">
      Hi ${recipientName},
    </p>

    <p style="font-size:15px;color:#374151;">
      We received a request to reset your password for your
      <strong>${escapeHtml(schoolName)}</strong> account.
    </p>

    <p style="font-size:15px;color:#374151;">
      Click the button below to create a new password.
      This link will expire in <strong>${PASSWORD_RESET_EXPIRY_HOURS} hours</strong> for security reasons.
    </p>

    <div style="text-align:center;margin:28px 0;">
      <a href="${link}"
         style="background:#dc2626;color:#ffffff;padding:12px 22px;border-radius:8px;
                text-decoration:none;font-weight:600;display:inline-block;">
        Reset Password
      </a>
    </div>

    <p style="font-size:14px;color:#6b7280;">
      If you did not request a password reset, you can safely ignore this email.
    </p>

    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">

    <p style="font-size:13px;color:#6b7280;">
      Need help? Contact us at
      <a href="mailto:${supportEmail}" style="color:#4f46e5;">${supportEmail}</a>.
    </p>

    <p style="font-size:12px;color:#9ca3af;margin-top:16px;">
      StudisNest powered by StudisTalk
    </p>

  </div>
</div>`;
  const text = `Hi ${recipientName},\n\nPlease reset your ${schoolName} password using this link (expires in ${PASSWORD_RESET_EXPIRY_HOURS} hours): ${link}\n\nIf you did not request this, ignore this email or contact ${supportEmail}.`;
  await sendPlatformEmail({
    to: user.email,
    subject,
    html,
    text,
    fromName: buildAutomatedEmailSenderName(schoolName, 'password_reset')
  });
}

async function sendPasswordChangedEmail(user) {
  const loginUrl = `${getBaseUrl(PORT)}/login`;
  const schoolName = getWorkspaceName(user.workspaceId);
  const recipientName = escapeHtml(user.name || `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email);
  const supportEmail = getSupportEmailFallback();
  const subject = `Your Password Has Been Successfully Updated`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;background:#f4f6f9;padding:24px;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;">

    <h2 style="margin-top:0;color:#111827;">
      Password Successfully Updated ✅
    </h2>

    <p style="font-size:15px;color:#374151;">
      Hi ${recipientName},
    </p>

    <p style="font-size:15px;color:#374151;">
      This is a confirmation that your password for
      <strong>${escapeHtml(schoolName)}</strong> has been successfully changed.
    </p>

    <div style="text-align:center;margin:28px 0;">
      <a href="${loginUrl}"
         style="background:#16a34a;color:#ffffff;padding:12px 22px;border-radius:8px;
                text-decoration:none;font-weight:600;display:inline-block;">
        Login Now
      </a>
    </div>

    <p style="font-size:14px;color:#6b7280;">
      If you did not perform this change, please contact us immediately.
    </p>

    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">

    <p style="font-size:13px;color:#6b7280;">
      Support: <a href="mailto:${supportEmail}" style="color:#4f46e5;">${supportEmail}</a>
    </p>

    <p style="font-size:12px;color:#9ca3af;margin-top:16px;">
      StudisNest powered by StudisTalk
    </p>

  </div>
</div>`;
  const text = `Hi ${recipientName},\n\nYour password for ${schoolName} has been successfully updated. Log in here: ${loginUrl}.\n\nIf you did not perform this change, contact ${supportEmail} immediately.`;
  await sendPlatformEmail({
    to: user.email,
    subject,
    html,
    text,
    fromName: buildAutomatedEmailSenderName(schoolName, 'password_changed')
  });
}

function userTableColumns() {
  const rows = db.prepare('PRAGMA table_info(users)').all();
  return new Set(rows.map((r) => r.name));
}

function insertIntoUsersAdaptive(userObj) {
  const cols = userTableColumns();
  const entries = Object.entries(userObj).filter(([k]) => cols.has(k));
  const colNames = entries.map(([k]) => k);
  const placeholders = entries.map(() => '?');
  const values = entries.map(([, v]) => v);
  if (colNames.length < 6) {
    throw new Error('users table schema does not match expected structure');
  }
  const sql = `INSERT INTO users (${colNames.join(',')}) VALUES (${placeholders.join(',')})`;
  db.prepare(sql).run(...values);
}

function tableColumns(tableName) {
  const rows = db.prepare(`PRAGMA table_info(${tableName})`).all();
  return new Set(rows.map((r) => r.name));
}

function insertAdaptive(tableName, obj) {
  const cols = tableColumns(tableName);
  const entries = Object.entries(obj).filter(([k, v]) => cols.has(k) && v !== undefined);
  if (!entries.length) {
    throw new Error(`No valid columns to insert into ${tableName}`);
  }
  const names = entries.map(([k]) => k);
  const values = entries.map(([, v]) => v);
  const placeholders = names.map(() => '?').join(',');
  const sql = `INSERT INTO ${tableName} (${names.join(',')}) VALUES (${placeholders})`;
  db.prepare(sql).run(...values);
}

const CSV_IMPORT_FIELD_ALIASES = {
  firstname: 'firstName',
  givenname: 'firstName',
  lastname: 'lastName',
  familyname: 'lastName',
  email: 'email',
  contactemail: 'email',
  password: 'password',
  coursestart: 'courseStart',
  courseend: 'courseEnd',
  courselevel: 'courseLevel',
  availabledays: 'availableDays',
  availableday: 'availableDays',
  phonecountry: 'phoneCountry',
  phonenumber: 'phoneNumber',
  emergencyname: 'emergencyName',
  emergencyphone: 'emergencyPhone',
  emergencyrelation: 'emergencyRelation',
  nativelanguage: 'nativeLanguage',
  learninggoal: 'learningGoal',
  teachinglanguages: 'teachingLanguages',
  teachingskills: 'teachingLanguages',
  dateofbirth: 'dateOfBirth',
  gender: 'gender',
  role: 'role'
};

function normalizeCsvHeader(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z]/g, '');
}

function mapCsvHeaders(headers) {
  return headers.map((header) => {
    const normalized = normalizeCsvHeader(header);
    return CSV_IMPORT_FIELD_ALIASES[normalized] || null;
  });
}

function parseCsv(text) {
  const rows = [];
  if (!text) return rows;
  const content = String(text || '').replace(/\ufeff/g, '');
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    if (char === '"') {
      if (inQuotes && content[i + 1] === '"') {
        field += '"';
        i++;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }

    if (!inQuotes && char === ',') {
      row.push(field);
      field = '';
      continue;
    }

    if (!inQuotes && char === '\r') {
      if (content[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      continue;
    }

    if (!inQuotes && char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      continue;
    }

    field += char;
  }

  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

function generateId(prefix = 'u') {
  return `${prefix}_${crypto.randomBytes(10).toString('hex')}`;
}

function generateUsername(workspaceId, firstName, lastName) {
  const base = `${firstName}.${lastName}`.toLowerCase().replace(/[^a-z0-9.]/g, '');
  const suffix = crypto.randomBytes(2).toString('hex');
  return `${base}.${suffix}`;
}

function tryAlter(sql) {
  try {
    db.exec(sql);
  } catch (e) {
    if (!String(e?.message || '').toLowerCase().includes('duplicate column')) {
      throw e;
    }
  }
}

function recordEmailLog({
  id,
  workspaceId,
  sentByUserId,
  toEmail,
  toName,
  subject,
  bodyText,
  bodyHtml,
  type = 'test',
  status = 'sent',
  errorMessage = '',
  messageId = ''
}) {
  ensureEmailLogStmt().run(
    id,
    workspaceId,
    sentByUserId || null,
    toEmail,
    toName || null,
    subject || '',
    bodyText || '',
    bodyHtml || '',
    type,
    status,
    errorMessage || '',
    messageId || '',
    new Date().toISOString()
  );
}

let insertEmailLogStmt = null;
function ensureEmailLogStmt() {
  if (!insertEmailLogStmt) {
    insertEmailLogStmt = db.prepare(`
      INSERT INTO workspace_email_logs (
        id, workspace_id, sent_by_user_id, to_email, to_name,
        subject, body_text, body_html, type, status, error_message, message_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
  }
  return insertEmailLogStmt;
}

function resolveRecipientName(workspaceId, email) {
  if (!email) return null;
  const row = db
    .prepare(
      `
      SELECT name
      FROM users
      WHERE workspace_id = ?
        AND lower(email) = ?
      LIMIT 1
    `
    )
    .get(workspaceId, email.toLowerCase());
  return row?.name || null;
}

const TRANSLATOR_URL = process.env.TRANSLATOR_URL || 'http://127.0.0.1:5005';
const TRANSLATION_HUB_LANG = process.env.TRANSLATION_HUB_LANG || 'en';
const TRANSLATION_RECENT_LIMIT = Number(process.env.TRANSLATION_RECENT_LIMIT || 50);
const translationMemoryCache = new Map();
const providerDefault = String(process.env.TRANSLATION_PROVIDER || 'google').toLowerCase();
const allowAdminLoginBypass =
  String(process.env.ALLOW_DEV_BYPASS || '0').trim() === '1' &&
  String(ENV.NODE_ENV || 'development').trim().toLowerCase() !== 'production';

const DEV_SUPER_ADMIN_BYPASS_RAW = process.env.DEV_SUPER_ADMIN_BYPASS || '';
const devSuperAdminBypassEntries = parseDevSuperAdminBypass(DEV_SUPER_ADMIN_BYPASS_RAW);

function parseDevSuperAdminBypass(rawValue) {
  if (!rawValue) return [];
  try {
    const candidates = JSON.parse(rawValue);
    if (!Array.isArray(candidates)) {
      console.warn('DEV_SUPER_ADMIN_BYPASS must be a JSON array');
      return [];
    }
    return candidates
      .map((entry) => {
        if (!entry || typeof entry !== 'object') return null;
        const email = String(entry.email || '').trim().toLowerCase();
        const password = String(entry.password || '');
        const userId = String(entry.userId || 'super-admin');
        const name = String(entry.name || 'Super Admin');
        const role = String(entry.role || 'super_admin').trim().toLowerCase();
        const displayRole =
          String(entry.displayRole || entry.display_name || '')
            .trim() || role;
        const avatarUrl = entry.avatarUrl || null;
        if (!email || !password) return null;
        return { email, password, userId, name, avatarUrl, role, displayRole };
      })
      .filter(Boolean);
  } catch (error) {
    console.warn('Unable to parse DEV_SUPER_ADMIN_BYPASS:', error.message);
    return [];
  }
}

function findDevSuperAdminBypassUser(identifier) {
  if (!allowAdminLoginBypass || !identifier) return null;
  const normalized = String(identifier || '').trim().toLowerCase();
  if (!normalized) return null;
  return devSuperAdminBypassEntries.find((entry) => {
    if (!entry) return false;
    const matchId = entry.userId && String(entry.userId).trim().toLowerCase();
    const matchEmail = entry.email && String(entry.email).trim().toLowerCase();
    return matchId === normalized || matchEmail === normalized;
  }) || null;
}

const EMAIL_TEMPLATE_DEFS = [
  {
    key: 'welcome_email',
    label: 'Welcome email',
    required: ['student_name', 'school_name', 'registration_url', 'support_email'],
    defaultSubject: 'Complete Your Registration – {{school_name}}',
    defaultBodyHtml: `<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 0;font-family:Arial,Helvetica,sans-serif;">
  <tr>
    <td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;box-shadow:0 1px 2px rgba(0,0,0,0.04);">
        <tr>
          <td style="padding:20px 32px 0 32px;font-size:14px;color:#6b7280;letter-spacing:0.4px;">
            {{school_name}}
          </td>
        </tr>
        <tr>
          <td style="padding:12px 32px 0 32px;">
            <h1 style="margin:12px 0 16px 0;font-size:22px;font-weight:600;color:#111827;">
              Complete Your Registration
            </h1>
          </td>
        </tr>
        <tr>
          <td style="padding:0 32px 8px 32px;font-size:15px;color:#374151;">
            Hi {{student_name}},
          </td>
        </tr>
        <tr>
          <td style="padding:0 32px 8px 32px;font-size:15px;color:#374151;">
            You have been invited to join <strong>{{school_name}}</strong>. To get started, confirm your account by clicking the button below.
          </td>
        </tr>
        <tr>
          <td style="padding:0 32px 4px 32px;font-size:15px;color:#374151;">
            <p style="margin:0;font-size:15px;color:#374151;">
              If you did not request this registration, you can safely ignore this email.
            </p>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:12px 32px;">
            <table align="center" cellpadding="0" cellspacing="0" style="margin:28px 0;">
              <tr>
                <td align="center" bgcolor="#4f46e5" style="border-radius:8px;">
                  <a href="{{registration_url}}"
                     style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;font-family:Arial,Helvetica,sans-serif;">
                    Complete Registration →
                  </a>
                </td>
              </tr>
            </table>
            <p style="margin:0;font-size:12px;color:#ef4444;">
              ⏳ This link expires in 24 hours.
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:0 32px;font-size:13px;color:#6b7280;line-height:1.5;">
            If you encounter issues, reach out to support or reply to this email. We’re here to help.
          </td>
        </tr>
        <tr>
          <td style="padding:16px 32px 0 32px;">
            <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
          </td>
        </tr>
        <tr>
          <td style="padding:0 32px 32px 32px;font-size:12px;color:#cbd5e1;line-height:1.6;">
            Need help? Contact us at
            <a href="mailto:{{support_email}}" style="color:#4f46e5;text-decoration:none;">
              {{support_email}}
            </a>
            <br>
            © {{school_name}} · Powered by StudiesTalk
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`,
    defaultBodyText:
      'Hi {{student_name}},\n\nYou have been invited to join {{school_name}}. To get started, confirm your account by visiting: {{registration_url}}\n\nIf you did not request this registration, you can safely ignore this email.\n\nNeed help? Contact {{support_email}}.\n\n© {{school_name}} · Powered by StudiesTalk'
  },
  {
    key: 'invite_student_set_password',
    label: 'Invite link (student set password)',
    required: ['student_name', 'school_name', 'set_password_link'],
    defaultSubject: 'Set your password for {{school_name}}',
    defaultBodyHtml: `<p>Hi {{student_name}},</p>
       <p>You have been invited to {{school_name}}.</p>
       <p><a href="{{set_password_link}}">Set your password</a></p>
       <p>This link expires in {{link_expiry_hours}} hours.</p>`
  },
  {
    key: 'invite_teacher_set_password',
    label: 'Invite link (teacher set password)',
    required: ['teacher_name', 'school_name', 'set_password_link'],
    defaultSubject: 'Your teacher account for {{school_name}}',
    defaultBodyHtml: `<p>Hi {{teacher_name}},</p>
       <p>You have been invited as a teacher at {{school_name}}.</p>
       <p><a href="{{set_password_link}}">Set your password</a></p>
       <p>This link expires in {{link_expiry_hours}} hours.</p>`
  },
  {
    key: 'password_reset',
    label: 'Password reset',
    required: ['user_name', 'reset_link', 'reset_expiry_minutes'],
    defaultSubject: 'Reset your password',
    defaultBodyHtml: `<p>Hi {{user_name}},</p>
       <p>We received a request to reset your password.</p>
       <p><a href="{{reset_link}}">Reset password</a></p>
       <p>This link expires in {{reset_expiry_minutes}} minutes.</p>
       <p>If you didn’t request this, you can ignore this email.</p>`
  },
  {
    key: 'live_session_invite',
    label: 'Live session invite',
    required: ['user_name', 'session_title', 'session_start', 'session_end', 'session_link'],
    defaultSubject: 'Live session: {{session_title}}',
    defaultBodyHtml: `<p>Hi {{user_name}},</p>
       <p>Your live session is scheduled.</p>
       <p><strong>{{session_title}}</strong></p>
       <p>Start: {{session_start}}<br/>End: {{session_end}}</p>
       <p><a href="{{session_link}}">Join the live session</a></p>`
  },
  {
    key: 'otp_2fa',
    label: 'OTP / 2FA code',
    required: ['user_name', 'otp_code', 'otp_expiry_minutes'],
    defaultSubject: 'Your verification code: {{otp_code}}',
    defaultBodyHtml: `<p>Hi {{user_name}},</p>
       <p>Your one-time code is:</p>
       <p style="font-size:22px;font-weight:700;letter-spacing:2px;">{{otp_code}}</p>
       <p>This code expires in {{otp_expiry_minutes}} minutes.</p>`
  },
  {
    key: 'invoice_sent',
    label: 'Invoice email',
    required: ['student_name', 'invoice_number', 'amount', 'currency', 'invoice_link'],
    defaultSubject: 'Invoice {{invoice_number}} from {{school_name}}',
    defaultBodyHtml: `<p>Hi {{student_name}},</p>
       <p>Your invoice <strong>{{invoice_number}}</strong> is ready.</p>
       <p>Amount: {{amount}} {{currency}}</p>
       <p><a href="{{invoice_link}}">View invoice</a></p>`
  },
  {
    key: 'payment_success',
    label: 'Payment success',
    required: ['student_name', 'amount', 'currency', 'receipt_link'],
    defaultSubject: 'Payment successful ✅',
    defaultBodyHtml: `<p>Hi {{student_name}},</p>
       <p>Your payment was successful.</p>
       <p>Amount: {{amount}} {{currency}}</p>
       <p><a href="{{receipt_link}}">View receipt</a></p>`
  },
  {
    key: 'course_end_reminder',
    label: 'Course end reminder',
    required: ['student_name', 'course_name', 'course_end_date'],
    defaultSubject: 'Reminder: {{course_name}} ends on {{course_end_date}}',
    defaultBodyHtml: `<p>Hi {{student_name}},</p>
       <p>This is a reminder that <strong>{{course_name}}</strong> ends on {{course_end_date}}.</p>
       <p>If you need support, contact {{support_email}}.</p>`
  },
  {
    key: 'new_course_offer',
    label: 'New course offer',
    required: ['user_name', 'course_name', 'course_link'],
    defaultSubject: 'New course available: {{course_name}}',
    defaultBodyHtml: `<p>Hi {{user_name}},</p>
       <p>We have a new course available: <strong>{{course_name}}</strong>.</p>
       <p><a href="{{course_link}}">View course details</a></p>`
  },
  {
    key: 'class_absence',
    label: 'Class absence notice',
    required: ['student_name', 'class_name', 'class_date'],
    defaultSubject: 'Absence notice: {{class_name}}',
    defaultBodyHtml: `<p>Hi {{student_name}},</p>
       <p>We noticed you were absent for <strong>{{class_name}}</strong> on {{class_date}}.</p>
       <p>If this is incorrect, please reply to this email.</p>`
  },
  {
    key: 'course_completion_congrats',
    label: 'Course completion congratulations',
    required: ['student_name', 'course_name'],
    defaultSubject: 'Congratulations on completing {{course_name}} 🎓',
    defaultBodyHtml: `<p>Hi {{student_name}},</p>
       <p>Congratulations! You successfully completed <strong>{{course_name}}</strong>.</p>
       <p>We’re proud of your progress.</p>`
  },
  {
    key: 'exam_registration_success',
    label: 'Exam registration success',
    required: ['student_name', 'exam_name'],
    defaultSubject: 'Exam registration confirmed: {{exam_name}}',
    defaultBodyHtml: `<p>Hi {{student_name}},</p>
       <p>Your registration for <strong>{{exam_name}}</strong> has been confirmed.</p>`
  },
  {
    key: 'exam_date_notice',
    label: 'Exam date notice',
    required: ['student_name', 'exam_name', 'exam_date', 'exam_location'],
    defaultSubject: 'Exam schedule: {{exam_name}} on {{exam_date}}',
    defaultBodyHtml: `<p>Hi {{student_name}},</p>
       <p>Your exam schedule is ready:</p>
       <p><strong>{{exam_name}}</strong><br/>
       Date: {{exam_date}}<br/>
       Location: {{exam_location}}</p>`
  }
];

const EMAIL_TEMPLATE_DEF_MAP = new Map(EMAIL_TEMPLATE_DEFS.map((d) => [d.key, d]));


function isCultureExchangeChannel(channelName = '') {
  return String(channelName || '').trim().toLowerCase() === 'culture exchange';
}

function isLikelyHtml(text = '') {
  return /<\/?[a-z][\s\S]*>/i.test(text);
}

async function argosTranslate(text, sourceLang, targetLang) {
  const r = await fetch(`${TRANSLATOR_URL}/translate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, source: sourceLang, target: targetLang })
  });
  if (!r.ok) {
    const msg = await r.text().catch(() => '');
    throw new Error(`Argos HTTP ${r.status}: ${msg.slice(0, 200)}`);
  }
  const j = await r.json().catch(() => ({}));
  return String(j.translatedText || '').trim();
}

async function translateViaHub(text, sourceLang, targetLang) {
  if (sourceLang === targetLang) return text;
  const hub = TRANSLATION_HUB_LANG;

  if (sourceLang === hub || targetLang === hub) {
    return argosTranslate(text, sourceLang, targetLang);
  }
  const step1 = await argosTranslate(text, sourceLang, hub);
  return argosTranslate(step1, hub, targetLang);
}

function translationRowId(messageId, targetLang, viewerUserId = 'anon') {
  const normalizedUser = String(viewerUserId || '').trim() || 'anon';
  return `tr_${messageId}_${targetLang}_${normalizedUser}`;
}

db.prepare(`
  CREATE TABLE IF NOT EXISTS file_stats (
    workspace_id TEXT NOT NULL,
    file_url TEXT NOT NULL,
    file_name TEXT,
    size INTEGER DEFAULT 0,
    views INTEGER DEFAULT 0,
    downloads INTEGER DEFAULT 0,
    updated_at INTEGER DEFAULT (strftime('%s','now')),
    PRIMARY KEY (workspace_id, file_url)
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS ai_budget_settings (
    workspace_id TEXT PRIMARY KEY,
    monthly_cap_eur REAL NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS ai_usage_ledger (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    cost_eur REAL NOT NULL,
    tokens_input INTEGER DEFAULT 0,
    tokens_output INTEGER DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  )
`).run();

db.prepare(`
  CREATE INDEX IF NOT EXISTS idx_ai_usage_workspace_month
  ON ai_usage_ledger(workspace_id, created_at)
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS ai_runtime_sessions (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    conversation_id TEXT,
    started_at INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL,
    seconds_accumulated INTEGER NOT NULL DEFAULT 0,
    ended_at INTEGER,
    status TEXT NOT NULL DEFAULT 'active',
    end_reason TEXT
  )
`).run();
safeAlter(`ALTER TABLE ai_runtime_sessions ADD COLUMN conversation_id TEXT;`);
safeAlter(`ALTER TABLE ai_runtime_sessions ADD COLUMN end_reason TEXT;`);

db.prepare(`
  CREATE INDEX IF NOT EXISTS idx_ai_runtime_active
  ON ai_runtime_sessions(workspace_id, status)
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS platform_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS ai_conversations (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    scenario TEXT,
    mode TEXT,
    started_at INTEGER NOT NULL,
    ended_at INTEGER
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS ai_conversation_messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )
`).run();

db.prepare(`
  CREATE INDEX IF NOT EXISTS idx_ai_conversations_workspace
  ON ai_conversations(workspace_id, started_at)
`).run();

db.prepare(`
  CREATE INDEX IF NOT EXISTS idx_ai_conversation_messages
  ON ai_conversation_messages(conversation_id, created_at)
`).run();

try {
  const row = db
    .prepare('SELECT value FROM platform_settings WHERE key = ?')
    .get('ai_default_monthly_cap_eur');
  if (!row) {
    db.prepare(`
      INSERT INTO platform_settings (key, value, updated_at)
      VALUES (?, ?, ?)
    `).run('ai_default_monthly_cap_eur', '5', new Date().toISOString());
  }
} catch (err) {
  console.warn('[AI Budget] default seed failed:', err?.message || String(err));
}

// disable ETag to avoid stale 304 responses on API JSON
app.set('etag', false);

// body parsing / logging / static assets must be before routes
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
if (ENV.IS_PROD) {
  app.use(morgan('combined'));
} else {
  app.use(morgan('dev'));
}
app.use(express.static(path.join(__dirname, 'public')));
app.use(
  '/integration-assets',
  express.static(path.join(__dirname, 'Ai Intregration'))
);

// ---------- ADMIN FRONTEND (static) ----------
app.use('/admin', express.static(path.join(__dirname, 'admin')));

app.use((req, res, next) => {
  if (req.path.startsWith('/uploads')) {
    return express.static(UPLOADS_DIR)(req, res, next);
  }
  ensureCsrfCookie(req, res);
  next();
});
app.use(csrfRequired);

app.use((req, res, next) => {
  if (!req.ctx) {
    const user = req.auth || getAuthedUser(req);
    req.ctx = buildRequestContext(req, user);
  }
  next();
});

app.use('/api/live', liveRouter);
app.use('/api/live/schedule', liveScheduleRouter);

// Friendly route
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin', 'index.html'));
});

app.post('/admin/backup-db', requireAdmin, (req, res) => {
  try {
    const backupDir = '/var/backups/worknest';
    fs.mkdirSync(backupDir, { recursive: true });
    const backupPath = path.join(backupDir, `manual-${Date.now()}.db`);
    fs.copyFileSync(DB_PATH, backupPath);
    return res.json({ ok: true, path: backupPath });
  } catch (err) {
    console.error('Manual DB backup failed', err);
    return res.status(500).json({ error: 'Backup failed' });
  }
});
app.use(
  '/uploads',
  express.static(UPLOADS_DIR, {
    setHeaders(res, filePath) {
      if (filePath.endsWith('.webm')) {
        res.setHeader('Content-Type', 'video/webm');
      }
    }
  })
);

app.get('/.well-known/appspecific/com.chrome.devtools.json', (_req, res) => {
  res.status(204).json({});
});

app.get('/register', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

app.post('/api/register/otp/send', strictLimiter, async (req, res) => {
  const email = normalizeRegistrationEmail(req.body?.email);
  if (!email) {
    return res.status(400).json({ error: 'A valid email address is required.' });
  }
  const code = generateOtpCode();
  const expiresAt = Date.now() + 5 * 60 * 1000;
  try {
    db.prepare(
      `
        INSERT INTO register_otps(email, code, expires_at)
        VALUES (?, ?, ?)
        ON CONFLICT(email) DO UPDATE SET code = excluded.code, expires_at = excluded.expires_at
      `
    ).run(email, code, expiresAt);
    await sendRegistrationOtpEmail(email, code);
    return res.json({ ok: true, expiresAt });
  } catch (error) {
    console.error('Failed to send registration OTP', { email }, error);
    return res.status(500).json({
      error: 'Unable to send the OTP right now. Please try again shortly.'
    });
  }
});

app.post('/api/register/otp/verify', strictLimiter, (req, res) => {
  const email = normalizeRegistrationEmail(req.body?.email);
  const code = String(req.body?.code || '').trim();
  if (!email || !code) {
    return res.status(400).json({ error: 'Email and OTP code are required.' });
  }
  const row = db
    .prepare('SELECT code, expires_at FROM register_otps WHERE email = ? LIMIT 1')
    .get(email);
  if (!row) {
    return res.status(400).json({ error: 'OTP code is incorrect or has expired.' });
  }
  if (row.expires_at < Date.now()) {
    db.prepare('DELETE FROM register_otps WHERE email = ?').run(email);
    return res.status(400).json({ error: 'OTP code is incorrect or has expired.' });
  }
  if (row.code !== code) {
    return res.status(400).json({ error: 'OTP code is incorrect or has expired.' });
  }
  db.prepare('DELETE FROM register_otps WHERE email = ?').run(email);
  return res.json({ ok: true });
});

app.post('/api/register/mobile-otp/send', strictLimiter, async (req, res) => {
  try {
    const phone = String(req.body?.phone || '').trim();
    const channel = req.body?.channel === 'call' ? 'call' : 'sms';

    if (!phone) {
      return res.status(400).json({ error: 'phone is required (E.164 format)' });
    }
    if (!twilioClient || !twilioVerifyServiceSid) {
      try {
        const payload = await callMobileOtpProxy('/otp/start', { phone, channel });
        return res.json({ ok: true, status: payload?.status });
      } catch (err) {
        console.error('Mobile OTP proxy send failed', err);
        return res.status(500).json({ error: err.message });
      }
    }

    const v = await twilioClient.verify.v2
      .services(twilioVerifyServiceSid)
      .verifications.create({ to: phone, channel });

    return res.json({ ok: true, status: v.status });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/register/mobile-otp/verify', strictLimiter, async (req, res) => {
  try {
    const phone = String(req.body?.phone || '').trim();
    const code = String(req.body?.code || '').trim();

    if (!phone || !code) {
      return res.status(400).json({ error: 'phone and code are required' });
    }
    if (!twilioClient || !twilioVerifyServiceSid) {
      try {
        const payload = await callMobileOtpProxy('/otp/check', { phone, code });
        if (!payload?.valid) {
          return res.status(400).json({ error: 'Invalid or expired OTP.' });
        }
        return res.json({ ok: true, status: payload?.status });
      } catch (err) {
        console.error('Mobile OTP proxy verify failed', err);
        return res.status(500).json({ error: err.message });
      }
    }

    const check = await twilioClient.verify.v2
      .services(twilioVerifyServiceSid)
      .verificationChecks.create({ to: phone, code });

    const valid = check.status === 'approved';
    if (!valid) {
      return res.status(400).json({ error: 'Invalid or expired OTP.' });
    }

    return res.json({ ok: true, status: check.status });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.get('/api/register/mobile-otp/status', (req, res) => {
  return res.json({ available: MOBILE_OTP_ENABLED });
});

app.get('/api/register/session', (req, res) => {
  const session = getRegistrationSession(req, res);
  if (!session) {
    return res.status(500).json({ error: 'Failed to load registration session.' });
  }
  return res.json({ ok: true, session });
});

app.post('/api/register/session', (req, res) => {
  const row = ensureRegistrationSession(req, res);
  if (!row) {
    return res.status(500).json({ error: 'Failed to create registration session.' });
  }
  const payload = req.body || {};
  const updates = {};
  if (typeof payload.step === 'string') updates.step = payload.step;
  if (typeof payload.email === 'string') updates.email = payload.email.trim();
  if (typeof payload.phone === 'string') updates.phone = payload.phone.trim();
  if (payload.emailVerified !== undefined) updates.email_verified = payload.emailVerified;
  if (payload.mobileVerified !== undefined) updates.mobile_verified = payload.mobileVerified;
  if (payload.otpSentAt !== undefined) {
    const parsed = Number(payload.otpSentAt);
    updates.otp_sent_at = Number.isFinite(parsed) ? parsed : nowMs();
  }
  updateRegistrationSessionRecord(row.sessionId, updates);
  return res.json({ ok: true, session: loadRegistrationSessionById(row.sessionId) });
});

app.get('/api/register/session', (req, res) => {
  const session = getRegistrationSession(req, res);
  if (!session) {
    return res.status(500).json({ error: 'Failed to load registration session.' });
  }
  return res.json({ ok: true, session });
});

app.post('/api/register/session', (req, res) => {
  const row = ensureRegistrationSession(req, res);
  if (!row) {
    return res.status(500).json({ error: 'Failed to create registration session.' });
  }
  const payload = req.body || {};
  const updates = {};
  if (typeof payload.step === 'string') updates.step = payload.step;
  if (typeof payload.email === 'string') updates.email = payload.email.trim();
  if (typeof payload.phone === 'string') updates.phone = payload.phone.trim();
  if (payload.emailVerified !== undefined) updates.email_verified = payload.emailVerified;
  if (payload.mobileVerified !== undefined) updates.mobile_verified = payload.mobileVerified;
  if (payload.otpSentAt !== undefined) {
    const parsed = Number(payload.otpSentAt);
    updates.otp_sent_at = Number.isFinite(parsed) ? parsed : nowMs();
  }
  updateRegistrationSessionRecord(row.sessionId, updates);
  return res.json({ ok: true, session: loadRegistrationSessionById(row.sessionId) });
});

app.post('/api/register/request-review', (req, res) => {
  const formPayload = req.body?.form || {};
  const email = normalizeRegistrationEmail(req.body?.email || formPayload?.schoolEmail);
  const phone = String(formPayload?.phone || formPayload?.schoolPhone || formPayload?.phoneNumber || '').trim();
  const schoolName = String(formPayload?.schoolName || formPayload?.name || '').trim();

  if (!email) {
    return res.status(400).json({ error: 'Email is required to submit for review.' });
  }

  const existingUser = db
    .prepare(`SELECT id, role, workspace_id AS workspaceId FROM users WHERE lower(email) = lower(?) LIMIT 1`)
    .get(email);

  if (existingUser) {
    return res.status(409).json({
      error: 'This email is already registered. Please login or reset your password.',
      action: 'login_or_reset',
      login: true,
      forgotPassword: true,
    });
  }

  const existingReq = db
    .prepare(`
    SELECT id, status, created_at AS createdAt
    FROM registration_review_requests
    WHERE lower(email) = lower(?)
    ORDER BY created_at DESC
    LIMIT 1
  `)
    .get(email);

  if (existingReq) {
    const st = String(existingReq.status || 'pending').toLowerCase();
    if (st === 'pending') {
      return res.status(409).json({
        error: 'A school request with this email is already pending review.',
        action: 'already_pending',
      });
    }
    if (st === 'approved') {
      return res.status(409).json({
        error: 'This school request was already approved. Please login or reset password.',
        action: 'already_approved',
      });
    }
  }

  if (phone) {
    const dupPhone = db
      .prepare(`
      SELECT id, status
      FROM registration_review_requests
      WHERE payload LIKE ?
      ORDER BY created_at DESC
      LIMIT 1
    `)
      .get(`%${phone}%`);
    if (dupPhone && String(dupPhone.status || '').toLowerCase() === 'pending') {
      return res.status(409).json({
        error: 'A school request with this phone number is already pending.',
        action: 'duplicate_phone',
      });
    }
  }

  const payloadText = JSON.stringify({ form: formPayload, submittedAt: Date.now(), schoolName });
  db.prepare(
    'INSERT INTO registration_review_requests (email, payload, status, created_at) VALUES (?, ?, ?, ?)'
  ).run(email, payloadText, 'pending', Date.now());

  return res.json({ ok: true });
});

app.get('/reset-password', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'reset-password.html'));
});

function getRequesterId(req) {
  return (req.headers['x-user-id'] || '').trim();
}

function getAuthedUser(req) {
  const token = getAccessTokenFromRequest(req);
  if (!token) return null;
  return verifyAccessToken(token);
}

function workspaceIdFromRequest(req) {
  const authWorkspaceId = req?.auth?.workspaceId || req?.auth?.workspace_id;
  if (authWorkspaceId) return authWorkspaceId;
  const user = getAuthedUser(req);
  if (user) {
    return user.workspaceId || user.workspace_id || 'default';
  }
  return 'default';
}

function getUserById(userId) {
  if (!userId) return null;
  const row = db.prepare('SELECT id, workspace_id, role FROM users WHERE id = ? LIMIT 1').get(userId);
  if (!row) return null;
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    role: normalizeRoleName(row.role || '')
  };
}

function getRequesterWorkspaceId(req) {
  const requesterId = getRequesterId(req);
  if (requesterId) {
    const user = getUserById(requesterId);
    if (user?.workspaceId) return user.workspaceId;
  }
  return (req.query.workspaceId || 'default').trim() || 'default';
}

function getCalendarRequesterContext(req, fallbackUserId = "") {
  const requesterId = String(getRequesterId(req) || fallbackUserId || getAuthUserId(req) || "").trim();
  const user = requesterId ? getUserById(requesterId) : null;
  const role = normalizeRoleName(
    user?.role || getRequesterRole(req) || getAuthRole(req) || req.auth?.role || "student"
  );
  const workspaceId =
    user?.workspaceId ||
    getAuthWorkspaceId(req) ||
    String(req.headers["x-workspace-id"] || req.query.workspaceId || "default").trim() ||
    "default";
  const isAdmin = ["admin", "school_admin", "super_admin"].includes(role);
  return { requesterId, role, workspaceId, isAdmin };
}

function getUserChannelIds(userId, workspaceId) {
  if (!userId) return [];
  return db
    .prepare(
      `
      SELECT cm.channel_id
      FROM channel_members cm
      JOIN channels c ON c.id = cm.channel_id
      WHERE cm.user_id = ?
        AND c.workspace_id = ?
    `
    )
    .all(userId, workspaceId)
    .map((row) => row.channel_id);
}

function resolveRequestedWorkspaceId(req) {
  const requested = String(req.query.workspaceId || '').trim();
  if (requested) return requested;
  return workspaceIdFromRequest(req) || 'default';
}

// ---------- ADMIN PORTAL HELPERS ----------
function generateAdminId(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
}

function requireSuperAdmin(req, res, next) {
  const user = req.auth || getAuthedUser(req);
  if (!user) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }
  const role = String(user.role || user.userRole || '').toLowerCase();
  const isSuper = !!user.superAdmin || role === 'super_admin';
  if (!isSuper) {
    res.status(403).json({ error: 'Super admin only' });
    return null;
  }
  if (typeof next === 'function') {
    return next();
  }
  return user;
}

function legacyAuditLog({ workspaceId = null, actor = null, action = '', target = '', payload = null }) {
  try {
    db.prepare(
      `INSERT INTO audit_log (workspace_id, actor, action, target, payload_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(workspaceId, actor, action, target, payload ? JSON.stringify(payload) : null, nowMs());
  } catch (_e) {
    // do not block main flow on audit errors
  }
}

function deleteWorkspaceCascade(workspaceId) {
  const channelIds = db
    .prepare('SELECT id FROM channels WHERE workspace_id = ?')
    .all(workspaceId)
    .map((row) => row.id);
  const userIds = db
    .prepare('SELECT id FROM users WHERE workspace_id = ?')
    .all(workspaceId)
    .map((row) => row.id);

  const tx = db.transaction(() => {
    if (channelIds.length) {
      const channelPlaceholders = channelIds.map(() => '?').join(',');
      const messageIdQuery = `SELECT id FROM messages WHERE channel_id IN (${channelPlaceholders})`;
      const replyIdQuery = `SELECT id FROM replies WHERE message_id IN (${messageIdQuery})`;

      db.prepare(`DELETE FROM message_reaction_users WHERE message_id IN (${messageIdQuery})`).run(
        ...channelIds
      );
      db.prepare(`DELETE FROM message_reactions WHERE message_id IN (${messageIdQuery})`).run(
        ...channelIds
      );
      db.prepare(`DELETE FROM reply_reaction_users WHERE reply_id IN (${replyIdQuery})`).run(
        ...channelIds
      );
      db.prepare(`DELETE FROM reply_reactions WHERE reply_id IN (${replyIdQuery})`).run(...channelIds);
      db.prepare(`DELETE FROM replies WHERE message_id IN (${messageIdQuery})`).run(...channelIds);
      db.prepare(`DELETE FROM messages WHERE channel_id IN (${channelPlaceholders})`).run(...channelIds);
      db.prepare(`DELETE FROM channel_members WHERE channel_id IN (${channelPlaceholders})`).run(
        ...channelIds
      );
    }

    db.prepare('DELETE FROM channels WHERE workspace_id = ?').run(workspaceId);
    db.prepare('DELETE FROM workspace_members WHERE workspace_id = ?').run(workspaceId);
    db.prepare('DELETE FROM calendar_events WHERE workspace_id = ?').run(workspaceId);

    if (userIds.length) {
      const userPlaceholders = userIds.map(() => '?').join(',');
      const dmIds = db
        .prepare(`SELECT id FROM dms WHERE created_by IN (${userPlaceholders})`)
        .all(...userIds)
        .map((row) => row.id);

      db.prepare(`DELETE FROM dm_members WHERE user_id IN (${userPlaceholders})`).run(...userIds);

      if (dmIds.length) {
        const dmPlaceholders = dmIds.map(() => '?').join(',');
        const dmMsgQuery = `SELECT id FROM dm_messages WHERE dm_id IN (${dmPlaceholders})`;
        const dmReplyQuery = `SELECT id FROM dm_replies WHERE dm_message_id IN (${dmMsgQuery})`;

        db.prepare(`DELETE FROM dm_reply_reaction_users WHERE reply_id IN (${dmReplyQuery})`).run(
          ...dmIds
        );
        db.prepare(`DELETE FROM dm_reply_reactions WHERE reply_id IN (${dmReplyQuery})`).run(
          ...dmIds
        );
        db.prepare(`DELETE FROM dm_replies WHERE dm_message_id IN (${dmMsgQuery})`).run(...dmIds);
        db.prepare(
          `DELETE FROM dm_message_reaction_users WHERE message_id IN (${dmMsgQuery})`
        ).run(...dmIds);
        db.prepare(`DELETE FROM dm_message_reactions WHERE message_id IN (${dmMsgQuery})`).run(
          ...dmIds
        );
        db.prepare(`DELETE FROM dm_messages WHERE dm_id IN (${dmPlaceholders})`).run(...dmIds);
        db.prepare(`DELETE FROM dm_members WHERE dm_id IN (${dmPlaceholders})`).run(...dmIds);
        db.prepare(`DELETE FROM dms WHERE id IN (${dmPlaceholders})`).run(...dmIds);
      }

      db.prepare(`DELETE FROM channel_members WHERE user_id IN (${userPlaceholders})`).run(...userIds);
      db.prepare(`DELETE FROM users WHERE id IN (${userPlaceholders})`).run(...userIds);
    }

    db.prepare('DELETE FROM workspaces WHERE id = ?').run(workspaceId);
  });

  tx();
}

function deleteUserCascade(userId) {
  const existing = db
    .prepare('SELECT id, workspace_id AS workspaceId FROM users WHERE id = ?')
    .get(userId);
  if (!existing) {
    return null;
  }

  const tx = db.transaction(() => {
    db.prepare('DELETE FROM channel_members WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM workspace_members WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM dm_members WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM refresh_tokens WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM revoked_access_tokens WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM password_history WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM password_resets WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM login_attempts WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM security_events WHERE actor_user_id = ? OR target_user_id = ?').run(userId, userId);
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  });

  tx();
  return existing.workspaceId;
}

function getSupportEmailFallback() {
  const raw = String(ENV.EMAIL_FROM || '').trim();
  if (!raw) {
    return 'support@example.com';
  }
  const match = raw.match(/<([^>]+)>/);
  if (match && match[1]) {
    return match[1];
  }
  return raw;
}

app.post("/api/register/send-link", async (req, res) => {
  try {
    const authed = getAuthedUser(req);
    if (!authed) return res.status(401).json({ error: "Unauthorized" });

    const role = String(authed.role || "").toLowerCase();
    const isAdmin = ["super_admin", "admin", "school_admin"].includes(role);
    if (!isAdmin) {
      return res.status(403).json({ error: "Admin access required" });
    }

    const requestedWorkspaceId = String(req.body?.workspaceId || "").trim();
    if (role === "school_admin" && requestedWorkspaceId && String(authed.workspaceId) !== requestedWorkspaceId) {
      return res.status(403).json({ error: "Workspace isolation: denied" });
    }

    const {
      role: inviteRole, email, workspaceId, channelId,
      courseLevel, courseStart, courseEnd,
      firstName, lastName, salutation, dateOfBirth,
      phoneCountry, phoneNumber,
      nativeLanguage, learningGoal, availableDays,
      emergencyName, emergencyPhone, emergencyRelation
    } = req.body || {};

    const roleNorm = String(inviteRole || "").trim().toLowerCase();
    const firstNameNorm = String(firstName || "").trim();
    const lastNameNorm = String(lastName || "").trim();
    const dobNorm = String(dateOfBirth || "").trim();
    const emailNorm = String(email || "").trim().toLowerCase();
    const phoneNorm = String(phoneNumber || "").trim();
    if (!workspaceId) return res.status(400).json({ error: "workspaceId required" });
    if (!emailNorm) return res.status(400).json({ error: "email required" });
    if (!["student", "teacher"].includes(roleNorm)) {
      return res.status(400).json({ error: "role must be student or teacher" });
    }

    const ws = db.prepare("SELECT id FROM workspaces WHERE id = ?").get(workspaceId);
    if (!ws) return res.status(404).json({ error: "workspace not found" });

    if (emailNorm) {
      const existingEmail = db
        .prepare('SELECT id FROM users WHERE workspace_id = ? AND lower(email) = lower(?) LIMIT 1')
        .get(workspaceId, emailNorm);
      if (existingEmail) {
        return res.status(400).json({ error: 'Email already used', field: 'email' });
      }
    }
    if (phoneNorm) {
      const existingPhone = db
        .prepare('SELECT id FROM users WHERE workspace_id = ? AND phone_number = ? LIMIT 1')
        .get(workspaceId, phoneNorm);
      if (existingPhone) {
        return res.status(400).json({ error: 'Phone number already used', field: 'phone' });
      }
    }
    if (firstNameNorm && lastNameNorm && dobNorm) {
      const existingNameDob = db
        .prepare(
          'SELECT id FROM users WHERE workspace_id = ? AND lower(first_name) = lower(?) AND lower(last_name) = lower(?) AND date_of_birth = ? LIMIT 1'
        )
        .get(workspaceId, firstNameNorm, lastNameNorm, dobNorm);
      if (existingNameDob) {
        return res.status(400).json({ error: 'Name and date of birth already registered', field: 'nameDob' });
      }
    }

    if (channelId) {
      const ch = db.prepare("SELECT id, workspace_id, category FROM channels WHERE id = ?").get(channelId);
      if (!ch) return res.status(404).json({ error: "class not found" });
      if (String(ch.workspace_id) !== String(workspaceId)) {
        return res.status(400).json({ error: "class not in this workspace" });
      }
    }

    const token = makeInviteToken();
    const createdAt = new Date().toISOString();
    const expiresAt = nowMs() + REG_LINK_EXPIRY_HOURS * 60 * 60 * 1000;

    const invitePayload = {
      token,
      workspace_id: workspaceId,
      channel_id: channelId || null,
      role: roleNorm,
      email: emailNorm,
      course_level: courseLevel || null,
      course_start: courseStart || null,
      course_end: courseEnd || null,
      first_name: firstName || null,
      last_name: lastName || null,
      salutation: salutation || "",
      date_of_birth: dateOfBirth || null,
      phone_country: phoneCountry || "",
      phone_number: phoneNumber || "",
      native_language: nativeLanguage || "",
      learning_goal: learningGoal || "",
      available_days: JSON.stringify(Array.isArray(availableDays) ? availableDays : []),
      emergency_contact_name: emergencyName || "",
      emergency_contact_phone: emergencyPhone || "",
      emergency_contact_relation: emergencyRelation || "",
      created_by_user_id: null,
      created_at: createdAt,
      expires_at: expiresAt,
      used: 0,
      used_at: null
    };

    insertAdaptive('registration_links', invitePayload);
    audit('registration.invite_created', req, {
      user: authed,
      target: token,
      workspaceId,
      meta: {
        email: emailNorm,
        role: roleNorm,
        channelId: channelId || null
      }
    });

    const link = `${getBaseUrl(PORT)}/register?token=${encodeURIComponent(token)}`;
    const displayName = `${String(firstName || '').trim()} ${String(lastName || '').trim()}`.trim() || 'Student';
    const schoolName = getWorkspaceName(workspaceId);
    const vars = {
      student_name: displayName,
      school_name: schoolName,
      login_url: link,
      registration_url: link,
      support_email: getSupportEmailFallback()
    };
    const rendered = renderWorkspaceTemplate(workspaceId, 'welcome_email', vars);
    const subject = rendered.subject || `Welcome to ${schoolName}`;
    const html = rendered.bodyInnerHtml || `<p>Hi ${displayName},</p><p>Your registration link: <a href="${link}">${link}</a></p>`;
    const text = rendered.bodyText || `Welcome to ${schoolName}. Open your registration link: ${link}`;
    const fromName = buildAutomatedEmailSenderName(schoolName, 'welcome_email');

    console.log('SEND-LINK: provider =', providerName);
    console.log('SEND-LINK: from =', ENV.EMAIL_FROM);
    console.log('SEND-LINK: smtp host =', ENV.SMTP_HOST);
    console.log('SEND-LINK: smtp user =', ENV.SMTP_USER);
    console.log('SEND-LINK: to =', emailNorm);
    console.log('SEND-LINK: link =', link);

    try {
      await sendPlatformEmail({ to: emailNorm, subject, html, text, fromName });
      console.log('SEND-LINK: ✅ email sent');
    } catch (err) {
      console.error('SEND-LINK: ❌ email failed:', err?.message || err);
      console.error(err);
      return res.status(500).json({ error: 'Could not send registration email' });
    }

    return res.json({ ok: true, token, link });
  } catch (e) {
    console.error("send-link failed:", e);
    return res.status(500).json({ error: "Could not create/send link" });
  }
});
app.get("/api/register/link/:token", (req, res) => {
  try {
    const token = String(req.params.token || "").trim();
    const row = db.prepare(`
      SELECT *
      FROM registration_links
      WHERE token = ?
    `).get(token);

    if (!row) return res.status(404).json({ error: "Invalid token" });
    if (row.used) return res.status(400).json({ error: "Link already used" });
    if (Number(row.expires_at) < nowMs()) return res.status(400).json({ error: "Link expired" });

    return res.json({
      token: row.token,
      workspaceId: row.workspace_id,
      workspaceName: getWorkspaceName(row.workspace_id),
      classId: row.channel_id || "",
      role: row.role,
      email: row.email,
      courseLevel: row.course_level || "",
      courseStart: row.course_start || "",
      courseEnd: row.course_end || "",
      firstName: row.first_name || "",
      lastName: row.last_name || "",
      salutation: row.salutation || "",
      dateOfBirth: row.date_of_birth || "",
      phoneCountry: row.phone_country || "",
      phoneNumber: row.phone_number || "",
      nativeLanguage: row.native_language || "",
      learningGoal: row.learning_goal || "",
      availableDays: safeJsonParse(row.available_days || "[]", []),
      emergencyName: row.emergency_contact_name || "",
      emergencyPhone: row.emergency_contact_phone || "",
      emergencyRelation: row.emergency_contact_relation || ""
    });
  } catch (e) {
    console.error("link fetch failed:", e);
    return res.status(500).json({ error: "Could not load link" });
  }
});
app.post('/api/register/complete', async (req, res) => {
  try {
    const {
      token,
      firstName,
      lastName,
      dateOfBirth: dateOfBirthInput,
      password,
      salutation: salutationInput,
      courseStart,
      courseEnd,
      phoneCountry: phoneCountryInput,
      phoneNumber: phoneNumberInput,
      nativeLanguage: nativeLanguageInput,
      learningGoal: learningGoalInput,
      availableDays: availableDaysInput,
      emergencyName: emergencyNameInput,
      emergencyPhone: emergencyPhoneInput,
      emergencyRelation: emergencyRelationInput
    } = req.body || {};
    const tokenNorm = String(token || '').trim();

    if (!tokenNorm) return res.status(400).json({ error: 'token is required' });
    if (!firstName || !String(firstName).trim()) return res.status(400).json({ error: 'firstName is required' });
    if (!lastName || !String(lastName).trim()) return res.status(400).json({ error: 'lastName is required' });
    if (!password || !String(password).trim()) return res.status(400).json({ error: 'password is required' });
    if (!validatePassword(String(password).trim())) {
      return res.status(400).json({
        error: 'Password must be at least 8 characters and include upper, lower, number, and symbol.'
      });
    }

    const linkRow = db
      .prepare(`
        SELECT token, workspace_id AS workspaceId, channel_id AS classId, role, email,
               course_level AS courseLevel, course_start AS linkCourseStart, course_end AS linkCourseEnd,
               expires_at AS expiresAt, used,
               first_name AS linkFirstName, last_name AS linkLastName,
               salutation AS linkSalutation, date_of_birth AS linkDateOfBirth,
               phone_country AS linkPhoneCountry, phone_number AS linkPhoneNumber,
               native_language AS linkNativeLanguage, learning_goal AS linkLearningGoal,
               available_days AS linkAvailableDays, emergency_contact_name AS linkEmergencyName,
               emergency_contact_phone AS linkEmergencyPhone, emergency_contact_relation AS linkEmergencyRelation
        FROM registration_links WHERE token = ?
      `)
      .get(tokenNorm);

    if (!linkRow) return res.status(404).json({ error: 'Invalid token' });
    if (linkRow.used) return res.status(400).json({ error: 'This link was already used' });
    if (Number(linkRow.expiresAt) < nowMs()) return res.status(400).json({ error: 'This link expired' });

    const linkSalutation = String(linkRow.linkSalutation || '').trim();
    const linkDateOfBirth = String(linkRow.linkDateOfBirth || '').trim() || null;
    const linkPhoneCountry = String(linkRow.linkPhoneCountry || '').trim() || null;
    const linkPhoneNumber = String(linkRow.linkPhoneNumber || '').trim() || null;
    const linkNativeLanguage = String(linkRow.linkNativeLanguage || '').trim() || null;
    const linkLearningGoal = String(linkRow.linkLearningGoal || '').trim() || null;
    const linkEmergencyName = String(linkRow.linkEmergencyName || '').trim() || null;
    const linkEmergencyPhone = String(linkRow.linkEmergencyPhone || '').trim() || null;
    const linkEmergencyRelation = String(linkRow.linkEmergencyRelation || '').trim() || null;
    const parsedLinkAvailableDays = safeJsonParse(linkRow.linkAvailableDays || '[]', []);
    const linkAvailableDays = Array.isArray(parsedLinkAvailableDays)
      ? parsedLinkAvailableDays
      : [];

    const availableDaysList = Array.isArray(availableDaysInput)
      ? availableDaysInput.map((day) => String(day || '').trim()).filter(Boolean)
      : [];
    const availableDaysFinal = availableDaysList.length
      ? availableDaysList.join(',')
      : linkAvailableDays.length
      ? linkAvailableDays.join(',')
      : null;

    const finalCourseStart = String(courseStart || linkRow.linkCourseStart || '').trim() || null;
    const finalCourseEnd = String(courseEnd || linkRow.linkCourseEnd || '').trim() || null;
    const finalPhoneCountry =
      String(phoneCountryInput || linkPhoneCountry || '').trim() || null;
    const finalPhoneNumber =
      String(phoneNumberInput || linkPhoneNumber || '').trim() || null;
    const finalNativeLanguage =
      String(nativeLanguageInput || linkNativeLanguage || '').trim() || null;
    const finalLearningGoal =
      String(learningGoalInput || linkLearningGoal || '').trim() || null;
    const finalEmergencyName =
      String(emergencyNameInput || linkEmergencyName || '').trim() || null;
    const finalEmergencyPhone =
      String(emergencyPhoneInput || linkEmergencyPhone || '').trim() || null;
    const finalEmergencyRelation =
      String(emergencyRelationInput || linkEmergencyRelation || '').trim() || null;
    const finalSalutation = String(salutationInput || linkSalutation || '').trim() || null;
    const finalDateOfBirth = String(dateOfBirthInput || linkDateOfBirth || '').trim() || null;

    const existing = db
      .prepare('SELECT id FROM users WHERE workspace_id = ? AND lower(email) = lower(?) LIMIT 1')
      .get(linkRow.workspaceId, linkRow.email);

    if (existing) {
      return res.status(409).json({
        error: 'This email is already registered. Please login or reset your password.',
        action: 'login_or_reset',
        login: true,
        forgotPassword: true,
        workspaceId: linkRow.workspaceId
      });
    }
    if (finalPhoneNumber) {
      const existingPhone = db
        .prepare('SELECT id FROM users WHERE workspace_id = ? AND phone_number = ? LIMIT 1')
        .get(linkRow.workspaceId, finalPhoneNumber);
      if (existingPhone) {
        return res.status(409).json({
          error: 'This phone number is already registered. Please login or contact your school admin.',
          action: 'already_registered_phone'
        });
      }
    }
    const normalizedFirstName = String(firstName || '').trim();
    const normalizedLastName = String(lastName || '').trim();
    if (normalizedFirstName && normalizedLastName && finalDateOfBirth) {
      const existingName = db
        .prepare(
          'SELECT id FROM users WHERE workspace_id = ? AND lower(first_name) = lower(?) AND lower(last_name) = lower(?) AND date_of_birth = ? LIMIT 1'
        )
        .get(linkRow.workspaceId, normalizedFirstName, normalizedLastName, finalDateOfBirth);
      if (existingName) {
        return res.status(409).json({
          error: 'A user with this name and date of birth already exists. Please login or ask your school admin.',
          action: 'already_registered_name_dob'
        });
      }
    }

    const tx = db.transaction(() => {
      const ws = linkRow.workspaceId;
      const fn = String(firstName).trim();
      const ln = String(lastName).trim();
      const fullName = `${fn} ${ln}`.trim();
      const username = generateUsername(ws, fn, ln);
      const userId = generateId('u');
      const passwordHash = hashPassword(String(password));
      const emailTrimmed = String(linkRow.email).trim().toLowerCase();
      const role = String(linkRow.role || 'student').trim().toLowerCase();
      const genderValue = finalSalutation || '';
      const selectedCourseLevel = (linkRow.courseLevel || '').trim() || null;

      const userObj = {
        id: userId,
        workspace_id: ws,
        first_name: fn,
        last_name: ln,
        name: fullName,
        username,
        email: emailTrimmed,
        password_hash: passwordHash,
        role,
        status: 'active',
        course_start: finalCourseStart,
        course_end: finalCourseEnd,
        course_level: selectedCourseLevel,
        salutation: finalSalutation,
        gender: genderValue,
        date_of_birth: finalDateOfBirth,
        phone_country: finalPhoneCountry,
        phone_number: finalPhoneNumber,
        native_language: finalNativeLanguage,
        learning_goal: finalLearningGoal,
        available_days: availableDaysFinal,
        emergency_contact_name: finalEmergencyName,
        emergency_contact_phone: finalEmergencyPhone,
        emergency_contact_relation: finalEmergencyRelation
      };

      insertIntoUsersAdaptive(userObj);

      db.prepare(`
        INSERT OR IGNORE INTO workspace_members (workspace_id, user_id, role)
        VALUES (?, ?, ?)
      `).run(ws, userId, role);

      addUserToDefaultChannels(ws, userId);

      if (linkRow.classId) {
        db.prepare('INSERT OR IGNORE INTO channel_members (channel_id, user_id) VALUES (?, ?)')
          .run(linkRow.classId, userId);
      }

      db.prepare(`
        UPDATE registration_links
        SET used = 1, used_at = ?
        WHERE token = ?
      `).run(new Date().toISOString(), tokenNorm);

      return { userId, workspaceId: ws };
    });

    const out = tx();

    const loginUrl = `${getBaseUrl(PORT)}/login?workspace=${encodeURIComponent(out.workspaceId)}`;
    const schoolNameForEmail = getWorkspaceName(out.workspaceId);
    const supportEmailForWelcome = getSupportEmailFallback();
    const resolvedFirstName = (body.firstName || linkRow.firstName || '').trim();
    const resolvedLastName = (body.lastName || linkRow.lastName || '').trim();
    const recipientName =
      [resolvedFirstName, resolvedLastName].filter((v) => !!v).join(' ') || linkRow.email || 'Student';
    const welcomeSubject = `Welcome to ${schoolNameForEmail} – Your Account Is Ready`;
    const welcomeHtml = `<div style="font-family:Arial,Helvetica,sans-serif;background:#f4f6f9;padding:24px;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;">

    <h2 style="margin-top:0;color:#111827;">
      Welcome to ${schoolNameForEmail} 🎉
    </h2>

    <p style="font-size:15px;color:#374151;">
      Hi ${recipientName},
    </p>

    <p style="font-size:15px;color:#374151;">
      Your account for <strong>${schoolNameForEmail}</strong> has been successfully created.
    </p>

    <div style="text-align:center;margin:28px 0;">
      <a href="${loginUrl}"
         style="background:#4f46e5;color:#ffffff;padding:12px 22px;border-radius:8px;
                text-decoration:none;font-weight:600;display:inline-block;" target="_blank">
        Open Login Page
      </a>
    </div>

    <p style="font-size:14px;color:#6b7280;">
      If the button above does not work, copy and paste the following link into your browser:
      <br>
      <a href="${loginUrl}" style="color:#4f46e5;">${loginUrl}</a>
    </p>

    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">

    <p style="font-size:13px;color:#6b7280;">
      If you need assistance, please contact us at
      <a href="mailto:${supportEmailForWelcome}" style="color:#4f46e5;">${supportEmailForWelcome}</a>.
    </p>

    <p style="font-size:12px;color:#9ca3af;margin-top:16px;">
      StudisNest powered by StudisTalk
    </p>

  </div>
</div>`;
    const welcomeText = `Welcome to ${schoolNameForEmail}. Your account is ready. Log in here: ${loginUrl}. Need help? ${supportEmailForWelcome}`;

    try {
      await sendPlatformEmail({
        to: String(linkRow.email || '').trim(),
        subject: welcomeSubject,
        html: welcomeHtml,
        text: welcomeText,
        fromName: buildAutomatedEmailSenderName(schoolNameForEmail, 'registration_complete')
      });
      console.log('REGISTER-COMPLETE: welcome email sent to', linkRow.email);
    } catch (emailErr) {
      console.error('REGISTER-COMPLETE: welcome email failed', emailErr?.message || emailErr);
    }

    return res.json({ ok: true, userId: out.userId, workspaceId: out.workspaceId });
  } catch (err) {
    console.error('Registration complete failed', err);
    return res.status(500).json({ error: err?.message || 'Could not complete registration' });
  }
});

app.get('/api/register/invite-info', (req, res) => {
  const token = String(req.query.token || '').trim();
  if (!token) return res.status(400).json({ error: 'Missing token' });

  const row = db
    .prepare(`
      SELECT rl.workspace_id AS workspaceId,
             rl.role AS role,
             rl.expires_at AS expiresAt,
             w.name AS workspaceName
      FROM registration_links rl
      LEFT JOIN workspaces w ON w.id = rl.workspace_id
      WHERE rl.token = ?
    `)
    .get(token);

  if (!row) {
    return res.status(404).json({ error: 'Invite not found' });
  }

  const admin = db
    .prepare(`
      SELECT email
      FROM users
      WHERE workspace_id = ? AND lower(role) IN ('school_admin','admin')
      ORDER BY created_at ASC
      LIMIT 1
    `)
    .get(row.workspaceId);

  res.json({
    ok: true,
    workspaceId: row.workspaceId,
    workspaceName: row.workspaceName || row.workspaceId,
    role: row.role,
    expiresAt: row.expiresAt,
    adminEmail: admin?.email || null
  });
});

function buildAiSchoolContext({ user, clientContext }) {
  if (!user) return null;
  const role = String(user.role || user.userRole || '').toLowerCase() || 'student';
  const workspaceId = user.workspaceId || user.workspace_id || 'default';
  const calendar = Array.isArray(clientContext?.calendar) ? clientContext.calendar : [];
  const context = {
    user: {
      id: user.id,
      displayName: user.name || user.username || user.email || 'User',
      email: user.email || '',
      role,
      workspaceId
    },
    calendar
  };

  const publicChannels = db
    .prepare(
      `
      SELECT id, name, topic, category
      FROM channels
      WHERE workspace_id = ?
        AND lower(category) IN ('classes','exams','homework','clubs','tools','teachers')
      ORDER BY category, name
      LIMIT 60
    `
    )
    .all(workspaceId);

  const sanitizedCourses = publicChannels.map((c) => ({
    id: c.id,
    name: c.name,
    category: c.category,
    topic: c.topic || ''
  }));

  if (role === 'student') {
    context.courses = sanitizedCourses.slice(0, 20);
    context.groups = sanitizedCourses
      .filter((c) => String(c.category || '').toLowerCase() === 'classes')
      .map((c) => ({ id: c.id, name: c.name }));
    return context;
  }

  const totals = db
    .prepare(
      `
      SELECT
        SUM(CASE WHEN lower(role) = 'student' THEN 1 ELSE 0 END) AS students,
        SUM(CASE WHEN lower(role) = 'teacher' THEN 1 ELSE 0 END) AS teachers,
        SUM(CASE WHEN lower(role) IN ('admin','school_admin','super_admin') THEN 1 ELSE 0 END) AS admins
      FROM users
      WHERE workspace_id = ?
    `
    )
    .get(workspaceId) || {};

  const teachers = db
    .prepare(
      `
      SELECT id, name, email, course_start AS courseStart, course_end AS courseEnd, course_level AS courseLevel
      FROM users
      WHERE workspace_id = ?
        AND lower(role) IN ('teacher')
      ORDER BY name
      LIMIT 80
    `
    )
    .all(workspaceId);

  const students = db
    .prepare(
      `
      SELECT id, name, course_start AS courseStart, course_end AS courseEnd, course_level AS courseLevel
      FROM users
      WHERE workspace_id = ?
        AND lower(role) = 'student'
      ORDER BY name
      LIMIT 120
    `
    )
    .all(workspaceId);

  context.stats = {
    students: totals.students || 0,
    teachers: totals.teachers || 0,
    admins: totals.admins || 0
  };
  context.teachers = teachers;
  context.studentsSummary = students;
  context.courses = sanitizedCourses;
  context.groups = sanitizedCourses
    .filter((c) => String(c.category || '').toLowerCase() === 'classes')
    .map((c) => ({ id: c.id, name: c.name }));
  return context;
}

function getSchoolStats(workspaceId) {
  const totals = db
    .prepare(
      `
      SELECT
        SUM(CASE WHEN lower(role) = 'student' THEN 1 ELSE 0 END) AS students,
        SUM(CASE WHEN lower(role) = 'teacher' THEN 1 ELSE 0 END) AS teachers,
        SUM(CASE WHEN lower(role) IN ('admin','school_admin','super_admin') THEN 1 ELSE 0 END) AS admins
      FROM users
      WHERE workspace_id = ?
    `
    )
    .get(workspaceId);
  return { students: totals?.students || 0, teachers: totals?.teachers || 0, admins: totals?.admins || 0 };
}

function listCourses(workspaceId) {
  return db
    .prepare(
      `
      SELECT id, name, topic, category
      FROM channels
      WHERE workspace_id = ?
      ORDER BY category, name
      LIMIT 50
    `
    )
    .all(workspaceId);
}

function listTeachers(workspaceId, includeEmail = false) {
  const fields = includeEmail ? 'id, name, email, course_level' : "id, name, '' AS email, course_level";
  return db
    .prepare(
      `
      SELECT ${fields}
      FROM users
      WHERE workspace_id = ? AND lower(role) IN ('teacher')
      ORDER BY name
      LIMIT 60
    `
    )
    .all(workspaceId);
}

function getDeadlines(user) {
  const workspaceId = user.workspaceId || user.workspace_id || 'default';
  const role = String(user.role || user.userRole || '').toLowerCase();
  const today = new Date().toISOString().slice(0, 10);
  let stmt;
  if (role === 'student') {
    stmt = db.prepare(
      `
      SELECT id, title, date, start_time, end_time, notes
      FROM calendar_events
      WHERE workspace_id = ?
        AND date >= ?
        AND assignee_id = ?
      ORDER BY date
      LIMIT 8
    `
    );
    return stmt.all(workspaceId, today, user.id);
  }
  if (role === 'teacher') {
    stmt = db.prepare(
      `
      SELECT id, title, date, start_time, end_time, notes
      FROM calendar_events
      WHERE workspace_id = ?
        AND date >= ?
        AND (created_by = ? OR assignee_id = ?)
      ORDER BY date
      LIMIT 12
    `
    );
    return stmt.all(workspaceId, today, user.id, user.id);
  }
  stmt = db.prepare(
    `
    SELECT id, title, date, start_time, end_time, notes
    FROM calendar_events
    WHERE workspace_id = ?
      AND date >= ?
    ORDER BY date
    LIMIT 20
  `
  );
  return stmt.all(workspaceId, today);
}

function searchKnowledge(workspaceId, query, role) {
  if (!query || !query.trim()) return [];
  const normalized = `%${query.trim().toLowerCase()}%`;
  const rows = db
    .prepare(
      `
      SELECT title, body, visibility
      FROM knowledge_items
      WHERE workspace_id = ?
        AND (lower(title) LIKE ? OR lower(body) LIKE ?)
      ORDER BY updated_at DESC
      LIMIT 8
    `
    )
    .all(workspaceId, normalized, normalized);
  return rows.filter((row) => {
    if (row.visibility === 'public') return true;
    if (role && role !== 'student') return true;
    return false;
  });
}

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderTokensPlain(input, vars) {
  const s = String(input || '');
  return s.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
    const val =
      vars && Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : '';
    return val == null ? '' : String(val);
  });
}

function renderTokensHtml(inputHtml, vars) {
  const s = String(inputHtml || '');
  return s.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
    const val =
      vars && Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : '';
    if (val == null) return '';
    if (String(key).endsWith('_html')) return String(val);
    return escapeHtml(String(val));
  });
}

function defRequiredTokens(templateKey) {
  return EMAIL_TEMPLATE_DEF_MAP.get(templateKey)?.required || [];
}

function defDefaults(templateKey) {
  const def = EMAIL_TEMPLATE_DEF_MAP.get(templateKey);
  if (!def) return { subject: '', body_html: '', body_text: '', required: [] };
  const bodyHtml = def.defaultBodyHtml || '';
  const bodyText = stripHtmlToText(bodyHtml);
  return {
    subject: def.defaultSubject || '',
    body_html: bodyHtml,
    body_text: bodyText,
    required: def.required || []
  };
}

function stripHtmlToText(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function isoDateOnly(d = new Date()) {
  const x = new Date(d);
  const yyyy = x.getFullYear();
  const mm = String(x.getMonth() + 1).padStart(2, '0');
  const dd = String(x.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function uuid(prefix = '') {
  const id = crypto.randomUUID();
  return prefix ? `${prefix}_${id}` : id;
}

function requireTeacherOrAdmin(user) {
  const role = String(user?.role || user?.user_role || '').toLowerCase();

  const okRoles = new Set([
    'admin',
    'school_admin',
    'schooladmin',
    'workspace_admin',
    'workspaceadmin',
    'owner',
    'superadmin',
    'super-admin',
    'teacher',
    'instructor'
  ]);

  if (user?.is_admin === 1 || user?.is_admin === true) return true;
  if (user?.is_teacher === 1 || user?.is_teacher === true) return true;

  return okRoles.has(role);
}

function canTakeAttendance(workspaceId, channelId, user) {
  if (requireTeacherOrAdmin(user)) return true;
  if (!workspaceId || !channelId || !user?.id) return false;

  try {
    const cm = db
      .prepare(
        `SELECT 1
         FROM channel_members
         WHERE channel_id = ? AND user_id = ?
         LIMIT 1`
      )
      .get(channelId, user.id);

    const role = String(user?.role || user?.user_role || '').toLowerCase();
    return !!cm && (role.includes('admin') || role.includes('teacher'));
  } catch {
    return false;
  }
}

function getWorkspaceIdFromUser(user) {
  return String(user?.workspaceId || user?.workspace_id || 'default');
}

function ensureChannelIsClass(workspaceId, channelId) {
  const row = db
    .prepare(
      `SELECT id, category, name
       FROM channels
       WHERE workspace_id = ? AND id = ?
       LIMIT 1`
    )
    .get(workspaceId, channelId);

  if (!row) return { ok: false, code: 404, error: 'Class channel not found' };
  const category = String(row.category || '').toLowerCase();
  if (category !== 'class' && category !== 'classes') {
    return { ok: false, code: 400, error: 'Channel is not a class' };
  }
  return { ok: true, channel: row };
}

function listClassStudents(workspaceId, channelId) {
  return db
    .prepare(
      `SELECT u.id AS user_id,
              COALESCE(u.name, u.username, u.email, u.first_name || ' ' || u.last_name) AS name,
              u.email AS email,
              LOWER(COALESCE(u.role, 'student')) AS role
       FROM channel_members cm
       JOIN users u ON u.id = cm.user_id
       WHERE cm.channel_id = ?
         AND u.workspace_id = ?
         AND LOWER(COALESCE(u.role, '')) = 'student'
       ORDER BY LOWER(COALESCE(u.name, u.username, u.email)) ASC`
    )
    .all(channelId, workspaceId);
}

function getOrCreateAttendanceSession(workspaceId, channelId, sessionDate, createdByUserId) {
  const existing = db
    .prepare(
      `SELECT * FROM attendance_sessions
       WHERE workspace_id = ? AND channel_id = ? AND session_date = ?
       LIMIT 1`
    )
    .get(workspaceId, channelId, sessionDate);

  if (existing) return existing;

  const id = uuid('asess');
  db.prepare(
    `INSERT INTO attendance_sessions (id, workspace_id, channel_id, session_date, created_by_user_id)
     VALUES (?, ?, ?, ?, ?)`
  ).run(id, workspaceId, channelId, sessionDate, createdByUserId || null);

  return db.prepare(`SELECT * FROM attendance_sessions WHERE id = ? LIMIT 1`).get(id);
}

function getWorkspaceEmailTemplateRow(workspaceId, templateKey) {
  return db
    .prepare(
      `SELECT * FROM workspace_email_templates
     WHERE workspace_id = ? AND template_key = ?
     LIMIT 1`
    )
    .get(workspaceId, templateKey);
}

function upsertWorkspaceEmailTemplate(workspaceId, templateKey, payload, userId) {
  db
    .prepare(`
    INSERT INTO workspace_email_templates
      (workspace_id, template_key, subject, body_html, body_text, required_tokens_json, enabled, updated_by_user_id, updated_at)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(workspace_id, template_key) DO UPDATE SET
      subject = excluded.subject,
      body_html = excluded.body_html,
      body_text = excluded.body_text,
      required_tokens_json = excluded.required_tokens_json,
      enabled = excluded.enabled,
      updated_by_user_id = excluded.updated_by_user_id,
      updated_at = datetime('now')
  `)
    .run(
      workspaceId,
      templateKey,
      String(payload.subject || ''),
      String(payload.body_html || ''),
      String(payload.body_text || ''),
      String(payload.required_tokens_json || '[]'),
      payload.enabled ? 1 : 0,
      userId || null
    );
}

function deleteWorkspaceEmailTemplate(workspaceId, templateKey) {
  db
    .prepare(
      `DELETE FROM workspace_email_templates WHERE workspace_id = ? AND template_key = ?`
    )
    .run(workspaceId, templateKey);
}

function listWorkspaceEmailTemplatesMerged(workspaceId) {
  const rows = db
    .prepare(`SELECT * FROM workspace_email_templates WHERE workspace_id = ?`)
    .all(workspaceId);

  const rowMap = new Map(rows.map((r) => [r.template_key, r]));
  return EMAIL_TEMPLATE_DEFS.map((def) => {
    const dbRow = rowMap.get(def.key);
    const defaults = defDefaults(def.key);
    return {
      template_key: def.key,
      label: def.label,
      required_tokens: def.required,
      enabled: dbRow ? !!dbRow.enabled : true,
      subject: dbRow?.subject || defaults.subject,
      body_html: dbRow?.body_html || defaults.body_html,
      body_text: dbRow?.body_text || defaults.body_text,
      is_custom: !!dbRow
    };
  });
}

function renderWorkspaceTemplate(workspaceId, templateKey, vars) {
  const merged = listWorkspaceEmailTemplatesMerged(workspaceId).find((t) => t.template_key === templateKey);
  if (!merged) {
    return { subject: '', bodyInnerHtml: '', bodyText: '' };
  }
  const subject = renderTokensPlain(merged.subject, vars);
  const bodyInnerHtml = renderTokensHtml(merged.body_html, vars);
  const bodyText = renderTokensPlain(merged.body_text, vars);
  return { subject, bodyInnerHtml, bodyText };
}

function normalizeLanguageCode(code = '') {
  const normalized = String(code || '').trim().toLowerCase();
  return normalized || 'en';
}

function normalizeTranslatedText(text = '') {
  return String(text || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function translateViaGoogle({ text, sourceLang, targetLang }) {
  if (!googleTranslateClient) throw new Error('google translate client missing');
  const [out] = await googleTranslateClient.translate(text, {
    from: sourceLang,
    to: targetLang
  });
  return String(out || '').trim();
}

async function translateViaLocalArgos({ text, sourceLang, targetLang }) {
  const url = process.env.LOCAL_TRANSLATOR_URL || 'http://127.0.0.1:5005/translate';
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, source: sourceLang, target: targetLang })
  });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    throw new Error(`local translator http ${r.status}: ${t.slice(0, 200)}`);
  }
  const j = await r.json().catch(() => ({}));
  return String(j.translatedText || '').trim();
}

async function translateSmart({ text, sourceLang, targetLang }) {
  const provider = String(process.env.TRANSLATION_PROVIDER || 'google').toLowerCase();
  const fallback = String(process.env.TRANSLATION_FALLBACK || 'local').toLowerCase();

  if (provider === 'google') {
    try {
      return {
        provider: 'google',
        translatedText: await translateViaGoogle({ text, sourceLang, targetLang })
      };
    } catch (e) {
      if (fallback === 'local') {
        return {
          provider: 'local',

          translatedText: await translateViaLocalArgos({ text, sourceLang, targetLang })
        };
      }
      throw e;
    }
  }

  return {
    provider: providerDefault,

    translatedText: await translateViaLocalArgos({ text, sourceLang, targetLang })
  };
}

async function detectViaGoogle(text) {
  if (!googleTranslateClient) throw new Error('google translate client missing');
  const [detections] = await googleTranslateClient.detect(text);
  const det = Array.isArray(detections) ? detections[0] : detections;
  return normalizeLanguageCode(det?.language || 'en');
}

function getUserNativeLanguage(userId) {
  if (!userId) return 'en';
  const row = db
    .prepare('SELECT native_language AS lang FROM users WHERE id = ?')
    .get(userId);
  return normalizeLanguageCode(row?.lang || 'en');
}

function getCachedTranslation(messageId, targetLang, viewerUserId = '') {
  return db
    .prepare(
      `SELECT translated_text, status, provider, error_message
       FROM message_translations
       WHERE message_id = ? AND target_language = ? AND viewer_user_id = ?`
    )
    .get(messageId, targetLang, viewerUserId || '');
}

function upsertPendingTranslation(messageId, targetLang, viewerUserId, provider = 'argos') {
  const providerDefault = String(provider || process.env.TRANSLATION_PROVIDER || 'google').toLowerCase();
  db.prepare(
    `INSERT OR IGNORE INTO message_translations
     (id, message_id, target_language, viewer_user_id, status, provider, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'pending', ?, datetime('now'), datetime('now'))`
  ).run(
    translationRowId(messageId, targetLang, viewerUserId),
    messageId,
    targetLang,
    viewerUserId || '',
    providerDefault
  );
}

function saveReadyTranslation(messageId, targetLang, translatedText, viewerUserId, provider = 'argos') {
  const resolvedProvider = provider || 'argos';
  db.prepare(
    `INSERT INTO message_translations
     (id, message_id, target_language, viewer_user_id, translated_text, status, provider, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'ready', ?, datetime('now'), datetime('now'))
     ON CONFLICT(message_id, target_language, viewer_user_id)
     DO UPDATE SET translated_text = excluded.translated_text,
                  status = 'ready',
                  provider = excluded.provider,
                  error_message = NULL,
                  updated_at = datetime('now')`
  ).run(
    translationRowId(messageId, targetLang, viewerUserId),
    messageId,
    targetLang,
    viewerUserId || '',
    translatedText,
    resolvedProvider
  );
}

function markTranslationFailed(messageId, targetLang, errMsg, viewerUserId, provider = 'argos') {
  const resolvedProvider = provider || 'argos';
  db.prepare(
    `INSERT INTO message_translations
     (id, message_id, target_language, viewer_user_id, status, provider, error_message, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'failed', ?, ?, datetime('now'), datetime('now'))
     ON CONFLICT(id)
      DO UPDATE SET status = 'failed',
                   provider = excluded.provider,
                   error_message = excluded.error_message,
                   updated_at = datetime('now')`
  ).run(
    translationRowId(messageId, targetLang, viewerUserId),
    messageId,
    targetLang,
    viewerUserId || '',
    resolvedProvider,
    String(errMsg || '')
  );
}

/* ---------- DB schema + seed ---------- */

let needsMessageTranslationsRebuild = false;
const existingMessageTranslations = db
  .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'message_translations'")
  .get();
if (
  existingMessageTranslations?.sql &&
  (!existingMessageTranslations.sql.includes('viewer_user_id') ||
    existingMessageTranslations.sql.includes('UNIQUE(message_id, target_language)'))
) {
  db.exec('DROP TABLE IF EXISTS message_translations_old');
  db.exec('PRAGMA foreign_keys = OFF');
  db.exec('ALTER TABLE message_translations RENAME TO message_translations_old');
  needsMessageTranslationsRebuild = true;
}

db.exec(`
  /* ========== WORKSPACES ========== */
  CREATE TABLE IF NOT EXISTS workspaces (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    logo_url   TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS workspace_profile (
    workspace_id TEXT PRIMARY KEY,
    street TEXT DEFAULT '',
    house_number TEXT DEFAULT '',
    postal_code TEXT DEFAULT '',
    city TEXT DEFAULT '',
    state TEXT DEFAULT '',
    country TEXT DEFAULT '',
    phone TEXT DEFAULT '',
    opening_hours_json TEXT DEFAULT '',
    website TEXT DEFAULT '',
    registration_details TEXT DEFAULT '',
    use_platform_contact_email INTEGER DEFAULT 0,
    updated_at TEXT DEFAULT (datetime('now'))
  );

  /* ========== SCHOOL REQUESTS ========== */
  CREATE TABLE IF NOT EXISTS school_requests (
    id            TEXT PRIMARY KEY,
    school_name   TEXT NOT NULL,
    admin_email   TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    status        TEXT NOT NULL DEFAULT 'PENDING',
    reviewed_by   TEXT,
    reviewed_at   TEXT,
    reject_reason TEXT,
    created_at    TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_school_requests_status
    ON school_requests(status);

  INSERT OR IGNORE INTO workspaces (id, name)
  VALUES ('default', 'Default Workspace');

  /* ========== CHANNELS ========== */
  CREATE TABLE IF NOT EXISTS channels (
    id           TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    topic        TEXT,
    members      INTEGER DEFAULT 1,
    unread       INTEGER DEFAULT 0,
    category     TEXT NOT NULL DEFAULT 'classes',
    created_at   TEXT DEFAULT (datetime('now')),
    workspace_id TEXT NOT NULL DEFAULT 'default'
  );

  CREATE INDEX IF NOT EXISTS idx_channels_ws
    ON channels(workspace_id);

  /* ========== MESSAGES ========== */
  CREATE TABLE IF NOT EXISTS messages (
    id         TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL,
    author     TEXT NOT NULL,
    initials   TEXT NOT NULL,
    avatar_url TEXT,
    time       TEXT NOT NULL,
    text       TEXT NOT NULL,
    alt        INTEGER DEFAULT 0,
    original_language TEXT DEFAULT 'en',
    FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE
  );

CREATE TABLE IF NOT EXISTS announcements (
    id          TEXT PRIMARY KEY,
    channel_id  TEXT NOT NULL,
    workspace_id TEXT NOT NULL DEFAULT 'default',
    title       TEXT NOT NULL,
    status      TEXT NOT NULL,
    priority    TEXT NOT NULL,
    content     TEXT DEFAULT '',
    author      TEXT DEFAULT 'School Administration',
    created_at  TEXT DEFAULT (datetime('now')),
    read_count  INTEGER DEFAULT 0,
    FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_announcements_channel
    ON announcements(channel_id, created_at DESC);

  CREATE TABLE IF NOT EXISTS announcement_reads (
    announcement_id TEXT NOT NULL,
    user_id         TEXT NOT NULL,
    created_at      TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (announcement_id, user_id),
    FOREIGN KEY (announcement_id) REFERENCES announcements(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS message_translations (
    id              TEXT PRIMARY KEY,
    message_id      TEXT NOT NULL,
    target_language TEXT NOT NULL,
    viewer_user_id  TEXT NOT NULL DEFAULT 'anon',
    translated_text TEXT,
    provider        TEXT DEFAULT 'argos',
    status          TEXT NOT NULL DEFAULT 'pending',
    error_message   TEXT,
    created_at      TEXT DEFAULT (datetime('now')),
    updated_at      TEXT DEFAULT (datetime('now')),
    UNIQUE(message_id, target_language, viewer_user_id),
    FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_msg_translations_lookup
    ON message_translations(message_id, target_language, viewer_user_id);

  /* ========== REPLIES ========== */
  CREATE TABLE IF NOT EXISTS replies (
    id         TEXT PRIMARY KEY,
    message_id TEXT NOT NULL,
    author     TEXT NOT NULL,
    initials   TEXT NOT NULL,
    avatar_url TEXT,
    time       TEXT NOT NULL,
    text       TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
  );

  /* ========== REACTIONS ========== */
  CREATE TABLE IF NOT EXISTS message_reactions (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id TEXT NOT NULL,
    emoji      TEXT NOT NULL,
    count      INTEGER DEFAULT 1,
    UNIQUE (message_id, emoji),
    FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS message_reaction_users (
    message_id TEXT NOT NULL,
    emoji      TEXT NOT NULL,
    user_id    TEXT NOT NULL,
    PRIMARY KEY (message_id, emoji, user_id),
    FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS reply_reactions (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    reply_id TEXT NOT NULL,
    emoji    TEXT NOT NULL,
    count    INTEGER DEFAULT 1,
    UNIQUE (reply_id, emoji),
    FOREIGN KEY (reply_id) REFERENCES replies(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS reply_reaction_users (
    reply_id TEXT NOT NULL,
    emoji    TEXT NOT NULL,
    user_id  TEXT NOT NULL,
    PRIMARY KEY (reply_id, emoji, user_id),
    FOREIGN KEY (reply_id) REFERENCES replies(id) ON DELETE CASCADE
  );

  /* ========== POLICY ACCEPTANCE ========== */
  CREATE TABLE IF NOT EXISTS policy_acceptances (
    id           TEXT PRIMARY KEY,
    user_id      TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    version      TEXT NOT NULL,
    accepted_at  TEXT DEFAULT (datetime('now')),
    UNIQUE (user_id, workspace_id, version),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_policy_acceptances_user ON policy_acceptances(user_id);

  /* ========== DMS ========== */
  CREATE TABLE IF NOT EXISTS dms (
    id       TEXT PRIMARY KEY,
    name     TEXT NOT NULL,
    initials TEXT NOT NULL,
    online   INTEGER DEFAULT 0,
    created_by TEXT
  );

  CREATE TABLE IF NOT EXISTS dm_messages (
    id       TEXT PRIMARY KEY,
    dm_id    TEXT NOT NULL,
    author   TEXT NOT NULL,
    initials TEXT NOT NULL,
    time     TEXT NOT NULL,
    text     TEXT NOT NULL,
    FOREIGN KEY (dm_id) REFERENCES dms(id) ON DELETE CASCADE
  );

  /* ========== DM MESSAGE REACTIONS ========== */
  CREATE TABLE IF NOT EXISTS dm_message_reactions (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id TEXT NOT NULL,
    emoji      TEXT NOT NULL,
    count      INTEGER DEFAULT 1,
    UNIQUE (message_id, emoji),
    FOREIGN KEY (message_id) REFERENCES dm_messages(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS dm_message_reaction_users (
    message_id TEXT NOT NULL,
    emoji      TEXT NOT NULL,
    user_id    TEXT NOT NULL,
    PRIMARY KEY (message_id, emoji, user_id),
    FOREIGN KEY (message_id) REFERENCES dm_messages(id) ON DELETE CASCADE
  );

  /* ========== DM REPLIES ========== */
  CREATE TABLE IF NOT EXISTS dm_replies (
    id          TEXT PRIMARY KEY,
    dm_message_id TEXT NOT NULL,
    author      TEXT NOT NULL,
    initials    TEXT NOT NULL,
    avatar_url  TEXT,
    time        TEXT NOT NULL,
    text        TEXT NOT NULL,
    created_at  TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (dm_message_id) REFERENCES dm_messages(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS dm_reply_reactions (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    reply_id TEXT NOT NULL,
    emoji    TEXT NOT NULL,
    count    INTEGER DEFAULT 1,
    UNIQUE (reply_id, emoji),
    FOREIGN KEY (reply_id) REFERENCES dm_replies(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS dm_reply_reaction_users (
    reply_id TEXT NOT NULL,
    emoji    TEXT NOT NULL,
    user_id  TEXT NOT NULL,
    PRIMARY KEY (reply_id, emoji, user_id),
    FOREIGN KEY (reply_id) REFERENCES dm_replies(id) ON DELETE CASCADE
  );

  /* ========== FILES REGISTRY ========== */
  CREATE TABLE IF NOT EXISTS files_registry (
    file_id       TEXT PRIMARY KEY,
    workspace_id  TEXT NOT NULL,
    channel_id    TEXT NOT NULL,
    message_id    TEXT NOT NULL,
    uploader_id   TEXT,
    purpose       TEXT DEFAULT 'media',
    file_name     TEXT NOT NULL,
    mime          TEXT DEFAULT 'application/octet-stream',
    size_bytes    INTEGER DEFAULT 0,
    url           TEXT NOT NULL,
    pinned        INTEGER DEFAULT 0,
    deleted       INTEGER DEFAULT 0,
    replaced_from TEXT,
    created_at    TEXT DEFAULT (datetime('now')),
    updated_at    TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_files_registry_ws
    ON files_registry(workspace_id);

  CREATE INDEX IF NOT EXISTS idx_files_registry_ws_channel
    ON files_registry(workspace_id, channel_id);

  CREATE INDEX IF NOT EXISTS idx_files_registry_ws_purpose
    ON files_registry(workspace_id, purpose);

  CREATE INDEX IF NOT EXISTS idx_files_registry_ws_pinned
    ON files_registry(workspace_id, pinned);

  /* ========== FILE EVENTS (ANALYTICS) ========== */
  CREATE TABLE IF NOT EXISTS file_events (
    id           TEXT PRIMARY KEY,
    file_id      TEXT NOT NULL,
    workspace_id TEXT NOT NULL DEFAULT 'default',
    user_id      TEXT,
    event_type   TEXT NOT NULL,
    purpose      TEXT,
    channel_id   TEXT,
    message_id   TEXT,
    file_name    TEXT,
    mime         TEXT,
    file_url     TEXT,
    created_at   TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_file_events_workspace
    ON file_events(workspace_id);

  CREATE INDEX IF NOT EXISTS idx_file_events_created
    ON file_events(created_at);

  CREATE INDEX IF NOT EXISTS idx_file_events_file
    ON file_events(file_id);

  /* ========== DM MEMBERS ========== */
  CREATE TABLE IF NOT EXISTS dm_members (
    dm_id   TEXT NOT NULL,
    user_id TEXT NOT NULL,
    PRIMARY KEY (dm_id, user_id),
    FOREIGN KEY (dm_id) REFERENCES dms(id) ON DELETE CASCADE
  );

  /* ========== USERS ========== */
  CREATE TABLE IF NOT EXISTS users (
    id           TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    first_name   TEXT NOT NULL,
    last_name    TEXT NOT NULL,
    name         TEXT NOT NULL,
    avatar_url   TEXT,
    email        TEXT,
    password_hash TEXT,
    role         TEXT DEFAULT 'member',
    status       TEXT DEFAULT 'active',
    course_start TEXT,
    course_end   TEXT,
    course_level TEXT,
    salutation   TEXT DEFAULT '',
    gender       TEXT DEFAULT '',
    date_of_birth TEXT,
    phone_country TEXT DEFAULT '',
    phone_number TEXT DEFAULT '',
    teaching_languages TEXT DEFAULT '',
    employment_type TEXT DEFAULT '',
    available_days TEXT DEFAULT '',
    emergency_contact_name TEXT DEFAULT '',
    emergency_contact_phone TEXT DEFAULT '',
    emergency_contact_relation TEXT DEFAULT '',
    username     TEXT NOT NULL,
    native_language TEXT DEFAULT 'en',
    learning_goal TEXT DEFAULT '',
    native_language_confirmed INTEGER DEFAULT 0,
    created_at   TEXT DEFAULT (datetime('now')),
    UNIQUE (workspace_id, username)
  );

  CREATE TABLE IF NOT EXISTS user_preferences (
    user_id      TEXT NOT NULL,
    workspace_id TEXT NOT NULL DEFAULT 'default',
    pref_key     TEXT NOT NULL,
    pref_value   TEXT NOT NULL,
    updated_at   TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, workspace_id, pref_key),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
  );

  /* ========== USER CHANNEL PREFERENCES ========== */
  CREATE TABLE IF NOT EXISTS user_channel_prefs (
    user_id              TEXT NOT NULL,
    channel_id           TEXT NOT NULL,
    culture_read_language TEXT DEFAULT 'en',
    updated_at           TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, channel_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_user_channel_prefs_user ON user_channel_prefs(user_id);

  /* ========== KNOWLEDGE ITEMS ========== */
  CREATE TABLE IF NOT EXISTS knowledge_items (
    id          TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL DEFAULT 'default',
    title       TEXT NOT NULL,
    body        TEXT NOT NULL,
    visibility  TEXT NOT NULL DEFAULT 'public',
    tags        TEXT,
    updated_at  TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_knowledge_ws ON knowledge_items(workspace_id);

  /* ========== EMAIL HISTORY LOGS ========== */
  CREATE TABLE IF NOT EXISTS workspace_email_logs (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    sent_by_user_id TEXT,
    to_email TEXT NOT NULL,
    to_name TEXT,
    subject TEXT,
    body_text TEXT,
    body_html TEXT,
    type TEXT DEFAULT 'test',
    status TEXT DEFAULT 'sent',
    error_message TEXT,
    message_id TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_workspace_email_logs_ws
    ON workspace_email_logs(workspace_id);

  /* ======================== */
  /* Learning & progress tables */
  /* ======================== */
  CREATE TABLE IF NOT EXISTS student_notes (
    workspace_id TEXT NOT NULL,
    student_id   TEXT NOT NULL,
    note         TEXT DEFAULT '',
    updated_by   TEXT,
    updated_at   TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (workspace_id, student_id)
  );

  CREATE INDEX IF NOT EXISTS idx_student_notes_ws
    ON student_notes(workspace_id);

  CREATE INDEX IF NOT EXISTS idx_student_notes_student
    ON student_notes(student_id);

  CREATE TABLE IF NOT EXISTS student_progress (
    id           TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    student_id   TEXT NOT NULL,
    cefr_level   TEXT,
    completion_pct INTEGER DEFAULT NULL,
    updated_by   TEXT,
    updated_at   TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_student_progress_ws_student
    ON student_progress(workspace_id, student_id);

  CREATE INDEX IF NOT EXISTS idx_student_progress_updated
    ON student_progress(updated_at);

  CREATE TABLE IF NOT EXISTS homework_items (
    id               TEXT PRIMARY KEY,
    workspace_id     TEXT NOT NULL,
    class_channel_id TEXT NOT NULL,
    title            TEXT NOT NULL,
    description      TEXT DEFAULT '',
    resource_url     TEXT,
    due_date         TEXT,
    is_archived      INTEGER NOT NULL DEFAULT 0,
    created_by       TEXT,
    created_at       TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_homework_items_ws_class
    ON homework_items(workspace_id, class_channel_id);

  CREATE INDEX IF NOT EXISTS idx_homework_items_created
    ON homework_items(created_at);

  CREATE TABLE IF NOT EXISTS homework_completions (
    homework_id  TEXT NOT NULL,
    student_id   TEXT NOT NULL,
    completed_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY(homework_id, student_id)
  );

  CREATE INDEX IF NOT EXISTS idx_homework_completions_student
    ON homework_completions(student_id);

  CREATE TABLE IF NOT EXISTS certificates (
    id               TEXT PRIMARY KEY,
    workspace_id     TEXT NOT NULL,
    student_id       TEXT NOT NULL,
    class_channel_id TEXT NOT NULL,
    cefr_level       TEXT,
    hours            REAL,
    issued_by        TEXT,
    teacher_name     TEXT,
    school_name      TEXT,
    course_start     TEXT,
    course_end       TEXT,
    issued_at        TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_certificates_ws_class
    ON certificates(workspace_id, class_channel_id);

  CREATE INDEX IF NOT EXISTS idx_certificates_student
    ON certificates(student_id);

  CREATE INDEX IF NOT EXISTS idx_certificates_issued
    ON certificates(issued_at);

  CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
  CREATE INDEX IF NOT EXISTS idx_users_ws
    ON users(workspace_id);

  /* ========== MEMBERSHIPS ========== */
  CREATE TABLE IF NOT EXISTS workspace_members (
    workspace_id TEXT NOT NULL,
    user_id      TEXT NOT NULL,
    role         TEXT DEFAULT 'member',
    PRIMARY KEY (workspace_id, user_id),
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS channel_members (
    channel_id TEXT NOT NULL,
    user_id    TEXT NOT NULL,
    PRIMARY KEY (channel_id, user_id),
    FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS registration_links (
    token TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    channel_id TEXT,
    role TEXT NOT NULL,
    email TEXT NOT NULL,
    course_level TEXT,
    first_name TEXT,
    last_name TEXT,
    salutation TEXT DEFAULT '',
    date_of_birth TEXT,
    phone_country TEXT DEFAULT '',
    phone_number TEXT DEFAULT '',
    native_language TEXT DEFAULT '',
    learning_goal TEXT DEFAULT '',
    available_days TEXT DEFAULT '',
    emergency_contact_name TEXT DEFAULT '',
    emergency_contact_phone TEXT DEFAULT '',
    emergency_contact_relation TEXT DEFAULT '',
    course_start TEXT,
    course_end TEXT,
    created_by_user_id TEXT,
    created_at TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    used INTEGER NOT NULL DEFAULT 0,
    used_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_registration_links_email ON registration_links(email);
  CREATE INDEX IF NOT EXISTS idx_registration_links_ws ON registration_links(workspace_id);
`);

safeAlter(`
  ALTER TABLE announcements ADD COLUMN read_count INTEGER DEFAULT 0
`);

try {
  const CEFR = new Set(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']);
  const rows = db
    .prepare(
      `SELECT id AS studentId, workspace_id AS workspaceId, UPPER(TRIM(COALESCE(course_level, ''))) AS lvl
       FROM users
       WHERE course_level IS NOT NULL AND TRIM(course_level) != ''`
    )
    .all();
  const insertMath = db.prepare(`
    INSERT OR IGNORE INTO student_progress (id, workspace_id, student_id, cefr_level, updated_by)
    VALUES (?, ?, ?, ?, ?)
  `);
  rows.forEach((row) => {
    if (!row || !row.studentId || !row.workspaceId) return;
    if (!CEFR.has(row.lvl)) return;
    insertMath.run(secId('prog'), row.workspaceId, row.studentId, row.lvl, 'migration');
  });
} catch (err) {
  console.warn('CEFR backfill skipped/failed:', err?.message || err);
}

  // =========================
  // Security tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS security_events (
      id TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL,
      workspace_id TEXT,
      actor_user_id TEXT,
      target_user_id TEXT,
      type TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'info',
      ip TEXT,
      user_agent TEXT,
      payload TEXT
    );
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_security_events_created ON security_events(created_at DESC);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS login_attempts (
      id TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL,
      identifier TEXT NOT NULL,
      success INTEGER NOT NULL DEFAULT 0,
      user_id TEXT,
      workspace_id TEXT,
      ip TEXT,
      user_agent TEXT
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_login_attempts_created ON login_attempts(created_at DESC);`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS password_history (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_password_history_user ON password_history(user_id, created_at DESC);`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS ip_blocklist (
      ip TEXT PRIMARY KEY,
      reason TEXT,
      created_at INTEGER NOT NULL,
      created_by TEXT
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_ip_blocklist_created ON ip_blocklist(created_at DESC);`);
  /* ========== LIVE CLASS SESSIONS ========== */
  db.exec(`
    /* ========== LIVE CLASS SESSIONS ========== */
    CREATE TABLE IF NOT EXISTS live_sessions (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL DEFAULT 'default',
      channel_id TEXT,
      title TEXT DEFAULT 'Live Class',
      date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      meeting_url TEXT NOT NULL,
      meeting_pass TEXT,
      student_notes TEXT,
      status TEXT NOT NULL DEFAULT 'scheduled',
      autopost_mode TEXT DEFAULT 'none',
      created_by TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT,
      audience TEXT,
      FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE
    );

    /* ========== LIVE ATTENDANCE ========== */
    CREATE TABLE IF NOT EXISTS live_attendance (
      session_id TEXT NOT NULL,
      student_id TEXT NOT NULL,
      joined_at TEXT,
      status TEXT DEFAULT 'unmarked',
      note TEXT,
      updated_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (session_id, student_id),
      FOREIGN KEY (session_id) REFERENCES live_sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_live_attendance_student ON live_attendance(student_id);

    CREATE TABLE IF NOT EXISTS attendance_sessions (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      session_date TEXT NOT NULL,
      created_by_user_id TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      locked_by TEXT DEFAULT '',
      locked_at TEXT DEFAULT '',
      UNIQUE(channel_id, session_date)
    );

    CREATE TABLE IF NOT EXISTS attendance_records (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      student_user_id TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('present','absent')),
      marked_by_user_id TEXT,
      marked_at TEXT DEFAULT (datetime('now')),
      UNIQUE(session_id, student_user_id)
    );

    CREATE TABLE IF NOT EXISTS attendance_notifications (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      student_user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      sent_at TEXT DEFAULT (datetime('now')),
      UNIQUE(session_id, student_user_id, type)
    );

    CREATE INDEX IF NOT EXISTS idx_att_sess_channel_date
      ON attendance_sessions(channel_id, session_date);

    CREATE INDEX IF NOT EXISTS idx_att_records_session
      ON attendance_records(session_id);

    CREATE INDEX IF NOT EXISTS idx_att_records_student
      ON attendance_records(student_user_id);

    /* ========== EMAIL SETTINGS & EVENTS ========== */
    CREATE TABLE IF NOT EXISTS workspace_email_settings (
      workspace_id TEXT PRIMARY KEY,
      enabled INTEGER DEFAULT 0,
      brand_school_name TEXT DEFAULT '',
      reply_to_email TEXT DEFAULT '',
      footer_text TEXT DEFAULT '',
      subject_prefix TEXT DEFAULT '',
      manual_body_text TEXT DEFAULT '',
      logo_url TEXT DEFAULT '',
      signature_html TEXT DEFAULT '',
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS workspace_email_templates (
      workspace_id TEXT NOT NULL,
      template_key TEXT NOT NULL,
      subject TEXT NOT NULL DEFAULT '',
      body_html TEXT NOT NULL DEFAULT '',
      body_text TEXT NOT NULL DEFAULT '',
      required_tokens_json TEXT NOT NULL DEFAULT '[]',
      enabled INTEGER NOT NULL DEFAULT 1,
      updated_by_user_id TEXT,
      updated_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (workspace_id, template_key)
    );

    CREATE INDEX IF NOT EXISTS idx_email_templates_workspace
      ON workspace_email_templates(workspace_id);

    CREATE TABLE IF NOT EXISTS class_attendance (
      id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL,
      date TEXT NOT NULL,
      taken_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(channel_id, date)
    );

    CREATE TABLE IF NOT EXISTS class_attendance_records (
      attendance_id TEXT NOT NULL,
      student_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'absent',
      PRIMARY KEY (attendance_id, student_id)
    );

    CREATE INDEX IF NOT EXISTS idx_class_attendance_channel_date
      ON class_attendance(channel_id, date);

    CREATE TABLE IF NOT EXISTS email_events (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      to_email TEXT NOT NULL,
      subject TEXT,
      status TEXT NOT NULL,
      provider TEXT DEFAULT '',
      error_message TEXT DEFAULT '',
      meta_json TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_email_events_workspace_created
      ON email_events(workspace_id, created_at);

    CREATE TABLE IF NOT EXISTS inbound_emails (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id TEXT DEFAULT '',
      message_id TEXT UNIQUE,
      sender TEXT,
      recipient TEXT DEFAULT '',
      subject TEXT,
      text_body TEXT,
      html_body TEXT,
      in_reply_to TEXT DEFAULT '',
      references_header TEXT DEFAULT '',
      related_email_log_id TEXT DEFAULT '',
      folder TEXT DEFAULT 'inbox',
      attachments_json TEXT DEFAULT '',
      received_at TEXT,
      is_read INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS email_replies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      inbound_email_id INTEGER NOT NULL,
      body TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (inbound_email_id) REFERENCES inbound_emails(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS deleted_inbound_emails (
      message_id TEXT PRIMARY KEY,
      deleted_at TEXT DEFAULT (datetime('now'))
    );

  `);

  const INBOUND_SYNC_INTERVAL_MS = Math.max(1000, Number(process.env.INBOUND_SYNC_INTERVAL_MS || 60000));
  if (inboundEmailService.isConfigured()) {
    setInterval(() => {
      inboundEmailService
        .syncInboundEmails(db)
        .catch((err) => console.error('Inbound email sync failed:', err?.message || err));
    }, INBOUND_SYNC_INTERVAL_MS);
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS slide_state (
      live_session_id TEXT PRIMARY KEY,
      deck_url TEXT,
      page INTEGER NOT NULL DEFAULT 1,
      page_count INTEGER NOT NULL DEFAULT 1,
      updated_at INTEGER NOT NULL
    );
  `);

  function ensureDefaultTestLiveSession() {
    const row = db.prepare("SELECT COUNT(*) AS c FROM live_sessions").get();
    if ((row?.c || 0) > 0) return;

    const pad = (n) => String(n).padStart(2, "0");
    const now = new Date();
    const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

    const start = new Date(now.getTime() + 60 * 1000);
    const end = new Date(now.getTime() + 31 * 60 * 1000);
    const start_time = `${pad(start.getHours())}:${pad(start.getMinutes())}`;
    const end_time = `${pad(end.getHours())}:${pad(end.getMinutes())}`;

    db.prepare(`
      INSERT INTO live_sessions (
        id, workspace_id, channel_id, title,
        date, start_time, end_time,
        meeting_url, meeting_pass,
        student_notes, status, autopost_mode,
        created_by, audience
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "test-session-1",
      "default",
      null,
      "Test A1 Live Class",
      date,
      start_time,
      end_time,
      "https://meet.jit.si/studistalk-test-room",
      "",
      "Development test session.",
      "scheduled",
      "none",
      "system",
      "general"
    );

    console.log("✅ Default test live session created:", date, start_time, "-", end_time);
  }

  ensureDefaultTestLiveSession();

tryAlter("ALTER TABLE workspace_email_settings ADD COLUMN logo_url TEXT DEFAULT ''");
tryAlter("ALTER TABLE workspace_email_settings ADD COLUMN signature_html TEXT DEFAULT ''");
tryAlter("ALTER TABLE workspace_email_settings ADD COLUMN manual_body_text TEXT DEFAULT ''");
tryAlter("ALTER TABLE users ADD COLUMN date_of_birth TEXT");
tryAlter("ALTER TABLE users ADD COLUMN salutation TEXT DEFAULT ''");
tryAlter("ALTER TABLE users ADD COLUMN phone_country TEXT DEFAULT ''");
tryAlter("ALTER TABLE users ADD COLUMN phone_number TEXT DEFAULT ''");
tryAlter("ALTER TABLE users ADD COLUMN teaching_languages TEXT DEFAULT ''");
tryAlter("ALTER TABLE users ADD COLUMN employment_type TEXT DEFAULT ''");
tryAlter("ALTER TABLE users ADD COLUMN available_days TEXT DEFAULT ''");
tryAlter("ALTER TABLE users ADD COLUMN emergency_contact_name TEXT DEFAULT ''");
tryAlter("ALTER TABLE users ADD COLUMN emergency_contact_phone TEXT DEFAULT ''");
tryAlter("ALTER TABLE users ADD COLUMN emergency_contact_relation TEXT DEFAULT ''");
tryAlter("ALTER TABLE users ADD COLUMN learning_goal TEXT DEFAULT ''");
tryAlter(`
  ALTER TABLE workspace_profile
  ADD COLUMN registration_details TEXT DEFAULT ''
`);
tryAlter(`
  ALTER TABLE workspace_profile
  ADD COLUMN use_platform_contact_email INTEGER DEFAULT 0
`);
tryAlter("ALTER TABLE workspace_email_logs ADD COLUMN message_id TEXT DEFAULT ''");
tryAlter("ALTER TABLE inbound_emails ADD COLUMN workspace_id TEXT DEFAULT ''");
tryAlter("ALTER TABLE inbound_emails ADD COLUMN recipient TEXT DEFAULT ''");
tryAlter("ALTER TABLE inbound_emails ADD COLUMN in_reply_to TEXT DEFAULT ''");
tryAlter("ALTER TABLE inbound_emails ADD COLUMN references_header TEXT DEFAULT ''");
tryAlter("ALTER TABLE inbound_emails ADD COLUMN related_email_log_id TEXT DEFAULT ''");
tryAlter("ALTER TABLE inbound_emails ADD COLUMN folder TEXT DEFAULT 'inbox'");
tryAlter("ALTER TABLE inbound_emails ADD COLUMN attachments_json TEXT DEFAULT ''");
db.exec(`
  CREATE TABLE IF NOT EXISTS deleted_inbound_emails (
    message_id TEXT PRIMARY KEY,
    deleted_at TEXT DEFAULT (datetime('now'))
  )
`);
tryAlter("ALTER TABLE registration_links ADD COLUMN first_name TEXT");
tryAlter("ALTER TABLE registration_links ADD COLUMN last_name TEXT");
tryAlter("ALTER TABLE registration_links ADD COLUMN salutation TEXT DEFAULT ''");
tryAlter("ALTER TABLE registration_links ADD COLUMN date_of_birth TEXT");
tryAlter("ALTER TABLE registration_links ADD COLUMN phone_country TEXT DEFAULT ''");
tryAlter("ALTER TABLE registration_links ADD COLUMN phone_number TEXT DEFAULT ''");
tryAlter("ALTER TABLE registration_links ADD COLUMN native_language TEXT DEFAULT ''");
tryAlter("ALTER TABLE registration_links ADD COLUMN learning_goal TEXT DEFAULT ''");
tryAlter("ALTER TABLE registration_links ADD COLUMN available_days TEXT DEFAULT ''");
tryAlter("ALTER TABLE registration_links ADD COLUMN emergency_contact_name TEXT DEFAULT ''");
tryAlter("ALTER TABLE registration_links ADD COLUMN emergency_contact_phone TEXT DEFAULT ''");
tryAlter("ALTER TABLE registration_links ADD COLUMN emergency_contact_relation TEXT DEFAULT ''");
tryAlter("ALTER TABLE registration_links ADD COLUMN course_start TEXT");
tryAlter("ALTER TABLE registration_links ADD COLUMN course_end TEXT");

function dropLiveSessionsOldReferences() {
  try {
    const rows = db
      .prepare("SELECT name, type FROM sqlite_master WHERE sql LIKE ?")
      .all("%live_sessions_old%");
    for (const row of rows) {
      const safeName = String(row.name || "").replace(/\"/g, '""');
      if (!safeName) continue;
      if (row.type === "trigger") {
        db.exec(`DROP TRIGGER IF EXISTS "${safeName}"`);
      } else if (row.type === "view") {
        db.exec(`DROP VIEW IF EXISTS "${safeName}"`);
      }
    }
  } catch (_err) {
    // ignore
  }
}

function ensureLiveAttendanceForeignKey() {
  try {
    const fk = db.prepare("PRAGMA foreign_key_list(live_attendance)").all();
    const needsFix = fk.some((row) => String(row.table || "").toLowerCase() !== "live_sessions");
    if (!needsFix) return;

    db.exec("PRAGMA foreign_keys = OFF");
    db.exec("BEGIN TRANSACTION");

    db.exec("ALTER TABLE live_attendance RENAME TO live_attendance_old");
    db.exec(`
      CREATE TABLE live_attendance (
        session_id TEXT NOT NULL,
        student_id TEXT NOT NULL,
        joined_at TEXT,
        status TEXT DEFAULT 'unmarked',
        note TEXT,
        updated_at TEXT DEFAULT (datetime('now')),
        PRIMARY KEY (session_id, student_id),
        FOREIGN KEY (session_id) REFERENCES live_sessions(id) ON DELETE CASCADE,
        FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE SET NULL
      );
    `);
    db.exec(`
      INSERT INTO live_attendance (session_id, student_id, joined_at, status, note, updated_at)
      SELECT session_id, student_id, joined_at, status, note, updated_at
      FROM live_attendance_old;
    `);
    db.exec("DROP TABLE live_attendance_old");
    db.exec("COMMIT");

    db.exec("CREATE INDEX IF NOT EXISTS idx_live_attendance_student ON live_attendance(student_id)");
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch (_err) {
      // ignore
    }
  } finally {
    db.exec("PRAGMA foreign_keys = ON");
  }
}

function rebuildLiveSessionsAllowingNullChannel() {
  if (hasColumn("live_sessions", "audience")) return;
  const cols = db.prepare("PRAGMA table_info(live_sessions)").all();
  const channelCol = cols.find((col) => col.name === "channel_id");
  if (!channelCol || channelCol.notnull === 0) return;

  db.exec("PRAGMA foreign_keys = OFF");
  db.exec("ALTER TABLE live_sessions RENAME TO live_sessions_old");

  dropLiveSessionsOldReferences();

  db.exec(`
    CREATE TABLE live_sessions (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL DEFAULT 'default',
      channel_id TEXT,
      title TEXT DEFAULT 'Live Class',
      date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      meeting_url TEXT NOT NULL,
      meeting_pass TEXT,
      student_notes TEXT,
      status TEXT NOT NULL DEFAULT 'scheduled',
      autopost_mode TEXT DEFAULT 'none',
      created_by TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT,
      audience TEXT DEFAULT 'general',
      FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE
    );
  `);

  db.exec(`
    INSERT INTO live_sessions (id, workspace_id, channel_id, title, date, start_time, end_time, meeting_url,
      meeting_pass, student_notes, status, autopost_mode, audience, created_by, created_at, updated_at)
    SELECT id, workspace_id, channel_id, title, date, start_time, end_time, meeting_url,
      meeting_pass, student_notes, status, autopost_mode, COALESCE(audience, 'general'), created_by, created_at, updated_at
    FROM live_sessions_old;
  `);

  db.exec("DROP TABLE live_sessions_old");
  db.exec("PRAGMA foreign_keys = ON");
}

rebuildLiveSessionsAllowingNullChannel();
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_live_sessions_workspace ON live_sessions(workspace_id);
  CREATE INDEX IF NOT EXISTS idx_live_sessions_channel ON live_sessions(channel_id);
  CREATE INDEX IF NOT EXISTS idx_live_attendance_student ON live_attendance(student_id);
`);

ensureLiveAttendanceForeignKey();

try {
  db.exec("ALTER TABLE live_sessions ADD COLUMN audience TEXT");
} catch (_err) {
  /* likely exists */
}

if (needsMessageTranslationsRebuild) {
  db.exec(`
    INSERT INTO message_translations (
      id,
      message_id,
      target_language,
      viewer_user_id,
      translated_text,
      provider,
      status,
      error_message,
      created_at,
      updated_at
    )
    SELECT
      id,
      message_id,
      target_language,
      'anon',
      translated_text,
      provider,
      status,
      error_message,
      created_at,
      updated_at
    FROM message_translations_old
  `);
  db.exec('DROP TABLE IF EXISTS message_translations_old');
  db.exec('PRAGMA foreign_keys = ON');
}

db.prepare(`
  CREATE TABLE IF NOT EXISTS user_channel_prefs (
    user_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    culture_read_language TEXT DEFAULT 'en',
    culture_write_language TEXT DEFAULT NULL,
    updated_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, channel_id)
  )
`).run();

// ensure workspace_id exists for older DBs
function ensureWorkspaceColumn() {
  try {
    const cols = db.prepare("PRAGMA table_info(channels)").all();
    const hasWorkspace = cols.some((c) => c.name === 'workspace_id');
    if (!hasWorkspace) {
      db.exec("ALTER TABLE channels ADD COLUMN workspace_id TEXT DEFAULT 'default';");
      db.exec("UPDATE channels SET workspace_id = 'default' WHERE workspace_id IS NULL;");
    }
  } catch (err) {
    console.error('Failed to ensure workspace_id column', err);
  }
}

ensureWorkspaceColumn();

function ensureChannelCategoryColumn() {
  try {
    const cols = db.prepare("PRAGMA table_info(channels)").all();
    const hasCategory = cols.some((c) => c.name === 'category');
    if (!hasCategory) {
      db.exec("ALTER TABLE channels ADD COLUMN category TEXT DEFAULT 'classes';");
    }
    db.exec("UPDATE channels SET category = 'classes' WHERE category IS NULL OR category = ''");
  } catch (err) {
    console.error('Failed to ensure category column', err);
  }
}

ensureChannelCategoryColumn();

function ensureWorkspaceSchema() {
  try {
    const cols = db.prepare("PRAGMA table_info(workspaces)").all();
    const names = cols.map((c) => c.name);
    if (!names.includes('created_at')) {
      db.exec("ALTER TABLE workspaces ADD COLUMN created_at TEXT DEFAULT (datetime('now'))");
    }
    if (!names.includes('school_code')) {
      db.exec("ALTER TABLE workspaces ADD COLUMN school_code TEXT");
    }
    if (!names.includes('status')) {
      db.exec("ALTER TABLE workspaces ADD COLUMN status TEXT DEFAULT 'approved'");
      db.exec("UPDATE workspaces SET status = 'approved' WHERE status IS NULL OR status = ''");
    }
    if (!names.includes('admin_email')) {
      db.exec("ALTER TABLE workspaces ADD COLUMN admin_email TEXT");
    }
    if (!names.includes('approved_at')) {
      db.exec("ALTER TABLE workspaces ADD COLUMN approved_at TEXT");
    }
    if (!names.includes('approved_by')) {
      db.exec("ALTER TABLE workspaces ADD COLUMN approved_by TEXT");
    }
    if (!names.includes('logo_url')) {
      db.exec("ALTER TABLE workspaces ADD COLUMN logo_url TEXT");
    }
  } catch (err) {
    console.error('Failed to ensure workspace schema', err);
  }
}

ensureWorkspaceSchema();

function ensureUserSchema() {
  try {
    const cols = db.prepare('PRAGMA table_info(users)').all();
    if (!cols.length) return;
    const names = cols.map((c) => c.name);
    if (!names.includes('workspace_id')) {
      db.exec("ALTER TABLE users ADD COLUMN workspace_id TEXT DEFAULT 'default'");
      db.exec("UPDATE users SET workspace_id = 'default' WHERE workspace_id IS NULL;");
    }
    if (!names.includes('first_name')) {
      db.exec("ALTER TABLE users ADD COLUMN first_name TEXT");
    }
    if (!names.includes('last_name')) {
      db.exec("ALTER TABLE users ADD COLUMN last_name TEXT");
    }
    if (!names.includes('avatar_url')) {
      db.exec('ALTER TABLE users ADD COLUMN avatar_url TEXT');
    }
    if (!names.includes('name')) {
      db.exec("ALTER TABLE users ADD COLUMN name TEXT DEFAULT ''");
    }
    if (!names.includes('email')) {
      db.exec('ALTER TABLE users ADD COLUMN email TEXT');
    }
    if (!names.includes('password_hash')) {
      db.exec('ALTER TABLE users ADD COLUMN password_hash TEXT');
    }
    if (!names.includes('username')) {
      db.exec("ALTER TABLE users ADD COLUMN username TEXT");
    }
    if (!names.includes('native_language')) {
      db.exec("ALTER TABLE users ADD COLUMN native_language TEXT DEFAULT 'en'");
    }
    if (!names.includes('native_language_confirmed')) {
      db.exec("ALTER TABLE users ADD COLUMN native_language_confirmed INTEGER DEFAULT 0");
    }
    if (!names.includes('role')) {
      db.exec("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'member'");
      db.exec("UPDATE users SET role = 'member' WHERE role IS NULL OR role = ''");
    }
    if (!names.includes('status')) {
      db.exec("ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'active'");
      db.exec("UPDATE users SET status = 'active' WHERE status IS NULL OR status = ''");
    }
    if (!names.includes('course_start')) {
      db.exec("ALTER TABLE users ADD COLUMN course_start TEXT");
    }
    if (!names.includes('course_end')) {
      db.exec("ALTER TABLE users ADD COLUMN course_end TEXT");
    }
    if (!names.includes('course_level')) {
      db.exec("ALTER TABLE users ADD COLUMN course_level TEXT");
    }
    if (!names.includes('gender')) {
      db.exec("ALTER TABLE users ADD COLUMN gender TEXT DEFAULT ''");
    }
    if (!names.includes('created_at')) {
      db.exec("ALTER TABLE users ADD COLUMN created_at TEXT DEFAULT (datetime('now'))");
    }
    if (!names.includes('culture_read_lang')) {
      db.exec("ALTER TABLE users ADD COLUMN culture_read_lang TEXT DEFAULT ''");
    }
    if (!names.includes('culture_write_lang')) {
      db.exec("ALTER TABLE users ADD COLUMN culture_write_lang TEXT DEFAULT ''");
    }
    db.exec('CREATE INDEX IF NOT EXISTS idx_users_workspace ON users(workspace_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)');
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_school_email ON users(workspace_id, email)');
  } catch (err) {
    console.error('Failed to ensure user schema', err);
  }
}

ensureUserSchema();

function ensureMessageSchema() {
  try {
    const cols = db.prepare('PRAGMA table_info(messages)').all();
    const names = cols.map((c) => c.name);
    if (!names.includes('avatar_url')) {
      db.exec("ALTER TABLE messages ADD COLUMN avatar_url TEXT");
    }
    if (!names.includes('created_at')) {
      db.exec("ALTER TABLE messages ADD COLUMN created_at TEXT");
      db.exec(
        "UPDATE messages SET created_at = datetime('now') WHERE created_at IS NULL OR created_at = ''"
      );
    }
    if (!names.includes('original_language')) {
      db.exec("ALTER TABLE messages ADD COLUMN original_language TEXT DEFAULT 'en'");
    }
    messagesHasCreatedAt = tableHasColumn('messages', 'created_at');
  } catch (err) {
    console.error('Failed to ensure message schema', err);
  }
}

function tableHasColumn(table, column) {
  try {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all();
    return cols.some((c) => c.name === column);
  } catch (_err) {
    return false;
  }
}

let messagesHasCreatedAt = false;
let repliesHasCreatedAt = false;
let dmRepliesHasCreatedAt = false;

function ensureReplySchema() {
  try {
    const cols = db.prepare('PRAGMA table_info(replies)').all();
    const names = cols.map((c) => c.name);
    if (!names.includes('avatar_url')) {
      db.exec("ALTER TABLE replies ADD COLUMN avatar_url TEXT");
    }
    if (!names.includes('created_at')) {
      db.exec("ALTER TABLE replies ADD COLUMN created_at TEXT");
      db.exec("UPDATE replies SET created_at = datetime('now') WHERE created_at IS NULL OR created_at = ''");
    }
  } catch (err) {
    console.error('Failed to ensure reply schema', err);
  }

  try {
    const cols = db.prepare('PRAGMA table_info(dm_replies)').all();
    const names = cols.map((c) => c.name);
    if (!names.includes('avatar_url')) {
      db.exec("ALTER TABLE dm_replies ADD COLUMN avatar_url TEXT");
    }
    if (!names.includes('created_at')) {
      db.exec("ALTER TABLE dm_replies ADD COLUMN created_at TEXT");
      db.exec("UPDATE dm_replies SET created_at = datetime('now') WHERE created_at IS NULL OR created_at = ''");
    }
  } catch (err) {
    console.error('Failed to ensure DM reply schema', err);
  }

  repliesHasCreatedAt = tableHasColumn('replies', 'created_at');
  dmRepliesHasCreatedAt = tableHasColumn('dm_replies', 'created_at');
}

function ensureDmSchema() {
  try {
    const cols = db.prepare('PRAGMA table_info(dms)').all();
    const names = cols.map((c) => c.name);
    if (!names.includes('created_by')) {
      db.exec("ALTER TABLE dms ADD COLUMN created_by TEXT");
    }
    // dm_members table created in initial schema; no migration needed here
  } catch (err) {
    console.error('Failed to ensure DM schema', err);
  }
}

function ensureCalendarSchema() {
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS calendar_events (
        id TEXT PRIMARY KEY,
        workspace_id TEXT DEFAULT 'default',
        source_type TEXT DEFAULT 'manual',
        source_id TEXT DEFAULT '',
        visibility_scope TEXT DEFAULT '',
        target_type TEXT DEFAULT '',
        target_id TEXT DEFAULT '',
        title TEXT NOT NULL,
        description TEXT DEFAULT '',
        notes TEXT DEFAULT '',
        date TEXT DEFAULT '',
        event_date TEXT DEFAULT '',
        start_time TEXT DEFAULT '',
        end_time TEXT DEFAULT '',
        all_day INTEGER DEFAULT 0,
        meet_link TEXT DEFAULT '',
        details_url TEXT DEFAULT '',
        assignee_id TEXT DEFAULT '',
        created_by TEXT DEFAULT '',
        remind_min INTEGER DEFAULT 0,
        repeat_json TEXT DEFAULT '',
        done INTEGER DEFAULT 0,
        color TEXT DEFAULT '#1a73e8',
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
    `);
  } catch (err) {
    console.error("Failed to ensure calendar schema", err);
  }
  safeAlter("ALTER TABLE calendar_events ADD COLUMN source_type TEXT DEFAULT 'manual'");
  safeAlter("ALTER TABLE calendar_events ADD COLUMN source_id TEXT DEFAULT ''");
  safeAlter("ALTER TABLE calendar_events ADD COLUMN visibility_scope TEXT DEFAULT ''");
  safeAlter("ALTER TABLE calendar_events ADD COLUMN target_type TEXT DEFAULT ''");
  safeAlter("ALTER TABLE calendar_events ADD COLUMN target_id TEXT DEFAULT ''");
  safeAlter("ALTER TABLE calendar_events ADD COLUMN description TEXT DEFAULT ''");
  safeAlter("ALTER TABLE calendar_events ADD COLUMN notes TEXT DEFAULT ''");
  safeAlter("ALTER TABLE calendar_events ADD COLUMN date TEXT DEFAULT ''");
  safeAlter("ALTER TABLE calendar_events ADD COLUMN event_date TEXT DEFAULT ''");
  safeAlter("ALTER TABLE calendar_events ADD COLUMN all_day INTEGER DEFAULT 0");
  safeAlter("ALTER TABLE calendar_events ADD COLUMN details_url TEXT DEFAULT ''");
  safeAlter("ALTER TABLE calendar_events ADD COLUMN remind_min INTEGER DEFAULT 0");
  safeAlter("ALTER TABLE calendar_events ADD COLUMN repeat_json TEXT DEFAULT ''");
  safeAlter("ALTER TABLE calendar_events ADD COLUMN done INTEGER DEFAULT 0");
  safeAlter("ALTER TABLE calendar_events ADD COLUMN color TEXT DEFAULT '#1a73e8'");
  safeAlter("ALTER TABLE calendar_events ADD COLUMN created_at TEXT DEFAULT (datetime('now'))");
  safeAlter("ALTER TABLE calendar_events ADD COLUMN updated_at TEXT DEFAULT (datetime('now'))");
  try {
    db.exec("CREATE INDEX IF NOT EXISTS idx_cal_events_ws_date ON calendar_events(workspace_id, event_date)");
    db.exec("CREATE INDEX IF NOT EXISTS idx_cal_events_assignee ON calendar_events(assignee_id)");
    db.exec("CREATE INDEX IF NOT EXISTS idx_cal_events_visibility ON calendar_events(workspace_id, visibility_scope, target_type, target_id)");
  } catch (err) {
    console.error("Failed to ensure calendar indexes", err);
  }
  try {
    db.exec("UPDATE calendar_events SET event_date = date WHERE (event_date IS NULL OR event_date = '') AND (date IS NOT NULL AND date <> '')");
    db.exec(`
      UPDATE calendar_events
      SET target_type = COALESCE((
            SELECT t.target_type
            FROM calendar_event_targets t
            WHERE t.calendar_event_id = calendar_events.id
            ORDER BY t.created_at DESC
            LIMIT 1
          ), target_type)
      WHERE target_type IS NULL OR target_type = ''
    `);
    db.exec(`
      UPDATE calendar_events
      SET target_id = COALESCE((
            SELECT t.target_id
            FROM calendar_event_targets t
            WHERE t.calendar_event_id = calendar_events.id
            ORDER BY t.created_at DESC
            LIMIT 1
          ), target_id)
      WHERE target_id IS NULL OR target_id = ''
    `);
    db.exec(`
      UPDATE calendar_events
      SET target_type = 'school',
          target_id = '',
          visibility_scope = 'workspace'
      WHERE source_type = 'manual'
        AND (target_type IS NULL OR target_type = '' OR target_type = 'user')
        AND EXISTS (
          SELECT 1
          FROM users u
          WHERE u.id = calendar_events.created_by
            AND lower(COALESCE(u.role, '')) IN ('admin', 'school_admin', 'super_admin')
        )
    `);
    db.exec(`
      UPDATE calendar_event_targets
      SET target_type = 'school',
          target_id = ''
      WHERE calendar_event_id IN (
        SELECT e.id
        FROM calendar_events e
        JOIN users u ON u.id = e.created_by
        WHERE e.source_type = 'manual'
          AND lower(COALESCE(u.role, '')) IN ('admin', 'school_admin', 'super_admin')
      )
    `);
    db.exec(`
      UPDATE calendar_events
      SET visibility_scope = CASE
            WHEN target_type = 'school' THEN 'workspace'
            WHEN target_type = 'class' THEN 'targeted'
            WHEN target_type = 'user' THEN 'private_user'
            ELSE visibility_scope
          END
      WHERE visibility_scope IS NULL OR visibility_scope = ''
    `);
    db.exec(`
      UPDATE calendar_events
      SET visibility_scope = CASE
            WHEN target_type = 'school' THEN 'workspace'
            WHEN target_type = 'class' THEN 'targeted'
            WHEN target_type = 'user' THEN 'private_user'
            ELSE visibility_scope
          END
      WHERE visibility_scope IS NULL OR visibility_scope = ''
    `);
  } catch (_err) {
    // ignore
  }
}

function ensureCalendarTargetsSchema() {
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS calendar_event_targets (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        calendar_event_id TEXT NOT NULL,
        target_type TEXT NOT NULL,
        target_id TEXT DEFAULT '',
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_cal_event_targets_ws ON calendar_event_targets(workspace_id);
      CREATE INDEX IF NOT EXISTS idx_cal_event_targets_event ON calendar_event_targets(calendar_event_id);
    `);
  } catch (err) {
    console.error('Failed to ensure calendar_event_targets schema', err);
  }
}

function deleteCalendarEventTargets(eventId) {
  if (!eventId) return;
  db.prepare('DELETE FROM calendar_event_targets WHERE calendar_event_id = ?').run(eventId);
}

function upsertCalendarEventTarget(eventId, workspaceId, type, targetId) {
  if (!eventId || !workspaceId || !type) return;
  deleteCalendarEventTargets(eventId);
  db.prepare(
    `
    INSERT INTO calendar_event_targets
      (id, workspace_id, calendar_event_id, target_type, target_id, created_at)
    VALUES
      (@id, @workspace_id, @calendar_event_id, @target_type, @target_id, datetime('now'))
  `
  ).run({
    id: generateId('cet'),
    workspace_id: workspaceId,
    calendar_event_id: eventId,
    target_type: type,
    target_id: targetId || ''
  });
}

function buildLiveSessionEventPayload(session) {
  if (!session || !session.id) return null;
  const workspaceId = session.workspace_id || 'default';
  const eventDate = session.event_date || session.date || '';
  const now = nowIso();
  const targetType = session.channel_id ? 'class' : 'school';
  const targetId = session.channel_id || '';
  const visibilityScope = session.channel_id ? 'targeted' : 'workspace';
  return {
    workspace_id: workspaceId,
    source_type: 'live_session',
    source_id: session.id,
    visibility_scope: visibilityScope,
    target_type: targetType,
    target_id: targetId,
    title: session.title || 'Live session',
    description: session.student_notes || '',
    notes: session.student_notes || '',
    date: eventDate,
    event_date: eventDate,
    start_time: session.start_time || '',
    end_time: session.end_time || '',
    all_day: 0,
    meet_link: session.meeting_url || '',
    details_url: `/live-sessions/${session.id}`,
    assignee_id: session.created_by || '',
    created_by: session.created_by || '',
    remind_min: 0,
    repeat_json: '',
    done: 0,
    color: '#2563eb',
    created_at: now,
    updated_at: now
  };
}

function ensureLiveSessionCalendar(session) {
  if (!session || !session.id) return null;
  const existing = db
    .prepare('SELECT * FROM calendar_events WHERE source_type = ? AND source_id = ? LIMIT 1')
    .get('live_session', session.id);
  const payload = buildLiveSessionEventPayload(session);
  if (!payload) return null;
  if (!payload.event_date) payload.event_date = payload.date;
  if (!payload.event_date) return null;
  if (existing) {
    const setStmt = `
      UPDATE calendar_events SET
        title = @title,
        description = @description,
        notes = @notes,
        visibility_scope = @visibility_scope,
        target_type = @target_type,
        target_id = @target_id,
        event_date = @event_date,
        date = @date,
        start_time = @start_time,
        end_time = @end_time,
        meet_link = @meet_link,
        details_url = @details_url,
        updated_at = datetime('now')
      WHERE id = @id
    `;
    db.prepare(setStmt).run({ id: existing.id, ...payload });
    const targetType = session.channel_id ? 'class' : 'school';
    const targetId = session.channel_id || '';
    upsertCalendarEventTarget(existing.id, payload.workspace_id, targetType, targetId);
    return db.prepare('SELECT * FROM calendar_events WHERE id = ?').get(existing.id);
  }
  const eventId = generateId('ce');
  db.prepare(
    `
    INSERT INTO calendar_events
      (id, workspace_id, source_type, source_id, visibility_scope, target_type, target_id,
       title, description, notes, date, event_date, start_time, end_time, all_day, meet_link, details_url,
       assignee_id, created_by, remind_min, repeat_json, done, color, created_at, updated_at)
    VALUES
      (@id, @workspace_id, @source_type, @source_id, @visibility_scope, @target_type, @target_id,
       @title, @description, @notes, @date, @event_date, @start_time, @end_time, @all_day, @meet_link, @details_url,
       @assignee_id, @created_by, @remind_min, @repeat_json, @done, @color, @created_at, @updated_at)
  `
  ).run({ id: eventId, ...payload });
  const targetType = session.channel_id ? 'class' : 'school';
  const targetId = session.channel_id || '';
  upsertCalendarEventTarget(eventId, payload.workspace_id, targetType, targetId);
  return db.prepare('SELECT * FROM calendar_events WHERE id = ?').get(eventId);
}

function removeLiveSessionCalendar(sessionId) {
  if (!sessionId) return;
  const ev = db
    .prepare('SELECT id FROM calendar_events WHERE source_type = ? AND source_id = ?')
    .get('live_session', sessionId);
  if (!ev) return;
  deleteCalendarEventTargets(ev.id);
  db.prepare('DELETE FROM calendar_events WHERE id = ?').run(ev.id);
}

function ensureKnowledgeSchema() {
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS knowledge_items (
        id TEXT PRIMARY KEY,
        workspace_id TEXT DEFAULT 'default',
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        visibility TEXT DEFAULT 'public',
        tags TEXT DEFAULT '',
        updated_at TEXT DEFAULT (datetime('now'))
      );
    `);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_knowledge_workspace ON knowledge_items(workspace_id)`);
  } catch (err) {
    console.error("Failed to ensure knowledge schema", err);
  }
}

function ensureFileEventsSchema() {
  try {
    const cols = db.prepare('PRAGMA table_info(file_events)').all();
    if (!cols.length) return;
    const names = cols.map((c) => c.name);
    if (!names.includes('mime')) {
      db.exec("ALTER TABLE file_events ADD COLUMN mime TEXT");
    }
  } catch (err) {
    console.error('Failed to ensure file events schema', err);
  }
}

  ensureMessageSchema();
  ensureReplySchema();
  ensureDmSchema();
  ensureCalendarSchema();
  ensureCalendarTargetsSchema();
  ensureKnowledgeSchema();
  ensureFileEventsSchema();

function nowIso() {
  return new Date().toISOString();
}

function getCalendarTargetsByEventIds(workspaceId, eventIds = []) {
  if (!workspaceId || !Array.isArray(eventIds) || !eventIds.length) return new Map();
  const placeholders = eventIds.map(() => "?").join(",");
  const rows = db
    .prepare(
      `
        SELECT *
        FROM calendar_event_targets
        WHERE workspace_id = ?
          AND calendar_event_id IN (${placeholders})
        ORDER BY created_at DESC
      `
    )
    .all(workspaceId, ...eventIds);
  const map = new Map();
  rows.forEach((row) => {
    if (!map.has(row.calendar_event_id)) {
      map.set(row.calendar_event_id, row);
    }
  });
  return map;
}

function resolveCalendarEventAccess(row, targetRow = null) {
  const rawVisibility = String(row?.visibility_scope || "").trim();
  const rawTargetType = String(row?.target_type || targetRow?.target_type || "").trim();
  const rawTargetId = String(row?.target_id || targetRow?.target_id || "").trim();

  let visibilityScope = rawVisibility;
  if (!visibilityScope) {
    if (rawTargetType === "school") visibilityScope = "workspace";
    else if (rawTargetType === "class") visibilityScope = "targeted";
    else visibilityScope = "private_user";
  }

  let targetType = rawTargetType;
  if (!targetType) {
    if (visibilityScope === "workspace") targetType = "school";
    else if (visibilityScope === "targeted") targetType = "class";
    else targetType = "user";
  }

  let targetId = rawTargetId;
  if (!targetId && targetType === "user") {
    targetId = String(row?.created_by || row?.assignee_id || "").trim();
  }
  if (targetType === "school") {
    targetId = "";
  }

  return { visibilityScope, targetType, targetId };
}

function canViewCalendarEvent(row, targetRow, requester, channelIds = []) {
  if (!row || !requester) return false;
  if (String(row.workspace_id || "") !== String(requester.workspaceId || "")) return false;

  const access = resolveCalendarEventAccess(row, targetRow);
  if (requester.isAdmin) {
    if (access.visibilityScope === "private_user") {
      return access.targetType === "user" && access.targetId === requester.requesterId;
    }
    return true;
  }

  if (access.visibilityScope === "workspace") return true;
  if (access.visibilityScope === "private_user") {
    return access.targetType === "user" && access.targetId === requester.requesterId;
  }
  if (access.visibilityScope === "targeted") {
    if (access.targetType === "class") {
      return channelIds.includes(access.targetId);
    }
    return access.targetType === "school";
  }
  return false;
}

function canManageCalendarEvent(row, targetRow, requester) {
  if (!row || !requester) return false;
  if (String(row.workspace_id || "") !== String(requester.workspaceId || "")) return false;

  const access = resolveCalendarEventAccess(row, targetRow);
  if (requester.isAdmin) {
    return access.visibilityScope !== "private_user";
  }

  return (
    access.visibilityScope === "private_user" &&
    access.targetType === "user" &&
    access.targetId === requester.requesterId &&
    String(row.created_by || "").trim() === requester.requesterId
  );
}

app.get("/api/calendar/events", (req, res) => {
  const requester = getCalendarRequesterContext(req);
  const from = req.query.from || null;
  const to = req.query.to || null;
  const channelIds = getUserChannelIds(requester.requesterId, requester.workspaceId);

  let rows;
  if (from && to) {
    rows = db
      .prepare(
        `
          SELECT *
          FROM calendar_events
          WHERE workspace_id = ?
            AND COALESCE(NULLIF(event_date, ''), date) >= ?
            AND COALESCE(NULLIF(event_date, ''), date) <= ?
          ORDER BY COALESCE(NULLIF(event_date, ''), date), start_time
        `
      )
      .all(requester.workspaceId, from, to);
  } else {
    rows = db
      .prepare(
        `
          SELECT *
          FROM calendar_events
          WHERE workspace_id = ?
          ORDER BY COALESCE(NULLIF(event_date, ''), date), start_time
          LIMIT 2000
        `
      )
      .all(requester.workspaceId);
  }

  const targetMap = getCalendarTargetsByEventIds(
    requester.workspaceId,
    rows.map((row) => row.id).filter(Boolean)
  );
  const visibleRows = rows.filter((row) =>
    canViewCalendarEvent(row, targetMap.get(row.id), requester, channelIds)
  );

  res.json(
    visibleRows.map((row) =>
      mapCalendarRow(row, {
        targetRow: targetMap.get(row.id),
        requesterContext: requester
      })
    )
  );
});

function safeJsonParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function mapCalendarRow(r, options = {}) {
  if (!r) return null;
  const targetRow = options.targetRow || null;
  const requester = options.requesterContext || null;
  const access = resolveCalendarEventAccess(r, targetRow);
  const normalizedDate = r.event_date || r.date || '';
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    sourceType: r.source_type || 'manual',
    sourceId: r.source_id || '',
    visibilityScope: access.visibilityScope,
    targetType: access.targetType,
    targetId: access.targetId,
    title: r.title,
    description: r.description || r.notes || '',
    notes: r.notes,
    date: normalizedDate,
    eventDate: normalizedDate,
    startTime: r.start_time,
    endTime: r.end_time,
    allDay: !!r.all_day,
    meetLink: r.meet_link,
    detailsUrl: r.details_url || '',
    assigneeId: r.assignee_id,
    createdBy: r.created_by,
    remindMin: r.remind_min || 0,
    color: r.color || '#1a73e8',
    repeat: r.repeat_json ? safeJsonParse(r.repeat_json) : null,
    done: !!r.done,
    canEdit: requester ? canManageCalendarEvent(r, targetRow, requester) : undefined,
    canDelete: requester ? canManageCalendarEvent(r, targetRow, requester) : undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  };
}

function normalizeDateInput(s) {
  if (!s) return "";
  const v = String(s).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v; // already yyyy-mm-dd
  const m = v.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (m) {
    const dd = String(m[1]).padStart(2, "0");
    const mm = String(m[2]).padStart(2, "0");
    const yyyy = m[3];
    return `${yyyy}-${mm}-${dd}`;
  }
  return "";
}

app.post("/api/calendar/events", (req, res) => {
  console.log("CAL POST headers content-type:", req.headers["content-type"]);
  console.log("CAL POST body:", req.body);
  const {
    title,
    date,
    startTime = "",
    endTime = "",
    notes = "",
    description = "",
    meetLink = "",
    assigneeId = "",
    createdBy = "",
    remindMin = 0,
    color = "#1a73e8",
    repeat = null,
    detailsUrl = "",
    allDay = false
  } = req.body || {};
  const fallbackCreatorId = String(createdBy || "").trim();
  const requester = getCalendarRequesterContext(req, fallbackCreatorId);
  const workspaceId = requester.workspaceId;
  const requesterId = requester.requesterId || fallbackCreatorId;

  const titleTrimmed = title ? String(title).trim() : "";
  const dateNorm = normalizeDateInput(date);

  if (!titleTrimmed || !dateNorm) {
    console.warn("Calendar create rejected: missing title/date", { title, date });
    return res.status(400).json({ error: "title and date are required" });
  }

  const id = generateId("ce");
  const repeatJson = repeat ? JSON.stringify(repeat) : "";
  const visibilityScope = requester.isAdmin ? "workspace" : "private_user";
  const targetType = requester.isAdmin ? "school" : "user";
  const targetId = requester.isAdmin ? "" : requesterId;

  db.prepare(
    `
    INSERT INTO calendar_events
      (id, workspace_id, source_type, source_id, visibility_scope, target_type, target_id,
       title, description, notes, date, event_date, start_time, end_time, all_day,
       meet_link, details_url, assignee_id, created_by, remind_min, color, repeat_json,
       done, created_at, updated_at)
    VALUES
      (@id, @workspace_id, @source_type, @source_id, @visibility_scope, @target_type, @target_id,
       @title, @description, @notes, @date, @event_date, @start_time, @end_time, @all_day,
       @meet_link, @details_url, @assignee_id, @created_by, @remind_min, @color, @repeat_json,
       0, datetime('now'), datetime('now'))
  `
  ).run({
    id,
    workspace_id: workspaceId,
    source_type: "manual",
    source_id: "",
    visibility_scope: visibilityScope,
    target_type: targetType,
    target_id: targetId,
    title: titleTrimmed,
    description: String(description || notes || ""),
    notes: String(notes || ""),
    event_date: dateNorm,
    date: dateNorm,
    start_time: String(startTime || "").trim(),
    end_time: String(endTime || "").trim(),
    all_day: allDay ? 1 : 0,
    meet_link: String(meetLink || ""),
    details_url: String(detailsUrl || ""),
    assignee_id: String(assigneeId || ""),
    created_by: String(requesterId || createdBy || ""),
    remind_min: Number(remindMin || 0),
    color: String(color || "#1a73e8"),
    repeat_json: repeatJson
  });

  const ev = db.prepare(`SELECT * FROM calendar_events WHERE id = ?`).get(id);
  upsertCalendarEventTarget(id, workspaceId, targetType, targetId);
  const payload = {
    event: mapCalendarRow(ev, {
      requesterContext: requester
    })
  };
  broadcastEvent("calendar_event_created", payload);
  res.status(201).json(payload);
});

app.patch("/api/calendar/events/:id", (req, res) => {
  const { id } = req.params;
  const requester = getCalendarRequesterContext(req);
  const existing = db.prepare(`SELECT * FROM calendar_events WHERE id = ?`).get(id);
  if (!existing) return res.status(404).json({ error: "not found" });
  const targetRow = getCalendarTargetsByEventIds(existing.workspace_id, [id]).get(id) || null;
  if (!canManageCalendarEvent(existing, targetRow, requester)) {
    return res.status(403).json({ error: "forbidden" });
  }

  const patch = req.body || {};
  const dateNorm = normalizeDateInput(patch.date ?? existing.date);
  const repeatJson =
    patch.repeat ? JSON.stringify(patch.repeat) : patch.repeat === null ? "" : existing.repeat_json;

  db.prepare(
    `
    UPDATE calendar_events SET
      title = COALESCE(@title, title),
      date = COALESCE(@date, date),
      event_date = COALESCE(@event_date, event_date),
      description = COALESCE(@description, description),
      notes = COALESCE(@notes, notes),
      start_time = COALESCE(@start_time, start_time),
      end_time = COALESCE(@end_time, end_time),
      all_day = COALESCE(@all_day, all_day),
      meet_link = COALESCE(@meet_link, meet_link),
      assignee_id = COALESCE(@assignee_id, assignee_id),
      remind_min = COALESCE(@remind_min, remind_min),
      color = COALESCE(@color, color),
      repeat_json = @repeat_json,
      done = COALESCE(@done, done),
      updated_at = datetime('now')
    WHERE id = @id
  `
  ).run({
    id,
    title: patch.title !== undefined ? String(patch.title).trim() : null,
    date: dateNorm || null,
    event_date: dateNorm || null,
    description:
      patch.description !== undefined
        ? String(patch.description || patch.notes || '').trim()
        : null,
    notes: patch.notes ?? null,
    start_time: patch.startTime ?? null,
    end_time: patch.endTime ?? null,
    all_day:
      patch.allDay === true
        ? 1
        : patch.allDay === false
        ? 0
        : null,
    meet_link: patch.meetLink ?? null,
    assignee_id: patch.assigneeId ?? null,
    remind_min: patch.remindMin ?? null,
    color: patch.color ?? null,
    repeat_json: repeatJson,
    done: typeof patch.done === "boolean" ? (patch.done ? 1 : 0) : null
  });

  const ev = db.prepare(`SELECT * FROM calendar_events WHERE id = ?`).get(id);
  const mapped = mapCalendarRow(ev, {
    targetRow,
    requesterContext: requester
  });
  broadcastEvent("calendar_event_updated", { event: mapped });
  res.json({ event: mapped });
});

app.delete("/api/calendar/events/:id", (req, res) => {
  const { id } = req.params;
  const requester = getCalendarRequesterContext(req);
  const ev = db.prepare(`SELECT * FROM calendar_events WHERE id = ?`).get(id);
  if (!ev) return res.status(404).json({ error: "not found" });
  const targetRow = getCalendarTargetsByEventIds(ev.workspace_id, [id]).get(id) || null;
  if (!canManageCalendarEvent(ev, targetRow, requester)) {
    return res.status(403).json({ error: "forbidden" });
  }

  deleteCalendarEventTargets(id);
  db.prepare(`DELETE FROM calendar_events WHERE id = ?`).run(id);
  broadcastEvent("calendar_event_deleted", { id });
  res.json({ ok: true, id });
});


const avatarCacheByKey = new Map(); // key: lower(author/name/email/username) -> avatar
const avatarCacheByInitials = new Map(); // key: initials -> avatar

function cacheAvatarForUserRow(row) {
  if (!row) return null;
  const avatar = row.avatar_url || null;
  const keys = [];
  if (row.name) keys.push(String(row.name).toLowerCase());
  if (row.username) keys.push(String(row.username).toLowerCase());
  if (row.email) keys.push(String(row.email).toLowerCase());
  const full = `${row.first_name || ""} ${row.last_name || ""}`.trim().toLowerCase();
  if (full) keys.push(full);
  keys.forEach((k) => avatarCacheByKey.set(k, avatar));
  const initials = generateInitials(row.name || full || row.username || row.email || "");
  if (initials) avatarCacheByInitials.set(initials.toUpperCase(), avatar);
  return avatar;
}

function resolveAvatarForAuthor(author, initials = "", localCache = null) {
  const key = (author || "").trim().toLowerCase();
  const initKey = (initials || "").trim().toUpperCase();

  if (localCache && key && localCache.has(key)) return localCache.get(key);
  if (key && avatarCacheByKey.has(key)) {
    const val = avatarCacheByKey.get(key);
    if (localCache) localCache.set(key, val);
    return val;
  }

  const stmt = db.prepare(
    `
    SELECT name, username, email, first_name, last_name, avatar_url
    FROM users
    WHERE lower(name) = ?
       OR lower(username) = ?
       OR lower(email) = ?
       OR lower(trim(first_name || ' ' || last_name)) = ?
    LIMIT 1
  `
  );
  const row = key ? stmt.get(key, key, key, key) : null;
  if (row) {
    const avatar = cacheAvatarForUserRow(row);
    if (localCache && key) localCache.set(key, avatar);
    return avatar;
  }

  if (initKey) {
    if (avatarCacheByInitials.has(initKey)) {
      const val = avatarCacheByInitials.get(initKey);
      if (localCache && key) localCache.set(key, val);
      return val;
    }
    const all = db
      .prepare('SELECT name, username, email, first_name, last_name, avatar_url FROM users')
      .all();
    for (const u of all) cacheAvatarForUserRow(u);
    if (avatarCacheByInitials.has(initKey)) {
      const val = avatarCacheByInitials.get(initKey);
      if (localCache && key) localCache.set(key, val);
      return val;
    }
  }
  if (localCache && key) localCache.set(key, null);
  return null;
}

// seed default #general channel if none
const channelCount = db.prepare('SELECT COUNT(*) AS c FROM channels').get().c;
if (!channelCount) {
  db.prepare(`
    INSERT INTO channels (id, name, topic, members, unread, workspace_id, category)
    VALUES (@id, @name, @topic, @members, @unread, @workspace_id, @category)
  `).run({
    id: 'general',
    name: 'general',
    topic: 'Company-wide announcements',
    members: 1,
    unread: 0,
    workspace_id: 'default',
    category: 'classes'
  });
}

function ensureAnnouncementChannel(workspaceId = 'default') {
  const existing = db.prepare(
    "SELECT 1 FROM channels WHERE workspace_id = ? AND (lower(name) LIKE '%announc%' OR lower(id) LIKE '%announc%')"
  ).get(workspaceId);
  if (existing) return;

  const baseId = 'announcements';
  let channelId = baseId;
  let suffix = 1;
  while (db.prepare('SELECT 1 FROM channels WHERE id = ?').get(channelId)) {
    channelId = `${baseId}-${suffix++}`;
  }

  db.prepare(
    `
    INSERT INTO channels (id, name, topic, members, unread, workspace_id, category)
    VALUES (@id, @name, @topic, @members, @unread, @workspace_id, @category)
  `
  ).run({
    id: channelId,
    name: 'announcements',
    topic: 'Company-wide announcements',
    members: 1,
    unread: 0,
    workspace_id: workspaceId,
    category: 'classes'
  });
}

function isChannelRowAnnouncement(channel) {
  if (!channel) return false;
  const name = String(channel.name || '').toLowerCase();
  const topic = String(channel.topic || '').toLowerCase();
  const id = String(channel.id || '').toLowerCase();
  const marker = 'announc';
  return name.includes(marker) || id.includes(marker) || topic.includes(marker);
}

ensureAnnouncementChannel('default');

function ensureNamedChannel(workspaceId, name, { category = 'classes', topic = '' } = {}) {
  const normalizedCategory = String(category || 'classes').trim().toLowerCase();
  const existing = db
    .prepare(
      'SELECT id FROM channels WHERE workspace_id = ? AND lower(name) = ? AND lower(category) = ?'
    )
    .get(workspaceId, String(name || '').toLowerCase(), normalizedCategory);
  if (existing) return existing.id;

  const baseId = slugify(name);
  let channelId = baseId;
  let suffix = 1;
  while (db.prepare('SELECT 1 FROM channels WHERE id = ?').get(channelId)) {
    channelId = `${baseId}-${suffix++}`;
  }

  db.prepare(
    `
    INSERT INTO channels (id, name, topic, members, unread, workspace_id, category)
    VALUES (@id, @name, @topic, @members, @unread, @workspace_id, @category)
  `
  ).run({
    id: channelId,
    name,
    topic,
    members: 1,
    unread: 0,
    workspace_id: workspaceId,
    category: normalizedCategory
  });

  return channelId;
}

function ensureClubChannels(workspaceId = 'default') {
  ensureNamedChannel(workspaceId, 'Conversation Club', {
    category: 'clubs',
    topic: 'Weekly conversation practice'
  });
  ensureNamedChannel(workspaceId, 'Speaking Club', {
    category: 'clubs',
    topic: 'Fluency and speaking drills'
  });
  ensureNamedChannel(workspaceId, 'Culture Exchange', {
    category: 'clubs',
    topic: 'Share culture and language tips'
  });
}

ensureClubChannels('default');

function ensureTeachersChannel(workspaceId = 'default') {
  const ws = String(workspaceId || 'default');
  const id = `teachers-${ws}`;

  db.prepare(`
    INSERT OR IGNORE INTO channels (id, name, topic, members, unread, category, workspace_id)
    VALUES (?, 'Teachers', 'Teachers-only staff room', 1, 0, 'teachers', ?)
  `).run(id, ws);

  db.prepare(`
    UPDATE channels
    SET category = 'teachers', name = 'Teachers', topic = 'Teachers-only staff room'
    WHERE id = ? AND workspace_id = ?
  `).run(id, ws);

  const homeworkTarget = `homework_for:${id}`;
  const homeworkChannel = db
    .prepare(
      `
      SELECT id
      FROM channels
      WHERE workspace_id = ?
        AND lower(category) = 'homework'
        AND topic = ?`
    )
    .get(ws, homeworkTarget);
  if (homeworkChannel?.id) {
    db.prepare('DELETE FROM channel_members WHERE channel_id = ?').run(homeworkChannel.id);
    db.prepare('DELETE FROM channels WHERE id = ?').run(homeworkChannel.id);
  }

  // auto-add all teachers/admins
  const teacherIds = db
    .prepare(`
      SELECT id FROM users
      WHERE workspace_id = ?
        AND lower(role) IN ('teacher','admin','school_admin','super_admin')
    `)
    .all(ws);

  const ins = db.prepare(`
    INSERT OR IGNORE INTO channel_members (channel_id, user_id)
    VALUES (?, ?)
  `);

  teacherIds.forEach((u) => ins.run(id, u.id));

  return id;
}

function addUserToTeachersChannel(workspaceId, userId) {
  if (!workspaceId || !userId) return;
  const channelId = ensureTeachersChannel(workspaceId);
  if (!channelId) return;
  db.prepare('INSERT OR IGNORE INTO channel_members (channel_id, user_id) VALUES (?, ?)').run(
    channelId,
    userId
  );
}

ensureTeachersChannel('default');

function formatPrivacyDate(value) {
  if (!value) return null;
  try {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toLocaleDateString('en-US', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  } catch (err) {
    return null;
  }
}

function buildPrivacyRulesText({ schoolName, addressHtml, supportHtml, lastUpdated }) {
  const name = escapeHtml(schoolName || 'School');
  const addressBlock = addressHtml
    ? `<div class="controller-address">${addressHtml}</div>`
    : `<div class="controller-address muted">School address not set yet.</div>`;
  const supportBlock = supportHtml
    ? `<div class="support-block">${supportHtml}</div>`
    : `<div class="support-block muted">Support contact not set yet.</div>`;
  const formattedUpdated = formatPrivacyDate(lastUpdated) || '—';
  const rawUpdated = lastUpdated || '';
  const metadataBlock = `<div class="privacy-meta" data-updated="${escapeHtml(
    rawUpdated
  )}" style="display:none">Last updated: ${escapeHtml(formattedUpdated)}</div>`;
  const policyChipLabels = ['EU Hosted', 'No Ads', 'Encrypted', 'Moderated'];
  const policyChips = policyChipLabels
    .map(
      (label) =>
        `<span class="policy-chip">${escapeHtml(label)}</span>`
    )
    .join('');
  const summaryItems = [
    'EU-hosted infrastructure',
    'No ads or third-party tracking',
    'Encrypted communication',
    'Classroom-only usage',
    'Moderation & reporting available'
  ]
    .map(
      (item) =>
        `<div class="privacy-summary-item"><i class="fa-solid fa-circle-check"></i>${escapeHtml(
          item
        )}</div>`
    )
    .join('');
  const tocSections = [
    { id: 'section-controller', title: 'Data Controller &amp; Legal Basis' },
    { id: 'section-gdpr', title: 'Data Privacy (GDPR)' },
    { id: 'section-communication', title: 'Communication Rules' },
    { id: 'section-roles', title: 'Roles &amp; Permissions' },
    { id: 'section-safety', title: 'Safety &amp; Moderation' },
    { id: 'section-commitment', title: 'Our Commitment' },
    { id: 'section-contact', title: 'Contact' }
  ];
  const tocChips = tocSections
    .map(
      (sec) =>
        `<a href="#${sec.id}" class="privacy-toc-chip">${escapeHtml(
          sec.title.replace('&amp;', '&')
        )}</a>`
    )
    .join('');
  const summaryBlock = `<div class="privacy-summary"><div class="privacy-summary-title"><i class="fa-solid fa-badge-check"></i>Privacy summary</div><div class="privacy-summary-grid">${summaryItems}</div></div>`;
  const tocBlock = `<div class="privacy-toc"><div class="privacy-toc-label">Contents</div><div class="privacy-toc-chips">${tocChips}</div></div>`;

  return (
    `<div class="privacy-rules">` +
    `${summaryBlock}` +
    `${tocBlock}` +
    `${metadataBlock}` +

    `<section class="policy-section" id="section-controller">` +
    `<div class="section-heading">` +
    `<span class="section-icon"><i class="fa-solid fa-scale-balanced"></i></span>` +
    `<div>` +
    `<div class="section-title">Data Controller &amp; Legal Basis</div>` +
    `<div class="section-summary">Who owns the data and what legal grounds justify processing.</div>` +
    `</div>` +
    `</div>` +
    `<p class="intro">The data controller for this platform is:</p>` +
    `<p class="controller-name"><strong>${name}</strong></p>` +
    `${addressBlock}` +
    `<p class="intro">Personal data is processed under the legal basis of:</p>` +
    `<ul class="section-list">` +
    `<li><strong>Contractual necessity</strong> – § 6(1)(b) GDPR <span class="law-article">(Article 6(1)(b))</span> for course participation</li>` +
    `<li><strong>Legitimate interest</strong> – § 6(1)(f) GDPR <span class="law-article">(Article 6(1)(f))</span> for platform security and moderation</li>` +
    `<li><strong>Consent</strong> – § 6(1)(a) GDPR <span class="law-article">(Article 6(1)(a))</span>, where applicable</li>` +
    `</ul>` +
    `<p>We retain student data only as long as necessary for educational and legal record-keeping purposes.</p>` +
    `<p>Users may request access, correction, or deletion of their personal data at any time.</p>` +
    `</section>` +

    `<section class="policy-section" id="section-gdpr">` +
    `<div class="section-heading">` +
    `<span class="section-icon"><i class="fa-solid fa-user-shield"></i></span>` +
    `<div>` +
    `<div class="section-title">Data Privacy &amp; Protection (GDPR)</div>` +
    `<div class="section-summary">How student and teacher data stay safe inside EU servers.</div>` +
    `</div>` +
    `</div>` +
    `<p class="intro">Your privacy and data security are very important to us.</p>` +
    `<ul class="section-list">` +
    `<li>All student and teacher data is stored securely on servers located within the <strong>European Union</strong>.</li>` +
    `<li>Personal data is used <strong>only for educational purposes</strong> and internal school communication.</li>` +
    `<li>No advertisements, tracking tools, or third-party marketing services are used.</li>` +
    `<li>Messages, homework, and learning history remain stored for school records, even after a course ends.</li>` +
    `<li>Expired accounts can no longer log in, but their learning contributions remain visible to teachers.</li>` +
    `</ul>` +
    `</section>` +

    `<section class="policy-section" id="section-communication">` +
    `<div class="section-heading">` +
    `<span class="section-icon"><i class="fa-solid fa-comments"></i></span>` +
    `<div>` +
    `<div class="section-title">Communication Rules</div>` +
    `<div class="section-summary">Guidelines for respectful channel use and private chats.</div>` +
    `</div>` +
    `</div>` +
    `<p class="intro">To ensure a respectful and effective learning environment, all users must follow these rules:</p>` +
    `<ul class="section-list">` +
    `<li>Be respectful and polite to teachers and classmates at all times.</li>` +
    `<li>Offensive language, harassment, or inappropriate content is strictly prohibited.</li>` +
    `<li>Class and learning channels must be used <strong>only for educational topics</strong>.</li>` +
    `<li>Private chats must follow the same respectful behavior standards.</li>` +
    `</ul>` +
    `<p class="note">Violations may result in warnings, muted access, or account restrictions.</p>` +
    `</section>` +

    `<section class="policy-section" id="section-roles">` +
    `<div class="section-heading">` +
    `<span class="section-icon"><i class="fa-solid fa-clipboard-list"></i></span>` +
    `<div>` +
    `<div class="section-title">Roles &amp; Permissions</div>` +
    `<div class="section-summary">What each role may do inside the workspace.</div>` +
    `</div>` +
    `</div>` +
    `<div class="roles-grid">` +
    `<div class="role-card role-student">` +
    `<div class="role-badge"><span>Students</span></div>` +
    `<div class="role-summary">Participate, collaborate, and learn in assigned classes.</div>` +
    `<ul>` +
    `<li><i class="fa-solid fa-message"></i> Send messages in class channels</li>` +
    `<li><i class="fa-solid fa-people-roof"></i> Participate in discussions</li>` +
    `<li><i class="fa-solid fa-face-smile-beam"></i> React to messages with emojis</li>` +
    `<li><i class="fa-solid fa-file-lines"></i> Submit homework and exercises</li>` +
    `</ul>` +
    `</div>` +
    `<div class="role-card role-teacher">` +
    `<div class="role-badge"><span>Teachers</span></div>` +
    `<div class="role-summary">Guide learning, moderate content, and manage classrooms.</div>` +
    `<ul>` +
    `<li><i class="fa-solid fa-chalkboard-user"></i> Manage class discussions</li>` +
    `<li><i class="fa-solid fa-thumbtack"></i> Pin important messages</li>` +
    `<li><i class="fa-solid fa-sparkles"></i> Create and moderate learning threads</li>` +
    `<li><i class="fa-solid fa-eye"></i> Review reported content</li>` +
    `<li><i class="fa-solid fa-sitemap"></i> Assign and manage language classroom groups</li>` +
    `</ul>` +
    `</div>` +
    `<div class="role-card role-admin">` +
    `<div class="role-badge"><span>School Administrators</span></div>` +
    `<div class="role-summary">Oversee school settings, approvals, and policy enforcement.</div>` +
    `<ul>` +
    `<li><i class="fa-solid fa-user-shield"></i> Manage students and teachers</li>` +
    `<li><i class="fa-solid fa-gears"></i> Control class and school settings</li>` +
    `<li><i class="fa-solid fa-circle-check"></i> Approve or remove users</li>` +
    `<li><i class="fa-solid fa-gavel"></i> Adjust privacy and communication rules</li>` +
    `</ul>` +
    `</div>` +
    `</div>` +
    `</section>` +

    `<section class="policy-section" id="section-safety">` +
    `<div class="section-heading">` +
    `<span class="section-icon"><i class="fa-solid fa-triangle-exclamation"></i></span>` +
    `<div>` +
    `<div class="section-title">Safety, Reporting &amp; Moderation</div>` +
    `<div class="section-summary">How we keep conversations safe and compliant.</div>` +
    `</div>` +
    `</div>` +
    `<ul class="section-list">` +
    `<li>Any message can be reported if it violates school rules.</li>` +
    `<li>Reported content is reviewed by teachers or school administrators.</li>` +
    `<li>Administrators may mute users, lock discussions, or remove messages when necessary.</li>` +
    `<li>All moderation actions are handled confidentially and responsibly.</li>` +
    `</ul>` +
    `</section>` +

    `<section class="policy-section highlight" id="section-commitment">` +
    `<div class="our-commitment-card">` +
    `<div class="our-commitment-icon"><i class="fa-solid fa-shield-halved"></i></div>` +
    `<div>` +
    `<div class="section-title">Our Commitment</div>` +
    `<div class="section-summary">A respectful, secure platform for learning and culture exchange.</div>` +
    `<p>` +
    `This platform is designed as a <strong>safe digital classroom</strong>, not a social network.` +
    ` Our goal is to support learning, communication, and collaboration in a respectful and secure environment.` +
    `</p>` +
    `<p>` +
    `Students can communicate with classmates, build confidence, exchange culture and language,` +
    ` and practice together in secure groups. <strong>Private groups are visible only to their members.</strong>` +
    ` The school administration and platform owner cannot see private messages.` +
    `</p>` +
    `<p>` +
    `All communication is protected using encryption.` +
    ` If you experience any issues or rule violations, you can report them at any time.` +
    `</p>` +
    `</div>` +
    `</div>` +
    `</section>` +
    `<section class="policy-section" id="section-contact">` +
    `<div class="section-heading">` +
    `<span class="section-icon"><i class="fa-solid fa-circle-info"></i></span>` +
    `<div>` +
    `<div class="section-title">Contact</div>` +
    `<div class="section-summary">Reach out to the workspace administration for support.</div>` +
    `</div>` +
    `</div>` +
    `<div class="contact">` +
    `<div class="contact-title">Support contact</div>` +
    `${supportBlock}` +
    `</div>` +
    `</section>` +
    `<footer class="policy-footer">` +
    `If you have questions about privacy or rules, please contact your <strong>school administration</strong>.` +
    `</footer>` +
    `</div>`
  );
}

function ensurePrivacyRulesMessage(workspaceId) {
  if (!workspaceId) return;
  const channelId = ensureNamedChannel(workspaceId, 'Privacy & Rules', {
    category: 'tools',
    topic: 'School privacy and communication guidelines'
  });
  const existing = db
    .prepare("SELECT id FROM messages WHERE channel_id = ? AND author = 'System' ORDER BY rowid LIMIT 1")
    .get(channelId);
  const ws =
    db
      .prepare('SELECT name, admin_email FROM workspaces WHERE id = ?')
      .get(workspaceId) || {};
  const schoolName = ws?.name || 'School';
  const adminEmail = String(ws?.admin_email || '').trim();

  const profile =
    db
      .prepare('SELECT * FROM workspace_profile WHERE workspace_id = ?')
      .get(workspaceId) || {};

  const parts = [];
  const streetLine = [profile.street, profile.house_number].filter(Boolean).join(' ').trim();
  if (streetLine) parts.push(escapeHtml(streetLine));
  const cityLine = [profile.postal_code, profile.city].filter(Boolean).join(' ').trim();
  if (cityLine) parts.push(escapeHtml(cityLine));
  const stateCountry = [profile.state, profile.country].filter(Boolean).join(', ').trim();
  if (stateCountry) parts.push(escapeHtml(stateCountry));

  const addressHtml = parts.length ? parts.map((p) => `<div>${p}</div>`).join('') : '';
  const phone = String(profile.phone || '').trim();
  const website = String(profile.website || '').trim();
  const supportParts = [];
  if (adminEmail) {
    supportParts.push(
      `<div><i class="fa-solid fa-envelope"></i> ` +
        `<a href="mailto:${escapeHtml(adminEmail)}">${escapeHtml(adminEmail)}</a></div>`
    );
  }
  if (phone) {
    supportParts.push(
      `<div><i class="fa-solid fa-phone"></i> ` +
        `<a href="tel:${escapeHtml(phone)}">${escapeHtml(phone)}</a></div>`
    );
  }
  if (website) {
    const normalized = website.startsWith('http://') || website.startsWith('https://')
      ? website
      : `https://${website}`;
    supportParts.push(
      `<div><i class="fa-solid fa-globe"></i> ` +
        `<a href="${escapeHtml(normalized)}" target="_blank" rel="noopener noreferrer">${escapeHtml(website)}</a></div>`
    );
  }
  const supportHtml = supportParts.length ? supportParts.join('') : '';
  const lastUpdated = profile.updated_at || new Date().toISOString();

  const text = buildPrivacyRulesText({ schoolName, addressHtml, supportHtml, lastUpdated });
  if (existing?.id) {
    db.prepare('UPDATE messages SET text = ?, time = ? WHERE id = ?').run(
      text,
      timeHHMM(),
      existing.id
    );
    return;
  }

  db.prepare(
    `INSERT INTO messages (id, channel_id, author, initials, avatar_url, time, text, alt, created_at)
     VALUES (@id, @channel_id, @author, @initials, @avatar_url, @time, @text, @alt, @created_at)`
  ).run({
    id: generateId('m'),
    channel_id: channelId,
    author: 'System',
    initials: 'SYS',
    avatar_url: null,
    time: timeHHMM(),
    text,
    alt: 0,
    created_at: nowISOString()
  });
}

function ensureToolChannels(workspaceId = 'default') {
  ensureNamedChannel(workspaceId, 'Announcements', {
    category: 'tools',
    topic: 'Important school updates'
  });
  ensureNamedChannel(workspaceId, 'Learning Materials', {
    category: 'tools',
    topic: 'Study guides and resources'
  });
  ensureNamedChannel(workspaceId, 'Speaking Practice', {
    category: 'tools',
    topic: 'Speaking drills and prompts'
  });
  ensureNamedChannel(workspaceId, 'Listening Practice', {
    category: 'tools',
    topic: 'Listening activities and audio'
  });
  ensureNamedChannel(workspaceId, 'Wordmeaning', {
    category: 'tools',
    topic: 'Word meaning discussion and usage'
  });
  ensureNamedChannel(workspaceId, 'Schedule', {
    category: 'tools',
    topic: 'Class schedule and timetable'
  });
  ensureNamedChannel(workspaceId, 'Exam Registration', {
    category: 'tools',
    topic: 'Exam registration details'
  });
  ensurePrivacyRulesMessage(workspaceId);
}

ensureToolChannels('default');

function ensureTaskChannels(workspaceId = 'default') {
  ensureNamedChannel(workspaceId, 'School Task', {
    category: 'tasks',
    topic: 'School-wide task board'
  });
  ensureNamedChannel(workspaceId, 'Teachers Task', {
    category: 'tasks',
    topic: 'Teacher task list'
  });
}

ensureTaskChannels('default');

function ensureExamChannels(workspaceId = 'default') {
  ensureNamedChannel(workspaceId, 'B1 Mock Test', {
    category: 'exams',
    topic: 'Mock exam practice'
  });
  ensureNamedChannel(workspaceId, 'Placement Test', {
    category: 'exams',
    topic: 'Placement assessment'
  });
  ensureNamedChannel(workspaceId, 'Final Exam – March', {
    category: 'exams',
    topic: 'Final exam session'
  });
}

ensureExamChannels('default');

function ensureHomeworkChannelForClass(classChannel) {
  if (!classChannel) return null;
  const category = normalizeChannelCategory(classChannel.category);
  if (category !== 'classes') return null;
  const className = String(classChannel.name || '').trim().toLowerCase();
  const isTeachersClass =
    className === 'teachers' || String(classChannel.id || '').startsWith('teachers-');
  if (isTeachersClass) return null;
  const workspaceId = classChannel.workspaceId || classChannel.workspace_id || 'default';
  const topic = `homework_for:${classChannel.id}`;
  let hw = db
    .prepare(
      `SELECT id
       FROM channels
       WHERE workspace_id = ?
         AND lower(category) = 'homework'
         AND topic = ?`
    )
    .get(workspaceId, topic);
  if (!hw) {
    const name = `${classChannel.name} Homework`;
    let hwId = slugify(`${classChannel.id}-homework`);
    let suffix = 1;
    while (db.prepare('SELECT 1 FROM channels WHERE id = ?').get(hwId)) {
      hwId = `${slugify(`${classChannel.id}-homework`)}-${suffix++}`;
    }
    db.prepare(
      `
      INSERT INTO channels (id, name, topic, members, unread, workspace_id, category)
      VALUES (@id, @name, @topic, @members, @unread, @workspace_id, @category)
    `
    ).run({
      id: hwId,
      name,
      topic,
      members: 0,
      unread: 0,
      workspace_id: workspaceId,
      category: 'homework'
    });
    hw = { id: hwId };
  }

  const memberRows = db
    .prepare('SELECT user_id FROM channel_members WHERE channel_id = ?')
    .all(classChannel.id);
  if (memberRows.length) {
    const insertMember = db.prepare(
      'INSERT OR IGNORE INTO channel_members (channel_id, user_id) VALUES (?, ?)'
    );
    memberRows.forEach((m) => insertMember.run(hw.id, m.user_id));
  }

  return hw.id;
}

function ensureHomeworkChannels(workspaceId = 'default') {
  const classChannels = db
    .prepare(
      `SELECT id, name, workspace_id AS workspaceId, category
       FROM channels
       WHERE workspace_id = ?
         AND lower(category) = 'classes'`
    )
    .all(workspaceId);
  classChannels.forEach((ch) => ensureHomeworkChannelForClass(ch));
}

ensureHomeworkChannels('default');

function ensureClubChannelsForAllWorkspaces() {
  const rows = db.prepare('SELECT id FROM workspaces').all();
  rows.forEach((w) => ensureClubChannels(w.id));
}

ensureClubChannelsForAllWorkspaces();

function ensureToolChannelsForAllWorkspaces() {
  const rows = db.prepare('SELECT id FROM workspaces').all();
  rows.forEach((w) => ensureToolChannels(w.id));
}

ensureToolChannelsForAllWorkspaces();

function ensureExamChannelsForAllWorkspaces() {
  const rows = db.prepare('SELECT id FROM workspaces').all();
  rows.forEach((w) => ensureExamChannels(w.id));
}

ensureExamChannelsForAllWorkspaces();

function ensureHomeworkChannelsForAllWorkspaces() {
  const rows = db.prepare('SELECT id FROM workspaces').all();
  rows.forEach((w) => ensureHomeworkChannels(w.id));
}

ensureHomeworkChannelsForAllWorkspaces();

function ensureTeachersChannelForAllWorkspaces() {
  const rows = db.prepare('SELECT id FROM workspaces').all();
  rows.forEach((w) => ensureTeachersChannel(w.id));
}

ensureTeachersChannelForAllWorkspaces();

function ensureDefaultMembershipsForAllWorkspaces() {
  const rows = db.prepare('SELECT id FROM workspaces').all();
  rows.forEach((w) => ensureDefaultChannelMemberships(w.id));
}

const DEFAULT_USER_ID = 'u-you';

function ensureDefaultWorkspaceAndUser() {
  // 1) ensure at least one workspace
  const wsCount = db.prepare('SELECT COUNT(*) AS c FROM workspaces').get().c;
  if (!wsCount) {
    db.prepare(
      `
      INSERT INTO workspaces (id, name)
      VALUES ('default', 'Default Workspace')
    `
    ).run();
  }

  // 2) ensure at least one user ("You")
  const userCount = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (!userCount) {
    db.prepare(
      `
      INSERT INTO users (id, workspace_id, first_name, last_name, name, username, email, password_hash, role, status, native_language, native_language_confirmed)
      VALUES (@id, @workspace_id, @first_name, @last_name, @name, @username, @email, @password_hash, @role, @status, @native_language, @native_language_confirmed)
    `
    ).run({
      id: DEFAULT_USER_ID,
      workspace_id: 'default',
      first_name: 'You',
      last_name: 'User',
      name: 'You User',
      username: '@you',
      email: 'you@example.com',
      password_hash: hashPassword('you'),
      role: 'member',
      status: 'active',
      native_language: 'en',
      native_language_confirmed: 0
    });
  }

  // 3) ensure membership of default workspace
  const membership = db
    .prepare('SELECT 1 FROM workspace_members WHERE workspace_id = ? AND user_id = ?')
    .get('default', DEFAULT_USER_ID);
  if (!membership) {
    db.prepare(
      'INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, ?)'
    ).run('default', DEFAULT_USER_ID, 'owner');
  }

  // 4) backfill channels to default workspace if missing
  db.prepare(
    "UPDATE channels SET workspace_id = 'default' WHERE workspace_id IS NULL OR workspace_id = ''"
  ).run();
}

ensureDefaultWorkspaceAndUser();

/* ---------- helpers ---------- */

function slugify(name) {
  const base = (name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || 'channel';
}

function generateId(prefix) {
  return prefix + Math.random().toString(36).slice(2, 10);
}

function stableIdFromString(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i += 1) {
    h = (h << 5) + h + str.charCodeAt(i);
  }
  return `f_${(h >>> 0).toString(16)}`;
}

function computeFileIdFromMeta({ url = '', channelId = '', messageId = '', name = '' }) {
  const base = `${url}|${channelId}|${messageId}|0|${name}`;
  return stableIdFromString(base);
}

function timeHHMM() {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function nowISOString() {
  return new Date().toISOString();
}

function normalizeChannelCategory(value) {
  const val = String(value || '').trim().toLowerCase();
  if (val === 'clubs') return 'clubs';
  if (val === 'exams') return 'exams';
  if (val === 'tools') return 'tools';
  if (val === 'homework') return 'homework';
  return 'classes';
}

function inferPurposeFromChannel(name = '', topic = '') {
  const nm = String(name || '').toLowerCase();
  const tp = String(topic || '').toLowerCase();
  if (nm.includes('homework') || tp.includes('homework')) return 'homework';
  if (nm.includes('exam') || nm.includes('test') || tp.includes('exam') || tp.includes('test'))
    return 'exam';
  if (
    nm.includes('materials') ||
    nm.includes('announcement') ||
    nm.includes('learning') ||
    nm.includes('speaking') ||
    nm.includes('listening') ||
    tp.includes('materials') ||
    tp.includes('announcement')
  )
    return 'material';
  return 'media';
}

function getRequesterRole(req) {
  return String(req.headers['x-user-role'] || '').trim().toLowerCase();
}

function requireTeacher(req, res) {
  const role = getRequesterRole(req);
  if (role === 'teacher' || role === 'admin' || role === 'school_admin' || role === 'super_admin') {
    return true;
  }
  res.status(403).json({ error: 'Forbidden' });
  return false;
}

function generateInitials(name) {
  if (!name) return '';
  const parts = String(name)
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return '';
  const first = parts[0][0] || '';
  const second = parts[1] ? parts[1][0] : parts[0].slice(1, 2);
  return (first + (second || '')).toUpperCase();
}

function generateUsername(workspaceId, firstName, lastName) {
  const ws = workspaceId || 'default';
  const ln = (lastName || '').trim();
  const fn = (firstName || '').trim();
  let base = slugify(ln || 'user').replace(/-/g, '');
  if (!base) base = 'user';

  const existsStmt = db.prepare(
    'SELECT 1 FROM users WHERE workspace_id = ? AND username = ?'
  );

  let candidate = '@' + base;
  if (!existsStmt.get(ws, candidate)) return candidate;

  if (fn) {
    candidate = '@' + fn[0].toLowerCase() + base;
    if (!existsStmt.get(ws, candidate)) return candidate;
  }

  let i = 1;
  while (true) {
    candidate = '@' + base + i;
    if (!existsStmt.get(ws, candidate)) return candidate;
    i++;
  }
}

const TEACHER_ONLY_TOOL_CHANNELS = new Set([
  'announcements',
  'announcement',
  'learning materials',
  'speaking practice',
  'listening practice'
]);
const POLICY_VERSION = 'v1';
const AUTO_JOIN_OTHER_TOOL_CHANNELS = new Set([
  'schedule',
  'exam registration'
]);
const AUTO_JOIN_TOOL_CHANNELS = new Set([
  ...TEACHER_ONLY_TOOL_CHANNELS,
  'privacy & rules',
  'privacy and rules',
  'privacy rules',
  ...AUTO_JOIN_OTHER_TOOL_CHANNELS
]);
const ADMIN_ROLE_VALUES = new Set(['admin', 'super_admin', 'school_admin']);
const TEACHER_ROLE_VALUES = new Set(['teacher', 'admin', 'school_admin', 'super_admin']);

function getWorkspaceAdminIds(workspaceId) {
  if (!workspaceId) return [];
  const rows = db
    .prepare(
      `SELECT id
       FROM users
       WHERE workspace_id = ?
         AND lower(role) IN ('admin', 'super_admin', 'school_admin')`
    )
    .all(workspaceId);
  return rows.map((r) => r.id);
}

function ensureAdminsInWorkspaceChannels(workspaceId, channelId = null) {
  if (!workspaceId) return;
  const adminIds = getWorkspaceAdminIds(workspaceId);
  if (!adminIds.length) return;
  const insertMember = db.prepare(
    'INSERT OR IGNORE INTO channel_members (channel_id, user_id) VALUES (?, ?)'
  );

  const channels = channelId
    ? db
        .prepare('SELECT id, name, workspace_id AS workspaceId, category FROM channels WHERE id = ?')
        .all(channelId)
    : db
        .prepare(
          `SELECT id, name, workspace_id AS workspaceId, category
           FROM channels
           WHERE workspace_id = ?`
        )
        .all(workspaceId);

  channels.forEach((ch) => {
    if (String(ch.workspaceId) !== String(workspaceId)) return;
    adminIds.forEach((adminId) => insertMember.run(ch.id, adminId));
    if (normalizeChannelCategory(ch.category) === 'classes') {
      const hwId = ensureHomeworkChannelForClass(ch);
      if (hwId) {
        adminIds.forEach((adminId) => insertMember.run(hwId, adminId));
      }
    }
  });
}

function addUserToDefaultChannels(workspaceId, userId) {
  if (!workspaceId || !userId) return;
  const insertMember = db.prepare(
    'INSERT OR IGNORE INTO channel_members (channel_id, user_id) VALUES (?, ?)'
  );
  const clubChannels = db
    .prepare(
      `SELECT id
       FROM channels
       WHERE workspace_id = ?
         AND lower(category) = 'clubs'`
    )
    .all(workspaceId);
  clubChannels.forEach((c) => insertMember.run(c.id, userId));

  const toolNames = Array.from(AUTO_JOIN_TOOL_CHANNELS);
  if (toolNames.length) {
    const toolPlaceholders = toolNames.map(() => '?').join(', ');
    const toolChannels = db
      .prepare(
        `SELECT id
         FROM channels
         WHERE workspace_id = ?
           AND lower(category) = 'tools'
           AND lower(name) IN (${toolPlaceholders})`
      )
      .all(workspaceId, ...toolNames);
    toolChannels.forEach((c) => insertMember.run(c.id, userId));
  }
}

function ensureDefaultChannelMemberships(workspaceId) {
  if (!workspaceId) return;
  const users = db
    .prepare('SELECT id FROM users WHERE workspace_id = ?')
    .all(workspaceId);
  if (!users.length) return;

  const insertMember = db.prepare(
    'INSERT OR IGNORE INTO channel_members (channel_id, user_id) VALUES (?, ?)'
  );
  const defaultChannelIds = [];

  const clubChannels = db
    .prepare(
      `SELECT id
       FROM channels
       WHERE workspace_id = ?
         AND lower(category) = 'clubs'`
    )
    .all(workspaceId);
  defaultChannelIds.push(...clubChannels.map((c) => c.id));

  const toolNames = Array.from(AUTO_JOIN_TOOL_CHANNELS);
  if (toolNames.length) {
    const toolPlaceholders = toolNames.map(() => '?').join(', ');
    const toolChannels = db
      .prepare(
        `SELECT id
         FROM channels
         WHERE workspace_id = ?
           AND lower(category) = 'tools'
           AND lower(name) IN (${toolPlaceholders})`
      )
      .all(workspaceId, ...toolNames);
    defaultChannelIds.push(...toolChannels.map((c) => c.id));
  }

  defaultChannelIds.forEach((channelId) => {
    const hasMembers = db
      .prepare('SELECT 1 FROM channel_members WHERE channel_id = ? LIMIT 1')
      .get(channelId);
    if (hasMembers) return;
    users.forEach((u) => insertMember.run(channelId, u.id));
  });

  ensureAdminsInWorkspaceChannels(workspaceId);
}

ensureDefaultMembershipsForAllWorkspaces();

function generateSchoolCode() {
  const count = db.prepare('SELECT COUNT(*) AS c FROM workspaces').get().c || 0;
  let num = count + 1;
  while (true) {
    const code = `SCHOOL-${String(num).padStart(4, '0')}`;
    const exists = db.prepare('SELECT 1 FROM workspaces WHERE school_code = ?').get(code);
    if (!exists) return code;
    num += 1;
  }
}

function validatePassword(pw) {
  return (
    typeof pw === 'string' &&
    pw.length >= 8 &&
    /[A-Z]/.test(pw) &&
    /[a-z]/.test(pw) &&
    /[0-9]/.test(pw) &&
    /[^A-Za-z0-9]/.test(pw)
  );
}

function isStrongPassword(password) {
  return validatePassword(String(password || ''));
}

function hashPassword(password) {
  if (!password) return null;
  try {
    const crypto = require('crypto');
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
    return `${salt}:${hash}`;
  } catch (err) {
    console.error('Failed to hash password', err);
    return null;
  }
}

function verifyPassword(password, stored) {
  try {
    if (!password || !stored) return false;
    const crypto = require('crypto');
    const [salt, hash] = stored.split(':');
    if (!salt || !hash) return false;
    const calc = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(calc, 'hex'));
  } catch (err) {
    console.error('Failed to verify password', err);
    return false;
  }
}

/* ---------- realtime via Server-Sent Events ---------- */

const sseClients = new Set();

function broadcastEvent(eventName, payload) {
  const data = `event: ${eventName}\n` + `data: ${JSON.stringify(payload)}\n\n`;
  for (const res of sseClients) {
    try {
      res.write(data);
    } catch (err) {
      sseClients.delete(res);
    }
  }
}

// Long-lived SSE connection
app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }

  // initial comment so the connection is valid
  res.write(': connected\n\n');

  const ping = setInterval(() => {
    res.write(`event: ping\ndata: ${Date.now()}\n\n`);
  }, 25000);

  sseClients.add(res);

  req.on('close', () => {
    clearInterval(ping);
    sseClients.delete(res);
  });
});

/* ---------- middleware ---------- */

// --- Uploads + WebM->MP4 (Safari) ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '') || '';
    const id = crypto.randomBytes(12).toString('hex');
    cb(null, `${Date.now()}-${id}${ext}`);
  }
});

const upload = multer({ storage });
const logoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2_000_000 }
});
const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2_000_000 }
});

function runFfmpeg(args, { strict = false } = {}) {
  return new Promise((resolve, reject) => {
    if (!FFMPEG_CMD) {
      const err = new Error('ffmpeg not available');
      if (strict) return reject(err);
      return resolve({ skipped: true, reason: 'ffmpeg not available' });
    }

    const p = spawn(FFMPEG_CMD, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    let settled = false;

    const finishResolve = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    const finishReject = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    p.stderr.on('data', (d) => (stderr += d.toString()));
    p.on('error', (err) => {
      if (strict) return finishReject(err);
      console.warn('[ffmpeg] conversion error', err.message);
      finishResolve({ ok: false, failed: true, details: err.message });
    });
    p.on('close', (code) => {
      if (code === 0) {
        return finishResolve({ ok: true });
      }
      const err = new Error(`ffmpeg failed (code ${code})`);
      err.details = stderr.slice(-4000);
      if (strict) return finishReject(err);
      console.warn('[ffmpeg] conversion failed:', err.details || err.message);
      finishResolve({ ok: false, failed: true, details: err.details });
    });
  });
}

async function convertIfWebm(filePath, originalName, mimeType) {
  const lowerName = (originalName || '').toLowerCase();
  const isWebm =
    (mimeType && mimeType.includes('webm')) ||
    lowerName.endsWith('.webm') ||
    filePath.toLowerCase().endsWith('.webm');

  if (!isWebm) {
    return { outPath: filePath, outMime: mimeType || 'application/octet-stream' };
  }

  const isAudioOnly =
    (mimeType || '').startsWith('audio/') || /audio/i.test(lowerName);

  if (!FFMPEG_CMD) {
    return { outPath: filePath, outMime: mimeType || 'application/octet-stream' };
  }

  const strictMode = isStrict(process.env);

  try {
    if (isAudioOnly) {
      const outPath = filePath.replace(/\.webm$/i, '') + '.m4a';
      const result = await runFfmpeg(
        [
          '-y',
          '-i', filePath,
          '-vn',
          '-c:a', 'aac',
          '-b:a', '128k',
          '-movflags', '+faststart',
          outPath
        ],
        { strict: strictMode }
      );
      if (!result.ok) {
        return { outPath: filePath, outMime: mimeType || 'application/octet-stream' };
      }
      return { outPath, outMime: 'audio/mp4' };
    }

    const outPath = filePath.replace(/\.webm$/i, '') + '.mp4';
    const result = await runFfmpeg(
      [
        '-y',
        '-i', filePath,
        '-c:v', 'libx264',
        '-pix_fmt', 'yuv420p',
        '-preset', 'veryfast',
        '-movflags', '+faststart',
        '-c:a', 'aac',
        '-b:a', '128k',
        outPath
      ],
      { strict: strictMode }
    );
    if (!result.ok) {
      return { outPath: filePath, outMime: mimeType || 'application/octet-stream' };
    }
    return { outPath, outMime: 'video/mp4' };
  } catch (err) {
    if (strictMode) throw err;
    console.warn('ffmpeg conversion failed, returning original file', err && err.message);
    return { outPath: filePath, outMime: mimeType || 'application/octet-stream' };
  }
}

app.post('/api/uploads', upload.array('files', 10), async (req, res) => {
  try {
    const files = req.files || [];
    const out = [];

    for (const f of files) {
      const absIn = f.path;
      const { outPath, outMime } = await convertIfWebm(absIn, f.originalname, f.mimetype);

      if (outPath !== absIn) {
        try {
          fs.unlinkSync(absIn);
        } catch (_e) {
          /* ignore */
        }
      }

      const filename = path.basename(outPath);
      const stat = fs.statSync(outPath);

      out.push({
        url: `/uploads/${filename}`,
        originalName: f.originalname,
        size: stat.size,
        mimeType: outMime
      });
    }

    res.json({ files: out });
  } catch (err) {
    console.error('Upload/convert failed:', err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

/* ---------- File events (analytics) ---------- */
app.post('/api/file-events', (req, res) => {
  const {
    fileId,
    eventType,
    workspaceId,
    purpose,
    channelId,
    messageId,
    fileName,
    mime,
    fileUrl
  } = req.body || {};

  const file_id = String(fileId || '').trim();
  const event_type = String(eventType || '').trim().toLowerCase();
  const allowed = new Set(['view', 'download', 'open_in_chat']);

  if (!file_id || !allowed.has(event_type)) {
    return res.status(400).json({ error: 'Invalid file event' });
  }

  const id = generateId('fe_');
  const workspace_id = String(workspaceId || 'default');
  const user_id = getRequesterId(req) || null;

  try {
    db.prepare(
      `INSERT INTO file_events
       (id, file_id, workspace_id, user_id, event_type, purpose, channel_id, message_id, file_name, mime, file_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      file_id,
      workspace_id,
      user_id,
      event_type,
      purpose ? String(purpose) : null,
      channelId ? String(channelId) : null,
      messageId ? String(messageId) : null,
      fileName ? String(fileName) : null,
      mime ? String(mime) : null,
      fileUrl ? String(fileUrl) : null
    );
  } catch (err) {
    console.error('Failed to log file event', err);
    return res.status(500).json({ error: 'Failed to log event' });
  }

  res.json({ ok: true });
});

app.get('/api/analytics/files', (req, res) => {
  if (req.get('x-admin') !== '1' && req.get('x-super-admin') !== '1') {
    return res.status(403).json({ error: 'Admins only' });
  }
  const workspaceId = String(req.query.workspaceId || 'default');
  const daysRaw = parseInt(req.query.days || '30', 10);
  const days = Number.isFinite(daysRaw) ? Math.max(1, Math.min(daysRaw, 365)) : 30;
  const since = `-${days} days`;

  try {
    const byType = db
      .prepare(
        `SELECT event_type AS type, COUNT(*) AS count
         FROM file_events
         WHERE workspace_id = ? AND created_at >= datetime('now', ?)
         GROUP BY event_type`
      )
      .all(workspaceId, since);

    const byPurpose = db
      .prepare(
        `SELECT COALESCE(purpose, 'unknown') AS purpose, COUNT(*) AS count
         FROM file_events
         WHERE workspace_id = ? AND created_at >= datetime('now', ?)
         GROUP BY purpose`
      )
      .all(workspaceId, since);

    const topFiles = db
      .prepare(
        `SELECT file_id AS fileId,
                MAX(file_name) AS fileName,
                MAX(file_url) AS fileUrl,
                MAX(purpose) AS purpose,
                SUM(CASE WHEN event_type = 'view' THEN 1 ELSE 0 END) AS views,
                SUM(CASE WHEN event_type = 'download' THEN 1 ELSE 0 END) AS downloads,
                SUM(CASE WHEN event_type = 'open_in_chat' THEN 1 ELSE 0 END) AS openInChat
         FROM file_events
         WHERE workspace_id = ? AND created_at >= datetime('now', ?)
         GROUP BY file_id
         ORDER BY (views + downloads) DESC
         LIMIT 10`
      )
      .all(workspaceId, since);

    res.json({
      workspaceId,
      days,
      totalsByType: byType,
      totalsByPurpose: byPurpose,
      topFiles
    });
  } catch (err) {
    console.error('Failed to load file analytics', err);
    res.status(500).json({ error: 'Failed to load analytics' });
  }
});

app.get('/api/file-stats', (req, res) => {
  const workspaceId = workspaceIdFromRequest(req);
  const raw = req.query.url;
  const urls = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const filtered = urls.map((v) => String(v || '').trim()).filter(Boolean);
  if (!filtered.length) {
    return res.json({ stats: {} });
  }

  const placeholders = filtered.map(() => '?').join(', ');
  const params = [workspaceId, ...filtered];
  const rows = db
    .prepare(
      `SELECT file_url AS fileUrl, views, downloads
       FROM file_stats
       WHERE workspace_id = ?
         AND file_url IN (${placeholders})`
    )
    .all(...params);

  const stats = {};
  filtered.forEach((url) => {
    stats[url] = { views: 0, downloads: 0 };
  });
  rows.forEach((row) => {
    stats[row.fileUrl] = {
      views: Number(row.views || 0),
      downloads: Number(row.downloads || 0)
    };
  });

  res.json({ stats });
});

app.post('/api/file-stats/increment', (req, res) => {
  const { fileUrl, type, fileName, size } = req.body || {};
  if (!fileUrl || !['view', 'download'].includes(type)) {
    return res.status(400).json({ error: 'fileUrl and type are required' });
  }

  const workspaceId = workspaceIdFromRequest(req);
  const parsedSize = Number.isFinite(Number(size)) ? Number(size) : 0;
  const insertViews = type === 'view' ? 1 : 0;
  const insertDownloads = type === 'download' ? 1 : 0;
  const updateField =
    type === 'view' ? 'views = file_stats.views + 1' : 'downloads = file_stats.downloads + 1';

  db.prepare(
    `
    INSERT INTO file_stats (workspace_id, file_url, file_name, size, views, downloads)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(workspace_id, file_url) DO UPDATE SET
      file_name = excluded.file_name,
      size = COALESCE(excluded.size, file_stats.size),
      ${updateField},
      updated_at = strftime('%s','now')
  `
  ).run(workspaceId, fileUrl, fileName ? String(fileName) : null, parsedSize, insertViews, insertDownloads);

  const stats = db
    .prepare('SELECT views, downloads FROM file_stats WHERE workspace_id = ? AND file_url = ?')
    .get(workspaceId, fileUrl);

  res.json({
    fileUrl,
    views: Number(stats?.views || 0),
    downloads: Number(stats?.downloads || 0)
  });
});

/* ---------- Files registry ---------- */
app.get('/api/files/registry', (req, res) => {
  const ws = String(req.query.workspaceId || 'default');
  const channelId = String(req.query.channelId || '');
  const includeDeleted = String(req.query.includeDeleted || '0') === '1';

  const where = ['workspace_id = ?'];
  const params = [ws];
  if (channelId) {
    where.push('channel_id = ?');
    params.push(channelId);
  }
  if (!includeDeleted) where.push('deleted = 0');

  const rows = db
    .prepare(
      `
      SELECT file_id AS fileId,
             workspace_id AS workspaceId,
             channel_id AS channelId,
             message_id AS messageId,
             uploader_id AS uploaderId,
             purpose,
             file_name AS name,
             mime,
             size_bytes AS sizeBytes,
             url,
             pinned,
             deleted,
             replaced_from AS replacedFrom,
             created_at AS createdAt,
             updated_at AS updatedAt
      FROM files_registry
      WHERE ${where.join(' AND ')}
      ORDER BY pinned DESC, created_at DESC
      LIMIT 5000
    `
    )
    .all(...params);

  res.json({ workspaceId: ws, files: rows });
});

app.post('/api/files/:fileId/pin', (req, res) => {
  if (!requireTeacher(req, res)) return;
  const fileId = String(req.params.fileId || '');
  if (!fileId) return res.status(400).json({ error: 'fileId required' });

  const pinned =
    req.body && typeof req.body.pinned !== 'undefined' ? (req.body.pinned ? 1 : 0) : null;

  if (pinned === null) {
    const cur = db.prepare('SELECT pinned FROM files_registry WHERE file_id = ?').get(fileId);
    const next = cur?.pinned ? 0 : 1;
    db.prepare("UPDATE files_registry SET pinned = ?, updated_at = datetime('now') WHERE file_id = ?").run(
      next,
      fileId
    );
    return res.json({ ok: true, pinned: !!next });
  }

  db.prepare("UPDATE files_registry SET pinned = ?, updated_at = datetime('now') WHERE file_id = ?").run(
    pinned,
    fileId
  );
  res.json({ ok: true, pinned: !!pinned });
});

app.post('/api/files/:fileId/delete', (req, res) => {
  if (!requireTeacher(req, res)) return;
  const fileId = String(req.params.fileId || '');
  if (!fileId) return res.status(400).json({ error: 'fileId required' });

  db.prepare(
    "UPDATE files_registry SET deleted = 1, pinned = 0, updated_at = datetime('now') WHERE file_id = ?"
  ).run(fileId);

  res.json({ ok: true });
});

app.post('/api/files/:fileId/replace', (req, res) => {
  if (!requireTeacher(req, res)) return;

  const fileId = String(req.params.fileId || '');
  const userId = getRequesterId(req) || 'anon';
  const { newFile, workspaceId, channelId, messageId, purpose } = req.body || {};

  if (!fileId || !newFile?.url || !workspaceId || !channelId || !messageId) {
    return res.status(400).json({
      error: 'fileId, workspaceId, channelId, messageId and newFile(url,name,mimeType,size) required'
    });
  }

  const old = db.prepare('SELECT * FROM files_registry WHERE file_id = ?').get(fileId);
  if (!old) return res.status(404).json({ error: 'File not found' });

  const name = String(newFile.originalName || newFile.name || 'attachment');
  const mime = String(newFile.mimeType || newFile.mime || 'application/octet-stream');
  const sizeBytes = Number(newFile.size || newFile.sizeBytes || 0) || 0;
  const url = String(newFile.url);

  const newId = computeFileIdFromMeta({ url, channelId, messageId, name });

  db.prepare(
    "UPDATE files_registry SET deleted = 1, pinned = 0, updated_at = datetime('now') WHERE file_id = ?"
  ).run(fileId);

  db.prepare(
    `
    INSERT OR REPLACE INTO files_registry
    (file_id, workspace_id, channel_id, message_id, uploader_id, purpose, file_name, mime, size_bytes, url, pinned, deleted, replaced_from, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, datetime('now'), datetime('now'))
  `
  ).run(
    newId,
    workspaceId,
    channelId,
    messageId,
    userId,
    purpose || old.purpose || 'media',
    name,
    mime,
    sizeBytes,
    url,
    fileId
  );

  res.json({ ok: true, newFileId: newId });
});

/* ---------- WORKSPACES API ---------- */

// list all workspaces
app.get('/api/workspaces', (req, res) => {
  const rows = db
    .prepare(
      `
      SELECT
        w.id,
        w.name,
        w.logo_url AS logoUrl,
        w.created_at,
        (
          SELECT COUNT(*)
          FROM workspace_members wm
          WHERE wm.workspace_id = w.id
        ) AS memberCount
      FROM workspaces w
      ORDER BY w.created_at
    `
    )
    .all();

  const shaped = rows.map((w) => ({
    ...w,
    initials: generateInitials(w.name)
  }));

  res.json(shaped);
});

// create workspace and seed default channel/member
app.post('/api/workspaces', (req, res) => {
  // super admin only
  if (req.get('x-super-admin') !== '1') {
    return res.status(403).json({ error: 'Super admin only' });
  }

  const { name } = req.body || {};
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Workspace name is required' });
  }

  const trimmed = name.trim();
  const baseId = slugify(trimmed);
  let id = baseId || 'ws';
  let suffix = 1;
  while (db.prepare('SELECT 1 FROM workspaces WHERE id = ?').get(id)) {
    id = `${baseId || 'ws'}-${suffix++}`;
  }

  const initials = trimmed
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();

  const workspace = { id, name: trimmed, initials };

  const insertWorkspace = db.prepare('INSERT INTO workspaces (id, name) VALUES (@id, @name)');
  const insertMember = db.prepare(
    'INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, ?)'
  );
  const insertChannel = db.prepare(
    `INSERT INTO channels (id, name, topic, members, unread, workspace_id, category)
     VALUES (@id, @name, @topic, @members, @unread, @workspace_id, @category)`
  );

  // create default #general for this workspace with unique id
  let channelId = 'general';
  let cSuffix = 1;
  while (db.prepare('SELECT 1 FROM channels WHERE id = ?').get(channelId)) {
    channelId = `general-${cSuffix++}`;
  }

  const channelRow = {
    id: channelId,
    name: 'general',
    topic: 'Welcome to your new workspace',
    members: 1,
    unread: 0,
    workspace_id: id,
    category: 'classes'
  };

  let annChannelId = 'announcements';
  let annSuffix = 1;
  while (db.prepare('SELECT 1 FROM channels WHERE id = ?').get(annChannelId)) {
    annChannelId = `announcements-${annSuffix++}`;
  }

  const annChannelRow = {
    id: annChannelId,
    name: 'announcements',
    topic: 'Company-wide announcements',
    members: 1,
    unread: 0,
    workspace_id: id,
    category: 'classes'
  };

  const tx = db.transaction(() => {
    insertWorkspace.run(workspace);
    insertMember.run(id, DEFAULT_USER_ID, 'owner');
    insertChannel.run(channelRow);
    insertChannel.run(annChannelRow);
  });

  tx();
  ensureClubChannels(id);
  ensureToolChannels(id);
  ensureExamChannels(id);
  ensureDefaultChannelMemberships(id);

  res.status(201).json({
    workspace,
    defaultChannel: {
      id: channelRow.id,
      name: channelRow.name,
      topic: channelRow.topic,
      members: channelRow.members,
      unread: channelRow.unread,
      workspaceId: id,
      category: channelRow.category
    }
  });
});

app.delete('/api/workspaces/:workspaceId', (req, res) => {
  if (req.get('x-super-admin') !== '1') {
    return res.status(403).json({ error: 'Super admin only' });
  }

  const { workspaceId } = req.params;
  const workspace = db.prepare('SELECT id, name FROM workspaces WHERE id = ?').get(workspaceId);
  if (!workspace) {
    return res.status(404).json({ error: 'Workspace not found' });
  }
  if (workspaceId === 'default') {
    return res.status(400).json({ error: 'Default workspace cannot be deleted' });
  }

  deleteWorkspaceCascade(workspaceId);
  res.json({ ok: true });
});

app.post('/api/workspaces/:workspaceId/logo', (req, res) => {
  const user = getAuthedUser(req);
  if (!canManageWorkspaceSettings(user)) return res.status(403).json({ error: 'Forbidden' });

  const workspaceId = String(req.params.workspaceId || '');
  const userWs = user.workspaceId || user.workspace_id || 'default';
  if (workspaceId !== String(userWs)) return res.status(403).json({ error: 'Wrong workspace' });

  const dataUrl = String(req.body?.logoData || req.body?.dataUrl || '');
  const m = dataUrl.match(/^data:(image\/(png|jpeg|jpg|webp));base64,(.+)$/i);
  if (!m) return res.status(400).json({ error: 'Invalid image dataUrl. Use png/jpg/webp.' });

  const mime = m[1].toLowerCase();
  const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';

  const b64 = m[3];
  let buf;
  try {
    buf = Buffer.from(b64, 'base64');
  } catch {
    return res.status(400).json({ error: 'Invalid base64 data.' });
  }

  if (buf.length > 2 * 1024 * 1024) {
    return res.status(413).json({ error: 'Logo too large (max 2MB).' });
  }

  const dir = workspaceUploadsPath(workspaceId);
  ensureDir(dir);

  const filename = `logo.${ext}`;
  const filepath = path.join(dir, filename);
  fs.writeFileSync(filepath, buf);

  const publicUrl = `/uploads/workspaces/${encodeURIComponent(workspaceId)}/${filename}`;

  db.prepare(`
    INSERT INTO workspace_email_settings (workspace_id, logo_url, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(workspace_id) DO UPDATE SET
      logo_url = excluded.logo_url,
      updated_at = datetime('now')
  `).run(workspaceId, publicUrl);

  db.prepare('UPDATE workspaces SET logo_url = ? WHERE id = ?').run(publicUrl, workspaceId);

  res.json({ ok: true, logo_url: publicUrl });
});

/* ---------- USERS API ---------- */

/* ---------- SCHOOL REQUESTS API ---------- */

app.post('/api/schools/request', (req, res) => {
  const { schoolName, adminEmail, password } = req.body || {};
  const name = String(schoolName || '').trim();
  const email = String(adminEmail || '').trim().toLowerCase();
  const pwd = String(password || '');

  if (!name) {
    return res.status(400).json({ error: 'School name is required' });
  }
  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Valid admin email is required' });
  }
  if (!isStrongPassword(pwd)) {
    return res.status(400).json({ error: 'Password does not meet requirements' });
  }

  const existingUser = db.prepare('SELECT 1 FROM users WHERE lower(email) = ?').get(email);
  if (existingUser) {
    return res.status(409).json({ error: 'Email is already registered' });
  }
  const existingReq = db.prepare('SELECT 1 FROM school_requests WHERE admin_email = ?').get(email);
  if (existingReq) {
    return res.status(409).json({ error: 'A request already exists for this email' });
  }

  const id = generateId('req');
  const passwordHash = hashPassword(pwd);
  db.prepare(
    `INSERT INTO school_requests (id, school_name, admin_email, password_hash, status)
     VALUES (?, ?, ?, ?, 'PENDING')`
  ).run(id, name, email, passwordHash);

  res.status(201).json({ ok: true, id });
});

app.get('/api/admin/school-requests', (req, res) => {
  const user = requireSuperAdmin(req, res);
  if (!user) return;

  const status = String(req.query.status || 'pending').toLowerCase(); // pending|approved|rejected|flagged|all
  const q = String(req.query.q || '').trim().toLowerCase();
  const sort = String(req.query.sort || 'new').toLowerCase();

  const whereParts = [];
  const params = [];
  if (status !== 'all') {
    whereParts.push('status = ?');
    params.push(status);
  }
  if (q) {
    whereParts.push(`(
      LOWER(email) LIKE ? OR
      LOWER(payload) LIKE ?
    )`);
    params.push(`%${q}%`, `%${q}%`);
  }

  const where = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';
  const order = sort === 'old' ? 'created_at ASC' : 'created_at DESC';

  const rows = db.prepare(`
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
    ${where}
    ORDER BY ${order}
    LIMIT 500
  `).all(...params);

  const mapped = rows.map((r) => {
    let data = {};
    try {
      data = r.payload ? JSON.parse(r.payload) : {};
    } catch (_err) {
      data = {};
    }
    return { ...r, data };
  });
  res.json(mapped);
});

function getRequestCounts() {
  const rows = db.prepare(`
    SELECT status, COUNT(*) AS c
    FROM registration_review_requests
    GROUP BY status
  `).all();

  const counts = { pending: 0, approved: 0, rejected: 0, flagged: 0, all: 0 };
  for (const row of rows) {
    const key = String(row.status || '').toLowerCase();
    counts[key] = row.c || 0;
    counts.all += row.c || 0;
  }
  return counts;
}

app.get('/api/admin/school-requests-counts', (req, res) => {
  const user = requireSuperAdmin(req, res);
  if (!user) return;
  res.json(getRequestCounts());
});

app.get('/api/admin/requests/counts', (req, res) => {
  const user = requireSuperAdmin(req, res);
  if (!user) return;
  res.json(getRequestCounts());
});

function encodeRequestCursor(row) {
  const createdAt = Number(row.createdAt ?? row.created_at ?? 0);
  const id = Number(row.id ?? 0);
  if (!Number.isFinite(createdAt) || !Number.isFinite(id)) return null;
  return `${createdAt}:${id}`;
}

function parseRequestCursor(cursor) {
  if (!cursor) return null;
  const parts = String(cursor).split(":");
  if (parts.length !== 2) return null;
  const createdAt = Number(parts[0]);
  const id = Number(parts[1]);
  if (!Number.isFinite(createdAt) || !Number.isFinite(id)) return null;
  return { createdAt, id };
}

function performBulkRequestAction({ action, ids, note, user }) {
  if (!['approve', 'reject', 'flag'].includes(action)) {
    const err = new Error('Invalid action');
    err.status = 400;
    throw err;
  }
  if (!Array.isArray(ids) || !ids.length) {
    const err = new Error('No ids provided');
    err.status = 400;
    throw err;
  }

  const statusMap = { approve: 'approved', reject: 'rejected', flag: 'flagged' };
  const newStatus = statusMap[action];

  const tx = db.transaction(() => {
    for (const id of ids) {
      updateSchoolRequestStatus({ id, status: newStatus, actorId: user.id, note });
    }
  });
  tx();

  legacyAuditLog({
    workspaceId: null,
    actor: user.id,
    action: 'school_request.bulk',
    target: `${action}:${ids.length}`,
    payload: { action, ids, note }
  });
  return ids.length;
}

app.get('/api/admin/requests', (req, res) => {
  const user = requireSuperAdmin(req, res);
  if (!user) return;

  try {
    const status = String(req.query.status || 'pending').toLowerCase();
    const search = String(req.query.search || '').trim().toLowerCase();
    const sort = String(req.query.sort || 'new').toLowerCase();
    const requestedLimit = Number(req.query.limit);
    const limit =
      Number.isFinite(requestedLimit) && requestedLimit > 0
        ? Math.min(100, Math.floor(requestedLimit))
        : 25;
    const cursor = parseRequestCursor(req.query.cursor);

    const whereParts = [];
    const params = [];
    if (status !== 'all') {
      whereParts.push('status = ?');
      params.push(status);
    }
    if (search) {
      const term = `%${search}%`;
      whereParts.push('(LOWER(email) LIKE ? OR LOWER(payload) LIKE ?)');
      params.push(term, term);
    }
    if (cursor) {
      const compare = sort === 'old' ? '>' : '<';
      whereParts.push(`(created_at ${compare} ? OR (created_at = ? AND id ${compare} ?))`);
      params.push(cursor.createdAt, cursor.createdAt, cursor.id);
    }

    const whereClause = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';
    const orderClause = sort === 'old' ? 'created_at ASC, id ASC' : 'created_at DESC, id DESC';

    const rows = db
      .prepare(`
      SELECT id, email, status, payload, created_at AS createdAt, reviewed_by AS reviewedBy,
             reviewed_at AS reviewedAt, review_note AS reviewNote
      FROM registration_review_requests
      ${whereClause}
      ORDER BY ${orderClause}
      LIMIT ?
    `)
      .all(...params, limit + 1);

    const hasMore = rows.length > limit;
    if (hasMore) {
      rows.pop();
    }
    const lastRow = rows[rows.length - 1];
    const nextCursor = hasMore && lastRow ? encodeRequestCursor(lastRow) : null;

    const items = rows.map((row) => {
      const data = safeJsonParse(row.payload, {});
      return {
        id: row.id,
        email: row.email,
        status: row.status,
        createdAt: row.createdAt,
        reviewedBy: row.reviewedBy,
        reviewedAt: row.reviewedAt,
        reviewNote: row.reviewNote,
        data,
        meta: {
          reviewedBy: row.reviewedBy,
          reviewedAt: row.reviewedAt,
          reviewNote: row.reviewNote
        }
      };
    });

    const counts = getRequestCounts();
    res.json({ items, nextCursor, counts });
  } catch (error) {
    console.error('Failed to fetch admin requests', error);
    res.status(500).json({ error: 'Failed to fetch requests' });
  }
});

function updateSchoolRequestStatus({ id, status, actorId, note }) {
  db.prepare(`
    UPDATE registration_review_requests
    SET status = ?, reviewed_by = ?, reviewed_at = ?, review_note = ?
    WHERE id = ?
  `).run(status, actorId, Date.now(), note || null, id);
}

function ensureWorkspaceForRequest(row, reviewerId) {
  if (!row) return null;
  const payload = safeJsonParse(row.payload, {});
  const form = payload?.form || payload || {};
  const adminEmail = String(row.email || form?.schoolEmail || form?.adminEmail || '')
    .trim()
    .toLowerCase();
  if (!adminEmail) return null;

  const existing = db.prepare('SELECT id FROM workspaces WHERE admin_email = ?').get(adminEmail);
  if (existing) return existing.id;

  let workspaceId = String(
    form?.workspaceSlug ||
      form?.workspace_id ||
      form?.slug ||
      adminEmail.split('@')[0] ||
      form?.schoolCode ||
      form?.school_name ||
      ''
  )
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!workspaceId) {
    workspaceId = generateId('ws');
  }
  let candidate = workspaceId;
  let i = 1;
  while (db.prepare('SELECT id FROM workspaces WHERE id = ?').get(candidate)) {
    candidate = `${workspaceId}-${i++}`;
  }
  workspaceId = candidate;

  const name =
    String(form?.schoolName || form?.school || form?.name || adminEmail.split('@')[0] || '').trim() ||
    `School ${workspaceId}`;
  const schoolCode =
    String(form?.schoolCode || form?.school_code || form?.code || form?.id || '').trim() || null;
  const now = new Date(nowMs()).toISOString();

  db.prepare(`
    INSERT INTO workspaces (id, name, school_code, status, admin_email, approved_at, approved_by)
    VALUES (?, ?, ?, 'approved', ?, ?, ?)
  `).run(workspaceId, name, schoolCode, adminEmail, now, reviewerId);

  db.prepare(`
    INSERT OR IGNORE INTO workspace_billing (workspace_id, plan, status, currency, monthly_price_cents, billing_email, updated_at)
    VALUES (?, 'free', 'active', 'EUR', 0, ?, ?)
  `).run(workspaceId, adminEmail, nowMs());

  return workspaceId;
}

app.post('/api/admin/school-requests/:id/approve', (req, res) => {
  const user = requireSuperAdmin(req, res);
  if (!user) return;

  const id = req.params.id;
  const note = String(req.body?.note || '').trim() || null;

  const row = db.prepare(`SELECT id, payload FROM registration_review_requests WHERE id = ?`).get(id);
  if (!row) return res.status(404).json({ error: 'Request not found' });

  updateSchoolRequestStatus({ id, status: 'approved', actorId: user.id, note });
  legacyAuditLog({ workspaceId: null, actor: user.id, action: 'school_request.approve', target: id, payload: { note } });
  audit('school_request.approve', req, { user, target: id, workspaceId: null, meta: { note } });

  res.json({ ok: true });
});

app.post('/api/admin/school-requests/:id/create-workspace', async (req, res) => {
  const user = requireSuperAdmin(req, res);
  if (!user) return;

  const id = req.params.id;
  const row = db
    .prepare(`SELECT id, email, status, payload FROM registration_review_requests WHERE id = ?`)
    .get(id);
  if (!row) return res.status(404).json({ error: 'Request not found' });

  if (String(row.status || '').toLowerCase() !== 'approved') {
    return res.status(400).json({ error: 'Request must be approved first' });
  }

  const payload = safeJsonParse(row.payload, {});
  const form = payload?.form || payload || {};
  const email = String(row.email || form?.schoolEmail || form?.adminEmail || '').trim().toLowerCase();
  if (!email) {
    return res.status(400).json({ error: 'Admin email missing' });
  }

  const schoolName = String(
    form?.schoolName || form?.workspaceName || form?.school || 'New School'
  ).trim();
  let workspaceId = String(
    form?.workspaceSlug || form?.workspace_id || form?.workspace || form?.slug || ''
  )
    .trim()
    .toLowerCase();

  if (!workspaceId) {
    workspaceId = schoolName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40);
  }
  if (!workspaceId) {
    workspaceId = `school-${Date.now()}`;
  }

  if (db.prepare('SELECT 1 FROM workspaces WHERE id = ?').get(workspaceId)) {
    return res.status(409).json({ error: 'Workspace already exists', workspaceId });
  }

  const schoolCode = String(form?.schoolCode || form?.school_code || '').trim() || null;
  const now = new Date(nowMs()).toISOString();
  const workspaceName = schoolName || `School ${workspaceId}`;

  db.prepare(
    `INSERT INTO workspaces (id, name, school_code, status, admin_email, approved_at, approved_by, created_at)
     VALUES (?, ?, ?, 'approved', ?, ?, ?, ?)`
  ).run(workspaceId, workspaceName, schoolCode, email, now, user.id, now);

  const contactName = String(
    form?.contactPerson || form?.contact_name || form?.adminName || 'School Admin'
  ).trim();
  const [firstName = 'Admin', ...rest] = contactName.split(' ').filter(Boolean);
  const lastName = rest.join(' ') || 'Admin';
  const username = generateUsername(workspaceId, firstName, lastName);
  let tempPassword = null;

  const existingUser = db
    .prepare('SELECT id FROM users WHERE lower(email) = lower(?) AND workspace_id = ? LIMIT 1')
    .get(email, workspaceId);

  let adminId;
  if (existingUser) {
    adminId = existingUser.id;
    tempPassword = (Math.random().toString(36).slice(2, 10) + 'A9!').slice(0, 10);
    const passwordHash = hashPassword(tempPassword);
    db.prepare(
      `UPDATE users
       SET role='school_admin',
           status='active',
           workspace_id=?,
           password_hash=?,
           must_change_password=1,
           temp_login_started_at=?
       WHERE id=?`
    ).run(workspaceId, passwordHash, Date.now(), adminId);
  } else {
    adminId = generateId('u');
    tempPassword = (Math.random().toString(36).slice(2, 10) + 'A9!').slice(0, 10);
    const passwordHash = hashPassword(tempPassword);
    db.prepare(
      `INSERT INTO users
       (id, workspace_id, first_name, last_name, name, username, email, password_hash, role, status, created_at, must_change_password, temp_login_started_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'school_admin', 'active', ?, 1, ?)`
    ).run(
      adminId,
      workspaceId,
      firstName,
      lastName,
      contactName,
      username,
      email,
      passwordHash,
      now,
      Date.now()
    );
  }

  ensureNamedChannel(workspaceId, 'general', {
    category: 'classes',
    topic: 'Welcome to your new workspace'
  });
  ensureNamedChannel(workspaceId, 'announcements', {
    category: 'classes',
    topic: 'School-wide announcements'
  });
  ensureClubChannels(workspaceId);
  ensureToolChannels(workspaceId);
  ensureExamChannels(workspaceId);
  ensureTeachersChannel(workspaceId);
  addUserToDefaultChannels(workspaceId, adminId);
  ensureAdminsInWorkspaceChannels(workspaceId);

  let emailSent = false;
  let emailError = null;
  let emailProviderUsed = providerName || 'provider';
  if (!tempPassword) {
    emailProviderUsed = null;
  }
  if (tempPassword) {
    try {
      const schoolNameSafe = String(schoolName || 'StudisNest').trim();
      const loginUrl = `${req.protocol}://${req.get('host')}/`;
      const subject = `Your ${schoolNameSafe} admin account is ready`;
      const text = `Hello,\n\nYour school request has been approved and your admin account is ready.\n\nLogin email: ${row.email}\nTemporary password: ${tempPassword}\n\nLogin here: ${loginUrl}\n\nPlease change your password after your first login.\n\n— StudisNest`;
      const html = `
      <div style="font-family:Inter,system-ui,Arial;line-height:1.5;color:#0f172a">
        <h2 style="margin:0 0 12px 0;">Your admin account is ready ✅</h2>

        <p style="margin:0 0 14px 0;">
          Your school request has been approved and your workspace has been created.
        </p>

        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:14px;margin:14px 0;">
          <div><b>School:</b> ${escapeHtml(schoolNameSafe)}</div>
          <div><b>Workspace:</b> ${escapeHtml(workspaceId)}</div>
          <div><b>Login email:</b> ${escapeHtml(row.email)}</div>
          <div style="margin-top:10px;">
            <b>Temporary password:</b>
            <span style="display:inline-block;background:#fff;border:1px solid #e2e8f0;padding:6px 10px;border-radius:10px;font-family:ui-monospace, SFMono-Regular, Menlo, monospace;">
              ${escapeHtml(tempPassword)}
            </span>
          </div>
        </div>

        <p style="margin:0 0 14px 0;">
          <a href="${loginUrl}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:10px 14px;border-radius:10px;font-weight:700;">
            Open login
          </a>
        </p>

        <p style="margin:0;color:#475569;font-size:13px;">
          For security, please change your password after your first login.
        </p>
      </div>`;
      await sendPlatformEmail({ to: row.email, subject, text, html });
      emailSent = true;
    } catch (e) {
      console.error('Failed to send temp password email:', e);
      emailError = String(e?.message || e);
    }
  }

  legacyAuditLog({
    workspaceId,
    actor: user.id,
    action: 'school_request.create_workspace',
    target: id,
    payload: { workspaceId, email, adminId }
  });

  res.json({
    ok: true,
    workspaceId,
    adminEmail: email,
    tempPassword: existingUser ? null : tempPassword,
    emailSent,
    emailError,
    emailProvider: emailProviderUsed
  });
});

app.post('/api/admin/school-requests/:id/reject', (req, res) => {
  const user = requireSuperAdmin(req, res);
  if (!user) return;

  const id = req.params.id;
  const note = String(req.body?.note || '').trim() || null;

  const row = db.prepare(`SELECT id FROM registration_review_requests WHERE id = ?`).get(id);
  if (!row) return res.status(404).json({ error: 'Request not found' });

  updateSchoolRequestStatus({ id, status: 'rejected', actorId: user.id, note });
  legacyAuditLog({ workspaceId: null, actor: user.id, action: 'school_request.reject', target: id, payload: { note } });
  audit('school_request.reject', req, { user, target: id, workspaceId: null, meta: { note } });

  res.json({ ok: true });
});

app.post('/api/admin/school-requests/:id/flag', (req, res) => {
  const user = requireSuperAdmin(req, res);
  if (!user) return;

  const id = req.params.id;
  const note = String(req.body?.note || '').trim() || null;

  const row = db.prepare(`SELECT id FROM registration_review_requests WHERE id = ?`).get(id);
  if (!row) return res.status(404).json({ error: 'Request not found' });

  updateSchoolRequestStatus({ id, status: 'flagged', actorId: user.id, note });
  legacyAuditLog({ workspaceId: null, actor: user.id, action: 'school_request.flag', target: id, payload: { note } });
  audit('school_request.flag', req, { user, target: id, workspaceId: null, meta: { note } });

  res.json({ ok: true });
});

app.post('/api/admin/school-requests/bulk', (req, res) => {
  const user = requireSuperAdmin(req, res);
  if (!user) return;

  const action = String(req.body?.action || '').toLowerCase();
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
  const note = String(req.body?.note || '').trim() || null;

  try {
    const updated = performBulkRequestAction({ action, ids, note, user });
    res.json({ ok: true, updated });
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message });
  }
});

app.post('/api/admin/requests/bulk', (req, res) => {
  const user = requireSuperAdmin(req, res);
  if (!user) return;

  const action = String(req.body?.action || '').toLowerCase();
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
  const note = String(req.body?.note || '').trim() || null;

  try {
    const updated = performBulkRequestAction({ action, ids, note, user });
    res.json({ ok: true, updated });
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message });
  }
});

const MAX_EXPORT_ROWS = 5000;

function normalizeRequestForm(row) {
  const payload = safeJsonParse(row.payload, {});
  return payload?.form || payload || {};
}

function getRequestSchool(form) {
  return (
    form.schoolName ||
    form.school_name ||
    form.school ||
    form.name ||
    form.workspaceName ||
    form.workspace ||
    form.workspace_id ||
    form.slug ||
    ''
  );
}

function getRequestPhone(form) {
  const phone = form.phone || form.mobile || form.phoneNumber || form.phone_number || form.mobileNumber || '';
  const prefix = form.countryCode || form.country_code || '';
  return prefix && phone ? `${prefix} ${phone}` : phone || '';
}

function getRequestCity(form) {
  return form.city || form.locationCity || form.location_city || '';
}

function getRequestCountry(form) {
  return form.country || form.locationCountry || form.location_country || '';
}

function getRequestWorkspaceSlug(form) {
  return form.workspaceSlug || form.workspace_id || form.workspace || form.slug || '';
}

function csvEscape(value) {
  const text = String(value ?? '');
  if (text.includes('"') || text.includes(',') || text.includes('\n')) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function buildRequestCsv(rows) {
  const cols = [
    'id',
    'createdAt',
    'status',
    'email',
    'school',
    'phone',
    'city',
    'country',
    'workspaceSlug',
    'reviewNote'
  ];
  const lines = [cols.join(',')];
  for (const row of rows) {
    const form = normalizeRequestForm(row);
    const values = [
      row.id,
      new Date(Number(row.createdAt) || Date.now()).toISOString(),
      row.status,
      row.email,
      getRequestSchool(form),
      getRequestPhone(form),
      getRequestCity(form),
      getRequestCountry(form),
      getRequestWorkspaceSlug(form),
      row.reviewNote || ''
    ];
    lines.push(values.map(csvEscape).join(','));
  }
  return lines.join('\n');
}

function buildRequestFilter(whereParts, params, status, search) {
  if (status && status !== 'all') {
    whereParts.push('status = ?');
    params.push(status);
  }
  if (search) {
    const term = `%${search}%`;
    whereParts.push('(LOWER(email) LIKE ? OR LOWER(payload) LIKE ?)');
    params.push(term, term);
  }
}

app.get('/api/admin/requests/export.csv', (req, res) => {
  const user = requireSuperAdmin(req, res);
  if (!user) return;

  try {
    const status = String(req.query.status || 'pending').toLowerCase();
    const search = String(req.query.search || '').trim().toLowerCase();
    const sort = String(req.query.sort || 'new').toLowerCase();
    const limitParam = Number(req.query.limit);
    const limit =
      Number.isFinite(limitParam) && limitParam > 0
        ? Math.min(MAX_EXPORT_ROWS, Math.floor(limitParam))
        : 1000;

    const whereParts = [];
    const params = [];
    buildRequestFilter(whereParts, params, status, search);
    const whereClause = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';
    const orderClause = sort === 'old' ? 'created_at ASC, id ASC' : 'created_at DESC, id DESC';

    const rows = db
      .prepare(`
      SELECT id, email, status, payload, created_at AS createdAt, review_note AS reviewNote
      FROM registration_review_requests
      ${whereClause}
      ORDER BY ${orderClause}
      LIMIT ?
    `)
      .all(...params, limit);

    const csv = buildRequestCsv(rows);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="school_requests_${status}.csv"`);
    res.send(csv);
  } catch (error) {
    console.error('Failed to export school requests', error);
    res.status(500).json({ error: 'Failed to export requests' });
  }
});

app.post('/api/admin/requests/export.csv', (req, res) => {
  const user = requireSuperAdmin(req, res);
  if (!user) return;

  const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
  if (!ids.length) {
    return res.status(400).json({ error: 'No ids provided' });
  }
  if (ids.length > MAX_EXPORT_ROWS) {
    return res.status(400).json({ error: `Cannot export more than ${MAX_EXPORT_ROWS} requests at once.` });
  }

  try {
    const placeholders = ids.map(() => '?').join(',');
    const rows = db
      .prepare(`
      SELECT id, email, status, payload, created_at AS createdAt, review_note AS reviewNote
      FROM registration_review_requests
      WHERE id IN (${placeholders})
      ORDER BY created_at DESC, id DESC
    `)
      .all(...ids);
    const csv = buildRequestCsv(rows);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="school_requests_selected.csv"');
    res.send(csv);
  } catch (error) {
    console.error('Failed to export selected school requests', error);
    res.status(500).json({ error: 'Failed to export requests' });
  }
});

app.get('/api/admin/security/overview', (req, res) => {
  const u = getAuthedUser(req);
  if (!u || !isSuperAdminUser(u)) return res.status(403).json({ error: 'Forbidden' });

  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;

  const failed24h = db
    .prepare(
      `
      SELECT COUNT(*) AS n
      FROM login_attempts
      WHERE success = 0 AND created_at >= ?
    `
    )
    .get(now - day).n;

  const success24h = db
    .prepare(
      `
      SELECT COUNT(*) AS n
      FROM login_attempts
      WHERE success = 1 AND created_at >= ?
    `
    )
    .get(now - day).n;

  const pwdChanges24h = db
    .prepare(
      `
      SELECT COUNT(*) AS n
      FROM security_events
      WHERE type = 'security.password_changed' AND created_at >= ?
    `
    )
    .get(now - day).n;

  const mustChange = db
    .prepare(
      `
      SELECT COUNT(*) AS n
      FROM users
      WHERE COALESCE(must_change_password, 0) = 1
    `
    )
    .get().n;

  const invites7dThreshold = new Date(now - 7 * day).toISOString();
  const invites7d = db
    .prepare(
      `
      SELECT COUNT(*) AS n
      FROM registration_links
      WHERE created_at >= ?
    `
    )
    .get(invites7dThreshold).n;

  const inviteUsed7d = db
    .prepare(
      `
      SELECT COUNT(*) AS n
      FROM registration_links
      WHERE used = 1 AND created_at >= ?
    `
    )
    .get(invites7dThreshold).n;

  res.json({
    ok: true,
    kpis: {
      failedLogins24h: failed24h,
      successfulLogins24h: success24h,
      passwordChanges24h: pwdChanges24h,
      usersMustChangePassword: mustChange,
      invitesCreated7d: invites7d,
      invitesUsed7d: inviteUsed7d
    }
  });
});

app.get('/api/admin/security/top-attacks', (req, res) => {
  const admin = requireSuperAdmin(req, res);
  if (!admin) return;

  const sinceHours = Math.min(720, Math.max(1, Number(req.query?.hours || 24)));
  const since = Date.now() - sinceHours * 60 * 60 * 1000;

  const rows = db
    .prepare(
      `
        SELECT
          LOWER(identifier) AS identifier,
          COUNT(*) AS failedCount,
          MAX(created_at) AS lastSeen
        FROM login_attempts
        WHERE success = 0 AND created_at >= ?
        GROUP BY LOWER(identifier)
        ORDER BY failedCount DESC
        LIMIT 20
      `
    )
    .all(since);

  res.json({ ok: true, rows });
});

app.get('/api/admin/security/failed-by-ip', (req, res) => {
  const admin = requireSuperAdmin(req, res);
  if (!admin) return;

  const sinceHours = Math.min(720, Math.max(1, Number(req.query?.hours || 24)));
  const since = Date.now() - sinceHours * 60 * 60 * 1000;

  const rows = db
    .prepare(
      `
        SELECT
          ip,
          COUNT(*) AS failedCount,
          MAX(created_at) AS lastSeen
        FROM login_attempts
        WHERE success = 0 AND created_at >= ? AND ip IS NOT NULL AND ip <> ''
        GROUP BY ip
        ORDER BY failedCount DESC
        LIMIT 50
      `
    )
    .all(since);

  const blocked = db
    .prepare(`SELECT ip, reason, created_at FROM ip_blocklist ORDER BY created_at DESC LIMIT 500`)
    .all();
  const blockedSet = new Set(blocked.map((b) => b.ip));

  res.json({ ok: true, rows: rows.map((r) => ({ ...r, blocked: blockedSet.has(r.ip) })), blocked });
});

app.post('/api/admin/security/ip-block', express.json(), (req, res) => {
  const admin = requireSuperAdmin(req, res);
  if (!admin) return;

  const ip = String(req.body?.ip || '').trim();
  const reason = String(req.body?.reason || '').trim() || null;
  if (!ip) return res.status(400).json({ error: 'IP required' });

  db.prepare(
    `
      INSERT OR REPLACE INTO ip_blocklist (ip, reason, created_at, created_by)
      VALUES (?, ?, ?, ?)
    `
  ).run(ip, reason, Date.now(), admin.id);

  logSecurityEvent({
    type: 'security.ip_blocked',
    severity: 'high',
    actorUserId: admin.id,
    ip,
    payload: { reason }
  });

  res.json({ ok: true });
});

app.post('/api/admin/security/ip-unblock', express.json(), (req, res) => {
  const admin = requireSuperAdmin(req, res);
  if (!admin) return;

  const ip = String(req.body?.ip || '').trim();
  if (!ip) return res.status(400).json({ error: 'IP required' });

  db.prepare(`DELETE FROM ip_blocklist WHERE ip = ?`).run(ip);

  logSecurityEvent({
    type: 'security.ip_unblocked',
    severity: 'warn',
    actorUserId: admin.id,
    ip
  });

  res.json({ ok: true });
});

app.get('/api/admin/security/sessions', (req, res) => {
  const admin = requireSuperAdmin(req, res);
  if (!admin) return;

  const q = String(req.query?.q || '').trim().toLowerCase();
  const limit = Math.min(100, Math.max(10, Number(req.query?.limit || 50)));

  let rows;
  if (q) {
    rows = db
      .prepare(
        `
          SELECT rt.*,
                 u.email AS email,
                 u.role AS role,
                 u.workspace_id AS workspaceId
          FROM refresh_tokens rt
          LEFT JOIN users u ON u.id = rt.user_id
          WHERE lower(COALESCE(u.email,'')) LIKE ?
          ORDER BY rt.created_at DESC
          LIMIT ?
        `
      )
      .all(`%${q}%`, limit);
  } else {
    rows = db
      .prepare(
        `
          SELECT rt.*,
                 u.email AS email,
                 u.role AS role,
                 u.workspace_id AS workspaceId
          FROM refresh_tokens rt
          LEFT JOIN users u ON u.id = rt.user_id
          ORDER BY rt.created_at DESC
          LIMIT ?
        `
      )
      .all(limit);
  }

  res.json({ ok: true, rows });
});

app.post('/api/admin/security/sessions/:id/revoke', express.json(), (req, res) => {
  const admin = requireSuperAdmin(req, res);
  if (!admin) return;

  const id = String(req.params?.id || '').trim();
  db.prepare(`UPDATE refresh_tokens SET revoked_at = ? WHERE id = ?`).run(Date.now(), id);

  logSecurityEvent({
    type: 'security.session_revoked',
    severity: 'warn',
    actorUserId: admin.id,
    payload: { refreshTokenId: id }
  });

  res.json({ ok: true });
});

app.post('/api/admin/security/users/:userId/revoke-all-sessions', express.json(), (req, res) => {
  const admin = requireSuperAdmin(req, res);
  if (!admin) return;

  const userId = String(req.params?.userId || '').trim();
  db
    .prepare(`UPDATE refresh_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL`)
    .run(Date.now(), userId);

  logSecurityEvent({
    type: 'security.user_sessions_revoked_all',
    severity: 'high',
    actorUserId: admin.id,
    targetUserId: userId
  });

  res.json({ ok: true });
});

app.get('/api/admin/security/events', (req, res) => {
  const u = getAuthedUser(req);
  if (!u || !isSuperAdminUser(u)) return res.status(403).json({ error: 'Forbidden' });

  const limit = Math.min(200, Math.max(10, Number(req.query.limit || 50)));
  const q = String(req.query.q || '').trim().toLowerCase();
  const type = String(req.query.type || '').trim();

  let rows = [];
  if (q) {
    const params = [`%${q}%`, `%${q}%`, `%${q}%`];
    if (type) params.push(type);
    params.push(limit);
    rows = db
      .prepare(`
      SELECT e.*,
             au.email AS actorEmail,
             tu.email AS targetEmail
      FROM security_events e
      LEFT JOIN users au ON au.id = e.actor_user_id
      LEFT JOIN users tu ON tu.id = e.target_user_id
      WHERE (lower(e.type) LIKE ? OR lower(COALESCE(au.email,'')) LIKE ? OR lower(COALESCE(tu.email,'')) LIKE ?)
      ${type ? 'AND e.type = ?' : ''}
      ORDER BY e.created_at DESC
      LIMIT ?
    `)
      .all(...params);
  } else {
    const params = [];
    if (type) params.push(type);
    params.push(limit);
    rows = db
      .prepare(`
      SELECT e.*,
             au.email AS actorEmail,
             tu.email AS targetEmail
      FROM security_events e
      LEFT JOIN users au ON au.id = e.actor_user_id
      LEFT JOIN users tu ON tu.id = e.target_user_id
      ${type ? 'WHERE e.type = ?' : ''}
      ORDER BY e.created_at DESC
      LIMIT ?
    `)
      .all(...params);
  }

  res.json({ ok: true, events: rows });
});

app.get('/api/workspaces/:workspaceId/email-settings', (req, res) => {
  const user = getAuthedUser(req);
  if (!canManageWorkspaceSettings(user)) return res.status(403).json({ error: 'Forbidden' });

  const workspaceId = String(req.params.workspaceId || '');
  const userWs = user.workspaceId || user.workspace_id || 'default';
  if (workspaceId !== String(userWs)) return res.status(403).json({ error: 'Wrong workspace' });

  const workspaceRow = db
    .prepare('SELECT name, logo_url AS logoUrl FROM workspaces WHERE id = ?')
    .get(workspaceId) || {};
  const row = db
    .prepare('SELECT * FROM workspace_email_settings WHERE workspace_id = ?')
    .get(workspaceId);

  const adminEmail = getWorkspaceAdminEmail(workspaceId);
  const replyToDefault = adminEmail || String(user?.email || '').trim();
  const defaults = {
    workspace_id: workspaceId,
    enabled: 0,
    brand_school_name: workspaceRow.name || '',
    reply_to_email: replyToDefault,
    footer_text: '',
    subject_prefix: '',
    manual_body_text: '',
    logo_url: workspaceRow.logoUrl || '',
    signature_html: ''
  };

  const merged = { ...defaults, ...(row || {}), workspace_id: workspaceId };
  if (!merged.reply_to_email) {
    merged.reply_to_email = replyToDefault;
  }
  if (!merged.brand_school_name) {
    merged.brand_school_name = workspaceRow.name || '';
  }
  if (!merged.logo_url) {
    merged.logo_url = workspaceRow.logoUrl || '';
  }

  res.json(merged);
});

app.post('/api/workspaces/:workspaceId/email-settings', (req, res) => {
  const user = getAuthedUser(req);
  if (!canManageWorkspaceSettings(user)) return res.status(403).json({ error: 'Forbidden' });

  const workspaceId = String(req.params.workspaceId || '');
  const userWs = user.workspaceId || user.workspace_id || 'default';
  if (workspaceId !== String(userWs)) return res.status(403).json({ error: 'Wrong workspace' });

  const body = req.body || {};
  const enabled = body.enabled ? 1 : 0;

  const brandSchoolName = String(body.brand_school_name || '').trim();
  const replyTo = String(body.reply_to_email || '').trim();
  const footerText = String(body.footer_text || '').trim();
  const subjectPrefix = String(body.subject_prefix || '').trim();
  const logoUrl = String(body.logo_url || '').trim();
  const signatureHtml = String(body.signature_html || '').trim();
  const manualBodyText = String(body.manual_body_text || '').trim();

  db.prepare(`
    INSERT INTO workspace_email_settings
      (workspace_id, enabled, brand_school_name, reply_to_email, footer_text, subject_prefix, manual_body_text, logo_url, signature_html, updated_at)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(workspace_id) DO UPDATE SET
      enabled = excluded.enabled,
      brand_school_name = excluded.brand_school_name,
      reply_to_email = excluded.reply_to_email,
      footer_text = excluded.footer_text,
      subject_prefix = excluded.subject_prefix,
      manual_body_text = excluded.manual_body_text,
      logo_url = excluded.logo_url,
      signature_html = excluded.signature_html,
      updated_at = datetime('now')
  `).run(
    workspaceId,
    enabled,
    brandSchoolName,
    replyTo,
    footerText,
    subjectPrefix,
    manualBodyText,
    logoUrl,
    signatureHtml
  );

  res.json({ ok: true });
});

app.post('/api/workspaces/:workspaceId/email-settings/test', async (req, res) => {
  const user = getAuthedUser(req);
  if (!canManageWorkspaceSettings(user)) return res.status(403).json({ error: 'Forbidden' });

  const workspaceId = String(req.params.workspaceId || '');
  const userWs = user.workspaceId || user.workspace_id || 'default';
  if (workspaceId !== String(userWs)) return res.status(403).json({ error: 'Wrong workspace' });

  const to = String(req.body?.to || '').trim();
  if (!to.includes('@')) return res.status(400).json({ error: "Valid 'to' required" });

  const s = db.prepare('SELECT * FROM workspace_email_settings WHERE workspace_id = ?').get(workspaceId) || {};
  const workspaceRow =
    db.prepare('SELECT name, admin_email FROM workspaces WHERE id = ?').get(workspaceId) || {};
  const profileRow = db.prepare('SELECT * FROM workspace_profile WHERE workspace_id = ?').get(workspaceId) || {};
  const replyTo = String(s.reply_to_email || workspaceRow.admin_email || '').trim();
  const requestBodyText = String(req.body?.manual_body_text || '').trim();
  const subjectText = String(req.body?.subject || '').trim();

  const normalizedSettings = {
    ...s,
    brand_school_name: String(s.brand_school_name || workspaceRow.name || '').trim(),
    reply_to_email: replyTo,
    footer_text: String(s.footer_text || '').trim()
  };
  const brandName = normalizedSettings.brand_school_name || workspaceRow.name || '';
  const brandLabel = brandName ? `${brandName} · Powered by StudiesTalk` : 'StudiesTalk';
  const manualText =
    requestBodyText ||
    String(s.manual_body_text || '').trim() ||
    `This is a test email from ${brandLabel}.`;
  const subject = subjectText || `${brandName || 'StudiesTalk'} email test`;
  const escapedText = escapeHtml(manualText);
  const signatureHtml = buildEmailSignatureBlock({
    profileRow,
    workspaceRow,
    settings: normalizedSettings
  });
  const bodyHtml = `<div style="margin-bottom:12px;">${escapedText.replace(/\n/g, '<br>')}</div>`;
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1.0" />
        <title>${escapeHtml(subject)}</title>
      </head>
      <body style="margin:0;background:#fff;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial;color:#0f172a;">
        <div style="padding:18px;width:100%;box-sizing:border-box;">
          <div style="width:100%;background:#fff;border-radius:16px;padding:22px;box-shadow:0 20px 40px rgba(15,23,42,0.08);box-sizing:border-box;">
            ${bodyHtml}
            ${signatureHtml}
          </div>
        </div>
      </body>
    </html>
  `.trim();
  const text = manualText;
  const logId = `elog_${crypto.randomUUID()}`;
  const recipientName =
    String(req.body?.toName || '').trim() || resolveRecipientName(workspaceId, to);
  const fromName = buildSchoolDisplayName(
    String(normalizedSettings.brand_school_name || workspaceRow.name || '').trim()
  );
  const baseLog = {
    id: logId,
    workspaceId,
    sentByUserId: user.id,
    toEmail: to,
    toName: recipientName,
    subject,
    bodyText: text,
    bodyHtml: html,
    type: 'test'
  };
  const monitoredReplyTo = getInboundMailboxEmail() || replyTo;
  const outboundHeaders = {
    'X-StudiesTalk-Workspace': workspaceId,
    'X-StudiesTalk-Email-Log': logId
  };

  try {
    const info = await sendPlatformEmail({
      to,
      subject,
      html,
      text,
      replyTo: monitoredReplyTo,
      fromName,
      headers: outboundHeaders
    });
    recordEmailLog({
      ...baseLog,
      status: 'sent',
      messageId: normalizeEmailMessageId(info?.messageId || '')
    });
    res.json({ ok: true, provider: providerName });
  } catch (e) {
    recordEmailLog({ ...baseLog, status: 'failed', errorMessage: String(e.message || e) });
    res.status(400).json({ ok: false, error: String(e.message || e) });
  }
});

app.get('/api/workspaces/:workspaceId/email-templates', (req, res) => {
  const user = getAuthedUser(req);
  if (!canManageWorkspaceSettings(user)) return res.status(403).json({ error: 'Forbidden' });

  const workspaceId = String(req.params.workspaceId || '');
  const userWs = user.workspaceId || user.workspace_id || 'default';
  if (workspaceId !== String(userWs)) return res.status(403).json({ error: 'Wrong workspace' });

  res.json({ templates: listWorkspaceEmailTemplatesMerged(workspaceId) });
});

app.get('/api/workspaces/:workspaceId/email-templates/:templateKey', (req, res) => {
  const user = getAuthedUser(req);
  if (!canManageWorkspaceSettings(user)) return res.status(403).json({ error: 'Forbidden' });

  const workspaceId = String(req.params.workspaceId || '');
  const userWs = user.workspaceId || user.workspace_id || 'default';
  if (workspaceId !== String(userWs)) return res.status(403).json({ error: 'Wrong workspace' });

  const templateKey = String(req.params.templateKey || '');
  if (!EMAIL_TEMPLATE_DEF_MAP.has(templateKey)) {
    return res.status(404).json({ error: 'Unknown template key' });
  }

  const merged = listWorkspaceEmailTemplatesMerged(workspaceId).find((t) => t.template_key === templateKey);

  res.json(merged);
});

app.put('/api/workspaces/:workspaceId/email-templates/:templateKey', (req, res) => {
  const user = getAuthedUser(req);
  if (!canManageWorkspaceSettings(user)) return res.status(403).json({ error: 'Forbidden' });

  const workspaceId = String(req.params.workspaceId || '');
  const userWs = user.workspaceId || user.workspace_id || 'default';
  if (workspaceId !== String(userWs)) return res.status(403).json({ error: 'Wrong workspace' });

  const templateKey = String(req.params.templateKey || '');
  if (!EMAIL_TEMPLATE_DEF_MAP.has(templateKey)) {
    return res.status(404).json({ error: 'Unknown template key' });
  }

  const body = req.body || {};
  const required = defRequiredTokens(templateKey);

  const subject = String(body.subject || '');
  const bodyHtml = String(body.body_html || '');
  const bodyText = String(body.body_text || stripHtmlToText(bodyHtml));
  const enabled = body.enabled !== undefined ? !!body.enabled : true;

  const combined = `${subject}\n${bodyHtml}\n${bodyText}`;
  const missing = required.filter((tok) => !combined.includes(`{{${tok}}}`));
  if (missing.length) {
    return res.status(400).json({ error: 'Missing required tokens', missing });
  }

  upsertWorkspaceEmailTemplate(
    workspaceId,
    templateKey,
    {
      subject,
      body_html: bodyHtml,
      body_text: bodyText,
      required_tokens_json: JSON.stringify(required),
      enabled
    },
    user.id
  );

  res.json({ ok: true });
});

app.post('/api/workspaces/:workspaceId/email-templates/:templateKey/reset', (req, res) => {
  const user = getAuthedUser(req);
  if (!canManageWorkspaceSettings(user)) return res.status(403).json({ error: 'Forbidden' });

  const workspaceId = String(req.params.workspaceId || '');
  const userWs = user.workspaceId || user.workspace_id || 'default';
  if (workspaceId !== String(userWs)) return res.status(403).json({ error: 'Wrong workspace' });

  const templateKey = String(req.params.templateKey || '');
  if (!EMAIL_TEMPLATE_DEF_MAP.has(templateKey)) {
    return res.status(404).json({ error: 'Unknown template key' });
  }

  deleteWorkspaceEmailTemplate(workspaceId, templateKey);
  res.json({ ok: true });
});

app.post('/api/workspaces/:workspaceId/email-templates/:templateKey/test', async (req, res) => {
  const user = getAuthedUser(req);
  if (!canManageWorkspaceSettings(user)) return res.status(403).json({ error: 'Forbidden' });

  const workspaceId = String(req.params.workspaceId || '');
  const userWs = user.workspaceId || user.workspace_id || 'default';
  if (workspaceId !== String(userWs)) return res.status(403).json({ error: 'Wrong workspace' });

  const templateKey = String(req.params.templateKey || '');
  if (!EMAIL_TEMPLATE_DEF_MAP.has(templateKey)) {
    return res.status(404).json({ error: 'Unknown template key' });
  }

  const to = String(req.body?.to || '').trim();
  if (!to.includes('@')) return res.status(400).json({ error: "Valid 'to' required" });

  const merged = listWorkspaceEmailTemplatesMerged(workspaceId).find((t) => t.template_key === templateKey);

  const s = db.prepare('SELECT * FROM workspace_email_settings WHERE workspace_id = ?').get(workspaceId) || {};
  const workspaceRow =
    db.prepare('SELECT name, admin_email FROM workspaces WHERE id = ?').get(workspaceId) || {};
  const profileRow = db.prepare('SELECT * FROM workspace_profile WHERE workspace_id = ?').get(workspaceId) || {};

  const replyTo = String(s.reply_to_email || workspaceRow.admin_email || '').trim();

  const vars = {
    school_name: String(s.brand_school_name || workspaceRow.name || 'School'),
    support_email: String(replyTo || 'support@school.com'),
    student_name: 'Student Name',
    teacher_name: 'Teacher Name',
    user_name: 'User Name',
    login_url: 'https://example.com/login',
    set_password_link: 'https://example.com/set-password?token=TEST',
    link_expiry_hours: '48',
    reset_link: 'https://example.com/reset?token=TEST',
    reset_expiry_minutes: '30',
    otp_code: '123456',
    otp_expiry_minutes: '5',
    session_title: 'Live Class',
    session_start: '2026-02-10 10:00',
    session_end: '2026-02-10 11:00',
    session_link: 'https://example.com/live/TEST',
    invoice_number: 'INV-1001',
    amount: '99.00',
    currency: 'EUR',
    invoice_link: 'https://example.com/invoice/INV-1001',
    receipt_link: 'https://example.com/receipt/TEST',
    course_name: 'Course Name',
    course_end_date: '2026-03-01',
    course_link: 'https://example.com/courses/TEST',
    class_name: 'Class Name',
    class_date: '2026-02-14',
    exam_name: 'Exam Name',
    exam_date: '2026-03-10',
    exam_location: 'Main Campus'
  };

  const subject = renderTokensPlain(merged.subject, vars);
  const bodyInner = renderTokensHtml(merged.body_html, vars);

  const signatureHtml = buildEmailSignatureBlock({
    profileRow,
    workspaceRow,
    settings: {
      ...s,
      brand_school_name: String(s.brand_school_name || workspaceRow.name || '').trim(),
      reply_to_email: replyTo,
      footer_text: String(s.footer_text || '').trim()
    }
  });

  const html = `
    <!DOCTYPE html>
    <html><head><meta charset="utf-8"/></head>
    <body style="margin:0;background:#fff;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial;color:#0f172a;">
      <div style="padding:18px;box-sizing:border-box;">
        <div style="background:#fff;border-radius:16px;padding:22px;box-shadow:0 20px 40px rgba(15,23,42,0.08);">
          ${bodyInner}
          ${signatureHtml}
        </div>
      </div>
    </body></html>
  `.trim();

  const text = renderTokensPlain(merged.body_text, vars);

  const logId = `elog_${crypto.randomUUID()}`;
  const recipientName = resolveRecipientName(workspaceId, to);
  const fromName = buildAutomatedEmailSenderName(
    String(s.brand_school_name || workspaceRow.name || '').trim(),
    templateKey
  );

  try {
    await sendPlatformEmail({ to, subject, html, text, replyTo, fromName });
    recordEmailLog({
      id: logId,
      workspaceId,
      sentByUserId: user.id,
      toEmail: to,
      toName: recipientName,
      subject,
      bodyText: text,
      bodyHtml: html,
      type: `template_test:${templateKey}`,
      status: 'sent'
    });
    res.json({ ok: true, provider: providerName });
  } catch (e) {
    recordEmailLog({
      id: logId,
      workspaceId,
      sentByUserId: user.id,
      toEmail: to,
      toName: recipientName,
      subject,
      bodyText: text,
      bodyHtml: html,
      type: `template_test:${templateKey}`,
      status: 'failed',
      errorMessage: String(e.message || e)
    });
    res.status(400).json({ ok: false, error: String(e.message || e) });
  }
});

app.get('/api/workspaces/:workspaceId/email-inbox', async (req, res) => {
  const user = getAuthedUser(req);
  if (!canManageWorkspaceSettings(user)) return res.status(403).json({ error: 'Forbidden' });

  const workspaceId = String(req.params.workspaceId || '');
  const userWs = user.workspaceId || user.workspace_id || 'default';
  if (workspaceId !== String(userWs)) return res.status(403).json({ error: 'Wrong workspace' });

  if (!inboundEmailService.isConfigured()) {
    return res.json({ ok: true, configured: false, messages: [] });
  }

  try {
    const limit = Number.parseInt(String(req.query.limit || ''), 10);
    const messages = await inboundEmailService.fetchLatestMessages(limit);
    res.json({ ok: true, configured: true, messages });
  } catch (err) {
    console.error('[InboundEmail] Failed to load inbox', err?.message || err);
    res
      .status(500)
      .json({ error: 'Could not load inbox messages', details: String(err?.message || err) });
  }
});

app.get('/api/admin/inbox', async (req, res) => {
  const shouldSync = String(req.query.sync || '0') === '1';
  const folder = String(req.query.folder || 'inbox').trim().toLowerCase() === 'trash'
    ? 'trash'
    : 'inbox';
  if (shouldSync && inboundEmailService.isConfigured()) {
    try {
      await inboundEmailService.syncInboundEmails(db);
    } catch (err) {
      console.error('[InboundEmail] Failed to sync inbox before listing', err?.message || err);
    }
  }

  const rows = db
    .prepare(`
      SELECT *
      FROM inbound_emails
      WHERE folder = ?
      ORDER BY received_at DESC
    `)
    .all(folder);

  const repliesStmt = db.prepare(`
    SELECT id, body, created_at
    FROM email_replies
    WHERE inbound_email_id = ?
    ORDER BY created_at ASC
  `);

  const inboxRows = rows.map((row) => {
    const attachments = parseAttachmentsForRow(row);
    const safeAttachments = attachments
      .filter(Boolean)
      .map((att) => ({
        id: String(att.id || '').trim(),
        filename: String(att.filename || 'attachment'),
        size: Number(att.size || 0),
        contentType: String(att.contentType || ''),
        inline: Boolean(att.inline),
        contentId: String(att.contentId || '')
      }))
      .filter((att) => att.id);

    const { attachments_json, ...rest } = row;
    return {
      ...rest,
      replies: (repliesStmt.all(row.id) || []).map((reply) => ({
        id: reply?.id,
        body: reply?.body || '',
        created_at: reply?.created_at || ''
      })),
      attachments: safeAttachments,
      hasAttachments: safeAttachments.length > 0,
      attachmentsCount: safeAttachments.length,
      totalAttachmentBytes: safeAttachments.reduce((sum, att) => sum + (Number(att.size) || 0), 0),
      hasInline: safeAttachments.some((att) => Boolean(att.inline || att.contentId))
    };
  });

  res.json(inboxRows);
});

function parseInboxBulkIds(body = {}) {
  return Array.isArray(body?.ids)
    ? body.ids
        .map((value) => Number.parseInt(String(value || '').trim(), 10))
        .filter((value) => Number.isFinite(value))
    : [];
}

function deleteInboxRowsForever(rows = []) {
  for (const row of rows) {
    const messageId = String(row?.message_id || '').trim();
    if (messageId) {
      db.prepare(`
        INSERT INTO deleted_inbound_emails (message_id, deleted_at)
        VALUES (?, datetime('now'))
        ON CONFLICT(message_id) DO UPDATE SET deleted_at = datetime('now')
      `).run(messageId);
    }
    const attachments = parseAttachmentsForRow(row);
    for (const attachment of attachments) {
      const filePath = resolveAttachmentFilePath(attachment?.storedName);
      if (!filePath) continue;
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (err) {
        console.warn('[InboundEmail] Failed to delete attachment file', filePath, err?.message || err);
      }
    }
  }
}

app.post(
  '/api/admin/inbox/bulk-delete',
  requireAccessToken,
  requireAdmin,
  express.json(),
  async (req, res) => {
    try {
      const ids = parseInboxBulkIds(req.body);

      if (!ids.length) {
        return res.status(400).json({ error: 'No inbox emails selected' });
      }

      const selectStmt = db.prepare(
        `SELECT id, message_id, attachments_json FROM inbound_emails WHERE id IN (${ids.map(() => '?').join(',')})`
      );
      const rows = selectStmt.all(...ids);
      if (!rows.length) {
        return res.status(404).json({ error: 'Selected inbox emails were not found' });
      }

      for (const row of rows) {
        void row;
      }

      db.prepare(
        `UPDATE inbound_emails SET folder = 'trash' WHERE id IN (${ids.map(() => '?').join(',')})`
      ).run(...ids);

      res.json({ ok: true, deleted: rows.length, movedTo: 'trash' });
    } catch (err) {
      console.error('[InboundEmail] Bulk delete failed', err?.message || err);
      res.status(500).json({ error: 'Failed to delete inbox emails' });
    }
  }
);

app.post(
  '/api/admin/inbox/bulk-restore',
  requireAccessToken,
  requireAdmin,
  express.json(),
  async (req, res) => {
    try {
      const ids = parseInboxBulkIds(req.body);
      if (!ids.length) {
        return res.status(400).json({ error: 'No trash emails selected' });
      }

      const restored = db.prepare(
        `UPDATE inbound_emails SET folder = 'inbox' WHERE id IN (${ids.map(() => '?').join(',')}) AND folder = 'trash'`
      ).run(...ids);

      res.json({ ok: true, restored: Number(restored?.changes || 0) });
    } catch (err) {
      console.error('[InboundEmail] Bulk restore failed', err?.message || err);
      res.status(500).json({ error: 'Failed to restore trash emails' });
    }
  }
);

app.post(
  '/api/admin/inbox/bulk-delete-forever',
  requireAccessToken,
  requireAdmin,
  express.json(),
  async (req, res) => {
    try {
      const ids = parseInboxBulkIds(req.body);
      if (!ids.length) {
        return res.status(400).json({ error: 'No trash emails selected' });
      }

      const rows = db.prepare(
        `SELECT id, message_id, attachments_json FROM inbound_emails WHERE id IN (${ids.map(() => '?').join(',')}) AND folder = 'trash'`
      ).all(...ids);
      if (!rows.length) {
        return res.status(404).json({ error: 'Selected trash emails were not found' });
      }

      deleteInboxRowsForever(rows);
      db.prepare(
        `DELETE FROM inbound_emails WHERE id IN (${rows.map(() => '?').join(',')})`
      ).run(...rows.map((row) => row.id));

      res.json({ ok: true, deleted: rows.length });
    } catch (err) {
      console.error('[InboundEmail] Permanent delete failed', err?.message || err);
      res.status(500).json({ error: 'Failed to delete trash emails forever' });
    }
  }
);

app.post(
  '/api/admin/inbox/empty-trash',
  requireAccessToken,
  requireAdmin,
  express.json(),
  async (_req, res) => {
    try {
      const rows = db
        .prepare(`SELECT id, message_id, attachments_json FROM inbound_emails WHERE folder = 'trash'`)
        .all();

      if (!rows.length) {
        return res.json({ ok: true, deleted: 0 });
      }

      deleteInboxRowsForever(rows);
      db.prepare(`DELETE FROM inbound_emails WHERE folder = 'trash'`).run();

      res.json({ ok: true, deleted: rows.length });
    } catch (err) {
      console.error('[InboundEmail] Empty trash failed', err?.message || err);
      res.status(500).json({ error: 'Failed to clean trash' });
    }
  }
);

app.get(
  '/api/admin/inbox/:emailId/attachments/:attachmentId',
  requireAccessToken,
  requireAdmin,
  (req, res) => {
    const emailId = String(req.params.emailId || '').trim();
    const attachmentId = String(req.params.attachmentId || '').trim();
    if (!emailId || !attachmentId) {
      return res.status(400).json({ error: 'Email and attachment IDs are required' });
    }

    const found = findInboxAttachment(emailId, attachmentId);
    if (!found) {
      return res.status(404).json({ error: 'Attachment not found' });
    }
    const filePath = resolveAttachmentFilePath(found.attachment.storedName);
    if (!filePath) {
      return res.status(400).json({ error: 'Invalid attachment path' });
    }
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Attachment file not found' });
    }
    return streamAttachmentResponse(res, filePath, found.attachment, 'attachment');
  }
);

app.get(
  '/api/admin/inbox/:emailId/attachments/:attachmentId/view',
  requireAccessToken,
  requireAdmin,
  (req, res) => {
    const emailId = String(req.params.emailId || '').trim();
    const attachmentId = String(req.params.attachmentId || '').trim();
    if (!emailId || !attachmentId) {
      return res.status(400).json({ error: 'Email and attachment IDs are required' });
    }

    const found = findInboxAttachment(emailId, attachmentId);
    if (!found) {
      return res.status(404).json({ error: 'Attachment not found' });
    }

    const mimeType = normalizeMimeType(found.attachment.contentType);
    if (!INLINE_PREVIEW_MIMES.has(mimeType)) {
      return res.status(400).json({ error: 'Inline preview not supported for this type' });
    }

    const filePath = resolveAttachmentFilePath(found.attachment.storedName);
    if (!filePath) {
      return res.status(400).json({ error: 'Invalid attachment path' });
    }
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Attachment file not found' });
    }

    return streamAttachmentResponse(res, filePath, found.attachment, 'inline');
  }
);

app.post(
  '/api/admin/inbox/:emailId/reply',
  requireAccessToken,
  requireAdmin,
  express.json(),
  async (req, res) => {
    try {
      const emailId = Number(String(req.params.emailId || '').trim());
      if (!Number.isFinite(emailId)) {
        return res.status(400).json({ error: 'Invalid email ID' });
      }
      const { text, attachments = [] } = req.body || {};
      const row = db.prepare('SELECT * FROM inbound_emails WHERE id = ?').get(emailId);
      if (!row) return res.status(404).json({ error: 'Email not found' });

      const to = parseEmailAddress(row.sender || row.from || '');
      if (!to || !to.includes('@')) return res.status(400).json({ error: 'Recipient email missing' });

      const replyText = String(text || '').trim();
      if (!replyText) return res.status(400).json({ error: 'Reply text is required' });

      const inReplyTo = String(row.message_id || row.messageId || '').trim();
      const referencesHeader = [String(row.references_header || row.references || '').trim(), inReplyTo]
        .filter(Boolean)
        .join(' ')
        .trim();
      const subjectRaw = String(row.subject || '(no subject)').trim();
      const subject =
        subjectRaw.toLowerCase().startsWith('re:') ? subjectRaw : `Re: ${subjectRaw}`;

      const fromAddr = String(process.env.IONOS_SMTP_USER || '').trim();
      if (!fromAddr) return res.status(500).json({ error: 'SMTP sender not configured' });
      const rowWorkspaceId = String(row.workspace_id || row.workspaceId || user.workspaceId || user.workspace_id || '').trim();
      const schoolName = rowWorkspaceId ? getWorkspaceName(rowWorkspaceId) : '';
      const fromName = buildSchoolDisplayName(schoolName);
      const fromHeader = `"${fromName}" <${fromAddr}>`;

      const attachmentsMeta = parseAttachmentsForRow(row);
      const mailAttachments = [];
      if (Array.isArray(attachments) && attachments.length) {
        for (const item of attachments) {
          const attachmentId = String(item?.attachmentId || '').trim();
          if (!attachmentId) continue;
          const found = attachmentsMeta.find((meta) => String(meta.id || '').trim() === attachmentId);
          if (!found) continue;
          const filePath = resolveAttachmentFilePath(found.storedName || found.filename);
          if (!filePath) continue;
          mailAttachments.push({
            filename: String(found.filename || 'attachment'),
            path: filePath,
            contentType: String(found.contentType || undefined)
          });
        }
      }

      const finalText = `${replyText}${buildQuotedText(row)}`;
      const info = await transporter.sendMail({
        from: fromHeader,
        to,
        subject,
        text: finalText,
        headers: {
          ...(inReplyTo ? { 'In-Reply-To': inReplyTo } : {}),
          ...(referencesHeader ? { References: referencesHeader } : {})
        },
        attachments: mailAttachments.length ? mailAttachments : undefined
      });

      db.prepare(`
        INSERT INTO email_replies (inbound_email_id, body, created_at)
        VALUES (?, ?, datetime('now'))
      `).run(emailId, replyText);

      return res.json({ ok: true, messageId: info.messageId || null });
    } catch (err) {
      console.error('Reply send failed:', err?.message || err);
      return res.status(500).json({
        error: 'Failed to send reply',
        detail: err?.message || String(err),
        code: err?.code || null
      });
    }
  }
);

app.get('/api/classes/:channelId/students', (req, res) => {
  const user = getAuthedUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const channelId = String(req.params.channelId || '');
  const workspaceId = getWorkspaceIdFromUser(user);
  if (!canTakeAttendance(workspaceId, channelId, user)) return res.status(403).json({ error: 'Forbidden' });

  const chk = ensureChannelIsClass(workspaceId, channelId);
  if (!chk.ok) return res.status(chk.code).json({ error: chk.error });

  const students = listClassStudents(workspaceId, channelId);
  res.json({ channel: chk.channel, students });
});

app.get('/api/classes/:channelId/attendance', (req, res) => {
  const user = getAuthedUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const channelId = String(req.params.channelId || '');
  const workspaceId = getWorkspaceIdFromUser(user);
  if (!canTakeAttendance(workspaceId, channelId, user)) return res.status(403).json({ error: 'Forbidden' });

  const sessionDate = String(req.query.date || isoDateOnly());

  const chk = ensureChannelIsClass(workspaceId, channelId);
  if (!chk.ok) return res.status(chk.code).json({ error: chk.error });

  const session = getOrCreateAttendanceSession(workspaceId, channelId, sessionDate, user.id);

  const roster = listClassStudents(workspaceId, channelId);

  const rows = db
    .prepare(
      `SELECT student_user_id, status
       FROM attendance_records
       WHERE workspace_id = ? AND session_id = ?`
    )
    .all(workspaceId, session.id);

  const statusMap = new Map(rows.map((r) => [String(r.student_user_id), String(r.status)]));

  const records = roster.map((s) => ({
    student_user_id: s.user_id,
    name: s.name,
    email: s.email,
    status: statusMap.get(String(s.user_id)) || 'absent'
  }));

  const locked = Boolean(session.locked_by) && !isAttendanceAdminUser(user);

  res.json({
    channel: chk.channel,
    session_id: session.id,
    session_date: sessionDate,
    records,
    locked
  });
});

app.post('/api/classes/:channelId/attendance/save', express.json(), async (req, res) => {
  const user = getAuthedUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const workspaceId = getWorkspaceIdFromUser(user);
  const channelId = String(req.params.channelId || '');
  if (!canTakeAttendance(workspaceId, channelId, user)) return res.status(403).json({ error: 'Forbidden' });
  const chk = ensureChannelIsClass(workspaceId, channelId);
  if (!chk.ok) return res.status(chk.code).json({ error: chk.error });

  const sessionDate = String(req.body?.date || isoDateOnly());
  const records = Array.isArray(req.body?.records) ? req.body.records : [];
  const sendAbsenceEmails = req.body?.send_absence_emails !== false;

  const session = getOrCreateAttendanceSession(workspaceId, channelId, sessionDate, user.id);

  const roster = listClassStudents(workspaceId, channelId);
  const rosterSet = new Set(roster.map((r) => String(r.user_id)));

  const normalized = records
    .map((r) => ({
      student_user_id: String(r.student_user_id || ''),
      status: String(r.status || 'absent').toLowerCase() === 'present' ? 'present' : 'absent'
    }))
    .filter((r) => r.student_user_id && rosterSet.has(r.student_user_id));

  const insertStmt = db.prepare(`
    INSERT INTO attendance_records
      (id, workspace_id, session_id, channel_id, student_user_id, status, marked_by_user_id, marked_at)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(session_id, student_user_id) DO UPDATE SET
      status = excluded.status,
      marked_by_user_id = excluded.marked_by_user_id,
      marked_at = datetime('now')
  `);

  db.transaction(() => {
    for (const r of normalized) {
      insertStmt.run(
        uuid('arec'),
        workspaceId,
        session.id,
        channelId,
        r.student_user_id,
        r.status,
        user.id
      );
    }
  })();

  const savedRows = db.prepare(
    `SELECT student_user_id, status
     FROM attendance_records
     WHERE workspace_id = ? AND session_id = ?`
  ).all(workspaceId, session.id);

  const presentSet = new Set(
    savedRows.filter((x) => x.status === 'present').map((x) => String(x.student_user_id))
  );
  const absentees = roster
    .filter((s) => !presentSet.has(String(s.user_id)))
    .map((s) => ({ user_id: String(s.user_id), name: s.name, email: s.email }));

  let emailed = 0;
  let skipped = 0;

  const workspaceEmailRow = db.prepare('SELECT name FROM workspaces WHERE id = ?').get(workspaceId) || {};
  const teacherName = user.full_name || user.name || user.email || 'Teacher';
  const className = chk.channel?.name || 'Class';
  const supportEmail = workspaceEmailRow.admin_email || user.email || 'support@school.com';

  if (sendAbsenceEmails && absentees.length) {
    for (const stu of absentees) {
      if (!stu.email) {
        skipped++;
        continue;
      }

      const already = db
        .prepare(
          `SELECT 1 FROM attendance_notifications
           WHERE session_id = ? AND student_user_id = ? AND type = 'absence_email'
           LIMIT 1`
        )
        .get(session.id, stu.user_id);

      if (already) {
        skipped++;
        continue;
      }

      const vars = {
        student_name: stu.name || 'Student',
        class_name: className,
      class_date: sessionDate,
        teacher_name: teacherName,
        school_name: workspaceEmailRow.name || 'School',
        support_email: supportEmail
      };

      const rendered = typeof renderWorkspaceTemplate === 'function'
        ? renderWorkspaceTemplate(workspaceId, 'class_absence', vars)
        : {
            subject: `Absence notice: ${className}`,
            bodyInnerHtml: `<p>Hi ${escapeHtml(vars.student_name)},</p><p>We noticed you were absent for <strong>${escapeHtml(className)}</strong> on ${escapeHtml(date)}.</p>`,
            bodyText: `Hi ${vars.student_name},\nYou were absent for ${className} on ${sessionDate}.`
          };

      try {
        await sendPlatformEmail({
          to: stu.email,
          subject: rendered.subject,
          html: rendered.bodyInnerHtml,
          text: rendered.bodyText,
          fromName: buildAutomatedEmailSenderName(workspaceEmailRow.name || 'School', 'class_absence')
        });

        db.prepare(
          `INSERT INTO attendance_notifications (id, workspace_id, session_id, channel_id, student_user_id, type)
           VALUES (?, ?, ?, ?, ?, 'absence_email')`
        ).run(uuid('anotif'), workspaceId, session.id, channelId, stu.user_id);

        if (typeof recordEmailLog === 'function') {
          recordEmailLog({
            id: uuid('elog'),
            workspaceId,
            sentByUserId: user.id,
            toEmail: stu.email,
            toName: stu.name || '',
            subject: rendered.subject,
            bodyText: rendered.bodyText,
            bodyHtml: rendered.bodyInnerHtml,
            type: 'attendance_absence',
            status: 'sent'
          });
        }

        emailed++;
      } catch (e) {
        if (typeof recordEmailLog === 'function') {
          recordEmailLog({
            id: uuid('elog'),
            workspaceId,
            sentByUserId: user.id,
            toEmail: stu.email,
            toName: stu.name || '',
            subject: rendered.subject,
            bodyText: rendered.bodyText,
            bodyHtml: rendered.bodyInnerHtml,
            type: 'attendance_absence',
            status: 'failed',
            errorMessage: String(e.message || e)
          });
        }
      }
    }
  }

  res.json({
    ok: true,
    session_id: session.id,
    session_date: sessionDate,
    absentees_count: absentees.length,
    absence_emails: { emailed, skipped }
  });
});

app.get('/api/students/:studentId/attendance', (req, res) => {
  const user = getAuthedUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const workspaceId = getWorkspaceIdFromUser(user);
  const studentId = String(req.params.studentId || '');
  const limitParam = parseInt(String(req.query.limit || '50'), 10);
  const limit = Math.min(Number.isFinite(limitParam) ? limitParam : 50, 200);

  const rows = db
    .prepare(
      `SELECT ar.status, s.session_date, c.name AS class_name, ar.channel_id
       FROM attendance_records ar
       JOIN attendance_sessions s ON s.id = ar.session_id
       JOIN channels c ON c.id = ar.channel_id
       WHERE ar.workspace_id = ? AND ar.student_user_id = ?
       ORDER BY s.session_date DESC
       LIMIT ?`
    )
    .all(workspaceId, studentId, limit);

  res.json({ records: rows });
});

app.get('/api/workspaces/:workspaceId/email-logs', (req, res) => {
  const user = getAuthedUser(req);
  if (!canManageWorkspaceSettings(user)) return res.status(403).json({ error: 'Forbidden' });

  const workspaceId = String(req.params.workspaceId || '');
  const userWs = user.workspaceId || user.workspace_id || 'default';
  if (workspaceId !== String(userWs)) return res.status(403).json({ error: 'Wrong workspace' });

  const limitParam = Number.parseInt(req.query.limit || '20', 10);
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 100) : 20;
  const rows = db
    .prepare(
      `
      SELECT id, to_email AS toEmail, to_name AS toName, subject,
        status, type, created_at AS createdAt,
        (SELECT role FROM users WHERE id = workspace_email_logs.sent_by_user_id LIMIT 1) AS senderRole
    FROM workspace_email_logs
    WHERE workspace_id = ?
    ORDER BY created_at DESC
    LIMIT ?
    `
    )
    .all(workspaceId, limit);
  res.json({ logs: rows });
});

app.get('/api/workspaces/:workspaceId/email-logs/:logId', (req, res) => {
  const user = getAuthedUser(req);
  if (!canManageWorkspaceSettings(user)) return res.status(403).json({ error: 'Forbidden' });

  const workspaceId = String(req.params.workspaceId || '');
  const userWs = user.workspaceId || user.workspace_id || 'default';
  if (workspaceId !== String(userWs)) return res.status(403).json({ error: 'Wrong workspace' });

  const logId = String(req.params.logId || '').trim();
  if (!logId) return res.status(400).json({ error: 'Log id required' });

  const row = db
    .prepare(
      `
      SELECT id, to_email AS toEmail, to_name AS toName, subject,
        body_text AS bodyText, body_html AS bodyHtml,
        status, type, error_message AS errorMessage, created_at AS createdAt,
        (SELECT role FROM users WHERE id = workspace_email_logs.sent_by_user_id LIMIT 1) AS senderRole
      FROM workspace_email_logs
      WHERE id = ? AND workspace_id = ?
      LIMIT 1
    `
    )
    .get(logId, workspaceId);

  if (!row) {
    return res.status(404).json({ error: 'Log not found' });
  }
  res.json({ log: row });
});

app.get('/api/workspaces/:workspaceId/profile', (req, res) => {
  const user = getAuthedUser(req);
  if (!canManageWorkspaceSettings(user)) return res.status(403).json({ error: 'Forbidden' });

  const workspaceId = String(req.params.workspaceId || '');
  const userWs = user.workspaceId || user.workspace_id || 'default';
  if (workspaceId !== String(userWs)) return res.status(403).json({ error: 'Wrong workspace' });

  const workspaceRow = db
    .prepare('SELECT id, name, admin_email FROM workspaces WHERE id = ?')
    .get(workspaceId);
  if (!workspaceRow) {
    return res.status(404).json({ error: 'Workspace not found' });
  }

  const row = db
    .prepare('SELECT * FROM workspace_profile WHERE workspace_id = ?')
    .get(workspaceId) || {};

  const profile = {
    workspaceId: workspaceId,
    workspaceName: workspaceRow.name || '',
    street: row.street || '',
    houseNumber: row.house_number || '',
    postalCode: row.postal_code || '',
    city: row.city || '',
    state: row.state || '',
    country: row.country || '',
    phone: row.phone || '',
    website: row.website || '',
    openingHours: parseOpeningHoursJson(row.opening_hours_json),
    openingHoursDetails: parseOpeningHoursDetails(row.opening_hours_json),
    updatedAt: row.updated_at || ''
  };

  profile.registrationDetails = row.registration_details || '';
  profile.adminEmail = workspaceRow.admin_email || '';
  profile.usePlatformContactEmail = Number(row.use_platform_contact_email || 0) === 1;
  profile.platformContactEmail = getPlatformContactEmail();
  profile.signatureEmail = resolveWorkspaceContactEmail({
    profileRow: row,
    workspaceRow
  });

  res.json(profile);
});

app.post('/api/workspaces/:workspaceId/profile/registration', (req, res) => {
  const user = getAuthedUser(req);
  if (!canManageWorkspaceSettings(user)) return res.status(403).json({ error: 'Forbidden' });

  const workspaceId = String(req.params.workspaceId || '');
  const userWs = user.workspaceId || user.workspace_id || 'default';
  if (workspaceId !== String(userWs)) return res.status(403).json({ error: 'Wrong workspace' });

  const registrationDetails = String(req.body?.registrationDetails || '').trim();
  db.prepare(`
    INSERT INTO workspace_profile (workspace_id, registration_details, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(workspace_id) DO UPDATE SET
      registration_details = excluded.registration_details,
      updated_at = datetime('now')
  `).run(workspaceId, registrationDetails);

  const updatedRow = db
    .prepare('SELECT registration_details FROM workspace_profile WHERE workspace_id = ?')
    .get(workspaceId) || {};

  res.json({ ok: true, registrationDetails: updatedRow.registration_details || '' });
});

app.patch('/api/workspaces/:workspaceId/profile', (req, res) => {
  const user = getAuthedUser(req);
  if (!canManageWorkspaceSettings(user)) return res.status(403).json({ error: 'Forbidden' });

  const workspaceId = String(req.params.workspaceId || '');
  const userWs = user.workspaceId || user.workspace_id || 'default';
  if (workspaceId !== String(userWs)) return res.status(403).json({ error: 'Wrong workspace' });

  const workspaceRow = db.prepare('SELECT id FROM workspaces WHERE id = ?').get(workspaceId);
  if (!workspaceRow) {
    return res.status(404).json({ error: 'Workspace not found' });
  }

  const body = req.body || {};
  const street = String(body.street || '').trim();
  const houseNumber = String(body.houseNumber || body.house_number || '').trim();
  const postalCode = String(body.postalCode || body.postal_code || '').trim();
  const city = String(body.city || '').trim();
  const state = String(body.state || '').trim();
  const country = String(body.country || '').trim();
  const phone = String(body.phone || '').trim();
  const website = String(body.website || '').trim();
  const openingHoursText = String(body.openingHours || body.opening_hours || '').trim();
  const openingHoursDetailsPayload = sanitizeOpeningHoursDetails(body.openingHoursDetails);
  const openingHoursMeta = {};
  if (openingHoursText) {
    openingHoursMeta.text = openingHoursText;
  }
  if (openingHoursDetailsPayload) {
    openingHoursMeta.details = openingHoursDetailsPayload;
  }
  const openingHoursJson = Object.keys(openingHoursMeta).length
    ? JSON.stringify(openingHoursMeta)
    : '';
  const workspaceName = typeof body.workspaceName === 'string' ? body.workspaceName.trim() : null;
  const registrationDetails = String(
    body.registrationDetails || body.registration_details || ''
  ).trim();
  const usePlatformContactEmail = body.usePlatformContactEmail ? 1 : 0;

  db.prepare(`
    INSERT INTO workspace_profile (
      workspace_id,
      street,
      house_number,
      postal_code,
      city,
      state,
      country,
      phone,
      website,
      opening_hours_json,
      registration_details,
      use_platform_contact_email,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(workspace_id) DO UPDATE SET
      street = excluded.street,
      house_number = excluded.house_number,
      postal_code = excluded.postal_code,
      city = excluded.city,
      state = excluded.state,
      country = excluded.country,
      phone = excluded.phone,
      website = excluded.website,
      opening_hours_json = excluded.opening_hours_json,
      registration_details = excluded.registration_details,
      use_platform_contact_email = excluded.use_platform_contact_email,
      updated_at = datetime('now')
  `).run(
    workspaceId,
    street,
    houseNumber,
    postalCode,
    city,
    state,
    country,
    phone,
    website,
    openingHoursJson,
    registrationDetails,
    usePlatformContactEmail
  );

  if (workspaceName !== null) {
    db.prepare('UPDATE workspaces SET name = ? WHERE id = ?').run(workspaceName, workspaceId);
  }

  const updatedWorkspace = db.prepare('SELECT name FROM workspaces WHERE id = ?').get(workspaceId) || {};
  const updatedRow = db
    .prepare('SELECT * FROM workspace_profile WHERE workspace_id = ?')
    .get(workspaceId) || {};

  const profile = {
    workspaceId,
    workspaceName: updatedWorkspace.name || '',
    street: updatedRow.street || '',
    houseNumber: updatedRow.house_number || '',
    postalCode: updatedRow.postal_code || '',
    city: updatedRow.city || '',
    state: updatedRow.state || '',
    country: updatedRow.country || '',
    phone: updatedRow.phone || '',
    website: updatedRow.website || '',
    openingHours: parseOpeningHoursJson(updatedRow.opening_hours_json),
    openingHoursDetails: parseOpeningHoursDetails(updatedRow.opening_hours_json),
    updatedAt: updatedRow.updated_at || ''
  };
  profile.registrationDetails = updatedRow.registration_details || '';
  profile.adminEmail = (
    db.prepare('SELECT admin_email FROM workspaces WHERE id = ?').get(workspaceId) || {}
  ).admin_email || '';
  profile.usePlatformContactEmail = Number(updatedRow.use_platform_contact_email || 0) === 1;
  profile.platformContactEmail = getPlatformContactEmail();
  profile.signatureEmail = resolveWorkspaceContactEmail({
    profileRow: updatedRow,
    workspaceRow: {
      admin_email: profile.adminEmail
    }
  });

  // refresh system policy message so it shows updated school name/address
  try {
    ensurePrivacyRulesMessage(workspaceId);
  } catch (e) {
    console.warn('Failed to refresh privacy rules message:', e);
  }

  res.json(profile);
});

/* ---------- USERS / EMPLOYEES API ---------- */

/* ---------- USERS / EMPLOYEES API ---------- */

// List employees in a workspace
app.get(
  '/api/users',
  authRequired,
  requirePermission('users:read'),
  requireWorkspaceAccess((req) => String(req.query.workspaceId || workspaceIdFromRequest(req) || 'default')),
  (req, res) => {
    const workspaceId = String(req.query.workspaceId || workspaceIdFromRequest(req) || 'default');

    const rows = db
    .prepare(
      `SELECT
      id,
      workspace_id AS workspaceId,
      first_name   AS firstName,
      last_name    AS lastName,
      name,
      avatar_url   AS avatarUrl,
      username,
      email,
      role,
      status,
     course_start AS courseStart,
     course_end   AS courseEnd,
      course_level AS courseLevel,
      gender,
      date_of_birth AS dateOfBirth,
      phone_country AS phoneCountry,
      phone_number AS phoneNumber,
      teaching_languages AS teachingLanguages,
      employment_type AS employmentType,
      learning_goal AS learningGoal,
      available_days AS availableDays,
      emergency_contact_name AS emergencyName,
      emergency_contact_phone AS emergencyPhone,
      emergency_contact_relation AS emergencyRelation,
      native_language AS nativeLanguage,
       native_language_confirmed AS nativeLanguageConfirmed,
        created_at   AS createdAt
       FROM users
       ${workspaceId === 'all' ? '' : 'WHERE workspace_id = ?'}
       ORDER BY name`
    )
    .all(...(workspaceId === 'all' ? [] : [workspaceId]));

  res.json(rows);
});

// Add new employee
app.post(
  '/api/users',
  authRequired,
  requirePermission('users:write'),
  requireWorkspaceAccess((req) => String(req.body?.workspaceId || workspaceIdFromRequest(req) || 'default')),
  (req, res) => {
    const {
      firstName,
      lastName,
      workspaceId = 'default',
      email,
      password,
      channelIds,
      avatarUrl,
      role,
      courseStart,
      courseEnd,
      courseLevel,
      nativeLanguage,
      gender,
    } = req.body || {};
  const dateOfBirth = String(req.body?.dateOfBirth || '').trim();
  const phoneCountry = String(req.body?.phoneCountry || '').trim();
  const phoneNumber = String(req.body?.phoneNumber || '').trim();
  const teachingLanguages = String(req.body?.teachingLanguages || '').trim();
  const learningGoal = String(req.body?.learningGoal || '').trim();
  const employmentType = String(req.body?.employmentType || '').trim();
  const availableDays = String(req.body?.availableDays || '').trim();
  const emergencyName = String(req.body?.emergencyName || '').trim();
  const emergencyPhone = String(req.body?.emergencyPhone || '').trim();
  const emergencyRelation = String(req.body?.emergencyRelation || '').trim();

  if (!firstName || !firstName.trim() || !lastName || !lastName.trim()) {
    return res.status(400).json({ error: 'First name and last name are required' });
  }
  if (!email || !String(email).trim()) {
    return res.status(400).json({ error: 'Email is required' });
  }
  if (!password || !String(password).trim()) {
    return res.status(400).json({ error: 'Password is required' });
  }

  // ensure workspace exists
  const wsExists = db.prepare('SELECT 1 FROM workspaces WHERE id = ?').get(workspaceId);
  if (!wsExists) {
    return res.status(404).json({ error: 'Workspace not found' });
  }

  const ws = workspaceId || 'default';
  const fn = firstName.trim();
  const ln = lastName.trim();
  const fullName = `${fn} ${ln}`;
  const username = generateUsername(ws, fn, ln);
  const id = generateId('u');
  const passwordHash = hashPassword(String(password));
  const emailTrimmed = String(email).trim().toLowerCase();
  const avatar = (avatarUrl || '').trim() || null;
  const userRole = (role || 'member').trim().toLowerCase();
  const status = 'active';
  const normalizedNativeLanguage = normalizeLanguageCode(nativeLanguage);
  const normalizedGender = String(gender || '').trim();

  db.prepare(
    `INSERT INTO users (id, workspace_id, first_name, last_name, name, username, email, password_hash, avatar_url, role, status, course_start, course_end, course_level, gender, date_of_birth, phone_country, phone_number, teaching_languages, employment_type, available_days, emergency_contact_name, emergency_contact_phone, emergency_contact_relation, native_language, learning_goal, native_language_confirmed)
     VALUES (@id, @workspace_id, @first_name, @last_name, @name, @username, @email, @password_hash, @avatar_url, @role, @status, @course_start, @course_end, @course_level, @gender, @date_of_birth, @phone_country, @phone_number, @teaching_languages, @employment_type, @available_days, @emergency_contact_name, @emergency_contact_phone, @emergency_contact_relation, @native_language, @learning_goal, @native_language_confirmed)`
  ).run({
    id,
    workspace_id: ws,
    first_name: fn,
    last_name: ln,
    name: fullName,
    username,
    email: emailTrimmed,
    password_hash: passwordHash,
    avatar_url: avatar,
    role: userRole,
    status,
    course_start: courseStart || null,
    course_end: courseEnd || null,
    course_level: (courseLevel || "").trim() || null,
    gender: normalizedGender,
    date_of_birth: dateOfBirth || null,
    phone_country: phoneCountry || null,
    phone_number: phoneNumber || null,
    teaching_languages: teachingLanguages || null,
    learning_goal: learningGoal || null,
    employment_type: employmentType || null,
    available_days: availableDays || null,
    emergency_contact_name: emergencyName || null,
    emergency_contact_phone: emergencyPhone || null,
    emergency_contact_relation: emergencyRelation || null,
    native_language: normalizedNativeLanguage,
    native_language_confirmed: 0
  });
  cacheAvatarForUserRow({
    name: fullName,
    username,
    email: emailTrimmed,
    first_name: fn,
    last_name: ln,
    avatar_url: avatar
  });

  addUserToDefaultChannels(ws, id);
  if (ADMIN_ROLE_VALUES.has(userRole)) {
    ensureAdminsInWorkspaceChannels(ws);
  }
  if (status === 'active' && TEACHER_ROLE_VALUES.has(userRole)) {
    addUserToTeachersChannel(ws, id);
  }

  res.status(201).json({
    id,
    workspaceId: ws,
    firstName: fn,
    lastName: ln,
    name: fullName,
    username,
    email: emailTrimmed,
    avatarUrl: avatar || null,
    role: userRole,
    status,
    courseStart: courseStart || null,
    courseEnd: courseEnd || null,
    courseLevel: (courseLevel || "").trim() || null,
    gender: normalizedGender,
    dateOfBirth: dateOfBirth || null,
    phoneCountry: phoneCountry || null,
    phoneNumber: phoneNumber || null,
    teachingLanguages: teachingLanguages || null,
    employmentType: employmentType || null,
    availableDays: availableDays || null,
    emergencyName: emergencyName || null,
    emergencyPhone: emergencyPhone || null,
    emergencyRelation: emergencyRelation || null,
    nativeLanguage: normalizedNativeLanguage || null,
    learningGoal: learningGoal || null
  });
});

app.post(
  '/api/workspaces/:workspaceId/students/import',
  authRequired,
  requirePermission('users:write'),
  requireWorkspaceAccess((req) => String(req.params.workspaceId || '')),
  csvUpload.single('file'),
  (req, res) => {
    const workspaceId = String(req.params.workspaceId || '').trim();
    if (!workspaceId) {
      return res.status(400).json({ error: 'workspaceId required' });
    }

    const fileBuffer = req.file?.buffer;
    if (!fileBuffer) {
      return res.status(400).json({ error: 'CSV file is required' });
    }

    const workspaceRow = db.prepare('SELECT id FROM workspaces WHERE id = ?').get(workspaceId);
    if (!workspaceRow) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    let rows;
    try {
      rows = parseCsv(fileBuffer.toString('utf-8'));
    } catch (err) {
      return res.status(400).json({ error: 'Could not parse CSV file' });
    }

    if (!rows.length) {
      return res.status(400).json({ error: 'CSV file is empty' });
    }

    const headerMap = mapCsvHeaders(rows[0]);
    const requiredColumns = ['firstName', 'lastName', 'email'];
    const missing = requiredColumns.filter((col) => !headerMap.includes(col));
    if (missing.length) {
      return res.status(400).json({ error: `Missing CSV columns: ${missing.join(', ')}` });
    }

    const dataRows = rows.slice(1);
    if (!dataRows.length) {
      return res.status(400).json({ error: 'CSV contains no data rows' });
    }

    const workspaceMemberStmt = db.prepare(
      'INSERT OR IGNORE INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, ?)'
    );
    const emailCheckStmt = db.prepare(
      'SELECT 1 FROM users WHERE workspace_id = ? AND lower(email) = lower(?) LIMIT 1'
    );
    const insertStudentTx = db.transaction((userObj, role, userId) => {
      insertIntoUsersAdaptive(userObj);
      workspaceMemberStmt.run(workspaceId, userId, role);
    });

    const errors = [];
    let imported = 0;
    const allowedRoles = new Set(['student', 'teacher', 'admin', 'school_admin', 'super_admin']);

    for (let rowIndex = 0; rowIndex < dataRows.length; rowIndex++) {
      const row = dataRows[rowIndex];
      const lineNumber = rowIndex + 2; // account for header row
      const record = {};

      headerMap.forEach((field, colIndex) => {
        if (!field) return;
        record[field] = String(row[colIndex] || '').trim();
      });

      if (!Object.values(record).some((v) => v && v.trim())) {
        continue;
      }

      const firstName = String(record.firstName || '').trim();
      const lastName = String(record.lastName || '').trim();
      const emailRaw = String(record.email || '').trim();
      if (!firstName || !lastName || !emailRaw) {
        errors.push({ line: lineNumber, error: 'firstName, lastName, and email are required' });
        continue;
      }
      if (!emailRaw.includes('@')) {
        errors.push({ line: lineNumber, error: 'Invalid email address' });
        continue;
      }

      const emailNormalized = emailRaw.toLowerCase();
      const duplicate = emailCheckStmt.get(workspaceId, emailNormalized);
      if (duplicate) {
        errors.push({ line: lineNumber, error: 'Email already exists' });
        continue;
      }

      const passwordPlain = record.password || crypto.randomBytes(6).toString('hex');
      const passwordHash = hashPassword(passwordPlain);
      if (!passwordHash) {
        errors.push({ line: lineNumber, error: 'Failed to hash password' });
        continue;
      }

      const roleRaw = String(record.role || 'student').trim().toLowerCase();
      const normalizedRole = allowedRoles.has(roleRaw) ? roleRaw : 'student';
      const userId = generateId('u');
      const username = generateUsername(workspaceId, firstName, lastName);
      const fullName = `${firstName} ${lastName}`.trim();
      const nativeLang = normalizeLanguageCode(record.nativeLanguage);

      const userObj = {
        id: userId,
        workspace_id: workspaceId,
        first_name: firstName,
        last_name: lastName,
        name: fullName,
        username,
        email: emailNormalized,
        password_hash: passwordHash,
        role: normalizedRole,
        status: 'active',
        course_start: record.courseStart || null,
        course_end: record.courseEnd || null,
        course_level: (record.courseLevel || '').trim() || null,
        gender: String(record.gender || '').trim() || null,
        date_of_birth: (record.dateOfBirth || '').trim() || null,
        phone_country: (record.phoneCountry || '').trim() || null,
        phone_number: (record.phoneNumber || '').trim() || null,
        teaching_languages: (record.teachingLanguages || '').trim() || null,
        learning_goal: (record.learningGoal || '').trim() || null,
        employment_type: null,
        available_days: (record.availableDays || '').trim() || null,
        emergency_contact_name: (record.emergencyName || '').trim() || null,
        emergency_contact_phone: (record.emergencyPhone || '').trim() || null,
        emergency_contact_relation: (record.emergencyRelation || '').trim() || null,
        native_language: nativeLang || null,
        native_language_confirmed: nativeLang ? 1 : 0,
        must_change_password: 0
      };

      try {
        insertStudentTx(userObj, normalizedRole, userId);
      } catch (err) {
        errors.push({ line: lineNumber, error: err?.message || 'Failed to insert user' });
        continue;
      }

      addUserToDefaultChannels(workspaceId, userId);
      if (TEACHER_ROLE_VALUES.has(normalizedRole)) {
        addUserToTeachersChannel(workspaceId, userId);
      }

      imported++;
    }

    audit('students.import', req, {
      target: workspaceId,
      workspaceId,
      meta: { attempted: dataRows.length, imported, errors: errors.length }
    });

    res.json({ imported, attempted: dataRows.length, errors });
  }
);

app.patch('/api/users/:userId/native-language', (req, res) => {
  const { userId } = req.params;
  const requesterId = getRequesterId(req);
  if (!requesterId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (requesterId !== userId && req.get('x-admin') !== '1') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const raw = (req.body?.nativeLanguage || req.body?.language || '').trim();
  const normalized = normalizeLanguageCode(raw);
  if (!normalized) {
    return res.status(400).json({ error: 'nativeLanguage is required' });
  }
  db.prepare(
    `UPDATE users
     SET native_language = ?,
         native_language_confirmed = 1
     WHERE id = ?`
  ).run(normalized, userId);
  const updated = db
    .prepare(
      `SELECT native_language AS nativeLanguage,
              native_language_confirmed AS nativeLanguageConfirmed
       FROM users
       WHERE id = ?`
    )
    .get(userId);
  if (!updated) {
    return res.status(404).json({ error: 'User not found' });
  }
  res.json({
    nativeLanguage: updated.nativeLanguage,
    nativeLanguageConfirmed: !!updated.nativeLanguageConfirmed
  });
});

app.patch('/api/users/:userId', (req, res) => {
  if (req.get('x-admin') !== '1' && req.get('x-super-admin') !== '1') {
    return res.status(403).json({ error: 'Only admins can update users' });
  }
  const { userId } = req.params;
  const {
    firstName,
    lastName,
    email,
    courseStart,
    courseEnd,
    courseLevel
  } = req.body || {};

  const user = db
    .prepare('SELECT id, workspace_id AS workspaceId, first_name, last_name, email FROM users WHERE id = ?')
    .get(userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const fn = (firstName || user.first_name || '').trim();
  const ln = (lastName || user.last_name || '').trim();
  if (!fn || !ln) {
    return res.status(400).json({ error: 'First name and last name are required' });
  }
  const emailTrimmed = email !== undefined ? String(email || '').trim() : user.email;
  if (emailTrimmed === '') {
    return res.status(400).json({ error: 'Email is required' });
  }

  const fullName = `${fn} ${ln}`.trim();
  db.prepare(
    `UPDATE users
     SET first_name = ?,
         last_name = ?,
         name = ?,
         email = ?,
         course_start = ?,
         course_end = ?,
         course_level = ?
     WHERE id = ?`
  ).run(
    fn,
    ln,
    fullName,
    emailTrimmed,
    courseStart || null,
    courseEnd || null,
    (courseLevel || '').trim() || null,
    userId
  );

  res.json({
    ok: true,
    userId,
    firstName: fn,
    lastName: ln,
    name: fullName,
    email: emailTrimmed,
    courseStart: courseStart || null,
    courseEnd: courseEnd || null,
    courseLevel: (courseLevel || '').trim() || null
  });
});

app.delete('/api/users/:userId', (req, res) => {
  if (req.get('x-admin') !== '1' && req.get('x-super-admin') !== '1') {
    return res.status(403).json({ error: 'Only admins can delete users' });
  }
  const { userId } = req.params;
  const workspaceId = deleteUserCascade(userId);
  if (!workspaceId) {
    return res.status(404).json({ error: 'User not found' });
  }

  res.json({ ok: true, userId });
});

app.get("/api/users/me/preferences", (req, res) => {
  const user = getAuthedUser(req);
  if (!user) return res.status(401).json({ error: "unauthorized" });

  const row = db
    .prepare(
      `
      SELECT
        native_language AS nativeLanguage,
        COALESCE(culture_read_lang, '') AS cultureReadLang,
        COALESCE(culture_write_lang, '') AS cultureWriteLang
      FROM users
      WHERE id = ?
    `
    )
    .get(user.id);

  res.json({
    nativeLanguage: row?.nativeLanguage || "en",
    cultureReadLang: row?.cultureReadLang || "",
    cultureWriteLang: row?.cultureWriteLang || ""
  });
});

app.post("/api/users/me/preferences", (req, res) => {
  const user = getAuthedUser(req);
  if (!user) return res.status(401).json({ error: "unauthorized" });

  const { cultureReadLang, cultureWriteLang } = req.body || {};
  db.prepare(
    `
    UPDATE users
    SET
      culture_read_lang = COALESCE(?, culture_read_lang),
      culture_write_lang = COALESCE(?, culture_write_lang)
    WHERE id = ?
  `
  ).run(
    cultureReadLang ? normalizeLanguageCode(cultureReadLang) : null,
    cultureWriteLang ? normalizeLanguageCode(cultureWriteLang) : null,
    user.id
  );

  res.json({ ok: true });
});

function isCourseExpired(courseEnd) {
  if (!courseEnd) return false;
  const end = new Date(courseEnd);
  if (Number.isNaN(end.getTime())) return false;
  return Date.now() > end.getTime();
}

function handleAuthLogin(req, res) {
  try {
    const { email, login, password } = req.body || {};
    const rawIdentifier = (login || email || '').trim();
    if (!rawIdentifier || !password) {
      return res.status(400).json({ error: 'Missing credentials' });
    }

    const identifier = rawIdentifier.toLowerCase();

    if (allowAdminLoginBypass && devSuperAdminBypassEntries.length) {
      const bypassEntry = devSuperAdminBypassEntries.find(
        (entry) =>
          (entry.email === identifier || entry.userId === identifier) &&
          entry.password === password
      );
      if (bypassEntry) {
        const bypassUser = {
          id: bypassEntry.userId || 'super-admin',
          role: bypassEntry.role || 'super_admin',
          workspace_id: null,
          super_admin: true,
          email: bypassEntry.email,
          name: bypassEntry.name,
        };
        const access = signAccessToken(bypassUser);
        const refresh = signRefreshToken(bypassUser);
        const now = Date.now();
        const refreshDecoded = jwt.decode(refresh.token);
        const refreshExpires = refreshDecoded?.exp ? refreshDecoded.exp * 1000 : now + 30 * 86400000;

        db.prepare(`
          INSERT INTO refresh_tokens (id, user_id, token_hash, created_at, issued_at, expires_at, ip, user_agent)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          refresh.jti,
          bypassUser.id,
          sha256(refresh.token),
          now,
          now,
          refreshExpires,
          req.ip || null,
          req.headers['user-agent'] || null
        );

        setAuthCookies(res, access.token, refresh.token);
        audit('auth.login_success', req, {
          user: bypassUser,
          target: bypassUser.id,
          workspaceId: null,
          meta: { identifier, bypass: true }
        });
        return res.json({
          ok: true,
          user: {
            userId: bypassUser.id,
            email: bypassUser.email,
            name: bypassUser.name,
            role: bypassUser.role,
            displayRole: bypassEntry.displayRole,
            workspaceId: null,
            superAdmin: true,
          },
        });
      }
    }

    if (isBlockedIp(req.ip)) {
      logSecurityEvent({
        type: 'security.ip_blocked_login',
        severity: 'high',
        ip: req.ip,
        userAgent: req.headers['user-agent'] || null,
        payload: { identifier }
      });
      return res.status(403).json({ error: 'Access blocked. Please contact support.' });
    }

    const userQuery = identifier.includes('@')
      ? db
          .prepare(
            `SELECT id,
                    workspace_id AS workspaceId,
                    first_name,
                    last_name,
                    name,
                    username,
                    avatar_url AS avatarUrl,
                    password_hash,
                    role,
                    status,
                    course_start AS courseStart,
                    course_end AS courseEnd,
                  email,
                  must_change_password,
                  temp_login_started_at
             FROM users
             WHERE email = ?`
          )
          .get(identifier)
      : db
          .prepare(
            `SELECT id,
                    workspace_id AS workspaceId,
                    first_name,
                    last_name,
                    name,
                    username,
                    avatar_url AS avatarUrl,
                    password_hash,
                    role,
                    status,
                    course_start AS courseStart,
                    course_end AS courseEnd,
                    email
             FROM users
             WHERE lower(username) = ?`
          )
          .get(identifier);

    if (!userQuery || !userQuery.password_hash || !verifyPassword(password, userQuery.password_hash)) {
      logLoginAttempt({
        identifier,
        success: false,
        userId: userQuery?.id || null,
        workspaceId: userQuery?.workspaceId || null,
        ip: req.ip,
        userAgent: req.headers['user-agent'] || null
      });

    logSecurityEvent({
      workspaceId: userQuery?.workspaceId || null,
      actorUserId: userQuery?.id || null,
      type: 'auth.login_failed',
      severity: 'warn',
      ip: req.ip,
      userAgent: req.headers['user-agent'] || null,
      payload: { identifier }
    });

    audit('auth.login_failure', req, {
      user: userQuery,
      target: userQuery?.id || null,
      workspaceId: userQuery?.workspaceId || null,
      meta: { identifier }
    });

      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const userRole = String(userQuery.role || 'member').toLowerCase();
    const userStatus = String(userQuery.status || 'active').toLowerCase();
    if (userStatus !== 'active') {
      return res.status(403).json({ error: 'Account is not active' });
    }

    if (userQuery.workspaceId) {
      const workspace = db
        .prepare('SELECT status FROM workspaces WHERE id = ?')
        .get(userQuery.workspaceId);
      const workspaceStatus = String(workspace?.status || 'approved').toLowerCase();
      if (workspaceStatus !== 'approved') {
        return res.status(403).json({ error: 'School is not approved' });
      }
    }

    if (userQuery.must_change_password && userQuery.temp_login_started_at) {
      const elapsed = Date.now() - Number(userQuery.temp_login_started_at);
      const maxMs = 10 * 60 * 1000; // 10 minutes
      if (elapsed > maxMs) {
        return res.status(403).json({
          error: 'Temporary password expired. Please contact admin for a new one.'
        });
      }
    }

    if (!['super_admin', 'admin', 'school_admin'].includes(userRole)) {
      if (isCourseExpired(userQuery.courseEnd)) {
        return res.status(403).json({ error: 'Course has ended' });
      }
    }

    const displayName =
      userQuery.name || `${userQuery.first_name || ''} ${userQuery.last_name || ''}`.trim();

    const access = signAccessToken(userQuery);
    const refresh = signRefreshToken(userQuery);

    const now = Date.now();
    const refreshDecoded = jwt.decode(refresh.token);
    const refreshExpires = refreshDecoded?.exp ? refreshDecoded.exp * 1000 : now + 30 * 86400000;

    db.prepare(`
      INSERT OR IGNORE INTO refresh_tokens (id, user_id, token_hash, created_at, issued_at, expires_at, ip, user_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      refresh.jti,
      userQuery.id,
      sha256(refresh.token),
      now,
      now,
      refreshExpires,
      req.ip || null,
      req.headers['user-agent'] || null
    );

    setAuthCookies(res, access.token, refresh.token);

    const accessToken = access.token;

    logLoginAttempt({
      identifier,
      success: true,
      userId: userQuery.id,
      workspaceId: userQuery.workspaceId || null,
      ip: req.ip,
      userAgent: req.headers['user-agent'] || null
    });

    logSecurityEvent({
      workspaceId: userQuery.workspaceId || null,
      actorUserId: userQuery.id,
      type: 'auth.login_success',
      severity: 'info',
      ip: req.ip,
      userAgent: req.headers['user-agent'] || null,
      payload: { identifier, role: userRole }
    });

    audit('auth.login_success', req, {
      user: userQuery,
      target: userQuery.id,
      workspaceId: userQuery.workspaceId || null,
      meta: { identifier }
    });

    return res.json({
      accessToken,
      user: {
        userId: userQuery.id,
        email: userQuery.email || identifier,
        role: userRole,
        workspaceId: userQuery.workspaceId,
        name: displayName,
        avatarUrl: userQuery.avatarUrl || null,
        nativeLanguage: userQuery.nativeLanguage || 'en',
        nativeLanguageConfirmed: !!userQuery.nativeLanguageConfirmed,
        mustChangePassword: !!userQuery.must_change_password,
        superAdmin: userRole === 'super_admin',
      },
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Server error' });
  }
}

// Login (admin or user) - supports email OR username as "identifier"
app.post('/api/login', authLimiter, handleAuthLogin);
app.post('/api/auth/login', authLimiter, handleAuthLogin);

app.get('/api/auth/me', requireAccessToken, (req, res) => {
  const userId = req.auth.sub;
  const user = db
    .prepare('SELECT id, email, name, role, workspace_id, avatar_url FROM users WHERE id = ?')
    .get(userId);

  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  res.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      workspaceId: user.workspace_id,
      avatarUrl: user.avatar_url || null
    },
  });
});

app.get('/api/auth/csrf', (req, res) => {
  const token = ensureCsrfCookie(req, res);
  res.json({ ok: true, csrfToken: token });
});

app.post('/api/auth/refresh', (req, res) => {
  const rt = req.cookies?.refresh_token;
  console.log('[refresh] cookie present', !!rt);
  if (!rt) return res.status(401).json({ error: 'Unauthorized' });

  let payload;
  try {
    payload = jwt.verify(rt, JWT_REFRESH_SECRET);
  } catch {
    console.log('[refresh] jwt verify failed');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const hash = sha256(rt);
  let row = db
    .prepare(`
      SELECT * FROM refresh_tokens
      WHERE id = ? AND user_id = ? AND token_hash = ? AND revoked_at IS NULL
    `)
    .get(payload.jti, payload.sub, hash);

  const nowMs = Date.now();
  if (!row) {
    console.log('[refresh] no refresh row; inserting fallback entry', payload.jti);
    const expiresAt = nowMs + 30 * 24 * 60 * 60 * 1000;
    db.prepare(`
      INSERT OR IGNORE INTO refresh_tokens (id, user_id, token_hash, created_at, issued_at, expires_at, ip, user_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      payload.jti,
      payload.sub,
      hash,
      nowMs,
      nowMs,
      expiresAt,
      req.ip || null,
      req.headers['user-agent'] || null
    );
    row = { id: payload.jti };
  } else if (nowMs > Number(row.expires_at)) {
    console.log('[refresh] refresh expired');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const user = db
    .prepare(`SELECT id, email, name, role, workspace_id AS workspaceId FROM users WHERE id = ?`)
    .get(payload.sub);

  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const access = signAccessToken({
    id: user.id,
    role: user.role,
    workspaceId: user.workspaceId,
  });
  const ip = req.ip || null;
  const userAgent = req.headers['user-agent'] || null;
  const refresh = signRefreshToken(user);
  const refreshDecoded = jwt.decode(refresh.token);
  const now = Date.now();
  const refreshExpires = Number(refreshDecoded?.exp ? refreshDecoded.exp * 1000 : now + 30 * 86400000);

  db
    .prepare('UPDATE refresh_tokens SET revoked_at = ?, replaced_by = ? WHERE id = ?')
    .run(now, refresh.jti, row.id);

  db.prepare(`
    INSERT INTO refresh_tokens (id, user_id, token_hash, created_at, issued_at, expires_at, ip, user_agent)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    refresh.jti,
    user.id,
    sha256(refresh.token),
    now,
    now,
    refreshExpires,
    ip,
    userAgent
  );

  setAuthCookies(res, access.token, refresh.token);

  logSecurityEvent({
    workspaceId: user.workspaceId || null,
    actorUserId: user.id,
    type: 'auth.refresh',
    severity: 'info',
    ip,
    userAgent,
    payload: { refreshed: true }
  });

  res.json({ accessToken: access.token });
});

// =========================
// TASK CHANNEL APIs
// =========================
function getAuthContext(req) {
  const u = req.user || req.auth || req.sessionUser || {};
  return {
    userId: u.id || u.userId || req.headers['x-user-id'],
    workspaceId: u.workspace_id || u.workspaceId || req.headers['x-workspace-id'],
    role: u.role || u.user_role || u.userRole || ''
  };
}

function mustAuthTask(req, res) {
  const ctx = getAuthContext(req);
  if (!ctx.userId || !ctx.workspaceId) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }
  return ctx;
}

function canManageTasks(role) {
  const r = String(role || '').toLowerCase();
  return r === 'teacher' || r === 'school_admin' || r === 'super_admin';
}

function assertChannelInWorkspace(workspaceId, channelId) {
  try {
    const row = db.prepare(`SELECT id, workspace_id FROM channels WHERE id = ?`).get(String(channelId));
    if (!row) return false;
    return String(row.workspace_id) === String(workspaceId);
  } catch (_e) {
    return true;
  }
}

function taskToDto(t) {
  return {
    id: t.id,
    workspaceId: t.workspace_id,
    channelId: t.channel_id,
    title: t.title,
    description: t.description || '',
    status: t.status,
    priority: t.priority,
    dueAt: t.due_at || null,
    completedAt: t.completed_at || null,
    createdBy: t.created_by,
    assignedTo: t.assigned_to || null,
    createdAt: t.created_at,
    updatedAt: t.updated_at
  };
}

function ensureStatus(s) {
  const v = String(s || '').toLowerCase();
  if (['open', 'doing', 'done'].includes(v)) return v;
  return 'open';
}

function ensurePriority(p) {
  const v = String(p || '').toLowerCase();
  if (['low', 'normal', 'high', 'urgent'].includes(v)) return v;
  return 'normal';
}

app.get('/api/tasks', authRequired, (req, res) => {
  const ctx = mustAuthTask(req, res);
  if (!ctx) return;

  const channelId = String(req.query.channelId || '');
  if (!channelId) return res.status(400).json({ error: 'channelId required' });
  if (!assertChannelInWorkspace(ctx.workspaceId, channelId)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const status = String(req.query.status || '').trim().toLowerCase();
  const limit = Math.min(200, Math.max(1, Number(req.query.limit || 50)));
  const includeDone = String(req.query.includeDone || 'true') === 'true';

  let where = 'workspace_id = ? AND channel_id = ?';
  const args = [ctx.workspaceId, channelId];

  if (status && ['open', 'doing', 'done'].includes(status)) {
    where += ' AND status = ?';
    args.push(status);
  } else if (!includeDone) {
    where += " AND status != 'done'";
  }

  const rows = db
    .prepare(
      `
      SELECT * FROM tasks
      WHERE ${where}
      ORDER BY
        CASE status WHEN 'open' THEN 1 WHEN 'doing' THEN 2 WHEN 'done' THEN 3 ELSE 9 END,
        COALESCE(due_at, 9223372036854775807) ASC,
        updated_at DESC
      LIMIT ?
    `
    )
    .all(...args, limit);

  const taskIds = rows.map((r) => r.id);

  const reacts = taskIds.length
    ? db
        .prepare(
          `
        SELECT target_id, emoji, COUNT(*) AS count
        FROM task_reactions
        WHERE workspace_id = ? AND target_type = 'task' AND target_id IN (${taskIds
          .map(() => '?')
          .join(',')})
        GROUP BY target_id, emoji
      `
        )
        .all(ctx.workspaceId, ...taskIds)
    : [];

  const mine = taskIds.length
    ? db
        .prepare(
          `
        SELECT target_id, emoji
        FROM task_reactions
        WHERE workspace_id = ? AND target_type = 'task' AND user_id = ? AND target_id IN (${taskIds
          .map(() => '?')
          .join(',')})
      `
        )
        .all(ctx.workspaceId, ctx.userId, ...taskIds)
    : [];

  const reactMap = new Map();
  reacts.forEach((r) => {
    if (!reactMap.has(r.target_id)) reactMap.set(r.target_id, {});
    reactMap.get(r.target_id)[r.emoji] = Number(r.count || 0);
  });

  const mineSet = new Set(mine.map((r) => `${r.target_id}|${r.emoji}`));

  res.json({
    tasks: rows.map((t) => ({
      ...taskToDto(t),
      reactions: reactMap.get(t.id) || {},
      myReactions: Array.from(Object.keys(reactMap.get(t.id) || {})).filter((e) =>
        mineSet.has(`${t.id}|${e}`)
      )
    }))
  });
});

app.post('/api/tasks', authRequired, express.json(), (req, res) => {
  const ctx = mustAuthTask(req, res);
  if (!ctx) return;
  const role = ctx.role;
  if (!canManageTasks(role)) return res.status(403).json({ error: 'Forbidden' });

  const channelId = String(req.body.channelId || '');
  const title = String(req.body.title || '').trim();
  const description = String(req.body.description || '').trim();
  const status = ensureStatus(req.body.status);
  const priority = ensurePriority(req.body.priority);
  const dueAt = req.body.dueAt ? Number(req.body.dueAt) : null;
  const assignedTo = req.body.assignedTo ? String(req.body.assignedTo) : null;

  if (!channelId) return res.status(400).json({ error: 'channelId required' });
  if (!title) return res.status(400).json({ error: 'title required' });
  if (!assertChannelInWorkspace(ctx.workspaceId, channelId)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const id = secId('task');
  const now = nowMs();

  db.prepare(
    `
    INSERT INTO tasks
    (id, workspace_id, channel_id, title, description, status, priority, due_at, completed_at, created_by, assigned_to, created_at, updated_at)
    VALUES
    (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `
  ).run(
    id,
    ctx.workspaceId,
    channelId,
    title,
    description || null,
    status,
    priority,
    dueAt || null,
    status === 'done' ? now : null,
    ctx.userId,
    assignedTo,
    now,
    now
  );

  const row = db.prepare(`SELECT * FROM tasks WHERE id = ?`).get(id);
  res.json({ task: taskToDto(row) });
});

app.patch('/api/tasks/:id', authRequired, express.json(), (req, res) => {
  const ctx = mustAuthTask(req, res);
  if (!ctx) return;

  const taskId = String(req.params.id || '');
  const existing = db.prepare(`SELECT * FROM tasks WHERE id = ? AND workspace_id = ?`).get(taskId, ctx.workspaceId);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const role = ctx.role;
  const canManage = canManageTasks(role);
  const isOwner = String(existing.created_by) === String(ctx.userId);
  const isAssignee = existing.assigned_to && String(existing.assigned_to) === String(ctx.userId);

  if (!canManage && !(isOwner || isAssignee)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const patch = {
    title: req.body.title != null ? String(req.body.title).trim() : null,
    description: req.body.description != null ? String(req.body.description).trim() : null,
    status: req.body.status != null ? ensureStatus(req.body.status) : null,
    priority: req.body.priority != null ? ensurePriority(req.body.priority) : null,
    dueAt: req.body.dueAt != null ? (req.body.dueAt ? Number(req.body.dueAt) : null) : undefined,
    assignedTo: req.body.assignedTo != null ? (req.body.assignedTo ? String(req.body.assignedTo) : null) : undefined
  };

  if (!canManage) {
    patch.title = null;
    patch.description = null;
    patch.priority = null;
    patch.dueAt = undefined;
    patch.assignedTo = undefined;
  }

  const now = nowMs();
  const nextStatus = patch.status ?? existing.status;
  const completedAt =
    nextStatus === 'done' ? (existing.completed_at || now) : null;

  db.prepare(
    `
    UPDATE tasks SET
      title = COALESCE(?, title),
      description = COALESCE(?, description),
      status = COALESCE(?, status),
      priority = COALESCE(?, priority),
      due_at = CASE WHEN ? IS NULL THEN due_at ELSE ? END,
      assigned_to = CASE WHEN ? IS NULL THEN assigned_to ELSE ? END,
      completed_at = ?,
      updated_at = ?
    WHERE id = ? AND workspace_id = ?
  `
  ).run(
    patch.title,
    patch.description,
    patch.status,
    patch.priority,
    patch.dueAt === undefined ? null : '__set__',
    patch.dueAt === undefined ? null : patch.dueAt,
    patch.assignedTo === undefined ? null : '__set__',
    patch.assignedTo === undefined ? null : patch.assignedTo,
    completedAt,
    now,
    taskId,
    ctx.workspaceId
  );

  const row = db.prepare(`SELECT * FROM tasks WHERE id = ?`).get(taskId);
  res.json({ task: taskToDto(row) });
});

app.post('/api/tasks/:id/comments', authRequired, express.json(), (req, res) => {
  const ctx = mustAuthTask(req, res);
  if (!ctx) return;

  const taskId = String(req.params.id || '');
  const body = String(req.body.body || '').trim();
  if (!body) return res.status(400).json({ error: 'body required' });

  const existing = db.prepare(`SELECT * FROM tasks WHERE id = ? AND workspace_id = ?`).get(taskId, ctx.workspaceId);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const id = secId('tcom');
  const now = nowMs();

  db.prepare(
    `
    INSERT INTO task_comments (id, workspace_id, task_id, user_id, body, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `
  ).run(id, ctx.workspaceId, taskId, ctx.userId, body, now);

  db.prepare(`UPDATE tasks SET updated_at = ? WHERE id = ?`).run(now, taskId);

  const row = db.prepare(`SELECT * FROM task_comments WHERE id = ?`).get(id);
  res.json({ comment: row });
});

app.get('/api/tasks/:id/comments', authRequired, (req, res) => {
  const ctx = mustAuthTask(req, res);
  if (!ctx) return;

  const taskId = String(req.params.id || '');
  const existing = db.prepare(`SELECT * FROM tasks WHERE id = ? AND workspace_id = ?`).get(taskId, ctx.workspaceId);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const rows = db
    .prepare(
      `
      SELECT c.*
      FROM task_comments c
      WHERE c.workspace_id = ? AND c.task_id = ?
      ORDER BY c.created_at ASC
    `
    )
    .all(ctx.workspaceId, taskId);

  const commentIds = rows.map((r) => r.id);
  const reacts = commentIds.length
    ? db
        .prepare(
          `
        SELECT target_id, emoji, COUNT(*) AS count
        FROM task_reactions
        WHERE workspace_id = ? AND target_type = 'comment' AND target_id IN (${commentIds
          .map(() => '?')
          .join(',')})
        GROUP BY target_id, emoji
      `
        )
        .all(ctx.workspaceId, ...commentIds)
    : [];

  const mine = commentIds.length
    ? db
        .prepare(
          `
        SELECT target_id, emoji
        FROM task_reactions
        WHERE workspace_id = ? AND target_type = 'comment' AND user_id = ? AND target_id IN (${commentIds
          .map(() => '?')
          .join(',')})
      `
        )
        .all(ctx.workspaceId, ctx.userId, ...commentIds)
    : [];

  const reactMap = new Map();
  reacts.forEach((r) => {
    if (!reactMap.has(r.target_id)) reactMap.set(r.target_id, {});
    reactMap.get(r.target_id)[r.emoji] = Number(r.count || 0);
  });
  const mineSet = new Set(mine.map((r) => `${r.target_id}|${r.emoji}`));

  res.json({
    comments: rows.map((c) => ({
      ...c,
      reactions: reactMap.get(c.id) || {},
      myReactions: Array.from(Object.keys(reactMap.get(c.id) || {})).filter((e) =>
        mineSet.has(`${c.id}|${e}`)
      )
    }))
  });
});

app.post('/api/task-reactions/toggle', authRequired, express.json(), (req, res) => {
  const ctx = mustAuthTask(req, res);
  if (!ctx) return;

  const targetType = String(req.body.targetType || '').toLowerCase();
  const targetId = String(req.body.targetId || '');
  const emoji = String(req.body.emoji || '').trim();

  if (!['task', 'comment'].includes(targetType)) return res.status(400).json({ error: 'targetType invalid' });
  if (!targetId) return res.status(400).json({ error: 'targetId required' });
  if (!emoji) return res.status(400).json({ error: 'emoji required' });

  if (targetType === 'task') {
    const t = db.prepare(`SELECT id FROM tasks WHERE id = ? AND workspace_id = ?`).get(targetId, ctx.workspaceId);
    if (!t) return res.status(404).json({ error: 'Not found' });
  } else {
    const c = db.prepare(`SELECT id FROM task_comments WHERE id = ? AND workspace_id = ?`).get(targetId, ctx.workspaceId);
    if (!c) return res.status(404).json({ error: 'Not found' });
  }

  const existing = db.prepare(
    `SELECT id FROM task_reactions
     WHERE workspace_id = ? AND target_type = ? AND target_id = ? AND emoji = ? AND user_id = ?`
  ).get(ctx.workspaceId, targetType, targetId, emoji, ctx.userId);

  if (existing) {
    db.prepare(`DELETE FROM task_reactions WHERE id = ?`).run(existing.id);
    return res.json({ on: false });
  }

  const id = secId('react');
  db.prepare(
    `INSERT INTO task_reactions (id, workspace_id, target_type, target_id, emoji, user_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, ctx.workspaceId, targetType, targetId, emoji, ctx.userId, nowMs());

  res.json({ on: true });
});

app.post('/api/auth/logout', authRequired, (req, res) => {
  const rt = req.cookies?.refresh_token;
  const now = Date.now();

  if (rt) {
    const hash = sha256(rt);
    db.prepare(`UPDATE refresh_tokens SET revoked_at = ? WHERE token_hash = ?`).run(now, hash);
    try {
      jwt.verify(rt, JWT_REFRESH_SECRET);
    } catch (_err) {
      /* ignore */
    }
  }

  const expMs = req.auth?.exp ? req.auth.exp * 1000 : now + 15 * 60 * 1000;
  db.prepare(`
    INSERT OR REPLACE INTO revoked_access_tokens (jti, user_id, revoked_at, expires_at)
    VALUES (?, ?, ?, ?)
  `).run(req.auth.jti, req.auth.sub, now, expMs);

  clearAuthCookies(res);
  res.json({ ok: true });
});

app.post('/api/auth/first-login/set-password', authRequired, (req, res) => {
  const { password, confirmPassword } = req.body || {};
  const p1 = String(password || '');
  const p2 = String(confirmPassword || '');

  if (!p1 || p1.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }
  if (p1 !== p2) {
    return res.status(400).json({ error: 'Passwords do not match.' });
  }

  const hasUpper = /[A-Z]/.test(p1);
  const hasLower = /[a-z]/.test(p1);
  const hasNum = /[0-9]/.test(p1);
  if (!(hasUpper && hasLower && hasNum)) {
    return res.status(400).json({ error: 'Use uppercase, lowercase, and a number.' });
  }

  const userId = req.auth?.sub;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const row = db
    .prepare(`SELECT id, workspace_id AS workspaceId, must_change_password FROM users WHERE id = ? LIMIT 1`)
    .get(userId);
  if (!row) return res.status(401).json({ error: 'User not found.' });
  if (!row.must_change_password) return res.status(400).json({ error: 'Password change not required.' });

  const history = db
    .prepare(`
      SELECT password_hash FROM password_history
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT 5
    `)
    .all(row.id);
  for (const h of history) {
    if (verifyPassword(p1, h.password_hash)) {
      return res.status(400).json({
        error: 'You cannot reuse a recent password.'
      });
    }
  }

  const newHash = hashPassword(p1);
  db.prepare(`
    UPDATE users
    SET password_hash = ?, must_change_password = 0, password_changed_at = ?
    WHERE id = ?
  `).run(newHash, Date.now(), row.id);

  db.prepare(`
    INSERT INTO password_history (id, user_id, password_hash, created_at)
    VALUES (?, ?, ?, ?)
  `).run(makeId('ph'), row.id, newHash, Date.now());

  legacyAuditLog({
    workspaceId: row.workspaceId || null,
    actor: row.id,
    action: 'security.password_changed',
    target: row.id,
    payload: {
      method: 'first_login',
      ip: req.ip || ''
    }
  });

  logSecurityEvent({
    workspaceId: row.workspaceId || null,
    actorUserId: row.id,
    targetUserId: row.id,
    type: 'security.password_changed',
    severity: 'info',
    ip: req.ip || null,
    userAgent: req.headers['user-agent'] || null,
    payload: { method: 'first_login' }
  });

  res.json({ ok: true });
});

app.post(
  '/api/admin/users/:userId/revoke-sessions',
  authRequired,
  requirePermission('admin:users:revoke_sessions'),
  (req, res) => {
    const { userId } = req.params;
    const now = Date.now();

    db.prepare(`UPDATE refresh_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL`)
      .run(now, userId);

    res.json({ ok: true });
  }
);

app.post('/api/auth/forgot-password', strictLimiter, async (req, res) => {
  const { email } = req.body || {};
  const user = findUserByEmail(email);
  if (!user) {
    return res.json({ ok: true }); // do not leak
  }
  const token = makeResetToken();
  const createdAt = nowMs();
  const expiresAt = createdAt + PASSWORD_RESET_EXPIRY_HOURS * 60 * 60 * 1000;
  db.prepare(`
    INSERT INTO password_resets (token, user_id, workspace_id, created_at, expires_at, used)
    VALUES (?, ?, ?, ?, ?, 0)
  `).run(token, user.id, user.workspaceId, createdAt, expiresAt);

  try {
    await sendPasswordResetEmail(user, token);
  } catch (err) {
    console.error('Forgot password email failed', err);
    return res.status(500).json({ error: 'Could not send reset email' });
  }
  audit('auth.password_reset_requested', req, {
    user,
    target: user.id,
    workspaceId: user.workspaceId || null,
    meta: { email: user.email }
  });
  res.json({ ok: true });
});

app.get('/api/auth/reset-password/:token', (req, res) => {
  const token = (req.params.token || '').trim();
  const row = getResetToken(token);
  if (!row || row.used || Number(row.expiresAt) < nowMs()) {
    return res.status(404).json({ error: 'Invalid or expired token' });
  }
  res.json({ ok: true, workspaceId: row.workspaceId });
});

app.post('/api/auth/reset-password/complete', strictLimiter, async (req, res) => {
  const { token, password } = req.body || {};
  const row = getResetToken(token);
  if (!row || row.used || Number(row.expiresAt) < nowMs()) {
    return res.status(400).json({ error: 'Invalid or expired token' });
  }
  if (!password || !validatePassword(password)) {
    return res.status(400).json({
      error: 'Password must be at least 8 characters and include upper, lower, number, and symbol.'
    });
  }
  const hash = hashPassword(password);
  if (!hash) return res.status(500).json({ error: 'Could not hash password' });

  const user = db
    .prepare('SELECT id, email, workspace_id AS workspaceId, first_name, last_name, name FROM users WHERE id = ?')
    .get(row.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const tx = db.transaction(() => {
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, user.id);
    db.prepare('UPDATE password_resets SET used = 1, used_at = ? WHERE token = ?').run(new Date().toISOString(), token);
  });
  tx();

  try {
    await sendPasswordChangedEmail(user);
  } catch (err) {
    console.error('Password changed email failed', err);
  }
  audit('auth.password_reset', req, {
    user,
    target: user.id,
    workspaceId: user.workspaceId || null,
    meta: { method: 'forgot_password' }
  });
  res.json({ ok: true });
});

// Policy acceptance (per user + workspace)
app.get('/api/policy/acceptance', (req, res) => {
  const userId = getRequesterId(req);
  const workspaceId = (req.query.workspaceId || '').trim();
  if (!userId || !workspaceId) {
    return res.json({ accepted: true, version: POLICY_VERSION });
  }
  const row = db
    .prepare(
      'SELECT accepted_at FROM policy_acceptances WHERE user_id = ? AND workspace_id = ? AND version = ?'
    )
    .get(userId, workspaceId, POLICY_VERSION);
  res.json({
    accepted: !!row,
    acceptedAt: row?.accepted_at || null,
    version: POLICY_VERSION
  });
});

app.post('/api/policy/accept', (req, res) => {
  const userId = getRequesterId(req);
  const { workspaceId } = req.body || {};
  if (!userId || !workspaceId) {
    return res.status(400).json({ error: 'userId and workspaceId are required' });
  }
  const id = generateId('p');
  db.prepare(
    `INSERT OR REPLACE INTO policy_acceptances (id, user_id, workspace_id, version, accepted_at)
     VALUES (?, ?, ?, ?, datetime('now'))`
  ).run(id, userId, workspaceId, POLICY_VERSION);
  const row = db
    .prepare(
      'SELECT accepted_at FROM policy_acceptances WHERE user_id = ? AND workspace_id = ? AND version = ?'
    )
    .get(userId, workspaceId, POLICY_VERSION);
  res.json({
    ok: true,
    acceptedAt: row?.accepted_at || null,
    version: POLICY_VERSION
  });
});

app.post('/api/workspaces/:workspaceId/users/:userId', (req, res) => {
  const { workspaceId, userId } = req.params;
  const { role = 'member' } = req.body || {};

  const ws = db.prepare('SELECT id FROM workspaces WHERE id = ?').get(workspaceId);
  if (!ws) {
    return res.status(404).json({ error: 'Workspace not found' });
  }

  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  db.prepare(
    'INSERT OR REPLACE INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, ?)'
  ).run(workspaceId, userId, role);

  res.json({ workspaceId, userId, role });
});

// Update user's avatar (data URL or external URL)
app.post('/api/users/:userId/avatar', (req, res) => {
  const { userId } = req.params;
  const { avatarData, avatarUrl } = req.body || {};

  let user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);

  const val = (avatarData || avatarUrl || '').trim();
  if (!val) {
    return res.status(400).json({ error: 'avatarData or avatarUrl is required' });
  }

  if (avatarData && avatarData.length > 2_000_000) {
    return res.status(400).json({ error: 'Avatar image too large' });
  }

  if (!user) {
    // create a minimal user record so admin/special users can store an avatar
    db.prepare(
      `INSERT INTO users (id, workspace_id, first_name, last_name, name, username, avatar_url, role, status, native_language, native_language_confirmed)
       VALUES (@id, @workspace_id, @first_name, @last_name, @name, @username, @avatar_url, @role, @status, @native_language, @native_language_confirmed)`
    ).run({
      id: userId,
      workspace_id: 'default',
      first_name: userId,
      last_name: '',
      name: userId,
      username: userId,
      avatar_url: val,
      role: 'member',
      status: 'active',
      native_language: 'en',
      native_language_confirmed: 0
    });
    user = { id: userId };
  } else {
    db.prepare('UPDATE users SET avatar_url = ? WHERE id = ?').run(val, userId);
  }
  const userRow = db
    .prepare('SELECT name, username, email, first_name, last_name, avatar_url FROM users WHERE id = ?')
    .get(userId);
  cacheAvatarForUserRow(userRow);

  res.json({ userId, avatarUrl: val });
});

// Typing indicator broadcast (simple, stateless)
app.post('/api/typing', (req, res) => {
  const { channelId, userId, name, initials, isTyping } = req.body || {};
  if (!channelId || !userId) {
    return res.status(400).json({ error: 'channelId and userId are required' });
  }
  broadcastEvent('user_typing', {
    channelId,
    userId,
    name: name || 'Someone',
    initials: initials || '',
    isTyping: !!isTyping
  });
  res.json({ ok: true });
});

// Assign user to workspace (and optional channel) - admin only
app.post('/api/admin/assign', (req, res) => {
  if (req.get('x-admin') !== '1') {
    return res.status(403).json({ error: 'Only admins can assign users' });
  }

  const { userId, workspaceId, channelId } = req.body || {};
  if (!userId || !workspaceId) {
    return res.status(400).json({ error: 'userId and workspaceId are required' });
  }

  const user = db
    .prepare('SELECT id, workspace_id AS workspaceId, username FROM users WHERE id = ?')
    .get(userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const ws = db.prepare('SELECT id FROM workspaces WHERE id = ?').get(workspaceId);
  if (!ws) {
    return res.status(404).json({ error: 'Workspace not found' });
  }

  // allow multi-workspace membership via workspace_members even if user.workspaceId differs
  db.prepare(
    'INSERT OR IGNORE INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, ?)'
  ).run(workspaceId, userId, 'member');

  let assignedChannel = null;
  if (channelId) {
    const channel = db
      .prepare('SELECT id, workspace_id AS workspaceId, category FROM channels WHERE id = ?')
      .get(channelId);
    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' });
    }
    // allow cross-workspace assignment; "all" is global
    db.prepare(
      'INSERT OR IGNORE INTO channel_members (channel_id, user_id) VALUES (?, ?)'
    ).run(channelId, userId);
    assignedChannel = channelId;
  }

  res.json({ ok: true, userId, workspaceId, channelId: assignedChannel });
});

app.get('/api/class-memberships', (req, res) => {
  if (req.get('x-admin') !== '1' && req.get('x-super-admin') !== '1') {
    return res.status(403).json({ error: 'Only admins can view class memberships' });
  }
  const workspaceId = (req.query.workspaceId || 'default').trim() || 'default';
  const rows = db
    .prepare(
      `
      SELECT
        cm.user_id   AS userId,
        cm.channel_id AS channelId,
        c.name       AS channelName
      FROM channel_members cm
      JOIN channels c ON c.id = cm.channel_id
      WHERE c.workspace_id = ?
        AND lower(c.category) = 'classes'
      ORDER BY c.name
    `
    )
    .all(workspaceId);
  res.json(rows);
});

app.get('/api/user-class-memberships', (req, res) => {
  const workspaceId = (req.query.workspaceId || 'default').trim() || 'default';
  const userId = String(req.query.userId || req.get('x-user-id') || '').trim();
  if (!userId) return res.json([]);
  const rows = db
    .prepare(
      `
      SELECT
        cm.channel_id AS channelId,
        c.name       AS channelName
      FROM channel_members cm
      JOIN channels c ON c.id = cm.channel_id
      WHERE cm.user_id = ?
        AND c.workspace_id = ?
        AND lower(c.category) = 'classes'
      ORDER BY c.name
    `
    )
    .all(userId, workspaceId);
  res.json(rows);
});

app.post('/api/class-memberships', (req, res) => {
  if (req.get('x-admin') !== '1' && req.get('x-super-admin') !== '1') {
    return res.status(403).json({ error: 'Only admins can assign classes' });
  }
  const { userId, channelId, workspaceId } = req.body || {};
  if (!userId || !channelId || !workspaceId) {
    return res.status(400).json({ error: 'userId, channelId, and workspaceId are required' });
  }
  const user = db.prepare('SELECT id, workspace_id AS workspaceId FROM users WHERE id = ?').get(userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  if (String(user.workspaceId) !== String(workspaceId)) {
    return res.status(400).json({ error: 'User is not in this workspace' });
  }
  const channel = db
    .prepare('SELECT id, name, workspace_id AS workspaceId, category FROM channels WHERE id = ?')
    .get(channelId);
  if (!channel) {
    return res.status(404).json({ error: 'Channel not found' });
  }
  if (String(channel.workspaceId) !== String(workspaceId)) {
    return res.status(400).json({ error: 'Channel is not in this workspace' });
  }
  if (String(channel.category || '').toLowerCase() !== 'classes') {
    return res.status(400).json({ error: 'Only class channels can be assigned' });
  }

  db.prepare('INSERT OR IGNORE INTO channel_members (channel_id, user_id) VALUES (?, ?)').run(
    channelId,
    userId
  );
  const hwId = ensureHomeworkChannelForClass({
    id: channel.id,
    name: channel.name,
    workspaceId: channel.workspaceId,
    category: channel.category
  });
  if (hwId) {
    db.prepare('INSERT OR IGNORE INTO channel_members (channel_id, user_id) VALUES (?, ?)').run(
      hwId,
      userId
    );
  }
  res.json({ ok: true, userId, channelId, channelName: channel.name });
});

// channel members listing + count
app.get('/api/channels/:channelId/members', (req, res) => {
  const { channelId } = req.params;
  const channel = db
    .prepare('SELECT id, name, workspace_id AS workspaceId, members, category FROM channels WHERE id = ?')
    .get(channelId);
  if (!channel) {
    console.warn('Channel members requested for missing channel', channelId);
    return res.json({ channelId, count: 0, members: [] });
  }

  let members = [];
  let count = 0;

  const memberRows = db
    .prepare('SELECT user_id FROM channel_members WHERE channel_id = ?')
    .all(channelId);
  members = memberRows.map((r) => r.user_id);
  count = members.length;

  if (count === 0) {
    const workspaceMembers = db
      .prepare("SELECT user_id FROM workspace_members WHERE workspace_id IN (?, 'all')")
      .all(channel.workspaceId);
    members = workspaceMembers.map((r) => r.user_id);
    count = members.length;
  }

  if (count === 0) {
    const workspaceUsers = db
      .prepare("SELECT id FROM users WHERE workspace_id IN (?, 'all')")
      .all(channel.workspaceId);
    members = workspaceUsers.map((r) => r.id);
    count = members.length;
  }

  const channelMembersFallback = Number.isFinite(channel.members) ? channel.members : 0;
  count = Math.max(count, channelMembersFallback);

  res.json({ channelId, count, members });
});

function canManageChannelMembers(role) {
  const value = String(role || '').toLowerCase();
  return value === 'teacher' || value === 'admin' || value === 'super_admin' || value === 'school_admin';
}

app.post('/api/channels/:channelId/members', (req, res) => {
  const { channelId } = req.params;
  const { userId } = req.body || {};
  const requesterId = getRequesterId(req);
  if (!requesterId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }

  const requester = db
    .prepare('SELECT id, role, workspace_id AS workspaceId FROM users WHERE id = ?')
    .get(requesterId);
  if (!requester) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!canManageChannelMembers(requester.role)) {
    return res.status(403).json({ error: 'Only teachers or admins can manage members' });
  }

  const user = db
    .prepare('SELECT id, role, workspace_id AS workspaceId FROM users WHERE id = ?')
    .get(userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  const userRole = String(user.role || '').toLowerCase();
  if (userRole !== 'student' && userRole !== 'teacher') {
    return res.status(400).json({ error: 'Only students or teachers can be assigned here' });
  }

  const channel = db
    .prepare('SELECT id, name, workspace_id AS workspaceId, category FROM channels WHERE id = ?')
    .get(channelId);
  if (!channel) {
    return res.status(404).json({ error: 'Channel not found' });
  }
  if (
    String(channel.workspaceId) !== String(requester.workspaceId) ||
    String(channel.workspaceId) !== String(user.workspaceId)
  ) {
    return res.status(400).json({ error: 'Workspace mismatch' });
  }
  const meta = normalizeChannelCategory(channel.category) === 'classes'
    ? getClassMeta(channel.workspaceId, channel.id)
    : null;
  const counts = countChannelMembers(channel.id);
  if (
    meta &&
    meta.capacity > 0 &&
    userRole === 'student' &&
    counts.totalStudents >= meta.capacity
  ) {
    return res.status(400).json({ error: 'Class capacity reached' });
  }

  db.prepare('INSERT OR IGNORE INTO channel_members (channel_id, user_id) VALUES (?, ?)').run(
    channelId,
    userId
  );

  if (normalizeChannelCategory(channel.category) === 'classes') {
    const hwId = ensureHomeworkChannelForClass({
      id: channel.id,
      name: channel.name,
      workspaceId: channel.workspaceId,
      category: channel.category
    });
    if (hwId) {
      db.prepare('INSERT OR IGNORE INTO channel_members (channel_id, user_id) VALUES (?, ?)').run(
        hwId,
        userId
      );
    }
  }

  res.json({ ok: true, channelId, userId });
});

app.delete('/api/channels/:channelId/members', (req, res) => {
  const { channelId } = req.params;
  const { userId } = req.body || {};
  const requesterId = getRequesterId(req);
  if (!requesterId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }

  const requester = db
    .prepare('SELECT id, role, workspace_id AS workspaceId FROM users WHERE id = ?')
    .get(requesterId);
  if (!requester) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!canManageChannelMembers(requester.role)) {
    return res.status(403).json({ error: 'Only teachers or admins can manage members' });
  }

  const user = db
    .prepare('SELECT id, role, workspace_id AS workspaceId FROM users WHERE id = ?')
    .get(userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  const userRole = String(user.role || '').toLowerCase();
  if (userRole !== 'student' && userRole !== 'teacher') {
    return res.status(400).json({ error: 'Only students or teachers can be removed here' });
  }

  const channel = db
    .prepare('SELECT id, name, workspace_id AS workspaceId, category FROM channels WHERE id = ?')
    .get(channelId);
  if (!channel) {
    return res.status(404).json({ error: 'Channel not found' });
  }
  if (
    String(channel.workspaceId) !== String(requester.workspaceId) ||
    String(channel.workspaceId) !== String(user.workspaceId)
  ) {
    return res.status(400).json({ error: 'Workspace mismatch' });
  }

  db.prepare('DELETE FROM channel_members WHERE channel_id = ? AND user_id = ?').run(
    channelId,
    userId
  );

  if (normalizeChannelCategory(channel.category) === 'classes') {
    const hw = db
      .prepare(
        `SELECT id
         FROM channels
         WHERE lower(category) = 'homework'
           AND topic = ?`
      )
      .get(`homework_for:${channelId}`);
    if (hw?.id) {
      db.prepare('DELETE FROM channel_members WHERE channel_id = ? AND user_id = ?').run(
        hw.id,
        userId
      );
    }
  }

  res.json({ ok: true, channelId, userId });
});

/* ---------- CHANNELS API ---------- */

app.get(
  '/api/channels',
  authRequired,
  requirePermission('channels:read'),
  requireWorkspaceAccess((req) => resolveRequestedWorkspaceId(req)),
  (req, res) => {
    const requestedWorkspaceId = String(req.query.workspaceId || '').trim();
    const workspaceId = resolveRequestedWorkspaceId(req);
    const includeGlobal = req.get('x-super-admin') === '1' || !!req.auth?.superAdmin;
    ensureTeachersChannel(workspaceId);
    if (workspaceId && workspaceId !== 'all') {
      ensureClubChannels(workspaceId);
      ensureToolChannels(workspaceId);
      ensureExamChannels(workspaceId);
      ensureDefaultChannelMemberships(workspaceId);
      ensureHomeworkChannels(workspaceId);
    }
    let query = `
    SELECT
      c.id,
      c.name,
      c.topic,
      c.members,
      c.unread,
      c.category,
      c.workspace_id AS workspaceId,
      MAX(
        COALESCE(cm.cnt, 0),
        COALESCE(wm.cnt, 0),
        COALESCE(uw.cnt, 0),
        COALESCE(c.members, 0)
      ) AS memberCount
    FROM channels c
    LEFT JOIN (
      SELECT channel_id, COUNT(*) AS cnt
      FROM channel_members
      GROUP BY channel_id
    ) cm ON cm.channel_id = c.id
    LEFT JOIN (
      SELECT workspace_id, COUNT(*) AS cnt
      FROM workspace_members
      GROUP BY workspace_id
    ) wm ON wm.workspace_id = c.workspace_id
    LEFT JOIN (
      SELECT workspace_id, COUNT(*) AS cnt
      FROM users
      GROUP BY workspace_id
    ) uw ON uw.workspace_id = c.workspace_id`;
    const params = [];
    if (requestedWorkspaceId) {
      if (includeGlobal) {
        query += " WHERE c.workspace_id IN (?, 'all')";
        params.push(workspaceId);
      } else {
        query += ' WHERE c.workspace_id = ?';
        params.push(workspaceId);
      }
    } else {
      query += ' WHERE c.workspace_id = ?';
      params.push(workspaceId);
    }
  query += ' ORDER BY name';

  const channels = db.prepare(query).all(...params);
  res.json(channels);
});

app.post(
  '/api/channels',
  authRequired,
  requirePermission('channels:write'),
  requireWorkspaceAccess((req) => String(req.body?.workspaceId || workspaceIdFromRequest(req) || 'default')),
  (req, res) => {
    const { name, topic, workspaceId = 'default', memberIds, category } = req.body || {};
    console.log('POST /api/channels payload', req.body);
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Channel name is required' });
  }

  const wsTarget = (workspaceId || 'default').trim();
  if (wsTarget !== 'all') {
    const wsExists = db.prepare('SELECT 1 FROM workspaces WHERE id = ?').get(wsTarget);
    if (!wsExists) {
      return res.status(404).json({ error: 'Workspace not found' });
    }
  }

  const baseId = slugify(name.trim());
  let id = baseId;
  let suffix = 1;
  while (db.prepare('SELECT 1 FROM channels WHERE id = ?').get(id)) {
    id = `${baseId}-${suffix++}`;
  }

  const memberList = Array.isArray(memberIds) ? memberIds.filter(Boolean) : [];

  const channel = {
    id,
    name: name.trim(),
    topic: topic || '',
    members: memberList.length || 1,
    unread: 0,
    workspaceId: wsTarget,
    category: normalizeChannelCategory(category)
  };

  const tx = db.transaction(() => {
    db.prepare(
      `
      INSERT INTO channels (id, name, topic, members, unread, workspace_id, category)
      VALUES (@id, @name, @topic, @members, @unread, @workspace_id, @category)
    `
    ).run({
      id,
      name: name.trim(),
      topic: channel.topic,
      members: channel.members,
      unread: 0,
      workspace_id: wsTarget,
      category: channel.category
    });

    if (memberList.length) {
      const insertMember = db.prepare(
        'INSERT OR IGNORE INTO channel_members (channel_id, user_id) VALUES (?, ?)'
      );
      memberList.forEach((uid) => insertMember.run(id, uid));
    }
  });

  tx();

  if (channel.category === 'classes') {
    ensureHomeworkChannelForClass({
      id: channel.id,
      name: channel.name,
      workspaceId: channel.workspaceId,
      category: channel.category
    });
  }
  ensureAdminsInWorkspaceChannels(wsTarget, channel.id);

  res.status(201).json(channel);
});

// UPDATE channel (name/topic/members/unread)
app.patch(
  '/api/channels/:channelId',
  authRequired,
  requirePermission('channels:write'),
  (req, res) => {
    const { channelId } = req.params;
    const { name, topic, members, unread, category } = req.body || {};

    const channel = db
      .prepare(
        'SELECT id, name, topic, members, unread, category, workspace_id as workspaceId FROM channels WHERE id = ?'
      )
      .get(channelId);

    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' });
    }

    if (!req.auth?.superAdmin && String(channel.workspaceId) !== String(req.auth?.workspaceId)) {
      return res.status(403).json({ error: 'Workspace mismatch' });
    }

    const updated = {
      id: channel.id,
      name: name && name.trim() ? name.trim() : channel.name,
      topic: typeof topic === 'string' ? topic : channel.topic,
      members: typeof members === 'number' ? members : channel.members,
      unread: typeof unread === 'number' ? unread : channel.unread,
      workspaceId: channel.workspaceId,
      category: category ? normalizeChannelCategory(category) : channel.category,
    };

    db.prepare(
      `UPDATE channels
       SET name = @name,
           topic = @topic,
           members = @members,
           unread = @unread,
           category = @category
       WHERE id = @id`
    ).run(updated);

    res.json(updated);
  }
);
// DELETE channel (and cascade messages/replies/reactions)
app.delete(
  '/api/channels/:channelId',
  authRequired,
  requirePermission('channels:write'),
  (req, res) => {
    const { channelId } = req.params;

    const channel = db
      .prepare('SELECT id, workspace_id AS workspaceId FROM channels WHERE id = ?')
      .get(channelId);
    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' });
    }

    if (!req.auth?.superAdmin && String(channel.workspaceId) !== String(req.auth?.workspaceId)) {
      return res.status(403).json({ error: 'Workspace mismatch' });
    }

    db.prepare('DELETE FROM channels WHERE id = ?').run(channelId);
    audit('channel.delete', req, {
      target: channelId,
      workspaceId: channel.workspaceId,
      meta: { category: channel.category }
    });
    const hw = db
      .prepare(
        `SELECT id
         FROM channels
         WHERE lower(category) = 'homework'
           AND topic = ?`
      )
      .get(`homework_for:${channelId}`);
    if (hw?.id) {
      db.prepare('DELETE FROM channels WHERE id = ?').run(hw.id);
    }

    // send JSON so fetchJSON() doesn't break
    res.json({ ok: true });
  }
);


/* ---------- MESSAGES + REPLIES (with reactions) ---------- */

function getMessagesForChannel(channelId) {
  const avatarCache = new Map();
  const msgs = db
    .prepare(
      `SELECT id, channel_id, author, initials, avatar_url, time, created_at, text, alt, original_language
       FROM messages
       WHERE channel_id = ?
       ORDER BY rowid`
    )
    .all(channelId);

  if (!msgs.length) return [];

  const msgIds = msgs.map((m) => m.id);
  const msgPlaceholders = msgIds.map(() => '?').join(',');

  // replies for all messages
  const replySelect = repliesHasCreatedAt
    ? `SELECT id, message_id, author, initials, avatar_url, time, text, created_at
       FROM replies
       WHERE message_id IN (${msgPlaceholders})
       ORDER BY rowid`
    : `SELECT id, message_id, author, initials, avatar_url, time, text, NULL AS created_at
       FROM replies
       WHERE message_id IN (${msgPlaceholders})
       ORDER BY rowid`;
  const replyRows = db.prepare(replySelect).all(...msgIds);

  // reactions on messages
  const msgReactionRows = db
    .prepare(
      `SELECT message_id, emoji, count
       FROM message_reactions
       WHERE message_id IN (${msgPlaceholders})`
    )
    .all(...msgIds);

  const repliesByMsg = {};
  const replyById = {};
  const replyIds = [];

  for (const r of replyRows) {
    const fallbackAvatar = !r.avatar_url ? resolveAvatarForAuthor(r.author, r.initials, avatarCache) : null;
      const replyObj = {
        id: r.id,
        author: r.author,
        initials: r.initials,
        avatarUrl: r.avatar_url || fallbackAvatar || null,
        time: r.time,
        createdAt: r.created_at || null,
        text: r.text,
        reactions: []
      };
    replyById[r.id] = replyObj;
    replyIds.push(r.id);
    if (!repliesByMsg[r.message_id]) repliesByMsg[r.message_id] = [];
    repliesByMsg[r.message_id].push(replyObj);
  }

  // reactions on replies
  if (replyIds.length) {
    const repPlaceholders = replyIds.map(() => '?').join(',');
    const replyReactionRows = db
      .prepare(
        `SELECT reply_id, emoji, count
         FROM reply_reactions
         WHERE reply_id IN (${repPlaceholders})`
      )
      .all(...replyIds);

    for (const rr of replyReactionRows) {
      const replyObj = replyById[rr.reply_id];
      if (!replyObj) continue;
      if (!replyObj.reactions) replyObj.reactions = [];
      replyObj.reactions.push({ emoji: rr.emoji, count: rr.count });
    }
  }

  const msgReactionsById = {};
  for (const mr of msgReactionRows) {
    if (!msgReactionsById[mr.message_id]) msgReactionsById[mr.message_id] = [];
    msgReactionsById[mr.message_id].push({
      emoji: mr.emoji,
      count: mr.count
    });
  }

  return msgs.map((m) => ({
    id: m.id,
    author: m.author,
    initials: m.initials,
    avatarUrl: m.avatar_url || resolveAvatarForAuthor(m.author, m.initials, avatarCache) || null,
    time: m.time,
    createdAt: messagesHasCreatedAt ? m.created_at || null : null,
    text: m.text,
    originalLanguage: m.original_language || 'en',
    alt: !!m.alt,
    reactions: msgReactionsById[m.id] || [],
    replies: repliesByMsg[m.id] || []
  }));
}

function getMessagesForDm(dmId) {
  const msgs = db
    .prepare(
      `SELECT id, dm_id, author, initials, time, text, NULL AS avatar_url
       FROM dm_messages
       WHERE dm_id = ?
       ORDER BY rowid`
    )
    .all(dmId);
  if (!msgs.length) return [];

  const msgIds = msgs.map((m) => m.id);
  const placeholders = msgIds.map(() => '?').join(',');
  const avatarCache = new Map();

  const replySelect = dmRepliesHasCreatedAt
    ? `SELECT id, dm_message_id, author, initials, avatar_url, time, text, created_at
       FROM dm_replies
       WHERE dm_message_id IN (${placeholders})
       ORDER BY rowid`
    : `SELECT id, dm_message_id, author, initials, avatar_url, time, text, NULL AS created_at
       FROM dm_replies
       WHERE dm_message_id IN (${placeholders})
       ORDER BY rowid`;
  const replyRows = db.prepare(replySelect).all(...msgIds);

  const repliesByMsg = {};
  const replyById = {};
  const replyIds = [];

  for (const r of replyRows) {
    const replyObj = {
      id: r.id,
      author: r.author,
      initials: r.initials,
      avatarUrl: r.avatar_url || resolveAvatarForAuthor(r.author, r.initials, avatarCache) || null,
      time: r.time,
      createdAt: r.created_at || null,
      text: r.text,
      reactions: []
    };
    replyById[r.id] = replyObj;
    replyIds.push(r.id);
    if (!repliesByMsg[r.dm_message_id]) repliesByMsg[r.dm_message_id] = [];
    repliesByMsg[r.dm_message_id].push(replyObj);
  }

  if (replyIds.length) {
    const repPlaceholders = replyIds.map(() => '?').join(',');
    const replyReactionRows = db
      .prepare(
        `SELECT reply_id, emoji, count
         FROM dm_reply_reactions
         WHERE reply_id IN (${repPlaceholders})`
      )
      .all(...replyIds);

    for (const rr of replyReactionRows) {
      const replyObj = replyById[rr.reply_id];
      if (!replyObj) continue;
      if (!replyObj.reactions) replyObj.reactions = [];
      replyObj.reactions.push({ emoji: rr.emoji, count: rr.count });
    }
  }

  const msgReactionRows = db
    .prepare(
      `SELECT message_id, emoji, count
       FROM dm_message_reactions
       WHERE message_id IN (${placeholders})`
    )
    .all(...msgIds);
  const msgReactionsById = {};
  for (const mr of msgReactionRows) {
    if (!msgReactionsById[mr.message_id]) msgReactionsById[mr.message_id] = [];
    msgReactionsById[mr.message_id].push({ emoji: mr.emoji, count: mr.count });
  }

  return msgs.map((m) => ({
    id: m.id,
    author: m.author,
    initials: m.initials,
    avatarUrl: resolveAvatarForAuthor(m.author, m.initials, avatarCache) || null,
    time: m.time,
    text: m.text,
    alt: false,
    reactions: msgReactionsById[m.id] || [],
    replies: repliesByMsg[m.id] || []
  }));
}

// GET messages in channel
app.get('/api/channels/:channelId/messages', async (req, res) => {
  const { channelId } = req.params;
  const channel = db
    .prepare('SELECT id, workspace_id AS workspaceId, name, topic FROM channels WHERE id = ?')
    .get(channelId);
  if (!channel) {
    return res.status(404).json({ error: 'Channel not found' });
  }

  const viewerId = getRequesterId(req) || String(req.query.userId || '').trim();
  const viewerLang = getUserNativeLanguage(viewerId);
  const messages = getMessagesForChannel(channelId);
  const baseResponse = messages.map((m) => ({
    ...m,
    displayText: m.text,
    translationStatus: 'none'
  }));

  if (!isCultureExchangeChannel(channel.name)) {
    return res.json(baseResponse);
  }

  const startIdx = Math.max(0, messages.length - TRANSLATION_RECENT_LIMIT);
  const out = [];

  for (let i = 0; i < messages.length; i += 1) {
    const msg = messages[i];
    const base = {
      ...msg,
      displayText: msg.text,
      translationStatus: i < startIdx ? 'skipped_old' : 'none'
    };

  if (i < startIdx) {
    out.push(base);
    continue;
    }

    const sourceLang = normalizeLanguageCode(msg.original_language || 'en');
    if (sourceLang === viewerLang || isLikelyHtml(msg.text)) {
      out.push(base);
      continue;
    }

    const memoryKey = `${msg.id}|${viewerLang}`;
    if (translationMemoryCache.has(memoryKey)) {
      const cachedText = translationMemoryCache.get(memoryKey);
      out.push({
        ...base,
        displayText: cachedText,
        translationStatus: 'ready',
        translationProvider: 'argos'
      });
      continue;
    }

    const cached = getCachedTranslation(msg.id, viewerLang, viewerId);
    if (cached?.status === 'ready' && cached.translated_text) {
      translationMemoryCache.set(memoryKey, cached.translated_text);
      out.push({
        ...base,
        displayText: cached.translated_text,
        translationStatus: 'ready',
        translationProvider: cached.provider || 'argos'
      });
      continue;
    }

    upsertPendingTranslation(msg.id, viewerLang, viewerId, providerDefault);
    try {
      const translated = await translateViaHub(msg.text, sourceLang, viewerLang);
    if (translated) {
      const sanitizedTranslated = normalizeTranslatedText(translated);
      const finalTranslated = sanitizedTranslated || translated;
      saveReadyTranslation(msg.id, viewerLang, finalTranslated, viewerId);
      translationMemoryCache.set(memoryKey, finalTranslated);
      out.push({
        ...base,
        displayText: finalTranslated,
          translationStatus: 'ready',
          translationProvider: 'argos'
        });
      } else {
        out.push({
          ...base,
          translationStatus: 'failed'
        });
      }
    } catch (err) {
      markTranslationFailed(msg.id, viewerLang, err?.message || String(err), viewerId);
      out.push({
        ...base,
        translationStatus: 'failed'
      });
    }
  }

  res.json(out);
});

app.delete('/api/channels/:channelId/messages/clear', (req, res) => {
  const { channelId } = req.params;
  const user = getAuthedUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!isWorkspaceAdmin(user)) {
    return res.status(403).json({ error: 'Only admins can clear messages' });
  }
  const channel = db
    .prepare('SELECT id FROM channels WHERE id = ?')
    .get(channelId);
  if (!channel) {
    return res.status(404).json({ error: 'Channel not found' });
  }
  db.prepare('DELETE FROM messages WHERE channel_id = ?').run(channelId);
  audit('channel.messages_cleared', req, {
    user,
    target: channelId,
    workspaceId: user.workspaceId || null,
    meta: { clearedBy: user.id }
  });
  broadcastEvent('channel_messages_cleared', { channelId, userId: user.id });
  res.json({ ok: true, channelId });
});

app.get('/api/culture/prefs', (req, res) => {
  const authed = getAuthedUser(req);
  if (!authed) return res.status(401).json({ error: 'unauthorized' });

  const channelId = String(req.query.channelId || '').trim();
  if (!channelId) return res.status(400).json({ error: 'channelId required' });

  const row = db
    .prepare(`
      SELECT culture_read_language, culture_write_language
      FROM user_channel_prefs
      WHERE user_id = ? AND channel_id = ?
    `)
    .get(String(authed.id), channelId);

  res.json({
    channelId,
    readLanguage: row?.culture_read_language || 'en',
    writeLanguage: row?.culture_write_language || null
  });
});

app.post('/api/culture/prefs', (req, res) => {
  const authed = getAuthedUser(req);
  if (!authed) return res.status(401).json({ error: 'unauthorized' });

  const channelId = String(req.body?.channelId || '').trim();
  const readLanguage = normalizeLanguageCode(req.body?.readLanguage || 'en');
  const writeLanguageRaw = req.body?.writeLanguage;
  const writeLanguage = writeLanguageRaw ? normalizeLanguageCode(writeLanguageRaw) : null;

  if (!channelId) return res.status(400).json({ error: 'channelId required' });

  db.prepare(`
    INSERT INTO user_channel_prefs (user_id, channel_id, culture_read_language, culture_write_language, updated_at)
    VALUES (?, ?, ?, ?, datetime('now'))
    ON CONFLICT(user_id, channel_id)
    DO UPDATE SET culture_read_language = excluded.culture_read_language,
                  culture_write_language = excluded.culture_write_language,
                  updated_at = datetime('now')
  `).run(String(authed.id), channelId, readLanguage, writeLanguage);

  res.json({ ok: true, channelId, readLanguage, writeLanguage });
});

app.post('/api/translate', async (req, res) => {
  const authed = getAuthedUser(req);
  if (!authed) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const viewerId = authed.id || getRequesterId(req);

  const { messageId, text, sourceLang, targetLang } = req.body || {};
  const msgId = String(messageId || '').trim();
  const rawText = String(text || '').trim();

  // Always translate plain text (avoid HTML / formatting)
  const cleanText = rawText
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const MAX_CHARS = 10000;
  if (cleanText.length > MAX_CHARS) {
    return res.json({
      translatedText: rawText,
      status: 'failed',
      provider: 'none',
      error: `Too long (max ${MAX_CHARS} chars)`
    });
  }

  let from = normalizeLanguageCode(sourceLang || 'auto');
  const to = normalizeLanguageCode(
    targetLang ||
      authed.native_language ||
      authed.nativeLanguage ||
      getUserNativeLanguage(authed.id)
  );

  if (!msgId || !cleanText) {
    return res.status(400).json({ error: 'messageId and text are required' });
  }

  if (!from || from === 'auto') {
    const provider = String(process.env.TRANSLATION_PROVIDER || '').toLowerCase();
    if (provider === 'google') {
      try {
        const detected = await detectViaGoogle(cleanText);
        if (detected) {
          from = detected;
        }
      } catch (_err) {
        // ignore detection failure
      }
    }
    if (!from || from === 'auto') {
      from = 'en';
    }
  }

  if (from === to) {
    return res.json({ translatedText: rawText, status: 'none', provider: 'none' });
  }

  // If message is not in DB, translate but don't cache (avoids FK issues)
  const msgExists = db.prepare('SELECT 1 FROM messages WHERE id = ?').get(msgId);
  if (!msgExists) {
    try {
      const { provider, translatedText } = await translateSmart({
        text: cleanText,
        sourceLang: from,
        targetLang: to
      });
      const finalTranslated = normalizeTranslatedText(translatedText) || translatedText;
      return res.json({
        translatedText: finalTranslated,
        status: 'ready',
        provider: provider || 'google',
        cached: false,
        note: 'not cached (message not in db)'
      });
    } catch (e) {
      return res.json({
        translatedText: rawText,
        status: 'failed',
        provider: String(process.env.TRANSLATION_PROVIDER || 'google'),
        error: String(e?.message || e)
      });
    }
  }

  // Check cache
  const cached = getCachedTranslation(msgId, to, viewerId);

  if (cached?.status === 'ready' && cached.translated_text) {
    return res.json({
      translatedText: cached.translated_text,
      status: 'ready',
      provider: cached.provider || 'google',
      cached: true
    });
  }

  // Insert pending row (provider should reflect current provider, not hardcoded argos)
  const providerDefault = String(process.env.TRANSLATION_PROVIDER || 'google').toLowerCase();

  upsertPendingTranslation(msgId, to, viewerId, providerDefault);

    try {
      const { provider, translatedText } = await translateSmart({
        text: cleanText,
        sourceLang: from,
        targetLang: to
      });

      const providerUsed = provider || providerDefault;
      const sanitizedTranslated = normalizeTranslatedText(translatedText);
      const finalTranslated = sanitizedTranslated || translatedText;

      saveReadyTranslation(msgId, to, finalTranslated, viewerId, providerUsed);

      return res.json({
        translatedText: finalTranslated,
        status: 'ready',
        provider: providerUsed,
        cached: false
      });
    } catch (e) {
      const errorMsg = String(e?.message || e);

      markTranslationFailed(msgId, to, errorMsg, viewerId, providerDefault);

      return res.json({
        translatedText: rawText,
        status: 'failed',
        provider: providerDefault,
        error: errorMsg
      });
    }
});


// search messages across channels
app.get('/api/search', (req, res) => {
  const q = (req.query.q || '').trim();
  const workspaceIdRaw = (req.query.workspaceId || '').trim();
  const requester = getRequesterId(req);
  if (!q) {
    return res.json([]);
  }

  const like = `%${q.toLowerCase()}%`;
  const workspaceFilter =
    workspaceIdRaw && workspaceIdRaw.toLowerCase() !== 'all' ? workspaceIdRaw : null;

  // prevent caching so we never get 304
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');

  const channelQuery = `
    SELECT m.id,
           m.channel_id AS channelId,
           m.author,
           m.initials,
           m.avatar_url AS avatarUrl,
           m.time,
           m.text,
           c.name AS channelName,
           c.workspace_id AS workspaceId
    FROM messages m
    JOIN channels c ON c.id = m.channel_id
    WHERE (lower(m.text) LIKE @like
       OR lower(m.author) LIKE @like
       OR lower(c.name) LIKE @like)
      AND (@workspaceId IS NULL OR c.workspace_id = @workspaceId)
    ORDER BY m.rowid DESC
    LIMIT 50
  `;

  let channelRows = db.prepare(channelQuery).all({
    like,
    workspaceId: workspaceFilter
  });

  // fallback to all workspaces if none found
  if (!channelRows.length && workspaceFilter) {
    channelRows = db.prepare(channelQuery).all({
      like,
      workspaceId: null
    });
  }

  // DM results (filter to membership/creator)
  let dmRows = [];
  if (requester) {
    dmRows = db
      .prepare(
        `
        SELECT dm.id as dmId,
               dm.name as dmName,
               m.id,
               m.author,
               m.initials,
               NULL as avatarUrl,
               m.time,
               m.text
        FROM dm_messages m
        JOIN dms dm ON dm.id = m.dm_id
        LEFT JOIN dm_members mm ON mm.dm_id = dm.id
        WHERE (lower(m.text) LIKE @like OR lower(m.author) LIKE @like)
          AND (mm.user_id = @requester OR dm.created_by = @requester)
        ORDER BY m.rowid DESC
        LIMIT 50
      `
      )
      .all({ like, requester });
  }

  const avatarCache = new Map();
  const results = channelRows.map((r) => ({
    id: r.id,
    channelId: r.channelId,
    channelName: r.channelName,
    author: r.author,
    initials: r.initials,
    avatarUrl:
      r.avatarUrl || resolveAvatarForAuthor(r.author, r.initials, avatarCache) || null,
    time: r.time,
    text: r.text
  }));

  dmRows.forEach((r) => {
    results.push({
      id: r.id,
      channelId: `dm:${r.dmId}`,
      channelName: r.dmName || 'Direct Message',
      author: r.author,
      initials: r.initials,
      avatarUrl: r.avatarUrl || resolveAvatarForAuthor(r.author, r.initials, avatarCache) || null,
      time: r.time,
      text: r.text
    });
  });

  res.json(results);
});

// create a new message in a channel
app.post('/api/channels/:channelId/messages', async (req, res) => {
  const { channelId } = req.params;
  const { author = 'You', initials = 'YOU', text, avatarUrl, attachments = [] } = req.body || {};
  const requesterId = getRequesterId(req);
  const userLang = requesterId ? getUserNativeLanguage(requesterId) : 'en';

  const attachmentHtml = Array.isArray(attachments)
    ? attachments
        .map((att) => {
          const url = att && att.url ? String(att.url) : '';
          const safeUrl = escapeHtml(url);
          const name = att && att.originalName ? escapeHtml(att.originalName) : 'attachment';
          const mime = att && att.mimeType ? escapeHtml(att.mimeType) : 'application/octet-stream';
          const isVideo = mime.startsWith('video/');
          const isAudio = mime.startsWith('audio/');
          const iconClass = isVideo
            ? 'fa-solid fa-video'
            : isAudio
              ? 'fa-solid fa-microphone'
              : 'fa-regular fa-file-lines';
          const playAction = `<button type="button" class="att-btn att-play" aria-label="Play audio" title="Play audio"><i class="fa-solid fa-play"></i></button>`;
          const openAction = isAudio
            ? playAction
            : `<a class="att-btn" href="${safeUrl}" target="_blank" rel="noopener noreferrer" title="Open"><i class="fa-solid fa-arrow-up-right-from-square"></i></a>`;
          const downloadAction = `<a class="att-btn att-download" href="${safeUrl}" download title="Download"><i class="fa-solid fa-download"></i></a>`;
          const optionsMenu = isAudio
            ? `
              <div class="att-options">
                <button type="button" class="att-btn att-options-toggle" aria-label="Attachment options" title="Attachment options">
                  <i class="fa-solid fa-ellipsis-vertical"></i>
                </button>
                <div class="att-options-menu" role="menu">
                  <button type="button" class="att-options-item" data-action="copy" title="Copy link" aria-label="Copy link">
                    <i class="fa-regular fa-copy"></i>
                  </button>
                  <button type="button" class="att-options-item" data-action="share" title="Share" aria-label="Share">
                    <i class="fa-solid fa-share-nodes"></i>
                  </button>
                  <button type="button" class="att-options-item" data-action="edit" title="Edit message" aria-label="Edit message">
                    <i class="fa-solid fa-pen-to-square"></i>
                  </button>
                  <button type="button" class="att-options-item" data-action="delete" title="Delete message" aria-label="Delete message">
                    <i class="fa-solid fa-trash"></i>
                  </button>
                </div>
              </div>
            `
            : '';
          const preview = isAudio
            ? `<div class="att-preview">
                <div class="att-audio-ui" data-audio-url="${safeUrl}">
                  <button type="button" class="att-audio-btn" aria-label="Play audio">
                    <i class="fa-solid fa-play"></i>
                  </button>
                  <canvas class="att-wave"></canvas>
                </div>
                <audio class="att-media att-audio-hidden" preload="metadata" src="${safeUrl}"></audio>
              </div>`
            : isVideo
              ? `<div class="att-preview"><video class="att-media att-video" controls preload="metadata" src="${safeUrl}" playsinline></video></div>`
              : '';
          return `
            <div class="att-card${isAudio ? ' att-card-audio' : ''}" data-mime="${mime}" data-att-url="${safeUrl}">
              <div class="att-top">
                ${isAudio ? '' : `<div class="att-ic"><i class="${iconClass}"></i></div>`}
                <div class="att-meta">
                  <div class="att-name" title="${name}">${name}</div>
                  <div class="att-sub">${mime}</div>
                </div>
              <div class="att-actions">
                <div class="att-actions-left">
                  ${openAction}
                </div>
                <div class="att-actions-right">
                  ${downloadAction}
                  ${optionsMenu}
                </div>
              </div>
              </div>
              ${preview}
            </div>
          `;
        })
        .join('<br>')
    : '';

  const cleanText = String(text || '').trim();
  const finalText = cleanText || attachmentHtml;

  if (!finalText) {
    return res.status(400).json({ error: 'Text or attachment is required' });
  }

  const channel = db
    .prepare(
      'SELECT id, name, topic, category, workspace_id AS workspaceId FROM channels WHERE id = ?'
    )
    .get(channelId);
  if (!channel) {
    return res.status(404).json({ error: 'Channel not found' });
  }

  const cleanPlain = String(cleanText || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  let originalLanguage = normalizeLanguageCode(
    req.body?.originalLanguage || req.body?.language || userLang
  );
  const provider = String(process.env.TRANSLATION_PROVIDER || '').toLowerCase();
  if ((!originalLanguage || originalLanguage === 'auto') && provider === 'google' && cleanPlain) {
    try {
      originalLanguage = await detectViaGoogle(cleanPlain);
    } catch (_err) {
      originalLanguage = 'en';
    }
  }
  if (!originalLanguage || originalLanguage === 'auto') {
    originalLanguage = 'en';
  }

  const id = generateId('m');
  const time = timeHHMM();
  const alt = 0; // keep avatar spacing simple for now
  const fallbackAvatar = avatarUrl || resolveAvatarForAuthor(author, initials);
  const createdAt = nowISOString();

  db.prepare(
    `INSERT INTO messages (id, channel_id, author, initials, avatar_url, time, text, alt, created_at, original_language)
     VALUES (@id, @channel_id, @author, @initials, @avatar_url, @time, @text, @alt, @created_at, @original_language)`
  ).run({
    id,
    channel_id: channelId,
    author,
    initials,
    avatar_url: fallbackAvatar || null,
    time,
    text: finalText,
    alt,
    created_at: createdAt,
    original_language: originalLanguage
  });

  // Register attachments into files registry
  const workspaceId = channel.workspaceId || 'default';
  const purpose = inferPurposeFromChannel(channel.name, channel.topic);
  const uploaderId = getRequesterId(req) || author || 'anon';
  if (Array.isArray(attachments) && attachments.length) {
    const ins = db.prepare(`
      INSERT OR IGNORE INTO files_registry
      (file_id, workspace_id, channel_id, message_id, uploader_id, purpose, file_name, mime, size_bytes, url, pinned, deleted, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, datetime('now'), datetime('now'))
    `);

    for (const att of attachments) {
      const url = att?.url ? String(att.url) : '';
      if (!url) continue;
      const name = att?.originalName ? String(att.originalName) : 'attachment';
      const mime = att?.mimeType ? String(att.mimeType) : 'application/octet-stream';
      const sizeBytes = Number(att?.size || 0) || 0;
      const fileId = computeFileIdFromMeta({ url, channelId, messageId: id, name });
      ins.run(fileId, workspaceId, channelId, id, uploaderId, purpose, name, mime, sizeBytes, url);
    }
  }

  const message = {
    id,
    author,
    initials,
    avatarUrl: fallbackAvatar || null,
    time,
    text: finalText,
    originalLanguage: originalLanguage,
    alt: !!alt,
    createdAt,
    reactions: [],
    replies: []
  };

  broadcastEvent('channel_message_created', { channelId, message });

  res.status(201).json(message);
});

app.get('/api/channels/:channelId/announcements', (req, res) => {
  const { channelId } = req.params;
  const channel = db
    .prepare(
      'SELECT id, name, topic, workspace_id AS workspaceId FROM channels WHERE id = ?'
    )
    .get(channelId);
  if (!channel) {
    return res.status(404).json({ error: 'Channel not found' });
  }
  if (!isChannelRowAnnouncement(channel)) {
    return res.status(403).json({ error: 'Not an announcements channel' });
  }
  const user = getAuthedUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  const userId = String(user.id || user.userId || user.user_id || '');
  const rows = db
    .prepare(
      `
      SELECT
        a.id,
        a.title,
        a.status,
        a.priority,
        a.content,
        a.author,
        a.created_at,
        a.read_count,
        EXISTS (
          SELECT 1
          FROM announcement_reads ar
          WHERE ar.announcement_id = a.id
            AND ar.user_id = ?
        ) AS read_by_user
      FROM announcements a
      WHERE channel_id = ?
      ORDER BY created_at ASC
    `
    )
    .all(userId, channelId);
  const results = rows.map((row) => ({
    id: row.id,
    channelId,
    workspaceId: channel.workspaceId || 'default',
    title: row.title,
    status: row.status,
    priority: row.priority,
    content: row.content,
    author: row.author,
    createdAt: row.created_at,
    readCount: Number(row.read_count || 0),
    readByUser: !!row.read_by_user
  }));
  res.json(results);
});

app.post('/api/channels/:channelId/announcements', (req, res) => {
  const { channelId } = req.params;
  const channel = db
    .prepare(
      'SELECT id, name, topic, workspace_id AS workspaceId FROM channels WHERE id = ?'
    )
    .get(channelId);
  if (!channel) {
    return res.status(404).json({ error: 'Channel not found' });
  }
  if (!isChannelRowAnnouncement(channel)) {
    return res.status(403).json({ error: 'Not an announcements channel' });
  }
  const user = getAuthedUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  const title = String(req.body?.title || '').trim();
  const status = String(req.body?.status || 'General').trim();
  const priority = String(req.body?.priority || 'Normal').trim();
  const content = String(req.body?.content || '').trim();
  if (!title) {
    return res.status(400).json({ error: 'Title is required' });
  }
  const id = generateId('ann');
  const createdAt = nowISOString();
  const author =
    String(user.name || user.username || user.email || 'School Administration').trim() ||
    'School Administration';
  db.prepare(
    `
    INSERT INTO announcements
    (id, channel_id, workspace_id, title, status, priority, content, author, created_at, read_count)
    VALUES (@id, @channel_id, @workspace_id, @title, @status, @priority, @content, @author, @created_at, @read_count)
  `
  ).run({
    id,
    channel_id: channelId,
    workspace_id: channel.workspaceId || 'default',
    title,
    status,
    priority,
    content,
    author,
    created_at: createdAt,
    read_count: 0
  });
  const announcement = {
    id,
    channelId,
    workspaceId: channel.workspaceId || 'default',
    title,
    status,
    priority,
    content,
    author,
    createdAt,
    readByUser: false
  };
  broadcastEvent('channel_announcement_created', { channelId, announcement });
  res.status(201).json(announcement);
});

app.post('/api/announcements/:announcementId/read', (req, res) => {
  const { announcementId } = req.params;
  const user = getAuthedUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const existing = db
    .prepare('SELECT id, channel_id, read_count FROM announcements WHERE id = ?')
    .get(announcementId);
  if (!existing) {
    return res.status(404).json({ error: 'Announcement not found' });
  }

  const userId = String(user.id || user.userId || user.user_id || 'unknown');
  const readNow = nowISOString();
  const insertResult = db
    .prepare(
      `
      INSERT OR IGNORE INTO announcement_reads (announcement_id, user_id, created_at)
      VALUES (?, ?, ?)
    `
    )
    .run(announcementId, userId, readNow);

  if (insertResult.changes === 0) {
    const payload = {
      id: existing.id,
      channelId: existing.channel_id,
      readCount: Number(existing.read_count || 0)
    };
    return res.json(payload);
  }

  db.prepare('UPDATE announcements SET read_count = read_count + 1 WHERE id = ?').run(announcementId);
  const updated = db
    .prepare('SELECT id, channel_id, read_count FROM announcements WHERE id = ?')
    .get(announcementId);
  if (!updated) {
    return res.status(500).json({ error: 'Could not update announcement' });
  }
  const payload = {
    id: updated.id,
    channelId: updated.channel_id,
    readCount: Number(updated.read_count || 0)
  };
  broadcastEvent('channel_announcement_updated', { channelId: updated.channel_id, announcement: payload });
  res.json(payload);
});

app.delete('/api/channels/:channelId/announcements/:announcementId', (req, res) => {
    const { channelId, announcementId } = req.params;
    const channel = db
      .prepare('SELECT id, name, topic, workspace_id AS workspaceId FROM channels WHERE id = ?')
      .get(channelId);
    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' });
    }
    if (!isChannelRowAnnouncement(channel)) {
      return res.status(403).json({ error: 'Not an announcements channel' });
    }
    const user = getAuthedUser(req);
    if (!user) return res.status(401).json({ error: 'Not authenticated' });
    const normalizedRole = String(user.role || '').toLowerCase();
    if (!['super_admin', 'admin', 'school_admin'].includes(normalizedRole)) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    const existing = db
      .prepare('SELECT id, channel_id FROM announcements WHERE id = ?')
      .get(announcementId);
    if (!existing) {
      return res.status(404).json({ error: 'Announcement not found' });
    }
    if (String(existing.channel_id) !== String(channelId)) {
      return res.status(400).json({ error: 'Announcement does not belong to this channel' });
    }
    const result = db.prepare('DELETE FROM announcements WHERE id = ?').run(announcementId);
    if (!result || !result.changes) {
      return res.status(500).json({ error: 'Could not delete announcement' });
    }
    broadcastEvent('channel_announcement_deleted', {
      channelId,
      announcementId
    });
    res.json({ id: announcementId, channelId });
  }
);

app.get('/api/channels/:channelId/culture-pref', (req, res) => {
  const authed = getAuthedUser(req);
  if (!authed) return res.status(401).json({ error: 'unauthorized' });

  const { channelId } = req.params;

  const row = db
    .prepare(`
      SELECT culture_read_language AS readLang
      FROM user_channel_prefs
      WHERE user_id = ? AND channel_id = ?
    `)
    .get(authed.id, channelId);

  res.json({ channelId, readLang: row?.readLang || authed.native_language || 'en' });
});

app.post('/api/channels/:channelId/culture-pref', (req, res) => {
  const authed = getAuthedUser(req);
  if (!authed) return res.status(401).json({ error: 'unauthorized' });

  const { channelId } = req.params;
  const readLang = normalizeLanguageCode(req.body?.readLang || 'en');

  db.prepare(`
    INSERT INTO user_channel_prefs (user_id, channel_id, culture_read_language, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(user_id, channel_id)
    DO UPDATE SET culture_read_language = excluded.culture_read_language,
                  updated_at = datetime('now')
  `).run(authed.id, channelId, readLang);

  res.json({ ok: true, channelId, readLang });
});

// update message text (author-only)
app.patch('/api/messages/:messageId', (req, res) => {
  const { messageId } = req.params;
  const { text, author } = req.body || {};
  if (!text || !String(text).trim()) {
    return res.status(400).json({ error: 'Text is required' });
  }
  const msg = db
    .prepare(
      'SELECT id, channel_id AS channelId, author, initials, avatar_url AS avatarUrl, time, text AS oldText, alt FROM messages WHERE id = ?'
    )
    .get(messageId);
  if (!msg) {
    return res.status(404).json({ error: 'Message not found' });
  }
  if (author && msg.author && msg.author !== author) {
    return res.status(403).json({ error: 'Only the author can edit this message' });
  }

  const replyCount = db.prepare('SELECT COUNT(*) AS c FROM replies WHERE message_id = ?').get(messageId).c;
  const reactionCount = db
    .prepare('SELECT SUM(count) AS c FROM message_reactions WHERE message_id = ?')
    .get(messageId).c;
  if (replyCount > 0 || (reactionCount || 0) > 0) {
    return res.status(400).json({ error: 'Cannot edit a message with replies or reactions' });
  }

  db.prepare('UPDATE messages SET text = ? WHERE id = ?').run(String(text).trim(), messageId);

  const updated = {
    ...msg,
    text: String(text).trim()
  };

  broadcastEvent('message_updated', { channelId: msg.channelId, message: updated });

  res.json(updated);
});

// delete message (author-only)
function roleMatches(user, target) {
  if (!user) return false;
  const roles = [user.role, user.userRole]
    .filter(Boolean)
    .map((r) => String(r).toLowerCase());
  return roles.includes(target);
}

function isTeacherRole(user) {
  return roleMatches(user, "teacher");
}

function isWorkspaceAdmin(user) {
  return roleMatches(user, "admin") || roleMatches(user, "school_admin") || roleMatches(user, "super_admin");
}

function canManageWorkspaceSettings(user) {
  const r = String(user?.role || "").toLowerCase();
  return ["admin", "school_admin", "super_admin"].includes(r);
}

function getWorkspaceAdminEmail(workspaceId) {
  const row = db
    .prepare(
      `
      SELECT email
      FROM users
      WHERE workspace_id = ?
        AND lower(role) = 'school_admin'
        AND email IS NOT NULL
        AND trim(email) != ''
      ORDER BY created_at ASC
      LIMIT 1
    `
    )
    .get(workspaceId);
  return String(row?.email || "").trim();
}

function parseOpeningHoursJson(value) {
  if (!value) return "";
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "";
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === "string") return parsed;
      if (typeof parsed === "object" && parsed !== null) {
        if (typeof parsed.text === "string") return parsed.text;
        if (typeof parsed.value === "string") return parsed.value;
        return JSON.stringify(parsed);
      }
    } catch (_err) {
      return trimmed;
    }
  }
  if (typeof value === "object" && value !== null) {
    if (typeof value.text === "string") return value.text;
    if (typeof value.value === "string") return value.value;
    return JSON.stringify(value);
  }
  return String(value).trim();
}

function sanitizeOpeningHoursDay(entry) {
  if (!entry || typeof entry !== "object") return null;
  const dayKey = String(entry.day || "").toLowerCase();
  if (!dayKey) return null;
  const normalizedStatus = (() => {
    const candidate = String(entry.status || "open").toLowerCase();
    if (["open", "half-open", "closed"].includes(candidate)) {
      return candidate;
    }
    return "open";
  })();
  return {
    day: dayKey,
    status: normalizedStatus,
    openTime: typeof entry.openTime === "string" ? entry.openTime.trim() : "",
    closeTime: typeof entry.closeTime === "string" ? entry.closeTime.trim() : "",
    breakStart: typeof entry.breakStart === "string" ? entry.breakStart.trim() : "",
    breakEnd: typeof entry.breakEnd === "string" ? entry.breakEnd.trim() : ""
  };
}

function sanitizeOpeningHoursDetails(value) {
  if (!value) return null;
  const rawDays = Array.isArray(value.days)
    ? value.days
    : Array.isArray(value)
    ? value
    : [];
  const sanitizedDays = rawDays
    .map(sanitizeOpeningHoursDay)
    .filter(Boolean);
  if (!sanitizedDays.length) return null;
  return { days: sanitizedDays };
}

function parseOpeningHoursDetails(value) {
  if (!value) return null;
  let parsed = value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    try {
      parsed = JSON.parse(trimmed);
    } catch (_err) {
      return null;
    }
  }
  if (Array.isArray(parsed)) {
    return sanitizeOpeningHoursDetails(parsed);
  }
  if (typeof parsed === "object" && parsed !== null) {
    if (Array.isArray(parsed.days)) {
      return sanitizeOpeningHoursDetails(parsed);
    }
    if (parsed.details) {
      return sanitizeOpeningHoursDetails(parsed.details);
    }
  }
  return null;
}

const EMAIL_OPENING_HOURS_DAYS = [
  { key: "monday", label: "Monday" },
  { key: "tuesday", label: "Tuesday" },
  { key: "wednesday", label: "Wednesday" },
  { key: "thursday", label: "Thursday" },
  { key: "friday", label: "Friday" },
  { key: "saturday", label: "Saturday" },
  { key: "sunday", label: "Sunday" }
];
const EMAIL_OPENING_HOURS_STATUS_LABELS = {
  open: "Open",
  "half-open": "Half open",
  closed: "Closed"
};

function buildEmailOpeningHoursLines(profileRow = {}) {
  const details = parseOpeningHoursDetails(profileRow.opening_hours_json);
  const detailDays = Array.isArray(details?.days) ? details.days : [];
  const formatEntry = (entry, day) => {
    if (!entry) {
      return { label: day.label, detail: "Hours not set" };
    }
    if (entry.status === "closed") {
      return { label: day.label, detail: "Closed" };
    }
    const statusLabel =
      EMAIL_OPENING_HOURS_STATUS_LABELS[entry.status] ||
      EMAIL_OPENING_HOURS_STATUS_LABELS.open;
    const hasTimes = entry.openTime && entry.closeTime;
    let detail = hasTimes ? `${entry.openTime} - ${entry.closeTime}` : statusLabel;
    if (entry.breakStart && entry.breakEnd) {
      detail += ` · Break ${entry.breakStart} - ${entry.breakEnd}`;
    }
    return { label: day.label, detail };
  };

  const dayInfos = detailDays.length
    ? (() => {
        const entryMap = new Map(
          detailDays.map((entry) => [String(entry.day || "").toLowerCase(), entry])
        );
        return EMAIL_OPENING_HOURS_DAYS.map((day) => {
          const entry = entryMap.get(day.key);
          return formatEntry(entry, day);
        });
      })()
    : [];

  if (!dayInfos.length) {
    const fallback = parseOpeningHoursJson(profileRow.opening_hours_json);
    if (fallback) {
      return [{ label: "", detail: fallback }];
    }
    return [];
  }

  const groups = [];
  let current = null;
  dayInfos.forEach((info) => {
    if (!current) {
      current = { start: info.label, end: info.label, detail: info.detail };
      return;
    }
    if (current.detail === info.detail) {
      current.end = info.label;
    } else {
      groups.push(current);
      current = { start: info.label, end: info.label, detail: info.detail };
    }
  });
  if (current) {
    groups.push(current);
  }

  return groups.map((group) => {
    const range =
      group.start === group.end ? group.start : `${group.start} - ${group.end}`;
    return {
      label: range,
      detail: group.detail
    };
  });
}

function buildEmailSignatureBlock({ profileRow = {}, workspaceRow = {}, settings = {} }) {
  const addressLines = [];
  const street = String(profileRow.street || "").trim();
  const house = String(profileRow.house_number || "").trim();
  const line1 = [street, house].filter(Boolean).join(" ").trim();
  const zip = String(profileRow.postal_code || "").trim();
  const city = String(profileRow.city || "").trim();
  const line2 = [zip, city].filter(Boolean).join(" ").trim();
  const country = String(profileRow.country || profileRow.state || "").trim();

  if (line1) addressLines.push(line1);
  if (line2) addressLines.push(line2);
  if (country) addressLines.push(country);

  const hoursLines = buildEmailOpeningHoursLines(profileRow);
  const phone = String(profileRow.phone || "").trim();
  const replyEmail = resolveWorkspaceContactEmail({
    profileRow,
    workspaceRow: {
      ...workspaceRow,
      admin_email: String(settings.reply_to_email || workspaceRow.admin_email || "").trim()
    }
  });
  const registrationDetails = String(profileRow.registration_details || "").trim();
  const contactLines = [];
  if (phone) contactLines.push(`Phone: ${phone}`);
  if (replyEmail) contactLines.push(`Email: ${replyEmail}`);

  const sections = [];
  if (hoursLines.length) {
    sections.push(`
      <div style="margin-bottom:10px">
        <strong style="display:block;margin-bottom:4px;font-size:13px;color:#0f172a">Opening hours</strong>
        ${hoursLines
          .map((entry) => {
            const label = entry.label || "";
            const detail = entry.detail || "";
            return `<div style="font-size:13px;color:#475569;line-height:1.4">${escapeHtml(label)}${label && detail ? ": " : ""}${escapeHtml(detail)}</div>`;
          })
          .join("")}
      </div>
    `);
  }
  if (addressLines.length) {
    const singleAddress = addressLines.filter(Boolean).join(", ");
    sections.push(`
      <div style="margin-bottom:10px">
        <strong style="display:block;margin-bottom:4px;font-size:13px;color:#0f172a">Address</strong>
        <div style="font-size:13px;color:#475569;line-height:1.4">${escapeHtml(singleAddress)}</div>
      </div>
    `);
  }
  if (contactLines.length) {
    const contactLine = contactLines.filter(Boolean).join(" | ");
    sections.push(`
      <div style="margin-bottom:0">
        <strong style="display:block;margin-bottom:4px;font-size:13px;color:#0f172a">Contact</strong>
        <div style="font-size:13px;color:#475569;line-height:1.4">${escapeHtml(contactLine)}</div>
      </div>
    `);
  }
  if (registrationDetails) {
    sections.push(`
      <div style="margin-bottom:0">
        <strong style="display:block;margin-bottom:4px;font-size:13px;color:#0f172a">Registration</strong>
        <div style="font-size:13px;color:#475569;line-height:1.4">${escapeHtml(registrationDetails)}</div>
      </div>
    `);
  }

  const boxHtml = sections.length
    ? `<div style="border-radius:14px;padding:14px;margin-top:18px">${sections.join("")}</div>`
    : "";

  return boxHtml;
}

const LIVE_SCOPE_VALUES = new Set(["today", "week", "all"]);
const LIVE_AUDIENCE_VALUES = new Set(["general", "teachers"]);

function canManageLiveSessions(user) {
  if (!user) return false;
  return isTeacherRole(user) || isWorkspaceAdmin(user);
}

function formatDateOnly(date = new Date()) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function determineLiveScopeRange(scope = "today") {
  const normalized = String(scope || "today").toLowerCase();
  const base = new Date();
  const start = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  let end = new Date(start);
  if (normalized === "week") {
    end.setDate(end.getDate() + 7);
  } else if (normalized === "all") {
    end = null;
  }
  return {
    scope: LIVE_SCOPE_VALUES.has(normalized) ? normalized : "today",
    start: formatDateOnly(start),
    end: end ? formatDateOnly(end) : null
  };
}

function normalizeAudience(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const raw = String(value).toLowerCase();
  return LIVE_AUDIENCE_VALUES.has(raw) ? raw : null;
}

function formatLiveSessionScheduleLabel(session) {
  if (!session || !session.date) return "";
  const [year, month, day] = String(session.date || "").split("-");
  let dateLabel = session.date;
  if (year && month && day) {
    const parsed = new Date(Number(year), Number(month) - 1, Number(day));
    if (!Number.isNaN(parsed.getTime())) {
      dateLabel = parsed.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric"
      });
    }
  }
  const timeParts = [];
  if (session.start_time) timeParts.push(session.start_time);
  if (session.end_time) timeParts.push(session.end_time);
  const timeLabel = timeParts.join(" - ");
  return [dateLabel, timeLabel].filter(Boolean).join(" · ");
}

function buildLiveSessionAnnouncementText(session, channel, variant = "scheduled") {
  if (!session) return "";
  const title = escapeHtml(session.title || "Live Class");
  const className = escapeHtml(channel?.name || "Live Class");
  const scheduleLabel = escapeHtml(formatLiveSessionScheduleLabel(session));
  const notes = String(session.student_notes || "").trim();
  const notesHtml = notes ? `<div class="live-announcement-notes">${escapeHtml(notes)}</div>` : "";
  const meetingUrl = String(session.meeting_url || "").trim();
  const safeUrl = meetingUrl ? escapeHtml(meetingUrl) : "";
  const linkHtml = meetingUrl
    ? `<div class="live-announcement-link"><a href="${safeUrl}" target="_blank" rel="noopener noreferrer">Tap to join meeting</a></div>`
    : "";
  const variantClass =
    variant === "cancelled"
      ? "live-announcement-card--cancelled"
      : variant === "updated"
      ? "live-announcement-card--updated"
      : "";
  const headerText =
    variant === "cancelled"
      ? `Meeting cancelled: ${title}`
      : variant === "updated"
      ? `Live class updated: ${title}`
      : `Live class scheduled: ${title}`;
  const statusText =
    variant === "cancelled" ? "Cancelled" : variant === "updated" ? "Updated session" : "Link ready";
  const statusClass =
    variant === "cancelled"
      ? "live-announcement-status--cancelled"
      : variant === "updated"
      ? "live-announcement-status--updated"
      : "live-announcement-status";
  return `
    <div class="live-announcement-card ${variantClass}">
      <div class="live-announcement-top">
        <div class="live-announcement-icon" aria-hidden="true"><i class="fa-solid fa-video"></i></div>
        <div>
          <div class="live-announcement-title">${headerText}</div>
          <div class="live-announcement-meta">
            <span class="live-announcement-channel">${className}</span>
            ${scheduleLabel ? `<span class="live-announcement-schedule">${scheduleLabel}</span>` : ""}
          </div>
        </div>
      </div>
      <div class="live-announcement-status ${statusClass}">${statusText}</div>
      ${linkHtml}
      ${notesHtml}
    </div>
  `;
}

function autopostLiveSessionMessage(session, user, options = {}) {
  if (!session || String(session.autopost_mode) !== "0") {
    return null;
  }
  const variant = String(options.variant || "scheduled").toLowerCase();
  const workspaceId = String(session.workspace_id || "default");
  const audience = String(session.audience || "").toLowerCase();
  const targetChannelIds = new Set();
  if (session.channel_id) {
    targetChannelIds.add(session.channel_id);
  }
  if (audience === "teachers" || audience === "general") {
    const teacherChannelId = ensureTeachersChannel(workspaceId);
    if (teacherChannelId) {
      targetChannelIds.add(teacherChannelId);
    }
  }
  if (audience === "general") {
    const classRows = db
      .prepare("SELECT id FROM channels WHERE workspace_id = ? AND lower(category) = 'classes'")
      .all(workspaceId);
    classRows.forEach((row) => {
      if (row?.id) {
        targetChannelIds.add(row.id);
      }
    });
  }
  if (!targetChannelIds.size) return null;

  const authorName =
    (user && (user.name || user.username || user.email)) || "Live Class";
  const initials = generateInitials(authorName) || "LC";
  const avatarUrl = resolveAvatarForAuthor(authorName, initials) || null;
  const language = normalizeLanguageCode(user?.native_language || user?.nativeLanguage || "en");
  const insertStmt = db.prepare(
    `INSERT INTO messages (id, channel_id, author, initials, avatar_url, time, text, alt, created_at, original_language)
     VALUES (@id, @channel_id, @author, @initials, @avatar_url, @time, @text, @alt, @created_at, @original_language)`
  );
  let postedMessage = null;
  targetChannelIds.forEach((channelId) => {
    const channel = db
      .prepare(
        "SELECT id, name, topic, category, workspace_id AS workspaceId FROM channels WHERE id = ?"
      )
      .get(channelId);
    if (!channel) return;
    const text = buildLiveSessionAnnouncementText(session, channel, variant);
    if (!text.trim()) return;
    const id = generateId("m");
    const time = timeHHMM();
    const createdAt = nowISOString();
    insertStmt.run({
      id,
      channel_id: channel.id,
      author: authorName,
      initials,
      avatar_url: avatarUrl || null,
      time,
      text,
      alt: 0,
      created_at: createdAt,
      original_language: language
    });
    const message = {
      id,
      author: authorName,
      initials,
      avatarUrl,
      time,
      text,
      originalLanguage: language,
      alt: false,
      createdAt,
      reactions: [],
      replies: []
    };
    broadcastEvent("channel_message_created", { channelId: channel.id, message });
    if (!postedMessage) {
      postedMessage = message;
    }
  });
  return postedMessage;
}

async function sendLiveSessionEmails({ workspaceId, channelId, session }) {
  if (!channelId) return { sent: 0, total: 0 };

  const settings =
    db.prepare('SELECT * FROM workspace_email_settings WHERE workspace_id = ?').get(workspaceId) || {};
  if (!settings.enabled) {
    return { sent: 0, total: 0 };
  }

  const workspaceRow =
    db.prepare('SELECT name, admin_email FROM workspaces WHERE id = ?').get(workspaceId) || {};
  const profileRow =
    db.prepare('SELECT * FROM workspace_profile WHERE workspace_id = ?').get(workspaceId) || {};
  const normalizedSettings = {
    ...settings,
    brand_school_name: String(settings.brand_school_name || workspaceRow.name || '').trim(),
    reply_to_email: String(settings.reply_to_email || workspaceRow.admin_email || '').trim(),
    footer_text: String(settings.footer_text || '').trim()
  };
  const replyTo = normalizedSettings.reply_to_email;
  const fromName = buildAutomatedEmailSenderName(
    normalizedSettings.brand_school_name || workspaceRow.name || '',
    'live_session_invite'
  );
  const chan = db.prepare('SELECT name FROM channels WHERE id = ?').get(channelId);
  const className = chan?.name || 'Class';
  const prefix = normalizedSettings.subject_prefix ? `${normalizedSettings.subject_prefix} ` : '';
  const subject = `${prefix}Live class: ${session.title || 'Session'} (${className})`;
  const whenParts = [];
  if (session.date) whenParts.push(session.date);
  if (session.start_time) whenParts.push(session.start_time + (session.end_time ? `–${session.end_time}` : ''));
  const when = whenParts.join(' ');

  const brandName = normalizedSettings.brand_school_name || workspaceRow.name || '';
  const signatureHtml = buildEmailSignatureBlock({
    profileRow,
    workspaceRow,
    settings: normalizedSettings
  });
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8"/>
        <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
        <title>${escapeHtml(subject)}</title>
      </head>
      <body style="margin:0;background:#fff;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial;color:#0f172a;">
        <div style="padding:18px;width:100%;box-sizing:border-box;">
          <div style="width:100%;margin:0">
            <div style="margin-bottom:16px;font-size:18px;font-weight:600;color:#1f2937">
              ${escapeHtml(brandLabel)}
            </div>
            <div style="border-radius:18px;background:#fff;box-shadow:0 20px 40px rgba(15,23,42,0.08);overflow:hidden;width:100%;box-sizing:border-box;">
              <div style="padding:18px">
                <div style="font-size:20px;font-weight:700;margin-bottom:8px;color:#0f172a">${escapeHtml(
                  session.title || 'Live class'
                )}</div>
                <div style="color:#475569;font-size:14px;margin-bottom:16px">
                  <strong style="font-weight:600;">Class:</strong> ${escapeHtml(className)} &middot;
                  <strong style="font-weight:600;">When:</strong> ${escapeHtml(when)}
                </div>
                <div>
                  <a href="${escapeHtml(session.meeting_url)}" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 18px;border-radius:12px;text-decoration:none;font-weight:700;font-size:15px">
                    Join live class
                  </a>
                </div>
                ${session.meeting_pass ? `<div style="margin-top:10px;color:#0f172a"><strong>Password:</strong> ${escapeHtml(
                  session.meeting_pass
                )}</div>` : ''}
                ${session.student_notes ? `<div style="margin-top:10px;color:#0f172a"><strong>Notes:</strong> ${escapeHtml(
                  session.student_notes
                )}</div>` : ''}
              </div>
            </div>
            <div style="margin-top:18px">
              ${signatureHtml}
            </div>
            <div style="margin-top:16px;color:#94a3b8;font-size:12px">
              Sent by ${escapeHtml(brandLabel)}.
            </div>
          </div>
        </div>
      </body>
    </html>`;

  const textParts = [
    "Live class scheduled",
    `School: ${brandName || className}`,
    `Class: ${className}`,
    `When: ${when}`,
    `Link: ${session.meeting_url || ''}`
  ];
  if (session.meeting_pass) {
    textParts.push(`Password: ${session.meeting_pass}`);
  }
  if (session.student_notes) {
    textParts.push(`Notes: ${session.student_notes}`);
  }
  const text = textParts.join("\n");

  const memberRecipientRows = db
    .prepare(`
    SELECT DISTINCT trim(u.email) AS email
    FROM channel_members cm
    JOIN users u ON u.id = cm.user_id
    WHERE cm.channel_id = ?
      AND u.email IS NOT NULL
      AND trim(u.email) != ''
  `)
    .all(channelId || '')
    .map((r) => r.email)
    .filter((e) => e && e.includes('@'));
  const adminEmail = getWorkspaceAdminEmail(workspaceId);
  const recipients = Array.from(
    new Set([
      ...memberRecipientRows,
      ...(adminEmail && adminEmail.includes('@') ? [adminEmail] : [])
    ])
  );

  if (!recipients.length) {
    return { sent: 0, total: 0 };
  }

  const insertEvent = db.prepare(`
    INSERT INTO email_events (id, workspace_id, event_type, to_email, subject, status, provider, error_message, meta_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const metaJson = JSON.stringify({ channelId, sessionId: session.id });

  let sent = 0;
  for (const to of recipients) {
    const eventId = generateId('ee');
    try {
      await sendPlatformEmail({ to, subject, html, text, replyTo, fromName });
      insertEvent.run(
        eventId,
        workspaceId,
        'live_session_invite',
        to,
        subject,
        'sent',
        providerName,
        '',
        metaJson
      );
      sent++;
    } catch (err) {
      console.error('Email send failed:', to, err?.message || err);
      insertEvent.run(
        eventId,
        workspaceId,
        'live_session_invite',
        to,
        subject,
        'failed',
        providerName,
        String(err?.message || err),
        metaJson
      );
    }
  }

  return { sent, total: recipients.length };
}

app.delete('/api/messages/:messageId', (req, res) => {
  const { messageId } = req.params;
  const { author } = req.body || {};
  const msg = db
    .prepare('SELECT id, channel_id AS channelId, author FROM messages WHERE id = ?')
    .get(messageId);
  if (!msg) {
    return res.status(404).json({ error: 'Message not found' });
  }
  const user = getAuthedUser(req);
  const canBypass = isWorkspaceAdmin(user) || isTeacherRole(user);
  if (!canBypass && author && msg.author && msg.author !== author) {
    return res.status(403).json({ error: 'Only the author can delete this message' });
  }

  const replyCount = db.prepare('SELECT COUNT(*) AS c FROM replies WHERE message_id = ?').get(messageId).c;
  const reactionCount = db
    .prepare('SELECT SUM(count) AS c FROM message_reactions WHERE message_id = ?')
    .get(messageId).c;
  if (!canBypass && (replyCount > 0 || (reactionCount || 0) > 0)) {
    return res.status(400).json({ error: 'Cannot delete a message with replies or reactions' });
  }

  db.prepare('DELETE FROM messages WHERE id = ?').run(messageId);
  if (isWorkspaceAdmin(user)) {
    audit('message.delete', req, {
      user,
      target: messageId,
      workspaceId: user.workspaceId || null,
      meta: { channelId: msg.channelId, author: msg.author, adminOverride: true }
    });
  }

  broadcastEvent('message_deleted', { channelId: msg.channelId, messageId });

  res.json({ ok: true, messageId, channelId: msg.channelId });
});

// create a reply in a thread
app.post('/api/channels/:channelId/messages/:messageId/replies', (req, res) => {
  const { channelId, messageId } = req.params;
  const { author = 'You', initials = 'YOU', text, avatarUrl } = req.body || {};

  if (!text || !String(text).trim()) {
    return res.status(400).json({ error: 'Text is required' });
  }

  const parent = db
    .prepare('SELECT id FROM messages WHERE id = ? AND channel_id = ?')
    .get(messageId, channelId);
  if (!parent) {
    return res.status(404).json({ error: 'Message not found' });
  }

  const id = generateId('r');
  const time = timeHHMM();
  const createdAt = nowIso();
  const fallbackAvatar = avatarUrl || resolveAvatarForAuthor(author, initials);

  if (repliesHasCreatedAt) {
    db.prepare(
      `INSERT INTO replies (id, message_id, author, initials, avatar_url, time, text, created_at)
       VALUES (@id, @message_id, @author, @initials, @avatar_url, @time, @text, @created_at)`
    ).run({
      id,
      message_id: messageId,
      author,
      initials,
      avatar_url: fallbackAvatar || null,
      time,
      text,
      created_at: createdAt
    });
  } else {
    db.prepare(
      `INSERT INTO replies (id, message_id, author, initials, avatar_url, time, text)
       VALUES (@id, @message_id, @author, @initials, @avatar_url, @time, @text)`
    ).run({
      id,
      message_id: messageId,
      author,
      initials,
      avatar_url: fallbackAvatar || null,
      time,
      text
    });
  }

  const reply = {
    id,
    author,
    initials,
    avatarUrl: fallbackAvatar || null,
    time,
    createdAt: repliesHasCreatedAt ? createdAt : null,
    text,
    reactions: []
  };

  broadcastEvent('thread_reply_created', { channelId, messageId, reply });

  res.status(201).json(reply);
});

/* ---------- Live Class Hub APIs ---------- */

app.get('/api/live-sessions', (req, res) => {
  const scopeParam = String(req.query.scope || 'today');
  const { start, end } = determineLiveScopeRange(scopeParam);
  const user = getAuthedUser(req);
  const workspaceId = workspaceIdFromRequest(req);
  const conditions = ['ls.workspace_id = ?'];
  const params = [workspaceId];
  if (start) {
    conditions.push('ls.date >= ?');
    params.push(start);
  }
  if (end) {
    conditions.push('ls.date <= ?');
    params.push(end);
  }

  if (!canManageLiveSessions(user)) {
    if (!user) {
      return res.json([]);
    }
    const channelRows = db
      .prepare('SELECT channel_id FROM channel_members WHERE user_id = ?')
      .all(user.id);
    const channelIds = channelRows.map((row) => row.channel_id);
    const audienceClauses = [];
    if (channelIds.length) {
      const placeholders = channelIds.map(() => '?').join(',');
      audienceClauses.push(`ls.channel_id IN (${placeholders})`);
      params.push(...channelIds);
    }
    audienceClauses.push("ls.audience = 'general'");
    conditions.push(`(${audienceClauses.join(' OR ')})`);
  }

  const rows = db
    .prepare(
      `SELECT ls.*, c.name AS channel_name
       FROM live_sessions ls
       LEFT JOIN channels c ON ls.channel_id = c.id
       WHERE ${conditions.join(' AND ')}
       ORDER BY ls.date ASC, ls.start_time ASC`
    )
    .all(...params);
  res.json(rows);
});

app.post('/api/live-sessions', async (req, res) => {
  const user = getAuthedUser(req);
  if (!canManageLiveSessions(user)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const payload = req.body || {};
  const {
    channel_id: channelId,
    channelId: channelIdAlt,
    title = 'Live Class',
    date,
    start_time: startTime,
    end_time: endTime,
    meeting_url: meetingUrl,
    meeting_pass: meetingPass,
    student_notes: studentNotes,
    status = 'scheduled',
    autopost_mode: autopostMode = 'none',
    audience
  } = payload;
  const notifyEmail = !!payload.notify_email;
  const normalizedAudience = normalizeAudience(audience);
  const requiresChannel = normalizedAudience === null;
  const channelIdValue = channelId || channelIdAlt;
  if ((requiresChannel && !channelIdValue) || !date || !startTime || !endTime || !meetingUrl) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  let channelRow = null;
  if (requiresChannel) {
    channelRow = db
      .prepare('SELECT id, workspace_id FROM channels WHERE id = ?')
      .get(channelIdValue);
    if (!channelRow) {
      return res.status(404).json({ error: 'Channel not found' });
    }
  }
  const sessionId = generateId('ls');
  const now = nowIso();
  const stmt = db.prepare(`
    INSERT INTO live_sessions
      (id, workspace_id, channel_id, title, date, start_time, end_time, meeting_url,
       meeting_pass, student_notes, status, autopost_mode, audience, created_by, created_at, updated_at)
    VALUES (@id, @workspace_id, @channel_id, @title, @date, @start_time, @end_time, @meeting_url,
            @meeting_pass, @student_notes, @status, @autopost_mode, @audience, @created_by, @created_at, @updated_at)
  `);
  const record = {
    id: sessionId,
    workspace_id: (channelRow && channelRow.workspace_id) || workspaceIdFromRequest(req),
    channel_id: requiresChannel ? channelIdValue : null,
    title: String(title || 'Live Class'),
    date,
    start_time: startTime,
    end_time: endTime,
    meeting_url: meetingUrl,
    meeting_pass: meetingPass || null,
    student_notes: studentNotes || null,
    status: String(status || 'scheduled'),
    autopost_mode: String(autopostMode || 'none'),
    audience: normalizedAudience,
    created_by: user?.id || null,
    created_at: now,
    updated_at: now
  };
  stmt.run(record);
  ensureLiveSessionCalendar(record);
  autopostLiveSessionMessage(record, user);
  if (notifyEmail) {
    try {
      await sendLiveSessionEmails({
        workspaceId: record.workspace_id,
        channelId: record.channel_id,
        session: record
      });
    } catch (err) {
      console.error('Failed to send live session emails', err?.message || err);
    }
  }
  res.status(201).json(record);
});

app.patch('/api/live-sessions/:sessionId', (req, res) => {
  const user = getAuthedUser(req);
  if (!canManageLiveSessions(user)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const { sessionId } = req.params;
  const existing = db.prepare('SELECT * FROM live_sessions WHERE id = ?').get(sessionId);
  if (!existing) {
    return res.status(404).json({ error: 'Session not found' });
  }
  const payload = req.body || {};
  const updates = {};
  const fields = [
    'channel_id',
    'title',
    'date',
    'start_time',
    'end_time',
    'meeting_url',
    'meeting_pass',
    'student_notes',
    'status',
    'autopost_mode',
    'audience'
  ];
  fields.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(payload, field)) {
      if (field === 'audience') {
        updates.audience = normalizeAudience(payload.audience);
      } else {
        updates[field] = payload[field];
      }
    }
  });
  const audienceCandidate = Object.prototype.hasOwnProperty.call(updates, 'audience')
    ? updates.audience
    : existing.audience;
  const normalizedAudience = normalizeAudience(audienceCandidate);
  if (normalizedAudience) {
    updates.channel_id = null;
    updates.audience = normalizedAudience;
  } else {
    const finalChannelId = updates.channel_id ?? existing.channel_id;
    if (!finalChannelId) {
      return res.status(400).json({ error: 'Channel is required for class sessions' });
    }
    updates.channel_id = finalChannelId;
    delete updates.audience;
  }
  if (!Object.keys(updates).length) {
    return res.status(400).json({ error: 'No fields to update' });
  }
  updates.updated_at = nowIso();
  const setClause = Object.keys(updates)
    .map((key) => `${key} = @${key}`)
    .join(', ');
  const stmt = db.prepare(`UPDATE live_sessions SET ${setClause} WHERE id = @id`);
  stmt.run({ id: sessionId, ...updates });
  const updated = db.prepare('SELECT * FROM live_sessions WHERE id = ?').get(sessionId);
  autopostLiveSessionMessage(updated, user, { variant: "updated" });
  ensureLiveSessionCalendar(updated);
  res.json(updated);
});

app.delete('/api/live-sessions/:sessionId', (req, res) => {
  const user = getAuthedUser(req);
  if (!canManageLiveSessions(user)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const { sessionId } = req.params;
  const existing = db.prepare('SELECT * FROM live_sessions WHERE id = ?').get(sessionId);
  if (!existing) {
    return res.status(404).json({ error: 'Session not found' });
  }
  autopostLiveSessionMessage(existing, user, { variant: "cancelled" });
  removeLiveSessionCalendar(sessionId);
  db.prepare('DELETE FROM live_sessions WHERE id = ?').run(sessionId);
  res.json({ ok: true, sessionId });
});

app.post('/api/live-sessions/:sessionId/join', (req, res) => {
  const { sessionId } = req.params;
  const session = db.prepare('SELECT * FROM live_sessions WHERE id = ?').get(sessionId);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  const user = getAuthedUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const now = nowIso();
  db.prepare(
    `INSERT INTO live_attendance (session_id, student_id, joined_at, status, updated_at)
     VALUES (?, ?, ?, 'present', ?)
     ON CONFLICT(session_id, student_id)
       DO UPDATE SET joined_at = excluded.joined_at, updated_at = excluded.updated_at`
  ).run(sessionId, user.id, now, now);
  res.json({ ok: true, sessionId, studentId: user.id, joinedAt: now });
});

app.get('/api/live-sessions/:sessionId/attendance', (req, res) => {
  const user = getAuthedUser(req);
  if (!canManageLiveSessions(user)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const { sessionId } = req.params;
  const session = db.prepare('SELECT * FROM live_sessions WHERE id = ?').get(sessionId);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  const rows = db
    .prepare(
      `SELECT la.*, u.name AS student_name
       FROM live_attendance la
       LEFT JOIN users u ON u.id = la.student_id
       WHERE la.session_id = ?
       ORDER BY u.name COLLATE NOCASE ASC`
    )
    .all(sessionId);
  res.json(rows);
});

app.post('/api/live-sessions/:sessionId/attendance', (req, res) => {
  const user = getAuthedUser(req);
  if (!canManageLiveSessions(user)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const { sessionId } = req.params;
  const session = db.prepare('SELECT * FROM live_sessions WHERE id = ?').get(sessionId);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  const records = Array.isArray(req.body?.records) ? req.body.records : [];
  if (!records.length) {
    return res.status(400).json({ error: 'Records are required' });
  }
  const now = nowIso();
  const stmt = db.prepare(`
    INSERT INTO live_attendance (session_id, student_id, joined_at, status, note, updated_at)
    VALUES (@sessionId, @studentId, @joinedAt, @status, @note, @updated_at)
    ON CONFLICT(session_id, student_id)
      DO UPDATE SET status = excluded.status, note = excluded.note, updated_at = excluded.updated_at
  `);
  const payloads = [];
  records.forEach((record) => {
    const studentId = record.studentId || record.student_id;
    if (!studentId) return;
    const status = record.status || 'unmarked';
    const note = record.note || null;
    const joinedAt = record.joinedAt || now;
    stmt.run({
      sessionId,
      studentId,
      joinedAt,
      status,
      note,
      updated_at: now
    });
    payloads.push({ sessionId, studentId, status, note, updatedAt: now });
  });
  res.json({ ok: true, updated: payloads.length, records: payloads });
});

app.get("/api/live-sessions/:sessionId/slides/stream", (req, res) => {
  const user = getAuthedUser(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const sessionId = String(req.params.sessionId);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  if (!slideClientsBySession.has(sessionId)) {
    slideClientsBySession.set(sessionId, new Set());
  }

  slideClientsBySession.get(sessionId).add(res);
  res.write(`event: ready\ndata: {"ok":true}\n\n`);

  req.on("close", () => {
    const set = slideClientsBySession.get(sessionId);
    if (set) {
      set.delete(res);
      if (!set.size) slideClientsBySession.delete(sessionId);
    }
  });
});

app.get("/api/live-sessions/:sessionId/slides/state", (req, res) => {
  const user = getAuthedUser(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const sessionId = String(req.params.sessionId);
  const row = db.prepare("SELECT * FROM slide_state WHERE live_session_id=?").get(sessionId);

  res.json(
    row || {
      live_session_id: sessionId,
      deck_url: null,
      page: 1,
      page_count: 1,
      updated_at: Date.now()
    }
  );
});

app.post("/api/live-sessions/:sessionId/slides/page", (req, res) => {
  const sessionId = String(req.params.sessionId);
  const user = getAuthedUser(req);

  if (!user) return res.status(401).json({ error: "Unauthorized" });
  if (!canManageLiveSessions(user)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const page = Math.max(1, Number(req.body?.page || 1));

  const existing = db.prepare("SELECT * FROM slide_state WHERE live_session_id=?").get(sessionId);

  const pageCount = existing?.page_count || 1;
  const safePage = Math.min(page, pageCount);
  const now = Date.now();

  db.prepare(`
    INSERT INTO slide_state (live_session_id, deck_url, page, page_count, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(live_session_id) DO UPDATE SET
      page=excluded.page,
      updated_at=excluded.updated_at
  `).run(
    sessionId,
    existing?.deck_url || null,
    safePage,
    pageCount,
    now
  );

  const updated = db.prepare("SELECT * FROM slide_state WHERE live_session_id=?").get(sessionId);

  broadcastSse(sessionId, "slide", updated);

  res.json(updated);
});

app.post("/api/live-sessions/:sessionId/slides/deck", (req, res) => {
  const sessionId = String(req.params.sessionId);
  const user = getAuthedUser(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  if (!canManageLiveSessions(user)) return res.status(403).json({ error: "Forbidden" });

  const deckUrl = String(req.body?.deck_url || "").trim();
  const pageCount = Math.max(1, Number(req.body?.page_count || 1));
  if (!deckUrl) return res.status(400).json({ error: "deck_url required" });

  const now = Date.now();
  db.prepare(`
    INSERT INTO slide_state (live_session_id, deck_url, page, page_count, updated_at)
    VALUES (?, ?, 1, ?, ?)
    ON CONFLICT(live_session_id) DO UPDATE SET
      deck_url=excluded.deck_url,
      page=1,
      page_count=excluded.page_count,
      updated_at=excluded.updated_at
  `).run(sessionId, deckUrl, pageCount, now);

  const updated = db.prepare("SELECT * FROM slide_state WHERE live_session_id=?").get(sessionId);
  broadcastSse(sessionId, "slide", updated);

  res.json(updated);
});

app.post("/api/live-sessions/:sessionId/end", (req, res) => {
  const user = getAuthedUser(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  if (!canManageLiveSessions(user)) return res.status(403).json({ error: "Forbidden" });

  const sessionId = String(req.params.sessionId);
  broadcastSse(sessionId, "session", { type: "ended", sessionId, at: Date.now() });
  res.json({ ok: true, sessionId });
});

// DM thread reply
app.post('/api/dms/:dmId/messages/:messageId/replies', (req, res) => {
  const { dmId, messageId } = req.params;
  const { author = 'You', initials = 'YOU', text, avatarUrl } = req.body || {};
  const requester = getRequesterId(req);

  if (!text || !String(text).trim()) {
    return res.status(400).json({ error: 'Text is required' });
  }

  const dm = db.prepare('SELECT id, created_by FROM dms WHERE id = ?').get(dmId);
  if (!dm) return res.status(404).json({ error: 'DM not found' });

  if (requester) {
    const allowed = db
      .prepare('SELECT 1 FROM dm_members WHERE dm_id = ? AND user_id = ?')
      .get(dmId, requester);
    if (!allowed && dm.created_by !== requester) {
      return res.status(403).json({ error: 'Not a member of this DM' });
    }
  }

  const parent = db
    .prepare('SELECT id FROM dm_messages WHERE id = ? AND dm_id = ?')
    .get(messageId, dmId);
  if (!parent) {
    return res.status(404).json({ error: 'Message not found' });
  }

  const id = generateId('dr');
  const time = timeHHMM();
  const createdAt = nowIso();
  const fallbackAvatar = avatarUrl || resolveAvatarForAuthor(author, initials);

  if (dmRepliesHasCreatedAt) {
    db.prepare(
      `INSERT INTO dm_replies (id, dm_message_id, author, initials, avatar_url, time, text, created_at)
       VALUES (@id, @dm_message_id, @author, @initials, @avatar_url, @time, @text, @created_at)`
    ).run({
      id,
      dm_message_id: messageId,
      author,
      initials,
      avatar_url: fallbackAvatar || null,
      time,
      text,
      created_at: createdAt
    });
  } else {
    db.prepare(
      `INSERT INTO dm_replies (id, dm_message_id, author, initials, avatar_url, time, text)
       VALUES (@id, @dm_message_id, @author, @initials, @avatar_url, @time, @text)`
    ).run({
      id,
      dm_message_id: messageId,
      author,
      initials,
      avatar_url: fallbackAvatar || null,
      time,
      text
    });
  }

  const reply = {
    id,
    author,
    initials,
    avatarUrl: fallbackAvatar || null,
    time,
    createdAt: dmRepliesHasCreatedAt ? createdAt : null,
    text,
    reactions: []
  };

  broadcastEvent('dm_reply_created', { dmId, messageId, reply });

  res.status(201).json(reply);
});

/* ---------- NEW: REACTIONS API ---------- */

/**
 * Add / increment a reaction on a message.
 * POST /api/messages/:messageId/reactions  body: { emoji }
 * returns: { messageId, reactions: [{emoji,count}, ...] }
 */
app.post('/api/messages/:messageId/reactions', (req, res) => {
  const { messageId } = req.params;
  const { emoji, userId: rawUserId } = req.body || {};
  if (!emoji) {
    return res.status(400).json({ error: 'emoji is required' });
  }

  const userId = String(rawUserId || 'anonymous').trim() || 'anonymous';

  const msg = db.prepare('SELECT id FROM messages WHERE id = ?').get(messageId);
  if (!msg) {
    return res.status(404).json({ error: 'Message not found' });
  }

  const toggleReaction = db.transaction(() => {
    const exists = db
      .prepare(
        `
        SELECT 1 FROM message_reaction_users
        WHERE message_id = ? AND emoji = ? AND user_id = ?
      `
      )
      .get(messageId, emoji, userId);

    if (exists) {
      // remove user reaction and decrement count
      db.prepare(
        `DELETE FROM message_reaction_users
         WHERE message_id = ? AND emoji = ? AND user_id = ?`
      ).run(messageId, emoji, userId);

      db.prepare(
        `
        UPDATE message_reactions
        SET count = count - 1
        WHERE message_id = ? AND emoji = ? AND count > 0
      `
      ).run(messageId, emoji);

      db.prepare(
        `DELETE FROM message_reactions WHERE message_id = ? AND emoji = ? AND count <= 0`
      ).run(messageId, emoji);
    } else {
      // add user reaction and increment count
      db.prepare(
        `INSERT OR IGNORE INTO message_reaction_users (message_id, emoji, user_id)
         VALUES (?, ?, ?)`
      ).run(messageId, emoji, userId);

      const updated = db.prepare(
        `
        UPDATE message_reactions
        SET count = count + 1
        WHERE message_id = ? AND emoji = ?
      `
      ).run(messageId, emoji);
      if (!updated.changes) {
        db.prepare(
          `INSERT INTO message_reactions (message_id, emoji, count)
           VALUES (?, ?, 1)`
        ).run(messageId, emoji);
      }
    }
  });

  toggleReaction();

  const reactions = db
    .prepare('SELECT emoji, count FROM message_reactions WHERE message_id = ? ORDER BY emoji')
    .all(messageId);

  const payload = { messageId, reactions };
  broadcastEvent('message_reactions_updated', payload);

  res.json(payload);
});

/**
 * Add / increment a reaction on a reply.
 * POST /api/replies/:replyId/reactions  body: { emoji }
 * returns: { replyId, reactions: [{emoji,count}, ...] }
 */
app.post('/api/replies/:replyId/reactions', (req, res) => {
  const { replyId } = req.params;
  const { emoji, userId: rawUserId } = req.body || {};
  if (!emoji) {
    return res.status(400).json({ error: 'emoji is required' });
  }

  const userId = String(rawUserId || 'anonymous').trim() || 'anonymous';

  const rep = db.prepare('SELECT id FROM replies WHERE id = ?').get(replyId);
  if (!rep) {
    return res.status(404).json({ error: 'Reply not found' });
  }

  const toggleReaction = db.transaction(() => {
    const exists = db
      .prepare(
        `
        SELECT 1 FROM reply_reaction_users
        WHERE reply_id = ? AND emoji = ? AND user_id = ?
      `
      )
      .get(replyId, emoji, userId);

    if (exists) {
      db.prepare(
        `DELETE FROM reply_reaction_users
         WHERE reply_id = ? AND emoji = ? AND user_id = ?`
      ).run(replyId, emoji, userId);

      db.prepare(
        `
        UPDATE reply_reactions
        SET count = count - 1
        WHERE reply_id = ? AND emoji = ? AND count > 0
      `
      ).run(replyId, emoji);

      db.prepare(
        `DELETE FROM reply_reactions WHERE reply_id = ? AND emoji = ? AND count <= 0`
      ).run(replyId, emoji);
    } else {
      db.prepare(
        `INSERT OR IGNORE INTO reply_reaction_users (reply_id, emoji, user_id)
         VALUES (?, ?, ?)`
      ).run(replyId, emoji, userId);

      const updated = db.prepare(
        `
        UPDATE reply_reactions
        SET count = count + 1
        WHERE reply_id = ? AND emoji = ?
      `
      ).run(replyId, emoji);
      if (!updated.changes) {
        db.prepare(
          `INSERT INTO reply_reactions (reply_id, emoji, count)
           VALUES (?, ?, 1)`
        ).run(replyId, emoji);
      }
    }
  });

  toggleReaction();

  const reactions = db
    .prepare('SELECT emoji, count FROM reply_reactions WHERE reply_id = ? ORDER BY emoji')
    .all(replyId);

  const payload = { replyId, reactions };
  broadcastEvent('reply_reactions_updated', payload);

  res.json(payload);
});

// DM reply reactions
app.post('/api/dm-replies/:replyId/reactions', (req, res) => {
  const { replyId } = req.params;
  const { emoji, userId: rawUserId } = req.body || {};
  if (!emoji) {
    return res.status(400).json({ error: 'emoji is required' });
  }

  const userId = String(rawUserId || 'anonymous').trim() || 'anonymous';

  const rep = db.prepare('SELECT id FROM dm_replies WHERE id = ?').get(replyId);
  if (!rep) {
    return res.status(404).json({ error: 'Reply not found' });
  }

  const toggleReaction = db.transaction(() => {
    const exists = db
      .prepare(
        `
        SELECT 1 FROM dm_reply_reaction_users
        WHERE reply_id = ? AND emoji = ? AND user_id = ?
      `
      )
      .get(replyId, emoji, userId);

    if (exists) {
      db.prepare(
        `DELETE FROM dm_reply_reaction_users
         WHERE reply_id = ? AND emoji = ? AND user_id = ?`
      ).run(replyId, emoji, userId);

      db.prepare(
        `
        UPDATE dm_reply_reactions
        SET count = count - 1
        WHERE reply_id = ? AND emoji = ? AND count > 0
      `
      ).run(replyId, emoji);

      db.prepare(
        `DELETE FROM dm_reply_reactions WHERE reply_id = ? AND emoji = ? AND count <= 0`
      ).run(replyId, emoji);
    } else {
      db.prepare(
        `INSERT OR IGNORE INTO dm_reply_reaction_users (reply_id, emoji, user_id)
         VALUES (?, ?, ?)`
      ).run(replyId, emoji, userId);

      db.prepare(
        `
        INSERT INTO dm_reply_reactions (reply_id, emoji, count)
        VALUES (?, ?, 1)
        ON CONFLICT(reply_id, emoji) DO UPDATE SET count = count + 1
      `
      ).run(replyId, emoji);
    }
  });

  toggleReaction();

  const reactions = db
    .prepare('SELECT emoji, count FROM dm_reply_reactions WHERE reply_id = ? ORDER BY emoji')
    .all(replyId);

  res.json({ replyId, reactions });
});

/* ---------- DMs (unchanged, no reactions yet) ---------- */

app.get('/api/dms', (req, res) => {
  const requester = getRequesterId(req);
  let list;
  if (requester) {
    list = db
      .prepare(
        `SELECT d.id, d.name, d.initials, d.online
         FROM dms d
         LEFT JOIN dm_members m ON m.dm_id = d.id
         WHERE m.user_id = ? OR d.created_by = ?
         GROUP BY d.id
         ORDER BY d.name`
      )
      .all(requester, requester);
  } else {
    list = db.prepare('SELECT id, name, initials, online FROM dms ORDER BY name').all();
  }
  res.json(
    list.map((d) => ({
      ...d,
      online: !!d.online
    }))
  );
});

// create a DM entry (simple user-like record)
app.post('/api/dms', (req, res) => {
  const { name, initials, online = false } = req.body || {};
  const requester = getRequesterId(req);
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Name is required' });
  }

  const baseId = slugify(name.trim());
  let id = baseId || 'user';
  let suffix = 1;
  while (db.prepare('SELECT 1 FROM dms WHERE id = ?').get(id)) {
    id = `${baseId || 'user'}-${suffix++}`;
  }

  const dmRecord = {
    id,
    name: name.trim(),
    initials: (initials || name.trim().slice(0, 2)).toUpperCase(),
    online: online ? 1 : 0,
    created_by: requester || null
  };

  const insert = db.prepare('INSERT INTO dms (id, name, initials, online, created_by) VALUES (@id, @name, @initials, @online, @created_by)');
  const insertMember = db.prepare('INSERT OR IGNORE INTO dm_members (dm_id, user_id) VALUES (?, ?)');

  const tx = db.transaction(() => {
    insert.run(dmRecord);
    if (requester) insertMember.run(dmRecord.id, requester);
  });

  tx();

  res.status(201).json({ ...dmRecord, online: !!dmRecord.online });
});

// delete a DM (and its messages)
app.delete('/api/dms/:dmId', (req, res) => {
  const { dmId } = req.params;
  const requester = getRequesterId(req);
  const dm = db.prepare('SELECT id FROM dms WHERE id = ?').get(dmId);
  if (!dm) {
    return res.status(404).json({ error: 'DM not found' });
  }
  const creatorRow = db.prepare('SELECT created_by FROM dms WHERE id = ?').get(dmId);
  const creator = creatorRow ? (creatorRow.created_by || '') : '';
  if (!requester) {
    return res.status(403).json({ error: 'Not authorized to delete this DM' });
  }
  const isMember = db
    .prepare('SELECT 1 FROM dm_members WHERE dm_id = ? AND user_id = ?')
    .get(dmId, requester);
  if (creator && creator !== requester && !isMember) {
    return res.status(403).json({ error: 'Not authorized to delete this DM' });
  }
  db.prepare('DELETE FROM dm_messages WHERE dm_id = ?').run(dmId);
  db.prepare('DELETE FROM dm_members WHERE dm_id = ?').run(dmId);
  db.prepare('DELETE FROM dms WHERE id = ?').run(dmId);
  res.json({ ok: true });
});

// list DM members
app.get('/api/dms/:dmId/members', (req, res) => {
  const { dmId } = req.params;
  const requester = getRequesterId(req);
  const dm = db.prepare('SELECT id, created_by FROM dms WHERE id = ?').get(dmId);
  if (!dm) return res.status(404).json({ error: 'DM not found' });

  if (requester) {
    const allowed = db
      .prepare('SELECT 1 FROM dm_members WHERE dm_id = ? AND user_id = ?')
      .get(dmId, requester);
    if (!allowed && dm.created_by !== requester) {
      return res.status(403).json({ error: 'Not a member of this DM' });
    }
  }

  const members = db
    .prepare(
      `SELECT u.id, u.name, u.username, u.avatar_url AS avatarUrl, u.role AS role
       FROM dm_members m
       LEFT JOIN users u ON u.id = m.user_id
       WHERE m.dm_id = ?`
    )
    .all(dmId);

  res.json(members);
});

// add DM members (creator only)
app.post('/api/dms/:dmId/members', (req, res) => {
  const { dmId } = req.params;
  const { userIds = [] } = req.body || {};
  const requester = getRequesterId(req);
  if (!Array.isArray(userIds) || !userIds.length) {
    return res.status(400).json({ error: 'userIds required' });
  }
  const dm = db.prepare('SELECT id, created_by FROM dms WHERE id = ?').get(dmId);
  if (!dm) return res.status(404).json({ error: 'DM not found' });
  if (!requester || dm.created_by !== requester) {
    return res.status(403).json({ error: 'Only the creator can add members' });
  }

  const insertMember = db.prepare('INSERT OR IGNORE INTO dm_members (dm_id, user_id) VALUES (?, ?)');
  const tx = db.transaction(() => {
    userIds.forEach((uid) => {
      if (uid) insertMember.run(dmId, uid);
    });
  });
  tx();

  res.json({ ok: true });
});

// remove DM members (creator only)
app.delete('/api/dms/:dmId/members', (req, res) => {
  const { dmId } = req.params;
  const { userIds = [] } = req.body || {};
  const requester = getRequesterId(req);
  if (!Array.isArray(userIds) || !userIds.length) {
    return res.status(400).json({ error: 'userIds required' });
  }
  const dm = db.prepare('SELECT id, created_by FROM dms WHERE id = ?').get(dmId);
  if (!dm) return res.status(404).json({ error: 'DM not found' });
  if (!requester || dm.created_by !== requester) {
    return res.status(403).json({ error: 'Only the creator can remove members' });
  }

  const del = db.prepare('DELETE FROM dm_members WHERE dm_id = ? AND user_id = ?');
  const tx = db.transaction(() => {
    userIds.forEach((uid) => {
      if (uid) del.run(dmId, uid);
    });
  });
  tx();

  res.json({ ok: true });
});

app.get('/api/dms/:dmId/messages', (req, res) => {
  const { dmId } = req.params;
  const requester = getRequesterId(req);
  const dm = db.prepare('SELECT id, created_by FROM dms WHERE id = ?').get(dmId);
  if (!dm) {
    return res.status(404).json({ error: 'DM not found' });
  }

  if (requester) {
    const allowed = db
      .prepare('SELECT 1 FROM dm_members WHERE dm_id = ? AND user_id = ?')
      .get(dmId, requester);
    if (!allowed && dm.created_by !== requester) {
      return res.status(403).json({ error: 'Not a member of this DM' });
    }
  }

  const msgs = db
    .prepare('SELECT id FROM dm_messages WHERE dm_id = ? ORDER BY rowid')
    .all(dmId);

  const enriched = getMessagesForDm(dmId);
  res.json(enriched);
});

app.post('/api/dms/:dmId/messages', (req, res) => {
  const { dmId } = req.params;
  const { author = 'You', initials = 'YOU', text } = req.body || {};
  const requester = getRequesterId(req);
  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'Text is required' });
  }

  let dm = db.prepare('SELECT id, created_by FROM dms WHERE id = ?').get(dmId);
  if (!dm) {
    // auto-create DM entry if it does not exist
    const initialsFallback = dmId.slice(0, 2).toUpperCase();
    db.prepare('INSERT INTO dms (id, name, initials, online, created_by) VALUES (?, ?, ?, 0, ?)').run(
      dmId,
      dmId,
      initialsFallback,
      requester || null
    );
    dm = { id: dmId, created_by: requester || null };
  }

  if (requester) {
    const allowed = db
      .prepare('SELECT 1 FROM dm_members WHERE dm_id = ? AND user_id = ?')
      .get(dmId, requester);
    if (!allowed && dm.created_by !== requester) {
      return res.status(403).json({ error: 'Not a member of this DM' });
    }
  }

  if (requester) {
    const allowed = db
      .prepare('SELECT 1 FROM dm_members WHERE dm_id = ? AND user_id = ?')
      .get(dmId, requester);
    if (!allowed && dm.created_by !== requester) {
      return res.status(403).json({ error: 'Not a member of this DM' });
    }
  }

  const id = generateId('dm');
  const time = timeHHMM();

  const insertMsg = db.prepare(
    'INSERT INTO dm_messages (id, dm_id, author, initials, time, text) VALUES (@id, @dm_id, @author, @initials, @time, @text)'
  );
  const insertMember = db.prepare('INSERT OR IGNORE INTO dm_members (dm_id, user_id) VALUES (?, ?)');

  const tx = db.transaction(() => {
    insertMsg.run({
      id,
      dm_id: dmId,
      author,
      initials,
      time,
      text: text.trim()
    });
    if (requester) insertMember.run(dmId, requester);
  });
  tx();

  const msg = {
    id,
    author,
    initials,
    time,
    text: text.trim(),
    alt: false,
    reactions: [],
    replies: []
  };

  broadcastEvent('dm_message_created', { dmId, message: msg });

  res.status(201).json(msg);
});

// add / toggle reaction on DM message
app.post('/api/dms/:dmId/messages/:messageId/reactions', (req, res) => {
  const { dmId, messageId } = req.params;
  const { emoji, userId: rawUserId } = req.body || {};
  if (!emoji) {
    return res.status(400).json({ error: 'emoji is required' });
  }
  const userId = String(rawUserId || 'anonymous').trim() || 'anonymous';

  const dm = db.prepare('SELECT id, created_by FROM dms WHERE id = ?').get(dmId);
  if (!dm) return res.status(404).json({ error: 'DM not found' });

  const msg = db.prepare('SELECT id FROM dm_messages WHERE id = ? AND dm_id = ?').get(messageId, dmId);
  if (!msg) return res.status(404).json({ error: 'Message not found' });

  const toggleReaction = db.transaction(() => {
    const exists = db
      .prepare(
        `
        SELECT 1 FROM dm_message_reaction_users
        WHERE message_id = ? AND emoji = ? AND user_id = ?
      `
      )
      .get(messageId, emoji, userId);

    if (exists) {
      db.prepare(
        `DELETE FROM dm_message_reaction_users
         WHERE message_id = ? AND emoji = ? AND user_id = ?`
      ).run(messageId, emoji, userId);

      db.prepare(
        `
        UPDATE dm_message_reactions
        SET count = count - 1
        WHERE message_id = ? AND emoji = ? AND count > 0
      `
      ).run(messageId, emoji);

      db.prepare(
        `DELETE FROM dm_message_reactions WHERE message_id = ? AND emoji = ? AND count <= 0`
      ).run(messageId, emoji);
    } else {
      db.prepare(
        `INSERT OR IGNORE INTO dm_message_reaction_users (message_id, emoji, user_id)
         VALUES (?, ?, ?)`
      ).run(messageId, emoji, userId);

      db.prepare(
        `
        INSERT INTO dm_message_reactions (message_id, emoji, count)
        VALUES (?, ?, 1)
        ON CONFLICT(message_id, emoji) DO UPDATE SET count = count + 1
      `
      ).run(messageId, emoji);
    }
  });

  toggleReaction();

  const reactions = db
    .prepare('SELECT emoji, count FROM dm_message_reactions WHERE message_id = ? ORDER BY emoji')
    .all(messageId);

  const payload = { dmId, messageId, reactions };
  broadcastEvent('dm_message_reactions_updated', payload);
  res.json(payload);
});

// ---------- AI ASSISTANT (Local Ollama) ----------
const OLLAMA_URL = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3.1:8b";

function normalizeText(s = "") {
  return String(s || "").toLowerCase().trim();
}

function extractUpcomingEvents(context) {
  const cal = context && Array.isArray(context.calendar) ? context.calendar : [];
  return cal
    .map((e) => ({
      title: e.title || "",
      date: e.date || "",
      startTime: e.startTime || "",
      endTime: e.endTime || "",
      location: e.location || "",
      notes: e.notes || "",
      category: e.category || "",
      id: e.id || ""
    }))
    .filter((e) => e.title && e.date);
}

function pickRelevantEvents(userText, events, max = 8) {
  const q = normalizeText(userText);
  let keywords = q
    .replace(/[^\w\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3)
    .slice(0, 12);

  if (q.includes("ai")) {
    keywords = keywords.concat(["ai", "a1", "a2", "artificial"]);
  }

  const scored = events.map((ev) => {
    const hay = normalizeText(`${ev.title} ${ev.category} ${ev.location} ${ev.notes}`);
    let score = 0;
    for (const k of keywords) if (hay.includes(k)) score += 2;
    return { ev, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const best = scored.filter((x) => x.score > 0).slice(0, max).map((x) => x.ev);
  return best.length ? best : events.slice(0, Math.min(max, events.length));
}

async function warmOllama() {
  try {
    console.log("Warming Ollama...");
    const r = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        stream: false,
        prompt: "Say 'ready' فقط."
      })
    });
    const j = await r.json().catch(() => ({}));
    console.log("Ollama warm result:", (j.response || "").trim());
    globalThis.__OLLAMA_WARM = true;
  } catch (e) {
    console.log("Ollama warm failed (ok if Ollama not running yet):", e.message || e);
  }
}

function compactContext(ctx) {
  if (!ctx || typeof ctx !== "object") return "";
  const parts = [];
  if (ctx.selectedDate) parts.push(`Selected date: ${ctx.selectedDate}`);
  if (ctx.viewMode) parts.push(`Calendar view: ${ctx.viewMode}`);
  if (Array.isArray(ctx.calendar) && ctx.calendar.length) {
    const items = ctx.calendar.slice(0, 12).map((e) => {
      const ev = normalizeEvent(e);
      return `- ${[ev.title, ev.date, `${ev.startTime || ""}-${ev.endTime || ""}`.trim(), ev.location]
        .filter(Boolean)
        .join(" | ")}`;
    });
    parts.push("Upcoming calendar items:\n" + items.join("\n"));
  }
  if (Array.isArray(ctx.recentMessages) && ctx.recentMessages.length) {
    const msgs = ctx.recentMessages.slice(-12).map((m) =>
      `- ${m.from || "user"}: ${(m.text || "").slice(0, 180)}`
    );
    parts.push("Recent chat:\n" + msgs.join("\n"));
  }
  if (ctx.analytics && typeof ctx.analytics === "object") {
    const a = ctx.analytics;
    const analyticsLines = [];
    if (a.workspaceName) analyticsLines.push(`Workspace: ${a.workspaceName}`);
    else if (a.workspaceId) analyticsLines.push(`Workspace ID: ${a.workspaceId}`);
    if (a.students !== undefined)
      analyticsLines.push(
        `Students: ${a.students} (active ${a.activeStudents || 0}, inactive ${a.inactiveStudents || 0})`
      );
    if (a.teachers !== undefined) analyticsLines.push(`Teachers: ${a.teachers}`);
    if (a.admins !== undefined) analyticsLines.push(`Admins: ${a.admins}`);
    if (a.totalGroups !== undefined) {
      const counts = a.channelCounts || {};
      analyticsLines.push(
        `Groups: ${a.totalGroups} (classes ${counts.classes || 0}, clubs ${counts.clubs || 0}, exams ${counts.exams || 0})`
      );
    }
    const homeworkTotal = a.homeworkCreated ?? a.hwCreated;
    if (homeworkTotal !== undefined) {
      const avg = a.avgSubmissions !== undefined ? `${a.avgSubmissions} avg submissions` : "";
      const rate =
        a.completionRate !== undefined ? `completion ${a.completionRate}%` : "";
      analyticsLines.push(`Homework: ${homeworkTotal} ${avg} ${rate}`.trim());
    }
    if (a.mostUsedTool) analyticsLines.push(`Top tool: ${a.mostUsedTool}`);
    if (Array.isArray(a.topClasses) && a.topClasses.length) {
      analyticsLines.push(
        `Top classes: ${a.topClasses
          .slice(0, 3)
          .map((c) => `${c.name} (${c.messages} msgs, ${c.homework} hw)`)
          .join("; ")}`
      );
    }
    if (Array.isArray(a.topCourses) && a.topCourses.length) {
      analyticsLines.push(`Top courses: ${a.topCourses.slice(0, 4).join("; ")}`);
    }
    if (Array.isArray(a.insights) && a.insights.length) {
      analyticsLines.push(`Insights: ${a.insights.join("; ")}`);
    }
    if (a.engagementCounts) {
      analyticsLines.push(
        `Engagement: high ${a.engagementCounts.high || 0}, medium ${a.engagementCounts.medium || 0}, low ${a.engagementCounts.low ||
          0}`
      );
    }
    if (analyticsLines.length) {
      parts.push("Analytics snapshot:\n" + analyticsLines.join("\n"));
    }
  }
  return parts.join("\n\n");
}

function formatUserContext(user) {
  if (!user || typeof user !== "object") return "";
  const parts = [];
  if (user.displayName) parts.push(`Name: ${user.displayName}`);
  if (user.email) parts.push(`Email: ${user.email}`);
  if (user.id) parts.push(`ID: ${user.id}`);
  if (user.role) parts.push(`Role: ${user.role}`);
  if (user.workspaceName) parts.push(`Workspace: ${user.workspaceName}`);
  if (user.workspaceId) parts.push(`Workspace ID: ${user.workspaceId}`);
  if (user.status) parts.push(`Status: ${user.status}`);
  return parts.length ? `User context: ${parts.join(" | ")}` : "";
}

function normalizeEvent(e = {}) {
  return {
    title: e.title || e.name || "",
    date: e.date || e.startsAt?.split("T")?.[0] || "",
    startTime: e.startTime || e.startsAt || "",
    endTime: e.endTime || "",
    location: e.location || "",
    category: e.category || e.type || ""
  };
}

function detectIntent(text = "") {
  const t = (text || "").toLowerCase();
  if (/(when|next|start|date|time|schedule|notice)/.test(t)) return "schedule_lookup";
  if (/(lesson plan|objectives|warm-up|teach)/.test(t)) return "lesson_plan";
  if (/(quiz|test|questions)/.test(t)) return "quiz";
  return "general";
}

function detectToolIntent(text = "") {
  const t = (text || "").toLowerCase();
  if (t.includes("student count") || t.includes("how many students")) return "get_school_stats";
  if (t.includes("list courses") || t.includes("courses currently offered") || t.includes("available courses"))
    return "list_courses";
  if (t.includes("list teachers") || t.includes("teacher list")) return "list_teachers";
  if (t.includes("deadline") || t.includes("deadlines") || t.includes("assignments") || t.includes("exam") || t.includes("upcoming class"))
    return "get_deadlines";
  if (t.includes("attendance") || t.includes("policy") || t.includes("enroll") || t.includes("payment") || t.includes("fees"))
    return "search_knowledge";
  return null;
}

function formatToolResponse(toolName, payload) {
  switch (toolName) {
    case "get_school_stats":
      return `School stats: ${payload.students} students · ${payload.teachers} teachers · ${payload.admins} admins`;
    case "list_courses":
      return (
        "Courses:\n" +
        payload
          .map((c) => `- ${c.name} (${c.category}${c.topic ? `, ${c.topic}` : ""})`)
          .slice(0, 6)
          .join("\n")
      );
    case "list_teachers":
      return (
        "Teachers:\n" +
        payload
          .map((t) => `- ${t.name}${t.email ? ` (email: ${t.email})` : ""}`)
          .slice(0, 6)
          .join("\n")
      );
    case "get_deadlines":
      if (!payload.length) return "No upcoming deadlines found.";
      return (
        "Upcoming deadlines:\n" +
        payload.slice(0, 6).map((d) => `- ${d.title} (${d.date})`).join("\n")
      );
    case "search_knowledge":
      if (!payload.length) return "No knowledge items matched your query.";
      return (
        "Knowledge results:\n" +
        payload.map((item) => `- ${item.title}: ${item.body.slice(0, 120)}...`).join("\n")
      );
    default:
      return null;
  }
}

app.get("/api/knowledge/search", (req, res) => {
  const query = String(req.query.q || "").trim();
  if (!query) return res.json({ items: [] });
  const authed = getAuthedUser(req);
  const role = String(authed?.role || authed?.userRole || "").toLowerCase();
  const workspaceId = authed?.workspaceId || authed?.workspace_id || "default";
  const items = searchKnowledge(workspaceId, query, role);
  res.json({ items });
});

app.post("/api/knowledge/upsert", (req, res) => {
  const authed = getAuthedUser(req);
  const role = String(authed?.role || authed?.userRole || "").toLowerCase();
  if (!authed || !role.includes("admin")) return res.status(403).json({ error: "forbidden" });
  const { id, title, body, visibility, tags } = req.body || {};
  if (!title || !body) return res.status(400).json({ error: "missing title/body" });
  const workspaceId = authed.workspaceId || authed.workspace_id || "default";
  const safeId = id || `doc_${crypto.randomUUID()}`;
  db.prepare(
    `
    INSERT INTO knowledge_items (id, workspace_id, title, body, visibility, tags, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      body = excluded.body,
      visibility = excluded.visibility,
      tags = excluded.tags,
      updated_at = datetime('now')
  `
  ).run(safeId, workspaceId, title, body, visibility || "public", tags || "");
  res.json({ success: true, id: safeId });
});

function invokeTool(user, message, clientContext) {
  const toolName = detectToolIntent(message);
  if (!toolName) return null;
  const workspaceId = user.workspaceId || user.workspace_id || "default";
  if (toolName === "get_school_stats" && !String(user.role || user.userRole || "").toLowerCase().includes("admin"))
    return null;

  let payload = [];
  switch (toolName) {
    case "get_school_stats":
      payload = getSchoolStats(workspaceId);
      break;
    case "list_courses":
      payload = listCourses(workspaceId);
      break;
    case "list_teachers":
      payload = listTeachers(workspaceId, String(user.role || user.userRole || "").toLowerCase().includes("admin"));
      break;
    case "get_deadlines":
      payload = getDeadlines(user);
      break;
    case "search_knowledge":
      payload = searchKnowledge(workspaceId, message, String(user.role || user.userRole || "").toLowerCase());
      break;
    default:
      return null;
  }

  const text = formatToolResponse(toolName, payload);
  if (!text) return null;
  return { tool: toolName, text, payload };
}

function buildOllamaPrompt({ userText, mode = "assistant", role = "student", context = null }) {
  const intent = detectIntent(userText);
  const events = extractUpcomingEvents(context);
  const relevant = pickRelevantEvents(userText, events, 10);

  const rolePolicy =
    role === "student"
      ? "ROLE_POLICY: When USER_ROLE is student, only answer with schedule info, upcoming courses, deadlines, and group activity relevant to that student."
      : "ROLE_POLICY: When USER_ROLE is admin/teacher, you may leverage enrollment counts, teachers, courses, and workspace stats present in the context.";

  const systemCommon = [
    "You are WorkNest AI for a school planner used by teachers and students.",
    "Be accurate and do NOT invent dates/times.",
    "Use provided context as the only source of truth for schedule facts.",
    "If you cannot find the answer in context, ask ONE short clarification question.",
    "Keep the first line as a direct answer, then add brief bullet details.",
    `USER_ROLE: ${role}`,
    `MODE: ${mode}`,
    `INTENT: ${intent}`,
    rolePolicy
  ].join("\n");

  const systemByIntent = (() => {
    if (intent === "schedule_lookup") {
      return [
        "TASK: Find the next relevant class/event in the calendar.",
        "RULES:",
        "- Match class names or categories mentioned by the user.",
        "- Pick the soonest upcoming by date/time.",
        "- If no match, ask: 'Which class name should I look for?'",
        "",
        "OUTPUT FORMAT (exact):",
        "Next event: <Title> — <Day DD Mon> <StartTime–EndTime>",
        "Details:",
        "- Date: <YYYY-MM-DD>",
        "- Time: <Start–End>",
        "- Location: <Location or 'Not set'>",
        "- Notes: <Short or 'None'>"
      ].join("\n");
    }
    if (intent === "lesson_plan") {
      return [
        "TASK: Create a lesson plan.",
        "RULES:",
        "- Ask ONE question only if key details are missing.",
        "- Otherwise produce a complete plan.",
        "OUTPUT FORMAT:",
        "Lesson plan",
        "1) Objectives",
        "2) Materials",
        "3) Warm-up (5 min)",
        "4) Instruction (15 min)",
        "5) Guided practice (15 min)",
        "6) Independent practice (10 min)",
        "7) Exit ticket (5 min)",
        "8) Differentiation",
        "9) Homework"
      ].join("\n");
    }
    if (intent === "quiz") {
      return [
        "TASK: Create a short quiz with answers.",
        "RULES:",
        "- If topic/grade missing, ask ONE short question.",
        "OUTPUT FORMAT:",
        "Quiz (10 questions)",
        "- Q1 ...",
        "...",
        "Answer key"
      ].join("\n");
    }
    return [
      "TASK: General help.",
      "RULES:",
      "- If user asks for a plan, provide steps.",
      "- If user asks a question, answer directly first.",
      "- If unclear, ask ONE clarification question."
    ].join("\n");
  })();

  const ctxParts = [];
  const userInfo = formatUserContext(context?.user);
  if (userInfo) ctxParts.push(userInfo);
  const compact = compactContext(context);
  if (compact) ctxParts.push(compact);
  if (context?.selectedDate) ctxParts.push(`SelectedDate: ${context.selectedDate}`);
  if (context?.viewMode) ctxParts.push(`ViewMode: ${context.viewMode}`);
  if (context?.stats) {
    ctxParts.push(
      `Stats: ${context.stats.students || 0} students · ${context.stats.teachers || 0} teachers · ${context.stats.admins || 0} admins`
    );
  }
  if (Array.isArray(context?.courses) && context.courses.length) {
    ctxParts.push(
      `Courses: ${context.courses
        .slice(0, 6)
        .map((c) => `${c.name} (${c.category})`)
        .join("; ")}`
    );
  }
  if (Array.isArray(context?.groups) && context.groups.length) {
    ctxParts.push(`Groups: ${context.groups.slice(0, 4).map((g) => g.name).join(", ")}`);
  }
  if (Array.isArray(context?.teachers) && context.teachers.length) {
    ctxParts.push(`Teachers: ${context.teachers.slice(0, 5).map((t) => t.name).filter(Boolean).join(", ")}`);
  }
  if (Array.isArray(context?.studentsSummary) && context.studentsSummary.length) {
    ctxParts.push(
      `Recent students: ${context.studentsSummary.slice(0, 5).map((s) => s.name).filter(Boolean).join(", ")}`
    );
  }

  if (relevant.length) {
    ctxParts.push(
      "CalendarEvents (relevant/upcoming):\n" +
        relevant
          .map(
            (e) =>
              `- ${e.title} | ${e.date} | ${e.startTime || "?"}-${e.endTime || "?"} | ${e.location || ""}`.trim()
          )
          .join("\n")
    );
  } else {
    ctxParts.push("CalendarEvents: (none provided)");
  }

  const ctxText = ctxParts.join("\n");

  return [
    systemCommon,
    systemByIntent,
    "",
    "CONTEXT:",
    ctxText || "(none provided)",
    "",
    "USER:",
    userText
  ].join("\n");
}

async function ollamaChat({ userText, mode = "assistant", role = "student", context = null }) {
  const prompt = buildOllamaPrompt({ userText, mode, role, context });

  const isWarm = globalThis.__OLLAMA_WARM === true;
  const timeoutMs = isWarm ? 30000 : 120000;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resp = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        stream: false,
        prompt,
        options: {
          temperature: 0.2,
          top_p: 0.9,
          num_predict: 400
        }
      })
    });

    if (!resp.ok) {
      const txt = await resp.text().catch(() => "");
      throw new Error(`Ollama HTTP ${resp.status}: ${txt.slice(0, 200)}`);
    }
    const data = await resp.json();
    globalThis.__OLLAMA_WARM = true;
    const reply = (data?.response || "").trim();
    return reply || "I couldn't generate a response. Try again.";
  } finally {
    clearTimeout(t);
  }
}

app.post("/api/ai/chat", async (req, res) => {
  const { message, mode, context: clientContext } = req.body || {};
  const text = (message || '').trim();

  if (!text) return res.status(400).json({ error: 'message is required' });

  const authed = getAuthedUser(req);
  if (!authed) return res.status(401).json({ error: 'unauthorized' });

  const safeContext = buildAiSchoolContext({
    user: authed,
    clientContext: clientContext || null
  });

  const toolResult = invokeTool(authed, userText, safeContext);
  if (toolResult) {
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.write(toolResult.text);
    return res.end();
  }

  try {
    const reply = await ollamaChat({
      userText: text,
      mode: mode || 'assistant',
      role: String(authed.role || authed.userRole || 'student').toLowerCase(),
      context: safeContext
    });
    res.json({ reply });
  } catch (err) {
    console.error('Ollama connection failed:', err);
    if (String(err?.name) === 'AbortError') {
      return res.json({
        reply:
          'AI is warming up (first request can take a bit longer). Please try again in 10–20 seconds.'
      });
    }

    res.json({
      reply:
        `Local AI is not available.\n\n` +
        `Check:\n` +
        `• Is Ollama running? (ollama serve)\n` +
        `• Is the URL correct? OLLAMA_URL=${OLLAMA_URL}\n` +
        `• If using Docker: use http://host.docker.internal:11434\n\n` +
        `Error: ${String(err && err.message ? err.message : err)}`
    });
  }
});

app.post("/api/ai/chat_stream", async (req, res) => {
  const { message, mode, context: clientContext } = req.body || {};
  const userText = (message || "").trim();

  console.log("✅ HIT /api/ai/chat_stream");
  console.log("RAW message:", userText);

  if (!userText) return res.status(400).end("message is required");

  const authed = getAuthedUser(req);
  if (!authed) return res.status(401).end("Unauthorized");

  const safeContext = buildAiSchoolContext({
    user: authed,
    clientContext: clientContext || null
  });

  res.status(200);
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  res.write("​");
  res.flush?.();

  const controller = new AbortController();

  res.on("close", () => {
    if (!res.writableEnded) {
      console.log("⚠️ Response closed early, aborting ollama fetch");
      controller.abort();
    }
  });

  const prompt = buildOllamaPrompt({
    userText,
    mode: mode || "assistant",
    role: String(authed.role || authed.userRole || "student").toLowerCase(),
    context: safeContext
  });

  try {
    console.log("➡️ calling ollama /api/generate stream=false");

    const ollamaResp = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        stream: false,
        prompt,
        options: { temperature: 0.2, top_p: 0.9, num_predict: 250 }
      })
    });

    console.log("⬅️ ollama status:", ollamaResp.status);

    if (!ollamaResp.ok) {
      const txt = await ollamaResp.text().catch(() => "");
      res.write(`[Ollama error ${ollamaResp.status}] ${txt.slice(0, 300)}\n`);
      return res.end();
    }

    const data = await ollamaResp.json().catch(() => ({}));
    const reply = (data?.response || "").trim();

    console.log("✅ reply length:", reply.length);

    if (!reply) {
      res.write("I couldn't generate a reply.\n");
      return res.end();
    }
    for (let i = 0; i < reply.length; i += 12) {
      if (controller.signal.aborted) break;
      res.write(reply.slice(i, i + 12));
      res.flush?.();
      await new Promise((r) => setTimeout(r, 10));
    }
    res.end();
  } catch (err) {
    if (err?.name === "AbortError") {
      console.log("⚠️ Ollama fetch aborted");
      return res.end();
    }
    console.error("AI chat_stream error:", err);
    res.write(`[AI error] ${String(err?.message || err)}\n`);
    res.end();
  }
});

const resolveAiWorkspace = (req) => {
  return String(req.query.workspaceId || req.body.workspaceId || req.auth?.workspaceId || "").trim();
};

app.get("/api/ai/budget", authRequired, (req, res) => {
  try {
    const workspaceId = getAuthWorkspaceId(req);
    if (!workspaceId) {
      return res.status(400).json({ error: "workspaceId missing in auth token" });
    }
    const summary = getWorkspaceAiBudgetSummary(workspaceId);
    return res.json({
      monthly_cap_eur: summary.cap_eur,
      used_eur: summary.used_eur,
      left_eur: summary.left_eur,
      blocked: summary.blocked
    });
  } catch (err) {
    console.error("Failed to fetch AI budget", err);
    res.status(500).json({ error: "Failed to fetch AI budget" });
  }
});

app.get("/api/ai/budget/summary", authRequired, (req, res) => {
  try {
    const workspaceId = getAuthWorkspaceId(req);
    if (!workspaceId) {
      return res.status(400).json({ error: "workspaceId missing" });
    }
    const summary = getWorkspaceAiBudgetSummary(workspaceId);
    res.json(summary);
  } catch (err) {
    console.error("Failed to fetch AI budget summary", err);
    res.status(500).json({ error: "Failed to fetch AI budget summary" });
  }
});

app.post("/api/ai/usage", authRequired, (req, res) => {
  try {
    const workspaceId = getAuthWorkspaceId(req);
    const userId = getAuthUserId(req);
    if (!workspaceId || !userId) {
      return res.status(400).json({ error: "auth context missing" });
    }
    const tokens_input = Number.isFinite(Number(req.body?.input_tokens)) ? Number(req.body.input_tokens) : 0;
    const tokens_output = Number.isFinite(Number(req.body?.output_tokens)) ? Number(req.body.output_tokens) : 0;
    const providedCost = Number(req.body?.cost_eur);
    const cost_eur =
      Number.isFinite(providedCost) && providedCost >= 0
        ? providedCost
        : calculateAiCost(tokens_input, tokens_output);
    const record = recordAiUsage(workspaceId, userId, cost_eur, tokens_input, tokens_output);
    const summary = getWorkspaceAiBudgetSummary(workspaceId);
    res.json({ ...summary, usage_record: record });
  } catch (err) {
    console.error("Failed to record usage", err);
    res.status(500).json({ error: "Failed to record usage" });
  }
});

app.post(
  "/api/ai/realtime/session",
  authRequired,
  aiLimiter,
  express.json(),
  async (req, res) => {
    try {
      const workspaceId = getAuthWorkspaceId(req);
      const userId = getAuthUserId(req);
      const role = getAuthRole(req);

      if (!workspaceId || !userId) {
        return res.status(401).json({ error: "Invalid session" });
      }

      if (!role) {
        return res.status(403).json({ error: "Role missing in token" });
      }
      if (!workspaceId) {
        return res.status(400).json({ error: "workspaceId required" });
      }

      const summary = getWorkspaceAiBudgetSummary(workspaceId);
      if (summary.blocked) {
        return res.status(402).json({
          blocked: true,
          reason: "AI budget limit reached",
          workspaceId,
          userId,
          ...summary
        });
      }

      const scenario = String(req.body?.scenario || "free");
      const instructions =
        scenario === "restaurant"
          ? "You are a friendly language tutor. Roleplay ordering at a restaurant. Ask one question at a time. Correct gently."
          : "You are a friendly language tutor. Keep replies short. Ask one question at a time. Correct gently.";

      const session = await createOpenAIRealtimeSession({
        model: ENV.OPENAI_REALTIME_MODEL || "gpt-realtime-mini",
        voice: ENV.OPENAI_REALTIME_VOICE || "alloy",
        instructions,
        metadata: {
          workspace_id: workspaceId,
          user_id: userId || "",
          role: role || ""
        }
      });

      return res.json({
        blocked: false,
        workspaceId,
        userId,
        ...summary,
        client_secret: session.client_secret,
        expires_at: session.client_secret?.expires_at || session.expires_at || null,
      });
    } catch (err) {
      console.error("Failed to start AI session:", err);
      return res.status(500).json({ error: "Failed to start AI session" });
    }
  }
);

app.post("/api/ai/runtime/start", authRequired, express.json(), (req, res) => {
  try {
    const workspaceId = getAuthWorkspaceId(req);
    const userId = getAuthUserId(req);
    if (!workspaceId || !userId) {
      return res.status(400).json({ error: "Invalid auth context" });
    }
    const conversationId = String(req.body?.conversation_id || "").trim() || null;
    const runtime = createAiRuntimeSessionRow(workspaceId, userId, conversationId);
    res.json({ runtime_id: runtime.id });
  } catch (err) {
    console.error("Failed to start runtime session", err);
    res.status(500).json({ error: "Failed to start runtime session" });
  }
});

app.post("/api/ai/runtime/heartbeat", authRequired, express.json(), (req, res) => {
  const runtimeId = String(req.body?.runtime_id || "").trim();
  if (!runtimeId) {
    return res.status(400).json({ error: "runtime_id required" });
  }
  const workspaceId = getAuthWorkspaceId(req);
  const userId = getAuthUserId(req);
  if (!workspaceId || !userId) {
    return res.status(400).json({ error: "Invalid auth context" });
  }
  const row = getActiveRuntimeSession(runtimeId, workspaceId, userId);
  if (!row) {
    return res.status(404).json({ error: "runtime session not found" });
  }
  const { seconds } = updateRuntimeSeconds(row);
  res.json({ ok: true, seconds });
});

app.post("/api/ai/runtime/end", authRequired, express.json(), (req, res) => {
  const runtimeId = String(req.body?.runtime_id || "");
  if (!runtimeId) return res.status(400).json({ error: "runtime_id required" });

  const workspaceId = getAuthWorkspaceId(req);
  const userId = getAuthUserId(req);

  const row = db.prepare(`
    SELECT id FROM ai_runtime_sessions
    WHERE id = ? AND workspace_id = ? AND user_id = ? AND status = 'active'
  `).get(runtimeId, workspaceId, userId);

  if (!row) return res.status(404).json({ error: "runtime session not found" });

  const result = finalizeRuntimeSession({ runtimeId, reason: "user_stop" });
  res.json(result);
});

app.post("/api/ai/conversation/start", authRequired, express.json(), (req, res) => {
  const id = secId("aic");
  const workspaceId = getAuthWorkspaceId(req);
  const userId = getAuthUserId(req);
  if (!workspaceId || !userId) {
    return res.status(400).json({ error: "Invalid auth context" });
  }
  const scenario = String(req.body?.scenario || "free").trim();
  const mode = String(req.body?.mode || "vad").trim();
  const now = Date.now();
  db.prepare(`
    INSERT INTO ai_conversations (id, workspace_id, user_id, scenario, mode, started_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, workspaceId, userId, scenario, mode, now);
  res.json({ conversation_id: id });
});

app.post("/api/ai/conversation/:id/messages", authRequired, express.json(), (req, res) => {
  const convId = String(req.params.id || "").trim();
  const workspaceId = getAuthWorkspaceId(req);
  const userId = getAuthUserId(req);
  if (!convId || !workspaceId || !userId) {
    return res.status(400).json({ error: "Invalid request" });
  }
  const conv = db
    .prepare(
      `
        SELECT id
        FROM ai_conversations
        WHERE id = ? AND workspace_id = ? AND user_id = ?
      `
    )
    .get(convId, workspaceId, userId);
  if (!conv) {
    return res.status(404).json({ error: "conversation not found" });
  }
  const items = Array.isArray(req.body?.messages) ? req.body.messages : [];
  if (!items.length) {
    return res.json({ ok: true });
  }
  const now = Date.now();
  const stmt = db.prepare(`
    INSERT INTO ai_conversation_messages (id, conversation_id, role, content, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);
  const tx = db.transaction(() => {
    for (const item of items) {
      const role = String(item.role || "").trim();
      const content = String(item.content || "").trim();
      if (!role || !content) continue;
      stmt.run(secId("aicm"), convId, role, content, now);
    }
  });
  tx();
  res.json({ ok: true });
});

app.post("/api/ai/conversation/:id/end", authRequired, express.json(), (req, res) => {
  const convId = String(req.params.id || "").trim();
  const workspaceId = getAuthWorkspaceId(req);
  const userId = getAuthUserId(req);
  if (!convId || !workspaceId || !userId) {
    return res.status(400).json({ error: "Invalid request" });
  }
  const now = Date.now();
  const result = db
    .prepare(
      `
        UPDATE ai_conversations
        SET ended_at = ?
        WHERE id = ? AND workspace_id = ? AND user_id = ?
      `
    )
    .run(now, convId, workspaceId, userId);
  markConversationEnded(convId);
  res.json({ ok: true, updated: result.changes });
});

app.get("/api/admin/ai-budget", requireAdmin, (req, res) => {
  const workspaceId = resolveAiWorkspace(req);
  if (!workspaceId) return res.status(400).json({ error: "workspaceId required" });
  res.json(getAiBudgetSummary(workspaceId));
});

app.post("/api/admin/ai-budget", requireAdmin, (req, res) => {
  const workspaceId = resolveAiWorkspace(req);
  if (!workspaceId) return res.status(400).json({ error: "workspaceId required" });
  const cap = Number(req.body?.monthly_cap_eur);
  if (Number.isNaN(cap) || cap < 0) {
    return res.status(400).json({ error: "monthly_cap_eur must be a non-negative number" });
  }
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO ai_budget_settings (workspace_id, monthly_cap_eur, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(workspace_id) DO UPDATE SET
      monthly_cap_eur = excluded.monthly_cap_eur,
      updated_at = excluded.updated_at
  `).run(workspaceId, cap, now);
  res.json(getAiBudgetSummary(workspaceId));
});

app.post("/api/admin/ai-budget/reset", requireAdmin, (req, res) => {
  const workspaceId = resolveAiWorkspace(req);
  if (!workspaceId) return res.status(400).json({ error: "workspaceId required" });
  db.prepare("DELETE FROM ai_usage_ledger WHERE workspace_id = ?").run(workspaceId);
  res.json({ ok: true });
});

app.get("/api/admin/ai-budget/default", authRequired, requireSuperAdmin, (req, res) => {
  const cap = getDefaultAiCapEur();
  const row = db
    .prepare(`
      SELECT updated_at
      FROM platform_settings
      WHERE key = ?
    `)
    .get(PLATFORM_SETTING_AI_DEFAULT_BUDGET_KEY);
  res.json({ monthly_cap_eur: cap, updated_at: row?.updated_at || null });
});

app.post(
  "/api/admin/ai-budget/default",
  authRequired,
  requireSuperAdmin,
  express.json(),
  (req, res) => {
    const cap = Number(req.body?.monthly_cap_eur);
    if (!Number.isFinite(cap) || cap < 0) {
      return res.status(400).json({ error: "monthly_cap_eur must be a number >= 0" });
    }
    setPlatformSetting(PLATFORM_SETTING_AI_DEFAULT_BUDGET_KEY, String(cap));
    res.json({ ok: true, monthly_cap_eur: cap });
  }
);

// ---------- ADMIN API ----------
app.get('/api/admin/me', (req, res) => {
  const user = requireSuperAdmin(req, res);
  if (!user) return;

  const row = db
    .prepare(
      `
      SELECT
        id,
        workspace_id AS workspaceId,
        name,
        email,
        role,
        status
      FROM users
      WHERE id = ?
    `
    )
    .get(user.id);

  if (!row) {
    const bypassEntry = findDevSuperAdminBypassUser(user.email ? user.email : user.id);
    if (bypassEntry) {
      return res.json({
        id: bypassEntry.userId,
        workspaceId: null,
        name: bypassEntry.name,
        email: bypassEntry.email,
        role: bypassEntry.role || 'super_admin',
        displayRole: bypassEntry.displayRole,
        status: 'active',
        superAdmin: true
      });
    }
    return res.status(404).json({ error: 'User not found' });
  }

  return res.json({
    ...row,
    superAdmin: String(row.role || '').toLowerCase() === 'super_admin'
  });
});

app.get('/api/admin/workspaces', (req, res) => {
  const user = requireSuperAdmin(req, res);
  if (!user) return;

  const rows = db.prepare(`
    SELECT id, name, school_code AS schoolCode, status, admin_email AS adminEmail
    FROM workspaces
    ORDER BY name
  `).all();

  return res.json(rows);
});

app.get('/api/admin/approved-requests-missing-workspace', (req, res) => {
  const user = requireSuperAdmin(req, res);
  if (!user) return;

  const reqs = db.prepare(`
    SELECT id, email, payload, created_at AS createdAt, reviewed_at AS reviewedAt
    FROM registration_review_requests
    WHERE status = 'approved'
    ORDER BY reviewed_at DESC
    LIMIT 300
  `).all();

  const workspaces = db.prepare(`SELECT id FROM workspaces`).all();
  const workspaceIds = new Set(workspaces.map((w) => String(w.id)));

  const filtered = reqs
    .map((r) => {
      let data = {};
      try {
        data = r.payload ? JSON.parse(r.payload) : {};
      } catch (_err) {
        data = {};
      }
      return { ...r, data };
    })
    .filter((r) => {
      const slug = String(
        r.data?.workspaceSlug ||
          r.data?.workspace_id ||
          r.data?.workspace ||
          r.data?.workspaceName ||
          ''
      )
        .trim()
        .toLowerCase();
      return !slug || !workspaceIds.has(slug);
    });

  res.json(filtered);
});

app.post('/api/admin/workspaces/upsert', (req, res) => {
  const user = requireSuperAdmin(req, res);
  if (!user) return;

  const { id, name, schoolCode, status } = req.body || {};
  const wsName = String(name || '').trim();
  if (!wsName) return res.status(400).json({ error: 'name is required' });

  const wsId = String(id || '').trim() || generateAdminId('ws');
  const wsStatus = String(status || 'active').trim() || 'active';

  const existing = db.prepare('SELECT id FROM workspaces WHERE id = ?').get(wsId);

  if (existing) {
    db.prepare(`
      UPDATE workspaces
      SET name = ?, school_code = COALESCE(?, school_code), status = ?
      WHERE id = ?
    `).run(wsName, schoolCode || null, wsStatus, wsId);

    legacyAuditLog({ workspaceId: wsId, actor: user.id, action: 'workspace.update', target: wsId, payload: { name: wsName, schoolCode, status: wsStatus } });
  } else {
    db.prepare(`
      INSERT INTO workspaces (id, name, school_code, status)
      VALUES (?, ?, ?, ?)
    `).run(wsId, wsName, schoolCode || null, wsStatus);

    legacyAuditLog({ workspaceId: wsId, actor: user.id, action: 'workspace.create', target: wsId, payload: { name: wsName, schoolCode, status: wsStatus } });
  }

  try {
    ensurePrivacyRulesMessage(wsId);
  } catch (e) {
    console.warn('Failed to refresh privacy rules message for workspace update:', e);
  }

  // ensure billing row exists
  db.prepare(`
    INSERT OR IGNORE INTO workspace_billing (workspace_id, plan, status, currency, monthly_price_cents, billing_email, updated_at)
    VALUES (?, 'free', 'active', 'EUR', 0, NULL, ?)
  `).run(wsId, nowMs());

  return res.json({ ok: true, id: wsId });
});

app.delete('/api/admin/workspaces/:workspaceId', (req, res) => {
  const user = requireSuperAdmin(req, res);
  if (!user) return;

  const { workspaceId } = req.params;
  const workspace = db.prepare('SELECT id FROM workspaces WHERE id = ?').get(workspaceId);
  if (!workspace) {
    return res.status(404).json({ error: 'Workspace not found' });
  }
  if (workspaceId === 'default') {
    return res.status(400).json({ error: 'Default workspace cannot be deleted' });
  }

  deleteWorkspaceCascade(workspaceId);
  legacyAuditLog({
    workspaceId,
    actor: user.id,
    action: 'workspace.delete',
    target: workspaceId
  });
  res.json({ ok: true });
});

app.get('/api/admin/users', (req, res) => {
  const user = requireSuperAdmin(req, res);
  if (!user) return;

  const ws = String(req.query.workspaceId || 'all');
  const rows = db.prepare(`
    SELECT
      id, name, email, username,
      role, status,
      workspace_id AS workspaceId
    FROM users
    ${ws === 'all' ? '' : 'WHERE workspace_id = ?'}
    ORDER BY name
    LIMIT 2000
  `).all(...(ws === 'all' ? [] : [ws]));

  if (allowAdminLoginBypass && devSuperAdminBypassEntries.length) {
    for (const entry of devSuperAdminBypassEntries) {
      if (!entry) continue;
      const exists = rows.some((r) => (r.id && r.id === entry.userId) || (r.email && r.email.toLowerCase() === entry.email));
      if (exists) continue;
      rows.unshift({
        id: entry.userId,
        name: entry.name,
        email: entry.email,
        role: entry.role || 'super_admin',
        displayRole: entry.displayRole,
        status: 'active',
        username: entry.userId,
        workspaceId: null,
        bypass: true
      });
    }
  }

  return res.json(rows);
});

app.patch('/api/admin/users/:id', (req, res) => {
  const user = requireSuperAdmin(req, res);
  if (!user) return;

  const userId = req.params.id;
  const { role, status } = req.body || {};

  const existing = db.prepare('SELECT id, workspace_id AS workspaceId, role, status FROM users WHERE id = ?').get(userId);
  if (!existing) return res.status(404).json({ error: 'User not found' });

  const newRole = role !== undefined ? String(role).trim().toLowerCase() : existing.role;
  const newStatus = status !== undefined ? String(status).trim().toLowerCase() : existing.status;

  db.prepare('UPDATE users SET role = ?, status = ? WHERE id = ?').run(newRole, newStatus, userId);

  legacyAuditLog({
    workspaceId: existing.workspaceId,
    actor: user.id,
    action: 'user.update',
    target: userId,
    payload: { role: newRole, status: newStatus }
  });
  audit('user.role_updated', req, {
    user,
    target: userId,
    workspaceId: existing.workspaceId,
    meta: { role: newRole, status: newStatus }
  });

  return res.json({ ok: true });
});

app.delete('/api/admin/users/:id', (req, res) => {
  const user = requireSuperAdmin(req, res);
  if (!user) return;

  const userId = req.params.id;
  const workspaceId = deleteUserCascade(userId);
  if (!workspaceId) {
    return res.status(404).json({ error: 'User not found' });
  }

  legacyAuditLog({
    workspaceId,
    actor: user.id,
    action: 'user.delete',
    target: userId
  });

  res.json({ ok: true, userId });
});

app.get('/api/admin/overview', (req, res) => {
  const user = requireSuperAdmin(req, res);
  if (!user) return;

  const schools = db.prepare('SELECT COUNT(*) AS c FROM workspaces').get().c || 0;
  const users = db.prepare('SELECT COUNT(*) AS c FROM users').get().c || 0;

  const activeSubscriptions = db.prepare(`
    SELECT COUNT(*) AS c
    FROM workspace_billing
    WHERE status = 'active' AND plan <> 'free'
  `).get().c || 0;

  const openInvoices = db.prepare(`
    SELECT COUNT(*) AS c
    FROM invoices
    WHERE status = 'open'
  `).get().c || 0;

  const recentAudit = db.prepare(`
    SELECT workspace_id AS workspaceId, actor, action, target, created_at AS createdAt
    FROM audit_log
    ORDER BY created_at DESC
    LIMIT 15
  `).all();

  return res.json({ schools, users, activeSubscriptions, openInvoices, recentAudit });
});

app.get('/api/admin/billing/:workspaceId', (req, res) => {
  const user = requireSuperAdmin(req, res);
  if (!user) return;

  const ws = String(req.params.workspaceId || 'all');

  const invoices = db.prepare(`
    SELECT
      id,
      workspace_id AS workspaceId,
      amount_cents AS amountCents,
      currency,
      description,
      status,
      due_date AS dueDate,
      created_at AS createdAt,
      paid_at AS paidAt
    FROM invoices
    ${ws === 'all' ? '' : 'WHERE workspace_id = ?'}
    ORDER BY created_at DESC
    LIMIT 500
  `).all(...(ws === 'all' ? [] : [ws]));

  const payments = db.prepare(`
    SELECT
      id,
      invoice_id AS invoiceId,
      workspace_id AS workspaceId,
      amount_cents AS amountCents,
      currency,
      provider,
      provider_ref AS providerRef,
      created_at AS createdAt
    FROM payments
    ${ws === 'all' ? '' : 'WHERE workspace_id = ?'}
    ORDER BY created_at DESC
    LIMIT 500
  `).all(...(ws === 'all' ? [] : [ws]));

  return res.json({ invoices, payments });
});

app.post('/api/admin/invoices', (req, res) => {
  const user = requireSuperAdmin(req, res);
  if (!user) return;

  const { workspaceId, amountCents, currency, description, dueDate } = req.body || {};
  const ws = String(workspaceId || '').trim();
  if (!ws) return res.status(400).json({ error: 'workspaceId is required' });

  const amount = Number(amountCents);
  if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: 'amountCents must be > 0' });

  const invId = generateAdminId('inv');

  db.prepare(`
    INSERT INTO invoices (id, workspace_id, amount_cents, currency, description, status, due_date, created_at)
    VALUES (?, ?, ?, ?, ?, 'open', ?, ?)
  `).run(invId, ws, Math.floor(amount), String(currency || 'EUR'), description || null, dueDate || null, nowMs());

  legacyAuditLog({ workspaceId: ws, actor: user.id, action: 'invoice.create', target: invId, payload: { amountCents: amount, currency, description, dueDate } });

  return res.json({ ok: true, id: invId });
});

app.post('/api/admin/invoices/:invoiceId/mark-paid', (req, res) => {
  const user = requireSuperAdmin(req, res);
  if (!user) return;

  const invoiceId = String(req.params.invoiceId || '').trim();
  const invoice = db.prepare(`
    SELECT id, workspace_id AS workspaceId, amount_cents AS amountCents, currency, status
    FROM invoices
    WHERE id = ?
  `).get(invoiceId);

  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
  if (invoice.status === 'paid') return res.json({ ok: true });

  const paymentId = generateAdminId('pay');

  const tx = db.transaction(() => {
    db.prepare('UPDATE invoices SET status = ?, paid_at = ? WHERE id = ?')
      .run('paid', nowMs(), invoiceId);

    db.prepare(`
      INSERT INTO payments (id, invoice_id, workspace_id, amount_cents, currency, provider, provider_ref, created_at)
      VALUES (?, ?, ?, ?, ?, 'manual', NULL, ?)
    `).run(paymentId, invoiceId, invoice.workspaceId, invoice.amountCents, invoice.currency, nowMs());
  });

  tx();

  legacyAuditLog({ workspaceId: invoice.workspaceId, actor: user.id, action: 'invoice.mark_paid', target: invoiceId, payload: { paymentId } });

  return res.json({ ok: true, paymentId });
});

app.get('/api/admin/workspace-settings/:workspaceId', (req, res) => {
  const user = requireSuperAdmin(req, res);
  if (!user) return;

  const ws = String(req.params.workspaceId || '').trim();
  if (!ws) return res.status(400).json({ error: 'workspaceId required' });

  const row = db.prepare(`
    SELECT settings_json AS settingsJson
    FROM workspace_settings_admin
    WHERE workspace_id = ?
  `).get(ws);

  const settings = row?.settingsJson ? JSON.parse(row.settingsJson) : {};
  return res.json({ workspaceId: ws, settings });
});

app.put('/api/admin/workspace-settings/:workspaceId', (req, res) => {
  const user = requireSuperAdmin(req, res);
  if (!user) return;

  const ws = String(req.params.workspaceId || '').trim();
  const settings = req.body?.settings ?? {};
  const json = JSON.stringify(settings || {});

  db.prepare(`
    INSERT INTO workspace_settings_admin (workspace_id, settings_json, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(workspace_id) DO UPDATE SET
      settings_json = excluded.settings_json,
      updated_at = excluded.updated_at
  `).run(ws, json, nowMs());

  legacyAuditLog({ workspaceId: ws, actor: user.id, action: 'workspace.settings.update', target: ws, payload: settings });

  return res.json({ ok: true });
});

app.get('/api/admin/audit', (req, res) => {
  const user = requireSuperAdmin(req, res);
  if (!user) return;

  const ws = String(req.query.workspaceId || 'all');

  const rows = db.prepare(`
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
    LIMIT 500
  `).all(...(ws === 'all' ? [] : [ws]));

  return res.json(rows);
});
app.get("/api/ai/health", async (_req, res) => {
  try {
    const r = await fetch(`${OLLAMA_URL}/api/tags`);
    res.json({ ok: r.ok, ollamaUrl: OLLAMA_URL, model: OLLAMA_MODEL });
  } catch (e) {
    res.json({ ok: false, error: String(e.message || e), ollamaUrl: OLLAMA_URL, model: OLLAMA_MODEL });
  }
});

scheduleIdleRuntimeCleanup();

app.use((err, req, res, next) => {
  console.error('[ERROR]', {
    path: req.path,
    method: req.method,
    message: err?.message,
    stack: ENV.IS_PROD ? undefined : err?.stack
  });
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Internal server error' });
});

/* ---------- START SERVER ---------- */
app.listen(PORT, () => {
  console.log(`WorkNest server (SQLite + reactions) at http://localhost:${PORT}`);
  warmOllama();
});
function canTakeClassAttendance(user) {
  const role = String(user?.role || user?.user_role || '').toLowerCase();
  return role === 'teacher' || role === 'admin' || role === 'super_admin' || role === 'school_admin';
}

function isAttendanceAdminUser(user) {
  const role = String(user?.role || user?.user_role || '').toLowerCase();
  if (user?.is_admin || user?.is_super_admin) return true;
  return ['admin', 'school_admin', 'super_admin', 'super-admin'].includes(role);
}
// =========================
// Class metadata (per-channel settings)
// =========================

const CLASS_META_TABLE = `
  CREATE TABLE IF NOT EXISTS workspace_class_meta (
    workspace_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    start_date TEXT,
    end_date TEXT,
    status TEXT NOT NULL DEFAULT 'private',
    capacity INTEGER DEFAULT 0,
    updated_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (workspace_id, channel_id)
  )
`;
db.exec(CLASS_META_TABLE);
try {
  db.exec("ALTER TABLE workspace_class_meta ADD COLUMN capacity INTEGER DEFAULT 0;");
} catch (err) {
  if (!/duplicate column/i.test(String(err?.message || ""))) {
    console.error("Could not add capacity column", err);
  }
}

function canManageClassSettings(user) {
  const role = String(user?.role || user?.user_role || '').toLowerCase();
  if (user?.is_admin || user?.is_admin === 1) return true;
  return new Set(['admin','school_admin','schooladmin','workspace_admin','workspaceadmin','owner','superadmin','super-admin','teacher','instructor']).has(role);
}

function isSuperAdminUser(user) {
  const role = String(user?.role || user?.user_role || '').toLowerCase();
  if (user?.is_admin || user?.is_admin === 1) return true;
  if (user?.is_super_admin || user?.is_super_admin === 1) return true;
  return ['super_admin', 'superadmin', 'super-admin'].includes(role);
}

function ensureClassChannel(workspaceId, channelId, { allowAllWorkspaces = false } = {}) {
  const sql = allowAllWorkspaces
    ? `SELECT id, category, workspace_id AS workspaceId FROM channels WHERE id = ? LIMIT 1`
    : `SELECT id, category, workspace_id AS workspaceId FROM channels WHERE workspace_id = ? AND id = ? LIMIT 1`;
  const params = allowAllWorkspaces ? [channelId] : [workspaceId, channelId];
  const row = db.prepare(sql).get(...params);
  if (!row) return { ok: false, code: 404, error: 'Channel not found' };
  const cat = String(row.category || '').toLowerCase();
  if (cat !== 'classes') return { ok: false, code: 400, error: 'Channel is not a class' };
  return { ok: true, channel: row };
}

function getClassMeta(workspaceId, channelId) {
  return db.prepare(
    `SELECT * FROM workspace_class_meta WHERE workspace_id = ? AND channel_id = ? LIMIT 1`
  ).get(workspaceId, channelId);
}

function upsertClassMeta(workspaceId, channelId, payload) {
  db.prepare(
    `INSERT INTO workspace_class_meta (workspace_id, channel_id, start_date, end_date, status, capacity, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(workspace_id, channel_id) DO UPDATE SET
       start_date = excluded.start_date,
       end_date = excluded.end_date,
       status = excluded.status,
       capacity = excluded.capacity,
       updated_at = datetime('now')`
  ).run(
    workspaceId,
    channelId,
    payload.start_date || null,
    payload.end_date || null,
    payload.status || 'private',
    payload.capacity != null ? Number(payload.capacity) : 0
  );
}

function countChannelMembers(channelId) {
  const rows = db.prepare(
    `SELECT u.role,
            COALESCE(u.name, u.username, u.email, '') AS display_name
     FROM channel_members cm
     LEFT JOIN users u ON u.id = cm.user_id
     WHERE cm.channel_id = ?`
  ).all(channelId);
  const students = rows.filter((u) => String(u.role || '').toLowerCase().includes('student'));
  const teacherRows = rows.filter((u) => String(u.role || '').toLowerCase().includes('teacher'));
  const teacherNames = teacherRows
    .map((u) => String(u.display_name || '').trim())
    .filter((name) => name);
  return {
    totalStudents: students.length,
    totalTeachers: teacherRows.length,
    teacherNames
  };
}

app.get('/api/classes/:channelId/meta', (req, res) => {
  const user = getAuthedUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  const requestedWorkspaceId = getWorkspaceIdFromUser(user);
  const channelId = String(req.params.channelId || '');
  const allowAnyWorkflow = isSuperAdminUser(user);
  const check = ensureClassChannel(
    requestedWorkspaceId,
    channelId,
    { allowAllWorkspaces: allowAnyWorkflow }
  );
  if (!check.ok) return res.status(check.code).json({ error: check.error });
  const metaWorkspaceId = check.channel.workspaceId || requestedWorkspaceId;
  const meta = getClassMeta(metaWorkspaceId, channelId) || { status: 'private' };
  const counts = countChannelMembers(channelId);
  res.json({
    start_date: meta.start_date || '',
    end_date: meta.end_date || '',
    status: meta.status || 'private',
    total_students: counts.totalStudents,
    total_teachers: counts.totalTeachers,
    capacity: Number(meta.capacity || 0),
    teacher_names: counts.teacherNames.join(', ')
  });
});

app.put('/api/classes/:channelId/meta', express.json(), (req, res) => {
  const user = getAuthedUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  if (!canManageClassSettings(user)) return res.status(403).json({ error: 'Forbidden' });
  const workspaceId = getWorkspaceIdFromUser(user);
  const channelId = String(req.params.channelId || '');
  const check = ensureClassChannel(workspaceId, channelId);
  if (!check.ok) return res.status(check.code).json({ error: check.error });
  const body = req.body || {};
  const validStatus = ['public', 'private'];
  const status = validStatus.includes(String(body.status || '').toLowerCase()) ? String(body.status).toLowerCase() : 'private';
  const capacity = Number(body.capacity || 0);
  upsertClassMeta(workspaceId, channelId, {
    start_date: String(body.start_date || '').trim() || null,
    end_date: String(body.end_date || '').trim() || null,
    status,
    capacity
  });
  res.json({ ok: true, status });
});
db.exec(`
CREATE TABLE IF NOT EXISTS password_history (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
`);
