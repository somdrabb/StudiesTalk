const path = require('path');
const fs = require('fs/promises');
const crypto = require('crypto');
const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');

const SNIPPET_LENGTH = 240;
const MAX_FETCH_LIMIT = Math.max(1, Number(process.env.INBOUND_FETCH_LIMIT || 25));
const MAILBOX_NAME = String(process.env.INBOUND_MAILBOX || 'INBOX').trim() || 'INBOX';
const IMAP_LOGGER = {
  debug: (...args) => console.log('[imap][debug]', ...args),
  info: (...args) => console.log('[imap][info]', ...args),
  warn: (...args) => console.warn('[imap][warn]', ...args),
  error: (...args) => console.error('[imap][error]', ...args)
};

const ATTACHMENTS_DIR = path.join(process.cwd(), 'storage', 'email_attachments');
const MAX_ATTACHMENT_SIZE = 15 * 1024 * 1024; // 15 MB
const MAX_ATTACHMENTS_PER_EMAIL = 20;

const IMAP_CONFIG = {
  host: process.env.IONOS_IMAP_HOST,
  port: Number(process.env.IONOS_IMAP_PORT || 993),
  secure: String(process.env.IONOS_IMAP_SECURE || 'true').toLowerCase() === 'true',
  auth: {
    user: process.env.IONOS_IMAP_USER,
    pass: process.env.IONOS_IMAP_PASS,
  }
};
console.log('[InboundEmail] IMAP credentials', {
  user: IMAP_CONFIG.auth.user,
  passLen: String(IMAP_CONFIG.auth.pass || '').length
});

function validateInboundConfig() {
  if (!IMAP_CONFIG.host || !IMAP_CONFIG.auth.user || !IMAP_CONFIG.auth.pass) {
    throw new Error('Inbound email IMAP credentials missing in .env');
  }
}

function isConfigured() {
  return Boolean(IMAP_CONFIG.host && IMAP_CONFIG.auth.user && IMAP_CONFIG.auth.pass);
}

function resolveLimit(requested) {
  const parsed = Number.parseInt(requested, 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.min(parsed, MAX_FETCH_LIMIT);
  }
  return MAX_FETCH_LIMIT;
}

function formatAddressList(list) {
  if (!Array.isArray(list)) return '';
  return list
    .map((item) => {
      if (!item) return '';
      if (typeof item === 'string') return item;
      const address = String(item.address || '').trim();
      const name = String(item.name || '').trim();
      if (name && address) return `${name} <${address}>`;
      return address || name;
    })
    .filter(Boolean)
    .join(', ');
}

function formatSnippet(text) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  if (normalized.length <= SNIPPET_LENGTH) return normalized;
  return `${normalized.slice(0, SNIPPET_LENGTH).trim()}…`;
}

function mapAttachments(attachments = []) {
  if (!Array.isArray(attachments)) return [];
  return attachments.map((att) => ({
    filename: att.filename || '',
    size: att.size || 0,
    contentType: att.contentType || '',
    contentId: att.cid || '',
    disposition: att.contentDisposition || '',
    inline: Boolean(att.cid || att.contentDisposition === 'inline')
  }));
}

function safeName(name = 'file') {
  const cleaned = String(name || '')
    .split(path.sep)
    .pop()
    .trim()
    .replace(/[^\w.\-() ]+/g, '_');
  return cleaned || 'attachment';
}

function extFromType(contentType = '') {
  const lower = String(contentType || '').toLowerCase();
  if (lower.includes('pdf')) return '.pdf';
  if (lower.includes('png')) return '.png';
  if (lower.includes('jpeg') || lower.includes('jpg')) return '.jpg';
  return '';
}

async function ensureAttachmentsDir() {
  try {
    await fs.mkdir(ATTACHMENTS_DIR, { recursive: true });
  } catch (err) {
    if (err?.code !== 'EEXIST') {
      console.warn('[InboundEmail] Failed to create attachments dir', err.message || err);
    }
  }
}

async function persistAttachments(attachments = []) {
  if (!Array.isArray(attachments) || !attachments.length) return [];
  await ensureAttachmentsDir();

  const stored = [];
  for (const att of attachments) {
    if (stored.length >= MAX_ATTACHMENTS_PER_EMAIL) break;
    if (!att) continue;
    const rawContent = att.content;
    if (!rawContent) continue;
    const buffer = Buffer.isBuffer(rawContent) ? rawContent : Buffer.from(String(rawContent));
    const size = Number(att.size || buffer.length || 0);
    if (!size || size > MAX_ATTACHMENT_SIZE) continue;

    const id = crypto.randomBytes(16).toString('hex');
    const filename = safeName(att.filename || `attachment${extFromType(att.contentType)}`);
    const storedName = `${id}-${filename}`;
    const filePath = path.join(ATTACHMENTS_DIR, storedName);

    try {
      await fs.writeFile(filePath, buffer);
    } catch (err) {
      console.warn(
        '[InboundEmail] Failed to save attachment',
        filename,
        err.message || err
      );
      continue;
    }

    stored.push({
      id,
      filename,
      contentType: att.contentType || 'application/octet-stream',
      size,
      storedName,
      inline: Boolean(att.cid || att.contentDisposition === 'inline'),
      contentId: att.cid || ''
    });
  }
  return stored;
}

async function safeParse(source) {
  if (!source) return {};
  try {
    return await simpleParser(source);
  } catch (err) {
    console.warn('[InboundEmail] Failed to parse message body', err?.message || err);
    return {};
  }
}

async function fetchLatestMessages(limit) {
  validateInboundConfig();

  const finalLimit = resolveLimit(limit);
  console.log('[InboundEmail] IMAP_CONFIG', {
    host: IMAP_CONFIG.host,
    port: IMAP_CONFIG.port,
    secure: IMAP_CONFIG.secure,
    disableAuthMethods: IMAP_CONFIG.disableAuthMethods,
    user: IMAP_CONFIG.auth?.user
  });
  const clientConfig = { ...IMAP_CONFIG, logger: IMAP_LOGGER };
  console.log('[InboundEmail] IMAP_CONFIG', {
    host: clientConfig.host,
    port: clientConfig.port,
    secure: clientConfig.secure,
    disableAuthMethods: clientConfig.disableAuthMethods,
    user: clientConfig.auth?.user
  });
  const client = new ImapFlow(clientConfig);
  let lock = null;

  try {
    await client.connect();
    lock = await client.getMailboxLock(MAILBOX_NAME);
    const total = client.mailbox?.exists || 0;
    if (!total) {
      return [];
    }

    const startSeq = Math.max(1, total - finalLimit + 1);
    const range = `${startSeq}:${total}`;
    const messages = [];
    for await (const msg of client.fetch(range, { envelope: true, source: true, uid: true })) {
      const parsed = await safeParse(msg.source);
      const from = formatAddressList(parsed.from?.value || msg.envelope?.from);
      const to = formatAddressList(parsed.to?.value || msg.envelope?.to);
      const subject = String(parsed.subject || msg.envelope?.subject || 'No subject').trim();
      const dateValue = parsed.date || msg.envelope?.date;
      const receivedAt = dateValue
        ? new Date(dateValue).toISOString()
        : new Date().toISOString();
      const snippet =
        parsed.text || parsed.html
          ? formatSnippet(parsed.text || parsed.html)
          : '';

      messages.push({
        uid: msg.uid,
        messageId: String(parsed.messageId || msg.envelope?.messageId || msg.uid),
        subject,
        from,
        to,
        receivedAt,
        snippet,
        bodyText: parsed.text || '',
        bodyHtml: parsed.html || '',
        attachments: mapAttachments(parsed.attachments)
      });
    }

    return messages.reverse();
  } finally {
    if (lock) {
      try {
        await lock.release();
      } catch (err) {
        console.warn('[InboundEmail] Failed to release mailbox lock', err?.message || err);
      }
    }
    try {
      await client.logout();
    } catch (err) {
      // ignore logout errors
    }
  }
}

async function syncInboundEmails(dbInstance, limit) {
  if (!dbInstance) {
    return 0;
  }

  validateInboundConfig();
  const finalLimit = resolveLimit(limit);
  console.log('[InboundEmail] IMAP_CONFIG', {
    host: IMAP_CONFIG.host,
    port: IMAP_CONFIG.port,
    secure: IMAP_CONFIG.secure,
    disableAuthMethods: IMAP_CONFIG.disableAuthMethods,
    user: IMAP_CONFIG.auth?.user
  });
  const clientConfig = { ...IMAP_CONFIG, logger: IMAP_LOGGER };
  console.log('[InboundEmail] IMAP_CONFIG', {
    host: clientConfig.host,
    port: clientConfig.port,
    secure: clientConfig.secure,
    disableAuthMethods: clientConfig.disableAuthMethods,
    user: clientConfig.auth?.user
  });
  const client = new ImapFlow(clientConfig);
  let lock = null;
  const insertStmt = dbInstance.prepare(`
      INSERT OR IGNORE INTO inbound_emails (message_id, sender, subject, text_body, html_body, received_at, attachments_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
  const existsStmt = dbInstance.prepare(`
      SELECT 1 FROM inbound_emails WHERE message_id = ? LIMIT 1
    `);

  try {
    await client.connect();
    lock = await client.getMailboxLock(MAILBOX_NAME);
    console.log('[InboundEmail] sync block hit', {
      finalLimit,
      mailbox: MAILBOX_NAME
    });

    let uids = await client.search({ seen: false });
    console.log('[InboundEmail] UNSEEN uids:', uids?.length || 0);
    if (!uids || !uids.length) {
      uids = await client.search({ all: true });
      console.log('[InboundEmail] ALL uids:', uids?.length || 0);
    }
    if (!uids || !uids.length) {
      return 0;
    }
    const targetUids = uids.slice(-finalLimit);
    const rows = [];
    for await (const msg of client.fetch(targetUids, {
      envelope: true,
      source: true,
      uid: true,
      flags: true,
      internalDate: true
    })) {
      const uid = msg.uid;
      const parsed = await safeParse(msg.source);
      const sender = formatAddressList(parsed.from?.value || msg.envelope?.from);
      const subject = String(parsed.subject || msg.envelope?.subject || '').trim();
      const bodyText = parsed.text || '';
      const bodyHtml = parsed.html || '';
      const receivedAt = msg.internalDate
        ? new Date(msg.internalDate).toISOString()
        : parsed.date
        ? new Date(parsed.date).toISOString()
        : new Date().toISOString();
      const messageId = String(parsed.messageId || msg.envelope?.messageId || msg.uid);
      if (existsStmt.get(messageId)) continue;
      const attachmentsMeta = await persistAttachments(parsed.attachments);
      const attachmentsJson = JSON.stringify(attachmentsMeta);
      rows.push({
        uid,
        envelope: msg.envelope,
        parsed,
        messageId,
        sender,
        subject,
        bodyText,
        bodyHtml,
        receivedAt,
        attachmentsJson
      });
    }
    rows.sort((a, b) => {
      if (a.receivedAt === b.receivedAt) return b.uid - a.uid;
      return a.receivedAt < b.receivedAt ? 1 : -1;
    });
    for (const row of rows) {
      insertStmt.run(
        row.messageId,
        row.sender,
        row.subject,
        row.bodyText,
        row.bodyHtml,
        row.receivedAt,
        row.attachmentsJson
      );
      await client.messageFlagsAdd(row.uid, ['\\Seen']);
    }
    return rows.length;
  } finally {
    if (lock) {
      try {
        await lock.release();
      } catch (err) {
        console.warn('[InboundEmail] Failed to release mailbox lock', err?.message || err);
      }
    }
    try {
      await client.logout();
    } catch (err) {
      // ignore logout errors
    }
  }
}

async function cleanupOrphanAttachments(dbInstance) {
  if (!dbInstance) return;
  let rows = [];
  try {
    rows = dbInstance
      .prepare('SELECT attachments_json FROM inbound_emails WHERE attachments_json IS NOT NULL AND attachments_json != ""')
      .all();
  } catch (err) {
    console.warn('[InboundEmail] Failed to query attachments for cleanup', err?.message || err);
    return;
  }

  const referenced = new Set();
  for (const row of rows) {
    if (!row) continue;
    let parsed = [];
    try {
      parsed = JSON.parse(row.attachments_json || '[]');
    } catch (err) {
      continue;
    }
    if (!Array.isArray(parsed)) continue;
    parsed.forEach((att) => {
      if (att && att.storedName) {
        referenced.add(String(att.storedName));
      }
    });
  }

  let files = [];
  try {
    files = await fs.readdir(ATTACHMENTS_DIR);
  } catch (err) {
    console.warn('[InboundEmail] Attachment cleanup failed to read directory', err?.message || err);
    return;
  }

  for (const filename of files) {
    if (!filename) continue;
    const filePath = path.join(ATTACHMENTS_DIR, filename);
    try {
      const stats = await fs.stat(filePath);
      if (!stats.isFile()) continue;
      if (referenced.has(filename)) continue;
      await fs.unlink(filePath);
    } catch (err) {
      console.warn('[InboundEmail] Attachment cleanup failed for', filename, err?.message || err);
    }
  }
}

module.exports = {
  fetchLatestMessages,
  isConfigured,
  syncInboundEmails,
  cleanupOrphanAttachments
};
