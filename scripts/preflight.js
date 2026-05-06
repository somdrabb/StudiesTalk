#!/usr/bin/env node
'use strict';

const fs = require('fs');
const Database = require('better-sqlite3');
const { Client } = require('pg');
const ENV = require('../server/env');

async function listDbManagedSecretRows() {
  const rowsSql = `
    SELECT provider, key_name AS "keyName", environment, enabled
    FROM platform_secrets
    WHERE enabled = 1
    ORDER BY provider ASC, key_name ASC
  `;

  if (ENV.DB_ENGINE === 'sqlite') {
    if (!ENV.DB_PATH || !fs.existsSync(ENV.DB_PATH)) {
      return { rows: [], note: 'SQLite database does not exist yet; DB secret override check skipped.' };
    }
    const db = new Database(ENV.DB_PATH, { readonly: true });
    try {
      const rows = db.prepare(rowsSql).all();
      return { rows, note: '' };
    } catch (error) {
      return { rows: [], note: `SQLite DB secret override check skipped: ${error.message}` };
    } finally {
      db.close();
    }
  }

  if (!ENV.DATABASE_URL) {
    return { rows: [], note: 'DATABASE_URL is not configured; DB secret override check skipped.' };
  }

  const client = new Client({
    connectionString: ENV.DATABASE_URL,
    ssl: ENV.PGSSL ? { rejectUnauthorized: false } : false
  });

  try {
    await client.connect();
    const result = await client.query(rowsSql);
    return { rows: result.rows || [], note: '' };
  } catch (error) {
    return { rows: [], note: `PostgreSQL DB secret override check skipped: ${error.message}` };
  } finally {
    await client.end().catch(() => {});
  }
}

async function inspectCostControlTables() {
  const providerSql = `SELECT COUNT(*) AS count FROM provider_catalog`;
  const limitsSql = `SELECT COUNT(*) AS count FROM workspace_provider_limits`;

  if (ENV.DB_ENGINE === 'sqlite') {
    if (!ENV.DB_PATH || !fs.existsSync(ENV.DB_PATH)) {
      return { note: 'SQLite database does not exist yet; cost-control table check skipped.', warnings: [] };
    }
    const db = new Database(ENV.DB_PATH, { readonly: true });
    try {
      const providers = db.prepare(providerSql).get();
      const limits = db.prepare(limitsSql).get();
      const warnings = [];
      if (!Number(providers?.count || 0)) {
        warnings.push('provider_catalog is empty. Cost Control provider seeding has not run yet.');
      }
      return { note: '', warnings };
    } catch (error) {
      return { note: `Cost-control table check skipped: ${error.message}`, warnings: [] };
    } finally {
      db.close();
    }
  }

  if (!ENV.DATABASE_URL) {
    return { note: 'DATABASE_URL is not configured; cost-control table check skipped.', warnings: [] };
  }

  const client = new Client({
    connectionString: ENV.DATABASE_URL,
    ssl: ENV.PGSSL ? { rejectUnauthorized: false } : false
  });

  try {
    await client.connect();
    const [providerResult, limitsResult] = await Promise.all([
      client.query(providerSql),
      client.query(limitsSql)
    ]);
    const warnings = [];
    if (!Number(providerResult.rows?.[0]?.count || 0)) {
      warnings.push('provider_catalog is empty. Cost Control provider seeding has not run yet.');
    }
    void limitsResult;
    return { note: '', warnings };
  } catch (error) {
    return { note: `PostgreSQL cost-control table check skipped: ${error.message}`, warnings: [] };
  } finally {
    await client.end().catch(() => {});
  }
}

function getDbSecretOverrideWarnings(rows = []) {
  const warnings = [];
  for (const row of rows) {
    const keyName = String(row?.keyName || '').trim();
    if (!keyName) continue;
    if (process.env[keyName] && String(process.env[keyName]).trim()) {
      warnings.push(
        `DB secret override active for ${row.provider}.${keyName} (${row.environment || 'production'}). Database value will override env ${keyName}.`
      );
    }
  }
  return warnings;
}

function looksLikeLocalMachinePath(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return false;
  return /^\/Users\//.test(raw) || /^[A-Za-z]:\\/.test(raw);
}

function getGoogleCredentialWarnings(rows = []) {
  const warnings = [];
  const byKey = new Map(
    rows.map((row) => [String(row?.keyName || '').trim(), row])
  );
  const hasDbGoogleJson = byKey.has('GOOGLE_TRANSLATE_KEY_JSON');
  const envGoogleJson = String(process.env.GOOGLE_TRANSLATE_KEY_JSON || '').trim();
  const effectiveJson = hasDbGoogleJson || Boolean(envGoogleJson);
  const credentialsPath = String(process.env.GOOGLE_APPLICATION_CREDENTIALS || '').trim();

  if (effectiveJson) {
    return warnings;
  }

  if (looksLikeLocalMachinePath(credentialsPath)) {
    warnings.push(
      `GOOGLE_APPLICATION_CREDENTIALS points to a local machine path (${credentialsPath}). File path credentials are deprecated for staging/production. Prefer GOOGLE_TRANSLATE_KEY_JSON.`
    );
  }

  return warnings;
}

async function main() {
  console.log('[preflight] nodeEnv:', ENV.NODE_ENV);
  console.log('[preflight] appBaseUrl:', ENV.BASE_URL || '(not configured)');
  console.log('[preflight] dbEngine:', ENV.DB_ENGINE);
  console.log('[preflight] databaseUrlConfigured:', ENV.DATABASE_URL ? 'yes' : 'no');
  console.log('[preflight] uploadsDir:', ENV.UPLOADS_DIR);
  console.log('[preflight] backupDir:', ENV.DB_BACKUP_DIR);
  console.log('[preflight] fileStorageAdapter:', ENV.FILE_STORAGE_ADAPTER);
  console.log('[preflight] jitsiDomain:', ENV.JITSI_DOMAIN || '(not configured)');
  console.log('[preflight] platformSecretsMasterKey:', ENV.PLATFORM_SECRETS_MASTER_KEY ? 'configured' : 'missing');
  console.log('[preflight] platformSecretsExpectDb:', ENV.PLATFORM_SECRETS_EXPECT_DB ? 'true' : 'false');

  const envWarnings = [...(ENV.ENV_VALIDATION?.warnings || [])];
  const envErrors = [...(ENV.ENV_VALIDATION?.errors || [])];

  const dbSecretCheck = await listDbManagedSecretRows();
  if (dbSecretCheck.note) {
    envWarnings.push(dbSecretCheck.note);
  }
  envWarnings.push(...getDbSecretOverrideWarnings(dbSecretCheck.rows));
  envWarnings.push(...getGoogleCredentialWarnings(dbSecretCheck.rows));

  const costControlCheck = await inspectCostControlTables();
  if (costControlCheck.note) {
    envWarnings.push(costControlCheck.note);
  }
  envWarnings.push(...(costControlCheck.warnings || []));

  if (dbSecretCheck.rows.length) {
    console.log('[preflight] db managed secrets detected:', dbSecretCheck.rows.length);
  } else {
    console.log('[preflight] db managed secrets detected: 0');
  }

  if (envWarnings.length) {
    console.log('[preflight] env warnings:');
    for (const warning of envWarnings) {
      console.log(`- ${warning}`);
    }
  } else {
    console.log('[preflight] env warnings: none');
  }

  if (envErrors.length) {
    console.log('[preflight] env blockers:');
    for (const error of envErrors) {
      console.log(`- ${error}`);
    }
  } else {
    console.log('[preflight] env blockers: none');
  }

  console.log('[preflight] summary:', JSON.stringify(ENV.ENV_VALIDATION?.summary || {}, null, 2));

  if (envErrors.length) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('[preflight] failed:', err?.message || err);
  process.exit(1);
});
