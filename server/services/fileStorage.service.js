'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pipeline } = require('stream/promises');

function normalizeMimeType(value = '') {
  return String(value || '').trim().toLowerCase();
}

function normalizeFileName(fileName = '', fallbackBase = 'file') {
  const base = path.basename(String(fileName || ''));
  const cleaned = base
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/[\\/:"*?<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
  if (!cleaned || cleaned === '.' || cleaned === '..') {
    return fallbackBase;
  }
  return cleaned;
}

function sanitizeExtension(fileName = '') {
  const ext = path.extname(String(fileName || '')).trim().toLowerCase();
  return /^[.a-z0-9_-]{0,16}$/.test(ext) ? ext : '';
}

function normalizePermissions(permissions = 'workspace_private') {
  const normalized = String(permissions || '').trim().toLowerCase();
  if (!normalized) return 'workspace_private';
  return normalized;
}

function isPrivatePermission(permissions = '') {
  return normalizePermissions(permissions) !== 'workspace_public';
}

function getUploadKind({ mimeType = '', fileName = '' } = {}) {
  const normalizedMime = normalizeMimeType(mimeType);
  const ext = sanitizeExtension(fileName);
  if (normalizedMime.startsWith('image/') || ['.gif', '.heic', '.heif', '.jpeg', '.jpg', '.png', '.webp'].includes(ext)) {
    return 'image';
  }
  if (normalizedMime.startsWith('audio/') || ['.aac', '.m4a', '.mp3', '.ogg', '.wav', '.webm'].includes(ext)) {
    return 'audio';
  }
  if (normalizedMime.startsWith('video/') || ['.avi', '.mov', '.mp4', '.ogg', '.webm'].includes(ext)) {
    return 'video';
  }
  return 'document';
}

function getTypeMaxBytes({ mimeType = '', fileName = '', globalMaxBytes = 25 * 1024 * 1024 } = {}) {
  const kind = getUploadKind({ mimeType, fileName });
  const defaults = {
    image: 10 * 1024 * 1024,
    document: 25 * 1024 * 1024,
    audio: 50 * 1024 * 1024,
    video: 200 * 1024 * 1024
  };
  const baseLimit = defaults[kind] || defaults.document;
  const hardCap = Number.isFinite(Number(globalMaxBytes)) && Number(globalMaxBytes) > 0
    ? Number(globalMaxBytes)
    : baseLimit;
  return {
    kind,
    maxBytes: Math.min(baseLimit, hardCap)
  };
}

async function sha256File(inputPath) {
  const hash = crypto.createHash('sha256');
  await pipeline(
    fs.createReadStream(inputPath),
    async function* (source) {
      for await (const chunk of source) {
        hash.update(chunk);
        yield chunk;
      }
    },
    fs.createWriteStream('/dev/null')
  ).catch((err) => {
    if (String(process.platform) === 'win32') return Promise.reject(err);
    throw err;
  });
  return hash.digest('hex');
}

async function hashFileFallback(inputPath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const input = fs.createReadStream(inputPath);
    input.on('data', (chunk) => hash.update(chunk));
    input.on('error', reject);
    input.on('end', () => resolve(hash.digest('hex')));
  });
}

function buildManagedFileUrl(storageKey = '') {
  const safeSegments = String(storageKey || '')
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment));
  return `/uploads/files/${safeSegments.join('/')}`;
}

function storageKeyFromManagedUrl(url = '') {
  const normalized = String(url || '').trim();
  if (!normalized.startsWith('/uploads/files/')) return '';
  const tail = normalized.slice('/uploads/files/'.length);
  if (!tail) return '';
  try {
    return tail
      .split('/')
      .map((segment) => decodeURIComponent(segment))
      .join('/');
  } catch (_err) {
    return '';
  }
}

async function encryptToTempFile({ inputPath, keyBuffer }) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyBuffer, iv);
  const tempPath = path.join(os.tmpdir(), `studiestalk-file-${Date.now()}-${crypto.randomBytes(8).toString('hex')}.bin`);
  await pipeline(
    fs.createReadStream(inputPath),
    cipher,
    fs.createWriteStream(tempPath)
  );
  return {
    tempPath,
    ivHex: iv.toString('hex'),
    tagHex: cipher.getAuthTag().toString('hex')
  };
}

function createFileStorageService({
  adapter,
  globalMaxBytes = 25 * 1024 * 1024,
  perTypeMaxBytes = {},
  encryptionEnabled = false,
  encryptionKeyHex = '',
  encryptionKeyId = 'file-key-v1',
  findExistingObjectMetadata = null
}) {
  if (!adapter) {
    throw new Error('File storage adapter is required.');
  }

  const normalizedKeyHex = String(encryptionKeyHex || '').trim().toLowerCase();
  const encryptionKeyBuffer =
    encryptionEnabled && /^[a-f0-9]{64}$/.test(normalizedKeyHex)
      ? Buffer.from(normalizedKeyHex, 'hex')
      : null;

  if (encryptionEnabled && !encryptionKeyBuffer) {
    throw new Error('FILE_STORAGE_ENCRYPTION_KEY must be 64 hex characters when encryption is enabled.');
  }

  async function hashFile(inputPath) {
    try {
      return await hashFileFallback(inputPath);
    } catch (_err) {
      return sha256File(inputPath);
    }
  }

  function resolveTypeMaxBytes({ mimeType = '', fileName = '' } = {}) {
    const resolved = getTypeMaxBytes({ mimeType, fileName, globalMaxBytes });
    const configuredLimit = Number(perTypeMaxBytes?.[resolved.kind]);
    if (Number.isFinite(configuredLimit) && configuredLimit > 0) {
      return {
        kind: resolved.kind,
        maxBytes: Math.min(resolved.maxBytes, configuredLimit)
      };
    }
    return resolved;
  }

  function buildStorageKey({ workspaceId = '', checksum = '', fileName = '', encrypted = false }) {
    const ext = sanitizeExtension(fileName);
    const suffix = encrypted ? '.enc' : ext;
    return [
      String(workspaceId || 'default').trim() || 'default',
      checksum.slice(0, 2),
      `${checksum}${suffix || ''}`
    ].join('/');
  }

  function buildRecoveryStorageKey(baseStorageKey = '') {
    const normalized = String(baseStorageKey || '').trim();
    if (!normalized) return '';
    const suffix = `.recovery-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    if (normalized.endsWith('.enc')) {
      return `${normalized.slice(0, -'.enc'.length)}${suffix}.enc`;
    }
    const ext = path.extname(normalized);
    if (ext) {
      return `${normalized.slice(0, -ext.length)}${suffix}${ext}`;
    }
    return `${normalized}${suffix}`;
  }

  async function storeFromFile({
    inputPath,
    workspaceId = 'default',
    originalName = 'file',
    mimeType = 'application/octet-stream',
    permissions = 'workspace_private'
  }) {
    const stat = await fs.promises.stat(inputPath);
    const safeName = normalizeFileName(originalName, 'upload');
    const { kind, maxBytes } = resolveTypeMaxBytes({
      mimeType,
      fileName: safeName,
    });
    if (Number(stat.size || 0) > maxBytes) {
      const err = new Error(`File exceeds ${kind} size limit of ${Math.floor(maxBytes / (1024 * 1024))} MB.`);
      err.statusCode = 400;
      throw err;
    }

    const checksum = await hashFile(inputPath);
    const shouldEncrypt = Boolean(encryptionEnabled && isPrivatePermission(permissions));
    const deterministicStorageKey = buildStorageKey({
      workspaceId,
      checksum,
      fileName: safeName,
      encrypted: shouldEncrypt
    });
    let storageKey = deterministicStorageKey;
    const normalizedPermissions = normalizePermissions(permissions);
    const storageMode = shouldEncrypt ? 'encrypted' : 'plain';
    const storedMeta = typeof findExistingObjectMetadata === 'function'
      ? await findExistingObjectMetadata({
          storageKey: deterministicStorageKey,
          checksum,
          workspaceId,
          permissions: normalizedPermissions,
          storageProvider: adapter.providerName,
          storageMode
        })
      : null;
    let exists = false;

    let encryptionIv = null;
    let encryptionTag = null;
    let encryptionKeyIdValue = null;
    let deduped = false;

    if (storedMeta?.storageKey) {
      storageKey = String(storedMeta.storageKey || '').trim() || deterministicStorageKey;
      exists = await adapter.exists(storageKey);
      deduped = true;
      encryptionIv = storedMeta?.encryptionIv || null;
      encryptionTag = storedMeta?.encryptionTag || null;
      encryptionKeyIdValue = storedMeta?.encryptionKeyId || null;
      if (!exists) {
        deduped = false;
        storageKey = deterministicStorageKey;
        encryptionIv = null;
        encryptionTag = null;
        encryptionKeyIdValue = null;
      }
    } else {
      exists = await adapter.exists(deterministicStorageKey);
      if (exists) {
        storageKey = buildRecoveryStorageKey(deterministicStorageKey);
        exists = false;
        deduped = false;
        encryptionIv = null;
        encryptionTag = null;
        encryptionKeyIdValue = null;
      }
    }

    if (!exists && shouldEncrypt) {
      const encrypted = await encryptToTempFile({
        inputPath,
        keyBuffer: encryptionKeyBuffer
      });
      try {
        await adapter.putFile({ key: storageKey, sourcePath: encrypted.tempPath });
      } finally {
        await fs.promises.unlink(encrypted.tempPath).catch(() => null);
      }
      encryptionIv = encrypted.ivHex;
      encryptionTag = encrypted.tagHex;
      encryptionKeyIdValue = encryptionKeyId;
    } else if (!exists) {
      await adapter.putFile({ key: storageKey, sourcePath: inputPath });
    }

    return {
      storageProvider: adapter.providerName,
      storageMode: shouldEncrypt ? 'encrypted' : 'plain',
      storageKey,
      checksum,
      url: buildManagedFileUrl(storageKey),
      sizeBytes: Number(stat.size || 0),
      mimeType,
      originalName: safeName,
      permissions: normalizedPermissions,
      encryptionKeyId: encryptionKeyIdValue,
      encryptionIv,
      encryptionTag,
      deduped,
      cleanupOnFailure: !deduped
    };
  }

  async function hasManagedUpload(url = '') {
    const storageKey = storageKeyFromManagedUrl(url);
    if (!storageKey) return false;
    return adapter.exists(storageKey);
  }

  function createReadStream(record = {}) {
    const storageKey = String(record.storageKey || '').trim();
    if (!storageKey) return null;
    const input = adapter.createReadStream(storageKey);
    if (String(record.storageMode || '').trim().toLowerCase() !== 'encrypted') {
      return input;
    }
    const iv = Buffer.from(String(record.encryptionIv || ''), 'hex');
    const tag = Buffer.from(String(record.encryptionTag || ''), 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKeyBuffer, iv);
    decipher.setAuthTag(tag);
    return input.pipe(decipher);
  }

  return {
    adapter,
    buildManagedFileUrl,
    storageKeyFromManagedUrl,
    normalizePermissions,
    isPrivatePermission,
    getTypeMaxBytes,
    async storeFromFile(input) {
      return storeFromFile(input);
    },
    async hasManagedUpload(url) {
      return hasManagedUpload(url);
    },
    createReadStream(record) {
      return createReadStream(record);
    },
    async deleteObject(record = {}) {
      const storageKey = String(record.storageKey || '').trim();
      if (!storageKey) return { ok: true };
      await adapter.delete(storageKey);
      return { ok: true };
    }
  };
}

module.exports = {
  buildManagedFileUrl,
  createFileStorageService,
  getTypeMaxBytes,
  normalizePermissions,
  storageKeyFromManagedUrl
};
