'use strict';

const crypto = require('crypto');
const fs = require('fs');
const { PassThrough, Readable } = require('stream');

function sha256Hex(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function hmac(key, value, encoding) {
  return crypto.createHmac('sha256', key).update(value).digest(encoding);
}

function toAmzDate(date = new Date()) {
  const iso = new Date(date).toISOString();
  return iso.replace(/[:-]|\.\d{3}/g, '');
}

function toDateStamp(amzDate = '') {
  return String(amzDate || '').slice(0, 8);
}

function encodeKeyPath(key = '') {
  return String(key || '')
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function normalizeHeaderValue(value = '') {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function normalizeEndpoint(endpoint = '') {
  const raw = String(endpoint || '').trim();
  if (!raw) {
    throw new Error('S3 endpoint is required.');
  }
  const url = new URL(raw);
  url.pathname = '/';
  url.search = '';
  url.hash = '';
  return url;
}

function isNotFound(response) {
  return response && response.status === 404;
}

function isSuccessful(response) {
  return response && response.status >= 200 && response.status < 300;
}

function xmlEscape(value = '') {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

async function sha256FileHex(inputPath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const input = fs.createReadStream(inputPath);
    input.on('data', (chunk) => hash.update(chunk));
    input.on('error', reject);
    input.on('end', () => resolve(hash.digest('hex')));
  });
}

function createS3CompatibleStorageAdapter(options = {}) {
  const endpointUrl = normalizeEndpoint(options.endpoint);
  const bucket = String(options.bucket || '').trim();
  const region = String(options.region || 'auto').trim() || 'auto';
  const accessKeyId = String(options.accessKeyId || '').trim();
  const secretAccessKey = String(options.secretAccessKey || '').trim();
  const forcePathStyle = Boolean(options.forcePathStyle);
  const providerName = String(options.providerName || 's3_compatible').trim() || 's3_compatible';
  const fetchImpl = options.fetchImpl || global.fetch;
  const now = typeof options.now === 'function' ? options.now : () => new Date();

  if (!bucket) throw new Error('S3 bucket is required.');
  if (!accessKeyId) throw new Error('S3 access key id is required.');
  if (!secretAccessKey) throw new Error('S3 secret access key is required.');
  if (typeof fetchImpl !== 'function') throw new Error('S3-compatible adapter requires fetch support.');

  function buildObjectUrl(key = '') {
    const encodedKey = encodeKeyPath(key);
    const url = new URL(endpointUrl.toString());
    if (forcePathStyle) {
      url.pathname = `/${encodeURIComponent(bucket)}${encodedKey ? `/${encodedKey}` : ''}`;
    } else {
      url.hostname = `${bucket}.${url.hostname}`;
      url.pathname = encodedKey ? `/${encodedKey}` : '/';
    }
    return url;
  }

  function buildSigningHeaders({ method, url, payloadHash, extraHeaders = {}, body = null }) {
    const amzDate = toAmzDate(now());
    const dateStamp = toDateStamp(amzDate);
    const lowerCaseHeaders = new Map();
    lowerCaseHeaders.set('host', url.host);
    lowerCaseHeaders.set('x-amz-content-sha256', payloadHash);
    lowerCaseHeaders.set('x-amz-date', amzDate);
    for (const [headerName, headerValue] of Object.entries(extraHeaders || {})) {
      if (headerValue === undefined || headerValue === null || headerValue === '') continue;
      lowerCaseHeaders.set(String(headerName).trim().toLowerCase(), normalizeHeaderValue(headerValue));
    }

    const sortedEntries = [...lowerCaseHeaders.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    const canonicalHeaders = sortedEntries.map(([name, value]) => `${name}:${value}\n`).join('');
    const signedHeaders = sortedEntries.map(([name]) => name).join(';');
    const canonicalRequest = [
      method,
      url.pathname || '/',
      url.search ? url.search.slice(1) : '',
      canonicalHeaders,
      signedHeaders,
      payloadHash
    ].join('\n');
    const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      credentialScope,
      sha256Hex(canonicalRequest)
    ].join('\n');

    const kDate = hmac(Buffer.from(`AWS4${secretAccessKey}`, 'utf8'), dateStamp);
    const kRegion = hmac(kDate, region);
    const kService = hmac(kRegion, 's3');
    const kSigning = hmac(kService, 'aws4_request');
    const signature = hmac(kSigning, stringToSign, 'hex');

    const headers = {};
    for (const [name, value] of sortedEntries) {
      headers[name] = value;
    }
    headers.authorization = [
      `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}`,
      `SignedHeaders=${signedHeaders}`,
      `Signature=${signature}`
    ].join(', ');

    return {
      method,
      headers,
      body
    };
  }

  async function requestText(method, key, { payloadHash, extraHeaders = {}, body = null, allow404 = false } = {}) {
    const url = buildObjectUrl(key);
    const signed = buildSigningHeaders({ method, url, payloadHash, extraHeaders, body });
    const requestOptions = { ...signed };
    if (body && typeof body.pipe === 'function') {
      requestOptions.duplex = 'half';
    }
    const response = await fetchImpl(url, requestOptions);
    if (allow404 && isNotFound(response)) return null;
    if (!isSuccessful(response)) {
      const responseText = await response.text().catch(() => '');
      const err = new Error(`S3 request failed: ${method} ${url} => ${response.status}${responseText ? ` ${responseText}` : ''}`);
      err.code = 'S3_REQUEST_FAILED';
      err.statusCode = response.status;
      throw err;
    }
    return response;
  }

  return {
    providerName,
    bucket,
    endpoint: endpointUrl.toString(),
    region,
    forcePathStyle,
    buildObjectUrl,
    async exists(key) {
      const response = await requestText('HEAD', key, {
        payloadHash: sha256Hex(''),
        allow404: true
      });
      return Boolean(response);
    },
    async putFile({ key, sourcePath }) {
      const fileStat = await fs.promises.stat(sourcePath);
      const payloadHash = await sha256FileHex(sourcePath);
      const contentType = 'application/octet-stream';
      await requestText('PUT', key, {
        payloadHash,
        extraHeaders: {
          'content-length': String(fileStat.size || 0),
          'content-type': contentType
        },
        body: fs.createReadStream(sourcePath)
      });
      return { key, deduped: false };
    },
    async putText({ key, text }) {
      const body = Buffer.from(String(text || ''), 'utf8');
      await requestText('PUT', key, {
        payloadHash: sha256Hex(body),
        extraHeaders: {
          'content-length': String(body.length),
          'content-type': 'application/json; charset=utf-8'
        },
        body
      });
      return { key };
    },
    async getText(key) {
      const response = await requestText('GET', key, {
        payloadHash: sha256Hex('')
      });
      return response.text();
    },
    createReadStream(key) {
      const stream = new PassThrough();
      (async () => {
        try {
          const response = await requestText('GET', key, {
            payloadHash: sha256Hex('')
          });
          if (!response.body) {
            stream.end();
            return;
          }
          const bodyStream = typeof Readable.fromWeb === 'function'
            ? Readable.fromWeb(response.body)
            : response.body;
          bodyStream.on('error', (err) => stream.destroy(err));
          bodyStream.pipe(stream);
        } catch (err) {
          stream.destroy(err);
        }
      })();
      return stream;
    },
    async stat(key) {
      const response = await requestText('HEAD', key, {
        payloadHash: sha256Hex('')
      });
      const size = Number(response.headers.get('content-length') || 0);
      const lastModified = response.headers.get('last-modified');
      return {
        size,
        mtime: lastModified ? new Date(lastModified) : null,
        etag: response.headers.get('etag') || null,
        contentType: response.headers.get('content-type') || null
      };
    },
    async delete(key) {
      await requestText('DELETE', key, {
        payloadHash: sha256Hex(''),
        allow404: true
      });
      return { ok: true };
    },
    async listKeys(prefix = '') {
      const url = buildObjectUrl('');
      url.searchParams.set('list-type', '2');
      if (prefix) url.searchParams.set('prefix', String(prefix));
      const signed = buildSigningHeaders({
        method: 'GET',
        url,
        payloadHash: sha256Hex('')
      });
      const response = await fetchImpl(url, signed);
      if (!isSuccessful(response)) {
        const responseText = await response.text().catch(() => '');
        const err = new Error(`S3 list failed: GET ${url} => ${response.status}${responseText ? ` ${responseText}` : ''}`);
        err.code = 'S3_LIST_FAILED';
        err.statusCode = response.status;
        throw err;
      }
      const xml = await response.text();
      const keys = [...xml.matchAll(/<Key>([^<]+)<\/Key>/g)].map((match) => String(match[1] || ''));
      return keys.filter(Boolean);
    },
    async deleteKeys(keys = []) {
      const normalizedKeys = [...new Set((Array.isArray(keys) ? keys : []).map((key) => String(key || '').trim()).filter(Boolean))];
      if (!normalizedKeys.length) return { deleted: [] };
      const body = Buffer.from(
        `<Delete>${normalizedKeys.map((key) => `<Object><Key>${xmlEscape(key)}</Key></Object>`).join('')}</Delete>`,
        'utf8'
      );
      const url = buildObjectUrl('');
      url.searchParams.set('delete', '');
      const signed = buildSigningHeaders({
        method: 'POST',
        url,
        payloadHash: sha256Hex(body),
        extraHeaders: {
          'content-length': String(body.length),
          'content-type': 'application/xml'
        },
        body
      });
      const response = await fetchImpl(url, signed);
      if (!isSuccessful(response)) {
        const responseText = await response.text().catch(() => '');
        const err = new Error(`S3 bulk delete failed: POST ${url} => ${response.status}${responseText ? ` ${responseText}` : ''}`);
        err.code = 'S3_DELETE_FAILED';
        err.statusCode = response.status;
        throw err;
      }
      return { deleted: normalizedKeys };
    }
  };
}

module.exports = {
  createS3CompatibleStorageAdapter
};
