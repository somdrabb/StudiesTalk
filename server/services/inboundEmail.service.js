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
const SPAM_WORDS = [
  'free money',
  'winner',
  'prize',
  'urgent offer',
  'click here',
  'limited time',
  'act now',
  'crypto',
  'wire transfer',
  'guaranteed',
  'viagra',
  'casino',
  'loan approved'
];
const SUSPICIOUS_TLDS = new Set(['zip', 'mov', 'click', 'xyz', 'top', 'gq', 'tk', 'ml']);
const SUSPICIOUS_ATTACHMENT_EXTENSIONS = new Set(['exe', 'scr', 'bat', 'cmd', 'js', 'vbs', 'jar', 'iso']);

const IMAP_CONFIG = {
  host: process.env.IONOS_IMAP_HOST,
  port: Number(process.env.IONOS_IMAP_PORT || 993),
  secure: String(process.env.IONOS_IMAP_SECURE || 'true').toLowerCase() === 'true',
  auth: {
    user: process.env.IONOS_IMAP_USER,
    pass: process.env.IONOS_IMAP_PASS,
  }
};

function createImapClient(contextLabel) {
  const clientConfig = { ...IMAP_CONFIG, logger: IMAP_LOGGER };
  console.log('[InboundEmail] IMAP client config', {
    host: clientConfig.host,
    port: clientConfig.port,
    secure: clientConfig.secure,
    disableAuthMethods: clientConfig.disableAuthMethods,
    authConfigured: Boolean(clientConfig.auth?.user && clientConfig.auth?.pass)
  });

  const client = new ImapFlow(clientConfig);
  const handleError = (err) => {
    console.warn(
      `[InboundEmail] IMAP client error during ${contextLabel}`,
      err?.code || '',
      err?.message || err
    );
  };
  client.on('error', handleError);

  return { client, handleError };
}

async function closeImapClient(client, handleError) {
  if (!client) return;
  try {
    if (client.usable) {
      await client.logout();
    } else {
      client.close();
    }
  } catch (err) {
    client.close();
  } finally {
    if (handleError) {
      client.off('error', handleError);
    }
  }
}

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

function normalizeEmailAddress(value = '') {
  return String(value || '').trim().toLowerCase();
}

function extractPrimaryAddress(value) {
  if (Array.isArray(value)) {
    const first = value.find((entry) => entry && (entry.address || entry.name || entry.email));
    if (!first) return '';
    return String(first.address || first.email || '').trim();
  }

  const hint = String(value || '').trim();
  if (!hint) return '';
  const match = hint.match(/<([^>]+)>/);
  const raw = match ? match[1] : hint;
  return raw.replace(/^"+|"+$/g, '').trim();
}

function normalizeMessageId(value = '') {
  return String(value || '').trim();
}

function classifyInboundSpam({ sender = '', subject = '', bodyText = '', bodyHtml = '', attachments = [], headers = {} } = {}) {
  const reasons = [];
  let score = 0;
  const senderText = String(sender || '').toLowerCase();
  const senderDomain = (senderText.match(/@([^>\s]+)/)?.[1] || '').replace(/[>),.;]+$/g, '');
  const tld = senderDomain.split('.').pop() || '';
  const plainBody = String(bodyText || bodyHtml || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const combined = `${senderText} ${String(subject || '').toLowerCase()} ${plainBody.toLowerCase()}`;

  if (!senderDomain || SUSPICIOUS_TLDS.has(tld)) {
    score += 18;
    reasons.push(senderDomain ? `suspicious sender domain .${tld}` : 'missing sender domain');
  }
  if (plainBody.length < 18) {
    score += 18;
    reasons.push('empty or very short body');
  }
  const links = combined.match(/https?:\/\/|www\./g) || [];
  if (links.length >= 5) {
    score += 28;
    reasons.push('many links');
  } else if (links.length >= 2) {
    score += 14;
    reasons.push('multiple links');
  }
  if (/(.)\1{7,}/.test(combined)) {
    score += 12;
    reasons.push('repeated characters');
  }
  const matchedWords = SPAM_WORDS.filter((word) => combined.includes(word));
  if (matchedWords.length) {
    score += Math.min(30, matchedWords.length * 10);
    reasons.push(`spam terms: ${matchedWords.slice(0, 4).join(', ')}`);
  }
  const suspiciousAttachments = (Array.isArray(attachments) ? attachments : []).filter((att) => {
    const filename = String(att?.filename || att?.name || '').toLowerCase();
    const ext = filename.includes('.') ? filename.split('.').pop() : '';
    return SUSPICIOUS_ATTACHMENT_EXTENSIONS.has(ext);
  });
  if (suspiciousAttachments.length) {
    score += 25;
    reasons.push('suspicious attachment type');
  }
  const authText = JSON.stringify(headers || {}).toLowerCase();
  if (/(spf|dkim|dmarc)[^a-z0-9]+(fail|failed|none|temperror|permerror)/.test(authText)) {
    score += 24;
    reasons.push('mail authentication failure');
  }

  const finalScore = Math.max(0, Math.min(100, score));
  const status = finalScore >= 70 ? 'spam' : finalScore >= 40 ? 'suspected' : 'clean';
  return {
    status,
    reason: reasons.join('; '),
    score: finalScore
  };
}

function joinReferenceHeader(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeMessageId(entry)).filter(Boolean).join(' ').trim();
  }
  return String(value || '').trim();
}

function extractMessageIds(value = '') {
  const text = String(value || '').trim();
  if (!text) return [];
  const matches = text.match(/<[^>]+>/g);
  if (Array.isArray(matches) && matches.length) {
    return matches.map((entry) => normalizeMessageId(entry)).filter(Boolean);
  }
  return text
    .split(/\s+/)
    .map((entry) => normalizeMessageId(entry))
    .filter(Boolean);
}

function resolveWorkspaceFromOutboundLog(dbInstance, parsed = {}) {
  if (!dbInstance) return { workspaceId: '', relatedEmailLogId: '' };
  const candidates = [
    normalizeMessageId(parsed.inReplyTo || ''),
    ...extractMessageIds(joinReferenceHeader(parsed.references))
  ].filter(Boolean);
  if (!candidates.length) {
    return { workspaceId: '', relatedEmailLogId: '' };
  }

  const lookup = dbInstance.prepare(`
    SELECT id, workspace_id
    FROM workspace_email_logs
    WHERE message_id = ?
    ORDER BY created_at DESC
    LIMIT 1
  `);

  for (const candidate of candidates) {
    const found = lookup.get(candidate);
    if (found?.id) {
      return {
        workspaceId: String(found.workspace_id || '').trim(),
        relatedEmailLogId: String(found.id || '').trim()
      };
    }
  }

  return { workspaceId: '', relatedEmailLogId: '' };
}

function resolveSenderWorkspace(dbInstance, parsed = {}, envelope = {}) {
  if (!dbInstance) {
    return { workspaceId: '', senderUserId: '', senderRole: '', senderEmail: '', matchStatus: 'missing-db' };
  }

  const senderEmail = normalizeEmailAddress(
    extractPrimaryAddress(parsed.from?.value || envelope?.from || parsed.sender?.value || '')
  );
  if (!senderEmail) {
    return { workspaceId: '', senderUserId: '', senderRole: '', senderEmail: '', matchStatus: 'missing-email' };
  }

  const matches = dbInstance
    .prepare(
      `
      SELECT id, workspace_id, role, email
      FROM users
      WHERE lower(email) = ?
    `
    )
    .all(senderEmail);

  if (!Array.isArray(matches) || !matches.length) {
    return {
      workspaceId: '',
      senderUserId: '',
      senderRole: '',
      senderEmail,
      matchStatus: 'no-match'
    };
  }

  const distinctWorkspaceIds = Array.from(
    new Set(matches.map((row) => String(row?.workspace_id || '').trim()).filter(Boolean))
  );
  if (distinctWorkspaceIds.length !== 1) {
    return {
      workspaceId: '',
      senderUserId: '',
      senderRole: '',
      senderEmail,
      matchStatus: 'ambiguous'
    };
  }

  const found = matches[0];

  return {
    workspaceId: String(found?.workspace_id || '').trim(),
    senderUserId: String(found?.id || '').trim(),
    senderRole: String(found?.role || '').trim().toLowerCase(),
    senderEmail,
    matchStatus: 'matched'
  };
}

function resolveInboundWorkspaceAssignment(threadLink = {}, senderLink = {}) {
  const threadWorkspaceId = String(threadLink?.workspaceId || '').trim();
  const senderWorkspaceId = String(senderLink?.workspaceId || '').trim();

  if (threadWorkspaceId && senderWorkspaceId && threadWorkspaceId !== senderWorkspaceId) {
    return {
      workspaceId: '',
      relatedEmailLogId: '',
      reason: 'workspace-mismatch'
    };
  }
  if (threadWorkspaceId) {
    return {
      workspaceId: threadWorkspaceId,
      relatedEmailLogId: String(threadLink?.relatedEmailLogId || '').trim(),
      reason: 'thread'
    };
  }
  if (senderWorkspaceId) {
    return {
      workspaceId: senderWorkspaceId,
      relatedEmailLogId: '',
      reason: 'sender'
    };
  }
  return {
    workspaceId: '',
    relatedEmailLogId: '',
    reason: String(senderLink?.matchStatus || 'unresolved')
  };
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
  console.log('[InboundEmail] IMAP config', {
    host: IMAP_CONFIG.host,
    port: IMAP_CONFIG.port,
    secure: IMAP_CONFIG.secure,
    disableAuthMethods: IMAP_CONFIG.disableAuthMethods,
    authConfigured: Boolean(IMAP_CONFIG.auth?.user && IMAP_CONFIG.auth?.pass)
  });
  const { client, handleError } = createImapClient('fetchLatestMessages');
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
    await closeImapClient(client, handleError);
  }
}

async function syncInboundEmails(dbInstance, limit) {
  if (!dbInstance) {
    return 0;
  }

  validateInboundConfig();
  const finalLimit = resolveLimit(limit);
  console.log('[InboundEmail] IMAP config', {
    host: IMAP_CONFIG.host,
    port: IMAP_CONFIG.port,
    secure: IMAP_CONFIG.secure,
    disableAuthMethods: IMAP_CONFIG.disableAuthMethods,
    authConfigured: Boolean(IMAP_CONFIG.auth?.user && IMAP_CONFIG.auth?.pass)
  });
  const { client, handleError } = createImapClient('syncInboundEmails');
  let lock = null;
  const insertStmt = dbInstance.prepare(`
      INSERT OR IGNORE INTO inbound_emails (
        workspace_id, message_id, sender, recipient, subject,
        text_body, html_body, in_reply_to, references_header, related_email_log_id,
        folder, attachments_json, received_at, is_read,
        mailbox_type, mailbox_owner_user_id, sender_user_id, recipient_user_id,
        direction, visibility_scope, sender_role,
        spam_status, spam_reason, spam_score
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'inbox', ?, ?, 0, 'workspace', '', ?, '', 'inbound', 'workspace', ?, ?, ?, ?)
    `);
  const existsStmt = dbInstance.prepare(`
      SELECT 1 FROM inbound_emails WHERE message_id = ? LIMIT 1
    `);
  const deletedStmt = dbInstance.prepare(`
      SELECT 1 FROM deleted_inbound_emails WHERE message_id = ? LIMIT 1
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
      const recipient = formatAddressList(parsed.to?.value || msg.envelope?.to);
      const subject = String(parsed.subject || msg.envelope?.subject || '').trim();
      const bodyText = parsed.text || '';
      const bodyHtml = parsed.html || '';
      const receivedAt = msg.internalDate
        ? new Date(msg.internalDate).toISOString()
        : parsed.date
        ? new Date(parsed.date).toISOString()
        : new Date().toISOString();
      const messageId = String(parsed.messageId || msg.envelope?.messageId || msg.uid);
      if (deletedStmt.get(messageId)) continue;
      if (existsStmt.get(messageId)) continue;
      const inReplyTo = normalizeMessageId(parsed.inReplyTo || '');
      const referencesHeader = joinReferenceHeader(parsed.references);
      const threadLink = resolveWorkspaceFromOutboundLog(dbInstance, parsed);
      const senderLink = resolveSenderWorkspace(dbInstance, parsed, msg.envelope);
      const assignment = resolveInboundWorkspaceAssignment(threadLink, senderLink);
      const attachmentsMeta = await persistAttachments(parsed.attachments);
      const attachmentsJson = JSON.stringify(attachmentsMeta);
      const spamClassification = classifyInboundSpam({
        sender,
        subject,
        bodyText,
        bodyHtml,
        attachments: attachmentsMeta,
        headers: parsed.headers ? Object.fromEntries(parsed.headers) : {}
      });
      rows.push({
        uid,
        envelope: msg.envelope,
        parsed,
        workspaceId: assignment.workspaceId,
        messageId,
        sender,
        recipient,
        subject,
        bodyText,
        bodyHtml,
        inReplyTo,
        referencesHeader,
        relatedEmailLogId: assignment.relatedEmailLogId,
        receivedAt,
        attachmentsJson,
        senderUserId: senderLink.senderUserId,
        senderRole: senderLink.senderRole,
        routingReason: assignment.reason,
        senderEmail: senderLink.senderEmail,
        spamStatus: spamClassification.status,
        spamReason: spamClassification.reason,
        spamScore: spamClassification.score
      });
    }
    rows.sort((a, b) => {
      if (a.receivedAt === b.receivedAt) return b.uid - a.uid;
      return a.receivedAt < b.receivedAt ? 1 : -1;
    });
    for (const row of rows) {
      if (!row.workspaceId) {
        console.warn('[InboundEmail] Skipping unroutable inbound email', {
          messageId: row.messageId,
          senderEmail: row.senderEmail,
          reason: row.routingReason
        });
        continue;
      }
      insertStmt.run(
        row.workspaceId,
        row.messageId,
        row.sender,
        row.recipient,
        row.subject,
        row.bodyText,
        row.bodyHtml,
        row.inReplyTo,
        row.referencesHeader,
        row.relatedEmailLogId,
        row.attachmentsJson,
        row.receivedAt,
        row.senderUserId,
        row.senderRole,
        row.spamStatus,
        row.spamReason,
        row.spamScore
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
    await closeImapClient(client, handleError);
  }
}

async function cleanupOrphanAttachments(dbInstance) {
  if (!dbInstance) return;
  try {
    const table = dbInstance
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'inbound_emails'")
      .get();
    if (!table) return;
  } catch (err) {
    console.warn('[InboundEmail] Failed to inspect inbound email table', err?.message || err);
    return;
  }
  let rows = [];
  try {
    rows = dbInstance
      .prepare("SELECT attachments_json FROM inbound_emails WHERE attachments_json IS NOT NULL AND attachments_json != ''")
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
  classifyInboundSpam,
  fetchLatestMessages,
  isConfigured,
  syncInboundEmails,
  cleanupOrphanAttachments
};
